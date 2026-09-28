const form = document.querySelector("#lookup-form");
const uidInput = document.querySelector("#uid-input");
const refreshInput = document.querySelector("#refresh-input");
const searchButton = document.querySelector("#search-button");
const clearButton = document.querySelector("#clear-button");
const notice = document.querySelector("#notice");
const results = document.querySelector("#results");
const homeContent = document.querySelector("#home-content");
const onlineContent = document.querySelector("#online-content");
const homeState = document.querySelector("#home-state");
const homeCount = document.querySelector("#home-count");
const onlineState = document.querySelector("#online-state");
const resultCaption = document.querySelector("#result-caption");
const profileUid = document.querySelector("#profile-uid");

const LABELS = {
  uid: "玩家 UID",
  id: "编号",
  name: "名称",
  nickname: "昵称",
  level: "等级",
  exp: "经验",
  experience: "经验",
  online: "在线状态",
  isOnline: "在线状态",
  is_online: "在线状态",
  roomLevel: "小屋扩建等级",
  comfort: "舒适度",
  home: "家园概览",
  petCount: "宠物数量",
  guardCount: "守护数量",
  plantCount: "植物数量",
  queriedAt: "查询时间",
  featureOpened: "家园已开放",
  cached: "缓存数据",
  traitThresholds: "特征阈值",
  residents: "家园居民",
  guards: "守护宠物",
  plants: "种植记录",
  foodReference: "食物图鉴",
  petId: "宠物编号",
  speciesName: "宠物种类",
  defaultName: "默认名称",
  gender: "性别",
  mutation: "变异特征",
  feedRound: "喂养轮次",
  feedStatus: "喂养状态",
  hasEgg: "是否携蛋",
  attrs: "属性",
  eggGroups: "蛋组",
  food: "食物",
  seedId: "种子编号",
  plot: "地块",
  land: "土地",
  ripeAt: "成熟时间",
  remainingSeconds: "剩余秒数",
  harvestCount: "收获次数",
  bodyEdgePercent: "体型边缘比例",
  softVoiceDb: "轻柔音量阈值",
  roughVoiceDb: "粗犷音量阈值",
  image: "形象",
  status: "状态",
  state: "状态",
  refresh: "刷新状态",
  pet: "宠物",
  pets: "宠物",
  pokemon: "宠物",
  pokemons: "宠物",
  petList: "宠物列表",
  pet_list: "宠物列表",
  team: "队伍",
  garden: "花园",
  flowers: "花朵",
  flower: "花朵",
  plants: "植物",
  plant: "植物",
  harvest: "收获",
  collection: "收藏",
  collections: "收藏",
  land: "土地",
  plots: "地块",
  friends: "好友",
  decoration: "装饰",
  decorations: "装饰",
  createdAt: "创建时间",
  updatedAt: "更新时间",
  lastLogin: "最近登录",
  last_login: "最近登录",
  message: "说明",
};

function displayLabel(key, context) {
  if (context === "home" && key === "level") return "家园等级";
  if (LABELS[key]) return LABELS[key];
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value, key) {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  if (key === "ripeAt" && (typeof value === "number" || /^\d+$/.test(String(value)))) {
    const timestamp = Number(value);
    const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    if (!Number.isNaN(date.valueOf())) {
      return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
    }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) {
      return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
    }
  }
  return String(value);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderGender(value) {
  const gender = String(value).trim();
  const isFemale = /^(雌|雌性|female)$/i.test(gender);
  const isMale = /^(雄|雄性|male)$/i.test(gender);
  if (!isFemale && !isMale) return makeElement("span", "data-value", displayValue(value, "gender"));

  const wrapper = makeElement("span", `gender-value ${isFemale ? "gender-female" : "gender-male"}`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const shapes = isFemale
    ? [["path", { d: "M12 15v7" }], ["path", { d: "M9 19h6" }], ["circle", { cx: "12", cy: "9", r: "6" }]]
    : [["path", { d: "M16 3h5v5" }], ["path", { d: "m21 3-6.75 6.75" }], ["circle", { cx: "10", cy: "14", r: "6" }]];
  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, attributeValue] of Object.entries(attributes)) shape.setAttribute(name, attributeValue);
    svg.append(shape);
  }

  wrapper.append(svg, document.createTextNode(displayValue(value, "gender")));
  return wrapper;
}

