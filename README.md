# 洛克家园 · 探索档案

一个使用原生 HTML、CSS、JavaScript 和 Node.js 构建的响应式家园信息查询页面。后端会并行请求家园数据与在线状态接口，并为上游请求添加必需的 `Origin` 和 `Content-Type` 请求头。

## 启动

需要 Node.js 18 或更高版本。项目不需要安装 npm 依赖；活动日历上游请求和图片代理使用系统 `curl`（Windows 通常为 `curl.exe`）。

```sh
npm start
```

浏览器访问 <http://localhost:3000>。可通过 `PORT` 环境变量修改监听端口，例如：

```powershell
$env:PORT = 8080
node server.js
```

在页面输入正整数玩家 UID 后点击“开始探索”。勾选“强制刷新”会将 `refresh: true` 发送给家园查询接口；未勾选时使用缓存。两个接口分别展示结果，因此其中一个暂时不可用时，另一个仍会正常显示。

点击首页的“世界地图”或直接访问 <http://localhost:3000/map.html> 可打开洛克王国世界互动地图。地图支持地点搜索、类别筛选、标记详情、缩放和拖动。地图资料来自洛克王国世界工具站，底图与标记素材来自 [17173 互动地图](https://map.17173.com/rocom/maps/shijie)，页面内保留来源标注。

点击首页的“活动日历”或访问 <http://localhost:3000/calendar.html> 可按月查看游戏活动。活动 API Key 只在 Node.js 服务端通过 `ROCO_CALENDAR_API_KEY` 环境变量配置，页面和浏览器请求中不会出现 API Key。活动 API 地址为 `https://apii.xianyuw.cn/api/v1/rocom-calendar`，使用 `?key=` 参数鉴权。页面显示接口返回的日历图片，以及活动名称、图片和起止日期。

点击导航中的“洛语翻译”或访问 <http://localhost:3000/rune.html>，可使用洛语字体输入符文并实时查看对应的英文字符。页面提供虚拟键盘、大小写切换、复制和清空功能；字体文件位于 `fonts/RUNEREGULAR.ttf`。

点击导航中的“宠物展示”或访问 <http://localhost:3000/pet-viewer.html>，可使用 Three.js 交互查看宠物模型、切换模型形态与外观、调整表情并播放模型动作。配置与模型资源由 Node.js 代理 `https://rocom.vip/api/pet-viewer/` 接口按需加载，页面会标注数据来源。

## GitHub Pages + 腾讯云函数部署

本项目包含 GitHub Pages 静态站点工作流 `.github/workflows/pages.yml` 和 Tencent SCF 后端 `tencent-scf/`。Pages 工作流只发布页面、前端脚本、样式和洛语字体，不会上传 Node.js 本地服务器或云函数。

1. 将项目提交到 GitHub 仓库，并在 `tencent-scf/README.md` 的说明下创建 Node.js 18+ 云函数和 API 网关触发器。
2. 在云函数环境变量中设置 `ROCO_CALENDAR_API_KEY`，将 `CORS_ALLOWED_ORIGINS` 设置为 GitHub Pages 站点来源，例如 `https://你的用户名.github.io`（不要附加仓库路径），并为宠物模型资源配置 COS 缓存（见 `tencent-scf/README.md`）。
3. 将 API 网关 HTTPS 服务地址填入 `api-config.js` 的 `ROCO_API_BASE_URL`，包含发布环境前缀但不带末尾斜线或 `/api`。
4. 在 GitHub 仓库设置中将 Pages 来源设为 **GitHub Actions**。推送默认分支后工作流会发布站点；其他分支只构建，不发布。
5. 部署后验证家园查询、地图数据、活动日历及宠物模型加载。COS/CDN 用于绕过云函数同步响应的大小限制并缓存 GLB 模型。

本地开发时 `api-config.js` 的 API 地址保持空字符串，请继续通过 `npm start` 使用项目内置 Node.js 服务端。

PowerShell 配置示例：

```powershell
$env:ROCO_CALENDAR_API_KEY = "你的活动日历 API Token"
npm start
```
