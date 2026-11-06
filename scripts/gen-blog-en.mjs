#!/usr/bin/env node
/* =====================================================================
 * 自动生成文章的另一个语言版本（中 ⇄ 英，双向）
 *
 *   blog/<文章>/index.md      →  index.en.md  +  index.zh.md
 *   blog/<名字>.md            →  <名字>.en.md +  <名字>.zh.md
 *
 * 规则只有一条：**每篇文章都要有 index.en.md 和 index.zh.md 两份**，
 * 不管原文是什么语言 —— 中文写的也生成中文版，英文写的也生成英文版。
 * 原文语言那一份没有外语段落时直接落副本（零接口请求），
 * 中英混排时把夹着的另一种语言也翻掉，保证两份各自纯净。
 * 网站按访客界面语言直接读对应文件，任何语言组合都不再走临时机翻。
 *
 * 触发：.github/workflows/gen-blog-en.yml（push blog/**、定时兜底、手动 workflow_dispatch）
 * 手动：node scripts/gen-blog-en.mjs [--force] [--dry-run] [--only=slug] [--target=en|zh]
 *
 * 细节：
 *   1. 源文件没变（内容哈希一致）→ 跳过；
 *   2. 译文文件语言不对（正文还大面积是原文语言）→ 重翻，哪怕哈希没变；
 *   3. 源文章删了 → 两个译文一起删，不留孤儿；
 *   4. 人工写的译文（front matter 里没有 auto: true）→ 绝不覆盖；
 *   5. 翻译接口被限流 → 保留原文、下次再试，绝不写出「半成品译文」。
 * ===================================================================== */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, unlinkSync, appendFileSync } from "node:fs";
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
const FORCE = ARGS.includes("--force");
const DRY = ARGS.includes("--dry-run");
const ONLY = (ARGS.find(a => a.startsWith("--only=")) || "").slice(7);
const ONLY_TARGET = (ARGS.find(a => a.startsWith("--target=")) || "").slice(9);  /* en | zh | 空=两个都做 */
const DELAY = +(process.env.TR_DELAY_MS || 120);
const MAX_CHARS = 1600;

