/**
 * Cloudflare Pages Function —— 博客文章自动翻译的服务端代理
 * 路由：POST /api/translate    GET /api/translate（自检，返回可用引擎）
 *
 * 为什么需要它：Google 翻译接口（translate.googleapis.com）在中国大陆无法直连，
 * 访客浏览器直接请求会一直转圈。走同域代理后，请求由 Cloudflare 边缘节点发出再取回，
 * 访客只访问自己的域名，国内网络环境下也能正常翻译。
 *
 * 入参：{ q: "一段文本" | ["文本1", "文本2"], from: "zh-CN", to: "en" }
 * 出参：{ text: "译文" } 或 { texts: ["译文1", "译文2"] }
 *      出错：{ error: "..." } + 相应状态码（附 detail 说明每个引擎的失败原因）
 *
 * 引擎顺序（全部免密钥、无日配额）：
 *   1. Google translate_a/single（client=gtx）—— 质量最好
 *   2. Google clients5（dict-chrome-ex 通道）—— 同为 Google，另一条线路，规避单点限流
 *   3. Cloudflare Workers AI（@cf/meta/m2m100-1.2b）—— 在 Pages 设置里绑定 AI 后启用，
 *      完全不依赖外部服务；未绑定时自动跳过
 * 每个引擎都失败才算失败；任一成功即返回。
 */

const MAX_TEXT = 4000;      /* 单段文字上限，超长直接拒绝，避免被当跳板 */
const MAX_BATCH = 60;       /* 一次最多几段 */
const UPSTREAM_TIMEOUT = 9000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

