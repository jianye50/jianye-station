/* =========================================================
   鉴业阅读 Jianye Reader — 应用逻辑
   （STORAGE_KEY 沿用旧键名 jianread.state.v1，避免清掉用户已有数据）
   状态 / 渲染 / 中英双语 / 订阅管理 / 无障碍
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

  const icon = (name, cls = 'icon') =>
    '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + name + '"></use></svg>';

  const PALETTE = ['#6750A4', '#C8102E', '#1F7A6C', '#F0472A', '#2B6CB0', '#6E8B3D', '#8E4585', '#B4690E'];
  function hashColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 9973;
    return PALETTE[h % PALETTE.length];
  }

  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
  const isCompact = () => window.matchMedia('(max-width: 1180px)').matches;
  const isTouch = () => window.matchMedia('(hover: none)').matches;
  const reduceMotion = () =>
    S.ui.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 双语字典 ---------------- */
  const I18N = {
    zh: {
      'app.name': '鉴业阅读',
      'app.tagline': '鉴业的私人阅读空间',
      'skip.link': '跳到文章列表',
      'nav.all': '全部文章',
      'nav.unread': '全部未读',
      'nav.starred': '已加星标',
      'nav.settings': '设置',
      'section.categories': '分组',
      'cat.default': '默认分组',
      'action.addCategory': '新建分组',
      'action.addFeed': '添加订阅源',
      'action.refreshAll': '刷新全部订阅源',
      'action.import': '导入',
      'action.export': '导出',
      'sidebar.hint': '点击订阅源右侧的 ⋯ 按钮，可重命名、移动分组或刷新。',
      'sidebar.emptyCats': '还没有分组，点右上角 + 新建一个。',
      'sidebar.allCategorized': '所有订阅源都已归入分组。',
      'sidebar.noFeeds': '还没有订阅源，点上面按钮添加第一个。',
      'sidebar.catEmpty': '这个分组还没有订阅源',
      'search.placeholder': '搜索标题、作者或摘要',
      'search.aria': '搜索文章',
      'search.clear': '清除搜索',
      'markAll.aria': '将当前列表标为已读（可选期限）',
      'markAll.title': '标为已读',
      'home.archived': '{n} 项已存档',
      'home.unreadCnt': '{n} 项未读',
      'home.starredCnt': '{n} 项已加星标',
      'aria.backHome': '返回首页',
      'aria.hero': '返回全部文章',
      'aria.collapseAll': '折叠 / 展开分组',
      'sheet.moveTo': '移动到分组',
      'sheet.newCat': '新建分组',
      'sheet.actions': '操作',
      'sheet.open': '在浏览器中打开',
      'sheet.clear': '清空文章',
      'sheet.unsub': '取消订阅',
      'toast.feedCleared': '已清空该订阅源的文章',
      'toast.noArticles': '这个订阅源还没有文章',
      'confirm.clearFeedTitle': '清空「{name}」的文章？',
      'confirm.clearFeedDesc': '将移除该订阅源的 {n} 篇文章，订阅源会保留。此操作不可撤销。',
      'confirm.clearFeedOk': '清空',
      'markAll.d7': '7 天前及更早',
      'markAll.d3': '3 天前及更早',
      'markAll.d1': '1 天前及更早',
      'markAll.all': '全部标记为已读',
      'chip.all': '全部',
      'chip.unread': '未读',
      'chip.starred': '已加星标',
      'sort.newest': '最新优先',
      'sort.oldest': '最早优先',
      'date.today': '今天',
      'date.yesterday': '昨天',
      'sort.aria': '切换排序方式',
      'meta.all': '共 {total} 篇 · {unread} 篇未读',
      'meta.search': '搜索到 {total} 篇 · {unread} 篇未读',
      'empty.title': '这里很安静',
      'empty.query': '没有找到匹配「{q}」的文章，试试别的关键词。',
      'empty.feed': '「{name}」还没有文章，可以在订阅源菜单里刷新一下。',
      'empty.generic': '这个筛选下暂时没有文章，换个分组看看？',
      'empty.add': '添加订阅源',
      'reader.back': '返回文章列表',
      'reader.scope': '阅读',
      'reader.star': '为这篇文章加星标',
      'reader.unstar': '取消星标',
      'reader.starTitle': '加星标（S）',
      'reader.mark': '标为已读',
      'reader.unmark': '标为未读',
      'reader.markTitle': '已读 / 未读（M）',
      'reader.fontDec': '减小正文字号',
      'reader.fontInc': '增大正文字号',
      'reader.open': '在浏览器中打开原文',
      'reader.openShort': '打开原文',
      'reader.min': '{n} 分钟',
      'reader.minRead': '{n} 分钟阅读',
      'reader.viewOriginal': '查看原文',
      'reader.starToggle': '加星标',
      'reader.unstarToggle': '取消星标',
      'reader.from': '来自 {name}',
      'ph.title': '选一篇文章开始阅读',
      'ph.textDesktop': '左侧列表里挑一篇感兴趣的内容，或按 / 搜索关键词。',
      'ph.textTouch': '从列表里挑一篇感兴趣的内容开始阅读。',
      'sc.search': '搜索',
      'sc.next': '下一篇 / 上一篇',
      'sc.mark': '标为已读',
      'sc.star': '加星标',
      'sc.all': '全部文章',
      'sc.unread': '只看未读',
      'sc.starred': '只看星标文章',
      'sc.esc': '关闭 / 返回',
      'unknown': '未知来源',
      'untitled': '无标题',
      'readLabel': '已读',
      'dialog.close': '关闭',
      'dialog.cancel': '取消',
      'feed.title': '添加订阅源',
      'feed.sub': '粘贴 RSS / Atom 地址即可订阅。浏览器受同源策略限制时会自动尝试公共代理，若仍失败，订阅源仍会保存，可稍后刷新。',
      'feed.url': '订阅源地址',
      'feed.name': '名称（可选）',
      'feed.namePh': '自动识别',
      'feed.category': '分组',
      'feed.uncatOpt': '默认分组',
      'feed.newCat': '新建分组…',
      'feed.submit': '添加订阅',
      'feed.adding': '添加中…',
      'feed.fetching': '正在获取订阅源…',
      'prompt.save': '保存',
      'prompt.create': '创建',
      'prompt.inputName': '名称',
      'prompt.defaultTitle': '输入',
      'confirm.ok': '确定',
      'settings.title': '设置',
      'settings.done': '完成',
      'settings.lang': '语言',
      'settings.langDesc': '界面显示语言，自动会跟随系统',
      'settings.theme': '主题',
      'settings.themeDesc': '跟随系统或固定明暗',
      'theme.light': '浅色',
      'theme.dark': '深色',
      'theme.system': '系统',
      'settings.font': '正文字号',
      'settings.fontDesc': '仅影响阅读区排版',
      'font.small': '小',
      'font.normal': '标准',
      'font.large': '大',
      'settings.motion': '减少动画',
      'settings.motionDesc': '关闭过渡与入场动画',
      'settings.data': '数据',
      'settings.clear': '清空所有订阅源',
      'settings.shortcuts': '键盘快捷键',
      'lang.auto': '自动',
      'toast.quota': '本地存储空间不足，最近的更改可能不会被保存。',
      'toast.needUrl': '请输入以 http:// 或 https:// 开头的订阅地址',
      'toast.duplicate': '这个订阅源已经在列表里了',
      'toast.added': '已添加「{name}」，抓取到 {n} 篇文章',
      'toast.savedNoFetch': '订阅源已保存，但没能抓取文章：浏览器跨域限制可能阻止了请求，可稍后刷新。',
      'toast.refreshing': '正在刷新「{name}」…',
      'toast.refreshAllStart': '正在刷新全部订阅源…',
      'toast.refreshFail': '刷新失败：可能是浏览器跨域限制或网络问题。',
      'toast.fetched': '已获取 {n} 篇新文章',
      'toast.upToDate': '已经是最新内容了',
      'toast.imported': '已导入 {n} 个订阅源{skip}',
      'toast.importSkipped': '，跳过 {n} 个重复项',
      'toast.importProgress': '正在抓取订阅源 {done}/{total}…',
      'toast.badOpml': '无法解析这个文件，请使用本应用导出的 JSON 备份或标准 OPML 文件。',
      'toast.readFail': '读取文件失败',
      'toast.exported': '已导出 {n} 个订阅源',
      'toast.catCreated': '已创建分组「{name}」',
      'toast.catExists': '已经有同名分组了',
      'toast.catRenamed': '分组已重命名',
      'toast.catDeleted': '分组已删除',
      'toast.feedRenamed': '订阅源已重命名',
      'toast.movedTo': '已移动到「{name}」',
      'toast.movedUncat': '已移到「默认分组」',
      'toast.feedDeleted': '已删除订阅源',
      'toast.starred': '已加星标',
      'toast.unstarred': '已取消星标',
      'toast.read': '已标为已读',
      'toast.unread': '已标为未读',
      'toast.noneUnread': '当前列表没有未读文章',
      'toast.markedAll': '已将 {n} 篇文章标为已读',
      'toast.themeSystem': '主题将跟随系统设置',
      'toast.langAuto': '语言将跟随系统设置',
      'toast.nothingToDelete': '还没有订阅源可清空',
      'toast.clearedAll': '已清空所有订阅源',
      'menu.rename': '重命名',
      'menu.move': '移动到分组…',
      'menu.refresh': '刷新文章',
      'menu.delete': '删除订阅源',
      'menu.renameCat': '重命名分组',
      'menu.addFeedToCat': '添加订阅源到此分组',
      'menu.deleteCat': '删除分组',
      'menu.current': '当前',
      'aria.sidebar': '订阅源导航',
      'aria.filterNav': '文章筛选',
      'aria.listPane': '文章列表',
      'aria.reader': '文章阅读区',
      'aria.mainNav': '主要导航',
      'aria.openNav': '打开订阅源导航',
      'aria.quickFilter': '快速筛选',
      'aria.articleList': '文章',
      'aria.moreFeed': '{name} 的更多操作',
      'aria.moreCat': '{name} 分组操作',
      'aria.collapse': '收起{name}',
      'aria.expand': '展开{name}',
      'ask.renameFeed': '重命名订阅源',
      'ask.newCat': '新建分组',
      'ask.newCatDesc': '给订阅源分个组，比如「科技」「设计」「播客」。',
      'ask.renameCat': '重命名分组',
      'confirm.delCatTitle': '删除分组「{name}」？',
      'confirm.delCatDescFeeds': '分组下的 {n} 个订阅源会移到「默认分组」，文章和已读状态都会保留。',
      'confirm.delCatDescEmpty': '这个分组下没有订阅源，删除后不可恢复。',
      'confirm.delCatOk': '删除分组',
      'confirm.delFeedTitle': '删除订阅源「{name}」？',
      'confirm.delFeedDesc': '同时会移除 {n} 篇已缓存的文章，此操作不可撤销。',
      'confirm.delFeedOk': '删除订阅源',
      'confirm.clearTitle': '清空所有订阅源？',
      'confirm.clearDesc': '将删除全部 {feeds} 个订阅源和 {articles} 篇文章，分组会保留。此操作不可撤销。',
      'confirm.clearOk': '全部清空',
      'opml.title': '{name} 订阅源',
      'sort.descToast': '按发布时间从新到旧',
      'sort.ascToast': '按发布时间从旧到新'
    },
    en: {
      'app.name': 'Jianye Reader',
      'app.tagline': "Jianye's reading space",
      'skip.link': 'Skip to article list',
      'nav.all': 'All articles',
      'nav.unread': 'All unread',
      'nav.starred': 'Starred',
      'nav.settings': 'Settings',
      'section.categories': 'Groups',
      'cat.default': 'Default group',
      'action.addCategory': 'New group',
      'action.addFeed': 'Add feed',
      'action.refreshAll': 'Refresh all feeds',
      'action.import': 'Import',
      'action.export': 'Export',
      'sidebar.hint': 'Tap the ⋯ button next to a feed to rename it, move it between groups or refresh it.',
      'sidebar.emptyCats': 'No groups yet. Tap + above to create one.',
      'sidebar.allCategorized': 'All feeds are in a group.',
      'sidebar.noFeeds': 'No feeds yet. Tap the button above to add your first one.',
      'sidebar.catEmpty': 'No feeds in this group yet',
      'search.placeholder': 'Search titles, authors or excerpts',
      'search.aria': 'Search articles',
      'search.clear': 'Clear search',
      'markAll.aria': 'Mark as read (choose a period)',
      'markAll.title': 'Mark as read',
      'home.archived': '{n} archived',
      'home.unreadCnt': '{n} unread',
      'home.starredCnt': '{n} starred',
      'aria.backHome': 'Back to home',
      'aria.hero': 'Back to all articles',
      'aria.collapseAll': 'Collapse / expand groups',
      'sheet.moveTo': 'Move to group',
      'sheet.newCat': 'New group',
      'sheet.actions': 'Actions',
      'sheet.open': 'Open in browser',
      'sheet.clear': 'Clear articles',
      'sheet.unsub': 'Unsubscribe',
      'toast.feedCleared': 'Feed articles cleared',
      'toast.noArticles': 'This feed has no articles yet',
      'confirm.clearFeedTitle': 'Clear articles of "{name}"?',
      'confirm.clearFeedDesc': 'This removes {n} articles from this feed. The feed is kept. This cannot be undone.',
      'confirm.clearFeedOk': 'Clear',
      'markAll.d7': '7 days and older',
      'markAll.d3': '3 days and older',
      'markAll.d1': '1 day and older',
      'markAll.all': 'Mark all as read',
      'chip.all': 'All',
      'chip.unread': 'Unread',
      'chip.starred': 'Starred',
      'sort.newest': 'Newest first',
      'sort.oldest': 'Oldest first',
      'date.today': 'Today',
      'date.yesterday': 'Yesterday',
      'sort.aria': 'Toggle sort order',
      'meta.all': '{total} articles · {unread} unread',
      'meta.search': '{total} results · {unread} unread',
      'empty.title': 'All quiet here',
      'empty.query': 'No articles match "{q}". Try another keyword.',
      'empty.feed': '"{name}" has no articles yet. Try refreshing it from its menu.',
      'empty.generic': 'Nothing under this filter. Try another view?',
      'empty.add': 'Add a feed',
      'reader.back': 'Back to the article list',
      'reader.scope': 'Reading',
      'reader.star': 'Star this article',
      'reader.unstar': 'Remove star',
      'reader.starTitle': 'Star (S)',
      'reader.mark': 'Mark as read',
      'reader.unmark': 'Mark as unread',
      'reader.markTitle': 'Read / unread (M)',
      'reader.fontDec': 'Smaller text',
      'reader.fontInc': 'Larger text',
      'reader.open': 'Open the original in browser',
      'reader.openShort': 'Open original',
      'reader.min': '{n} min',
      'reader.minRead': '{n} min read',
      'reader.viewOriginal': 'View original',
      'reader.starToggle': 'Star this',
      'reader.unstarToggle': 'Unstar',
      'reader.from': 'From {name}',
      'ph.title': 'Pick an article to start reading',
      'ph.textDesktop': 'Choose something from the list, or press / to search.',
      'ph.textTouch': 'Pick an article from the list to start reading.',
      'sc.search': 'Search',
      'sc.next': 'Next / previous',
      'sc.mark': 'Mark as read',
      'sc.star': 'Star',
      'sc.all': 'All articles',
      'sc.unread': 'Unread only',
      'sc.starred': 'Starred only',
      'sc.esc': 'Close / back',
      'unknown': 'Unknown source',
      'untitled': 'Untitled',
      'readLabel': 'Read',
      'dialog.close': 'Close',
      'dialog.cancel': 'Cancel',
      'feed.title': 'Add a feed',
      'feed.sub': 'Paste an RSS / Atom URL to subscribe. A public CORS proxy is tried automatically; if it fails, the feed is still saved and you can refresh it later.',
      'feed.url': 'Feed URL',
      'feed.name': 'Name (optional)',
      'feed.namePh': 'Auto detect',
      'feed.category': 'Group',
      'feed.uncatOpt': 'Default group',
      'feed.newCat': 'New group…',
      'feed.submit': 'Add feed',
      'feed.adding': 'Adding…',
      'feed.fetching': 'Fetching the feed…',
      'prompt.save': 'Save',
      'prompt.create': 'Create',
      'prompt.inputName': 'Name',
      'prompt.defaultTitle': 'Input',
      'confirm.ok': 'OK',
      'settings.title': 'Settings',
      'settings.done': 'Done',
      'settings.lang': 'Language',
      'settings.langDesc': 'Interface language. Auto follows the system.',
      'settings.theme': 'Theme',
      'settings.themeDesc': 'Follow the system or pick one',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'theme.system': 'Auto',
      'settings.font': 'Text size',
      'settings.fontDesc': 'Reading pane only',
      'font.small': 'Small',
      'font.normal': 'Default',
      'font.large': 'Large',
      'settings.motion': 'Reduce motion',
      'settings.motionDesc': 'Turn off transitions and entrances',
      'settings.data': 'Data',
      'settings.clear': 'Clear all feeds',
      'settings.shortcuts': 'Keyboard shortcuts',
      'lang.auto': 'Auto',
      'toast.quota': 'Local storage is full; recent changes may not be saved.',
      'toast.needUrl': 'Enter a URL starting with http:// or https://',
      'toast.duplicate': 'This feed is already in your list',
      'toast.added': 'Added "{name}" with {n} articles',
      'toast.savedNoFetch': 'Feed saved, but its articles could not be fetched (browser CORS limits). Try refreshing later.',
      'toast.refreshing': 'Refreshing "{name}"…',
      'toast.refreshAllStart': 'Refreshing all feeds…',
      'toast.refreshFail': 'Refresh failed: CORS limits or a network issue.',
      'toast.fetched': 'Fetched {n} new articles',
      'toast.upToDate': 'Already up to date',
      'toast.imported': 'Imported {n} feeds{skip}',
      'toast.importSkipped': ', skipped {n} duplicates',
      'toast.importProgress': 'Fetching feeds {done}/{total}…',
      'toast.badOpml': 'Could not parse this file. Use a JSON backup exported by this app or a standard OPML file.',
      'toast.readFail': 'Failed to read the file',
      'toast.exported': 'Exported {n} feeds',
      'toast.catCreated': 'Created group "{name}"',
      'toast.catExists': 'A group with this name already exists',
      'toast.catRenamed': 'Group renamed',
      'toast.catDeleted': 'Group deleted',
      'toast.feedRenamed': 'Feed renamed',
      'toast.movedTo': 'Moved to "{name}"',
      'toast.movedUncat': 'Moved to "Default group"',
      'toast.feedDeleted': 'Feed deleted',
      'toast.starred': 'Added to starred',
      'toast.unstarred': 'Removed from starred',
      'toast.read': 'Marked as read',
      'toast.unread': 'Marked as unread',
      'toast.noneUnread': 'No unread articles here',
      'toast.markedAll': 'Marked {n} articles as read',
      'toast.themeSystem': 'Theme now follows the system',
      'toast.langAuto': 'Language now follows the system',
      'toast.nothingToDelete': 'No feeds to clear yet',
      'toast.clearedAll': 'All feeds cleared',
      'menu.rename': 'Rename',
      'menu.move': 'Move to group…',
      'menu.refresh': 'Refresh articles',
      'menu.delete': 'Delete feed',
      'menu.renameCat': 'Rename group',
      'menu.addFeedToCat': 'Add a feed to this group',
      'menu.deleteCat': 'Delete group',
      'menu.current': 'current',
      'aria.sidebar': 'Feeds navigation',
      'aria.filterNav': 'Article filters',
      'aria.listPane': 'Article list',
      'aria.reader': 'Reading pane',
      'aria.mainNav': 'Main navigation',
      'aria.openNav': 'Open feeds navigation',
      'aria.quickFilter': 'Quick filters',
      'aria.articleList': 'Articles',
      'aria.moreFeed': 'More options for {name}',
      'aria.moreCat': '{name} group options',
      'aria.collapse': 'Collapse {name}',
      'aria.expand': 'Expand {name}',
      'ask.renameFeed': 'Rename feed',
      'ask.newCat': 'New group',
      'ask.newCatDesc': 'Organize feeds into groups, e.g. Tech, Design, Podcasts.',
      'ask.renameCat': 'Rename group',
      'confirm.delCatTitle': 'Delete group "{name}"?',
      'confirm.delCatDescFeeds': '{n} feeds in this group will move to the "Default group". Articles and read state are kept.',
      'confirm.delCatDescEmpty': 'This group has no feeds. This cannot be undone.',
      'confirm.delCatOk': 'Delete group',
      'confirm.delFeedTitle': 'Delete feed "{name}"?',
      'confirm.delFeedDesc': '{n} cached articles will be removed too. This cannot be undone.',
      'confirm.delFeedOk': 'Delete feed',
      'confirm.clearTitle': 'Clear all feeds?',
      'confirm.clearDesc': 'This deletes all {feeds} feeds and their {articles} articles. Groups are kept. This cannot be undone.',
      'confirm.clearOk': 'Clear all',
      'opml.title': '{name} subscriptions',
      'sort.descToast': 'Sorted by publish time, newest first',
      'sort.ascToast': 'Sorted by publish time, oldest first'
    }
  };

  let LANG = 'zh';
  function t(key) {
    const dict = I18N[LANG];
    return (dict && dict[key]) || I18N.zh[key] || key;
  }
  function fmt(key, vars) {
    return t(key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
  }

  /* ---------------- 状态 ---------------- */
  const STORAGE_KEY = 'jianread.state.v1';

  const DEFAULT_UI = {
    scope: 'all',
    filter: 'all',
    selectedId: null,
    query: '',
    sort: 'desc',
    theme: 'system',
    fontSize: 'normal',
    reduceMotion: false,
    lang: 'system',
    collapsed: {}
  };

  function emptyState() {
    return {
      feeds: [],
      categories: [],
      articles: [],
      ui: Object.assign({}, DEFAULT_UI, { collapsed: {} })
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.feeds) || !Array.isArray(data.categories) || !Array.isArray(data.articles)) {
        return null;
      }
      return {
        feeds: data.feeds,
        categories: data.categories,
        articles: data.articles,
        ui: Object.assign({}, DEFAULT_UI, data.ui || {}, { collapsed: (data.ui && data.ui.collapsed) || {} })
      };
    } catch (err) {
      return null;
    }
  }

  let S = loadState() || emptyState();

  /* 兜底修复历史 / 手工改坏的数据：脏字段、指向已删分组的订阅源、失效的视图范围 */
  function normalizeState() {
    const okArr = (v) =>
      Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && typeof x.id === 'string') : [];
    S.feeds = okArr(S.feeds);
    S.categories = okArr(S.categories);
    S.articles = okArr(S.articles);

    const catIds = new Set(S.categories.map((c) => c.id));
    S.feeds.forEach((f) => {
      if (typeof f.url !== 'string') f.url = '';
      if (typeof f.title !== 'string' || !f.title) f.title = feedHost(f) || t('untitled');
      if (f.category && !catIds.has(f.category)) f.category = '';
    });
    S.articles.forEach((a) => {
      if (typeof a.title !== 'string' || !a.title) a.title = t('untitled');
      if (typeof a.feedId !== 'string') a.feedId = '';
      if (typeof a.publishedAt !== 'string') a.publishedAt = '';
      a.read = !!a.read;
      a.starred = !!a.starred;
    });

    const ui = S.ui;
    if (!Array.isArray(S.articles)) S.articles = [];
    if (ui.filter !== 'unread' && ui.filter !== 'starred') ui.filter = 'all';
    if (ui.sort !== 'asc') ui.sort = 'desc';
    if (!FONT_SCALE[ui.fontSize]) ui.fontSize = 'normal';
    if (ui.theme !== 'light' && ui.theme !== 'dark') ui.theme = 'system';
    if (ui.lang !== 'zh' && ui.lang !== 'en') ui.lang = 'system';
    if (typeof ui.query !== 'string') ui.query = '';
    if (!ui.collapsed || typeof ui.collapsed !== 'object') ui.collapsed = {};

    const scope = typeof ui.scope === 'string' ? ui.scope : 'all';
    if (scope.startsWith('feed:') && !S.feeds.some((f) => f.id === scope.slice(5))) ui.scope = 'all';
    else if (scope.startsWith('cat:')) {
      const cid = scope.slice(4);
      if (cid && !catIds.has(cid)) ui.scope = 'all';
    } else if (scope !== 'all' && scope !== 'unread' && scope !== 'starred') {
      ui.scope = 'all';
    }
  }

  let persistTimer = null;
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(saveNow, 240);
  }
  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
    } catch (err) {
      toast(t('toast.quota'));
    }
  }

  /* ---------------- DOM ---------------- */
  const app = $('#app');
  const scrim = $('#scrim');
  const sidebar = $('#sidebar');
  const menuBtn = $('#menuBtn');
  const searchToggle = $('#searchToggle');
  const searchWrap = $('#searchWrap');
  const searchInput = $('#searchInput');
  const searchClear = $('#searchClear');
  const viewTitle = $('#viewTitle');
  const viewMeta = $('#viewMeta');
  const sortBtn = $('#sortBtn');
  const sortLabel = $('#sortLabel');
  const markAllBtn = $('#markAllBtn');
  const articleList = $('#articleList');
  const listScroll = $('#listScroll');
  const listEmpty = $('#listEmpty');
  const listEmptyText = $('#listEmptyText');
  const listEmptyActions = $('#listEmpty .empty-actions');
  const categoryList = $('#categoryList');
  let catEnterTimer = 0;
  const listPane = $('#listPane');
  const reader = $('#reader');
  const readerScroll = $('#readerScroll');
  const readerDoc = $('#readerDoc');
  const readerScope = $('#readerScope');
  const progressBar = $('#progressBar');
  const starBtn = $('#starBtn');
  const readBtn = $('#readBtn');
  const openLink = $('#openLink');
  const backBtn = $('#backBtn');
  const fab = $('#fab');
  const snackbar = $('#snackbar');
  const snackbarText = $('#snackbarText');
  const snackbarAction = $('#snackbarAction');
  const feedDialog = $('#feedDialog');
  const feedForm = $('#feedForm');
  const feedUrl = $('#feedUrl');
  const feedTitleInput = $('#feedTitleInput');
  const feedCatTrigger = $('#feedCatTrigger');
  const feedCatValueEl = $('#feedCatValue');
  const feedStatus = $('#feedStatus');
  const feedStatusText = $('#feedStatusText');
  const feedSubmit = $('#feedSubmit');
  const promptDialog = $('#promptDialog');
  const promptForm = $('#promptForm');
  const promptInput = $('#promptInput');
  const promptSubmit = $('#promptSubmit');
  const confirmDialog = $('#confirmDialog');
  const confirmOk = $('#confirmOk');
  const settingsDialog = $('#settingsDialog');
  const motionSwitch = $('#motionSwitch');
  const opmlInput = $('#opmlInput');
  const heroIconUse = $('#heroIconUse');
  const heroLabel = $('#heroLabel');
  const heroSub = $('#heroSub');
  const feedSheetDialog = $('#feedSheet');
  const sheetAvatar = $('#sheetAvatar');
  const sheetTitle = $('#feedSheetTitle');
  const sheetUrl = $('#sheetUrl');
  const sheetGroups = $('#sheetGroups');

  /* ---------------- 语言 ---------------- */
  function systemLang() {
    return (navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
  }
  function resolvedLang() {
    const l = S.ui.lang;
    return l === 'zh' || l === 'en' ? l : systemLang();
  }
  function applyStaticI18n() {
    $$('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    $$('[data-i18n-title]').forEach((el) => el.setAttribute('title', t(el.dataset.i18nTitle)));
  }
  function applyLang() {
    LANG = resolvedLang();
    document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
    $$('#langSeg button').forEach((b) => {
      const on = b.dataset.langOpt === S.ui.lang;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    applyStaticI18n();
    updateChrome();
  }

  /* ---------------- 数据查询 ---------------- */
  const feedById = (id) => S.feeds.find((f) => f.id === id);
  const catById = (id) => S.categories.find((c) => c.id === id);
  const articleById = (id) => S.articles.find((a) => a.id === id);
  const feedTitle = (id) => (feedById(id) || {}).title || t('unknown');
  const unreadCount = () => S.articles.filter((a) => !a.read).length;
  const starredCount = () => S.articles.filter((a) => a.starred).length;
  /* 相对链接（部分 RSS 只给 /post/1 这样的路径）要按页面基准补全 */
  function absUrl(u) {
    if (!u) return '';
    try {
      return new URL(u, location.href).href;
    } catch (err) {
      return u;
    }
  }

  /* 当前范围（不含筛选/搜索）的文章，用于首页主卡片计数 */
  function scopeArticles() {
    let list = S.articles.slice();
    const scope = S.ui.scope;
    if (scope.startsWith('feed:')) {
      const fid = scope.slice(5);
      list = list.filter((a) => a.feedId === fid);
    } else if (scope.startsWith('cat:')) {
      const cid = scope.slice(4);
      const ids = new Set(S.feeds.filter((f) => f.category === cid).map((f) => f.id));
      list = list.filter((a) => ids.has(a.feedId));
    }
    return list;
  }

  function visibleArticles() {
    let list = scopeArticles();

    if (S.ui.filter === 'unread') list = list.filter((a) => !a.read);
    else if (S.ui.filter === 'starred') list = list.filter((a) => a.starred);

    const q = S.ui.query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        ((a.title || '') + ' ' + (a.excerpt || '') + ' ' + (a.author || '') + ' ' + feedTitle(a.feedId))
          .toLowerCase()
          .includes(q)
      );
    }

    list.sort((a, b) => {
      const da = new Date(a.publishedAt).getTime() || 0;
      const db = new Date(b.publishedAt).getTime() || 0;
      return S.ui.sort === 'desc' ? db - da : da - db;
    });
    return list;
  }

  function currentViewLabel() {
    const s = S.ui.scope;
    if (s.startsWith('feed:')) return feedTitle(s.slice(5));
    if (s.startsWith('cat:')) return (catById(s.slice(4)) || {}).name || t('cat.default');
    if (S.ui.filter === 'unread') return t('nav.unread');
    if (S.ui.filter === 'starred') return t('nav.starred');
    return t('nav.all');
  }

  /* ---------------- 时间格式 ---------------- */
  function timeAgo(iso) {
    const time = new Date(iso).getTime();
    if (!time) return '';
    const diff = Math.max(0, Date.now() - time) / 1000;
    if (LANG === 'en') {
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
    }
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
    return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(iso));
  }

  function fullDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(LANG === 'en' ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(d);
  }

  /* 日期分组 */
  function dayKey(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'none';
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  }

  function dayLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - that) / 86400000);
    if (diffDays === 0) return t('date.today');
    if (diffDays === 1) return t('date.yesterday');
    const opts = { month: 'long', day: 'numeric', weekday: 'long' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return new Intl.DateTimeFormat(LANG === 'en' ? 'en-US' : 'zh-CN', opts).format(d);
  }

  function estimateReadTime(html) {
    const text = String(html || '').replace(/<[^>]+>/g, '');
    return clamp(Math.round(text.length / 320), 2, 25);
  }

  /* 从正文提取第一张图片作为列表缩略图（仅取绝对地址） */
  function extractArticleImage(html) {
    const s = String(html || '');
    if (!s) return '';
    const m = s.match(/<img[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i);
    if (!m) return '';
    const src = m[1].trim();
    if (!src || src.length > 2000) return '';
    if (!/^(https?:)?\/\//i.test(src) && !src.startsWith('data:image/')) return '';
    return src;
  }

  function articleThumb(a) {
    if (a.image === undefined) a.image = extractArticleImage(a.content);
    return a.image;
  }

  /* ---------------- 主题 / 字号 / 动效 ---------------- */
  function systemDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function resolvedTheme() {
    const theme = S.ui.theme;
    return theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme;
  }
  let lastTheme = null;
  let themeAnimTimer = 0;
  function applyTheme() {
    const theme = resolvedTheme();
    const dark = theme === 'dark';
    const root = document.documentElement;
    root.dataset.theme = theme;
    /* 与 <head> 中的首屏引导脚本保持一致，防止切换时残留旧底色 */
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.backgroundColor = dark ? '#1d1b20' : '#f7f2fa';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1d1b20' : '#f7f2fa');
    /* 真正切换主题时给全局颜色加一段过渡，避免生硬闪断 */
    if (lastTheme && lastTheme !== theme && !reduceMotion()) {
      root.classList.add('theme-anim');
      window.clearTimeout(themeAnimTimer);
      themeAnimTimer = window.setTimeout(() => root.classList.remove('theme-anim'), 340);
    }
    lastTheme = theme;
    $$('#themeSeg button').forEach((b) => {
      const on = b.dataset.themeOpt === S.ui.theme;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  const FONT_SCALE = { small: 0.92, normal: 1, large: 1.1 };
  function applyFontSize() {
    document.documentElement.style.setProperty('--font-scale', String(FONT_SCALE[S.ui.fontSize] || 1));
    $$('#fontSeg button').forEach((b) => {
      const on = b.dataset.fontOpt === S.ui.fontSize;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function applyMotion() {
    document.documentElement.classList.toggle('reduce-motion', !!S.ui.reduceMotion);
    if (motionSwitch) motionSwitch.checked = !!S.ui.reduceMotion;
  }

  /* ---------------- 渲染：侧边栏 ---------------- */
  function initials(title) {
    const s = String(title || '?').trim();
    if (!s) return '?';
    if (/^[A-Za-z]/.test(s)) return s[0].toUpperCase();
    return s.slice(0, 1);
  }

  /* 站点 favicon：站点 /favicon.ico → favicon.im → cccyun 镜像 → 回退首字母 */
  const favMiss = new Set(); /* 本会话内已确认拿不到图标的站点，跳过 <img> */
  function feedHost(f) {
    /* 优先用站点主页取图标：订阅地址常落在 feedburner / feedly 之类的托管域名上，
       直接用订阅地址的 host 会拿到「托管商」的图标而不是网站本身的图标 */
    const candidates = [f.site, f.url];
    for (let i = 0; i < candidates.length; i++) {
      const raw = candidates[i];
      if (!raw) continue;
      try {
        const host = new URL(raw, location.href).hostname;
        if (host) return host;
      } catch (err) {
        /* 继续尝试下一个 */
      }
    }
    return '';
  }
  window.__favNext = function (img) {
    const host = img.dataset.host || '';
    const step = Number(img.dataset.step || 0);
    /* 0: 站点直取 → 1: favicon.im → 2: cccyun → 3: 放弃，露出首字母 */
    if (step >= 2) {
      favMiss.add(host);
      img.remove();
      return;
    }
    img.dataset.step = String(step + 1);
    img.src =
      step === 0
        ? 'https://favicon.im/' + host + '?larger=true'
        : 'https://favicon.cccyun.cc/' + host;
  };
  function avatarHTML(f) {
    const host = feedHost(f);
    const img =
      host && !favMiss.has(host)
        ? '<img class="av-img" alt="" loading="lazy" decoding="async" data-host="' + esc(host) + '" data-step="0"' +
          ' src="https://' + esc(host) + '/favicon.ico" onerror="__favNext(this)">'
        : '';
    return '<span class="av-fallback">' + esc(initials(f.title)) + '</span>' + img;
  }

  function feedRowHTML(f, unread) {
    const active = S.ui.scope === 'feed:' + f.id;
    return (
      '<div class="feed-row' + (active ? ' is-active' : '') + '">' +
        '<button class="feed-main" data-feed="' + f.id + '" aria-current="' + (active ? 'true' : 'false') + '" title="' + esc(f.title) + '">' +
          '<span class="feed-avatar" data-feed-sheet="' + f.id + '" style="--c:' + esc(f.color || '#6750A4') + '" aria-hidden="true">' + avatarHTML(f) + '</span>' +
          '<span class="feed-name">' + esc(f.title) + '</span>' +
          (unread ? '<span class="feed-unread">' + unread + '</span>' : '') +
        '</button>' +
        '<button class="feed-more" data-feed-more="' + f.id + '" aria-haspopup="menu" aria-label="' + esc(fmt(t('aria.moreFeed'), { name: f.title })) + '">' +
          icon('i-more', 'icon') +
        '</button>' +
      '</div>'
    );
  }

  function catGroupHTML(group, unreadByFeed) {
    const collapsed = !!S.ui.collapsed[group.key];
    const active = S.ui.scope === 'cat:' + group.id;
    const unread = group.feeds.reduce((sum, f) => sum + (unreadByFeed.get(f.id) || 0), 0);
    const moreBtn = group.pseudo
      ? ''
      : '<button class="feed-more" data-cat-more="' + group.id + '" aria-haspopup="menu" aria-label="' + esc(fmt(t('aria.moreCat'), { name: group.name })) + '">' +
          icon('i-more', 'icon') +
        '</button>';
    return (
      '<div class="cat-group' + (collapsed ? ' is-collapsed' : '') + '">' +
        '<div class="cat-head' + (active ? ' is-active' : '') + '">' +
          '<button class="cat-collapse" data-cat-toggle="' + esc(group.key) + '" aria-expanded="' + (collapsed ? 'false' : 'true') + '" aria-label="' + esc(fmt(t(collapsed ? 'aria.expand' : 'aria.collapse'), { name: group.name })) + '">' +
            icon('i-chevron-down', 'cat-chevron') +
          '</button>' +
          '<button class="cat-toggle" data-cat-select="' + esc(group.id) + '">' +
            '<span class="cat-name">' + esc(group.name) + '</span>' +
            (unread ? '<span class="cat-count">' + unread + '</span>' : '') +
          '</button>' +
          moreBtn +
        '</div>' +
        '<div class="cat-feeds"><div>' +
          (group.feeds.length ? group.feeds.map((f) => feedRowHTML(f, unreadByFeed.get(f.id) || 0)).join('') : '<p class="sidebar-empty">' + esc(t('sidebar.catEmpty')) + '</p>') +
        '</div></div>' +
      '</div>'
    );
  }

  /* 结构不变时只改数字：避免每点一篇文章就重建整个侧栏（头像闪动 / 图标重复请求） */
  function setBadge(scopeEl, cls, count) {
    if (!scopeEl) return;
    let el = scopeEl.querySelector('.' + cls);
    if (!count) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.className = cls;
      scopeEl.appendChild(el);
    }
    if (el.textContent !== String(count)) el.textContent = String(count);
  }

  function patchSidebarCounts(groups, unreadByFeed) {
    groups.forEach((g) => {
      const head = categoryList.querySelector('[data-cat-select="' + g.id + '"]');
      if (head) {
        const n = g.feeds.reduce((sum, f) => sum + (unreadByFeed.get(f.id) || 0), 0);
        setBadge(head, 'cat-count', n);
      }
      g.feeds.forEach((f) => {
        const btn = categoryList.querySelector('[data-feed="' + f.id + '"]');
        if (btn) setBadge(btn, 'feed-unread', unreadByFeed.get(f.id) || 0);
      });
    });
  }

  function renderSidebar() {
    const total = S.articles.length;
    const unread = unreadCount();
    const starred = starredCount();

    /* 一次遍历统计各订阅源未读数，避免 feeds × articles 的重复扫描 */
    const unreadByFeed = new Map();
    S.articles.forEach((a) => {
      if (a.read) return;
      unreadByFeed.set(a.feedId, (unreadByFeed.get(a.feedId) || 0) + 1);
    });

    /* 主卡片：固定显示「全部文章」，不跟随当前视图，点击可随时返回全部 */
    heroIconUse.setAttribute('href', '#i-rows');
    heroLabel.textContent = t('nav.all');
    heroSub.textContent = fmt(t('home.archived'), { n: total });

    /* 默认分组（未归入任何分组的订阅源）固定排在最顶上 */
    const groups = [];
    const orphans = S.feeds.filter((f) => !S.categories.some((c) => c.id === f.category));
    if (S.feeds.length && (orphans.length || !S.categories.length)) {
      groups.push({
        id: '',
        key: '__default',
        name: t('cat.default'),
        feeds: orphans,
        pseudo: true
      });
    }

    S.categories.forEach((c) =>
      groups.push({
        id: c.id,
        key: c.id,
        name: c.name,
        feeds: S.feeds.filter((f) => f.category === c.id)
      })
    );

    let html = '';
    if (S.feeds.length || S.categories.length) {
      /* 即使订阅源被清空，用户建的分组也要保留显示 */
      html = groups.map((g) => catGroupHTML(g, unreadByFeed)).join('');
      if (!S.categories.length && !orphans.length) {
        html += '<p class="sidebar-empty">' + esc(t('sidebar.emptyCats')) + '</p>';
      }
    } else {
      html = '<p class="sidebar-empty">' + esc(t('sidebar.noFeeds')) + '</p>';
    }

    /* 结构签名：分组 / 订阅归属 / 名称 / 选中范围 / 折叠态任一变化才重建 DOM */
    const sig =
      groups.map((g) => g.key + '|' + g.name + '|' + g.feeds.length).join('#') +
      '::' +
      S.feeds.map((f) => f.id + ',' + f.category + ',' + f.title).join(';') +
      '::' +
      S.ui.scope +
      '::' +
      groups.map((g) => (S.ui.collapsed[g.key] ? 1 : 0)).join('');

    if (categoryList.dataset.sig !== sig) {
      categoryList.dataset.sig = sig;
      categoryList.innerHTML = html;
      categoryList.classList.remove('is-enter');
      void categoryList.offsetWidth;
      categoryList.classList.add('is-enter');
      /* 只在这一轮入场期间生效，后续小刷新不再重播 */
      window.clearTimeout(catEnterTimer);
      catEnterTimer = window.setTimeout(() => categoryList.classList.remove('is-enter'), 900);
    } else {
      /* 仅未读数字变化（已读 / 星标 / 新文章）→ 局部更新，不重建 */
      patchSidebarCounts(groups, unreadByFeed);
    }

    /* 没有任何分组卡片时隐藏「折叠 / 展开分组」按钮 */
    const groupsToggle = $('#groupsToggle');
    if (groupsToggle) groupsToggle.hidden = !groups.length;

    const name = t('app.name');
    document.title = unread ? '(' + unread + ') ' + name : name + ' · ' + t('app.tagline');
  }

  /* ---------------- 渲染：文章列表 ---------------- */
  function itemHTML(a, index) {
    const f = feedById(a.feedId) || { title: t('unknown'), color: '#6750A4' };
    const selected = a.id === S.ui.selectedId;
    const thumb = articleThumb(a);
    return (
      '<li>' +
        '<a class="article-item' + (a.read ? '' : ' is-unread') + (selected ? ' is-selected' : '') + '"' +
          ' href="#' + esc(a.id) + '" data-id="' + esc(a.id) + '" aria-current="' + (selected ? 'true' : 'false') + '"' +
          ' style="--c:' + esc(f.color || '#6750A4') + ';--i:' + Math.min(index, 12) + '">' +
          '<div class="ai-body">' +
            '<div class="ai-top">' +
              '<span class="ai-dot" aria-hidden="true"></span>' +
              '<span class="ai-feed">' + esc(f.title) + '</span>' +
              (a.starred ? icon('i-star-fill', 'icon ai-star') : '') +
              '<span class="ai-time">' + timeAgo(a.publishedAt) + '</span>' +
            '</div>' +
            '<h3 class="ai-title">' + esc(a.title) + '</h3>' +
            (a.excerpt ? '<p class="ai-excerpt">' + esc(a.excerpt) + '</p>' : '') +
            '<div class="ai-meta">' +
              '<span>' + esc(a.author || f.title) + '</span>' +
              '<span class="sep" aria-hidden="true"></span>' +
              '<span>' + fmt(t('reader.min'), { n: a.readTime || 5 }) + '</span>' +
              (a.read ? '<span class="sep" aria-hidden="true"></span><span>' + esc(t('readLabel')) + '</span>' : '') +
            '</div>' +
          '</div>' +
          (thumb
            ? '<img class="ai-thumb" src="' + esc(thumb) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">'
            : '') +
        '</a>' +
      '</li>'
    );
  }

  function renderList(opts) {
    const keepScroll = opts && opts.keepScroll;
    const st = listScroll.scrollTop;
    const list = visibleArticles();

    let html = '';
    let lastKey = null;
    let index = 0;
    list.forEach((a) => {
      const key = dayKey(a.publishedAt);
      if (key !== lastKey) {
        lastKey = key;
        const label = dayLabel(a.publishedAt);
        if (label) {
          html += '<li class="list-date" role="presentation"><span>' + esc(label) + '</span></li>';
        }
      }
      html += itemHTML(a, index++);
    });
    articleList.innerHTML = html;
    listEmpty.hidden = list.length > 0;
    /* 已经有订阅源时，空列表是「筛选 / 搜索没命中」，不该再劝用户「添加订阅源」 */
    if (listEmptyActions) listEmptyActions.hidden = S.feeds.length > 0;
    markAllBtn.disabled = list.length === 0;

    const unread = list.filter((a) => !a.read).length;
    viewTitle.textContent = currentViewLabel();
    viewMeta.textContent = S.ui.query.trim()
      ? fmt(t('meta.search'), { total: list.length, unread: unread })
      : fmt(t('meta.all'), { total: list.length, unread: unread });

    $$('.chip[data-filter]').forEach((c) => {
      const on = c.dataset.filter === S.ui.filter;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    sortLabel.textContent = S.ui.sort === 'desc' ? t('sort.newest') : t('sort.oldest');
    sortBtn.setAttribute('aria-pressed', S.ui.sort === 'asc' ? 'true' : 'false');
    sortBtn.classList.toggle('is-active', S.ui.sort === 'asc');

    if (list.length === 0) {
      listEmptyText.textContent = S.ui.query.trim()
        ? fmt(t('empty.query'), { q: S.ui.query.trim() })
        : S.ui.scope.startsWith('feed:')
          ? fmt(t('empty.feed'), { name: currentViewLabel() })
          : t('empty.generic');
    }

    if (keepScroll) listScroll.scrollTop = st;
    else listScroll.scrollTop = 0;
  }

  function patchItem(a) {
    const el = articleList.querySelector('[data-id="' + a.id.replace(/"/g, '\\"') + '"]');
    if (!el) return;
    const selected = S.ui.selectedId === a.id;
    el.classList.toggle('is-unread', !a.read);
    el.classList.toggle('is-selected', selected);
    el.setAttribute('aria-current', selected ? 'true' : 'false');
  }

  /* ---------------- 渲染：阅读区 ---------------- */
  function placeholderHTML() {
    const phText = isTouch() ? t('ph.textTouch') : t('ph.textDesktop');
    return (
      '<div class="reader-placeholder">' +
        '<svg class="placeholder-art" viewBox="0 0 160 120" aria-hidden="true">' +
          '<rect x="28" y="14" width="86" height="92" rx="10" fill="var(--surface-container)" stroke="var(--outline-variant)" stroke-width="2"></rect>' +
          '<path d="M44 38h54M44 54h54M44 70h34" stroke="var(--outline)" stroke-width="3" stroke-linecap="round" opacity=".7"></path>' +
          '<rect x="86" y="52" width="52" height="52" rx="14" fill="var(--primary)"></rect>' +
          '<path d="M100 78l7 7 14-15" fill="none" stroke="var(--on-primary)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '</svg>' +
        '<h2 class="placeholder-title">' + esc(t('ph.title')) + '</h2>' +
        '<p class="placeholder-text">' + esc(phText) + '</p>' +
        '<dl class="shortcut-list touch-hide">' +
          '<div><dt><kbd>J</kbd><kbd>K</kbd></dt><dd>' + esc(t('sc.next')) + '</dd></div>' +
          '<div><dt><kbd>M</kbd></dt><dd>' + esc(t('sc.mark')) + '</dd></div>' +
          '<div><dt><kbd>S</kbd></dt><dd>' + esc(t('sc.star')) + '</dd></div>' +
          '<div><dt><kbd>Esc</kbd></dt><dd>' + esc(t('sc.esc')) + '</dd></div>' +
        '</dl>' +
      '</div>'
    );
  }

  function renderReader() {
    const a = S.ui.selectedId ? articleById(S.ui.selectedId) : null;

    if (!a) {
      readerDoc.innerHTML = placeholderHTML();
      readerDoc.setAttribute('aria-label', t('ph.title'));
      readerScope.textContent = t('reader.scope');
      starBtn.disabled = true;
      readBtn.disabled = true;
      openLink.setAttribute('aria-disabled', 'true');
      openLink.href = '#';
      updateReaderToolbar();
      updateProgress();
      return;
    }

    const f = feedById(a.feedId) || { title: t('unknown'), color: '#6750A4' };
    starBtn.disabled = false;
    readBtn.disabled = false;
    openLink.removeAttribute('aria-disabled');
    const originalUrl = absUrl(a.link || f.site || f.url || '');
    openLink.href = originalUrl || '#';
    readerScope.textContent = f.title;
    readerDoc.setAttribute('aria-label', a.title);

    readerDoc.innerHTML =
      '<div class="doc-head">' +
        '<div class="doc-feed">' +
          '<span class="feed-avatar" style="--c:' + esc(f.color || '#6750A4') + '" aria-hidden="true">' + avatarHTML(f) + '</span>' +
          '<span>' + esc(f.title) + '</span>' +
          '<span class="dot-sep" aria-hidden="true"></span>' +
          '<span>' + fmt(t('reader.min'), { n: a.readTime || 5 }) + '</span>' +
        '</div>' +
        '<h1 class="doc-title">' + esc(a.title) + '</h1>' +
        '<p class="doc-excerpt">' + esc(a.excerpt || '') + '</p>' +
        '<div class="doc-byline">' +
          '<span class="author">' + esc(a.author || f.title) + '</span>' +
          '<span class="dot-sep" aria-hidden="true"></span>' +
          '<time datetime="' + esc(a.publishedAt) + '">' + fullDate(a.publishedAt) + '</time>' +
          '<span class="dot-sep" aria-hidden="true"></span>' +
          '<span>' + fmt(t('reader.minRead'), { n: a.readTime || 5 }) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="doc-rule" aria-hidden="true"></div>' +
      '<div class="doc-body">' + (a.content || '<p>' + esc(a.excerpt || '') + '</p>') + '</div>' +
      '<div class="doc-foot">' +
        '<a class="btn-tonal" href="' + esc(originalUrl || '#') + '" target="_blank" rel="noopener noreferrer">' +
          icon('i-external') + esc(t('reader.viewOriginal')) +
        '</a>' +
        '<button class="btn-text" data-star-toggle>' + esc(a.starred ? t('reader.unstarToggle') : t('reader.starToggle')) + '</button>' +
        '<span class="doc-foot-note">' + esc(fmt(t('reader.from'), { name: f.title })) + '</span>' +
      '</div>';

    readerDoc.style.animation = 'none';
    void readerDoc.offsetWidth;
    readerDoc.style.animation = '';

    updateReaderToolbar();
    updateProgress();
  }

  function updateReaderToolbar() {
    const a = S.ui.selectedId ? articleById(S.ui.selectedId) : null;
    const starred = !!(a && a.starred);
    const read = !!(a && a.read);

    starBtn.classList.toggle('is-on', starred);
    starBtn.setAttribute('aria-pressed', starred ? 'true' : 'false');
    starBtn.setAttribute('aria-label', starred ? t('reader.unstar') : t('reader.star'));
    starBtn.setAttribute('title', t('reader.starTitle'));
    starBtn.innerHTML = icon(starred ? 'i-star-fill' : 'i-star');

    readBtn.classList.toggle('is-on', read);
    readBtn.setAttribute('aria-pressed', read ? 'true' : 'false');
    readBtn.setAttribute('aria-label', read ? t('reader.unmark') : t('reader.mark'));
    readBtn.setAttribute('title', t('reader.markTitle'));
  }

  function updateProgress() {
    const max = readerScroll.scrollHeight - readerScroll.clientHeight;
    const p = max > 8 ? clamp(readerScroll.scrollTop / max, 0, 1) : 0;
    progressBar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    reader.classList.toggle('is-scrolled', readerScroll.scrollTop > 4);
  }

  function renderAll(opts) {
    renderSidebar();
    renderList(opts);
    renderReader();
  }

  /* ---------------- 布局 / 抽屉 / 阅读态 ---------------- */
  function setNav(open) {
    const next = !!open;
    app.classList.toggle('nav-open', next);
    menuBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) {
      scrim.hidden = false;
      requestAnimationFrame(() => scrim.classList.add('is-visible'));
    } else {
      scrim.classList.remove('is-visible');
      window.setTimeout(() => {
        if (!app.classList.contains('nav-open')) scrim.hidden = true;
      }, 280);
    }
    syncInert();
  }

  function toggleNav() {
    setNav(!app.classList.contains('nav-open'));
  }

  /* 手机端：首页 ⇄ 列表 */
  function browseTo() {
    if (!isMobile()) return;
    app.classList.add('is-browsing');
    syncInert();
  }

  function goHome() {
    if (!isMobile()) return;
    app.classList.remove('is-browsing');
    if (app.classList.contains('is-reading')) app.classList.remove('is-reading');
    syncInert();
  }

  function closeReader() {
    if (!app.classList.contains('is-reading')) return;
    app.classList.remove('is-reading');
    syncInert();
    const el = articleList.querySelector('[data-id="' + (S.ui.selectedId || '') + '"]');
    if (el) el.focus({ preventScroll: false });
  }

  function openReader() {
    if (!isMobile()) return;
    app.classList.add('is-reading');
    syncInert();
    window.setTimeout(() => backBtn.focus({ preventScroll: true }), reduceMotion() ? 0 : 320);
  }

  /* 左上角按钮在手机上是「返回首页」，在平板上是「打开订阅源导航」，图标与文案要跟着变 */
  function updateChrome() {
    const back = isMobile();
    const label = t(back ? 'aria.backHome' : 'aria.openNav');
    menuBtn.innerHTML = icon(back ? 'i-back' : 'i-menu');
    menuBtn.setAttribute('aria-label', label);
    menuBtn.setAttribute('title', label);
  }

  function syncInert() {
    const mobile = isMobile();
    const compact = isCompact();
    const browsing = app.classList.contains('is-browsing');
    const reading = app.classList.contains('is-reading');
    reader.inert = mobile && !reading;
    /* 手机端侧栏就是首页：首页时可点，进入列表/阅读后反向 inert */
    sidebar.inert = mobile ? browsing : compact && !app.classList.contains('nav-open');
    listPane.inert = mobile && (!browsing || reading);
    if (!mobile && browsing) app.classList.remove('is-browsing');
    if (!mobile && reading) app.classList.remove('is-reading');
    if (!compact && app.classList.contains('nav-open')) setNav(false);
    updateChrome();
  }

  /* ---------------- 选择与操作 ---------------- */
  /* 程序化滚动时临时关掉 scroll-behavior:smooth，否则换文章会「动画」着滚回顶部 */
  function jumpToTop(el) {
    if (!el) return;
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = 0;
    el.style.scrollBehavior = prev;
  }

  function selectArticle(id, opts) {
    const options = opts || {};
    const a = articleById(id);
    if (!a) return;

    const changed = S.ui.selectedId !== id;
    const prevId = S.ui.selectedId;
    S.ui.selectedId = id;

    if (options.markRead !== false && !a.read) {
      a.read = true;
      persist();
    }

    if (prevId && prevId !== id) {
      const prev = articleById(prevId);
      if (prev) patchItem(prev);
    }
    patchItem(a);
    renderSidebar();
    renderReader();
    if (changed) {
      jumpToTop(readerScroll);
      updateProgress();
    }
    applySelectionScroll(id);

    if (isMobile()) openReader();
    if (app.classList.contains('nav-open')) setNav(false);
  }

  function applySelectionScroll(id) {
    const el = articleList.querySelector('[data-id="' + id + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function toggleStar(id) {
    const a = articleById(id || S.ui.selectedId);
    if (!a) return;
    a.starred = !a.starred;
    persist();
    renderList({ keepScroll: true });
    renderSidebar();
    if (a.id === S.ui.selectedId) {
      renderReader();
      /* 星标按钮弹跳反馈 */
      starBtn.classList.remove('is-pop');
      void starBtn.offsetWidth;
      starBtn.classList.add('is-pop');
      window.setTimeout(() => starBtn.classList.remove('is-pop'), 560);
    }
    toast(a.starred ? t('toast.starred') : t('toast.unstarred'));
  }

  function toggleRead(id) {
    const a = articleById(id || S.ui.selectedId);
    if (!a) return;
    a.read = !a.read;
    persist();
    patchItem(a);
    renderSidebar();
    if (a.id === S.ui.selectedId) renderReader();
    if (S.ui.filter === 'unread' || S.ui.scope === 'unread') renderList({ keepScroll: true });
    toast(a.read ? t('toast.read') : t('toast.unread'));
  }

  function markAllRead(days) {
    const list = visibleArticles();
    const cutoff = days ? Date.now() - days * 86400000 : Infinity;
    const targets = list.filter(
      (a) => !a.read && (new Date(a.publishedAt).getTime() || 0) <= cutoff
    );
    if (!targets.length) {
      toast(t('toast.noneUnread'));
      return;
    }
    targets.forEach((a) => (a.read = true));
    persist();
    renderAll({ keepScroll: true });
    toast(fmt(t('toast.markedAll'), { n: targets.length }));
  }

  function markAllMenu() {
    const list = visibleArticles();
    if (!list.some((a) => !a.read)) {
      toast(t('toast.noneUnread'));
      return;
    }
    const unreadOlderThan = (days) => {
      const cutoff = Date.now() - days * 86400000;
      return list.filter((a) => !a.read && (new Date(a.publishedAt).getTime() || 0) <= cutoff).length;
    };
    const itemCount = (n) => (n ? String(n) : '');
    openMenu(markAllBtn, [
      { label: t('markAll.d7'), icon: 'i-check', hint: itemCount(unreadOlderThan(7)), onClick: () => markAllRead(7) },
      { label: t('markAll.d3'), icon: 'i-check', hint: itemCount(unreadOlderThan(3)), onClick: () => markAllRead(3) },
      { label: t('markAll.d1'), icon: 'i-check', hint: itemCount(unreadOlderThan(1)), onClick: () => markAllRead(1) },
      { divider: true },
      { label: t('markAll.all'), icon: 'i-check-all', hint: itemCount(unreadCountIn(list)), onClick: () => markAllRead(0) }
    ]);
  }

  function unreadCountIn(list) {
    return list.filter((a) => !a.read).length;
  }

  /* 视图切换时列表标题轻微下落入场 */
  function pulseTitle() {
    if (!viewTitle) return;
    viewTitle.classList.remove('is-in');
    void viewTitle.offsetWidth;
    viewTitle.classList.add('is-in');
  }

  /* 桌面端：当前选中项不在新视图里时，自动落到新视图的第一篇（不标已读） */
  function syncSelectionToView() {
    const list = visibleArticles();
    if (!list.length) {
      S.ui.selectedId = null;
      return;
    }
    if (!list.some((a) => a.id === S.ui.selectedId)) S.ui.selectedId = list[0].id;
  }

  function setScope(scope, filter) {
    S.ui.scope = scope;
    S.ui.filter = filter || 'all';
    if (!isMobile()) syncSelectionToView();
    persist();
    renderSidebar();
    renderList();
    renderReader();
    pulseTitle();
  }

  function setFilter(filter) {
    S.ui.filter = filter;
    if (!isMobile()) syncSelectionToView();
    persist();
    renderSidebar();
    renderList();
    renderReader();
    pulseTitle();
  }

  function clearSearch() {
    searchInput.value = '';
    searchClear.hidden = true;
    if (S.ui.query) {
      S.ui.query = '';
      persist();
      renderList();
      renderSidebar();
    }
  }

  /* 刷新页面后把上次的搜索词回填到搜索框（否则列表在过滤但输入框是空的） */
  function restoreSearchUI() {
    const q = S.ui.query || '';
    searchInput.value = q;
    searchClear.hidden = !q;
    if (q && isMobile()) {
      searchWrap.classList.add('is-open');
      searchToggle.setAttribute('aria-expanded', 'true');
    }
  }

  /* ---------------- 订阅源 / 分类管理 ---------------- */
  let feedCatValue = '';

  function fillCategorySelect(selected) {
    feedCatValue = selected || '';
    renderFeedCatValue();
  }

  function renderFeedCatValue() {
    const c = feedCatValue ? catById(feedCatValue) : null;
    feedCatValueEl.textContent = c ? c.name : t('feed.uncatOpt');
  }

  /* 在分组下拉 / 详情面板里就地新建分组，建好后回调 */
  function createCategoryInline(then) {
    askText({
      title: t('ask.newCat'),
      label: t('prompt.inputName'),
      desc: t('ask.newCatDesc'),
      value: '',
      confirm: t('prompt.create')
    }).then((name) => {
      if (!name) return;
      if (S.categories.some((c) => c.name === name)) {
        toast(t('toast.catExists'));
        return;
      }
      const cat = { id: uid('c'), name: name };
      S.categories.push(cat);
      persist();
      renderSidebar();
      renderList();
      toast(fmt(t('toast.catCreated'), { name: name }));
      if (typeof then === 'function') then(cat);
    });
  }

  function openFeedCatMenu() {
    const items = S.categories.map((c) => ({
      label: c.name,
      icon: c.id === feedCatValue ? 'i-check' : '',
      onClick: () => {
        feedCatValue = c.id;
        renderFeedCatValue();
      }
    }));
    /* 上面没有任何分组选项时不插入分隔线，避免孤立的空白条 */
    if (items.length) items.push({ divider: true });
    items.push({
      label: t('feed.newCat'),
      icon: 'i-plus',
      onClick: () => createCategoryInline((cat) => {
        feedCatValue = cat.id;
        renderFeedCatValue();
      })
    });
    feedCatTrigger.setAttribute('aria-expanded', 'true');
    openMenu(feedCatTrigger, items, { iconSpace: true, matchWidth: true, onClose: () => feedCatTrigger.setAttribute('aria-expanded', 'false') });
  }

  function addCategory() {
    createCategoryInline();
  }

  function renameCategory(id) {
    const c = catById(id);
    if (!c) return;
    askText({ title: t('ask.renameCat'), label: t('prompt.inputName'), value: c.name, confirm: t('prompt.save') }).then((name) => {
      if (!name || name === c.name) return;
      c.name = name;
      persist();
      renderSidebar();
      renderList();
      toast(t('toast.catRenamed'));
    });
  }

  function deleteCategory(id) {
    const c = catById(id);
    if (!c) return;
    const affected = S.feeds.filter((f) => f.category === id).length;
    askConfirm({
      title: fmt(t('confirm.delCatTitle'), { name: c.name }),
      desc: affected
        ? fmt(t('confirm.delCatDescFeeds'), { n: affected })
        : t('confirm.delCatDescEmpty'),
      ok: t('confirm.delCatOk'),
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.feeds.forEach((f) => {
        if (f.category === id) f.category = '';
      });
      S.categories = S.categories.filter((x) => x.id !== id);
      delete S.ui.collapsed[id];
      if (S.ui.scope === 'cat:' + id) S.ui.scope = 'all';
      persist();
      renderAll();
      toast(t('toast.catDeleted'));
    });
  }

  function renameFeed(id) {
    const f = feedById(id);
    if (!f) return;
    askText({ title: t('ask.renameFeed'), label: t('prompt.inputName'), value: f.title, confirm: t('prompt.save') }).then((name) => {
      if (!name || name === f.title) return;
      f.title = name;
      persist();
      renderAll({ keepScroll: true });
      toast(t('toast.feedRenamed'));
    });
  }

  function moveFeed(id) {
    const f = feedById(id);
    if (!f) return;
    const current = f.category;
    const items = S.categories.map((c) => ({
      label: c.name,
      hint: c.id === current ? t('menu.current') : '',
      onClick: () => {
        f.category = c.id;
        persist();
        renderAll({ keepScroll: true });
        toast(fmt(t('toast.movedTo'), { name: c.name }));
      }
    }));
    items.push({ divider: true });
    items.push({
      label: t('feed.uncatOpt'),
      onClick: () => {
        f.category = '';
        persist();
        renderAll({ keepScroll: true });
        toast(t('toast.movedUncat'));
      }
    });
    openMenu(sidebar.querySelector('[data-feed-more="' + id + '"]'), items);
  }

  function deleteFeed(id) {
    const f = feedById(id);
    if (!f) return;
    const count = S.articles.filter((a) => a.feedId === id).length;
    askConfirm({
      title: fmt(t('confirm.delFeedTitle'), { name: f.title }),
      desc: fmt(t('confirm.delFeedDesc'), { n: count }),
      ok: t('confirm.delFeedOk'),
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.feeds = S.feeds.filter((x) => x.id !== id);
      S.articles = S.articles.filter((a) => a.feedId !== id);
      if (S.ui.scope === 'feed:' + id) S.ui.scope = 'all';
      if (S.ui.selectedId && !articleById(S.ui.selectedId)) {
        S.ui.selectedId = null;
        if (isMobile()) app.classList.remove('is-reading');
      }
      persist();
      renderAll();
      syncInert();
      toast(t('toast.feedDeleted'));
    });
  }

  function clearAllFeeds() {
    if (!S.feeds.length) {
      toast(t('toast.nothingToDelete'));
      return;
    }
    askConfirm({
      title: t('confirm.clearTitle'),
      desc: fmt(t('confirm.clearDesc'), { feeds: S.feeds.length, articles: S.articles.length }),
      ok: t('confirm.clearOk'),
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.feeds = [];
      S.articles = [];
      S.ui.scope = 'all';
      S.ui.filter = 'all';
      S.ui.selectedId = null;
      if (isMobile()) app.classList.remove('is-reading');
      persist();
      renderAll();
      syncInert();
      toast(t('toast.clearedAll'));
    });
  }

  /* ---------------- 订阅源详情面板 ---------------- */
  let sheetFeedId = null;

  function closeSheet() {
    if (feedSheetDialog.open) feedSheetDialog.close();
  }

  function openFeedSheet(id) {
    const f = feedById(id);
    if (!f) return;
    sheetFeedId = id;
    sheetAvatar.style.setProperty('--c', f.color || '#6750A4');
    sheetAvatar.innerHTML = avatarHTML(f);
    sheetTitle.textContent = f.title;
    sheetUrl.textContent = f.url;
    const chips = [{ name: t('feed.uncatOpt'), val: '' }].concat(
      S.categories.map((c) => ({ name: c.name, val: c.id }))
    );
    /* 分组被删过之后 f.category 可能指向不存在的分组，这里按「默认分组」显示 */
    const currentCat = catById(f.category) ? f.category : '';
    sheetGroups.innerHTML = chips
      .map((c) => {
        const on = currentCat === c.val;
        return (
          '<button type="button" class="chip' + (on ? ' is-active' : '') + '" data-sheet-move="' + esc(c.val) + '">' +
            (on ? icon('i-check', 'icon') : '') +
            '<span>' + esc(c.name) + '</span>' +
          '</button>'
        );
      })
      .join('') +
      '<button type="button" class="chip" data-sheet-newcat>' +
        icon('i-plus', 'icon') +
        '<span>' + esc(t('sheet.newCat')) + '</span>' +
      '</button>';
    openModal(feedSheetDialog);
  }

  function clearFeedArticles(id) {
    const f = feedById(id);
    if (!f) return;
    const count = S.articles.filter((a) => a.feedId === id).length;
    if (!count) {
      toast(t('toast.noArticles'));
      closeSheet();
      return;
    }
    askConfirm({
      title: fmt(t('confirm.clearFeedTitle'), { name: f.title }),
      desc: fmt(t('confirm.clearFeedDesc'), { n: count }),
      ok: t('confirm.clearFeedOk'),
      danger: true
    }).then((ok) => {
      if (!ok) return;
      S.articles = S.articles.filter((a) => a.feedId !== id);
      if (S.ui.selectedId && !articleById(S.ui.selectedId)) {
        S.ui.selectedId = null;
        if (isMobile()) app.classList.remove('is-reading');
      }
      persist();
      renderAll();
      syncInert();
      closeSheet();
      toast(t('toast.feedCleared'));
    });
  }

  /* ---------------- 菜单 ---------------- */
  let menuEl = null;
  let menuAnchor = null;
  let menuAnchorClosedAt = 0;

  function closeMenu() {
    if (!menuEl) return;
    const onClose = menuEl._onClose;
    /* 焦点原本在菜单里（键盘操作）→ 关闭后送回触发器，避免焦点掉到 body */
    const hadFocus = menuEl.contains(document.activeElement);
    const anchor = menuAnchor;
    menuEl.remove();
    menuEl = null;
    if (typeof onClose === 'function') onClose();
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onMenuKeydown, true);
    if (hadFocus && anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  function onDocPointerDown(e) {
    if (!menuEl || menuEl.contains(e.target)) return;
    /* 记录是否点在触发器上：随后的 click 会被 openMenu 忽略，避免「关闭后立刻重开」 */
    if (menuAnchor && (menuAnchor === e.target || menuAnchor.contains(e.target))) {
      menuAnchorClosedAt = Date.now();
    }
    closeMenu();
  }
  function onMenuKeydown(e) {
    if (e.key === 'Escape') {
      /* preventDefault：弹窗内打开的菜单，Esc 只收菜单、不要把整个弹窗一起关掉 */
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    }
  }

  function openMenu(anchor, items, opts) {
    /* 同一触发器刚因 pointerdown 关闭菜单（pointerdown 关、click 再开）→ 视为切换，直接忽略 */
    if (anchor && anchor === menuAnchor && Date.now() - menuAnchorClosedAt < 500) {
      menuAnchorClosedAt = 0;
      return;
    }
    /* 没有 pointerdown 的激活路径（键盘回车 / 程序化 click）：菜单还开着同样是「切换 → 收起」 */
    if (anchor && menuEl && menuAnchor === anchor) {
      closeMenu();
      return;
    }
    closeMenu();
    if (!anchor) return;
    const o = opts || {};
    menuAnchor = anchor;
    menuAnchorClosedAt = 0;

    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items
      .map((it, i) =>
        it.divider
          ? '<div class="menu-divider" role="separator"></div>'
          : '<button class="menu-item' + (it.danger ? ' danger' : '') + '" role="menuitem" data-index="' + i + '">' +
              (it.icon
                ? icon(it.icon)
                : o.iconSpace
                  ? '<span class="menu-icon-spacer" aria-hidden="true"></span>'
                  : '') +
              '<span>' + esc(it.label) + '</span>' +
              (it.hint ? '<span style="margin-left:auto;font-size:11px;opacity:.6">' + esc(it.hint) + '</span>' : '') +
            '</button>'
      )
      .join('');

    /* 锚点在 <dialog> 内时挂到锚点父级做绝对定位：fixed 元素放进顶层弹窗
       在部分环境会被裁剪或不渲染，绝对定位则始终可见且随弹窗滚动 */
    const dlg = anchor.closest('dialog');
    if (dlg) {
      menu.classList.add('menu-anchored');
      anchor.parentElement.appendChild(menu);
      menu.style.minWidth = anchor.offsetWidth + 'px';
      menu.style.left = anchor.offsetLeft + 'px';

      /* 优先向下展开；下方空间不足则向上；两侧都不够时选较大一侧并内部滚动 */
      const mh = menu.offsetHeight;
      const tr = anchor.getBoundingClientRect();
      const dr = dlg.getBoundingClientRect();
      const spaceBelow = dr.bottom - 8 - tr.bottom;
      const spaceAbove = tr.top - dr.top - 8;
      const belowTop = anchor.offsetTop + anchor.offsetHeight + 6;
      const aboveTop = anchor.offsetTop - mh - 6;
      if (mh <= spaceBelow) {
        menu.style.top = belowTop + 'px';
      } else if (mh <= spaceAbove) {
        menu.style.top = aboveTop + 'px';
      } else if (spaceBelow >= spaceAbove) {
        menu.style.top = belowTop + 'px';
        menu.style.maxHeight = Math.max(72, Math.floor(spaceBelow)) + 'px';
        menu.style.overflowY = 'auto';
      } else {
        menu.style.top = aboveTop + 'px';
        menu.style.maxHeight = Math.max(72, Math.floor(spaceAbove)) + 'px';
        menu.style.overflowY = 'auto';
      }
    } else {
      document.body.appendChild(menu);

      const r = anchor.getBoundingClientRect();
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      let left = r.right - mw;
      let top = r.bottom + 6;
      if (left < 8) left = 8;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
      if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    }

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.menu-item');
      if (!btn) return;
      const it = items[Number(btn.dataset.index)];
      menuAnchor = null; /* 菜单项已点选，非触发器切换，不启用抑制 */
      closeMenu();
      if (it && typeof it.onClick === 'function') it.onClick();
    });

    menuEl = menu;
    if (typeof o.onClose === 'function') menuEl._onClose = o.onClose;
    const first = menu.querySelector('.menu-item');
    if (first) first.focus({ preventScroll: true });
    window.setTimeout(() => {
      document.addEventListener('pointerdown', onDocPointerDown, true);
      document.addEventListener('keydown', onMenuKeydown, true);
    }, 0);
  }

  function feedMenuItems(id) {
    return [
      { label: t('menu.rename'), icon: 'i-edit', onClick: () => renameFeed(id) },
      { label: t('menu.move'), icon: 'i-folder', onClick: () => moveFeed(id) },
      { label: t('menu.refresh'), icon: 'i-refresh', onClick: () => refreshFeed(id) },
      { divider: true },
      { label: t('menu.delete'), icon: 'i-trash', danger: true, onClick: () => deleteFeed(id) }
    ];
  }

  /* ---------------- 对话框 ---------------- */
  function openModal(dlg) {
    if (!dlg) return;
    /* 已经打开时重复 showModal 在部分浏览器会抛 InvalidStateError（例如详情面板里换分组后重渲染） */
    if (dlg.open) return;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  let promptResolve = null;
  function askText(opts) {
    return new Promise((resolve) => {
      promptResolve = resolve;
      $('#promptTitle').textContent = opts.title || t('prompt.defaultTitle');
      $('#promptLabel').textContent = opts.label || t('prompt.inputName');
      $('#promptDesc').textContent = opts.desc || '';
      promptSubmit.textContent = opts.confirm || t('prompt.save');
      promptInput.value = opts.value || '';
      openModal(promptDialog);
      window.setTimeout(() => {
        promptInput.focus();
        promptInput.select();
      }, 60);
    });
  }
  function settlePrompt(value) {
    const resolve = promptResolve;
    promptResolve = null;
    if (promptDialog.open) promptDialog.close();
    if (resolve) resolve(value);
  }

  let confirmResolve = null;
  function askConfirm(opts) {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      $('#confirmTitle').textContent = opts.title || t('confirm.ok');
      $('#confirmDesc').textContent = opts.desc || '';
      confirmOk.textContent = opts.ok || t('confirm.ok');
      confirmOk.classList.toggle('is-danger', !!opts.danger);
      openModal(confirmDialog);
    });
  }
  function settleConfirm(value) {
    const resolve = confirmResolve;
    confirmResolve = null;
    if (confirmDialog.open) confirmDialog.close();
    if (resolve) resolve(value);
  }

  promptForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = promptInput.value.trim();
    if (!v) {
      promptInput.focus();
      return;
    }
    settlePrompt(v);
  });
  promptDialog.addEventListener('close', () => {
    if (promptResolve) settlePrompt(null);
  });
  confirmOk.addEventListener('click', () => settleConfirm(true));
  $('#confirmCancel').addEventListener('click', () => settleConfirm(false));
  /* 确认框不是 form，补一个 Enter = 确认，键盘用户不用 Tab 到按钮 */
  confirmDialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || (e.target && e.target.tagName === 'BUTTON')) return;
    e.preventDefault();
    settleConfirm(true);
  });
  confirmDialog.addEventListener('close', () => {
    if (confirmResolve) settleConfirm(false);
  });

  /* ---------------- 提示条 ---------------- */
  let snackTimer = null;
  let snackCallback = null;
  let snackHideTimer = 0;

  function toast(message, opts) {
    const o = opts || {};
    snackbarText.textContent = message;
    if (typeof o.action === 'function') {
      snackCallback = o.action;
      snackbarAction.hidden = false;
      snackbarAction.textContent = o.label || (LANG === 'en' ? 'Undo' : '撤销');
    } else {
      snackCallback = null;
      snackbarAction.hidden = true;
    }
    /* 提示条用 popover 提升到顶层，否则会被 showModal 弹窗的 backdrop 盖住 */
    clearTimeout(snackHideTimer);
    if (typeof snackbar.showPopover === 'function' && !snackbar.matches(':popover-open')) {
      try {
        snackbar.showPopover();
        void snackbar.offsetWidth; /* 强制 reflow，保证淡入过渡生效 */
      } catch (err) { /* 已在顶层等情况忽略 */ }
    }
    snackbar.classList.add('is-visible');
    clearTimeout(snackTimer);
    snackTimer = window.setTimeout(hideToast, o.duration || 3400);
  }
  function hideToast() {
    snackbar.classList.remove('is-visible');
    clearTimeout(snackTimer);
    if (typeof snackbar.hidePopover === 'function' && snackbar.matches(':popover-open')) {
      /* 等淡出动画播完再退出顶层，避免瞬间消失 */
      snackHideTimer = window.setTimeout(() => {
        try { snackbar.hidePopover(); } catch (err) { /* 忽略 */ }
      }, 260);
    }
  }
  snackbarAction.addEventListener('click', () => {
    const cb = snackCallback;
    hideToast();
    if (cb) cb();
  });

  /* ---------------- 网络抓取 ---------------- */
  function parseFeedXml(text, baseUrl) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(text, 'text/xml');
    } catch (err) {
      return null;
    }
    if (!doc || doc.querySelector('parsererror')) return null;

    const pick = (root, names) => {
      for (let i = 0; i < names.length; i++) {
        const el = root.getElementsByTagName(names[i])[0];
        if (el && el.textContent) return el.textContent.trim();
      }
      return '';
    };
    const attrLink = (root) => {
      const links = root.getElementsByTagName('link');
      for (let i = 0; i < links.length; i++) {
        const rel = links[i].getAttribute('rel');
        const href = links[i].getAttribute('href');
        if (href && (!rel || rel === 'alternate')) return href;
      }
      return '';
    };

    const channel = doc.getElementsByTagName('channel')[0];
    const atomFeed = doc.getElementsByTagName('feed')[0];
    let title = '';
    let site = '';
    let desc = '';
    let nodes = [];

    if (channel) {
      title = pick(channel, ['title']);
      site = pick(channel, ['link']);
      desc = pick(channel, ['description']);
      nodes = Array.prototype.slice.call(channel.getElementsByTagName('item'));
    } else if (atomFeed) {
      title = pick(atomFeed, ['title']);
      site = attrLink(atomFeed);
      desc = pick(atomFeed, ['subtitle']);
      nodes = Array.prototype.slice.call(atomFeed.getElementsByTagName('entry'));
    }
    if (!nodes.length) return null;

    /* 相对链接按站点地址补全（订阅源里常见 /post/123 这种写法） */
    const itemBase = site || baseUrl;

    const items = nodes.slice(0, 40).map((node) => {
      const rawTitle = pick(node, ['title']) || t('untitled');
      const rawContent = pick(node, ['content:encoded', 'encoded', 'content', 'description', 'summary']);
      const rawLink = pick(node, ['link']) || attrLink(node);
      let link = itemBase;
      try {
        if (rawLink) link = new URL(rawLink, itemBase).href;
      } catch (err) {
        link = rawLink || itemBase;
      }
      const date = pick(node, ['pubDate', 'published', 'updated', 'dc:date']);
      const author = pick(node, ['dc:creator', 'creator', 'author', 'name']);
      const content = sanitizeHtml(rawContent, itemBase);
      const excerpt = htmlToText(content).slice(0, 160);
      let publishedAt = new Date().toISOString();
      if (date) {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
      }
      return {
        title: rawTitle,
        link: link,
        publishedAt: publishedAt,
        author: author,
        content: content || '<p>' + esc(excerpt) + '</p>',
        excerpt: excerpt,
        readTime: estimateReadTime(content)
      };
    });

    return {
      title: title,
      site: site,
      desc: desc,
      items: items.filter((it) => it.title && it.link)
    };
  }

  function htmlToText(html) {
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeHtml(html, baseUrl) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString('<div id="__root">' + html + '</div>', 'text/html');
    const root = doc.getElementById('__root');
    if (!root) return '';
    root.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,noscript,svg,video,audio').forEach((n) => n.remove());
    root.querySelectorAll('*').forEach((el) => {
      Array.prototype.slice.call(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        if (name.startsWith('on') || name === 'srcdoc' || name === 'style') {
          el.removeAttribute(attr.name);
          return;
        }
        if (name === 'href' || name === 'src' || name === 'srcset') {
          if (/^\s*(javascript|data|vbscript):/i.test(value)) {
            el.removeAttribute(attr.name);
            return;
          }
          if (baseUrl && value && !/^(https?:|\/\/|#|mailto:)/i.test(value)) {
            try {
              el.setAttribute(attr.name, new URL(value, baseUrl).href);
            } catch (err) {
              /* keep as is */
            }
          }
        }
      });
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return root.innerHTML;
  }

  async function fetchFeed(url) {
    const endpoints = [
      url,
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
      'https://corsproxy.io/?url=' + encodeURIComponent(url)
    ];

    for (let i = 0; i < endpoints.length; i++) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 9000);
      try {
        const res = await fetch(endpoints[i], {
          signal: controller.signal,
          mode: 'cors',
          credentials: 'omit'
        });
        window.clearTimeout(timer);
        if (!res.ok) continue;
        const text = await res.text();
        const parsed = parseFeedXml(text, url);
        if (parsed && parsed.items.length) return parsed;
      } catch (err) {
        window.clearTimeout(timer);
      }
    }
    return null;
  }

  function articleFromItem(feed, item, index) {
    return {
      id: uid('a') + '-' + index,
      feedId: feed.id,
      title: item.title,
      author: item.author || feed.title,
      publishedAt: item.publishedAt,
      readTime: item.readTime || 5,
      read: false,
      starred: false,
      excerpt: item.excerpt,
      image: extractArticleImage(item.content),
      link: item.link,
      content: item.content
    };
  }

  function mergeFeedArticles(feed, result) {
    const existing = new Set(
      S.articles.filter((a) => a.feedId === feed.id).map((a) => a.link || a.title)
    );
    let added = 0;
    result.items.forEach((it) => {
      if (existing.has(it.link || it.title)) return;
      S.articles.push(articleFromItem(feed, it, added));
      added++;
    });
    if (result.site && !feed.site) feed.site = result.site;
    return added;
  }

  async function fetchFeedsInBackground(feeds, opts) {
    if (!feeds.length) return 0;
    const quiet = !!(opts && opts.quiet); /* 自动刷新时不刷进度提示，避免打扰 */
    let total = 0;
    let done = 0;
    /* 并发抓取（最多 4 条同时），OPML 一次导入几十个源时不会串行等到天荒地老 */
    const queue = feeds.slice();
    const worker = async () => {
      for (;;) {
        const f = queue.shift();
        if (!f) return;
        if (!feedById(f.id)) continue; /* 抓取过程中被删除 */
        const result = await fetchFeed(f.url);
        if (result) total += mergeFeedArticles(f, result);
        done++;
        if (!quiet && feeds.length >= 6 && done < feeds.length) {
          toast(fmt(t('toast.importProgress'), { done: done, total: feeds.length }));
        }
      }
    };
    const lanes = [];
    const laneCount = Math.min(4, feeds.length);
    for (let i = 0; i < laneCount; i++) lanes.push(worker());
    await Promise.all(lanes);
    if (total) {
      persist();
      renderAll({ keepScroll: true });
      toast(fmt(t('toast.fetched'), { n: total }));
    }
    return total;
  }

  let refreshingAll = false;
  async function refreshAllFeeds(auto) {
    if (refreshingAll) return;
    if (!S.feeds.length) {
      if (!auto) toast(t('sidebar.noFeeds'));
      return;
    }
    refreshingAll = true;
    const btn = $('#refreshAllBtn');
    btn.classList.add('spinning');
    btn.disabled = true;
    if (!auto) toast(t('toast.refreshAllStart'));
    try {
      const total = await fetchFeedsInBackground(S.feeds, { quiet: auto });
      if (!total && !auto) toast(t('toast.upToDate'));
    } finally {
      refreshingAll = false;
      btn.classList.remove('spinning');
      btn.disabled = false;
    }
  }

  async function refreshFeed(id) {
    const f = feedById(id);
    if (!f) return;
    toast(fmt(t('toast.refreshing'), { name: f.title }));
    const result = await fetchFeed(f.url);
    if (!result) {
      toast(t('toast.refreshFail'));
      return;
    }
    const added = mergeFeedArticles(f, result);
    persist();
    renderAll({ keepScroll: true });
    toast(added ? fmt(t('toast.fetched'), { n: added }) : t('toast.upToDate'));
  }

  /* ---------------- 添加订阅源 ---------------- */
  function openFeedDialog(presetUrl, presetCategory) {
    feedForm.reset();
    feedStatus.hidden = true;
    feedSubmit.disabled = false;
    feedSubmit.textContent = t('feed.submit');
    fillCategorySelect(presetCategory || '');
    feedUrl.value = presetUrl || '';
    openModal(feedDialog);
    window.setTimeout(() => {
      if (presetUrl) feedTitleInput.focus();
      else feedUrl.focus();
    }, 70);
  }

  feedCatTrigger.addEventListener('click', openFeedCatMenu);

  feedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = feedUrl.value.trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      toast(t('toast.needUrl'));
      feedUrl.focus();
      return;
    }
    if (S.feeds.some((f) => f.url === url)) {
      toast(t('toast.duplicate'));
      return;
    }

    feedSubmit.disabled = true;
    feedSubmit.textContent = t('feed.adding');
    feedStatus.hidden = false;
    feedStatusText.textContent = t('feed.fetching');

    const result = await fetchFeed(url);
    const category = feedCatValue || '';
    let host = url;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch (err) {
      /* keep raw url */
    }
    const feed = {
      id: uid('f'),
      title: feedTitleInput.value.trim() || (result && result.title) || host,
      url: url,
      category: category,
      color: hashColor(url),
      desc: (result && result.desc) || '',
      site: (result && result.site) || ''
    };

    S.feeds.push(feed);
    let added = 0;
    if (result) {
      result.items.forEach((it, i) => {
        S.articles.push(articleFromItem(feed, it, i));
        added++;
      });
    }
    persist();

    feedStatus.hidden = true;
    feedSubmit.disabled = false;
    feedSubmit.textContent = t('feed.submit');
    if (feedDialog.open) feedDialog.close();

    S.ui.scope = 'feed:' + feed.id;
    S.ui.filter = 'all';
    persist();
    renderAll();

    if (added) {
      toast(fmt(t('toast.added'), { name: feed.title, n: added }));
      const first = S.articles.find((a) => a.feedId === feed.id);
      if (first && !isMobile()) selectArticle(first.id, { markRead: false });
    } else {
      toast(t('toast.savedNoFetch'), { duration: 5200 });
    }
  });

  /* ---------------- OPML ---------------- */
  function parseOpml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (!doc || doc.querySelector('parsererror')) throw new Error('bad opml');
    const out = [];

    const walk = (node, category) => {
      Array.prototype.slice.call(node.children || []).forEach((child) => {
        if (!child.tagName || child.tagName.toLowerCase() !== 'outline') return;
        const url = child.getAttribute('xmlUrl') || child.getAttribute('xmlurl');
        const label = child.getAttribute('title') || child.getAttribute('text') || '';
        if (url) {
          out.push({ title: label || url, url: url, category: category });
        } else if (child.children && child.children.length) {
          walk(child, label || category);
        }
      });
    };

    walk(doc.documentElement, '');
    return out;
  }

  function handleBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        let entries = null;

        /* 优先按本应用导出的 JSON 备份解析（只含订阅源信息与分组） */
        try {
          const data = JSON.parse(text);
          if (data && Array.isArray(data.feeds)) {
            entries = data.feeds
              .filter((f) => f && typeof f.url === 'string' && f.url.trim())
              .map((f) => ({
                title: (f.title || '').trim() || f.url.trim(),
                url: f.url.trim(),
                site: (f.site || '').trim(),
                desc: (f.desc || '').trim(),
                category: (f.category || '').trim()
              }));
          }
        } catch (err) { /* 不是 JSON，继续按 OPML 解析 */ }

        if (!entries) entries = parseOpml(text);

        if (!entries.length) {
          toast(t('toast.badOpml'));
          return;
        }
        let added = 0;
        let skipped = 0;
        const newFeeds = [];
        entries.forEach((entry) => {
          if (S.feeds.some((f) => f.url === entry.url)) {
            skipped++;
            return;
          }
          let catId = '';
          if (entry.category) {
            let cat = S.categories.find((c) => c.name === entry.category);
            if (!cat) {
              cat = { id: uid('c'), name: entry.category };
              S.categories.push(cat);
            }
            catId = cat.id;
          }
          const feed = {
            id: uid('f'),
            title: entry.title,
            url: entry.url,
            category: catId,
            color: hashColor(entry.url),
            desc: entry.desc || '',
            site: entry.site || ''
          };
          S.feeds.push(feed);
          newFeeds.push(feed);
          added++;
        });
        persist();
        renderAll();
        toast(fmt(t('toast.imported'), {
          n: added,
          skip: skipped ? fmt(t('toast.importSkipped'), { n: skipped }) : ''
        }));
        if (newFeeds.length) fetchFeedsInBackground(newFeeds);
      } catch (err) {
        toast(t('toast.badOpml'));
      }
    };
    reader.onerror = () => toast(t('toast.readFail'));
    reader.readAsText(file, 'utf-8');
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* 导出 JSON 备份：只含订阅源信息（名称/地址/站点/描述）与分组，不含文章数据 */
  function exportBackup() {
    const catName = (id) => {
      const c = S.categories.find((x) => x.id === id);
      return c ? c.name : '';
    };
    const data = {
      app: 'jianye-reader',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: S.categories.map((c) => ({ id: c.id, name: c.name })),
      feeds: S.feeds.map((f) => ({
        title: f.title,
        url: f.url,
        category: catName(f.category),
        site: f.site || '',
        desc: f.desc || ''
      }))
    };
    downloadFile('jianye-reader-backup.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    toast(fmt(t('toast.exported'), { n: S.feeds.length }));
  }

  /* ---------------- 设置 ---------------- */
  function openSettings() {
    applyTheme();
    applyFontSize();
    applyLang();
    motionSwitch.checked = !!S.ui.reduceMotion;
    openModal(settingsDialog);
  }

  /* ---------------- 事件绑定 ---------------- */
  menuBtn.addEventListener('click', () => {
    if (isMobile() && app.classList.contains('is-browsing')) {
      goHome();
      return;
    }
    toggleNav();
  });
  scrim.addEventListener('click', () => setNav(false));
  backBtn.addEventListener('click', closeReader);

  /* 主卡片固定为「全部文章」：点击随时返回全部视图 */
  $('#heroCard').addEventListener('click', () => {
    if (S.ui.scope !== 'all' || S.ui.filter !== 'all') setScope('all', 'all');
    browseTo();
  });

  $('#groupsToggle').addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('groups-collapsed');
    $('#groupsToggle').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });


  $$('.chip[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => setFilter(chip.dataset.filter));
  });

  sortBtn.addEventListener('click', () => {
    S.ui.sort = S.ui.sort === 'desc' ? 'asc' : 'desc';
    persist();
    renderList();
    toast(S.ui.sort === 'desc' ? t('sort.descToast') : t('sort.ascToast'));
  });

  markAllBtn.addEventListener('click', markAllMenu);

  articleList.addEventListener('click', (e) => {
    const item = e.target.closest('.article-item');
    if (!item) return;
    e.preventDefault();
    selectArticle(item.dataset.id);
  });

  readerDoc.addEventListener('click', (e) => {
    if (e.target.closest('[data-star-toggle]')) {
      e.preventDefault();
      toggleStar();
    }
  });

  starBtn.addEventListener('click', () => toggleStar());
  readBtn.addEventListener('click', () => toggleRead());

  $('#fontDec').addEventListener('click', () => {
    const order = ['small', 'normal', 'large'];
    S.ui.fontSize = order[clamp(order.indexOf(S.ui.fontSize) - 1, 0, order.length - 1)];
    applyFontSize();
    persist();
  });
  $('#fontInc').addEventListener('click', () => {
    const order = ['small', 'normal', 'large'];
    S.ui.fontSize = order[clamp(order.indexOf(S.ui.fontSize) + 1, 0, order.length - 1)];
    applyFontSize();
    persist();
  });

  readerScroll.addEventListener('scroll', updateProgress, { passive: true });

  searchInput.addEventListener('input', () => {
    searchClear.hidden = !searchInput.value;
    S.ui.query = searchInput.value;
    clearTimeout(searchInput._timer);
    searchInput._timer = window.setTimeout(() => {
      persist();
      renderList();
    }, 130);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      clearSearch();
      searchInput.blur();
    }
  });
  searchClear.addEventListener('click', () => {
    clearSearch();
    searchInput.focus();
  });

  searchToggle.addEventListener('click', () => {
    const open = searchWrap.classList.toggle('is-open');
    searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) window.setTimeout(() => searchInput.focus(), 120);
  });

  $('#emptyAddBtn').addEventListener('click', () => openFeedDialog());

  /* 侧边栏委托 */
  sidebar.addEventListener('click', (e) => {
    const av = e.target.closest('[data-feed-sheet]');
    if (av) {
      e.stopPropagation();
      openFeedSheet(av.dataset.feedSheet);
      return;
    }
    const more = e.target.closest('[data-feed-more]');
    if (more) {
      e.stopPropagation();
      openMenu(more, feedMenuItems(more.dataset.feedMore));
      return;
    }
    const feedBtn = e.target.closest('[data-feed]');
    if (feedBtn) {
      S.ui.scope = 'feed:' + feedBtn.dataset.feed;
      S.ui.filter = 'all';
      persist();
      renderSidebar();
      renderList();
      renderReader();
      browseTo();
      /* 平板是抽屉式导航：选完订阅源就把抽屉收起来，否则会一直挡在列表前面 */
      if (isCompact() && !isMobile()) setNav(false);
      return;
    }
    const catMore = e.target.closest('[data-cat-more]');
    if (catMore) {
      e.stopPropagation();
      const id = catMore.dataset.catMore;
      openMenu(catMore, [
        { label: t('menu.renameCat'), icon: 'i-edit', onClick: () => renameCategory(id) },
        { label: t('menu.addFeedToCat'), icon: 'i-plus', onClick: () => openFeedDialog('', id) },
        { divider: true },
        { label: t('menu.deleteCat'), icon: 'i-trash', danger: true, onClick: () => deleteCategory(id) }
      ]);
      return;
    }
    const catToggle = e.target.closest('[data-cat-toggle]');
    if (catToggle) {
      const key = catToggle.dataset.catToggle;
      S.ui.collapsed[key] = !S.ui.collapsed[key];
      persist();
      renderSidebar();
      return;
    }
    const catSelect = e.target.closest('[data-cat-select]');
    if (catSelect) {
      const id = catSelect.dataset.catSelect;
      S.ui.scope = 'cat:' + id;
      S.ui.filter = 'all';
      persist();
      renderSidebar();
      renderList();
      renderReader();
      browseTo();
      if (isCompact() && !isMobile()) setNav(false);
    }
  });

  sidebar.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.feed-row');
    if (!row) return;
    const btn = row.querySelector('[data-feed-more]');
    if (!btn) return;
    e.preventDefault();
    openMenu(btn, feedMenuItems(btn.dataset.feedMore));
  });

  /* 订阅源 / 导入导出 */
  $('#addFeedBtn').addEventListener('click', () => openFeedDialog());
  $('#refreshAllBtn').addEventListener('click', () => refreshAllFeeds());
  fab.addEventListener('click', () => openFeedDialog());
  $('#addCategoryBtn').addEventListener('click', addCategory);
  opmlInput.addEventListener('change', () => {
    const file = opmlInput.files && opmlInput.files[0];
    handleBackupFile(file);
    opmlInput.value = '';
  });

  /* 设置 */
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsImport').addEventListener('click', () => opmlInput.click());
  $('#settingsExport').addEventListener('click', exportBackup);
  $('#clearAllBtn').addEventListener('click', clearAllFeeds);

  /* 订阅源详情面板 */
  sheetGroups.addEventListener('click', (e) => {
    const newCatBtn = e.target.closest('[data-sheet-newcat]');
    if (newCatBtn) {
      if (!sheetFeedId) return;
      createCategoryInline((cat) => {
        const f = feedById(sheetFeedId);
        if (!f) return;
        f.category = cat.id;
        persist();
        renderAll({ keepScroll: true });
        openFeedSheet(sheetFeedId);
        toast(fmt(t('toast.movedTo'), { name: cat.name }));
      });
      return;
    }
    const btn = e.target.closest('[data-sheet-move]');
    if (!btn || !sheetFeedId) return;
    const f = feedById(sheetFeedId);
    if (!f) return;
    f.category = btn.dataset.sheetMove;
    persist();
    renderAll({ keepScroll: true });
    openFeedSheet(sheetFeedId);
    toast(f.category ? fmt(t('toast.movedTo'), { name: (catById(f.category) || {}).name || '' }) : t('toast.movedUncat'));
  });
  $('#sheetRefresh').addEventListener('click', () => {
    if (sheetFeedId) refreshFeed(sheetFeedId);
  });
  $('#sheetOpen').addEventListener('click', () => {
    const f = sheetFeedId && feedById(sheetFeedId);
    const url = absUrl((f && (f.site || f.url)) || '');
    if (url) window.open(url, '_blank', 'noopener');
  });
  $('#sheetRename').addEventListener('click', () => {
    const id = sheetFeedId;
    closeSheet();
    if (id) renameFeed(id);
  });
  $('#sheetClear').addEventListener('click', () => {
    if (sheetFeedId) clearFeedArticles(sheetFeedId);
  });
  $('#sheetUnsub').addEventListener('click', () => {
    const id = sheetFeedId;
    closeSheet();
    if (id) deleteFeed(id);
  });

  $$('#langSeg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      S.ui.lang = btn.dataset.langOpt;
      persist();
      applyLang();
      renderAll();
      /* 只刷新下拉里显示的分组名，不要清空用户已选的待用分组 */
      renderFeedCatValue();
      if (S.ui.lang === 'system') toast(t('toast.langAuto'));
    });
  });

  $$('#themeSeg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      S.ui.theme = btn.dataset.themeOpt;
      applyTheme();
      persist();
      if (S.ui.theme === 'system') toast(t('toast.themeSystem'));
    });
  });

  $$('#fontSeg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      S.ui.fontSize = btn.dataset.fontOpt;
      applyFontSize();
      persist();
    });
  });

  motionSwitch.addEventListener('change', () => {
    S.ui.reduceMotion = motionSwitch.checked;
    applyMotion();
    persist();
  });

  /* 通用关闭按钮 */
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close-dialog]');
    if (closer) {
      const dlg = closer.closest('dialog');
      if (dlg) dlg.close();
    }
  });

  /* 列表顶部虚化 */
  listScroll.addEventListener('scroll', () => {
    $('#listHeader').classList.toggle('is-scrolled', listScroll.scrollTop > 2);
  }, { passive: true });

  /* 键盘 */
  let pendingG = 0;

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const target = e.target;
    const typing =
      target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    const dialogOpen = !!document.querySelector('dialog[open]');

    if (e.key === 'Escape') {
      if (dialogOpen || typing) return;
      if (menuEl) {
        closeMenu();
        return;
      }
      if (app.classList.contains('nav-open')) {
        setNav(false);
        return;
      }
      if (app.classList.contains('is-reading')) {
        closeReader();
        return;
      }
      if (S.ui.query) {
        clearSearch();
        return;
      }
      return;
    }

    if (typing || dialogOpen) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.toLowerCase();

    if (key === '/') {
      e.preventDefault();
      if (isMobile() && !searchWrap.classList.contains('is-open')) {
        searchWrap.classList.add('is-open');
        searchToggle.setAttribute('aria-expanded', 'true');
      }
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (key === 'g') {
      pendingG = Date.now();
      return;
    }
    if (pendingG && Date.now() - pendingG < 900) {
      const map = { a: ['all', 'all'], u: ['all', 'unread'], s: ['all', 'starred'] };
      if (map[key]) {
        e.preventDefault();
        pendingG = 0;
        setScope(map[key][0], map[key][1]);
        return;
      }
      pendingG = 0;
    }

    const list = visibleArticles();
    if (!list.length) return;
    const currentIndex = list.findIndex((a) => a.id === S.ui.selectedId);

    if (key === 'j' || key === 'k') {
      e.preventDefault();
      const step = key === 'j' ? 1 : -1;
      const next = currentIndex === -1 ? 0 : clamp(currentIndex + step, 0, list.length - 1);
      selectArticle(list[next].id);
      return;
    }

    if (key === 'm') {
      if (!S.ui.selectedId) return;
      e.preventDefault();
      toggleRead();
      return;
    }

    if (key === 's') {
      if (!S.ui.selectedId) return;
      e.preventDefault();
      toggleStar();
    }
  });

  /* 响应式 */
  const mqCompact = window.matchMedia('(max-width: 1180px)');
  const mqMobile = window.matchMedia('(max-width: 767px)');
  function onViewportChange() {
    syncInert();
    updateProgress();
  }
  if (mqCompact.addEventListener) {
    mqCompact.addEventListener('change', onViewportChange);
    mqMobile.addEventListener('change', onViewportChange);
  } else if (mqCompact.addListener) {
    mqCompact.addListener(onViewportChange);
    mqMobile.addListener(onViewportChange);
  }

  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemTheme = () => {
    if (S.ui.theme === 'system') applyTheme();
  };
  if (mqDark.addEventListener) mqDark.addEventListener('change', onSystemTheme);
  else if (mqDark.addListener) mqDark.addListener(onSystemTheme);

  /* 涟漪 */
  document.addEventListener('pointerdown', (e) => {
    if (reduceMotion()) return;
    const target = e.target.closest('.btn-filled, .btn-tonal, .fab, .chip, .icon-btn, .hero-card');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.6;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = e.clientX - rect.left - size / 2 + 'px';
    ripple.style.top = e.clientY - rect.top - size / 2 + 'px';
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 640);
  });

  /* 桌面端无选中时自动展示第一篇 */
  function ensureSelection() {
    if (S.ui.selectedId && !articleById(S.ui.selectedId)) S.ui.selectedId = null;
    if (!S.ui.selectedId && !isMobile()) {
      const first = visibleArticles()[0];
      if (first) S.ui.selectedId = first.id;
    }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    normalizeState();
    applyLang();
    applyTheme();
    applyFontSize();
    applyMotion();
    fillCategorySelect();
    restoreSearchUI();
    ensureSelection();
    renderAll();
    syncInert();
    updateProgress();

    viewMeta.setAttribute('aria-live', 'polite');

    if (!localStorage.getItem(STORAGE_KEY)) saveNow();

    /* 每次进入页面自动静默刷新一次全部订阅源，等同自动刷新 */
    if (S.feeds.length) {
      window.setTimeout(() => refreshAllFeeds(true), 900);
    }
  }

  boot();
})();