const PAIRS = { en: { from: "zh-CN", to: "en" }, zh: { from: "en", to: "zh-CN" } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- front matter 解析（与网站 index.html / gen-blog-index.mjs 保持一致） ---------- */
function parseFM(raw) {
  const meta = {}; let body = raw;
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

function yamlVal(s) {
  s = String(s == null ? "" : s).replace(/\r?\n/g, " ").trim();
  if (!s) return '""';
  if (/^[\s>|*&!%@`{}\[\]#-]|: |\s#|^$/.test(s) || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return s;
}

/* ---------- 语言判定：只数「正文文字」，代码/图片/链接/语法行都不算 ---------- */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const CJK_ONE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const MD_MEDIA_LINE = /^[ \t]*@(?:file|embed|audio|gallery|motion|link)\[[^\]]*\]\([^)]*\)[ \t]*$/gm;

function bare(s) {
  return String(s == null ? "" : s)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(MD_MEDIA_LINE, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/!\[[^\]\n]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]\n]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/\bhttps?:\/\/\S+/g, "");
}
function counts(s) {
  const b = bare(s);
  const cjk = (b.match(CJK_RE) || []).length;
  const lat = (b.match(/[A-Za-z]/g) || []).length;
  return { cjk, lat };
}
/* 某种语言在正文里的占比（只按文字字符算，标点符号不参与） */
function langFrac(s, lang) {
  const { cjk, lat } = counts(s);
  const all = cjk + lat;
  if (!all) return 0;
  return lang === "zh" ? cjk / all : lat / all;
}
/* 原文语言：中文占比 ≥ 20% 就算中文写的（几行英文术语不会改变结论） */
function detectLang(meta, body) {
  const s = [meta.title || "", meta.desc || "", body].join("\n");
  const { cjk, lat } = counts(s);
  if (!cjk && !lat) return "zh";
  return cjk / (cjk + lat) >= 0.2 ? "zh" : "en";
}
/* 这一段/这一行要不要翻成 target */
function needsTr(s, target) {
  const t = bare(String(s == null ? "" : s));
  if (!t.trim()) return false;
  if (target === "en") return CJK_ONE.test(t);
  return !CJK_ONE.test(t) && /[A-Za-z]/.test(t);
}
/* 「整段都是另一种语言」的段落数 —— 这些段落必须翻掉。
   判断依据是段落级的文字占比：中文句子里夹一个 Cloudflare 不算外语段落，
   但整段英文写成的段落，中文版里就必须变成中文。
   用它代替原来的「整篇字符占比」闸门：行内术语本来就该保留，
   拿整篇比例去卡会把正常的中文文章误判成「没翻成」 */
function foreignParas(body, fromLang) {
  return String(body).split(/\n{2,}/).filter(p => {
    if (!p.trim() || isMediaPara(p)) return false;
    const { cjk, lat } = counts(p);
    if (cjk + lat < 4) return false;               /* 纯数字 / 符号 / 图片行 */
    return fromLang === "en" ? lat / (cjk + lat) > 0.85 : cjk / (cjk + lat) > 0.85;
  }).length;
}

/* ---------- 翻译接口：Google 免费公开接口，双域名 + 指数退避 ---------- */
const HOSTS = ["https://translate.googleapis.com", "https://translate.google.com"];
let reqCount = 0;
let failStreak = 0;
let FATAL = null;
async function gtx(text, target) {
  if (FATAL) throw FATAL;
  const { from, to } = PAIRS[target];
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
        if (++failStreak >= 8) {
          FATAL = new Error(`翻译接口连续失败 ${failStreak} 次（${e.message}），停止本次运行`);
          throw FATAL;
        }
        await sleep(800 * (attempt + 1) * (attempt + 1));
      }
    }
  }
  throw lastErr || new Error("翻译失败");
}

/* ---------- 行内结构保护 ---------- */
const IMG_RE = /!\[[^\]\n]*\]\((?:[^()\n]|\([^()]*\))*\)/g;
const PROT_RE = /`[^`\n]+`|!\[[^\]\n]*\]\((?:[^()\n]|\([^()]*\))*\)|\]\((?:[^()\n]|\([^()]*\))+\)|<[a-zA-Z\/!][^>\n]*>|(?:https?:\/\/|www\.)[^\s)<>"'\]]+/g;

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
  const left = (out.match(/\[\[\s*\d+\s*\]\]/g) || []).length;
  if (miss || left) throw new Error("占位符还原失败");
  return out;
}
function splitPrefix(line) {
  const m = line.match(/^(\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)?)([\s\S]*)$/);
  return { prefix: m ? m[1] : "", rest: m ? m[2] : line };
}

/* 单段文本翻译（含占位符往返）；失败时按行降级，再失败就保留原文 */
async function trText(text, target) {
  if (!needsTr(text, target)) return text;
  const { t, keep } = protect(text);
  try {
    const res = restore(await gtx(t, target), keep);
    if (!sameImgs(text, res)) throw new Error("图片地址被翻译改动");
    return res;
  } catch (e) {
    if (FATAL) throw e;
    const lines = text.split("\n");
    const done = [];
    for (const line of lines) {
      if (!needsTr(line, target)) { done.push(line); continue; }
      const { prefix, rest } = splitPrefix(line);
      if (!needsTr(rest, target)) { done.push(line); continue; }
      try {
        const p = protect(rest);
        done.push(prefix + restore(await gtx(p.t, target), p.keep));
      } catch (e2) {
        if (FATAL) throw e2;
        done.push(line);
      }
    }
    return done.join("\n");
  }
}

/* 表格整行：按列拆开分别翻，竖线与两侧空格的原始排版保持不变 */
async function trTableRow(line, target) {
  if (!needsTr(line, target)) return line;
  const out = [];
  for (const c of line.split("|")) {
    const m = c.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m || !needsTr(m[2], target)) { out.push(c); continue; }
    out.push(m[1] + await trText(m[2], target).catch(() => m[2]) + m[3]);
  }
  return out.join("|");
}

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

async function trBlock(seg, target) {
  const lines = seg.split("\n");
  const rows = lines.filter(l => l.trim());
  if (rows.length && rows.length === lines.length && rows.every(l => /^\s*\|/.test(l))) {
    const out = [];
    for (const l of lines) out.push(await trTableRow(l, target));
    return out.join("\n");
  }
  const pieces = [];
  for (const ch of chunks(seg, MAX_CHARS)) pieces.push(await trText(ch, target));
  return pieces.join("");
}

/* 正文翻译：按空行切段 → 只把「另一种语言」的段落打包合翻（省请求数）
   → 代码块整块跳过 → 段数对不上时退回逐段翻译。 */
async function trBody(body, target) {
  const { masked, codes } = maskFences(body);
  const paras = masked.split(/\n{2,}/).filter(p => p.trim());
  const out = new Array(paras.length);
  let batch = [], idxs = [], size = 0;

  const flush = async () => {
    if (!batch.length) return;
    const joined = batch.join("\n\n");
    let done = null;
    try {
      const { t, keep } = protect(joined);
      const parts = restore(await gtx(t, target), keep).split(/\n{2,}/);
      if (parts.length === batch.length && parts.every((p, i) => sameImgs(batch[i], p))) done = parts;
    } catch (e) {
      if (FATAL) throw e;
    }
    if (!done) {
      done = [];
      for (const p of batch) done.push(await trBlock(p, target));
    }
    done.forEach((d, k) => { out[idxs[k]] = d; });
    batch = []; idxs = []; size = 0;
  };

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    /* 媒体行要先判：bare() 会把整行剔掉，needsTr 永远返回 false，
       照普通段落走的话标签会一直是原文语言 */
    if (isMediaPara(p)) { out[i] = await trMediaPara(p, target); continue; }
    const lines = p.split("\n").filter(l => l.trim());
    const need = lines.filter(l => needsTr(l, target)).length;
    if (!need) { out[i] = p; continue; }
    if (need < lines.length) { out[i] = await trLines(p, target); continue; }   /* 段内混排：逐行 */
    if (size && size + p.length > MAX_CHARS) await flush();
    batch.push(p); idxs.push(i); size += p.length + 2;
  }
  await flush();
  return unmaskFences(out.join("\n\n"), codes);
}

