// =====================================================================
// 米家控制台 —— Cloudflare Pages 高级模式（_worker.js）
// 用法：把本文件放在网站根目录，与 index.html 一起拖拽上传到 Pages 即可。
// /api/* 与 /app/* 由本文件处理；其余请求回落到静态资源（index.html）。
// 签名与扫码登录流程参考：github.com/Zayrick gist 62701850c833c4051356268fa9afc3ff
// =====================================================================

const SID = 'xiaomiio'
const MSG_URL = 'https://account.xiaomi.com/pass/serviceLogin?sid=' + SID + '&_json=true'
const QR_URL = 'https://account.xiaomi.com/longPolling/loginUrl'
const API_HOST = 'https://api.io.mi.com'
const SPEC_HOST = 'https://miot-spec.org'
const DEFAULT_UA = 'APP/com.xiaomi.mihome APPV/6.0.103 iosPassportSDK/3.9.0 iOS/14.4 miHSTS'
const LP_TIMEOUT_MS = 60

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

// ---------- 扫码登录（无状态：每次请求自带 lp/deviceId，不依赖服务端会话） ----------
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
  return { loginUrl: qrJson.loginUrl, lp: qrJson.lp, deviceId }
}

// 长轮询一次扫码结果；未扫到则返回 pending，由前端继续重试
async function pollQRCode(lp, deviceId) {
  const lpResp = await fetch(lp, {
    headers: { 'User-Agent': DEFAULT_UA, Connection: 'keep-alive' },
    cf: { fetchTimeout: LP_TIMEOUT_MS }
  })
  if (lpResp.status !== 200) return { status: 'pending' }
  const lpJson = JSON.parse((await lpResp.text()).slice(11))
  if (lpJson.code !== 0) return { status: 'pending' }

  const jumpResp = await fetch(lpJson.location, {
    headers: { 'User-Agent': DEFAULT_UA, Cookie: 'deviceId=' + deviceId + '; sdkVersion=3.4.1' }
  })
  const serviceToken = extractCookie(jumpResp.headers, 'serviceToken')
  if (!serviceToken) return { status: 'error', error: '未获取到 serviceToken' }
  return {
    status: 'success',
    data: {
      userId: String(lpJson.userId),
      ssecurity: lpJson.ssecurity,
      deviceId,
      serviceToken
    }
  }
}

// ---------- 米家 API 签名转发 ----------
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

// ---------- 路由：/api/* 与 /app/* 在此处理，其余走静态资源 ----------
// 支持部署在任意子目录（如 /mijia-pages/api/...）：取路径中最后一段 /api/ 或 /app/ 之后的部分来路由
function locateApi(path) {
  let i = path.lastIndexOf('/api/')
  if (i >= 0) return { kind: 'api', sub: path.slice(i) }        // 如 '/api/login/start'
  i = path.lastIndexOf('/app/')
  if (i >= 0) return { kind: 'app', sub: path.slice(i) }        // 如 '/app/miotspec/prop/set'
  return null
}

async function handle(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  const loc = locateApi(path)
  if (!loc) return null
  const sub = loc.sub

  if (!checkPin(request, env)) return json({ error: '访问密码错误' }, 401)

  // 开始扫码：返回二维码链接与长轮询地址（无状态）
  if (request.method === 'GET' && sub === '/api/login/start') {
    try {
      return json(await initQRCodeSession())
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // 轮询扫码结果
  if (request.method === 'GET' && sub === '/api/login/poll') {
    const lp = url.searchParams.get('lp') || ''
    const deviceId = url.searchParams.get('deviceId') || ''
    if (!lp || !deviceId) return json({ error: '缺少参数' }, 400)
    try {
      return json(await pollQRCode(lp, deviceId))
    } catch (e) {
      return json({ status: 'pending' })
    }
  }

  // miot-spec 规格代理
  if (request.method === 'GET' && sub === '/api/spec') {
    const type = url.searchParams.get('type') || ''
    if (!type.startsWith('urn:miot-spec')) return json({ error: '非法 type' }, 400)
    const r = await fetch(SPEC_HOST + '/miot-spec-v2/instance?type=' + encodeURIComponent(type))
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=UTF-8', ...cors() } })
  }

  // 米家 API 签名转发
  if (request.method === 'POST' && loc.kind === 'app') {
    try {
      return await proxyMiAPI(request, sub)
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // 未匹配到已知接口：回落到静态资源，避免误伤站点其他页面
  return null
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() })
    try {
      const resp = await handle(request, env)
      if (resp) return resp
    } catch (e) {
      return json({ error: e.message }, 500)
    }
    return env.ASSETS.fetch(request) // 静态资源（index.html 等）
  }
}