function hasMutation(value) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function renderRecordValue(key, value) {
  const rendered = makeElement("span", "data-value", displayValue(value, key));
  if (key === "hasEgg") {
    const normalized = String(value).trim().toLowerCase();
    if (value === true || value === 1 || /^(true|yes|1|是|有)$/.test(normalized)) {
      rendered.classList.add("egg-status-yes");
    } else if (value === false || value === 0 || value === null || /^(false|no|0|否|无)$/.test(normalized)) {
      rendered.classList.add("egg-status-no");
    }
  } else if (key === "mutation" && hasMutation(value)) {
    rendered.classList.add("mutation-colorful");
  }
  return rendered;
}

function unwrapData(data) {
  let current = data;
  for (let index = 0; index < 3 && current && typeof current === "object" && !Array.isArray(current); index += 1) {
    const key = ["data", "result"].find((candidate) => Object.hasOwn(current, candidate));
    if (!key) break;
    current = current[key];
  }
  return current;
}

function renderScalar(label, value, className = "summary-card", context) {
  const card = makeElement("div", className);
  card.append(makeElement("span", "data-label", displayLabel(label, context)));
  card.append(makeElement("span", "data-value", displayValue(value, label)));
  return card;
}

function makeAssetImage(source, className = "record-image", alt = "") {
  if (typeof source !== "string" || !source) return null;
  let url;
  try {
    url = new URL(source, "https://roco-eggs.tsuki-world.com");
  } catch {
    return null;
  }
  if (url.origin !== "https://roco-eggs.tsuki-world.com") return null;
  const image = makeElement("img", className);
  image.src = apiUrl(`/api/assets?path=${encodeURIComponent(url.pathname)}`);
  image.alt = alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => image.remove(), { once: true });
  return image;
}

function renderRecord(value, index) {
  const card = makeElement("article", "record-card");
  const entries = Array.isArray(value)
    ? value.map((item, itemIndex) => [String(itemIndex + 1), item])
    : Object.entries(value || {});
  const titleEntry = entries.find(([key]) => /^(name|nickname|petName|pet_name|title)$/i.test(key));
  const heading = makeElement("div", "record-heading");
  const imageEntry = entries.find(([key]) => /^(image|icon|avatar)$/i.test(key));
  const image = imageEntry ? makeAssetImage(imageEntry[1]) : null;
  if (image) heading.append(image);
  heading.append(makeElement("span", "", titleEntry ? displayValue(titleEntry[1], titleEntry[0]) : `记录 ${index + 1}`));
  card.append(heading);
  const fields = makeElement("div", "record-fields");

  for (const [key, item] of entries) {
    if (key === titleEntry?.[0] || key === imageEntry?.[0] || key === "encyclopediaUrl") continue;
    const field = makeElement("div", "record-field");
    field.append(makeElement("span", "data-label", displayLabel(key)));
    if (key === "gender") {
      field.append(renderGender(item));
    } else if (item !== null && typeof item === "object") {
      field.append(renderComplexValue(item));
    } else {
      field.append(renderRecordValue(key, item));
    }
    fields.append(field);
  }
  card.append(fields);
  return card;
}

function renderComplexValue(value) {
  if (Array.isArray(value)) {
    const hasIconEntries = value.some((item) =>
      item && typeof item === "object" && !Array.isArray(item) && typeof item.icon === "string"
    );
    if (hasIconEntries) {
      const list = makeElement("span", "data-value attribute-list");
      for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          list.append(makeElement("span", "attribute-chip", displayValue(item)));
          continue;
        }
        const nameEntry = Object.entries(item).find(([key, entry]) =>
          /^(name|title|nickname|speciesName)$/i.test(key) && entry !== null
        );
        const name = nameEntry ? displayValue(nameEntry[1], nameEntry[0]) : "";
        const chip = makeElement("span", "attribute-chip");
        const icon = makeAssetImage(item.icon, "attribute-icon", name ? `${name}属性` : "宠物属性");
        if (icon) chip.append(icon);
        if (name) chip.append(makeElement("span", "", name));
        list.append(chip);
      }
      return list;
    }
    const list = makeElement("span", "data-value");
    list.textContent = value.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return displayValue(item);
      const nameEntry = Object.entries(item).find(([key, entry]) =>
        /^(name|title|nickname|speciesName)$/i.test(key) && entry !== null
      );
      return nameEntry ? displayValue(nameEntry[1], nameEntry[0]) : JSON.stringify(item);
    }).join("、");
    return list;
  }
  const panel = makeElement("span", "data-value");
  if (value && typeof value === "object") {
    const visibleEntries = Object.entries(value).filter(([key]) =>
      !/^(image|icon|encyclopediaUrl)$/i.test(key)
    );
    const nameEntry = visibleEntries.find(([key]) => /^(name|title|nickname|speciesName)$/i.test(key));
    panel.textContent = nameEntry ? displayValue(nameEntry[1], nameEntry[0]) : JSON.stringify(Object.fromEntries(visibleEntries));
  } else {
    panel.textContent = displayValue(value);
  }
  return panel;
}

