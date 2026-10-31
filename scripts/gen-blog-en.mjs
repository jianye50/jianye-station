#!/usr/bin/env node
/* =====================================================================
 * 自动生成英文版文章：blog/<文章>/index.md  →  blog/<文章>/index.en.md
 *                      blog/<名字>.md        →  blog/<名字>.en.md
 *
 * 触发方式：仓库里的 .github/workflows/gen-blog-en.yml 在 blog/** 有 push
 * （新增 / 修改 / 删除）时自动运行；也可以在 Actions 页面手动 workflow_dispatch。
 *
 * 规则：
 *   1. 源文件没变（内容哈希一致）→ 跳过，不重复调用翻译接口；
 *   2. 源文章改了 → 重新生成英文版；
 *   3. 源文章删了 → 一并删掉对应的 index.en.md（不留孤儿文件）；
 *   4. 已经人工写好英文版（front matter 里没有 auto: true）→ 一律不动；
 *   5. 源文章本来就没有中文（纯英文）→ 不生成，网站直接读原文即可。
 *
 * 翻译引擎：Google 免费公开接口（无需密钥）。网络失败自动重试 + 换域名，
 * 单篇文章翻不动就保留原文并继续处理下一篇，绝不让整批失败。
 *
 * Markdown 结构保护：代码块整块不送翻；行内代码 / 图片 / 链接地址 / HTML 标签 /
 * 裸链接先用 [[n]] 占位符摘出，译完再还原；标题 # 与列表符号在翻译后重新贴回。
 * ===================================================================== */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, unlinkSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const blogDir = join(root, "blog");
if (!existsSync(blogDir) || !statSync(blogDir).isDirectory()) {
  console.error("✗ 找不到 blog/ 目录（请在站点根目录结构下运行）");
  process.exit(1);
}

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes("--force");                       /* 忽略哈希，全部重译 */
const DRY = ARGS.includes("--dry-run");                       /* 只打印计划，不写文件 */
const ONLY = (ARGS.find(a => a.startsWith("--only=")) || "").slice(7);   /* 只处理某一篇 */
const DELAY = +(process.env.TR_DELAY_MS || 120);              /* 每次请求的间隔，防限流 */
const MAX_CHARS = 1600;                                       /* 单次请求的最大字符数 */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasCJK = s => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(String(s || ""));

