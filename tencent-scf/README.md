# 腾讯云函数后端

该目录包含 GitHub Pages 前端使用的无依赖 Node.js 云函数。函数为家园查询、地图数据和活动日历提供 API；宠物配置由云函数获取，宠物 GLB/PNG 资源由 GitHub Pages 直接托管。活动日历 API Key 只从云函数环境变量读取。

## 创建函数

1. 在腾讯云函数控制台创建 Node.js 18 或更高版本的**云函数**，入口文件为 `index.js`，执行方法为 `main_handler`。
2. 本函数无 npm 依赖。将 `index.js`、`package.json` 和 `package-lock.json` 上传；运行时选择 Node.js 18 或更高版本。
3. 为函数配置 HTTP 触发器 / API 网关，转发 `GET`、`POST`、`OPTIONS` 请求，并将 `/api/{proxy+}` 原样交给函数。需要确保触发器把 query string、请求头和路径传入事件。
4. 在环境变量中配置：
   - `ROCO_CALENDAR_API_KEY`：活动日历服务端密钥；可选，未配置时日历 API 返回明确的 503。
   - `CORS_ALLOWED_ORIGINS`：允许访问函数的站点 Origin，多个值用英文逗号分隔，例如 `https://example.github.io,https://example.com`。本地开发也可加入 `http://localhost:3000`。为方便内测可设为 `*`，正式公开部署建议改为精确来源。
   - `PET_ASSET_BASE_URL`：GitHub Pages 上 `pet-assets/` 目录的 HTTPS 地址，例如 `https://用户名.github.io/仓库名/pet-assets`，不带末尾斜线。
5. 如使用腾讯云 API 网关，允许 OPTIONS 预检，并在 API 网关中启用 IP 访问频率限制。CORS 来源限制不是访问控制或防滥用措施。

部署完成后，复制 API 网关的 HTTPS 服务地址（含发布环境前缀，例如 `https://service.apigw.tencentcs.com/release`），填写到仓库根目录的 `api-config.js`：

```js
window.ROCO_API_BASE_URL = "https://service.apigw.tencentcs.com/release";
```

该地址应**不含末尾斜线和 `/api`**。活动密钥只放在云函数环境变量中，切勿写入 GitHub Pages 配置。

## 支持的接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/lookup?uid=8833235&refresh=false` | 家园资料与在线状态 |
| `GET` | `/api/assets?path=/home-assets/...` | 家园图片 |
| `GET` | `/api/map-data?file=locations.json` | 地图数据 |
| `POST` | `/api/calendar` | 活动日历数据 |
| `GET` | `/api/calendar-image?url=https%3A...` | 日历图片代理 |
| `GET` | `/api/pet-viewer/config` | 宠物模型配置 |
| 静态文件 | `/仓库名/pet-assets/{资源 ID}.glb` 或 `.png` | GitHub Pages 上的宠物模型及贴图 |

模型配置 API 会将资源 URL 改写为 `PET_ASSET_BASE_URL` 下的 GitHub Pages 静态文件。请先将获得再分发授权的宠物资源提交并成功发布，再配置 `PET_ASSET_BASE_URL`。无需创建 COS 桶，也无需把 COS 密钥设在云函数。
