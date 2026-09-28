"use strict";

const UPSTREAM_ORIGIN = "https://roco-eggs.tsuki-world.com";
const MAP_DATA_ORIGIN = "http://wentao-home.cn/map_data";
const CALENDAR_ENDPOINT = "https://apii.xianyuw.cn/api/v1/rocom-calendar";
const PET_VIEWER_ORIGIN = "https://rocom.vip";
const CALENDAR_IMAGE_HOSTS = new Set(["game.gtimg.cn", "patchwiki.biligame.com"]);
const MAX_PET_ASSET_BYTES = 16 * 1024 * 1024;
const MAX_INLINE_PET_ASSET_BYTES = 4 * 1024 * 1024;
let cosClient;

function getRequest(event) {
  const requestContext = event.requestContext || {};
  const httpContext = requestContext.http || {};
  const method = String(event.httpMethod || httpContext.method || "GET").toUpperCase();
  const rawPath = event.rawPath || event.path || httpContext.path || "/";
  const routeStart = rawPath.indexOf("/api/");
  const path = routeStart >= 0 ? rawPath.slice(routeStart) : rawPath;
  const rawQueryString = event.rawQueryString
    || (typeof event.queryString === "string" ? event.queryString : "");
  const query = new URLSearchParams(rawQueryString);
  const queryParameters = event.queryStringParameters
    || (event.queryString && typeof event.queryString === "object" ? event.queryString : {});

  for (const [key, value] of Object.entries(queryParameters)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const origin = event.headers?.origin || event.headers?.Origin || "";

  return { method, path, query, origin };
}

function getCosConfig() {
  const { COS_BUCKET, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY, COS_PUBLIC_BASE_URL } = process.env;
  if (![COS_BUCKET, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY, COS_PUBLIC_BASE_URL].every((value) => value?.trim())) {
    return null;
  }
  return {
    bucket: COS_BUCKET.trim(),
    region: COS_REGION.trim(),
    publicBaseUrl: COS_PUBLIC_BASE_URL.trim().replace(/\/+$/, ""),
  };
}

function getCosClient() {
  if (cosClient) return cosClient;
  const { COS_SECRET_ID, COS_SECRET_KEY, TENCENTCLOUD_SESSIONTOKEN } = process.env;
  const COS = require("cos-nodejs-sdk-v5");
  cosClient = new COS({
    SecretId: COS_SECRET_ID,
    SecretKey: COS_SECRET_KEY,
    ...(TENCENTCLOUD_SESSIONTOKEN ? { SecurityToken: TENCENTCLOUD_SESSIONTOKEN } : {}),
  });
  return cosClient;
}

function callCos(method, params) {
  return new Promise((resolve, reject) => {
    getCosClient()[method](params, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function redirectResponse(location, corsHeaders) {
  return {
    statusCode: 302,
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, max-age=604800, immutable",
      "Location": location,
    },
    body: "",
    isBase64Encoded: false,
  };
}

function getCorsHeaders(origin) {
  const allowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowedOrigin = allowedOrigins.includes("*")
    ? "*"
    : allowedOrigins.includes(origin) ? origin : "";

  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function jsonResponse(statusCode, payload, corsHeaders) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(payload),
    isBase64Encoded: false,
  };
}

function binaryResponse(statusCode, contentType, buffer, corsHeaders, cacheControl = "public, max-age=3600") {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "Cache-Control": cacheControl,
      "Content-Type": contentType,
    },
    body: buffer.toString("base64"),
    isBase64Encoded: true,
  };
}

async function fetchResponse(url, options = {}, timeoutMs = 20000) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label}返回了无法解析的数据（HTTP ${response.status}）。`);
  }
  if (!response.ok) {
    const message = data && (data.message || data.error || data.detail);
    throw new Error(message || `${label}请求失败（HTTP ${response.status}）。`);
  }
  return data;
}

async function handleLookup(query, headers) {
  const uidValue = query.get("uid");
  const uid = Number(uidValue);
  if (!uidValue || !Number.isSafeInteger(uid) || uid <= 0) {
    return jsonResponse(400, { error: "请输入有效的正整数玩家 UID。" }, headers);
  }

  const refresh = query.get("refresh") === "true";
  const request = (endpoint, body) => fetchResponse(`${UPSTREAM_ORIGIN}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": UPSTREAM_ORIGIN,
    },
    body: JSON.stringify(body),
  }, 15000).then((response) => readJsonResponse(response, "家园接口"));

  const [homeResult, onlineResult] = await Promise.allSettled([
    request("/api/home/query", { uid, refresh }),
    request("/api/home/online-status", { uid }),
  ]);
  const home = homeResult.status === "fulfilled"
    ? { ok: true, data: homeResult.value }
    : { ok: false, error: homeResult.reason.message };
  const online = onlineResult.status === "fulfilled"
    ? { ok: true, data: onlineResult.value }
    : { ok: false, error: onlineResult.reason.message };
  return jsonResponse(home.ok || online.ok ? 200 : 502, { uid, home, online }, headers);
}

