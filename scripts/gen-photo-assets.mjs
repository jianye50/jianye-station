/* =============================================================================
 *  相册资源生成器 —— scripts/gen-photo-assets.mjs
 * -----------------------------------------------------------------------------
 *  把「Photo Album」里的原图，预处理成网页能秒开的资源：
 *
 *    ① 缩略图  assets/photos/<相册>/<名>-<内容hash>-480.webp   （列表用，方形裁切）
 *              assets/photos/<相册>/<名>-<内容hash>-960.webp   （高分屏 2x）
 *    ② 查看图  assets/photos/<相册>/<名>-<内容hash>-view.webp  （灯箱用，长边 ≤1600）
 *    ③ 占位图  24px 宽的极小 webp，以 base64 内联进 photos.json（消除白块）
 *    ④ 清单    photos.json —— 文件名 / 尺寸 / 相册分组 / 是否动态照片，全部预计算
 *
 *  为什么要它：相册里几张原图是「1.95 亿像素」「22296px 长图」这种体量，
 *  浏览器必须整张解码才能显示，手机端会卡死或解码失败。预处理后列表只加载
 *  480px 的 webp，单张 20~40KB，十几兆的相册首屏降到一两百 KB。
 *
 *  用法：
 *    cd scripts && npm install          # 只装一次（sharp）
 *    node gen-photo-assets.mjs          # 增量：只处理新图 / 改过的图
 *    node gen-photo-assets.mjs --force  # 全部重做
 *
 *  提示：新增/删除照片后跑一次本脚本，再提交 assets/photos 与 photos.json。
 *       没跑也不会白屏 —— 前端读不到清单会自动退回旧的目录扫描方式。
 * ========================================================================== */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let sharp;
try {
  /* 本地临时装了 sharp（没在 scripts 下 npm install）时，可用 SHARP_PATH 指向其目录 */
  sharp = require(process.env.SHARP_PATH || "sharp");
} catch (e) {
  console.error("\n[相册] 缺少 sharp 依赖，请先执行：\n  cd scripts && npm install\n");
  process.exit(1);
}

/* ---------- 路径与常量 ---------- */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "Photo Album");
const OUT = path.join(ROOT, "assets", "photos");
const MANIFEST = path.join(ROOT, "photos.json");

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/i;
const VID_RE = /\.(mp4|mov|m4v|webm)$/i;

const THUMB_SIZES = [480, 960];              /* 列表图：方形裁切 */
const VIEW_BOX = { w: 1600, h: 9000, area: 7.5e6 }; /* 灯箱图：等比缩放，面积封顶 */
const BLUR_W = 24;                           /* 占位图宽度 */
const FORCE = process.argv.includes("--force");

const rel = (...p) => path.relative(ROOT, path.join(...p)).split(path.sep).join("/");
const shortHash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 6);
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

/* 相册目录名：尽量用可读的 ASCII，中文名补短 hash 保证稳定 */
function albumKey(name) {
  if (!name) return "root";
  const ascii = name
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 20);
  return `${ascii || "album"}-${shortHash(name)}`;
}

