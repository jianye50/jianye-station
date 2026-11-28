/* =====================================================================
 * 鉴业VIP查询系统 · 密文工具（用户查询页 / 管理员生成页共用）
 * ---------------------------------------------------------------------
 * 纯前端方案，不依赖任何服务器和第三方库：
 *   打包：{用户名, 密码, VIP类型, 到期时间, 备注} → JSON → UTF-8 字节
 *         → 追加「校验和 + 长度」双保险 → 异或密钥流混淆 → Base64URL → JY1.前缀
 *   解包：逆向执行，校验和/长度对不上或密钥不对 → 直接抛错（视为解密失败）
 *
 * 配置文件 vip.txt 每行一条：  用户名|JY1.xxxxxxxx
 *   · 以 # 开头的行是注释，空行忽略
 *   · VIP、到期时间、备注全都藏在密文里，配置文件只露用户名和一串乱码
 *
 * 注意：这是「隐藏 + 防篡改」级别的混淆（防普通用户直接看懂配置），
 *       不是密码学级加密——密钥写在前端 JS 里，专业人士仍可逆向。
 *       不要把银行卡密码这类东西放进来。
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  /* 兼容两种环境：浏览器挂到 window.JYCipher，Node 挂到 module.exports
     （Node 只是拿来批量生成密文/演示账号用的，页面本身用不到） */
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JYCipher = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PREFIX = "JY1.";                       /* 密文版本前缀，以后换算法可升 JY2. */

  /* ---------- 字符串哈希（xmur3）：把任意密钥压成 4 个 32 位种子 ---------- */
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  /* ---------- sfc32 伪随机数流：由种子生成稳定可复现的密钥流 ---------- */
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  /* 由密钥派生 length 字节的密钥流（同一密钥永远得到同一串，加解密各用一次） */
  function keystream(secret, length) {
    var seed = xmur3("JY-VIP::" + secret);
    var next = sfc32(seed(), seed(), seed(), seed());
    var out = new Uint8Array(length);
    for (var i = 0; i < length; i++) out[i] = (next() * 256) | 0;
    return out;
  }

  /* ---------- Base64URL（URL 安全的 Base64，没有 +/ 和补位 =） ---------- */
  function b64urlEncode(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(str) {
    var s = str.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* =====================================================================
   * 加密：encrypt(信息对象, 密钥) → "JY1.xxxxx"
   * 信息对象字段（打包前会转成 JSON）：
   *   u : 用户名        p : 密码
   *   t : VIP类型       "permanent"=永久VIP | "time"=限时VIP | "none"=普通用户
   *   e : 到期日期      "YYYY-MM-DD"，永久 VIP 时为空字符串
   *   n : 备注          任意文本
   *   i : 签发时间戳    生成那一刻的时间，留档用
   * =================================================================== */
  function encrypt(obj, secret) {
    var data = new TextEncoder().encode(JSON.stringify(obj));
    /* 校验和：逐字节累加（带位置混淆），解密时重算比对，改一个字节都会失败 */
    var sum = 0, i;
    for (i = 0; i < data.length; i++) sum = (sum + data[i] + (i + 1)) & 0xff;
    /* 布局：[校验和1B][长度2B(低、高)][JSON数据...]  长度防截断/尾部拼接 */
    var buf = new Uint8Array(data.length + 3);
    buf[0] = sum;
    buf[1] = data.length & 0xff;
    buf[2] = (data.length >> 8) & 0xff;
    buf.set(data, 3);
    var ks = keystream(secret, buf.length);
    for (i = 0; i < buf.length; i++) buf[i] ^= ks[i];
    return PREFIX + b64urlEncode(buf);
  }

  /* =====================================================================
   * 解密：decrypt("JY1.xxxxx", 密钥) → 信息对象
   * 前缀不对 / Base64 不合法 / 密钥不对 / 校验和或长度对不上 → 抛 Error
   * （用户页把所有抛错一律按「账号或密码错误」处理，不泄露细节）
   * =================================================================== */
  function decrypt(text, secret) {
    if (typeof text !== "string" || text.indexOf(PREFIX) !== 0) throw new Error("格式不符");
    var buf = b64urlDecode(text.slice(PREFIX.length));
    var ks = keystream(secret, buf.length);
    var i;
    for (i = 0; i < buf.length; i++) buf[i] ^= ks[i];
    var len = buf[1] | (buf[2] << 8);
    if (3 + len !== buf.length) throw new Error("长度校验失败");
    var sum = 0;
    for (i = 0; i < len; i++) sum = (sum + buf[3 + i] + (i + 1)) & 0xff;
    if (sum !== buf[0]) throw new Error("校验和失败");
    return JSON.parse(new TextDecoder().decode(buf.subarray(3)));
  }

  return { encrypt: encrypt, decrypt: decrypt, PREFIX: PREFIX };
});