/* 带超时的 fetch：上游卡住时别把整个函数拖死 */
async function tfetch(url, opt = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT);
  try {
    return await fetch(url, { ...opt, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* 引擎 1：Google translate_a/single，返回 [[[译文, 原文], …], …] */
async function runGoogleGtx(text, from, to) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx" +
    `&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await tfetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new UpstreamError("google-gtx", r.status);
  const j = await r.json();
  if (!Array.isArray(j) || !Array.isArray(j[0])) throw new UpstreamError("google-gtx", 200, "bad payload");
  const out = j[0].map((p) => (p && typeof p[0] === "string" ? p[0] : "")).join("");
  if (!out.trim()) throw new UpstreamError("google-gtx", 200, "empty");
  return out;
}

/* 引擎 2：Google clients5（Chrome 词典通道），返回 ["译文"]，换行保留 */
async function runGoogleClients5(text, from, to) {
  const url =
    "https://clients5.google.com/translate_a/t?client=dict-chrome-ex" +
    `&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`;
  const r = await tfetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new UpstreamError("google-clients5", r.status);
  const j = await r.json();
  const arr = Array.isArray(j) ? j : [j];
  const out = arr
    .map((p) => (typeof p === "string" ? p : Array.isArray(p) ? p.join(" ") : ""))
    .join(" ")
    .trim();
  if (!out) throw new UpstreamError("google-clients5", 200, "empty");
  return out;
}

/* 按句子切块：给有长度上限的引擎用 */
function chunkText(text, max) {
  const out = [];
  let rest = String(text);
  while (rest.length > max) {
    let cut = -1;
    for (let i = max; i > Math.floor(max * 0.5); i--) {
      if (/[。！？；\n.!?;]/.test(rest.charAt(i))) { cut = i + 1; break; }
    }
    if (cut < 0) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/* 引擎 3：Cloudflare Workers AI 本地模型（需在 Pages 设置里绑定 AI，变量名 AI）
   优点：完全不依赖第三方接口，不受墙、不受配额影响 */
async function runWorkersAI(env, text, from, to) {
  if (!env || !env.AI) throw new UpstreamError("workers-ai", 0, "AI binding not configured");
  const src = String(from).split("-")[0].toLowerCase();
  const tgt = String(to).split("-")[0].toLowerCase();
  const outs = [];
  for (const part of chunkText(text, 800)) {
    const r = await env.AI.run("@cf/meta/m2m100-1.2b", {
      text: part,
      source_lang: src,
      target_lang: tgt,
    });
    const s = r && (r.translated_text || r.response || r.text);
    if (typeof s !== "string" || !s.trim()) throw new UpstreamError("workers-ai", 200, "empty");
    outs.push(s.trim());
  }
  return outs.join(" ").trim();
}

/* 带引擎名的错误，方便把失败原因回给前端/自查 */
class UpstreamError extends Error {
  constructor(engine, status, msg) {
    super(engine + " " + (status || "") + (msg ? " " + msg : ""));
    this.engine = engine;
    this.status = status || 0;
    this.detail = msg || "";
  }
}

/* 组装引擎列表。Workers AI 排在最前：它跑在 Cloudflare 自己的网络上，不需要访问外网，
   也不受「Google 对机房 IP 限流」影响；没绑定 AI 时它会自动跳过，退回 Google 两条通道。 */
function buildEngines(env) {
  const list = [];
  if (env && env.AI) list.push({ id: "workers-ai", run: (t, f, to) => runWorkersAI(env, t, f, to) });
  list.push({ id: "google-gtx", run: (t, f, to) => runGoogleGtx(t, f, to) });
  list.push({ id: "google-clients5", run: (t, f, to) => runGoogleClients5(t, f, to) });
  return list;
}

/* 通道冷却：某个引擎连续被拒（403/429，多半是机房 IP 被限流）就先晾 10 分钟，
   别让每个请求都白撞两次。状态放在模块作用域，同一个 isolate 内共享。 */
const cooldown = Object.create(null);
function cooling(id) {
  const t = cooldown[id] || 0;
  return t > Date.now();
}
function markBlocked(id, status) {
  if (status === 403 || status === 429) cooldown[id] = Date.now() + 5 * 60 * 1000;
}

async function translateOne(text, from, to, engines, diag) {
  let lastErr = null;
  for (const e of engines) {
    if (cooling(e.id)) continue;
    try {
      const out = await e.run(text, from, to);
      if (out && out.trim()) return out;
      lastErr = new UpstreamError(e.id, 200, "empty");
    } catch (err) {
      lastErr = err;
      markBlocked(e.id, err && err.status);
      if (diag.length < 12) {
        diag.push({
          engine: e.id,
          status: (err && err.status) || 0,
          msg: String((err && (err.detail || err.message)) || "error").slice(0, 120),
        });
      }
    }
  }
  throw lastErr || new Error("no engine");
}

export async function onRequestPost(context) {
  const env = context.env || {};
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "invalid json" }, 400);
  }
  const raw = body && body.q;
  const from = (body && body.from) || "zh-CN";
  const to = (body && body.to) || "en";
  const arr = Array.isArray(raw) ? raw : [raw];
  if (!arr.length || arr.length > MAX_BATCH) return json({ error: "bad batch size" }, 400);
  for (const it of arr) {
    if (typeof it !== "string" || !it.trim() || it.length > MAX_TEXT) {
      return json({ error: "bad text" }, 400);
    }
  }
  const engines = buildEngines(env);
  const diag = [];
  try {
    /* 并发 5：单篇几十段也能在两三秒内返回 */
    const texts = [];
    for (let i = 0; i < arr.length; i += 5) {
      const slice = arr.slice(i, i + 5);
      const part = await Promise.all(slice.map((t) => translateOne(t, from, to, engines, diag)));
      texts.push(...part);
    }
    return Array.isArray(raw) ? json({ texts }) : json({ text: texts[0] });
  } catch (e) {
    /* 把每个引擎的失败原因带回去，方便一眼看出是哪一环被墙/限流 */
    return json({ error: "upstream failed", detail: diag }, 502);
  }
}

/* 预检与错误方法：给浏览器一个明确答复，别让它猜 */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });
}

/* GET 用于自查：告诉你这层代理现在有哪些引擎可用 */
export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  return json({
    ok: true,
    usage: 'POST { q: "文本" | ["文本1","文本2"], from: "zh-CN", to: "en" }',
    engines: buildEngines(env).map((e) => e.id),
    aiBound: !!env.AI,
    note: env.AI ? "" : "绑定 AI（Pages → Settings → Functions → Bindings → AI）可启用 workers-ai 引擎",
  });
}
