#!/usr/bin/env node
/* =====================================================================
 * 生成博客清单 blog/index.json（部署加速用）+ 订阅源（默认 rss.xml / rss-en.xml）
 *
 * 作用：扫描 blog/ 里的文章文件夹（含 index.md）和散篇 .md，
 *       解析 front matter，输出整份列表清单。
 *       网站部署后优先读这份清单——一次几 KB 的请求就能渲染列表，
 *       顺手产出订阅源：中文 / 英文各一份，站点地址 / 站名 / 描述取自 profile.txt，
 *       文件名与位置也认 profile.txt 的「订阅」「英文订阅」（默认仓库根目录的
 *       rss.xml / rss-en.xml），文章与清单同源，发文后一起自动更新。
 *
 * 运行方式（二选一，都能实现「发文后自动更新」）：
 *   A. Cloudflare Pages 构建命令填：node scripts/gen-blog-index.mjs
 *   B. GitHub Actions：仓库里的 .github/workflows/gen-blog-index.yml 会在
 *      blog/** 变动时自动运行并提交更新
 * 也可以本地手动运行：node scripts/gen-blog-index.mjs
 * ===================================================================== */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

/* 与 gen-blog-en.mjs 的 sha1 完全同一算法：用来判断英文版是否落后于中文 */
const sha1 = s => createHash("sha1").update(s).digest("hex").slice(0, 16);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const blogDir = join(root, "blog");
if (!existsSync(blogDir) || !statSync(blogDir).isDirectory()) {
  console.error("✗ 找不到 blog/ 目录（请在站点根目录结构下运行）");
  process.exit(1);
}

/* 与网站 index.html 里的 parsePost 保持一致 */
function parseFM(raw) {
  const meta = {}; let body = raw;
  /* 去掉 BOM 与开头空行（Windows 记事本另存会带 BOM，会让 front matter 整块失配） */
  raw = String(raw).replace(/^\uFEFF/, "").replace(/^(?:[ \t]*\r?\n)+/, "");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    m[1].split(/\r?\n/).forEach(line => {
      const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (!kv) return;
      let v = kv[2].trim();
      if (/^\[.*\]$/.test(v)) {
        try { v = JSON.parse(v); }
        catch (e) { v = v.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean); }
      } else v = v.replace(/^["']|["']$/g, "");
      meta[kv[1].toLowerCase()] = v;
    });
    body = m[2];
  }
  return { meta, body };
}