/* ---------- front matter 解析（与网站 index.html / gen-blog-index.mjs 保持一致） ---------- */
function parseFM(raw) {
  const meta = {}; let body = raw;
  /* 去掉 BOM 和开头的空行：Windows 记事本「另存为 UTF-8」会加 BOM，
     带 BOM 时 ^--- 匹配不上，front matter 整块失效 ——
     下游就会把这份英文版误判成「人工写的」而永不更新，必须先清掉 */
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

/* YAML 值转义：含冒号+空格、井号开头等容易读歪的，统一套双引号 */
function yamlVal(s) {
  s = String(s == null ? "" : s).replace(/\r?\n/g, " ").trim();
  if (!s) return '""';
  if (/^[\s>|*&!%@`{}\[\]#-]|: |\s#|^$/.test(s) || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return s;
}

/* ---------- 翻译接口：Google 免费公开接口，双域名 + 指数退避重试 ---------- */
const HOSTS = ["https://translate.googleapis.com", "https://translate.google.com"];
let reqCount = 0;
let failStreak = 0;          /* 连续失败次数：接口整体被限流时早点收手，别干耗 */
let FATAL = null;            /* 一旦认定接口不可用，后续请求直接抛错 */
async function gtx(text, from = "zh-CN", to = "en") {
  if (FATAL) throw FATAL;
  const body = new URLSearchParams({ client: "gtx", sl: from, tl: to, dt: "t", q: text }).toString();
  let lastErr = null;
  for (const host of HOSTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(host + "/translate_a/single", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
          },
          body,
          signal: AbortSignal.timeout(25000)
        });
        if (r.status >= 300 && r.status < 400) throw new Error("被重定向（疑似限流）");
        if (!r.ok) throw new Error("HTTP " + r.status);
        const ct = r.headers.get("content-type") || "";
        if (!/json/i.test(ct)) throw new Error("返回的不是 JSON（疑似限流页）");
        const j = await r.json();
        const out = (Array.isArray(j && j[0]) ? j[0] : []).map(p => (p && typeof p[0] === "string") ? p[0] : "").join("");
        if (!out.trim()) throw new Error("空结果");
        reqCount++;
        failStreak = 0;
        if (DELAY) await sleep(DELAY);
        return out;
      } catch (e) {
        lastErr = e;
        /* 连续失败太多次 → 判定接口被限流，本次运行提前收手（已翻好的照样提交） */
        if (++failStreak >= 8) {
          FATAL = new Error(`翻译接口连续失败 ${failStreak} 次（${e.message}），停止本次运行`);
          throw FATAL;
        }
        await sleep(800 * (attempt + 1) * (attempt + 1));   /* 0.8s → 3.2s → 7.2s */
      }
    }
  }
  throw lastErr || new Error("翻译失败");
}

/* ---------- 行内结构保护 ---------- */
/* 行内代码 / 图片 / 链接地址 / HTML 标签 / 裸链接 → [[n]] 占位符
   图片与链接的路径允许空格和一层括号：Windows 截图、手机图片常叫
   `Moon Cat Under theMoonlight (Day - Night)月光下的月猫(昼夜).png`，
   老写法 `[^)\n]*` 会被中间那个 `)` 截断，导致剩下半截文件名被送去翻译 ——
   文件名一改，图片就 404（英文页面里图片显示不出来，只剩 alt 文字）。 */
const IMG_RE = /!\[[^\]\n]*\]\((?:[^()\n]|\([^()]*\))*\)/g;
const LINK_RE = /\]\((?:[^()\n]|\([^()]*\))+\)/g;
const PROT_RE = /`[^`\n]+`|!\[[^\]\n]*\]\((?:[^()\n]|\([^()]*\))*\)|\]\((?:[^()\n]|\([^()]*\))+\)|<[a-zA-Z\/!][^>\n]*>|(?:https?:\/\/|www\.)[^\s)<>"'\]]+/g;

/* 取出文本里所有图片地址（大小写无关、去首尾空白），用来校验翻译有没有动过文件名 */
function imgSrcs(s) {
  return (String(s || "").match(IMG_RE) || [])
    .map(x => x.replace(/^!\[[^\]\n]*\]\(/, "").replace(/\)$/, "").trim().toLowerCase());
}
function sameImgs(a, b) {
  const x = imgSrcs(a), y = imgSrcs(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function protect(text) {
  const keep = [];
  const t = text.replace(PROT_RE, m => {
    keep.push(m);
    return `[[${keep.length - 1}]]`;
  });
  return { t, keep };
}
function restore(text, keep) {
  let miss = false;
  const out = text.replace(/\[\[\s*(\d+)\s*\]\]/g, (m, d) => {
    const i = +d;
    if (i >= keep.length) { miss = true; return m; }
    return keep[i];
  });
  /* 占位符被翻译引擎吞掉/改写了：这次结果不可信，交给调用方降级 */
  const left = (out.match(/\[\[\s*\d+\s*\]\]/g) || []).length;
  if (miss || left) throw new Error("占位符还原失败");
  return out;
}

/* 前缀（标题井号 / 引用符 / 列表符号）单独摘出来，译完再贴回去 */
function splitPrefix(line) {
  const m = line.match(/^(\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)?)([\s\S]*)$/);
  return { prefix: m ? m[1] : "", rest: m ? m[2] : line };
}

/* 单段文本翻译（含占位符往返）；失败时按行降级，再失败就保留原文 */
async function trText(text) {
  if (!hasCJK(text)) return text;
  const { t, keep } = protect(text);
  try {
    const out = await gtx(t);
    const res = restore(out, keep);
    /* 安全网：图片地址一个字符都不许变，变了就按失败处理（保留原文），
       绝不会把一张 404 的图送上线 */
    if (!sameImgs(text, res)) throw new Error("图片地址被翻译改动");
    return res;
  } catch (e) {
    if (FATAL) throw e;          /* 接口整体挂了：别再逐行重试，直接向上抛 */
    /* 降级：逐行翻译，单行失败保留该行原文 */
    const lines = text.split("\n");
    const done = [];
    for (const line of lines) {
      if (!hasCJK(line)) { done.push(line); continue; }
      const { prefix, rest } = splitPrefix(line);
      if (!hasCJK(rest)) { done.push(line); continue; }
      try {
        const p = protect(rest);
        done.push(prefix + restore(await gtx(p.t), p.keep));
      } catch (e2) {
        if (FATAL) throw e2;
        done.push(line);
      }
    }
    return done.join("\n");
  }
}

/* 表格整行：按列拆开分别翻，竖线与单元格两侧空格的原始排版保持不变 */
async function trTableRow(line) {
  if (!hasCJK(line)) return line;
  const out = [];
  for (const c of line.split("|")) {
    const m = c.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m || !hasCJK(m[2])) { out.push(c); continue; }
    out.push(m[1] + await trText(m[2]).catch(() => m[2]) + m[3]);
  }
  return out.join("|");
}

