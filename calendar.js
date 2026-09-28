const loadButton = document.querySelector("#calendar-load");
const calendarGrid = document.querySelector("#calendar-grid");
const monthLabel = document.querySelector("#month-label");
const monthSummary = document.querySelector("#month-summary");
const agendaDate = document.querySelector("#agenda-date");
const agendaCount = document.querySelector("#agenda-count");
const agendaList = document.querySelector("#agenda-list");
const notice = document.querySelector("#calendar-notice");
const calendarCover = document.querySelector("#calendar-cover");

const today = new Date();
const todayKey = toDateKey(today);
const palette = ["#57a574", "#6296c9", "#bf8e42", "#aa79b5", "#d27668", "#55a6a1"];
let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
let events = [];
let calendarSourceUrl = "";

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return new Date(value);
  if (typeof value === "number" || (typeof value === "string" && /^\d{10,13}$/.test(value))) {
    const number = Number(value);
    const date = new Date(number < 1e12 ? number * 1000 : number);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const cleaned = value.trim().replace(/\//g, "-");
  const dateOnly = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return date.getFullYear() === Number(dateOnly[1])
      && date.getMonth() === Number(dateOnly[2]) - 1
      && date.getDate() === Number(dateOnly[3]) ? date : null;
  }
  const date = new Date(cleaned.length === 10 ? `${cleaned}T00:00:00` : cleaned);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function safeWebUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function safeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["game.gtimg.cn", "patchwiki.biligame.com"].includes(url.hostname)) return "";
    return apiUrl(`/api/calendar-image?url=${encodeURIComponent(url.href)}`);
  } catch {
    return "";
  }
}

async function loadProxiedImage(image, imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    let message = `图片请求失败（HTTP ${response.status}）。`;
    try {
      const result = await response.json();
      if (result.error) message = result.error;
    } catch {
      // Keep the HTTP status when the proxy does not return JSON.
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  let imageBlob;
  if (/^\s*image\//i.test(contentType)) {
    imageBlob = await response.blob();
  } else {
    // Tencent Function URL can return the image as Base64 text with a merged content type.
    const imageType = contentType.match(/image\/[a-z\d.+-]+/i)?.[0];
    if (!imageType) throw new Error("图片代理返回了非图片数据。");

    let encoded = (await response.text()).trim();
    encoded = encoded.replace(/^data:image\/[a-z\d.+-]+;base64,/i, "").replace(/\s/g, "");
    if (!encoded || !/^[a-z\d+/]*={0,2}$/i.test(encoded)) {
      throw new Error("图片代理返回了无效的 Base64 图片数据。");
    }
    let binary;
    try {
      binary = atob(encoded);
    } catch {
      throw new Error("图片代理返回了无法解码的 Base64 图片数据。");
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    imageBlob = new Blob([bytes], { type: imageType });
  }

  const objectUrl = URL.createObjectURL(imageBlob);
  const releaseObjectUrl = () => URL.revokeObjectURL(objectUrl);
  image.addEventListener("load", releaseObjectUrl, { once: true });
  image.addEventListener("error", releaseObjectUrl, { once: true });
  image.src = objectUrl;
}

function normalizeEvents(payload) {
  let root = payload;
  for (let depth = 0; depth < 4 && root && typeof root === "object" && !Array.isArray(root); depth += 1) {
    const wrapper = ["data", "result"].find((key) => root[key] !== undefined);
    if (!wrapper) break;
    root = root[wrapper];
  }

  const calendar = root?.calendar && typeof root.calendar === "object" ? root.calendar : {};
  const activityPayload = root?.activities;
  const activityList = Array.isArray(activityPayload)
    ? activityPayload
    : Array.isArray(activityPayload?.activities) ? activityPayload.activities : null;
  if (activityList) {
    const normalized = activityList.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const start = normalizeDate(firstValue(item, ["start_date", "startDate", "start_time", "startTime", "date"]));
      if (!start) return [];
      return [{
        id: String(item.id ?? `${toDateKey(start)}-${index}`),
        title: String(firstValue(item, ["name", "title", "activity"]) || "未命名活动"),
        date: start,
        end: normalizeDate(firstValue(item, ["end_date", "endDate", "end_time", "endTime"])),
        description: String(firstValue(item, ["description", "desc", "content", "detail"]) || ""),
        type: String(firstValue(item, ["type", "category", "tag"]) || ""),
        image: safeImageUrl(firstValue(item, ["image", "image_url", "imageUrl"])),
        url: safeWebUrl(firstValue(item, ["url", "source_url", "sourceUrl"])),
        remainingTime: String(firstValue(item, ["remaining_time", "remainingTime"]) || ""),
        isActive: item.is_active === true,
      }];
    });
    return {
      events: normalized.sort((a, b) => a.date - b.date),
      calendarImage: safeImageUrl(calendar.image_url || calendar.imageUrl),
      sourceUrl: safeWebUrl(calendar.source_url || calendar.sourceUrl),
    };
  }

  const normalized = [];
  const visited = new WeakSet();
  const titleKeys = ["title", "name", "activity", "activityName", "event_name", "subject"];
  const dateKeys = ["startTime", "start_time", "startAt", "start_at", "startDate", "start_date", "beginTime", "begin_time", "date", "eventDate", "event_date", "day", "time", "timestamp", "start"];
  const endKeys = ["endTime", "end_time", "endAt", "end_at", "endDate", "end_date", "finishTime", "finish_time"];
  const descriptionKeys = ["description", "desc", "content", "detail", "remark", "notes"];

  function walk(value, inheritedDate, depth) {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, inheritedDate, depth + 1));
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    const dateValue = firstValue(value, dateKeys) ?? inheritedDate;
    let date = normalizeDate(dateValue);
    if (!date) {
      const eventDay = normalizeDate(firstValue(value, ["date", "eventDate", "event_date", "day", "startDate", "start_date"]) ?? inheritedDate);
      const timeOfDay = firstValue(value, ["startTime", "start_time", "beginTime", "begin_time", "time"]);
      if (eventDay && typeof timeOfDay === "string" && /^\d{1,2}:\d{2}/.test(timeOfDay)) {
        const [hours, minutes] = timeOfDay.split(":").map(Number);
        eventDay.setHours(hours, minutes, 0, 0);
        date = eventDay;
      }
    }
    const title = firstValue(value, titleKeys);
    if (date && title !== undefined) {
      const start = date;
      const end = normalizeDate(firstValue(value, endKeys));
      normalized.push({
        id: String(value.id ?? `${toDateKey(start)}-${normalized.length}`),
        title: String(title),
        date: start,
        end,
        description: String(firstValue(value, descriptionKeys) || ""),
        type: String(firstValue(value, ["type", "category", "tag", "kind"]) || ""),
        image: safeImageUrl(firstValue(value, ["image", "image_url", "imageUrl"])),
        url: safeWebUrl(firstValue(value, ["url", "source_url", "sourceUrl"])),
        remainingTime: String(firstValue(value, ["remaining_time", "remainingTime"]) || ""),
        isActive: value.is_active === true,
      });
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const keyDate = normalizeDate(key) || inheritedDate;
      walk(child, keyDate, depth + 1);
    }
  }

  walk(root, null, 0);
  const unique = new Map();
  normalized.forEach((event) => {
    const key = `${event.date.toISOString()}|${event.title}`;
    if (!unique.has(key)) unique.set(key, event);
  });
  return {
    events: [...unique.values()].sort((a, b) => a.date - b.date),
    calendarImage: safeImageUrl(calendar.image_url || calendar.imageUrl),
    sourceUrl: safeWebUrl(calendar.source_url || calendar.sourceUrl),
  };
}

