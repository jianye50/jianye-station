// =====================================================================
// 米家控制台 —— Cloudflare Worker
// 功能：扫码登录 / 米家 API 签名转发 / 内置 HTML 控制面板 / 访问密码保护
// 参考（签名与扫码流程）：github.com/Zayrick gist 62701850c833c4051356268fa9afc3ff
// =====================================================================

const SID = 'xiaomiio'
const MSG_URL = 'https://account.xiaomi.com/pass/serviceLogin?sid=' + SID + '&_json=true'
const QR_URL = 'https://account.xiaomi.com/longPolling/loginUrl'
const API_HOST = 'https://api.io.mi.com'
const SPEC_HOST = 'https://miot-spec.org'
const DEFAULT_UA = 'APP/com.xiaomi.mihome APPV/6.0.103 iosPassportSDK/3.9.0 iOS/14.4 miHSTS'
const QR_TIMEOUT_MS = 60000

// 扫码会话暂存（实例内存级，扫码流程是短时的，足够用）
const sessions = new Map()

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Pin'
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...cors() }
  })
}

// ---------- 访问密码 ----------
function checkPin(request, env) {
  const pw = env && env.ACCESS_PASSWORD
  if (!pw) return true // 未设置密码则不启用保护
  return request.headers.get('X-Access-Pin') === pw
}

// ---------- 签名工具 ----------
function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function uint8ToBase64(buf) {
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

function randomString(len = 16) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let res = ''
  for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length))
  return res
}

function generateNonce() {
  const randomBytes = new Uint8Array(8)
  crypto.getRandomValues(randomBytes)
  const time = Math.floor(Date.now() / 1000 / 60)
  const timeBytes = new Uint8Array([(time >> 24) & 0xff, (time >> 16) & 0xff, (time >> 8) & 0xff, time & 0xff])
  const combined = new Uint8Array(12)
  combined.set(randomBytes)
  combined.set(timeBytes, 8)
  return uint8ToBase64(combined)
}

async function generateSignedNonce(secret, nonce) {
  const secretBytes = base64ToUint8Array(secret)
  const nonceBytes = base64ToUint8Array(nonce)
  const combined = new Uint8Array(secretBytes.length + nonceBytes.length)
  combined.set(secretBytes)
  combined.set(nonceBytes, secretBytes.length)
  const hash = await crypto.subtle.digest('SHA-256', combined)
  return uint8ToBase64(new Uint8Array(hash))
}

async function generateSignature(urlPath, signedNonce, nonce, data) {
  const signString = urlPath + '&' + signedNonce + '&' + nonce + '&data=' + data
  const key = await crypto.subtle.importKey(
    'raw', base64ToUint8Array(signedNonce),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signString))
  return uint8ToBase64(new Uint8Array(signature))
}

function extractCookie(headers, name) {
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() === 'set-cookie' && v.split(';')[0].split('=')[0] === name) {
      return v.split(';')[0].split('=').slice(1).join('=')
    }
  }
  return ''
}

// ---------- 扫码登录 ----------
async function initQRCodeSession() {
  const deviceId = randomString(16)
  const indexResp = await fetch(MSG_URL, {
    headers: { 'User-Agent': DEFAULT_UA, Cookie: 'deviceId=' + deviceId + '; sdkVersion=3.4.1' }
  })
  if (indexResp.status !== 200) throw new Error('获取 index 失败')
  const idxJson = JSON.parse((await indexResp.text()).slice(11))
  const { qs, _sign, callback, location } = idxJson
  const serviceParam = new URL(location).searchParams.get('serviceParam')

  const params = new URLSearchParams({
    _qrsize: '240', qs, bizDeviceType: '', callback, _json: 'true',
    theme: '', sid: SID, needTheme: 'false', showActiveX: 'false',
    serviceParam, _local: 'zh_CN', _sign, _dc: Date.now().toString()
  })
  const qrResp = await fetch(QR_URL + '?' + params.toString(), {
    headers: { 'User-Agent': DEFAULT_UA, Referer: MSG_URL }
  })
  if (qrResp.status !== 200) throw new Error('获取二维码失败')
  const qrJson = JSON.parse((await qrResp.text()).slice(11))
  if (qrJson.code !== 0) throw new Error('QR 接口错误: ' + qrJson.desc)
  return { deviceId, loginUrl: qrJson.loginUrl, lp: qrJson.lp }
}

