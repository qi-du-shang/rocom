window.ROCO_API_BASE_URL = "https://1258632161-0i1k976nar.ap-hongkong.tencentscf.com";

window.apiUrl = function apiUrl(path) {
  const baseUrl = String(window.ROCO_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const endpoint = String(path || "");
  if (!endpoint.startsWith("/api/")) {
    throw new TypeError("API paths must start with /api/.");
  }
  return `${baseUrl}${endpoint}`;
};
