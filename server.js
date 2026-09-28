const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const UPSTREAM_ORIGIN = "https://roco-eggs.tsuki-world.com";
const MAP_DATA_ORIGIN = "http://wentao-home.cn/map_data";
const CALENDAR_ENDPOINT = "https://apii.xianyuw.cn/api/v1/rocom-calendar";
const PET_VIEWER_ORIGIN = "https://rocom.vip";
const CALENDAR_IMAGE_HOSTS = new Set(["game.gtimg.cn", "patchwiki.biligame.com"]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function queryUpstream(endpoint, body) {
  const response = await fetch(`${UPSTREAM_ORIGIN}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": UPSTREAM_ORIGIN,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`上游接口返回了无法解析的数据（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    const message = data && (data.message || data.error);
    throw new Error(message || `上游接口请求失败（HTTP ${response.status}）`);
  }

  return data;
}

async function handleLookup(url, response) {
  const uidValue = url.searchParams.get("uid");
  const uid = Number(uidValue);

  if (!uidValue || !Number.isSafeInteger(uid) || uid <= 0) {
    sendJson(response, 400, { error: "请输入有效的正整数玩家 UID。" });
    return;
  }

  const refresh = url.searchParams.get("refresh") === "true";
  const [homeResult, onlineResult] = await Promise.allSettled([
    queryUpstream("/api/home/query", { uid, refresh }),
    queryUpstream("/api/home/online-status", { uid }),
  ]);
  const home = homeResult.status === "fulfilled"
    ? { ok: true, data: homeResult.value }
    : { ok: false, error: homeResult.reason.message };
  const online = onlineResult.status === "fulfilled"
    ? { ok: true, data: onlineResult.value }
    : { ok: false, error: onlineResult.reason.message };

  sendJson(response, home.ok || online.ok ? 200 : 502, { uid, home, online });
}

async function handleAsset(url, response) {
  const assetPath = url.searchParams.get("path") || "";
  const allowedPath = /^\/(?:game-assets|home-assets|attr-icons)\/[A-Za-z0-9_./%-]+$/.test(assetPath);
  const hasTraversal = assetPath.split("/").some((segment) =>
    segment === "." || segment === ".." || /%(?:2e|2f|5c)/i.test(segment)
  );

  if (!allowedPath || hasTraversal) {
    sendJson(response, 400, { error: "无效的资源路径。" });
    return;
  }

  const upstream = await fetch(`${UPSTREAM_ORIGIN}${assetPath}`, {
    signal: AbortSignal.timeout(15000),
  });
  const contentType = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !contentType.startsWith("image/")) {
    sendJson(response, 502, { error: `家园图片加载失败（HTTP ${upstream.status}）。` });
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "public, max-age=3600",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

async function handleMapData(url, response) {
  const file = url.searchParams.get("file");
  if (!["metadata.json", "categories.json", "locations.json"].includes(file)) {
    sendJson(response, 400, { error: "无效的地图数据类型。" });
    return;
  }

  const upstream = await fetch(`${MAP_DATA_ORIGIN}/${file}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`地图资料加载失败（HTTP ${upstream.status}）。`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("地图资料服务返回了无法解析的数据。");
  }

  response.writeHead(200, {
    "Cache-Control": "public, max-age=300",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function handleCalendar(response) {
  const token = process.env.ROCO_CALENDAR_API_KEY;
  if (typeof token !== "string" || !token.trim()) {
    sendJson(response, 503, { error: "活动日历尚未配置 API Key，请在 Node.js 服务端设置 ROCO_CALENDAR_API_KEY。" });
    return;
  }

  const calendarUrl = new URL(CALENDAR_ENDPOINT);
  calendarUrl.searchParams.set("key", token.trim());
  const { statusCode, body } = await requestWithCurl(calendarUrl, {
    accept: "application/json",
    maxBytes: 2 * 1024 * 1024,
  });
  const text = body.toString("utf8");
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`活动日历接口返回了无法解析的数据（HTTP ${statusCode}）。`);
  }
  if (statusCode < 200 || statusCode >= 300) {
    const message = data && (data.message || data.error || data.detail);
    throw new Error(message || `活动日历接口请求失败（HTTP ${statusCode}），请检查 API Key。`);
  }

  sendJson(response, 200, data);
}

function requestWithCurl(url, { accept, maxBytes }) {
  return new Promise((resolve, reject) => {
    const curl = spawn(process.platform === "win32" ? "curl.exe" : "curl", [
      "--config", "-",
      "--silent",
      "--show-error",
      "--max-time", "15",
      "--write-out", "\n%{http_code}\n%{content_type}",
    ], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    curl.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        curl.kill();
        fail(new Error("活动日历响应超过允许的大小。"));
        return;
      }
      chunks.push(chunk);
    });
    curl.on("error", () => fail(new Error("无法启动系统 curl，请确认已安装 curl 并重试。")));
    curl.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error("上游请求失败，请检查服务器网络连接。"));
        return;
      }
      const output = Buffer.concat(chunks);
      const match = output.toString("latin1").match(/\r?\n(\d{3})\r?\n([^\r\n]*)$/);
      if (!match) {
        fail(new Error("上游接口未返回有效的 HTTP 状态码。"));
        return;
      }
      settled = true;
      resolve({
        statusCode: Number(match[1]),
        contentType: match[2],
        body: output.subarray(0, match.index),
      });
    });
    curl.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") fail(new Error("无法向 curl 发送活动日历请求。"));
    });
    curl.stdin.end(`url = ${JSON.stringify(url.href)}\nheader = ${JSON.stringify(`Accept: ${accept}`)}\n`);
  });
}

async function handleCalendarImage(url, response) {
  let imageUrl;
  try {
    imageUrl = new URL(url.searchParams.get("url") || "");
  } catch {
    sendJson(response, 400, { error: "无效的活动图片地址。" });
    return;
  }
  if (imageUrl.protocol !== "https:" || !CALENDAR_IMAGE_HOSTS.has(imageUrl.hostname) || imageUrl.username || imageUrl.password) {
    sendJson(response, 400, { error: "不支持该活动图片来源。" });
    return;
  }

  const { statusCode, contentType, body } = await requestWithCurl(imageUrl, {
    accept: "image/*",
    maxBytes: 8 * 1024 * 1024,
  });
  if (statusCode < 200 || statusCode >= 300 || !contentType.startsWith("image/")) {
    sendJson(response, 502, { error: `活动图片加载失败（HTTP ${statusCode}）。` });
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "public, max-age=3600",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function handlePetViewerConfig(response) {
  const { statusCode, body } = await requestWithCurl(new URL(`${PET_VIEWER_ORIGIN}/api/pet-viewer/config`), {
    accept: "application/json",
    maxBytes: 2 * 1024 * 1024,
  });
  if (statusCode < 200 || statusCode >= 300) {
    sendJson(response, 502, { error: `宠物展示配置读取失败（HTTP ${statusCode}）。` });
    return;
  }

  let config;
  try {
    config = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("宠物展示服务返回了无法解析的配置。");
  }
  if (!config || config.enabled !== true || !Array.isArray(config.pet?.models)) {
    sendJson(response, 502, { error: "宠物展示服务暂未提供可用的模型配置。" });
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "public, max-age=60",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(config));
}

async function handlePetViewerAsset(url, response) {
  const assetId = url.pathname.slice("/api/pet-viewer/asset/".length);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(assetId)) {
    sendJson(response, 400, { error: "无效的宠物资源地址。" });
    return;
  }

  const { statusCode, contentType, body } = await requestWithCurl(
    new URL(`${PET_VIEWER_ORIGIN}/api/pet-viewer/asset/${assetId}`),
    { accept: "image/*, model/gltf-binary, application/octet-stream", maxBytes: 16 * 1024 * 1024 },
  );
  if (statusCode < 200 || statusCode >= 300) {
    sendJson(response, 502, { error: `宠物模型资源读取失败（HTTP ${statusCode}）。` });
    return;
  }
  if (!/^(?:image\/|model\/gltf-binary|application\/octet-stream)/i.test(contentType)) {
    sendJson(response, 502, { error: "宠物资源服务返回了不支持的文件类型。" });
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "public, max-age=604800, immutable",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function serveStatic(url, response) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  let filePath;

  try {
    filePath = path.resolve(ROOT, `.${decodeURIComponent(requestedPath)}`);
  } catch {
    sendJson(response, 400, { error: "无效的请求路径。" });
    return;
  }

  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    sendJson(response, 403, { error: "禁止访问该路径。" });
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      sendJson(response, error.code === "ENOENT" ? 404 : 500, {
        error: error.code === "ENOENT" ? "页面不存在。" : "读取页面失败。",
      });
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/assets") {
    try {
      await handleAsset(url, response);
    } catch (error) {
      sendJson(response, 502, { error: error.message || "家园图片加载失败，请稍后重试。" });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/map-data") {
    try {
      await handleMapData(url, response);
    } catch (error) {
      sendJson(response, 502, { error: error.message || "地图资料加载失败，请稍后重试。" });
    }
    return;
  }

  if (url.pathname === "/api/calendar") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "活动日历接口仅支持 POST。" });
      return;
    }
    if (Number(request.headers["content-length"] || 0) > 0 || request.headers["transfer-encoding"]) {
      sendJson(response, 400, { error: "活动日历请求不接受客户端数据，API Key 仅由服务端读取。" });
      return;
    }
    try {
      await handleCalendar(response);
    } catch (error) {
      sendJson(response, error.statusCode || 502, {
        error: error.message || "活动日历加载失败，请稍后重试。",
      });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/calendar-image") {
    try {
      await handleCalendarImage(url, response);
    } catch (error) {
      sendJson(response, 502, { error: error.message || "活动图片加载失败，请稍后重试。" });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/pet-viewer/config") {
    try {
      await handlePetViewerConfig(response);
    } catch (error) {
      sendJson(response, 502, { error: error.message || "宠物展示配置读取失败，请稍后重试。" });
    }
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/pet-viewer/asset/")) {
    try {
      await handlePetViewerAsset(url, response);
    } catch (error) {
      sendJson(response, 502, { error: error.message || "宠物模型资源读取失败，请稍后重试。" });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/lookup") {
    try {
      await handleLookup(url, response);
    } catch (error) {
      sendJson(response, 502, { error: error.message || "查询上游接口失败，请稍后重试。" });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "不支持该请求方法。" });
    return;
  }

  serveStatic(url, response);
});

server.listen(PORT, () => {
  console.log(`洛克家园查询页面已启动：http://localhost:${PORT}`);
});