const posts = [];
const coverDirs = [];   /* slug → 文章图片所在目录（生成缩略图用） */
for (const name of readdirSync(blogDir)) {
  const p = join(blogDir, name);
  let mdPath = null, slug = null, imgBase = "blog/";
  let st = null;
  try { st = statSync(p); } catch (e) { continue; }
  if (st.isDirectory()) {
    const idx = join(p, "index.md");
    if (existsSync(idx)) { mdPath = idx; slug = name; imgBase = `blog/${name}/`; }
  } else if (/\.md$/i.test(name) && !/\.(en|zh)\.md$/i.test(name)) {
    mdPath = p; slug = name.replace(/\.md$/i, "");   /* 散篇 .md：图片放在 blog 根目录 */
  }
  if (!mdPath) continue;
  coverDirs.push({ slug, dir: join(blogDir, imgBase === "blog/" ? "" : name) });
  const mdRaw = readFileSync(mdPath, "utf8");
  const { meta, body } = parseFM(mdRaw);
  const tags = Array.isArray(meta.tags) ? meta.tags
    : (meta.tags ? String(meta.tags).split(/[,，]/).map(x => x.trim()).filter(Boolean) : []);
  const post = {
    slug,
    md: imgBase === "blog/" ? `blog/${name}` : `blog/${name}/index.md`,
    imgBase,
    title: meta.title || slug,
    desc: meta.desc || "",
    tags,
    date: meta.date || "",
    minutes: +meta.minutes || Math.max(1, Math.round(body.replace(/\s/g, "").length / 450)),
    cover: meta.cover || "",
    bg: meta.background || ""
  };
  /* 译文（index.en.md / index.zh.md，由 scripts/gen-blog-en.mjs 双向生成）存在时，
     把正文地址与标题/摘要/标签一起塞进清单：
     访客语言对应的静态译文直接读，不再逐条机翻，首屏也不会有语言跳变 */
  for (const [key, lang] of [["En", "en"], ["Zh", "zh"]]) {
    const trPath = st.isDirectory() ? join(p, `index.${lang}.md`) : join(blogDir, `${slug}.${lang}.md`);
    if (!existsSync(trPath)) continue;
    try {
      const tr = parseFM(readFileSync(trPath, "utf8")).meta;
      const trTags = Array.isArray(tr.tags) ? tr.tags
        : (tr.tags ? String(tr.tags).split(/[,，]/).map(x => x.trim()).filter(Boolean) : []);
      post["md" + key] = st.isDirectory() ? `blog/${name}/index.${lang}.md` : `blog/${slug}.${lang}.md`;
      if (tr.title) post["title" + key] = tr.title;
      if (tr.desc) post["desc" + key] = tr.desc;
      if (trTags.length) post["tags" + key] = trTags;
      /* 译文是否落后于原文：srcHash 与当前内容哈希对不上就标记。
         纯诊断字段（前端不用它），补翻成功后自动消失，方便一眼看出哪篇没跟上 */
      if (tr.srchash && tr.srchash !== sha1(mdRaw)) {
        post[lang === "en" ? "enStale" : "zhStale"] = true;
        console.warn(`! ${lang} 译文落后于原文：${name}（译文记录 ${tr.srchash} ≠ 当前 ${sha1(mdRaw)}）`);
      }
    } catch (e) { /* 译文读坏了就当没有，网站回退原文 */ }
  }
  posts.push(post);
}
posts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

/* ---------- 生成缩略图（可选，装了 sharp 就自动做）----------
 * 列表缩略图 480px WebP / 文章页头图 1600px WebP，输出到 blog/thumbs/。
 * 没装 sharp 时自动跳过，网站会回退用原图，不影响构建。 */
import { mkdirSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
let sharp = null;
try { sharp = (await import("sharp")).default; } catch (e) {}
if (!sharp && process.env.SHARP_PATH) {
  try { sharp = (await import(pathToFileURL(process.env.SHARP_PATH).href)).default; } catch (e) {}
}
if (!sharp) {
  /* CI 环境自动装 sharp（本地没有也自动装，装不上则跳过缩略图） */
  try {
    const { execSync } = await import("node:child_process");
    execSync("npm install sharp --no-save --no-fund --no-audit", { cwd: root, stdio: "ignore", timeout: 240000 });
    sharp = (await import("sharp")).default;
  } catch (e) {}
}
const thumbDir = join(blogDir, "thumbs");
const slugSafe = s => String(s).replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80);   /* 只替换文件系统禁用符，保留中文 */
const IMG_RE = /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/i;
if (sharp) {
  try {
    mkdirSync(thumbDir, { recursive: true });
    const keep = new Set();   /* 本轮实际生成的缩略图文件名，其余的在末尾清掉 */
    let n = 0;
    for (const { slug, dir } of coverDirs) {
      const post = posts.find(x => x.slug === slug);
      if (!post) continue;
      /* 正文图片映射：文章文件夹里每一张图 → 1600px WebP（页面宽度足够 retina 显示） */
      const imgs = {};
      try {
        readdirSync(dir).forEach((f, i) => {
          if (!IMG_RE.test(f)) return;
          const outName = `${slugSafe(slug)}-i${i}.webp`;
          imgs[f] = `blog/thumbs/${outName}`;
          keep.add(outName);
        });
      } catch (e) {}
      for (const [srcFile, outRel] of Object.entries(imgs)) {
        const src = join(dir, srcFile);
        const outName = outRel.split("/").pop();
        if (!existsSync(src)) { delete imgs[srcFile]; keep.delete(outName); continue; }
        try {
          await sharp(src, { failOn: "none" }).rotate()
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 72 })
            .toFile(join(thumbDir, outName));
          n++;
        } catch (err) {
          /* 单张失败（文件损坏等）→ 撤掉这张的映射，前端回退用原图；
             绝不能留着指向不存在缩略图的链接，也别让一张坏图中断全部生成 */
          console.warn(`! 跳过 ${outRel}：${err.message}`);
          delete imgs[srcFile];
          keep.delete(outName);
        }
      }
      if (Object.keys(imgs).length) post.imgs = imgs;
      /* 封面 480px / 头图 1600px 专用版本 */
      for (const [field, width, q, key] of [["cover", 480, 74, "coverThumb"], ["bg", 1600, 70, "bgThumb"]]) {
        const file = post[field];
        if (!file) continue;
        const src = join(dir, file);
        if (!existsSync(src)) continue;
        const outName = `${slugSafe(slug)}-${key === "coverThumb" ? "cover" : "bg"}.webp`;
        try {
          await sharp(src, { failOn: "none" }).rotate()
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: q })
            .toFile(join(thumbDir, outName));
        } catch (err) {
          console.warn(`! 跳过 ${slug} 的 ${field} 缩略图：${err.message}`);
          continue;
        }
        post[key] = `blog/thumbs/${outName}`;
        keep.add(outName);
        n++;
      }
    }
    console.log(`✓ 已生成 ${n} 张缩略图到 blog/thumbs/`);
    /* ---------- 清理孤儿缩略图（删了文章 / 改了文件夹名 / 删了配图后留下的旧 webp） ---------- */
    let removed = 0;
    for (const f of readdirSync(thumbDir)) {
      if (/\.webp$/i.test(f) && !keep.has(f)) { rmSync(join(thumbDir, f)); removed++; }
    }
    if (removed) console.log(`✓ 清理 ${removed} 个过期缩略图`);
    /* 把缩略图加入 git 暂存区（配合 GitHub Action 的提交步骤；本地手动运行时静默跳过）。
       用 -A 让「被清理的旧缩略图」的删除也一起进暂存区 */
    try {
      const { execSync } = await import("node:child_process");
      execSync("git add -A blog/thumbs", { cwd: root, stdio: "ignore" });
    } catch (e) {}
  } catch (e) {
    console.warn("! 缩略图生成失败（网站会回退用原图）：" + e.message);
  }
} else {
  console.log("! 未安装 sharp，跳过缩略图（可运行 npm install sharp 后重试）");
}

/* ---------- 生成订阅源（rss.xml 中文 / rss-en.xml 英文）----------
 * 数据源就是上面刚扫出来的 posts，与网站列表逐字段同源，
 * 不会出现「列表里有、订阅里没有」。
 * 站点地址 / 站名 / 描述全部读 profile.txt（脚本里不写死任何个人信息）；
 * 没配域名就跳过——订阅链接必须是绝对地址，拼不出来宁可不生成。
 * 内容没变就不重写文件 → git 无 diff → 不会让监听 blog/** 的 Action 反复提交。 */
