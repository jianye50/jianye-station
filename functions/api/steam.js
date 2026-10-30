/* ============================================================
 * /api/steam —— Cloudflare Pages Function：Steam 数据实时接口
 *
 * 关于页每次进入时由前端调用，实时拉取 Steam 数据（边缘缓存 5 分钟，
 * 既能保证"打开即最新"，又不会打爆 Steam API 的每日配额）。
 *
 * 配置（Cloudflare Pages 控制台）：
 *   项目 → Settings → Environment variables → 添加 STEAM_API_KEY
 *   （值与 GitHub Secret 里的相同，免费申请：steamcommunity.com/dev/apikey）
 *   没配置 Key 时本接口自动退化为返回仓库里的静态 steam.json，功能不中断。
 *
 * 仓库同名脚本 scripts/gen-steam-data.mjs 是这套逻辑的 Node 版（给
 * GitHub Actions 定时生成本地 steam.json 用）；这里保持同一输出结构：
 * { updated, player, totalGames, hours2weeks, recent[], most[], friends[] }
 * ============================================================ */
const CDN = "https://shared.cloudflare.steamstatic.com";
const VANITY = "aimjianye"; /* Steam 自定义 URL（也可改成 17 位 SteamID64） */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE_TTL = 300; /* 边缘缓存秒数：5 分钟 */

const coverURL = (id) => `${CDN}/store_item_assets/steam/apps/${id}/library_600x900.jpg`;
const headerURL = (id) => `${CDN}/store_item_assets/steam/apps/${id}/header.jpg`;
const num = (s) => parseFloat(String(s).replace(/,/g, "")) || 0;
const h1 = (min) => Math.round(((min || 0) / 60) * 10) / 10;
const fmt = (ts) =>
  ts ? new Date(ts * 1000).toLocaleDateString("zh-CN", { month: "long", day: "numeric" }) : "";

const JSON_HEADERS = {
  "content-type": "application/json;charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

async function getJSON(u) {
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${u.split("?")[0]}`);
  return r.json();
}

/* 最近玩过：官方 API */
async function apiRecent(key, steamid) {
  const j = await getJSON(
    `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${steamid}&count=10`
  );
  const games = j?.response?.total_count ? j.response.games : [];
  return games.map((g) => ({
    appid: g.appid,
    name: g.name || `App ${g.appid}`,
    cover: coverURL(g.appid),
    header: headerURL(g.appid),
    hoursTotal: h1(g.playtime_forever),
    hours2weeks: g.playtime_2weeks != null ? h1(g.playtime_2weeks) : null,
    last: fmt(g.rtime_last_played),
    achEarned: null,
    achTotal: null,
  }));
}

/* 全库：取总数 + 按总时长排最常玩 Top 9 */
async function apiOwned(key, steamid) {
  try {
    const j = await getJSON(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`
    );
    const all = (j?.response?.games || []).filter((g) => (g.playtime_forever || 0) > 0);
    const most = all
      .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
      .slice(0, 9)
      .map((g) => ({
        appid: g.appid,
        name: g.name || `App ${g.appid}`,
        cover: coverURL(g.appid),
        header: headerURL(g.appid),
        hoursTotal: h1(g.playtime_forever),
        hours2weeks: g.playtime_2weeks != null ? h1(g.playtime_2weeks) : null,
        last: fmt(g.rtime_last_played),
      }));
    return { totalGames: j?.response?.game_count ?? null, most };
  } catch {
    return { totalGames: null, most: [] };
  }
}