async function waitLogin(sessionKey) {
  const sess = sessions.get(sessionKey)
  if (!sess) return
  try {
    const { lp, deviceId } = sess
    const lpResp = await fetch(lp, {
      headers: { 'User-Agent': DEFAULT_UA, Connection: 'keep-alive' },
      cf: { fetchTimeout: QR_TIMEOUT_MS / 1000 }
    })
    if (lpResp.status !== 200) throw new Error('长轮询状态 ' + lpResp.status)
    const lpJson = JSON.parse((await lpResp.text()).slice(11))
    if (lpJson.code !== 0) throw new Error(lpJson.desc || '扫码未完成或已超时')

    const jumpResp = await fetch(lpJson.location, {
      headers: { 'User-Agent': DEFAULT_UA, Cookie: 'deviceId=' + deviceId + '; sdkVersion=3.4.1' }
    })
    const serviceToken = extractCookie(jumpResp.headers, 'serviceToken')
    if (!serviceToken) throw new Error('未获取到 serviceToken')
    const auth = {
      userId: String(lpJson.userId),
      ssecurity: lpJson.ssecurity,
      deviceId,
      serviceToken
    }
    sessions.set(sessionKey, { ...sess, status: 'success', data: auth })
  } catch (e) {
    sessions.set(sessionKey, { ...sess, status: 'error', err: e.message })
  }
}

// ---------- 签名转发到米家 API ----------
async function proxyMiAPI(request, path) {
  const bodyJson = await request.json()
  const { userId, serviceToken, deviceId, securityToken, data } = bodyJson || {}
  if (!userId || !serviceToken || !deviceId || !securityToken || data === undefined) {
    return json({ error: '缺少身份验证信息或 data 字段' }, 400)
  }
  const miPath = path.replace(/^\/app/, '')
  const nonce = generateNonce()
  const signedNonce = await generateSignedNonce(securityToken, nonce)
  const dataString = typeof data === 'string' ? data : JSON.stringify(data)
  const signature = await generateSignature(miPath, signedNonce, nonce, dataString)

  const formParams = new URLSearchParams({ _nonce: nonce, data: dataString, signature })
  const remote = await fetch(API_HOST + path, {
    method: 'POST',
    headers: {
      'User-Agent': DEFAULT_UA,
      'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: 'serviceToken=' + serviceToken + '; userId=' + userId + '; PassportDeviceId=' + deviceId
    },
    body: formParams
  })
  const respHeaders = new Headers(remote.headers)
  Object.entries(cors()).forEach(([k, v]) => respHeaders.set(k, v))
  return new Response(remote.body, { status: remote.status, headers: respHeaders })
}

// =====================================================================
// 主路由
// =====================================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() })

    // 控制面板
    if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
      return new Response(PANEL_HTML, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
    }

    // ---- 以下接口需要访问密码（若设置了 ACCESS_PASSWORD）----
    if (!checkPin(request, env)) {
      return json({ error: '访问密码错误' }, 401)
    }

    // 开始扫码登录
    if (request.method === 'GET' && path === '/api/login/start') {
      try {
        const { deviceId, loginUrl, lp } = await initQRCodeSession()
        const id = randomString(16)
        sessions.set(id, { status: 'pending', loginUrl, lp, deviceId, createdAt: Date.now() })
        ctx.waitUntil(waitLogin(id))
        return json({ id, loginUrl })
      } catch (e) {
        return json({ error: e.message }, 500)
      }
    }

    // 轮询扫码结果
    if (request.method === 'GET' && path === '/api/login/status') {
      const id = url.searchParams.get('id') || ''
      const sess = sessions.get(id)
      if (!sess) return json({ status: 'not_found' }, 404)
      const resp = { status: sess.status || 'pending' }
      if (sess.status === 'success') resp.data = sess.data
      else if (sess.status === 'error') resp.error = sess.err
      if (sess.status === 'success' || sess.status === 'error') sessions.delete(id)
      return json(resp)
    }

    // miot-spec 规格代理（供面板解析设备可控制的属性）
    if (request.method === 'GET' && path === '/api/spec') {
      const type = url.searchParams.get('type') || ''
      if (!type.startsWith('urn:miot-spec')) return json({ error: '非法 type' }, 400)
      const r = await fetch(SPEC_HOST + '/miot-spec-v2/instance?type=' + encodeURIComponent(type))
      return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=UTF-8', ...cors() } })
    }

    // 米家 API 签名转发
    if (request.method === 'POST' && path.startsWith('/app/')) {
      try {
        return await proxyMiAPI(request, path)
      } catch (e) {
        return json({ error: e.message }, 500)
      }
    }

    return new Response('Not Found', { status: 404, headers: cors() })
  }
}