/* 文件名：保留可读部分 + 内容 hash（内容变→名字变，可以放心 immutable 长缓存） */
function fileStem(fileName, hash) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const safe = base
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${safe || "p"}-${hash.slice(0, 8)}`;
}

/* ---------- 动态照片（Motion Photo / Live Photo 单文件）静默探测 ----------
   这类 JPG 在文件头 XMP 里带 MotionPhoto / MicroVideo 标记，视频以 mp4
   盒子附在文件尾部；三星等机型另有 SEFT 尾标记。这里只在构建期读一小段。 */
async function isMotionPhoto(abs) {
  let fh;
  try {
    fh = await fsp.open(abs, "r");
    const { size } = await fh.stat();
    const head = Buffer.alloc(Math.min(65536, size));
    await fh.read(head, 0, head.length, 0);
    if (/MotionPhoto|MicroVideo|SEFT/.test(head.toString("latin1"))) return true;
    const tailLen = Math.min(1048576, size);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    if (/MotionPhoto|MicroVideo|SEFT/.test(tail.toString("latin1"))) return true;
    for (let i = tail.length - 12; i > 0; i--) {
      if (tail[i] === 0x66 && tail[i + 1] === 0x74 && tail[i + 2] === 0x79 && tail[i + 3] === 0x70) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

/* ---------- 单张图片 → 三档 webp + 占位图 ---------- */
async function renderImage(abs, key, hash, prevBlur) {
  const stem = fileStem(path.basename(abs), hash);
  const dir = path.join(OUT, key);
  await fsp.mkdir(dir, { recursive: true });
  const out = { 480: "", 960: "", view: "", blur: "" };

  const base = () => sharp(abs, { failOn: "none", limitInputPixels: false }).rotate();
  const meta = await base().metadata();
  let w = meta.width || 0;
  let h = meta.height || 0;
  if (meta.orientation >= 5) [w, h] = [h, w];

  /* ① 列表缩略图：正方形居中裁切（瓷砖本身就是正方形 + object-fit:cover） */
  for (const size of THUMB_SIZES) {
    const file = path.join(dir, `${stem}-${size}.webp`);
    if (!FORCE && fs.existsSync(file)) {
      out[size] = rel(file);
      continue;
    }
    await base()
      .resize(size, size, { fit: "cover", position: "centre" })
      .webp({ quality: size <= 480 ? 72 : 76, effort: 4 })
      .toFile(file);
    out[size] = rel(file);
  }

  /* ② 占位图：24px 宽的极小 webp，以 data URI 内联进清单（不落盘、不进仓库）。
        图片没改过就直接复用上一版清单里的那份，省一次解码。 */
  if (!FORCE && prevBlur) {
    out.blur = prevBlur;
  } else {
    const buf = await base().resize(BLUR_W, BLUR_W, { fit: "cover" }).webp({ quality: 35 }).toBuffer();
    out.blur = "data:image/webp;base64," + buf.toString("base64");
  }

  /* ③ 灯箱图：一律生成 webp（长边 ≤1600、总像素 ≤750 万）。
       小图不放大，只做「转 webp」这一步 —— 原来小图直接回退原图，
       结果灯箱要下几百 KB 到几 MB 的 JPG/PNG，切图会卡在上一张。 */
  if (w && h) {
    const scale = Math.min(1, VIEW_BOX.w / w, VIEW_BOX.h / h, Math.sqrt(VIEW_BOX.area / (w * h)));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const file = path.join(dir, `${stem}-view.webp`);
    if (!FORCE && fs.existsSync(file)) {
      out.view = rel(file);
    } else {
      await base()
        .resize({ width: tw, height: th, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 74, effort: 4 })
        .toFile(file);
      out.view = rel(file);
    }
  }

  return { out, w, h };
}

/* ---------- 主流程 ---------- */
async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`[相册] 找不到目录：${rel(SRC)}`);
    process.exit(1);
  }
  const t0 = Date.now();
  await fsp.mkdir(OUT, { recursive: true });

  const roots = await fsp.readdir(SRC, { withFileTypes: true });
  const albums = roots
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
  const rootFiles = roots
    .filter((d) => d.isFile() && !d.name.startsWith("."))
    .map((d) => d.name);

  /* 收集：根目录 = 全部（album 为空串），每个子文件夹 = 独立相册 */
  const items = [];
  for (const f of rootFiles) items.push({ dir: SRC, name: f, album: "" });
  for (const a of albums) {
    const list = (await fsp.readdir(path.join(SRC, a), { withFileTypes: true }))
      .filter((d) => d.isFile() && !d.name.startsWith("."))
      .map((d) => d.name);
    for (const f of list) items.push({ dir: path.join(SRC, a), name: f, album: a });
  }

  const keep = new Set();
  const photos = [];
  let done = 0;

  /* 上一版清单：内容 hash 与路径都没变，就直接复用它的模糊占位（省一次解码） */
  let prevMap = new Map();
  try {
    const prev = JSON.parse(await fsp.readFile(MANIFEST, "utf8"));
    prevMap = new Map((prev.photos || []).map((p) => [`${p.src}|${p.hash || ""}`, p.blur || ""]));
  } catch {
    /* 首次生成，没有旧清单 */
  }

  for (const it of items) {
    const abs = path.join(it.dir, it.name);
    const isVideo = VID_RE.test(it.name);
    const isImage = IMG_RE.test(it.name);
    if (!isVideo && !isImage) continue;

    const key = albumKey(it.album);
    const srcRel = rel(abs);
    const srcUrl = enc(srcRel);

    /* 内容 hash：改了图 → 名字变 → 旧文件在末尾被清理，缓存永不脏 */
    const hash = crypto.createHash("sha1").update(await fsp.readFile(abs)).digest("hex");

    const entry = {
      name: it.name.replace(/\.[^.]+$/, ""),
      album: it.album,
      key,
      type: isVideo ? "video" : "image",
      src: srcUrl,
      hash: hash.slice(0, 8),
      thumb: "",
      thumb2x: "",
      view: "",
      blur: "",
      w: 0,
      h: 0,
      motion: false,
    };

    if (isVideo) {
      /* 视频不做转码（保持原样，靠 preload 控制下载）；列表用 <video> 抓首帧 */
      entry.thumb = srcUrl;
      entry.thumb2x = srcUrl;
      entry.view = srcUrl;
    } else {
      try {
        const { out, w, h } = await renderImage(abs, key, hash, prevMap.get(`${srcUrl}|${hash.slice(0, 8)}`));
        entry.thumb = enc(out[480] || srcUrl);
        entry.thumb2x = enc(out[960] || out[480] || srcUrl);
        entry.view = enc(out.view || srcRel);
        entry.blur = out.blur;
        entry.w = w;
        entry.h = h;
        [entry.thumb, entry.thumb2x, entry.view].forEach((p) => keep.add(decodeURIComponent(p)));
        entry.motion = await isMotionPhoto(abs);
      } catch (err) {
        /* 解码失败（HEIC 缺插件 / 文件损坏）：退回原图，至少不会白掉 */
        console.warn(`[相册] 跳过处理 ${srcRel}：${err.message}`);
        entry.thumb = srcUrl;
        entry.thumb2x = srcUrl;
        entry.view = srcUrl;
      }
    }

    photos.push(entry);
    done++;
    process.stdout.write(`\r[相册] 处理中 ${done}/${items.length} …`);
  }

  /* ---------- Live Photo 配对：同相册里同名「图片 + 视频」→ 合成一组 ---------- */
  const vidOf = new Map();
  photos.forEach((p) => {
    if (p.type === "video") vidOf.set(`${p.album}|${p.name}`.toLowerCase(), p);
  });
  const merged = [];
  for (const p of photos) {
    if (p.type === "video") {
      const paired = photos.some(
        (x) => x.type !== "video" && x.album === p.album && x.name.toLowerCase() === p.name.toLowerCase()
      );
      if (paired) continue; /* 配成 Live Photo 的视频不单独显示 */
    }
    if (p.type === "image") {
      const v = vidOf.get(`${p.album}|${p.name}`.toLowerCase());
      if (v) {
        p.type = "live";
        p.live = v.src;
        p.view = p.view || v.thumb;
      }
    }
    merged.push(p);
  }

  /* 排序：与旧版前端一致（名称倒序、数字感知），保证「最新的在最前」 */
  merged.sort((a, b) => b.name.localeCompare(a.name, "zh-Hans-CN", { numeric: true }));

  /* ---------- 相册汇总（封面优先取图片） ---------- */
  const amap = new Map();
  for (const p of merged) {
    if (!p.album) continue;
    let a = amap.get(p.album);
    if (!a) {
      a = { name: p.album, key: p.key, count: 0, cover: "", coverBlur: "" };
      amap.set(p.album, a);
    }
    a.count++;
    if (!a.cover || (a.coverIsVideo && p.type !== "video")) {
      a.cover = p.thumb;
      a.coverBlur = p.blur || "";
      a.coverIsVideo = p.type === "video";
    }
  }
  const albumList = Array.from(amap.values()).map(({ coverIsVideo, ...rest }) => rest);

  /* ---------- 写清单（内容没变就不动文件，避免 CI 里无限提交） ---------- */
  const manifest = {
    version: 1,
    sizes: THUMB_SIZES,
    albums: albumList,
    photos: merged.map(({ key, ...p }) => p),
  };
  const next = JSON.stringify(manifest, null, 1) + "\n";
  let changed = true;
  try {
    changed = (await fsp.readFile(MANIFEST, "utf8")) !== next;
  } catch {
    /* 首次生成 */
  }
  if (changed) await fsp.writeFile(MANIFEST, next);

  /* ---------- 清理孤儿文件（删掉照片 / 内容变化后留下的旧 webp） ---------- */
  let removed = 0;
  async function sweep(dir) {
    let list = [];
    try {
      list = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of list) {
      const abs = path.join(dir, d.name);
      if (d.isDirectory()) {
        await sweep(abs);
        const left = await fsp.readdir(abs).catch(() => []);
        if (!left.length) await fsp.rmdir(abs).catch(() => {});
      } else if (!keep.has(rel(abs))) {
        await fsp.rm(abs).catch(() => {});
        removed++;
      }
    }
  }
  await sweep(OUT);

  const sizeMB = (n) => (n / 1048576).toFixed(1);
  let outBytes = 0;
  for (const f of keep) {
    try {
      outBytes += (await fsp.stat(path.join(ROOT, f))).size;
    } catch {}
  }
  console.log(
    `\r[相册] 完成：${merged.length} 项 · ${albumList.length} 个子相册 · ` +
      `生成资源 ${sizeMB(outBytes)}MB（清理 ${removed} 个旧文件）· 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
  if (changed) console.log("[相册] photos.json 已更新");
}

main().catch((e) => {
  console.error("\n[相册] 生成失败：", e);
  process.exit(1);
});