function eventIncludesDate(event, date) {
  const key = toDateKey(date);
  return key >= toDateKey(event.date) && key <= toDateKey(event.end || event.date);
}

function eventsOnDate(date) {
  return events.filter((event) => eventIncludesDate(event, date));
}

function renderCalendarCover(imageUrl) {
  calendarCover.replaceChildren();
  if (!imageUrl) {
    calendarCover.hidden = true;
    return;
  }

  const image = createElement("img", "calendar-cover-image");
  image.alt = "洛克王国世界活动日历";
  image.loading = "eager";
  image.decoding = "async";
  image.addEventListener("error", () => {
    calendarCover.hidden = true;
    showNotice("活动日历图片暂时无法加载，请稍后重试。");
  }, { once: true });
  calendarCover.append(image);
  loadProxiedImage(image, imageUrl).catch(() => {
    image.dispatchEvent(new Event("error"));
  });
  if (calendarSourceUrl) {
    const source = createElement("a", "calendar-cover-source", "查看来源 ↗");
    source.href = calendarSourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    calendarCover.append(source);
  }
  calendarCover.hidden = false;
}

function colorFor(event) {
  let hash = 0;
  for (const char of event.type || event.title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function formatDate(date, options = { month: "long", day: "numeric", weekday: "short" }) {
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function renderCalendar() {
  monthLabel.textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(displayedMonth);
  const monthEvents = events.filter((event) =>
    event.date <= new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0, 23, 59, 59, 999)
    && (event.end || event.date) >= new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1)
  );
  monthSummary.textContent = events.length
    ? `本月 ${monthEvents.length} 项活动 · 共载入 ${events.length} 项`
    : "暂无活动数据";

  calendarGrid.replaceChildren();
  const firstDay = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = toDateKey(date);
    const dayEvents = eventsOnDate(date);
    const button = createElement("button", "calendar-day");
    button.type = "button";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `${formatDate(date)}${dayEvents.length ? `，${dayEvents.length} 项活动` : ""}`);
    if (date.getMonth() !== displayedMonth.getMonth()) button.classList.add("outside-month");
    if (dateKey === todayKey) button.classList.add("is-today");
    if (dateKey === toDateKey(selectedDate)) button.classList.add("is-selected");
    button.append(createElement("span", "day-number", String(date.getDate())));

    if (dayEvents.length) {
      const previews = createElement("span", "day-events");
      dayEvents.slice(0, 2).forEach((event) => {
        const preview = createElement("span", "day-event", event.title);
        preview.style.setProperty("--event-color", colorFor(event));
        previews.append(preview);
      });
      if (dayEvents.length > 2) previews.append(createElement("span", "day-more", `+${dayEvents.length - 2} 项`));
      button.append(previews);
    }

    button.addEventListener("click", () => {
      selectedDate = date;
      if (date.getMonth() !== displayedMonth.getMonth()) displayedMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      renderCalendar();
      renderAgenda();
    });
    calendarGrid.append(button);
  }
  renderAgenda();
}

