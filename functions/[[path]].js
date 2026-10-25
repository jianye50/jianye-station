// =====================================================================
// 米家控制台后端 —— Cloudflare Pages Functions catch-all 路由
// 挂到 /api/login/*、/api/spec、/app/*；其余请求回落静态资源，
// 与 functions/api/kg.js 等现有接口互不影响（具体路由优先于 catch-all）。
//
// 米家 API 采用 RC4 加密参数方案（rc4_hash__ + 加密 data + signature +
// ssecurity + _nonce），与 Do1e/mijia-api、micloud 等实现一致；
// 扫码登录流程参考：github.com/Zayrick gist 62701850c833c4051356268fa9afc3ff
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

// ---------- 编解码工具 ----------
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

// ---------- RC4（米家云加密方案，前 1024 字节丢弃） ----------
function rc4Crypt(keyBytes, dataBytes) {
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) s[i] = i
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + keyBytes[i % keyBytes.length]) & 0xff
    const t = s[i]; s[i] = s[j]; s[j] = t
  }
  const out = new Uint8Array(dataBytes.length)
  let i = 0; j = 0
  const total = 1024 + dataBytes.length
  for (let k = 0; k < total; k++) {
    i = (i + 1) & 0xff
    j = (j + s[i]) & 0xff
    const t = s[i]; s[i] = s[j]; s[j] = t
    const c = s[(s[i] + s[j]) & 0xff]
    if (k >= 1024) out[k - 1024] = dataBytes[k - 1024] ^ c
  }
  return out
}

// ---------- 米家签名 ----------
// nonce：8 字节随机数 + 分钟级时间戳（大端）
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

// signedNonce = base64(SHA256(ssecurity || nonce))
async function generateSignedNonce(secret, nonce) {
  const secretBytes = base64ToUint8Array(secret)
  const nonceBytes = base64ToUint8Array(nonce)
  const combined = new Uint8Array(secretBytes.length + nonceBytes.length)
  combined.set(secretBytes)
  combined.set(nonceBytes, secretBytes.length)
  const hash = await crypto.subtle.digest('SHA-256', combined)
  return uint8ToBase64(new Uint8Array(hash))
}

// encSignature = base64(SHA1("POST&<uri>&k1=v1&k2=v2&...&<signedNonce>"))
async function encSignature(uri, method, signedNonce, params) {
  const parts = [method.toUpperCase(), uri]
  for (const [k, v] of Object.entries(params)) parts.push(k + '=' + v)
  parts.push(signedNonce)
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(parts.join('&')))
  return uint8ToBase64(new Uint8Array(hash))
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

// ---------- 米家 API 请求（RC4 加密方案） ----------
// uri 形如 '/home/home_device_list'（不含 /app 前缀）；实际请求 api.io.mi.com/app<uri>
async function miRequest(creds, uri, data) {
  const ssecurity = creds.securityToken
  const nonce = generateNonce()
  const signedNonce = await generateSignedNonce(ssecurity, nonce)
  const dataStr = JSON.stringify(data)
  const keyBytes = base64ToUint8Array(signedNonce)
  const te = new TextEncoder()

  // 1. rc4_hash__ 对明文参数签名
  const plainParams = { data: dataStr }
  const rc4Hash = await encSignature(uri, 'POST', signedNonce, plainParams)

  // 2. 用 signedNonce 作 RC4 密钥加密各参数值
  const encData = uint8ToBase64(rc4Crypt(keyBytes, te.encode(dataStr)))
  const encHash = uint8ToBase64(rc4Crypt(keyBytes, te.encode(rc4Hash)))

  // 3. 对加密后的参数再签名
  const signature = await encSignature(uri, 'POST', signedNonce, { data: encData, rc4_hash__: encHash })

  const form = new URLSearchParams({
    data: encData,
    rc4_hash__: encHash,
    signature,
    ssecurity,
    _nonce: nonce
  })
  const remote = await fetch(API_HOST + '/app' + uri, {
    method: 'POST',
    headers: {
      'User-Agent': DEFAULT_UA,
      'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
      'miot-encrypt-algorithm': 'ENCRYPT-RC4',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: 'serviceToken=' + creds.serviceToken + '; yetAnotherServiceToken=' + creds.serviceToken +
        '; userId=' + creds.userId + '; PassportDeviceId=' + creds.deviceId +
        '; locale=zh_CN; timezone=GMT+08:00; timezone_id=Asia/Shanghai; countryCode=CN'
    },
    body: form
  })
  const text = (await remote.text()).trim()
  // 响应可能是明文 JSON，也可能是 RC4 加密的（需用 signedNonce 解密）
  try {
    return JSON.parse(text)
  } catch (e) {
    try {
      const dec = rc4Crypt(keyBytes, base64ToUint8Array(text))
      return JSON.parse(new TextDecoder().decode(dec))
    } catch (e2) {
      return { code: -1, message: '响应解析失败: ' + text.slice(0, 150) }
    }
  }
}

// ---------- 路由识别：支持任意子目录前缀（如 /mijia-pages/api/...） ----------
function locateApi(path) {
  let i = path.lastIndexOf('/api/')
  if (i >= 0) return { kind: 'api', sub: path.slice(i) }        // 如 '/api/login/start'
  i = path.lastIndexOf('/app/')
  if (i >= 0) return { kind: 'app', sub: path.slice(i) }        // 如 '/app/miotspec/prop/set'
  return null
}

async function handle(request, env) {
  const url = new URL(request.url)
  const loc = locateApi(url.pathname)
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

  // 米家 API 签名转发（RC4 加密方案）
  if (request.method === 'POST' && loc.kind === 'app') {
    try {
      const bodyJson = await request.json()
      const { userId, serviceToken, deviceId, securityToken, data } = bodyJson || {}
      if (!userId || !serviceToken || !deviceId || !securityToken || data === undefined) {
        return json({ error: '缺少身份验证信息或 data 字段' }, 400)
      }
      // 前端路径 '/app/miotspec/prop/set' → 米家 uri '/miotspec/prop/set'
      const uri = sub.replace(/^\/app/, '')
      return json(await miRequest({ userId, serviceToken, deviceId, securityToken }, uri, data))
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // 未匹配到已知接口：交给后续处理（静态资源等），避免误伤站点其他页面
  return null
}

export async function onRequest(context) {
  const { request, env } = context
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() })
  try {
    const resp = await handle(request, env)
    if (resp) return resp
  } catch (e) {
    return json({ error: e.message }, 500)
  }
  return context.next()
}