/* 代码块整块摘出来换成 [[b0]] 占位，译完原样贴回：
   不送翻 → 代码里的中文不会被改，缩进也不会被吃掉 */
const FENCE_RE = /(^|\n)([ \t]*(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*(?:`{3,}|~{3,})[ \t]*(?=\n|$))/g;
function maskFences(body) {
  const codes = [];
  const masked = body.replace(FENCE_RE, (m, pre, block) => {
    codes.push(block);
    return pre + `[[b${codes.length - 1}]]`;
  });
  return { masked, codes };
}
function unmaskFences(text, codes) {
  return text.replace(/\[\[\s*b(\d+)\s*\]\]/g, (m, d) => (codes[+d] !== undefined ? codes[+d] : m));
}

/* 超长段落按句号/换行再切，避免单次请求过大 */
function chunks(text, max) {
  if (text.length <= max) return [text];
  const out = [];
  let rest = text;
  while (rest.length > max) {
    let cut = -1;
    for (let i = max; i > max * 0.5; i--) {
      if (/[。！？；\n.!?;]/.test(rest.charAt(i))) { cut = i + 1; break; }
    }
    if (cut < 0) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/* 一个文本块：整块是表格就逐行按列翻，否则按长度切块翻 */
async function trBlock(seg) {
  const lines = seg.split("\n");
  const rows = lines.filter(l => l.trim());
  if (rows.length && rows.length === lines.length && rows.every(l => /^\s*\|/.test(l))) {
    const out = [];
    for (const l of lines) out.push(await trTableRow(l));
    return out.join("\n");
  }
  const pieces = [];
  for (const ch of chunks(seg, MAX_CHARS)) pieces.push(await trText(ch));
  return pieces.join("");
}

/* 正文翻译：按空行切段 → 多段合并成一次请求（省请求数，最不容易被限流）
   → 代码块整块跳过 → 段数对不上时退回逐段翻译。 */
async function trBody(body) {
  const { masked, codes } = maskFences(body);
  const paras = masked.split(/\n{2,}/).filter(p => p.trim());
  const out = [];
  let batch = [], size = 0;

  const flush = async () => {
    if (!batch.length) return;
    const joined = batch.join("\n\n");
    let done = null;
    if (hasCJK(joined)) {
      try {
        const { t, keep } = protect(joined);
        const parts = restore(await gtx(t), keep).split(/\n{2,}/);
        /* 段落数对得上、且每段的图片地址都没被改，才敢用整批结果 */
        if (parts.length === batch.length && parts.every((p, i) => sameImgs(batch[i], p))) done = parts;
      } catch (e) {
        if (FATAL) throw e;
      }
      if (!done) {                                           /* 退回逐段翻 */
        done = [];
        for (const p of batch) done.push(await trBlock(p));
      }
    } else done = batch.slice();
    out.push(...done);
    batch = []; size = 0;
  };

  for (const p of paras) {
    if (size && size + p.length > MAX_CHARS) await flush();
    batch.push(p); size += p.length + 2;
  }
  await flush();
  return unmaskFences(out.join("\n\n"), codes);
}

/* 标题 / 摘要 / 标签：同样走保护与降级，短文本单独翻 */
async function trShort(s) {
  if (!hasCJK(s)) return s;
  try { return await trText(String(s)); } catch (e) { if (FATAL) throw e; return String(s); }
}

/* ---------- 扫描文章 ---------- */
function scanArticles() {
  const list = [];
  for (const name of readdirSync(blogDir)) {
    if (name.startsWith(".") || name === "thumbs") continue;
    const p = join(blogDir, name);
    let st = null;
    try { st = statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) {
      const src = join(p, "index.md");
      if (!existsSync(src)) continue;
      list.push({ slug: name, src, dst: join(p, "index.en.md") });
    } else if (/\.md$/i.test(name) && !/\.en\.md$/i.test(name)) {
      const slug = name.replace(/\.md$/i, "");
      list.push({ slug, src: p, dst: join(blogDir, slug + ".en.md") });
    }
  }
  return list;
}

const sha1 = s => createHash("sha1").update(s).digest("hex").slice(0, 16);

/* ---------- 主流程 ---------- */
const articles = scanArticles();
const srcSet = new Set(articles.map(a => a.dst));
let added = 0, updated = 0, skipped = 0, removed = 0, failed = 0;

/* ① 清理孤儿英文版：源文章已经不存在了（删除 / 改名），英文版跟着删 */
for (const name of readdirSync(blogDir)) {
  const p = join(blogDir, name);
  let st = null;
  try { st = statSync(p); } catch (e) { continue; }
  const candidates = [];
  if (st.isDirectory()) candidates.push(join(p, "index.en.md"));
  else if (/\.en\.md$/i.test(name)) candidates.push(p);
  for (const c of candidates) {
    if (existsSync(c) && !srcSet.has(c)) {
      console.log(`- 删除孤儿英文版 ${c.slice(root.length + 1)}`);
      if (!DRY) unlinkSync(c);
      removed++;
    }
  }
}

/* ② 逐篇生成 */
for (const a of articles) {
  const rel = a.src.slice(root.length + 1);
  if (ONLY && a.slug !== ONLY) continue;
  const rawSrc = readFileSync(a.src, "utf8");
  const { meta, body } = parseFM(rawSrc);
  const hash = sha1(rawSrc);

  /* 已有英文版：人工写的别动，自动生成的看哈希 */
  let prev = null;
  if (existsSync(a.dst)) {
    let prevBody = "", broken = "";
    let rawEn = "";
    try { rawEn = readFileSync(a.dst, "utf8"); } catch (e) { broken = "读取失败：" + e.message; }
    if (!broken) {
      const p = parseFM(rawEn);
      prev = p.meta; prevBody = p.body;
      /* 连 front matter 都解析不出来，或者正文是空的 → 这份文件是坏的，
         不能当成「人工英文版」供起来，否则这篇会永远不更新（本脚本最容易踩的坑） */
      if (!Object.keys(prev).length) broken = "没有可解析的 front matter";
      else if (!prevBody.trim()) broken = "正文为空";
    }
    if (broken) {
      prev = null;                                  /* 坏文件按「不存在」处理，直接重译覆盖 */
      console.log(`! 英文版损坏（${broken}），重新翻译 ${rel}`);
      console.log(`::warning::英文版损坏，已重新生成：${rel}（${broken}）`);
    } else {
      const isAuto = String(prev && prev.auto) === "true";
      if (!isAuto) {
        /* 人工写的英文版：绝不覆盖，但必须在 Actions 摘要里显性说出来。
           否则「改了中文、英文不动」会变成看不出来的静默跳过 —— 这是之前排查最费劲的一类问题 */
        const msg = `跳过人工英文版（front matter 里没有 auto: true）：${rel}`;
        console.log(`= ${msg}`);
        console.log(`::warning::${msg}${FORCE ? " —— 即使加了 --force 也不覆盖；确实要重译就删掉这个文件，或补一行 auto: true" : ""}`);
        skipped++; continue;
      }
      if (!FORCE && prev.srchash === hash) {
        /* 源文章没变，但旧版脚本可能把「带空格/括号的文件名」翻坏了（图片 404）：
           图片地址对不上就重译一次，让坏图自己修回来 */
        if (sameImgs(body, prevBody)) { console.log(`= 跳过（未改动）${rel}`); skipped++; continue; }
        console.log(`! 图片地址与原文对不上，重新翻译 ${rel}`);
      }
    }
  }

  /* 原文本来就没有中文：不生成，网站直接用原文 */
  if (!hasCJK(body) && !hasCJK(meta.title) && !hasCJK(meta.desc)) {
    console.log(`= 跳过（原文已是英文）${rel}`);
    skipped++;
    continue;
  }

  process.stdout.write(`→ 翻译 ${rel} ... `);
  const t0 = Date.now();
  try {
    const title = await trShort(meta.title || a.slug);
    const desc = meta.desc ? await trShort(meta.desc) : "";
    const tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? String(meta.tags).split(/[,，]/).map(x => x.trim()).filter(Boolean) : []);
    const outTags = [];
    for (const tg of tags) outTags.push(await trShort(tg));
    const enBody = await trBody(body);

    /* 质量闸门（2026-10-31 新增）：
       接口被限流 / 挂掉时，trText 会「保留原文」降级，整篇一个字都没翻，
       但下面照样会写出一个格式完好的 index.en.md（只有 front matter 是英文的）。
       这份文件一旦落库，srcHash 就和中文原文一致了 ——
       以后每次运行都会「跳过（未改动）」，这篇永远不会再被重译，
       线上英文页面一直显示中文，而 Actions 全程绿勾，查起来极其费劲。
       所以：译后中文占比没有明显下降，就判定这次没翻成，宁可不写文件。 */
    const zhRatio = s => {
      const all = String(s || "").replace(/\s/g, "").length;
      if (!all) return 0;
      return (String(s).match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length / all;
    };
    const r0 = zhRatio(body), r1 = zhRatio(enBody);
    if (r0 > 0.05 && r1 > r0 * 0.8) {
      throw new Error(`译后正文中文仍占 ${(r1 * 100).toFixed(0)}%（原文 ${(r0 * 100).toFixed(0)}%），翻译没生效`);
    }
    if (hasCJK(title) && zhRatio(title) > 0.3) {
      throw new Error("标题没翻成（仍是中文），不写文件");
    }

    const fm = [
      "---",
      `title: ${yamlVal(title)}`,
      desc ? `desc: ${yamlVal(desc)}` : null,
      `tags: ${JSON.stringify(outTags)}`,
      meta.date ? `date: ${yamlVal(meta.date)}` : null,
      `minutes: ${+meta.minutes || Math.max(1, Math.round(body.replace(/\s/g, "").length / 450))}`,
      meta.cover ? `cover: ${yamlVal(meta.cover)}` : null,
      meta.background ? `background: ${yamlVal(meta.background)}` : null,
      "lang: en",
      "auto: true",
      `srcHash: ${hash}`,
      `translatedAt: ${new Date().toISOString()}`,
      "---",
      ""
    ].filter(x => x !== null).join("\n");

    if (!DRY) writeFileSync(a.dst, fm + enBody.replace(/\s+$/, "") + "\n", "utf8");
    if (prev) updated++; else added++;
    console.log(`完成（${((Date.now() - t0) / 1000).toFixed(1)}s，${reqCount} 次请求累计）`);
  } catch (e) {
    failed++;
    console.log(`失败：${e.message}（保留原文，下次再试）`);
    console.log(`::error::翻译失败，这篇的英文版仍是旧内容：${rel} —— ${e.message}`);
    if (FATAL) { console.log("! 接口本次不可用，先停下——已经翻好的文章照样会提交，剩下的下次再补。"); break; }
  }
}

console.log(`\n✓ 英文版：新增 ${added} / 更新 ${updated} / 跳过 ${skipped} / 删除 ${removed} / 失败 ${failed}${DRY ? "（dry-run，未写文件）" : ""}`);

/* 结果写进 Actions 摘要：不点开日志也能一眼看到这次到底做了什么。
   之前的痛点是「页面全绿、仓库没变化」，现在数字直接摆在运行页面上。 */
const sumFile = process.env.GITHUB_STEP_SUMMARY;
if (sumFile) {
  const tbl = [
    "### 博客英文版生成结果",
    "",
    "| 新增 | 更新 | 跳过 | 删除 | 失败 |",
    "| --- | --- | --- | --- | --- |",
    `| ${added} | ${updated} | ${skipped} | ${removed} | ${failed} |`,
    "",
    failed
      ? `⚠️ 有 ${failed} 篇没翻成（不写文件，避免把中文固化成「英文版」）；已成功的部分照常提交，下次运行自动补翻。`
      : "✅ 全部处理完毕。",
    ""
  ].join("\n");
  try { appendFileSync(sumFile, tbl); } catch (e) { /* 摘要写失败不影响主流程 */ }
}
/* ---- 结局：只要有失败，就把这次运行标红 ----
   以前不管成败都退出 0，接口被限流时 Action 一片绿，实际一个文件都没更新，
   在页面上和「跳过」完全分不出来。现在失败可见：
   已翻好的部分照常提交（workflow 的提交步骤带 if: always()），下一轮自动补翻。 */
if (failed && !DRY) {
  console.log(`::error::有 ${failed} 篇文章没翻成，线上英文版仍是旧内容 —— 已成功的部分照常提交，稍后重跑会自动补翻`);
  process.exitCode = 1;
}