/* 好友：名单 + 昵称/头像/在线状态/正在玩什么，游戏中 > 在线 > 离线 */
async function apiFriends(key, steamid) {
  try {
    const fl = await getJSON(
      `https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${key}&steamid=${steamid}&relationship=friend`
    ).catch(() => null);
    const ids = (fl?.friendslist?.friends || []).map((f) => f.steamid);
    if (!ids.length) return [];
    const players = [];
    for (let i = 0; i < ids.length; i += 100) {
      const j = await getJSON(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${ids.slice(i, i + 100).join(",")}`
      );
      players.push(...(j?.response?.players || []));
    }
    return players
      .map((p) => ({
        name: p.personaname || "",
        avatar: p.avatarmedium || p.avatar || "",
        profile: p.profileurl || "",
        state: p.personastate ?? 0,
        playing: p.gameextrainfo || null,
      }))
      .sort(
        (a, b) =>
          (a.playing ? 0 : a.state === 0 ? 2 : 1) -
          (b.playing ? 0 : b.state === 0 ? 2 : 1)
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}

/* 数据增强：抓公开主页补最近游戏的中文游戏名与成就进度（无需登录） */
async function profileAchMap(vanity) {
  try {
    const r = await fetch(`https://steamcommunity.com/id/${vanity}/?l=schinese`, {
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
    });
    if (!r.ok) return {};
    const h = await r.text();
    if (/<title>[^<]*Error/i.test(h)) return {};
    const map = {};
    for (const b of h.split(/class="recent_game"/).slice(1)) {
      const appid = b.match(/steamcommunity\.com\/app\/(\d+)/)?.[1];
      if (!appid) continue;
      const name = b.match(/class="game_name"><a[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
      const achZh = b.match(/(\d[\d,]*)\s*项成就中的\s*(\d[\d,]*)\s*项/);
      const achEn = b.match(/(\d[\d,]*)\s*of\s*(\d[\d,]*)\s*achievements?/i);
      map[appid] = {
        name,
        achTotal: achZh ? num(achZh[1]) : achEn ? num(achEn[2]) : null,
        achEarned: achZh ? num(achZh[2]) : achEn ? num(achEn[1]) : null,
      };
    }
    return map;
  } catch {
    return {};
  }
}

/* 最常玩榜单的中文名：商店接口逐个补（失败回退英文名） */
async function zhAppName(appid) {
  try {
    const j = await getJSON(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=schinese`
    );
    return j?.[String(appid)]?.data?.name || null;
  } catch {
    return null;
  }
}

async function buildData(key) {
  /* 自定义 URL → SteamID64（17 位纯数字则跳过） */
  let steamid = /^\d{17}$/.test(VANITY) ? VANITY : null;
  if (!steamid) {
    const j = await getJSON(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(VANITY)}`
    );
    steamid = j?.response?.steamid;
    if (!steamid) throw new Error("ResolveVanityURL 失败");
  }
  const pJ = await getJSON(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamid}`
  );
  const p = pJ?.response?.players?.[0] || {};
  const [recent, owned, friends, amap] = await Promise.all([
    apiRecent(key, steamid),
    apiOwned(key, steamid),
    apiFriends(key, steamid),
    profileAchMap(VANITY),
  ]);
  /* 最近玩过：补中文名 + 成就 */
  for (const g of recent) {
    const e = amap[g.appid];
    if (!e) continue;
    if (e.achTotal != null) { g.achEarned = e.achEarned; g.achTotal = e.achTotal; }
    if (e.name) g.name = e.name;
  }
  /* 最常玩：补中文名（串行，温和对待商店接口） */
  for (const g of owned.most) {
    const zh = await zhAppName(g.appid);
    if (zh) g.name = zh;
  }
  const hours2weeks =
    recent.reduce((s, g) => s + (g.hours2weeks || 0), 0) || null;
  return {
    updated: new Date().toISOString(),
    source: "live",
    player: {
      name: p.personaname || "",
      avatar: p.avatarfull || "",
      url: p.profileurl || `https://steamcommunity.com/id/${VANITY}/`,
    },
    totalGames: owned.totalGames,
    hours2weeks,
    recent: recent.slice(0, 9),
    most: owned.most,
    friends,
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const cache = caches.default;
  const cacheKey = new Request(request.url);
  try {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  } catch {} /* 本地 wrangler 等环境可能没有 Cache API，忽略 */

  const key = env.STEAM_API_KEY;
  let data, status = 200;
  try {
    if (!key) throw new Error("未配置 STEAM_API_KEY");
    data = await buildData(key);
  } catch (e) {
    /* 兜底：退回仓库里的静态 steam.json（GitHub Actions 定时生成） */
    try {
      const origin = new URL(request.url).origin;
      const r = await fetch(`${origin}/steam.json`, { cf: { cacheTtl: 60 } });
      if (r.ok) {
        data = await r.json();
        data.source = "fallback";
      } else throw new Error(`steam.json HTTP ${r.status}`);
    } catch {
      return new Response(
        JSON.stringify({ error: e.message || "steam data unavailable" }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  const resp = new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
  try {
    context.waitUntil(cache.put(cacheKey, resp.clone()));
  } catch {}
  return resp;
}