function renderAgenda() {
  const dayEvents = eventsOnDate(selectedDate);
  agendaDate.textContent = formatDate(selectedDate);
  agendaCount.textContent = `${dayEvents.length} 项`;
  agendaList.replaceChildren();
  if (!dayEvents.length) {
    const empty = createElement("div", "agenda-empty");
    empty.append(
      createElement("span", "", events.length ? "✧" : "▦"),
      createElement("strong", "", events.length ? "这一天暂无活动" : "等待加载活动"),
      createElement("p", "", events.length ? "选择日历中标有活动的日期查看详情。" : "点击“加载日历”获取活动安排。")
    );
    agendaList.append(empty);
    return;
  }
  dayEvents.forEach((event) => {
    const card = createElement("article", "agenda-event");
    const bar = createElement("span", "agenda-event-bar");
    bar.style.setProperty("--event-color", colorFor(event));
    const body = createElement("div", "agenda-event-body");
    const startLabel = formatDate(event.date, { year: "numeric", month: "2-digit", day: "2-digit" });
    const endLabel = event.end
      ? formatDate(event.end, { year: "numeric", month: "2-digit", day: "2-digit" })
      : "未提供";
    const eventDates = createElement("div", "agenda-event-dates");
    eventDates.append(
      createElement("span", "", `开始：${startLabel}`),
      createElement("span", "", `结束：${endLabel}`)
    );
    if (event.image) {
      const image = createElement("img", "agenda-event-image");
      image.alt = `${event.title}活动图片`;
      image.loading = "eager";
      image.decoding = "async";
      image.addEventListener("error", () => image.remove(), { once: true });
      loadProxiedImage(image, event.image).catch(() => image.dispatchEvent(new Event("error")));
      body.append(image);
    }
    body.append(createElement("h3", "", event.title), eventDates);
    if (event.description) body.append(createElement("p", "", event.description));
    if (event.remainingTime) body.append(createElement("p", "agenda-event-remaining", event.remainingTime));
    if (event.url) {
      const link = createElement("a", "agenda-event-link", "活动详情 ↗");
      link.href = event.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      body.append(link);
    }
    card.append(bar, body);
    agendaList.append(card);
  });
}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}

async function loadCalendar() {
  notice.hidden = true;
  loadButton.disabled = true;
  loadButton.textContent = "加载中…";
  try {
    const response = await fetch(apiUrl("/api/calendar"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `活动日历请求失败（HTTP ${response.status}）。`);
    const calendarData = normalizeEvents(data);
    events = calendarData.events;
    calendarSourceUrl = calendarData.sourceUrl;
    renderCalendarCover(calendarData.calendarImage);
    if (!events.length) {
      showNotice("接口已返回数据，但未识别到带日期的活动记录。请检查接口返回格式。");
    } else {
      const currentDayHasEvents = eventsOnDate(selectedDate).length > 0;
      if (!currentDayHasEvents) {
        const nearest = events.reduce((best, event) =>
          Math.abs(event.date - today) < Math.abs(best.date - today) ? event : best
        );
        selectedDate = new Date(nearest.date);
        displayedMonth = new Date(nearest.date.getFullYear(), nearest.date.getMonth(), 1);
      }
    }
    renderCalendar();
  } catch (error) {
    showNotice(error.message || "活动日历加载失败，请检查网络连接后重试。");
  } finally {
    loadButton.disabled = false;
    loadButton.textContent = "加载日历";
  }
}

loadButton.addEventListener("click", loadCalendar);
document.querySelector("#prev-month").addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.querySelector("#next-month").addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  renderCalendar();
});
document.querySelector("#today-button").addEventListener("click", () => {
  selectedDate = new Date();
  displayedMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderCalendar();
});
document.querySelector("#reload-calendar").addEventListener("click", () => {
  loadCalendar();
});

renderCalendar();
loadCalendar();
