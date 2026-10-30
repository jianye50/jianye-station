/* ============================================================
 * gen-steam-data.mjs —— 生成站点根目录的 steam.json（Steam 游戏数据）
 *
 * 用法：node scripts/gen-steam-data.mjs
 * 输出：<站点根>/steam.json，由 GitHub Actions 定时跑（见
 * .github/workflows/update-steam.yml），推回仓库后 Cloudflare Pages
 * 自动重新部署，关于页的 Steam 模块就能一直保持最新。
 *
 * 两条数据通道，自动二选一：
 *   ① 有 STEAM_API_KEY 环境变量（GitHub Secret，免费申请：
 *      https://steamcommunity.com/dev/apikey）→ 走 Steam 官方 Web API，
 *      数据最全（含每款游戏过去 2 周时长）。
 *   ② 没有 Key → 抓取公开个人主页 HTML 解析，零配置也能用
 *      （要求 Steam 隐私设置里「游戏详情」对所有人公开）。
 * ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../steam.json");

/* 配置：优先环境变量，缺省用站长的自定义 URL */
const VANITY = process.env.STEAM_ID || "aimjianye";
const API_KEY = process.env.STEAM_API_KEY || "";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
/* 国内镜像 CDN 换成国际通用 CDN，海外访客也能加载封面 */
const CLOUD_CDN = "https://shared.cloudflare.steamstatic.com";
const fixCapsule = (u) =>
  u ? u.replace(/^https:\/\/[^/]+/, CLOUD_CDN).split("?")[0] : "";
/* Steam 素材直链：竖版海报（关于页卡片用）与横版头图（兜底） */
const coverURL = (id) => `${CLOUD_CDN}/store_item_assets/steam/apps/${id}/library_600x900.jpg`;
const headerURL = (id) => `${CLOUD_CDN}/store_item_assets/steam/apps/${id}/header.jpg`;

const num = (s) => parseFloat(String(s).replace(/,/g, "")) || 0;

/* ---------------- ① 官方 API 通道 ---------------- */
async function viaApi() {
  const get = async (u) => {
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${u.split("?")[0]}`);
    return r.json();
  };
  let steamid = /^\d{17}$/.test(VANITY) ? VANITY : null;
  if (!steamid) {
    const j = await get(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${API_KEY}&vanityurl=${encodeURIComponent(VANITY)}`
    );
    steamid = j?.response?.steamid;
    if (!steamid) throw new Error("ResolveVanityURL 失败：自定义 URL 不存在？");
  }
  const [player, recent, owned] = await Promise.all([
    get(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${API_KEY}&steamids=${steamid}`
    ),
    get(
      `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${API_KEY}&steamid=${steamid}&count=10`
    ),
    /* include_appinfo=1：带游戏名，一次拿全库（总数 + 最常玩榜单的数据源） */
    get(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${API_KEY}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`
    ).catch(() => null), /* 库总览可能因隐私关闭而失败，允许缺省 */
  ]);
  const p = player?.response?.players?.[0] || {};
  const games = (recent?.response?.total_count ? recent.response.games : []) || [];
  const all = (owned?.response?.games || []).slice();
  /* 好友：名单 + 昵称/头像/在线状态/正在玩什么（能否看到对方游戏取决于对方隐私设置） */
  const friends = await fetchFriends(get, steamid);
  const h1 = (min) => Math.round(((min || 0) / 60) * 10) / 10;
  const fmt = (ts) =>
    ts
      ? new Date(ts * 1000).toLocaleDateString("zh-CN", {
          month: "long",
          day: "numeric",
        })
      : "";
  /* 最常玩：按总时长排序取前 9（只统计玩过的） */
  const most = all
    .filter((g) => (g.playtime_forever || 0) > 0)
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
  return {
    source: "api",
    player: {
      name: p.personaname || "",
      avatar: p.avatarfull || "",
      url: p.profileurl || `https://steamcommunity.com/id/${VANITY}/`,
    },
    totalGames: owned?.response?.game_count ?? null,
    hours2weeks:
      games.reduce((s, g) => s + (g.playtime_2weeks || 0), 0) / 60 || null,
    friends,
    most,
    recent: games.map((g) => ({
      appid: g.appid,
      name: g.name || `App ${g.appid}`,
      cover: coverURL(g.appid),
      header: headerURL(g.appid),
      capsule: `https://steamcdn-a.akamaihd.net/steam/apps/${g.appid}/capsule_184x69.jpg`.replace(
        "steamcdn-a.akamaihd.net",
        "shared.cloudflare.steamstatic.com"
      ),
      hoursTotal: Math.round(((g.playtime_forever || 0) / 60) * 10) / 10,
      hours2weeks:
        g.playtime_2weeks != null
          ? Math.round(((g.playtime_2weeks || 0) / 60) * 10) / 10
          : null,
      last: fmt(g.rtime_last_played),
      achEarned: null,
      achTotal: null,
    })),
  };
}