async function handleHomeAsset(query, headers) {
  const assetPath = query.get("path") || "";
  const allowed = /^\/(?:game-assets|home-assets|attr-icons)\/[A-Za-z0-9_./%-]+$/.test(assetPath);
  const traversal = assetPath.split("/").some((part) =>
    part === "." || part === ".." || /%(?:2e|2f|5c)/i.test(part)
  );
  if (!allowed || traversal) {
    return jsonResponse(400, { error: "无效的资源路径。" }, headers);
  }
  const response = await fetchResponse(`${UPSTREAM_ORIGIN}${assetPath}`, {}, 15000);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.startsWith("image/")) {
    return jsonResponse(502, { error: `家园图片加载失败（HTTP ${response.status}）。` }, headers);
  }
  return binaryResponse(200, contentType, Buffer.from(await response.arrayBuffer()), headers);
}

async function handleMapData(query, headers) {
  const file = query.get("file");
  if (!["metadata.json", "categories.json", "locations.json"].includes(file)) {
    return jsonResponse(400, { error: "无效的地图数据类型。" }, headers);
  }
  const response = await fetchResponse(`${MAP_DATA_ORIGIN}/${file}`, {
    headers: { Accept: "application/json" },
  });
  const data = await readJsonResponse(response, "地图资料");
  return jsonResponse(200, data, {
    ...headers,
    "Cache-Control": "public, max-age=300",
  });
}

async function handleCalendar(headers) {
  const token = process.env.ROCO_CALENDAR_API_KEY;
  if (!token || !token.trim()) {
    return jsonResponse(503, { error: "活动日历尚未配置服务端 API Key。" }, headers);
  }
  const url = new URL(CALENDAR_ENDPOINT);
  url.searchParams.set("key", token.trim());
  const response = await fetchResponse(url, { headers: { Accept: "application/json" } });
  const data = await readJsonResponse(response, "活动日历接口");
  return jsonResponse(200, data, headers);
}

async function handleCalendarImage(query, headers) {
  let imageUrl;
  try {
    imageUrl = new URL(query.get("url") || "");
  } catch {
    return jsonResponse(400, { error: "无效的活动图片地址。" }, headers);
  }
  if (imageUrl.protocol !== "https:" || !CALENDAR_IMAGE_HOSTS.has(imageUrl.hostname)
      || imageUrl.username || imageUrl.password) {
    return jsonResponse(400, { error: "不支持该活动图片来源。" }, headers);
  }
  const response = await fetchResponse(imageUrl, { headers: { Accept: "image/*" } });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.startsWith("image/")) {
    return jsonResponse(502, { error: `活动图片加载失败（HTTP ${response.status}）。` }, headers);
  }
  return binaryResponse(200, contentType, Buffer.from(await response.arrayBuffer()), headers);
}

async function handlePetConfig(headers) {
  const response = await fetchResponse(`${PET_VIEWER_ORIGIN}/api/pet-viewer/config`, {
    headers: { Accept: "application/json" },
  });
  const config = await readJsonResponse(response, "宠物展示配置");
  if (!config || config.enabled !== true || !Array.isArray(config.pet?.models)) {
    return jsonResponse(502, { error: "宠物展示服务暂未提供可用的模型配置。" }, headers);
  }
  return jsonResponse(200, config, {
    ...headers,
    "Cache-Control": "public, max-age=60",
  });
}

