// =====================================================================
//  首页 head 元信息注入 —— 唯一数据源是 profile.txt
//  ---------------------------------------------------------------------
//  为什么需要它：搜索引擎爬虫不执行 JS，读不到运行时 fetch 的 profile.txt。
//  所以标题 / 描述必须在「HTML 出服务器之前」就填好。
//  这个 Function 只接管 "/" 与 "/index.html" 两个路由：
//    1. 从静态资源里取 profile.txt（ASSETS 绑定，不走上游网络）
//    2. 解析 站名 / SEO描述（都是「中文|英文」两份）
//    3. 把结果注入 <title>、description、og:*、twitter:*，
//       并把两种语言的原文写进 <html data-brand-zh / data-brand-en …>
//       供页面里的抢跑脚本在访客手动切换语言时立刻取用
//  其余路由（静态资源、子应用、API）一律 context.next() 原样放行，零开销。
//
//  改站名 / 改描述时，只改 profile.txt 即可，不用碰 index.html。
// =====================================================================

const PROFILE_PATH = '/profile.txt';
const CACHE_TTL_MS = 30 * 1000;         // 30 秒：配置改完刷新一下就生效
let cache = { at: 0, data: null };

/* ---------- profile.txt 解析 ---------- */
function parseProfile(text) {
  const out = { brand: null, seo: null };
  const lines = String(text).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.charAt(0) === '#') continue;
    const f = line.split('|');
    const key = (f[0] || '').trim();
    const zh = (f[1] || '').trim();
    const en = (f[2] || '').trim() || zh;
    if (key === '站名') out.brand = { zh, en };
    else if (key === 'SEO描述' || key === '搜索描述') out.seo = { zh, en };
  }
  return out;
}

async function loadProfile(context) {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_TTL_MS) return cache.data;

  const origin = new URL(context.request.url).origin;
  const target = new URL(PROFILE_PATH, origin).toString();

  /* 首选 Pages 的静态资源绑定；某些项目里拿不到，就退回同源 fetch
     （/profile.txt 不归本函数管，会被 catch-all 函数放行到静态资源，不会递归） */
  let res = null;
  const assets = context.env && context.env.ASSETS;
  if (assets && typeof assets.fetch === 'function') {
    try {
      res = await assets.fetch(target, { cf: { cacheTtl: 30, cacheEverything: true } });
    } catch (e) {
      res = null;
    }
  }
  if (!res || !res.ok) {
    try {
      res = await fetch(target, { cf: { cacheTtl: 30, cacheEverything: true } });
    } catch (e) {
      res = null;
    }
  }
  if (!res || !res.ok) return null;

  const data = parseProfile(await res.text());
  cache = { at: now, data };
  return data;
}

/* ---------- 注入 ---------- */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 只替换标签里的 content="..."，保留标签其它属性与写法 */
function setContent(html, tagPattern, value) {
  return html.replace(tagPattern, (tag) => {
    if (/content="[^"]*"/.test(tag)) return tag.replace(/content="[^"]*"/, `content="${esc(value)}"`);
    return tag.replace(/>$/, ` content="${esc(value)}">`);
  });
}

function inject(html, profile) {
  const brand = profile.brand && profile.brand.zh;
  const seo = profile.seo && profile.seo.zh;
  if (!brand && !seo) return html;

  let out = html;

  if (brand) {
    if (/<title>[\s\S]*?<\/title>/i.test(out)) {
      out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(brand)}</title>`);
    } else {
      out = out.replace(/<head([^>]*)>/i, `<head$1><title>${esc(brand)}</title>`);
    }
    out = setContent(out, /<meta\s+property="og:site_name"[^>]*>/i, brand);
    out = setContent(out, /<meta\s+property="og:title"[^>]*>/i, brand);
    out = setContent(out, /<meta\s+name="twitter:title"[^>]*>/i, brand);
    /* 两种语言原文交给页面脚本，供访客手动切语言时零延迟取用 */
    out = out.replace(/<html([^>]*)>/i, `<html$1 data-brand-zh="${esc(profile.brand.zh)}" data-brand-en="${esc(profile.brand.en)}">`);
  }

  if (seo) {
    out = setContent(out, /<meta\s+name="description"[^>]*>/i, seo);
    out = setContent(out, /<meta\s+property="og:description"[^>]*>/i, seo);
    out = setContent(out, /<meta\s+name="twitter:description"[^>]*>/i, seo);
    out = out.replace(/<html([^>]*)>/i, (m, attrs) => {
      const extra = /data-seo-zh=/.test(attrs) ? '' :
        ` data-seo-zh="${esc(profile.seo.zh)}" data-seo-en="${esc(profile.seo.en)}"`;
      return `<html${attrs}${extra}>`;
    });
  }

  return out;
}

export async function onRequest(context) {
  const response = await context.next();
  try {
    const path = new URL(context.request.url).pathname;
    if (path !== '/' && path !== '/index.html') return response;

    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return response;

    const profile = await loadProfile(context);
    const original = await response.text();

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'text/html; charset=UTF-8');
    headers.set('cache-control', 'public, max-age=0, must-revalidate');
    headers.set('x-jy-seo', profile ? 'ok' : 'no-profile');

    if (!profile) return new Response(original, { status: response.status, headers });

    let out = original;
    try {
      out = inject(original, profile);
    } catch (e) {
      out = original;                       // 注入失败也要把首页原样吐出去
    }
    return new Response(out, { status: response.status, headers });
  } catch (e) {
    return response;
  }
}
