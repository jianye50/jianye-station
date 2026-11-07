# 米家控制台（Cloudflare Pages 版）

一个部署在 **Cloudflare Pages** 上的网页版米家控制面板：打开网址 → 扫码登录 → 直接控制米家设备。无需单独的 Worker，后端由 Pages Functions 承担，前后端一个项目搞定。

底层通过 HMAC-SHA256 签名调用小米云端 `api.io.mi.com`，签名与扫码登录流程参考开源项目 [Zayrick/小米 IoT 反向代理及扫码登录服务](https://gist.github.com/Zayrick/62701850c833c4051356268fa9afc3ff)。

## 项目结构

```
mijia-pages/
├── index.html            # 控制面板（扫码登录 / 设备卡片 / 开关滑块 / 调试面板）
├── _worker.js            # Pages 高级模式后端：扫码登录、米家 API 签名转发、spec 代理
├── wrangler.toml
└── package.json
```

> 采用 Pages「高级模式」（`_worker.js`）：Dashboard 拖拽上传**不支持** `functions` 目录，但支持 `_worker.js`，所以用这种结构，拖拽即可部署前后端。

## 功能

- ✅ 米家 App 扫码登录（凭证只存在你自己浏览器的 localStorage）
- ✅ 自动拉取设备列表，通过 miot-spec 自动生成控制项：开关、亮度/温度滑块、模式下拉
- ✅ 状态刷新、离线设备标识
- ✅ 高级调试面板：手动发送 miot 属性 / miio 指令（兜底老设备）
- ✅ 可选访问密码（`ACCESS_PASSWORD`），防止陌生人控制你家
- ✅ 摄像头卡片：控制项（开关/夜视/水印等）+ 通过 go2rtc 播放实时画面（需自建转流，见下文）

## 摄像头实时画面（go2rtc）

**先说清楚能力边界**：本页面走的是小米云的属性接口（`api.io.mi.com`），这条通道只传开关量，**不传视频**。小米摄像头视频是端到端加密的 P2P 流，只能在米家 App 内解密（小米官方 Home Assistant 集成也明确表示不会支持）。所以网页里要看画面，必须在本机做一次转流。

`go2rtc` 已原生支持 `xiaomi` 协议源（v1.9.13+），做法：

1. **下载** [go2rtc releases](https://github.com/AlexxIT/go2rtc/releases) 的 `go2rtc_win64.zip`，解压到任意目录，双击 `go2rtc.exe`（保持窗口开着）。
2. **打开配置台** `http://localhost:1984` → 右侧 **Add** → 选 **Xiaomi** → 输入小米账号密码，按提示填邮箱/短信验证码与滑块。
3. 登录成功后该页会列出你的摄像头，**点开能直接看到画面**；记下流名称（通常形如 `xiaomi1`，配置里 `streams:` 下那一行）。
4. 回到本页面，摄像头卡片点 **配置视频流**：
   - **go2rtc 地址**：`http://192.168.1.10:1984`（换成运行 go2rtc 那台电脑的**局域网 IP**，`ipconfig` 可查；不能写 `localhost`，手机/其他设备访问不到）
   - **流名称**：`xiaomi1`
5. 保存即出画面（配置存在浏览器 localStorage，换设备需重填一次）。

**两个硬约束**：

- go2rtc 必须和摄像头在**同一个局域网**（它直连摄像头 P2P），但每次连接都要联网向小米取密钥。
- 摄像头要**开机且在线**；老款 `tutk` 协议的机型可能不稳定，见 [支持机型列表](https://github.com/AlexxIT/go2rtc/issues/1982)。

**HTTPS 页面看不到画面？** 浏览器会拦截 https 页面里的 http 流（混合内容）。三选一：

- 用 http 打开本页（本地 `http://localhost:8788` 或局域网 IP 访问）；
- 给 go2rtc 套一层 HTTPS：`cloudflared tunnel --url http://localhost:1984`，把拿到的 `https://xxx.trycloudflare.com` 填进「go2rtc 地址」；
- 点卡片上的「新窗口打开」直接在浏览器标签页里看。


## 部署到已有网站的子目录

如果想挂在现有站点下（如 `你的域名/mijia-pages/`），而不是独立首页：

1. 把 `_worker.js` 放到**部署根目录**（Pages 高级模式只认根目录的 `_worker.js`），它只接管 `/api/*` 和 `/app/*` 请求，站点其他页面照常由静态资源服务，互不影响；
2. `index.html`（可改名为 `mijia-pages/index.html`）放在任意子目录，前端已自动按页面所在路径请求接口；
3. 重新上传整个站点文件夹，访问 `你的域名/mijia-pages/` 即可。

> 也可以更省事：单独建一个 Pages 项目，把 `mijia-pages` 文件夹整个拖进去，得到独立的 `xxx.pages.dev` 网址，完全不碰现有站点。

## 部署方式一：Dashboard 直接上传（最简单）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → 选 **Pages** → **Upload assets**（直接上传）。
2. 项目取名（如 `mijia-control`），把整个 `mijia-pages` **文件夹**拖进去（根目录必须包含 `_worker.js` 和 `index.html`）→ **Deploy**。`_worker.js` 会被 Cloudflare 自动识别为后端。
3. 设置访问密码：进入该项目 → **Settings → Variables and Secrets** → 添加变量 `ACCESS_PASSWORD`（类型 Secret，值为你的密码，Production 和 Preview 都加）→ **重新部署一次**使其生效。
4. 访问 `https://你的项目名.pages.dev`，输入密码 → 米家 App 扫码 → 完成。

## 部署方式二：命令行

```bash
cd mijia-pages
npm install
npx wrangler pages deploy .
```

首次运行会引导登录 Cloudflare 并创建项目（同样会自动带上 `_worker.js`）。设置密码：

```bash
npx wrangler pages secret put ACCESS_PASSWORD --project-name=mijia-control
```

本地调试：`npm run dev`（需在同目录建 `.dev.vars` 写入 `ACCESS_PASSWORD=你的密码`），访问 http://localhost:8788。

## 使用说明

- **设备没有控制项？** 少数老设备走 miio 协议，用底部"高级调试"面板：路径填 `/app/miio/call`，data 填 `{"did":"设备ID","method":"get_prop","params":["power"]}`。
- **token 失效？** 一般几周到几个月有效，失效后点右上角"退出登录"重新扫码即可。
- 想看设备有哪些属性（siid/piid），可查 [home.miot-spec.org](https://home.miot-spec.org/)。

## ⚠️ 风险与注意事项

- 本项目使用小米**非官方** API，存在账号风控、cookie 失效的可能，请自行评估；建议先用小号或测试设备验证。
- **务必设置 `ACCESS_PASSWORD`**：serviceToken/ssecurity 等同于你全部米家设备的控制权，无密码的公开网址等于把家敞开。
- 扫码二维码图片由第三方服务 `api.qrserver.com` 生成（内容是一次性登录链接，风险较低），介意可自行本地生成。
- 凭证保存在浏览器 localStorage，请勿在公用电脑登录。

## 相关开源项目

- [Zayrick 米家签名代理 Gist](https://gist.github.com/Zayrick/62701850c833c4051356268fa9afc3ff) —— 本项目签名/扫码流程参考
- [XiaoMi/ha_xiaomi_home](https://github.com/XiaoMi/ha_xiaomi_home) —— 小米官方 Home Assistant 集成（更稳妥的全屋方案）
- [Do1e/mijia-api](https://github.com/Do1e/mijia-api) —— Python 米家云 SDK
