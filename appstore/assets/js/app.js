/* ==========================================================================
   软件商店 — 交互逻辑（单页）
   数据：data/software.json（索引）+ data/details.json（详情按需加载）
   ========================================================================== */

(function () {
  'use strict';

  var DATA_URL = 'data/software.json';
  var DETAILS_URL = 'data/details.json';
  var PAGE_SIZE = 48;

  // 上游（360 宝库）会把已下架/待清理的软件归到这些分类，它们不是真实的产品分类，
  // 既不该出现在筛选条里，也不该被推荐，加载后直接剔除。
  var HIDDEN_CATEGORIES = { '回收站': 1, '测试分类': 1 };

  var state = {
    apps: [],
    details: null,
    detailsPromise: null,
    q: '',
    cat: '全部',
    openId: null,
    list: [],
    shown: PAGE_SIZE,
    shots: []
  };

  var chipsBuilt = false;
  var closeTimer = null;
  var lastFocus = null;
  var lb = { index: 0, open: false, timer: null };

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // 数字滚动
  function animateNum(el, target) {
    if (!el) return;
    if (reduceMotion()) { el.textContent = target; return; }
    var t0 = performance.now(), dur = 640;
    function tick(t) {
      var k = Math.min(1, (t - t0) / dur);
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? Math.round(target * eased) : target;
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------- 工具 */

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 图标 / 截图来源是 http 的 CDN：在 https 页面上会被浏览器按混合内容拦掉，
  // 这里统一升到 https（这些图床都支持），避免整排截图变成灰框
  function httpsUrl(u) {
    return String(u == null ? '' : u).replace(/^http:\/\//i, 'https://');
  }

  var LETTER_COLORS = ['#4d8dff', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  function letterColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return LETTER_COLORS[h % LETTER_COLORS.length];
  }

  // 图标：有图标给 <img>，加载失败降级为彩色字母块
  function letterIcon(name, boxCls) {
    name = String(name || '');
    var ch = name.trim().charAt(0).toUpperCase() || '?';
    return '<div class="' + boxCls + '" style="background:' + letterColor(name) + '">' + esc(ch) + '</div>';
  }

  function iconHTML(app, kind) {
    var imgCls = kind === 'dt' ? 'dt-icon' : 'card__icon';
    var boxCls = kind === 'dt' ? 'dt-letter' : 'card__letter';
    if (app.icon) {
      // 名字通过 data 属性传递，避免中文/引号把 onerror 属性截断
      return '<img class="' + imgCls + '" src="' + esc(httpsUrl(app.icon)) + '" alt="" loading="lazy" ' +
        'data-name="' + esc(app.name) + '" data-box="' + boxCls + '" onerror="window.__iconFail(this)">';
    }
    return letterIcon(app.name, boxCls);
  }

  window.__iconFail = function (img) {
    var box = img.getAttribute('data-box') || 'card__letter';
    img.outerHTML = letterIcon(img.getAttribute('data-name'), box);
  };

  var toastTimer = null;
  var toastHideTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastHideTimer);
    // 下一帧再加 show，让 transition 有起点
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      toastHideTimer = setTimeout(function () { t.hidden = true; }, 340);
    }, 2400);
  }

  /* ------------------------------------------------------------- 数据 */

  function loadData() {
    $('#skeleton').hidden = false;
    $('#grid').hidden = true;
    $('#meta').hidden = true;
    $('#moreWrap').hidden = true;
    $('#empty').hidden = true;
    $('#error').hidden = true;

    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
        return r.text();
      })
      .then(function (txt) {
        var json;
        try {
          json = JSON.parse(txt);
        } catch (e) {
          // 拿到的是网页而不是 JSON：多半是 data 文件没上传、路径不对或被托管端兜底成了 404 页
          var url = new URL(DATA_URL, location.href).href;
          var hints = [];
          if (location.protocol !== 'file:' && !/\/(?:[?#].*)?$/.test(location.pathname) && !/\.\w+$/.test(location.pathname)) {
            hints.push('访问地址请带上末尾的 <code>/</code>（例如 <code>…/appstore/</code>），否则页面里的相对路径会指错位置');
          }
          hints.push('请确认 <code>data/software.json</code> 和 <code>data/details.json</code> 已上传到与本页面（index.html）相同的目录');
          throw Object.assign(new Error('not-json'), {
            friendly: '服务器对 <code>' + esc(url) + '</code> 返回的是网页而不是 JSON。<br>' + hints.join('<br>')
          });
        }
        state.apps = (Array.isArray(json.apps) ? json.apps : []).filter(function (a) {
          return !HIDDEN_CATEGORIES[a.category];
        });
        $('#skeleton').hidden = true;
        renderChips();
        render();
        var openId = routeAppId();
        if (openId) openDetail(openId, false);
        // 首屏出来后再偷偷把详情数据取回来
        prefetchDetails();
      })
      .catch(function (err) {
        $('#skeleton').hidden = true;
        $('#error').hidden = false;
        var msg;
        if (location.protocol === 'file:') {
          msg = '当前是通过 file:// 直接打开的页面，浏览器拦截了本地数据请求。请在项目目录运行 <code>python -m http.server 8000</code> 后访问 http://localhost:8000';
        } else if (err.friendly) {
          msg = err.friendly;
        } else if (err.status === 404) {
          msg = '找不到 <code>' + esc(new URL(DATA_URL, location.href).href) + '</code>（404）。请确认 <code>data/</code> 目录已上传到与 index.html 相同的位置。';
        } else {
          msg = '加载 data/software.json 失败（' + esc(err.message) + '），请稍后重试。';
        }
        $('#errorMsg').innerHTML = msg;
      });
  }

  function ensureDetails() {
    if (state.detailsPromise) return state.detailsPromise;
    state.detailsPromise = fetch(DETAILS_URL)
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (json) { state.details = json || {}; return state.details; })
      .catch(function () { state.details = {}; return state.details; });
    return state.detailsPromise;
  }

  // 首屏渲染完成后空闲时预取详情数据：第一次点开软件就不会再等一个大 JSON
  function prefetchDetails() {
    var run = function () { ensureDetails(); };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 2200 });
    } else {
      setTimeout(run, 1200);
    }
  }

  function findApp(id) {
    for (var i = 0; i < state.apps.length; i++) {
      if (String(state.apps[i].id) === String(id)) return state.apps[i];
    }
    return null;
  }

  /* ------------------------------------------------------------- 筛选 */

  function computeList() {
    var kw = state.q.trim().toLowerCase();
    var words = kw ? kw.split(/\s+/) : [];
    var list = state.apps.filter(function (a) {
      if (state.cat !== '全部' && a.category !== state.cat) return false;
      if (!words.length) return true;
      var hay = (a.name + ' ' + (a.brief || '') + ' ' + (a.category || '') +
        ' ' + (a.corp || '') + ' ' + (a.version || '')).toLowerCase();
      for (var i = 0; i < words.length; i++) {
        if (hay.indexOf(words[i]) === -1) return false;
      }
      return true;
    });
    list.sort(function (a, b) { return (a.rank || 9e5) - (b.rank || 9e5); });
    state.list = list;
    state.shown = PAGE_SIZE;
    return list;
  }

  /* ------------------------------------------------------------- 渲染 */

  function catCount(cat) {
    var kw = state.q.trim().toLowerCase();
    var words = kw ? kw.split(/\s+/) : [];
    return state.apps.filter(function (a) {
      if (cat !== '全部' && a.category !== cat) return false;
      if (!words.length) return true;
      var hay = (a.name + ' ' + (a.brief || '') + ' ' + (a.category || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    }).length;
  }

  function renderChips() {
    var counts = {};
    state.apps.forEach(function (a) {
      if (a.category) counts[a.category] = (counts[a.category] || 0) + 1;
    });
    var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var box = $('#catChips');

    // 首次构建后只切换选中态：避免每次输入都重建 DOM、重播入场动画
    if (!chipsBuilt || box.children.length !== cats.length + 1) {
      var html = '<button type="button" data-cat="全部" style="--i:0" class="' + (state.cat === '全部' ? 'on' : '') + '">全部</button>';
      cats.forEach(function (c, i) {
        html += '<button type="button" data-cat="' + esc(c) + '" style="--i:' + (i + 1) + '" class="' +
          (state.cat === c ? 'on' : '') + '">' + esc(c) + '</button>';
      });
      box.innerHTML = html;
      chipsBuilt = true;
      return;
    }
    for (var j = 0; j < box.children.length; j++) {
      var b = box.children[j];
      b.classList.toggle('on', b.getAttribute('data-cat') === state.cat);
    }
  }

  function cardHTML(a, i) {
    var meta = [];
    if (a.score) meta.push('<b>' + esc(a.score) + '分</b>');
    if (a.size) meta.push(esc(a.size));
    return '<article class="card" data-open="' + esc(a.id) + '" tabindex="0" role="button" ' +
      'style="--i:' + (i || 0) + '" aria-label="' + esc(a.name) + '">' +
      '<div class="card__head">' + iconHTML(a, 'card') +
      '<div class="card__id"><div class="card__name">' + esc(a.name) + '</div>' +
      '<div class="card__cat">' + esc(a.category || 'Windows 软件') + '</div></div></div>' +
      '<p class="card__brief">' + esc(a.brief || '') + '</p>' +
      '<div class="card__foot"><span class="card__meta">' + meta.join(' · ') + '</span>' +
      (a.downloadUrl
        ? '<button class="btn-get" type="button" data-dl="' + esc(a.id) + '">下载</button>'
        : '<button class="btn-get" type="button" disabled>暂缺</button>') +
      '</div></article>';
  }

  // mode: 'in'（逐张错峰入场） | 'soft'（只淡入，用于搜索时的整批替换）
  function render(mode) {
    var list = computeList();
    var grid = $('#grid');

    if (!list.length) {
      grid.hidden = true;
      $('#meta').hidden = true;
      $('#moreWrap').hidden = true;
      $('#empty').hidden = false;
      return;
    }
    $('#empty').hidden = true;

    grid.hidden = false;
    grid.classList.toggle('is-soft', mode === 'soft');
    grid.innerHTML = list.slice(0, PAGE_SIZE).map(cardHTML).join('');

    var m = $('#meta');
    m.hidden = false;
    var num = '<b class="meta-num">0</b>';
    $('#metaCount').innerHTML = state.q
      ? '「' + esc(state.q) + '」的搜索结果 · ' + num + ' 款'
      : (state.cat === '全部' ? '共 ' + num + ' 款软件' : esc(state.cat) + ' · ' + num + ' 款');
    animateNum($('#metaCount .meta-num'), list.length);

    updateMore();
  }

  function updateMore() {
    var wrap = $('#moreWrap');
    var left = state.list.length - state.shown;
    if (left > 0) {
      wrap.hidden = false;
      $('#moreBtn').textContent = '加载更多（还剩 ' + left + ' 款）';
    } else {
      wrap.hidden = true;
    }
  }

  /* ------------------------------------------------------------- 详情 */

  function routeAppId() {
    var m = location.hash.match(/^#\/app\/(\d+)/);
    return m ? m[1] : null;
  }

  function openDetail(id, push) {
    var app = findApp(id);
    if (!app) {
      toast('没有找到这款软件');
      if (routeAppId()) history.replaceState({}, '', location.pathname + location.search);
      return;
    }

    if (push !== false && routeAppId() !== String(id)) {
      history.pushState({ app: String(id) }, '', '#/app/' + id);
    }

    var sheet = $('#sheet');
    clearTimeout(closeTimer);
    sheet.classList.remove('is-closing');

    if (sheet.hidden) lastFocus = document.activeElement;
    state.openId = String(id);

    // 数据已在手里就直接一次画完；否则先用索引数据把"壳"画出来（图标 / 名称 / 下载按钮立刻可见）
    // 清掉 appId 是为了让 renderSheet 走整块重绘：滚动位置、上一款的残留状态都会重置
    var cached = state.details && state.details[String(id)];
    $('#sheetBody').dataset.appId = '';
    renderSheet(app, cached || null);
    sheet.hidden = false;
    document.documentElement.classList.add('no-scroll');

    requestAnimationFrame(function () {
      var panel = $('#sheetPanel');
      var body = $('#sheetBody');
      // 面板在隐藏状态下设置 scrollTop 是无效的（没有布局），所以显示出来的这一帧再回顶
      body.scrollTop = 0;
      if (panel && panel.focus) panel.focus({ preventScroll: true });
      syncSheetFade();
    });

    if (cached) return;

    ensureDetails().then(function (det) {
      if (state.openId !== String(id)) return;
      renderSheet(app, det[String(id)] || {});
      requestAnimationFrame(syncSheetFade);
    });
  }

  function syncSheetFade() {
    var body = $('#sheetBody');
    var panel = $('#sheetPanel');
    if (!body || !panel) return;
    // 滚动后才出现顶部蒙层，让内容从关闭按钮下方「淡出」，静止时不遮住图标
    panel.classList.toggle('is-scrolled', body.scrollTop > 8);
    panel.classList.toggle('is-more', body.scrollHeight - body.scrollTop - body.clientHeight > 28);
  }

  // d 传 null 表示详情数据还没到
  function renderSheet(app, d) {
    var body = $('#sheetBody');
    var id = String(app.id);

    if (d && body.dataset.appId === id && $('#dtExtra')) {
      // 只替换信息格 + 附加内容，不整块重绘，保住已经播完的入场动画
      state.shots = Array.isArray(d.screenshots) ? d.screenshots : [];
      var info = $('#dtInfo');
      if (info) info.innerHTML = infoHTML(app, d);
      var extra = $('#dtExtra');
      if (extra) {
        extra.innerHTML = extraHTML(app, d);
        extra.classList.add('dt-fresh');
      }
      syncSheetFade();
      return;
    }

    body.dataset.appId = id;
    body.innerHTML = detailHTML(app, d || {});
    state.shots = (d && Array.isArray(d.screenshots)) ? d.screenshots : [];
    body.scrollTop = 0;
    syncSheetFade();
  }

  function infoHTML(a, d) {
    var cat = a.category || (d && d.subCategory) || 'Windows 软件';
    function cell(t, v) {
      return '<div><dt>' + t + '</dt><dd>' + (v || '—') + '</dd></div>';
    }
    var html = cell('分类', esc(cat));
    html += cell('版本', esc(a.version));
    html += cell('大小', esc(a.size || (d && d.sizeBytes ? (d.sizeBytes / 1048576).toFixed(1) + ' MB' : '')));
    html += cell('更新时间', esc(a.updated));
    if (d && d.corp) html += cell('厂商', esc(d.corp));
    if (d && d.fileName) html += cell('安装包', esc(d.fileName));
    return html;
  }

  function extraHTML(a, d) {
    // 详情还在路上：先摆几条骨架线，避免面板里出现一大片空白
    if (!d) {
      return '<div class="dt-pending" aria-hidden="true">' +
        '<span class="dt-pending__bar"></span>' +
        '<span class="dt-pending__shot"></span>' +
        '<span class="dt-pending__bar"></span>' +
        '<span class="dt-pending__bar dt-pending__bar--short"></span></div>';
    }
    var shots = '';
    if (Array.isArray(d.screenshots) && d.screenshots.length) {
      shots = '<section class="dt-sec"><h3>应用截图<small>共 ' + d.screenshots.length + ' 张 · 点击放大</small></h3>' +
        '<div class="dt-shots">' +
        d.screenshots.map(function (s, i) {
          return '<img src="' + esc(httpsUrl(s)) + '" alt="' + esc(a.name) + ' 截图 ' + (i + 1) + '" loading="lazy" decoding="async" ' +
            'data-shot="' + i + '" style="--i:' + i + '" onerror="this.remove()">';
        }).join('') + '</div></section>';
    }
    return shots +
      (d.description ? '<section class="dt-sec"><h3>软件简介</h3><p>' + esc(d.description) + '</p></section>' : '') +
      (d.updateNote ? '<section class="dt-sec"><h3>更新说明</h3><p>' + esc(d.updateNote) + '</p></section>' : '');
  }

  function detailHTML(a, d) {
    var cat = a.category || (d && d.subCategory) || 'Windows 软件';
    var tags = '';
    if (a.score) tags += '<span class="hl">评分 ' + esc(a.score) + '</span>';
    tags += '<span>' + esc(cat) + '</span>';

    return '<div class="dt-head">' + iconHTML(a, 'dt') +
      '<div class="dt-title"><h2>' + esc(a.name) + '</h2>' +
      (d && d.corp ? '<div class="dt-corp">' + esc(d.corp) + '</div>' : '') +
      '<div class="dt-tags">' + tags + '</div></div></div>' +

      '<div class="dt-actions">' +
      (a.downloadUrl
        ? '<a class="btn-primary" href="' + esc(a.downloadUrl) + '" download rel="noopener">下载</a>'
        : '<button class="btn-primary" disabled>下载链接暂缺</button>') +
      '<button class="btn-ghost btn-share" type="button" data-copy="1">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7L12.7 18"/></svg>' +
      '复制链接</button>' +
      '</div>' +
      (a.downloadUrl
        ? '<p class="dt-dl">点击「下载」获取完整离线安装包（来源：360 软件宝库分发渠道），下载完成后双击安装包手动完成安装。</p>'
        : '<p class="dt-dl">该软件的安装包暂不可用，请稍后再试。</p>') +

      '<dl class="dt-info" id="dtInfo">' + infoHTML(a, d) + '</dl>' +
      '<div id="dtExtra">' + extraHTML(a, d) + '</div>';
  }

  function closeDetail() {
    if (!state.openId) return;
    state.openId = null;
    var sheet = $('#sheet');
    closeLightbox();
    document.documentElement.classList.remove('no-scroll');
    // 用 replace 而不是 push：否则关掉详情后再按浏览器后退会重新弹出详情
    if (routeAppId()) history.replaceState({}, '', location.pathname + location.search);

    // 焦点还给刚才点开详情的那张卡片
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }
    lastFocus = null;

    // 反向播放退场动画，播完再真正隐藏
    if (reduceMotion()) {
      sheet.hidden = true;
      return;
    }
    sheet.classList.add('is-closing');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () {
      sheet.hidden = true;
      sheet.classList.remove('is-closing');
    }, 230);
  }

  function trapFocus(e) {
    var panel = $('#sheetPanel');
    if (!panel) return;
    var items = panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    var active = document.activeElement;
    if (!panel.contains(active)) {
      e.preventDefault();
      first.focus();
      return;
    }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  function copyDetailLink() {
    var url = location.origin + location.pathname + location.search + '#/app/' + state.openId;
    var ok = function () { toast('详情链接已复制'); };
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        ok();
      } catch (err) {
        toast('复制失败，请直接复制地址栏链接');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(ok, fallback);
    } else {
      fallback();
    }
  }

  /* ------------------------------------------------------------- 截图灯箱 */

  function openLightbox(i) {
    var shots = state.shots || [];
    if (!shots.length) return;
    lb.index = (i + shots.length) % shots.length;
    var box = $('#lightbox');
    clearTimeout(lb.timer);
    box.classList.remove('is-closing');
    box.hidden = false;
    lb.open = true;
    showShot(0);
    setTimeout(function () {
      var c = $('#lbClose');
      if (c) c.focus({ preventScroll: true });
    }, 60);
  }

  function showShot(dir) {
    var shots = state.shots || [];
    if (!shots.length) return;
    var img = $('#lbImg');
    var stage = $('#lbStage');

    var reveal = function () {
      img.onload = img.onerror = null;
      img.classList.remove('is-loading');
      stage.classList.remove('is-loading');
      stage.classList.remove('is-error');
      img.classList.remove('sw', 'dir-next', 'dir-prev');
      void img.offsetWidth;   // 强制重排，让滑动动画重新播放
      if (dir) img.classList.add('sw', dir > 0 ? 'dir-next' : 'dir-prev');
    };

    // 图挂了也要给个交代，不能留一块空舞台
    var fail = function () {
      img.onload = img.onerror = null;
      img.classList.remove('is-loading');
      stage.classList.remove('is-loading');
      stage.classList.add('is-error');
    };

    // 换图时先压暗，解码完再亮起来，避免旧图「啪」地消失
    img.classList.add('is-loading');
    stage.classList.add('is-loading');
    img.onload = reveal;
    img.onerror = fail;
    img.src = httpsUrl(shots[lb.index]);
    if (img.complete && img.naturalWidth) reveal();   // 命中缓存时 load 可能不触发

    img.alt = '截图 ' + (lb.index + 1);
    $('#lbCount').textContent = (lb.index + 1) + ' / ' + shots.length;

    var multi = shots.length > 1;
    $('#lbPrev').disabled = !multi;
    $('#lbNext').disabled = !multi;

    // 预取相邻两张：左右翻页基本是瞬时的
    if (multi) {
      [1, -1].forEach(function (k) {
        var pre = new Image();
        pre.src = httpsUrl(shots[(lb.index + k + shots.length) % shots.length]);
      });
    }
  }

  function stepShot(delta) {
    var n = (state.shots || []).length;
    if (n < 2) return;
    lb.index = (lb.index + delta + n) % n;
    showShot(delta);
  }

  function closeLightbox() {
    if (!lb.open) return;
    lb.open = false;
    var box = $('#lightbox');
    if (reduceMotion()) { box.hidden = true; return; }
    box.classList.add('is-closing');
    clearTimeout(lb.timer);
    lb.timer = setTimeout(function () {
      box.hidden = true;
      box.classList.remove('is-closing');
    }, 200);
  }

  /* ------------------------------------------------------------- 事件 */

  function bindEvents() {
    var search = $('#searchInput');

    var deb;
    search.addEventListener('input', function () {
      clearTimeout(deb);
      deb = setTimeout(function () {
        state.q = search.value;
        $('#searchClear').hidden = !state.q;
        renderChips();
        render('soft');
      }, 180);
    });

    $('#searchClear').addEventListener('click', function () {
      search.value = '';
      state.q = '';
      $('#searchClear').hidden = true;
      renderChips();
      render('in');
      search.focus();
    });

    $('#catChips').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      state.cat = btn.dataset.cat;
      renderChips();
      render('in');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#moreBtn').addEventListener('click', function () {
      var next = state.list.slice(state.shown, state.shown + PAGE_SIZE);
      $('#grid').insertAdjacentHTML('beforeend', next.map(function (a, i) { return cardHTML(a, i); }).join(''));
      state.shown += PAGE_SIZE;
      updateMore();
    });

    document.addEventListener('click', function (e) {
      // 复制分享链接
      var cp = e.target.closest('[data-copy]');
      if (cp) {
        e.preventDefault();
        copyDetailLink();
        return;
      }
      // 截图 → 放大查看
      var shot = e.target.closest('[data-shot]');
      if (shot) {
        e.preventDefault();
        openLightbox(parseInt(shot.getAttribute('data-shot'), 10) || 0);
        return;
      }
      var dl = e.target.closest('[data-dl]');
      if (dl) {
        e.stopPropagation();
        var app = null;
        for (var i = 0; i < state.apps.length; i++) {
          if (String(state.apps[i].id) === String(dl.dataset.dl)) { app = state.apps[i]; break; }
        }
        if (app && app.downloadUrl) {
          // 用临时 <a download> 触发，比 window.open 更不容易被拦截，也不会留空白标签页
          var a = document.createElement('a');
          a.href = app.downloadUrl;
          a.download = '';
          a.target = '_blank';
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast('已开始下载「' + app.name + '」');
        } else {
          toast('下载链接暂不可用');
        }
        return;
      }
      var card = e.target.closest('[data-open]');
      if (card) openDetail(card.dataset.open, true);
    });

    document.addEventListener('keydown', function (e) {
      // 灯箱打开时优先接管键盘
      if (lb.open) {
        if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); stepShot(-1); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); stepShot(1); return; }
      }
      // 详情弹层打开时，Tab 只在面板内循环
      if (e.key === 'Tab' && !$('#sheet').hidden) {
        trapFocus(e);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        // 焦点在按钮/链接上时交给它们自己的默认行为，避免「下载」同时打开详情
        if (e.target.closest && e.target.closest('button, a, input, textarea')) return;
        var card = e.target.closest && e.target.closest('[data-open]');
        if (card) {
          e.preventDefault();
          openDetail(card.dataset.open, true);
        }
      }
      if (e.key === 'Escape') {
        if (!$('#sheet').hidden) closeDetail();
        else if (document.activeElement === search) {
          search.value = ''; state.q = '';
          $('#searchClear').hidden = true;
          renderChips(); render('in');
        }
      }
      if (e.key === '/' && document.activeElement !== search && $('#sheet').hidden) {
        e.preventDefault();
        search.focus();
      }
    });

    // 详情面板滚动：顶部蒙层 / 底部渐隐随滚动出现
    var sheetBody = $('#sheetBody');
    sheetBody.addEventListener('scroll', syncSheetFade, { passive: true });
    window.addEventListener('resize', function () {
      if (!$('#sheet').hidden) syncSheetFade();
    }, { passive: true });

    $('#sheetMask').addEventListener('click', closeDetail);
    $('#sheetClose').addEventListener('click', closeDetail);

    // 灯箱
    $('#lbPrev').addEventListener('click', function () { stepShot(-1); });
    $('#lbNext').addEventListener('click', function () { stepShot(1); });
    $('#lbClose').addEventListener('click', closeLightbox);
    $('.lb__mask').addEventListener('click', closeLightbox);
    // 灯箱里左右滑动关闭 / 切换（移动端）
    (function () {
      var sx = 0, sy = 0;
      var stage = $('.lb');
      stage.addEventListener('touchstart', function (e) {
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      }, { passive: true });
      stage.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - sx;
        var dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy)) return;
        stepShot(dx < 0 ? 1 : -1);
      }, { passive: true });
    })();

    // 回到顶部
    $('#toTop').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    });

    // 点击波纹（所有胶囊按钮）
    document.addEventListener('pointerdown', function (e) {
      if (reduceMotion()) return;
      var el = e.target.closest &&
        e.target.closest('.btn-get, .btn-more, .btn-primary, .btn-ghost, .chips button, .to-top, .lb__nav, .lb__close, .sheet__close');
      if (!el || el.disabled) return;
      var r = el.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 2.2;
      var s = document.createElement('span');
      s.className = 'ripple';
      s.style.width = s.style.height = size + 'px';
      s.style.left = (e.clientX - r.left - size / 2) + 'px';
      s.style.top = (e.clientY - r.top - size / 2) + 'px';
      el.appendChild(s);
      setTimeout(function () { s.remove(); }, 660);
    });

    $('#emptyReset').addEventListener('click', function () {
      search.value = ''; state.q = ''; state.cat = '全部';
      $('#searchClear').hidden = true;
      renderChips(); render('in');
    });
    $('#retryBtn').addEventListener('click', loadData);

    window.addEventListener('popstate', function () {
      var id = routeAppId();
      if (id) openDetail(id, false);
      else closeDetail();
    });

    // 鼠标追光：进入卡片点亮，离开时淡灭（--lit 已注册，可被过渡）
    var litCard = null;
    document.addEventListener('mousemove', function (e) {
      var card = e.target.closest && e.target.closest('.card');
      if (litCard && litCard !== card) litCard.style.setProperty('--lit', 0);
      litCard = card || null;
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      card.style.setProperty('--lit', 1);
    });
    document.addEventListener('mouseleave', function () {
      if (litCard) { litCard.style.setProperty('--lit', 0); litCard = null; }
    });

    // 顶部氛围光跟随指针轻微偏移（主站 hero 光斑同款）
    if (!reduceMotion()) {
      var px = 0, py = 0, raf = 0;
      document.addEventListener('mousemove', function (e) {
        px = (e.clientX / window.innerWidth - .5) * 2;
        py = (e.clientY / window.innerHeight - .5) * 2;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          document.body.style.setProperty('--gx', px.toFixed(3));
          document.body.style.setProperty('--gy', py.toFixed(3));
        });
      }, { passive: true });
    }

    // 滚动：导航收紧 + 顶部进度条 + 回到顶部按钮
    var nav = $('.nav');
    var bar = $('#progress').firstElementChild;
    var toTop = $('#toTop');
    function onScroll() {
      var y = window.scrollY || document.documentElement.scrollTop;
      nav.classList.toggle('is-scrolled', y > 12);
      toTop.classList.toggle('show', y > 560);

      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--p', max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------- 滚动显现 */

  function setupReveal() {
    var els = [].slice.call(document.querySelectorAll('.rv-block'));
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || reduceMotion()) {
      els.forEach(function (el) { el.classList.add('rv-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('rv-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------- 启动 */

  var qs = new URLSearchParams(location.search);
  if (qs.get('q')) {
    $('#searchInput').value = qs.get('q');
    state.q = qs.get('q');
    $('#searchClear').hidden = false;
  }

  bindEvents();

  // 页脚滚到眼前才浮现
  var foot = $('.foot');
  if (foot) foot.classList.add('rv-block');
  setupReveal();

  loadData();
})();