// =====================================================================
// 内置控制面板（HTML）
// =====================================================================
const PANEL_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>米家控制台</title>
<style>
  :root {
    --bg: #0d1117; --card: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #ff6900; --ok: #3fb950; --off: #6e7681;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; min-height: 100vh; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 10; }
  header h1 { font-size: 18px; font-weight: 600; }
  header .btns { display: flex; gap: 8px; }
  button { background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
  main { max-width: 1080px; margin: 0 auto; padding: 24px; }
  .view { display: none; }
  .view.active { display: block; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
  .device { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .device h3 { font-size: 15px; margin-bottom: 4px; word-break: break-all; }
  .device .model { color: var(--muted); font-size: 12px; margin-bottom: 10px; word-break: break-all; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .dot.on { background: var(--ok); } .dot.off { background: var(--off); }
  .ctl { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; font-size: 13px; }
  .ctl label { color: var(--muted); flex-shrink: 0; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ctl input[type=range] { width: 130px; accent-color: var(--accent); }
  .ctl select { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; max-width: 150px; }
  .switch { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .switch span { position: absolute; inset: 0; background: var(--off); border-radius: 24px; transition: .2s; cursor: pointer; }
  .switch span:before { content: ""; position: absolute; width: 18px; height: 18px; border-radius: 50%; left: 3px; top: 3px; background: #fff; transition: .2s; }
  .switch input:checked + span { background: var(--accent); }
  .switch input:checked + span:before { transform: translateX(20px); }
  .login-box { max-width: 360px; margin: 60px auto; text-align: center; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 32px 24px; }
  .login-box h2 { margin-bottom: 8px; }
  .login-box p { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
  #qrImg { width: 220px; height: 220px; border-radius: 12px; background: #fff; display: none; margin: 0 auto 12px; }
  #loginMsg { color: var(--muted); font-size: 13px; margin-top: 12px; min-height: 18px; }
  input[type=password], input[type=text] { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font-size: 14px; width: 100%; margin-bottom: 12px; }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--card); border: 1px solid var(--border); padding: 10px 20px; border-radius: 10px; font-size: 13px; display: none; z-index: 99; }
  details { margin-top: 24px; color: var(--muted); font-size: 13px; }
  details textarea { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px; font-family: monospace; font-size: 12px; min-height: 80px; margin: 8px 0; }
  .err-full { text-align: center; padding: 40px; color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1>🏠 米家控制台</h1>
  <div class="btns">
    <button id="btnRefresh" onclick="refreshAll()">刷新状态</button>
    <button onclick="logout()">退出登录</button>
  </div>
</header>
<main>

  <!-- 登录视图 -->
  <div id="viewLogin" class="view">
    <div class="login-box">
      <h2>扫码登录</h2>
      <p>使用米家 App 扫描二维码，登录后即可在网页控制设备。凭证只保存在你本机浏览器。</p>
      <div id="pinRow">
        <input type="password" id="pinInput" placeholder="访问密码（未设置可留空）">
        <button class="primary" style="width:100%" onclick="startLogin()">生成二维码</button>
      </div>
      <img id="qrImg" alt="二维码">
      <div id="loginMsg"></div>
      <div id="manualRow" style="display:none; margin-top:16px; text-align:left;">
        <input type="text" id="manualJson" placeholder='粘贴 {userId, serviceToken, deviceId, ssecurity} JSON'>
        <button style="width:100%" onclick="manualImport()">手动导入凭证</button>
      </div>
    </div>
  </div>

  <!-- 设备视图 -->
  <div id="viewDevices" class="view">
    <div class="card-grid" id="grid"></div>
    <details>
      <summary>高级调试（自定义 API 调用）</summary>
      <p style="margin-top:8px">路径（如 /app/miotspec/prop/set 或 /app/miio/call）与 data JSON，将自动签名转发到米家 API：</p>
      <textarea id="dbgPath" placeholder="/app/miio/call"></textarea>
      <textarea id="dbgData" placeholder='{"did":"123","method":"get_prop","params":["power"]}'></textarea>
      <button class="primary" onclick="debugCall()">发送</button>
      <pre id="dbgOut" style="margin-top:8px; color:var(--text); white-space:pre-wrap;"></pre>
    </details>
  </div>

</main>
<div class="toast" id="toast"></div>
<script>
(function () {
  var LS_CREDS = 'mijia_creds', LS_PIN = 'mijia_pin', LS_SPEC = 'mijia_spec_v1'
  var creds = null
  try { creds = JSON.parse(localStorage.getItem(LS_CREDS)) } catch (e) {}

  function $(id) { return document.getElementById(id) }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.style.display = 'block'
    clearTimeout(t._h); t._h = setTimeout(function () { t.style.display = 'none' }, 2500)
  }
  function showView(name) {
    $('viewLogin').classList.toggle('active', name === 'login')
    $('viewDevices').classList.toggle('active', name === 'devices')
  }

  // ---- 带密码头的请求 ----
  function api(path, opts) {
    opts = opts || {}
    opts.headers = Object.assign({ 'X-Access-Pin': localStorage.getItem(LS_PIN) || '' }, opts.headers || {})
    return fetch(path, opts)
  }

  // ---- 登录流程 ----
  window.startLogin = function () {
    var pin = $('pinInput').value.trim()
    localStorage.setItem(LS_PIN, pin)
    $('loginMsg').textContent = '正在生成二维码...'
    api('/api/login/start').then(function (r) { return r.json() }).then(function (j) {
      if (j.error) { $('loginMsg').textContent = '失败：' + j.error; return }
      $('qrImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(j.loginUrl)
      $('qrImg').style.display = 'block'
      $('loginMsg').textContent = '请用米家 App 扫码'
      pollLogin(j.id, 0)
    }).catch(function (e) { $('loginMsg').textContent = '网络错误：' + e.message })
  }

  function pollLogin(id, n) {
    if (n > 60) { $('loginMsg').textContent = '二维码已超时，请重新生成'; return }
    api('/api/login/status?id=' + id).then(function (r) { return r.json() }).then(function (j) {
      if (j.status === 'pending') { setTimeout(function () { pollLogin(id, n + 1) }, 2000); return }
      if (j.status === 'success') {
        creds = j.data
        localStorage.setItem(LS_CREDS, JSON.stringify(creds))
        toast('登录成功')
        showView('devices'); loadDevices()
      } else {
        $('loginMsg').textContent = '登录失败：' + (j.error || j.status) + '（也可用下方手动导入）'
        $('manualRow').style.display = 'block'
      }
    }).catch(function () { setTimeout(function () { pollLogin(id, n + 1) }, 2000) })
  }

  window.manualImport = function () {
    try {
      var j = JSON.parse($('manualJson').value)
      if (!j.userId || !j.serviceToken || !j.ssecurity) { toast('JSON 缺少字段'); return }
      creds = { userId: String(j.userId), serviceToken: j.serviceToken, ssecurity: j.ssecurity, deviceId: j.deviceId || '' }
      localStorage.setItem(LS_CREDS, JSON.stringify(creds))
      toast('导入成功'); showView('devices'); loadDevices()
    } catch (e) { toast('JSON 解析失败') }
  }

  window.logout = function () {
    localStorage.removeItem(LS_CREDS); creds = null
    showView('login'); $('qrImg').style.display = 'none'; $('loginMsg').textContent = ''
  }

  // ---- 米家 API 调用 ----
  function miCall(path, data) {
    return api('/app/' + path.replace(/^\\/+/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: creds.userId, serviceToken: creds.serviceToken,
        deviceId: creds.deviceId, securityToken: creds.ssecurity, data: data
      })
    }).then(function (r) { return r.json() })
  }

  // ---- 设备列表 ----
  var devices = []
  window.loadDevices = function () {
    if (!creds) return
    toast('加载设备中...')
    miCall('/home/device_list', { start: 0, limit: 200, getExtendedInfoFromOs: 1 }).then(function (j) {
      if (j.code !== 0 || !j.result || !j.result.list) {
        toast('获取设备失败：' + (j.message || j.error || 'token 可能已失效，请退出重新扫码'))
        return
      }
      devices = j.result.list
      renderAll()
    })
  }

  // ---- spec 解析与渲染 ----
  var specCache = {}
  try { specCache = JSON.parse(localStorage.getItem(LS_SPEC)) || {} } catch (e) {}

  function getSpec(type) {
    if (!type) return Promise.resolve(null)
    if (specCache[type]) return Promise.resolve(specCache[type])
    return api('/api/spec?type=' + encodeURIComponent(type)).then(function (r) { return r.json() }).then(function (j) {
      var inst = j.instance || null
      if (inst) { specCache[type] = inst; try { localStorage.setItem(LS_SPEC, JSON.stringify(specCache)) } catch (e) {} }
      return inst
    }).catch(function () { return null })
  }

  // 从 spec 提取可控制属性
  function extractControls(inst) {
    if (!inst) return []
    var out = []
    inst.services.forEach(function (svc) {
      (svc.properties || []).forEach(function (p) {
        var access = p.access || []
        var ctl = { siid: p.siid, piid: p.piid, name: (p.description && p.description !== '' ? p.description : p.name) || (p.siid + '-' + p.piid) }
        if (access.indexOf('write') >= 0) {
          if (p.format === 'bool') ctl.kind = 'bool'
          else if (p.format === 'uint8' || p.format === 'uint16' || p.format === 'uint32' || p.format === 'int8' || p.format === 'int16' || p.format === 'int32' || p.format === 'float') {
            if (p['value-range'] && p['value-range'].length === 3) {
              ctl.kind = 'range'; ctl.min = p['value-range'][0]; ctl.max = p['value-range'][1]; ctl.step = p['value-range'][2]
            } else if (p['value-list'] && p['value-list'].length) { ctl.kind = 'enum'; ctl.list = p['value-list'] }
          }
        }
        if (ctl.kind && access.indexOf('read') >= 0) ctl.readable = true
        if (ctl.kind) out.push(ctl)
      })
    })
    return out.slice(0, 6)
  }

  function renderAll() {
    var grid = $('grid'); grid.innerHTML = ''
    devices.forEach(function (d, idx) {
      var card = document.createElement('div')
      card.className = 'device'
      card.id = 'dev-' + d.id
      var online = d.is_online !== false && d.is_online !== 0
      card.innerHTML = '<h3><span class="dot ' + (online ? 'on' : 'off') + '"></span>' + esc(d.name) + '</h3>' +
        '<div class="model">' + esc(d.model) + ' · did ' + esc(String(d.id)) + '</div>' +
        '<div class="ctls" id="ctls-' + d.id + '"><div class="ctl"><label>加载中...</label></div></div>'
      grid.appendChild(card)
      getSpec(d.spec_type).then(function (inst) {
        var box = $('ctls-' + d.id)
        if (!inst) {
          box.innerHTML = '<div class="ctl"><label>无 miot 规格，可用下方调试面板手动控制</label></div>'
          return
        }
        var ctls = extractControls(inst)
        if (!ctls.length) { box.innerHTML = '<div class="ctl"><label>该设备无可直接写的属性</label></div>'; return }
        box.innerHTML = ''
        ctls.forEach(function (c) {
          var row = document.createElement('div'); row.className = 'ctl'
          var label = document.createElement('label'); label.textContent = c.name; row.appendChild(label)
          if (c.kind === 'bool') {
            var sw = document.createElement('div'); sw.className = 'switch'
            sw.innerHTML = '<input type="checkbox" onchange="setProp(' + idx + ',' + c.siid + ',' + c.piid + ',this.checked,this)"><span></span>'
            row.appendChild(sw)
          } else if (c.kind === 'range') {
            var rg = document.createElement('input'); rg.type = 'range'
            rg.min = c.min; rg.max = c.max; rg.step = c.step
            rg.setAttribute('onchange', 'setProp(' + idx + ',' + c.siid + ',' + c.piid + ',Number(this.value),this)')
            row.appendChild(rg)
          } else if (c.kind === 'enum') {
            var sel = document.createElement('select')
            sel.innerHTML = '<option value="">--</option>' + c.list.map(function (v) {
              return '<option value="' + v.value + '">' + esc(v.description || String(v.value)) + '</option>'
            }).join('')
            sel.setAttribute('onchange', 'setProp(' + idx + ',' + c.siid + ',' + c.piid + ',Number(this.value),this)')
            row.appendChild(sel)
          }
          box.appendChild(row)
        })
        refreshDevice(idx)
      })
    })
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

  window.setProp = function (idx, siid, piid, value, el) {
    var d = devices[idx]
    toast('发送指令...')
    miCall('/miotspec/prop/set', { params: [{ did: String(d.id), siid: siid, piid: piid, value: value }] }).then(function (j) {
      var ok = j.code === 0 && j.result && j.result[0] && j.result[0].code === 0
      toast(ok ? '设置成功' : '设置失败：' + JSON.stringify(j.result || j.message || j))
      if (!ok && el && el.type === 'checkbox') el.checked = !el.checked
    }).catch(function (e) { toast('网络错误：' + e.message) })
  }

  window.refreshAll = function () {
    if (!creds) return
    devices.forEach(function (_, idx) { refreshDevice(idx) })
  }

  function refreshDevice(idx) {
    var d = devices[idx]
    var inst = d.spec_type ? specCache[d.spec_type] : null
    if (!inst) return
    var reads = []
    inst.services.forEach(function (svc) {
      (svc.properties || []).forEach(function (p) {
        if ((p.access || []).indexOf('read') >= 0) reads.push({ did: String(d.id), siid: p.siid, piid: p.piid })
      })
    })
    if (!reads.length) return
    miCall('/miotspec/prop/get', { params: reads.slice(0, 60) }).then(function (j) {
      if (j.code !== 0 || !j.result) return
      var box = $('ctls-' + d.id)
      if (!box) return
      j.result.forEach(function (r) {
        if (r.code !== 0) return
        var sel2 = 'input[type=range], select'
        var nodes = box.querySelectorAll(sel2)
        nodes.forEach(function (node) {
          var attr = node.getAttribute('onchange') || ''
          var m = attr.match(/setProp\\(\\d+,(\\d+),(\\d+),/)
          if (m && Number(m[1]) === r.siid && Number(m[2]) === r.piid) {
            if (node.type === 'range') node.value = r.value
            else if (node.tagName === 'SELECT' && r.value !== null && r.value !== undefined) node.value = String(r.value)
          }
        })
        var cbs = box.querySelectorAll('input[type=checkbox]')
        cbs.forEach(function (cb) {
          var attr = cb.getAttribute('onchange') || ''
          var m = attr.match(/setProp\\(\\d+,(\\d+),(\\d+),/)
          if (m && Number(m[1]) === r.siid && Number(m[2]) === r.piid) cb.checked = !!r.value
        })
      })
    })
  }

  // ---- 调试 ----
  window.debugCall = function () {
    var path = $('dbgPath').value.trim()
    var data
    try { data = JSON.parse($('dbgData').value) } catch (e) { $('dbgOut').textContent = 'data JSON 解析失败'; return }
    api('/app/' + path.replace(/^\\/+/, ''), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: creds.userId, serviceToken: creds.serviceToken, deviceId: creds.deviceId, securityToken: creds.ssecurity, data: data })
    }).then(function (r) { return r.json() }).then(function (j) {
      $('dbgOut').textContent = JSON.stringify(j, null, 2)
    })
  }

  // ---- 启动 ----
  if (creds && creds.serviceToken && creds.ssecurity) { showView('devices'); loadDevices() }
  else { showView('login') }
})()
</script>
</body>
</html>`