/* ---------------- ② 公开主页抓取通道 ---------------- */
async function viaProfile() {
  const r = await fetch(`https://steamcommunity.com/id/${VANITY}/?l=schinese`, {
    headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
  });
  if (!r.ok) throw new Error(`主页请求失败 HTTP ${r.status}`);
  const h = await r.text();
  if (/<title>[^<]*Error/i.test(h)) throw new Error("主页返回错误页（限流或不存在）");

  /* 头部：过去 2 周总时长 */
  const m2w = h.match(/recentgame_quicklinks[^>]*>\s*<div>([^<]+)<\/div>/);
  const hours2weeks = m2w ? num(m2w[1].match(/([\d,.]+)/)?.[1] || "") : null;

  /* 逐块解析最近玩过的游戏 */
  const recent = [];
  const blocks = h.split(/class="recent_game"/).slice(1);
  for (const b of blocks) {
    const cap = b.match(/game_capsule"[^>]*src="([^"]+)"/)?.[1] || "";
    const appid = b.match(/steamcommunity\.com\/app\/(\d+)/)?.[1] || "";
    const name = b.match(/class="game_name"><a[^>]*>([^<]+)<\/a>/)?.[1] || "";
    if (!appid && !name) continue;
    const details = b.match(/class="game_info_details">([\s\S]*?)<\/div>/)?.[1] || "";
    const hoursTotal = num(
      details.match(/总时数\s*([\d,.]+)/)?.[1] ||
        details.match(/([\d,.]+)\s*hrs on record/)?.[1] ||
        ""
    );
    const last =
      details.match(/最后运行日期[：:]\s*([\d\s月日年-]+)/)?.[1]?.trim() ||
      details.match(/Last (?:played|Run)[^<]*?(?:on\s*)?([\d\s\w,]+)$/im)?.[1]?.trim() ||
      "";
    /* 中文格式「26 项成就中的 8 项」＝总数 26、已解锁 8；英文「8 of 26」相反 */
    const achZh = b.match(/(\d[\d,]*)\s*项成就中的\s*(\d[\d,]*)\s*项/);
    const achEn = b.match(/(\d[\d,]*)\s*of\s*(\d[\d,]*)\s*achievements?/i);
    const achTotal = achZh ? num(achZh[1]) : achEn ? num(achEn[2]) : null;
    const achEarned = achZh ? num(achZh[2]) : achEn ? num(achEn[1]) : null;
    recent.push({
      appid: +appid || null,
      name: name.trim(),
      cover: appid ? coverURL(appid) : "",
      header: appid ? headerURL(appid) : "",
      capsule: fixCapsule(cap) ||
        (appid ? `${CLOUD_CDN}/store_item_assets/steam/apps/${appid}/capsule_184x69.jpg` : ""),
      hoursTotal: hoursTotal || null,
      hours2weeks: null, /* 主页 HTML 不含单游戏 2 周时长，只有官方 API 有 */
      last,
      achEarned,
      achTotal,
    });
  }

  /* 玩家名 / 头像 / 等级 / 库内游戏总数 */
  const name =
    h.match(/class="actual_persona_name">([^<]+)</)?.[1]?.trim() ||
    h.match(/class="actual_persona">([^<]+)</)?.[1]?.trim() ||
    h.match(/<title>[^:]*::\s*([^<]+)<\/title>/)?.[1]?.trim() ||
    "";
  const avatarRaw =
    h.match(/playerAvatar[\w ]*"[^>]*>\s*<img[^>]*src="([^"]+)"/)?.[1] || "";
  const avatar = avatarRaw
    ? avatarRaw
        .replace(/^https:\/\/[^/]+/, "https://avatars.akamai.steamstatic.com")
        .replace(/_medium\.jpg|_small\.jpg/, "_full.jpg")
    : "";
  const level = num(h.match(/friendPlayerLevelNum">(\d+)</)?.[1] || "");
  /* 计数条：「游戏 35」藏在 label+total 两个 span 里，逐条配对后取「游戏/Games」那条 */
  const counts = [...h.matchAll(
    /count_link_label">([^<]+)<\/span>[\s\S]{0,220}?profile_count_link_total">\s*([\d,]+)/g
  )].map((m) => [m[1].trim(), num(m[2])]);
  const totalGames =
    (counts.find(([k]) => k === "游戏" || k === "Games") || [])[1] ?? null;

  return {
    source: "profile",
    player: {
      name,
      avatar,
      url: `https://steamcommunity.com/id/${VANITY}/`,
    },
    totalGames,
    hours2weeks,
    recent,
  };
}

/* ---------------- 好友：名单 + 在线状态（API 通道专用） ----------------
 * GetFriendList 拿 SteamID 名单，GetPlayerSummaries 批量补资料；
 * 输出排序：正在玩 > 在线 > 离线。好友的游戏库是否可见由对方隐私决定，这里不查。 */
async function fetchFriends(get, steamid) {
  try {
    const fl = await get(
      `https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${API_KEY}&steamid=${steamid}&relationship=friend`
    ).catch(() => null);
    const ids = (fl?.friendslist?.friends || []).map((f) => f.steamid);
    if (!ids.length) return [];
    const players = [];
    for (let i = 0; i < ids.length; i += 100) { /* 摘要接口一次最多 100 个 */
      const j = await get(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${API_KEY}&steamids=${ids.slice(i, i + 100).join(",")}`
      );
      players.push(...((j?.response?.players || [])));
    }
    return players
      .map((p) => ({
        name: p.personaname || "",
        avatar: p.avatarmedium || p.avatar || "",
        profile: p.profileurl || "",
        state: p.personastate ?? 0, /* 0 离线 1 在线 2-6 忙/离开/ snooze…按在线算 */
        playing: p.gameextrainfo || null,
      }))
      .sort((a, b) =>
        (a.playing ? 0 : a.state === 0 ? 2 : 1) -
        (b.playing ? 0 : b.state === 0 ? 2 : 1)
      )
      .slice(0, 30);
  } catch (e) {
    console.error("[steam] 好友数据获取失败（不影响其它数据）：", e.message);
    return [];
  }
}

/* ---------------- 数据增强：中文游戏名与成就进度（API 通道专用） ----------------
 * API 返回英文名且不含成就进度，这里用两个无需登录的公开来源补齐：
 *   · 公开个人主页「最近玩过」区块 → 中文游戏名 + 成就 x/y
 *   · Steam 商店 appdetails 接口   → 「最常玩」榜单的中文名 */
async function profileAchMap() {
  const r = await fetch(`https://steamcommunity.com/id/${VANITY}/?l=schinese`, {
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
    /* 中文格式「26 项成就中的 8 项」＝总数 26、已解锁 8；英文「8 of 26」相反 */
    const achZh = b.match(/(\d[\d,]*)\s*项成就中的\s*(\d[\d,]*)\s*项/);
    const achEn = b.match(/(\d[\d,]*)\s*of\s*(\d[\d,]*)\s*achievements?/i);
    map[appid] = {
      name,
      achTotal: achZh ? num(achZh[1]) : achEn ? num(achEn[2]) : null,
      achEarned: achZh ? num(achZh[2]) : achEn ? num(achEn[1]) : null,
    };
  }
  return map;
}
async function zhAppName(appid) {
  try {
    const r = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=schinese`,
      { headers: { "User-Agent": UA } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.[String(appid)]?.data?.name || null;
  } catch {
    return null;
  }
}

/* ---------------- 主流程 ---------------- */
let data;
try {
  data = API_KEY ? await viaApi() : await viaProfile();
} catch (e) {
  console.error("[steam] 生成失败：", e.message);
  console.error("[steam] 已保留旧的 steam.json 不变。");
  process.exit(1);
}
if (!data.recent || !data.recent.length) {
  console.error("[steam] 没解析到任何游戏——检查隐私设置（游戏详情需对所有人公开）或换用 API Key。");
  process.exit(1);
}
if (API_KEY) {
  try {
    const amap = await profileAchMap();
    for (const g of data.recent || []) {
      const e = amap[g.appid];
      if (!e) continue;
      if (e.achTotal != null) { g.achEarned = e.achEarned; g.achTotal = e.achTotal; }
      if (e.name) g.name = e.name; /* 主页上的是中文名 */
    }
    for (const g of data.most || []) {
      const zh = await zhAppName(g.appid);
      if (zh) g.name = zh;
    }
  } catch (e) {
    console.error("[steam] 数据增强失败（不影响主数据）：", e.message);
  }
}
const out = {
  updated: new Date().toISOString(),
  ...data,
  recent: data.recent.slice(0, 9), /* 关于页最多展示 9 款 */
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`[steam] OK：${out.recent.length} 款最近游戏，共 ${out.totalGames ?? "?"} 款，2 周 ${out.hours2weeks ?? "?"} 小时 → steam.json`);