function renderCollection(key, value, index) {
  const block = makeElement("div", "collection-block");
  block.append(makeElement("h3", "collection-title", displayLabel(key)));

  if (Array.isArray(value)) {
    if (!value.length) {
      block.append(makeElement("div", "empty-state", "暂无记录"));
      return block;
    }
    const records = makeElement("div", "record-grid");
    value.forEach((item, itemIndex) => {
      if (item && typeof item === "object") {
        records.append(renderRecord(item, itemIndex));
      } else {
        records.append(renderScalar(`${displayLabel(key)} ${itemIndex + 1}`, item, "summary-card"));
      }
    });
    block.append(records);
    return block;
  }

  block.append(renderObject(value, key));
  return block;
}

function renderObject(value, context) {
  if (Array.isArray(value)) return renderCollection("列表", value, 0);
  if (!value || typeof value !== "object") return makeElement("div", "data-value", displayValue(value));

  const entries = Object.entries(value);
  const primitiveEntries = entries.filter(([, item]) => item === null || typeof item !== "object");
  const complexEntries = entries.filter(([, item]) => item !== null && typeof item === "object");
  const group = makeElement("div", "collection-block");

  if (primitiveEntries.length) {
    const grid = makeElement("div", "summary-grid");
    primitiveEntries.forEach(([key, item]) => grid.append(renderScalar(key, item, "summary-card", context)));
    group.append(grid);
  }
  for (const [key, item] of complexEntries) {
    group.append(renderCollection(key, item, 0));
  }
  return group;
}

function renderHome(data) {
  const payload = unwrapData(data);
  homeContent.replaceChildren();

  if (payload === null || payload === undefined) {
    homeContent.append(makeElement("div", "empty-state", "上游暂未返回家园档案数据"));
    homeCount.textContent = "0";
    homeState.textContent = "暂无数据";
    return;
  }

  if (Array.isArray(payload)) {
    homeContent.append(renderCollection("家园记录", payload, 0));
    homeCount.textContent = String(payload.length);
    homeState.textContent = "档案已载入";
    return;
  }

  if (typeof payload !== "object") {
    homeContent.append(makeElement("div", "data-value", displayValue(payload)));
    homeCount.textContent = "1";
    homeState.textContent = "档案已载入";
    return;
  }

  const entries = Object.entries(payload);
  const primitiveEntries = entries.filter(([, value]) => value === null || typeof value !== "object");
  const complexEntries = entries.filter(([, value]) => value !== null && typeof value === "object");

  if (primitiveEntries.length) {
    const summary = makeElement("div", "summary-grid");
    primitiveEntries.forEach(([key, value]) => summary.append(renderScalar(key, value)));
    homeContent.append(summary);
  }
  complexEntries.forEach(([key, value], index) => homeContent.append(renderCollection(key, value, index)));
  homeCount.textContent = String(entries.length);
  homeState.textContent = "档案已载入";
}