async function handlePetAsset(path, headers) {
  const assetId = path.slice("/api/pet-viewer/asset/".length);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(assetId)) {
    return jsonResponse(400, { error: "无效的宠物资源地址。" }, headers);
  }
  const cosConfig = getCosConfig();
  const key = `roco-pet-viewer/${assetId}`;
  const cosParams = cosConfig
    ? { Bucket: cosConfig.bucket, Region: cosConfig.region, Key: key }
    : null;
  if (cosConfig) {
    try {
      await callCos("headObject", cosParams);
      return redirectResponse(`${cosConfig.publicBaseUrl}/${key}`, headers);
    } catch (error) {
      if (error.statusCode !== 404 && error.code !== "NoSuchKey" && error.code !== "NotFound") {
        throw new Error(`腾讯云 COS 检查资源失败（${error.code || error.statusCode || "未知错误"}）。`);
      }
    }
  }

  const response = await fetchResponse(
    `${PET_VIEWER_ORIGIN}/api/pet-viewer/asset/${assetId}`,
    { headers: { Accept: "image/*, model/gltf-binary, application/octet-stream" } },
  );
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    return jsonResponse(502, { error: `宠物模型资源读取失败（HTTP ${response.status}）。` }, headers);
  }
  if (!/^(?:image\/|model\/gltf-binary|application\/octet-stream)/i.test(contentType)) {
    return jsonResponse(502, { error: "宠物资源服务返回了不支持的文件类型。" }, headers);
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_PET_ASSET_BYTES) {
    return jsonResponse(413, { error: "宠物模型资源超过云函数响应大小限制。" }, headers);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_PET_ASSET_BYTES) {
    return jsonResponse(413, { error: "宠物模型资源超过云函数响应大小限制。" }, headers);
  }
  if (cosConfig) {
    try {
      await callCos("putObject", {
        ...cosParams,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        ACL: "public-read",
      });
    } catch (error) {
      throw new Error(`腾讯云 COS 缓存宠物资源失败（${error.code || error.statusCode || "未知错误"}）。`);
    }
    return redirectResponse(`${cosConfig.publicBaseUrl}/${key}`, headers);
  }
  if (body.length > MAX_INLINE_PET_ASSET_BYTES) {
    return jsonResponse(413, {
      error: "该模型资源超出云函数同步响应大小限制，请配置 COS 资源缓存后重试。",
    }, headers);
  }
  return binaryResponse(200, contentType, body, headers, "public, max-age=604800, immutable");
}

exports.main_handler = async (event = {}) => {
  const request = getRequest(event);
  const corsHeaders = getCorsHeaders(request.origin);
  if (request.origin && !corsHeaders["Access-Control-Allow-Origin"]) {
    return jsonResponse(403, { error: "此网页来源未获允许调用 API。" }, corsHeaders);
  }
  if (request.method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
      isBase64Encoded: false,
    };
  }

  try {
    if (request.path === "/api/lookup" && request.method === "GET") {
      return await handleLookup(request.query, corsHeaders);
    }
    if (request.path === "/api/assets" && request.method === "GET") {
      return await handleHomeAsset(request.query, corsHeaders);
    }
    if (request.path === "/api/map-data" && request.method === "GET") {
      return await handleMapData(request.query, corsHeaders);
    }
    if (request.path === "/api/calendar" && request.method === "POST") {
      return await handleCalendar(corsHeaders);
    }
    if (request.path === "/api/calendar-image" && request.method === "GET") {
      return await handleCalendarImage(request.query, corsHeaders);
    }
    if (request.path === "/api/pet-viewer/config" && request.method === "GET") {
      return await handlePetConfig(corsHeaders);
    }
    if (request.path.startsWith("/api/pet-viewer/asset/") && request.method === "GET") {
      return await handlePetAsset(request.path, corsHeaders);
    }
    return jsonResponse(404, { error: "接口不存在。" }, corsHeaders);
  } catch (error) {
    return jsonResponse(502, { error: error.message || "上游服务暂时不可用，请稍后重试。" }, corsHeaders);
  }
};
