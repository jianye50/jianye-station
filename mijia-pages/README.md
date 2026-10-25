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