function findOnlineValue(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return undefined;
  const entries = Object.entries(value);
  const onlineEntry = entries.find(([key]) => /^(online|isOnline|is_online|onlineStatus|online_status)$/i.test(key));
  if (onlineEntry) return { key: onlineEntry[0], value: onlineEntry[1] };

  const statusEntry = entries.find(([key, item]) => /^(status|state)$/i.test(key) && typeof item !== "object");
  if (statusEntry && normalizeOnline(statusEntry[1]) !== "unknown") {
    return { key: statusEntry[0], value: statusEntry[1] };
  }
  for (const [, item] of entries) {
    const found = findOnlineValue(item, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function normalizeOnline(value) {
  if (value === true || value === 1) return "online";
  if (value === false || value === 0 || value === null) return "offline";
  const text = String(value).trim().toLowerCase();
  if (/^(online|on|true|1|yes|connected|active|在线|游戏中)$/.test(text)) return "online";
  if (/^(offline|off|false|0|no|disconnected|inactive|离线|不在线)$/.test(text)) return "offline";
  return "unknown";
}

function renderOnline(result) {
  onlineContent.replaceChildren();
  onlineState.replaceChildren();
  const dot = makeElement("i", "status-dot");
  const label = makeElement("span", "", "状态未知");

  if (!result?.ok) {
    onlineContent.append(makeElement("div", "data-error", `在线状态查询失败：${result?.error || "未返回数据"}`));
    onlineState.append(dot, makeElement("span", "", "查询失败"));
    return;
  }

  const payload = unwrapData(result.data);
  const found = findOnlineValue(payload);
  const state = found ? normalizeOnline(found.value) : "unknown";
  const text = state === "online" ? "在线" : state === "offline" ? "离线" : "状态未知";
  dot.classList.add(state);
  label.textContent = text;
  onlineState.append(dot, makeElement("span", "", text));
  const badge = makeElement("div", `online-badge ${state}`, text);
  const badgeDot = makeElement("i", `status-dot ${state}`);
  badge.prepend(badgeDot);
  onlineContent.append(badge);

  if (found) {
    const details = makeElement("p", "online-detail", `${displayLabel(found.key)}：${displayValue(found.value)}`);
    onlineContent.append(details);
  } else {
    const details = makeElement("p", "online-detail", "接口已响应，暂未识别在线状态字段。");
    onlineContent.append(details);
    const raw = makeElement("pre", "json-fallback", JSON.stringify(payload, null, 2));
    onlineContent.append(raw);
  }
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.querySelector(".button-icon").textContent = isLoading ? "…" : "⌕";
  searchButton.querySelector(".button-label").textContent = isLoading ? "探索中" : "开始探索";
}

uidInput.addEventListener("input", () => {
  clearButton.hidden = uidInput.value.length === 0;
});

clearButton.addEventListener("click", () => {
  uidInput.value = "";
  clearButton.hidden = true;
  uidInput.focus();
});

document.querySelector("#copy-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(profileUid.textContent);
    button.title = "已复制";
    window.setTimeout(() => { button.title = "复制 UID"; }, 1400);
  } catch {
    notice.hidden = false;
    notice.textContent = "复制失败，请手动选择 UID 复制。";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const uid = uidInput.value.trim();
  if (!/^[1-9]\d*$/.test(uid) || !Number.isSafeInteger(Number(uid))) {
    notice.hidden = false;
    notice.textContent = "请输入有效的正整数玩家 UID。";
    uidInput.focus();
    return;
  }

  notice.hidden = true;
  results.hidden = false;
  profileUid.textContent = uid;
  resultCaption.textContent = refreshInput.checked ? "正在强制刷新档案" : "正在读取家园档案";
  homeState.textContent = "查询中…";
  homeCount.textContent = "…";
  homeContent.replaceChildren();
  homeContent.append(makeElement("div", "loading-state", "正在读取家园档案…"));
  onlineContent.replaceChildren();
  onlineContent.append(makeElement("div", "loading-state", "正在查询在线状态…"));
  setLoading(true);
  results.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const query = new URLSearchParams({ uid, refresh: String(refreshInput.checked) });
    const response = await fetch(apiUrl(`/api/lookup?${query}`));
    const result = await response.json();
    if (!response.ok && !result.home && !result.online) {
      throw new Error(result.error || `查询失败（HTTP ${response.status}）`);
    }

    if (result.home?.ok) {
      renderHome(result.home.data);
    } else {
      homeContent.replaceChildren(makeElement("div", "data-error", `家园档案查询失败：${result.home?.error || result.error || "未返回数据"}`));
      homeState.textContent = "查询失败";
      homeCount.textContent = "!";
    }
    renderOnline(result.online);
    resultCaption.textContent = result.home?.ok && result.online?.ok
      ? "家园与在线状态已更新"
      : "部分数据暂时无法获取";
    if (!result.home?.ok || !result.online?.ok) {
      notice.hidden = false;
      notice.textContent = "部分接口查询失败；已显示成功获取的数据，可稍后重试。";
    }
  } catch (error) {
    homeContent.replaceChildren(makeElement("div", "data-error", error.message || "查询失败，请检查网络后重试。"));
    onlineContent.replaceChildren(makeElement("div", "empty-state", "本次查询未完成"));
    homeState.textContent = "查询失败";
    homeCount.textContent = "!";
    resultCaption.textContent = "查询未完成";
    notice.hidden = false;
    notice.textContent = error.message || "查询失败，请稍后重试。";
  } finally {
    setLoading(false);
  }
});