const RSS_LIMIT = 30;
const PROF = (() => {
  const map = {};
  try {
    const raw = readFileSync(join(root, "profile.txt"), "utf8").replace(/^\uFEFF/, "");
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const cells = line.split("|").map(x => x.trim());
      const key = String(cells[0] || "").toLowerCase();
      if (key) (map[key] = map[key] || []).push(cells.slice(1));
    }
  } catch (e) { console.warn("! 读不到 profile.txt，订阅源的标题会是空的"); }
  return map;
})();
const profRow = (...keys) => {
  for (const k of keys) {
    const v = PROF[String(k).toLowerCase()];
    if (v && v[0]) return v[0];
  }
  return null;
};
const profCi = (...keys) => { const r = profRow(...keys); return r ? String(r[0] || r[1] || "").trim() : ""; };  /* 中文优先 */
const profEn = (...keys) => { const r = profRow(...keys); return r ? String(r[1] || r[0] || "").trim() : ""; };  /* 英文优先 */
const feedDomain = profCi("域名", "主域名", "站点地址", "domain", "siteurl", "url");
let origin = feedDomain.replace(/\/+$/, "");
if (origin && !/^https?:\/\//i.test(origin)) origin = "https://" + origin;

/* 订阅源放在仓库里的哪个文件：只认 profile.txt 写的路径（域名后面那段）。
   允许写 /feeds/zh.xml，也允许误填完整网址，统一收敛成「仓库内相对路径」；
   写错（含 .. 越界、空值）就当没写，退回默认文件名 */
const feedPath = v => {
  let s = String(v || "").trim();
  if (!s) return "";
  if (/^[a-z][a-z0-9+.\-]*:\/\//i.test(s)) {
    try { s = new URL(s).pathname; } catch (e) { return ""; }
  }
  s = s.replace(/[?#].*$/, "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!s || /(^|\/)\.\.(\/|$)/.test(s)) return "";   /* 不许跑出仓库根 */
  return s;
};
let FEED_ZH = feedPath(profCi("订阅", "rss", "feed", "订阅地址")) || "rss.xml";
let FEED_EN = feedPath(profCi("英文订阅", "rss-en", "feed-en")) || "rss-en.xml";
if (FEED_EN === FEED_ZH) {
  console.warn(`! 「订阅」与「英文订阅」指向同一个文件（${FEED_ZH}），英文源改用 rss-en.xml`);
  FEED_EN = "rss-en.xml";
}

if (!origin) {
  console.log("! profile.txt 里没有配置「域名」，跳过订阅源（订阅链接必须是绝对地址）");
} else {
  console.log(`· 订阅源位置：${origin}/${FEED_ZH} 与 ${origin}/${FEED_EN}`);
  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  /* 摘要里的 <br> 换成空格后，中文标点两侧会多出一个空格（「毁， 失去」），
     这里把紧贴中文标点的空白收掉，读起来才自然 */
  const plain = s => String(s == null ? "" : s).replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+([，。、；：！？）】」』])/g, "$1")
    .replace(/([，。、；：！？])\s+/g, "$1")
    .replace(/\s+/g, " ").trim();
  /* 逐段编码：中文 slug / 文件名带空格都不会拼出坏链接 */
  const absPath = p => origin + "/" + String(p).replace(/^\/+/, "")
    .split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const rfc822 = d => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(d || ""));
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toUTCString() : "";
  };
  const cdata = s => String(s).replace(/]]>/g, "]]]]><![CDATA[>");   /* 正文里出现 ]]> 也不会截断 */

  /* 一份文章数据、两种语言：中文源优先中文译文，缺了回退原文；英文源反之。
     除了标题 / 摘要 / 标签 / 推荐语，两边的链接与日期完全一致。 */
  const buildFeed = (lang, file) => {
    const zh = lang === "zh";
    const pickTitle = p => ((zh ? p.titleZh : p.titleEn) || p.title || p.slug);
    const pickDesc = p => ((zh ? p.descZh : p.descEn) || p.desc || "");
    const pickTags = p => { const t = zh ? p.tagsZh : p.tagsEn; return (t && t.length ? t : p.tags) || []; };
    const chanTitle = (zh ? profCi("站名", "brand", "sitename") : profEn("站名", "brand", "sitename"))
      || profCi("站名", "brand", "sitename") || "RSS";
    const chanDesc = plain((zh ? profCi("描述", "desc", "description") : profEn("描述", "desc", "description"))
      || profCi("描述", "desc", "description")) || chanTitle;

    const items = posts.slice(0, RSS_LIMIT).map(p => {
      const title = plain(pickTitle(p));
      const desc = plain(pickDesc(p));
      const link = `${origin}/#/blog/${encodeURIComponent(p.slug)}`;
      const cover = p.coverThumb || (p.cover ? p.imgBase + p.cover : "");
      const img = cover ? absPath(cover) : "";
      const body = (img ? `<p><img src="${esc(img)}" alt=""></p>` : "")
        + (desc ? `<p>${esc(desc)}</p>` : "")
        + `<p><a href="${esc(link)}">${zh ? "阅读全文" : "Read more"}</a></p>`;
      const tags = pickTags(p).slice(0, 6)
        .map(t => `      <category>${esc(t)}</category>`).join("\n");
      const date = rfc822(p.date);
      return `    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(link)}</guid>
${date ? `      <pubDate>${date}</pubDate>\n` : ""}${tags ? tags + "\n" : ""}      <description><![CDATA[${cdata(body)}]]></description>
    </item>`;
    }).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(chanTitle)}</title>
    <link>${esc(origin + "/")}</link>
    <atom:link href="${esc(absPath(file))}" rel="self" type="application/rss+xml"/>
    <description>${esc(chanDesc)}</description>
    <language>${zh ? "zh-CN" : "en-US"}</language>
    <lastBuildDate>${(posts.length && rfc822(posts[0].date)) || new Date().toUTCString()}</lastBuildDate>
    <generator>gen-blog-index.mjs</generator>
