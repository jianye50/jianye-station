#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 360 软件宝库 (baoku.360.cn) 抓取软件数据，生成 data/software.json。

数据来源（唯一）：
  1. 列表页 https://baoku.360.cn/soft/list/cid/{cid}    -> 名称 / 图标 / 简介 / 大小 / 安全下载直链 / 榜位
  2. 详情接口 https://cx.soft.360.cn/soft/getinfo       -> 版本 / 更新时间 / 评分 / 厂商 / 截图 / 长简介

用法:
  python scripts/fetch_data.py               # 全量抓取
  python scripts/fetch_data.py --limit 20    # 每个分类只取前 20 个（调试用）
"""

import argparse
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://baoku.360.cn"
GETINFO = "https://cx.soft.360.cn/soft/getinfo"

# 上游把已下架/待清理的软件挂在「回收站」这类分类里，它们不是真实的产品分类，
# 既不抓取对应列表，也会在合并阶段把落进这些分类的条目剔除。
HIDDEN_CATEGORIES = {"回收站", "测试分类"}

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": BASE + "/",
}

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
OUT_FILE = os.path.join(DATA_DIR, "software.json")

# 这些字段只在详情视图用得到，单独放进 details.json 按需加载，减小首屏 JSON
DETAIL_KEYS = ("description", "screenshots", "corp", "updateNote", "fileName", "subCategory", "sizeBytes")


def fetch(url, timeout=25, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
            return raw.decode("utf-8", errors="ignore")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.2 * (i + 1))
    print("  ! 请求失败 %s (%s)" % (url, last), file=sys.stderr)
    return None


def clean(text):
    if text is None:
        return ""
    text = htmllib.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- 分类

CATE_RE = re.compile(
    r'class="cate-item[^"]*"\s+cid="(?P<cid>\d+)"\s+cname="(?P<cname>[^"]*)".*?>\s*</i>\s*(?P<name>[^<]+)',
    re.S,
)


def fetch_categories():
    page = fetch(BASE + "/soft/list/cid/0")
    cats, seen = [], set()
    if not page:
        return cats
    for m in CATE_RE.finditer(page):
        cid, name = m.group("cid"), clean(m.group("name"))
        if cid in seen or not name or name in HIDDEN_CATEGORIES:
            continue
        seen.add(cid)
        cats.append({"id": int(cid), "slug": m.group("cname"), "name": name})
    return cats


# ---------------------------------------------------------------- 列表

ITEM_RE = re.compile(r'<li sid="(?P<sid>\d+)">(?P<body>.*?)</li>', re.S)
ICON_RE = re.compile(r'<img[^>]*mainListIcon[^>]*>')
NAME_RE = re.compile(r'<h1 title="([^"]*)"')
DESC_RE = re.compile(r'<p title="([^"]*)"')
SIZE_RE = re.compile(r'<span>\s*([\d.]+\s*[KMGT]B)\s*</span>')
SAFE_RE = re.compile(r'safe_url="([^"]+)"')
RATING_RE = re.compile(r'data-width="([\d.]+)"')


def fetch_list(cid):
    page = fetch("%s/soft/list/cid/%d" % (BASE, cid))
    if not page:
        return []
    robots = 'name="robots" content="noindex' in page
    items = []
    for m in ITEM_RE.finditer(page):
        body = m.group("body")
        icon_tag = ICON_RE.search(body)
        icon = re.search(r'src="([^"]+)"', icon_tag.group(0)) if icon_tag else None
        name = NAME_RE.search(body)
        if not name:
            continue
        desc = DESC_RE.search(body)
        size = SIZE_RE.search(body)
        safe = SAFE_RE.search(body)
        rating = RATING_RE.search(body)
        items.append(
            {
                "id": int(m.group("sid")),
                "name": clean(name.group(1)),
                "icon": ("https:" + icon.group(1)) if icon and icon.group(1).startswith("//") else (icon.group(1) if icon else ""),
                "brief": clean(desc.group(1)) if desc else "",
                "sizeLabel": size.group(1).replace(" ", "") if size else "",
                "downloadUrl": htmllib.unescape(safe.group(1)) if safe else "",
                "rating10": float(rating.group(1)) if rating else 0.0,
                "noindex": robots,
            }
        )
    return items


# ---------------------------------------------------------------- 详情

def fetch_details(ids, batch=10):
    out = {}
    for i in range(0, len(ids), batch):
        chunk = ids[i : i + batch]
        info = json.dumps([[int(x), "", 1] for x in chunk], separators=(",", ":"))
        url = "%s?info=%s" % (GETINFO, urllib.parse.quote(info))
        raw = fetch(url)
        if not raw:
            continue
        try:
            data = json.loads(raw).get("data") or {}
        except ValueError:
            # 偶发 jsonp 包裹
            m = re.search(r"\{.*\}", raw, re.S)
            if not m:
                continue
            try:
                data = json.loads(m.group(0)).get("data") or {}
            except ValueError:
                continue
        out.update(data)
        print("    详情 %d/%d" % (min(i + batch, len(ids)), len(ids)), file=sys.stderr)
        time.sleep(0.25)
    return out


def format_size(num_bytes, fallback=""):
    try:
        n = float(num_bytes)
    except (TypeError, ValueError):
        return fallback
    if n <= 0:
        return fallback
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            if unit == "B":
                return "%d B" % int(n)
            return "%.1f %s" % (n, unit) if n >= 10 else "%.2f %s" % (n, unit)
        n /= 1024.0
    return fallback


def merge_item(item, detail):
    edition = ((detail.get("edition_info") or {}).get("default_edition")) or {}
    down = ((edition.get("down") or {}).get("default")) or {}
    cate = detail.get("baoku_cate") or {}
    subcate = (detail.get("baoku_subcate") or [{}])[0] or {}

    # 版本安装包直链优先用 getinfo 的 p2p 字段里内嵌的 https 地址（官方厂商 CDN），
    # 其次回退到列表页的 360 安全下载地址。
    installer = item.get("downloadUrl") or ""
    p2p = down.get("p2p") or ""
    m = re.search(r"https?://[^\s|]+\.(?:exe|zip|rar|msi|7z)", p2p)
    if m:
        installer = m.group(0)

    pub = edition.get("pubtime")
    updated = ""
    if isinstance(pub, (int, float)) and pub > 0:
        if pub > 1e12:  # 偶发毫秒时间戳
            pub = pub / 1000.0
        updated = time.strftime("%Y-%m-%d", time.localtime(pub))

    shots = [s for s in (detail.get("snapshot") or []) if isinstance(s, str) and s.startswith("http")]

    return {
        "id": item["id"],
        "name": item.get("name") or clean(detail.get("bname")),
        "icon": (detail.get("logo") or {}).get("72") or item.get("icon") or "",
        "category": clean(cate.get("name")) or "",
        "subCategory": clean(subcate.get("name")) or "",
        "brief": clean(detail.get("brief")) or item.get("brief", ""),
        "description": clean(detail.get("desc")) or item.get("brief", ""),
        "version": clean(edition.get("version")) or "",
        "updateNote": clean(edition.get("brief")) or "",
        "size": format_size(down.get("size"), item.get("sizeLabel", "")),
        "sizeBytes": down.get("size") or 0,
        "score": int(detail.get("soft_score") or 0),
        "corp": clean(detail.get("corp")) or "",
        "updated": updated,
        "downloadUrl": installer,
        "fileName": down.get("name") or "",
        # 详情页地址由前端按 id 拼接，这里不再重复存储
        "detailUrl": "",
        "screenshots": shots[:4],
        "rank": 0,  # 分类内下载榜位，稍后回填
    }


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="每个分类最多抓取多少条")
    ap.add_argument("--out", default=OUT_FILE)
    args = ap.parse_args()

    print("→ 抓取分类…", file=sys.stderr)
    cats = fetch_categories()
    if not cats:
        print("× 分类抓取失败，检查网络", file=sys.stderr)
        return 1
    print("  分类 %d 个: %s" % (len(cats), "、".join(c["name"] for c in cats)), file=sys.stderr)

    collected = {}  # id -> item
    order = []
    for c in cats:
        print("→ 分类 [%s] cid=%d" % (c["name"], c["id"]), file=sys.stderr)
        rows = fetch_list(c["id"])
        if args.limit:
            rows = rows[: args.limit]
        print("  列表 %d 条" % len(rows), file=sys.stderr)
        rank = 0
        for row in rows:
            if not row["name"]:
                continue
            rank += 1
            if row["id"] in collected:
                continue
            row["_category"] = c["name"]
            row["_rank"] = rank
            collected[row["id"]] = row
            order.append(row["id"])
        time.sleep(0.3)

    if not order:
        print("× 没有抓到任何软件", file=sys.stderr)
        return 1

    print("→ 抓取详情（%d 个软件）…" % len(order), file=sys.stderr)
    details = fetch_details(order)

    items = []
    seen_names = set()
    for sid in order:
        row = collected[sid]
        detail = details.get(str(sid)) or {}
        rec = merge_item(row, detail)
        if not rec["category"]:
            rec["category"] = row.get("_category", "")
        rec["rank"] = row.get("_rank", 0)
        if rec["category"] in HIDDEN_CATEGORIES:
            continue
        if not rec["name"] or not rec["icon"]:
            continue
        # 同名软件（常见于 32/64 位多包或跨分类重复收录）只保留榜位靠前的一条
        name_key = rec["name"].strip().lower()
        if name_key in seen_names:
            continue
        seen_names.add(name_key)
        items.append(rec)

    # 去除空字段，缩小 JSON 体积（详情页缺失部分前端已有兜底）
    items = [
        {k: v for k, v in it.items() if v not in ("", 0, None, []) or k in ("id", "name", "rank")}
        for it in items
    ]

    # 榜位按分类重排，保证连续
    by_cat = {}
    for it in items:
        by_cat.setdefault(it["category"], []).append(it)
    ranked = []
    for cat, group in by_cat.items():
        for i, it in enumerate(group, 1):
            it["rank"] = i
        ranked.extend(group)
    items = ranked

    cat_out = [{"name": c["name"], "slug": c["slug"], "count": 0} for c in cats]
    for it in items:
        for c in cat_out:
            if c["name"] == it["category"]:
                c["count"] += 1
    cat_out = [c for c in cat_out if c["count"] > 0]

    # 拆分索引 / 详情，首屏只加载索引
    index_apps, detail_map = [], {}
    for it in items:
        det = {k: it[k] for k in DETAIL_KEYS if k in it}
        if det:
            detail_map[str(it["id"])] = det
        index_apps.append({k: v for k, v in it.items() if k not in DETAIL_KEYS})

    payload = {
        "source": "360软件宝库",
        "sourceUrl": BASE + "/",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "count": len(items),
        "categories": cat_out,
        "apps": index_apps,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    size_kb = os.path.getsize(args.out) / 1024.0
    print("✓ 写入 %s（%d 个软件 / %.1f KB）" % (args.out, len(items), size_kb), file=sys.stderr)

    # 详情文件跟随索引文件所在目录，保证 --out 指向别处时不会写回默认 data/
    detail_file = os.path.join(os.path.dirname(os.path.abspath(args.out)), "details.json")
    with open(detail_file, "w", encoding="utf-8") as f:
        json.dump(detail_map, f, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    print("✓ 写入 %s（%.1f KB）" % (detail_file, os.path.getsize(detail_file) / 1024.0), file=sys.stderr)
    no_url = sum(1 for i in items if not i["downloadUrl"])
    print("  无下载直链: %d 个" % no_url, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