async function trShort(s, target) {
  if (!needsTr(s, target)) return s;
  try { return await trText(String(s), target); }
  catch (e) { if (FATAL) throw e; return String(s); }
}

/* 一个段落里中英行混在一起（比如半张表格是中文、半张是英文）：
   整段送翻会因为「段里有中文」被判成不用翻，英文行就永远留着。
   这种段落按行处理 —— 该翻的行翻，不该翻的行原样，表格行还要按格拆 */
async function trLines(para, target) {
  const out = [];
  for (const l of para.split("\n")) {
    if (!needsTr(l, target)) { out.push(l); continue; }
    if (/^\s*\|/.test(l)) out.push(await trTableRow(l, target));
    else if (MEDIA_LINE.test(l)) out.push(await trMediaLine(l, target));
    else out.push(await trText(l, target));
  }
  return out.join("\n");
}

/* 媒体指令行 @file[标签](路径)：整行送翻会让占位符还原失败、指令名被翻坏，
   结果整行原样退回（标签永远是中文）。只翻方括号里的标签，语法一个字不动 */
const MEDIA_LINE = /^([ \t]*@(?:file|embed|audio|gallery|motion|link)\[)([^\]]*)(\]\([^)]*\)[ \t]*)$/;
async function trMediaLine(line, target) {
  const m = line.match(MEDIA_LINE);
  if (!m || !needsTr(m[2], target)) return line;
  let lab = m[2];
  try {
    const t = await gtx(lab, target);
    if (t && t.trim() && !/[\[\]]/.test(t)) lab = t.trim();
  } catch (e) { if (FATAL) throw e; }
  return m[1] + lab + m[3];
}
const isMediaPara = p => p.split("\n").every(l => !l.trim() || MEDIA_LINE.test(l));
async function trMediaPara(p, target) {
  const out = [];
  for (const l of p.split("\n")) out.push(l.trim() ? await trMediaLine(l, target) : l);
  return out.join("\n");
}

/* ---------- 扫描文章 ---------- */
const isTrFile = n => /\.(en|zh)\.md$/i.test(n);
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
      list.push({
        slug: name, src, dir: p,
        dst: { en: join(p, "index.en.md"), zh: join(p, "index.zh.md") },
        relBase: `blog/${name}/index`
      });
    } else if (/\.md$/i.test(name) && !isTrFile(name)) {
      const slug = name.replace(/\.md$/i, "");
      list.push({
        slug, src: p, dir: blogDir,
        dst: { en: join(blogDir, slug + ".en.md"), zh: join(blogDir, slug + ".zh.md") },
        relBase: `blog/${slug}`
      });
    }
  }
  return list;
}

