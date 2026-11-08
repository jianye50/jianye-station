/**
 * 可选的 CORS 代理：Cloudflare Worker（免费额度对个人阅读器足够）
 *
 * 为什么需要它：静态网页直接抓订阅源会被浏览器跨域策略拦下，公共代理
 * （allorigins / corsproxy / rss2json）要么已失效，要么有每分钟的额度限制。
 * 自己跑一个 Worker 就没有额度问题。
 *
 * 部署（约 2 分钟）：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. 把本文件内容整段贴进去 → Deploy
 *   3. 复制拿到的地址，例如 https://rss-proxy.your-name.workers.dev
 *   4. 打开 app.js，把顶部的 CUSTOM_PROXY 改成
 *        'https://rss-proxy.your-name.workers.dev/?url='
 *   5. 保存、刷新页面即可；没配置时程序会自动走公共代理，不影响使用。
 *
 * 调用方式：GET /?url=<encodeURIComponent(订阅源地址)>
 */

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('url');
    if (!target) {
      return new Response('missing ?url=', { status: 400 });
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; JianyeReader/1.0; +https://example.com)',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        },
        cf: { cacheTtl: 0 }
      });
    } catch (err) {
      return new Response('upstream fetch failed: ' + err.message, { status: 502 });
    }

    const headers = new Headers(upstream.headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('access-control-expose-headers', '*');
    headers.set('cache-control', 'no-store');
    headers.delete('set-cookie');
    headers.delete('content-security-policy');

    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
