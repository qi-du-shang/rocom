# 腾讯云函数后端

该目录包含 GitHub Pages 前端使用的无依赖 Node.js 云函数。函数为家园查询、地图数据、活动日历、宠物展示和图片资源提供同源代理，并将活动日历 API Key 保留在云函数环境变量中。

## 创建函数

1. 在腾讯云函数控制台创建 Node.js 18 或更高版本的**云函数**，入口文件为 `index.js`，执行方法为 `main_handler`。
2. 在本目录运行 `npm install --omit=dev`，将 `index.js`、`package.json`、`package-lock.json` 和 `node_modules` 一并打包上传；运行时选择 Node.js 18 或更高版本。
3. 为函数配置 HTTP 触发器 / API 网关，转发 `GET`、`POST`、`OPTIONS` 请求，并将 `/api/{proxy+}` 原样交给函数。需要确保触发器把 query string、请求头和路径传入事件。
4. 在环境变量中配置：
   - `ROCO_CALENDAR_API_KEY`：活动日历服务端密钥；可选，未配置时日历 API 返回明确的 503。
   - `CORS_ALLOWED_ORIGINS`：允许访问函数的站点 Origin，多个值用英文逗号分隔，例如 `https://example.github.io,https://example.com`。本地开发也可加入 `http://localhost:3000`。为方便内测可设为 `*`，正式公开部署建议改为精确来源。
   - `COS_BUCKET`、`COS_REGION`、`COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_PUBLIC_BASE_URL`：**宠物展示必需**，用于缓存超过云函数同步响应限制的 GLB 模型。COS SecretId/SecretKey 仅设在云函数环境变量，不要提交到 Git。
5. 创建腾讯云 COS 存储桶，并为存储桶配置跨域规则：允许来源为 GitHub Pages 站点 Origin，允许方法 `GET`、`HEAD`、`OPTIONS`，允许请求头 `*`。配置 `COS_PUBLIC_BASE_URL` 为桶的 HTTPS 访问域名或绑定的 CDN 域名。函数会将宠物资源缓存到 `roco-pet-viewer/`，浏览器随后直接从 COS/CDN 读取，避免大模型以 Base64 穿过云函数/API 网关。
6. 如使用腾讯云 API 网关，允许 OPTIONS 预检，并在 API 网关中启用 IP 访问频率限制。CORS 来源限制不是访问控制或防滥用措施。

首次拉取并缓存大型 GLB 时，建议将云函数超时时间设为至少 60 秒、内存设为至少 512 MB，并确保出站网络可访问上游及 COS。

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
| `GET` | `/api/pet-viewer/asset/{id}` | 宠物模型和贴图 |

`COS_PUBLIC_BASE_URL` 是资源域名，不是云函数 API 地址；该域名需要支持 HTTPS，并配置上述 CORS 规则。请在部署后分别测试 JSON 接口、CORS OPTIONS 预检、宠物 GLB 首次缓存和之后从 COS/CDN 读取。

若未配置 COS，函数仅会直接返回不超过 4 MiB 的宠物资源；更大的模型会显示明确错误，避免触发云函数/API 网关同步响应体积限制。
