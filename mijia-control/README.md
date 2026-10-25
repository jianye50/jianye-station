# 米家控制台（Cloudflare Worker）

一个部署在 Cloudflare Workers 上的网页版米家控制面板：打开网址 → 扫码登录 → 直接控制米家设备。无需自建服务器，无需抓包获取 token。

底层通过 HMAC-SHA256 签名调用小米云端 `api.io.mi.com`，签名与扫码登录流程参考了开源项目 [Zayrick/小米 IoT 反向代理及扫码登录服务](https://gist.github.com/Zayrick/62701850c833c4051356268fa9afc3ff)。

## 功能

- ✅ 米家 App 扫码登录（token 只存在你自己浏览器的 localStorage）
- ✅ 自动拉取设备列表，通过 miot-spec 规格自动生成控制项：开关、亮度/温度滑块、模式下拉
- ✅ 状态刷新、离线设备标识
- ✅ 高级调试面板：可对任意设备手动发送 miot 属性 / miio 指令
- ✅ 可选访问密码（`ACCESS_PASSWORD`），防止陌生人打开网址就能控制你家

## 项目结构

```
mijia-control/
├── worker.js      # 全部代码：Worker 后端（签名代理+扫码登录）+ 内置 HTML 面板
├── wrangler.toml  # Cloudflare 配置
└── package.json
```

## 部署方式一：网页 Dashboard（推荐，5 分钟）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application** → **Create Worker**，取个名字（如 `mijia-control`）。
2. 点击 **Edit code**，把本目录 `worker.js` 的全部内容粘贴进去覆盖默认代码，点 **Deploy**。
3. 设置访问密码：Worker 的 **Settings → Variables and Secrets → Add**，类型选 Secret，变量名 `ACCESS_PASSWORD`，值为你的密码。
4. 访问 `https://你的worker名.你的子域.workers.dev`，输入密码 → 用米家 App 扫码 → 完成。

## 部署方式二：命令行

```bash
cd mijia-control
npm install
npx wrangler login
npx wrangler secret put ACCESS_PASSWORD   # 输入你的密码
npm run deploy
```

本地调试：`npm run dev`（需在同目录建 `.dev.vars` 文件写入 `ACCESS_PASSWORD=你的密码`）。

## 使用说明

- **设备没有控制项？** 大部分支持 miot-spec 的设备会自动生成控制项；少数老设备走 miio 协议，用底部"高级调试"面板，路径填 `/app/miio/call`，data 填 `{"did":"设备ID","method":"get_prop","params":["power"]}` 这类指令。
- **控制失败？** token 一般几周到几个月有效，失效后页面会提示重新扫码（点右上角"退出登录"再扫码即可）。
- 想看设备有哪些属性（siid/piid），可查 [home.miot-spec.org](https://home.miot-spec.org/)。

## ⚠️ 风险与注意事项

- 本项目使用小米**非官方** API，存在账号风控、cookie 失效的可能，请自行评估；建议先用小号或测试设备验证。
- **务必设置 `ACCESS_PASSWORD`**：serviceToken/ssecurity 等同于你全部米家设备的控制权，无密码的公开网址等于把家敞开。
- 扫码二维码图片由第三方服务 `api.qrserver.com` 生成（二维码内容是一次性登录链接，风险较低），介意可自行在本地生成二维码。
- 凭证保存在浏览器 localStorage 中，请勿在公用电脑登录。

## 相关开源项目

- [Zayrick 米家签名代理 Gist](https://gist.github.com/Zayrick/62701850c833c4051356268fa9afc3ff) —— 本项目签名/扫码流程参考
- [XiaoMi/ha_xiaomi_home](https://github.com/XiaoMi/ha_xiaomi_home) —— 小米官方 Home Assistant 集成（更稳妥的全屋方案）
- [Do1e/mijia-api](https://github.com/Do1e/mijia-api) —— Python 米家云 SDK
