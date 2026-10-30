/**
 * Cloudflare Pages Function —— 博客文章自动翻译的服务端代理
 * 路由：POST /api/translate
 *
 * 为什么需要它：Google 翻译接口（translate.googleapis.com）在中国大陆无法直连，
 * 访客浏览器直接请求会一直转圈。走同域代理后，请求由 Cloudflare 边缘节点发出再取回，
 * 访客只访问自己的域名，国内网络环境下也能正常翻译。
 *
 * 入参：{ q: "一段文本" | ["文本1", "文本2"], from: "zh-CN", to: "en" }
 * 出参：{ text: "译文" } 或 { texts: ["译文1", "译文2"] }
 *      出错：{ error: "..." } + 相应状态码
 *
 * 上游顺序：Google（质量最好） → MyMemory（备用）。
 * 说明：均为公开免密钥接口，无需配置任何环境变量。
 */

const MAX_TEXT = 4000;      /* 单段文字上限，超长直接拒绝，避免被当跳板 */
const MAX_BATCH = 60;       /* 一次最多几段 */
const UPSTREAM_TIMEOUT = 9000;

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

/* Google 翻译公开接口（client=gtx）：返回 [[[译文, 原文], …], …] */
async function translateGoogle(text, from, to) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx" +
    `&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await tfetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!r.ok) throw new Error("google " + r.status);
  const j = await r.json();
  if (!Array.isArray(j) || !Array.isArray(j[0])) throw new Error("google bad payload");
  const out = j[0].map((p) => (p && typeof p[0] === "string" ? p[0] : "")).join("");
  if (!out.trim()) throw new Error("google empty");
  return out;
}

/* MyMemory 备用接口：免费、无需密钥，单次约 500 字符上限 */
async function translateMyMemory(text, from, to) {
  const url =
    "https://api.mymemory.translated.net/get?langpair=" +
    `${encodeURIComponent(from)}%7C${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`;
  const r = await tfetch(url);
  if (!r.ok) throw new Error("mymemory " + r.status);
  const j = await r.json();
  const s = j && j.responseData && j.responseData.translatedText;
  if (typeof s !== "string" || !s.trim()) throw new Error("mymemory empty");
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(s)) throw new Error("mymemory quota");
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

async function translateOne(text, from, to) {
  try {
    return await translateGoogle(text, from, to);
  } catch (e) {
    return await translateMyMemory(text, from, to);   /* Google 挂了就换备用 */
  }
}

export async function onRequestPost(context) {
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
  try {
    /* 并发 5：单篇几十段也能在两三秒内返回 */
    const texts = [];
    for (let i = 0; i < arr.length; i += 5) {
      const slice = arr.slice(i, i + 5);
      const part = await Promise.all(slice.map((t) => translateOne(t, from, to)));
      texts.push(...part);
    }
    return Array.isArray(raw) ? json({ texts }) : json({ text: texts[0] });
  } catch (e) {
    return json({ error: "upstream failed" }, 502);
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

export async function onRequestGet() {
  return json({ error: "use POST" }, 405);
}