${items}
  </channel>
</rss>
`;
  };

  const changed = [];
  for (const [lang, file] of [["zh", FEED_ZH], ["en", FEED_EN]]) {
    const path = join(root, file);
    const xml = buildFeed(lang, file);
    let prev = null;
    try { prev = readFileSync(path, "utf8"); } catch (e) {}
    if (prev === xml) {
      console.log(`✓ ${file} 无变化（${Math.min(posts.length, RSS_LIMIT)} 条），跳过重写`);
      continue;
    }
    /* 配置写到子目录（如 feeds/zh.xml）时先把目录建好 */
    (await import("node:fs")).mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, xml, "utf8");
    changed.push(file);
    console.log(`✓ ${file} 已生成（${Math.min(posts.length, RSS_LIMIT)} 条 → ${origin}/${file}）`);
  }
  if (changed.length) {
    /* 自己把文件放进暂存区：两个 workflow 的提交步骤只 add 了 blog/ 下的路径，
       这里主动 stage，根目录（或配置指定的子目录）里的订阅源才能跟同一批改动一起提交 */
    try {
      const { execSync } = await import("node:child_process");
      execSync(`git add -A ${changed.join(" ")}`, { cwd: root, stdio: "ignore" });
    } catch (e) {}
  }
}

if (process.argv.includes("--stdout")) {
  process.stdout.write(JSON.stringify({ generated: new Date().toISOString(), posts }, null, 2));
} else {
  /* posts 没变化就不重写文件：时间戳不刷新 → git 无 diff →
     不会触发监听 blog/** 的 GitHub Action 无限提交（与 gen-photo-assets.mjs 同策略） */
  let prev = null;
  try { prev = JSON.parse(readFileSync(join(blogDir, "index.json"), "utf8")); } catch (e) {}
  if (prev && JSON.stringify(prev.posts, null, 2) === JSON.stringify(posts, null, 2)) {
    console.log(`✓ blog/index.json 无变化（${posts.length} 篇文章），跳过重写`);
  } else {
    writeFileSync(join(blogDir, "index.json"), JSON.stringify({ generated: new Date().toISOString(), posts }, null, 2), "utf8");
    console.log(`✓ blog/index.json 已生成（${posts.length} 篇文章）`);
  }
}