const sha1 = s => createHash("sha1").update(s).digest("hex").slice(0, 16);

/* ---------- 主流程 ---------- */
const articles = scanArticles();
const srcSet = new Set();
for (const a of articles) { srcSet.add(a.dst.en); srcSet.add(a.dst.zh); }
let added = 0, updated = 0, skipped = 0, removed = 0, failed = 0;

/* ① 清理孤儿译文：源文章不存在了（删除 / 改名），译文跟着删 */
for (const name of readdirSync(blogDir)) {
  const p = join(blogDir, name);
  let st = null;
  try { st = statSync(p); } catch (e) { continue; }
  const candidates = [];
  if (st.isDirectory()) {
    candidates.push(join(p, "index.en.md"), join(p, "index.zh.md"));
  } else if (isTrFile(name)) candidates.push(p);
  for (const c of candidates) {
    if (existsSync(c) && !srcSet.has(c)) {
      console.log(`- 删除孤儿译文 ${c.slice(root.length + 1)}`);
      if (!DRY) unlinkSync(c);
      removed++;
    }
  }
}

/* ② 逐篇、逐方向生成 */
for (const a of articles) {
  if (ONLY && a.slug !== ONLY) continue;
  const rel = a.src.slice(root.length + 1);
  const rawSrc = readFileSync(a.src, "utf8");
  const { meta, body } = parseFM(rawSrc);
  const hash = sha1(rawSrc);
  const srcLang = detectLang(meta, body);
  const srcTags = Array.isArray(meta.tags) ? meta.tags
    : (meta.tags ? String(meta.tags).split(/[,，]/).map(x => x.trim()).filter(Boolean) : []);
  /* 不管原文是什么语言，每篇都产出 index.en.md + index.zh.md 两份：
     - 另一种语言的版本：整篇翻过去；
     - 原文语言那一份：纯中文 / 纯英文时直接落成规范副本（不花接口额度），
       中英混排时把夹着的另一种语言也翻掉。
     访客切到哪个语言，读的都是已经翻好的那一份，不会再出现「原文兜底 + 临时机翻」 */
  let targets = ONLY_TARGET ? [ONLY_TARGET] : ["en", "zh"];
  targets = [...new Set(targets)].filter(t => t === "en" || t === "zh");
  if (!targets.length) continue;

  for (const target of targets) {
    const dst = a.dst[target];
    /* 这个方向要「翻掉」的语言 */
    const fromLang = target === "en" ? "zh" : "en";
    const fromFrac = langFrac(body, fromLang);
    /* 这一份要翻的「外语段落」有几段（段落级判定，行内术语不算） */
    const fromParas = foreignParas(body, fromLang);
    /* 原文语言那一份、且没有任何外语段落 → 直接落副本，一次接口都不用打 */
    const isCopy = target === srcLang && fromParas === 0;
    const relDst = dst.slice(root.length + 1);

    /* 已有译文：人工写的别动，自动生成的看哈希与语言体检 */
    let prev = null;
    if (existsSync(dst)) {
      let prevBody = "", broken = "";
      try {
        const p = parseFM(readFileSync(dst, "utf8"));
        prev = p.meta; prevBody = p.body;
        if (!Object.keys(prev).length) broken = "没有可解析的 front matter";
        else if (!prevBody.trim()) broken = "正文为空";
      } catch (e) { broken = "读取失败：" + e.message; }
      if (broken) {
        prev = null;
        console.log(`! 译文损坏（${broken}），重新翻译 ${relDst}`);
        console.log(`::warning::译文损坏，已重新生成：${relDst}（${broken}）`);
      } else {
        if (String(prev.auto) !== "true") {
          const msg = `跳过人工译文（front matter 里没有 auto: true）：${relDst}`;
          console.log(`= ${msg}`);
          console.log(`::warning::${msg}${FORCE ? " —— 即使加 --force 也不覆盖；确实要重译就删掉这个文件，或补一行 auto: true" : ""}`);
          skipped++; continue;
        }
        /* 语言体检：文件在、哈希也对，但「该翻掉的段落」一段都没少 →
           上一次翻译其实失败了（旧脚本会写出这种半成品）。必须重翻，
           否则网站会把原文当译文用，而且永远不再更新。
           副本文件（原文语言那份）没有外语段落，天然不触发 */
        const badLang = fromParas > 0 && foreignParas(prevBody, fromLang) >= fromParas;
        if (!FORCE && prev.srchash === hash && !badLang && sameImgs(body, prevBody)) {
          console.log(`= 跳过（未改动）${relDst}`);
          skipped++; continue;
        }
        if (badLang) console.log(`! 译文语言不对（仍是原文语言），重新翻译 ${relDst}`);
        else if (prev.srchash === hash) console.log(`! 图片地址与原文对不上，重新翻译 ${relDst}`);
      }
    }

    process.stdout.write(`→ ${isCopy ? "落库" : "翻译"} ${rel}  [${isCopy ? "原文" : fromLang + " → " + target}] ... `);
    const t0 = Date.now();
    try {
      let title, desc, outTags, outBody;
      if (isCopy) {
        /* 原文语言那一份：内容已经是目标语言，不需要任何翻译请求，
           直接落一份带 auto/srcHash 的规范文件，让两个语言都「有文件可读」 */
        title = meta.title || a.slug;
        desc = meta.desc || "";
        outTags = srcTags;
        outBody = body;
      } else {
        title = await trShort(meta.title || a.slug, target);
        desc = meta.desc ? await trShort(meta.desc, target) : "";
        outTags = [];
        for (const tg of srcTags) outTags.push(await trShort(tg, target));
        outBody = await trBody(body, target);

        /* 质量闸门：接口被限流时 trText 会「保留原文」降级，整篇一个字都没翻，
           但下面照样会写出一个格式完好的译文文件 —— 那份文件一旦落库就会
           永远「跳过（未改动）」，线上一直显示原文。所以先体检再落盘。
           判据是「整段都是另一种语言」的段落有没有翻掉（行内术语保留属正常） */
        const outParas = foreignParas(outBody, fromLang);
        if (outParas > 0) {
          throw new Error(`译后仍有 ${outParas} 段是 ${fromLang}（原文 ${fromParas} 段），翻译没生效`);
        }
        if (needsTr(meta.title || "", target) && langFrac(title, fromLang) > Math.max(0.15, fromFrac * 0.6)) {
          throw new Error("标题没翻成，不写文件");
        }
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
        `lang: ${target}`,
        "auto: true",
        `srcHash: ${hash}`,
        `translatedAt: ${new Date().toISOString()}`,
        "---",
        ""
      ].filter(x => x !== null).join("\n");

      if (!DRY) writeFileSync(dst, fm + outBody.replace(/\s+$/, "") + "\n", "utf8");
      if (prev) updated++; else added++;
      console.log(`完成（${((Date.now() - t0) / 1000).toFixed(1)}s，${reqCount} 次请求累计）`);
    } catch (e) {
      failed++;
      console.log(`失败：${e.message}（保留原文，下次再试）`);
      console.log(`::error::翻译失败，这篇的译文仍是旧内容：${relDst} —— ${e.message}`);
      if (FATAL) { console.log("! 接口本次不可用，先停下——已经翻好的文章照样会提交，剩下的下次再补。"); break; }
    }
  }
  if (FATAL) break;
}

console.log(`\n✓ 译文：新增 ${added} / 更新 ${updated} / 跳过 ${skipped} / 删除 ${removed} / 失败 ${failed}${DRY ? "（dry-run，未写文件）" : ""}`);

const sumFile = process.env.GITHUB_STEP_SUMMARY;
if (sumFile) {
  const tbl = [
    "### 博客译文生成结果（中 ⇄ 英）",
    "",
    "| 新增 | 更新 | 跳过 | 删除 | 失败 |",
    "| --- | --- | --- | --- | --- |",
    `| ${added} | ${updated} | ${skipped} | ${removed} | ${failed} |`,
    "",
    failed
      ? `⚠️ 有 ${failed} 个方向没翻成（不写文件，避免把原文固化成「译文」）；已成功的部分照常提交，下次运行自动补翻。`
      : "✅ 全部处理完毕：每篇文章都有 index.md / index.en.md / index.zh.md。",
    ""
  ].join("\n");
  try { appendFileSync(sumFile, tbl); } catch (e) {}
}
if (failed && !DRY) {
  console.log(`::error::有 ${failed} 个方向没翻成，线上仍是旧内容 —— 已成功的部分照常提交，稍后重跑会自动补翻`);
  process.exitCode = 1;
}
