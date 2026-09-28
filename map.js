const DATA_ENDPOINT = apiUrl("/api/map-data?file=");
const TILE_TEMPLATE = "https://ue.17173cdn.com/a/terra/tiles/rocom/4010_v3_e729cf/{z}/{y}_{x}.png?v1";
const DEFAULT_CENTER = [0.7, -0.7];
const DEFAULT_ZOOM = 10;
const MIN_ZOOM = 9;
const MAX_ZOOM = 13;

const categoryList = document.querySelector("#category-list");
const mapNotice = document.querySelector("#map-notice");
const mapLocationCount = document.querySelector("#map-location-count");
const visibleCount = document.querySelector("#visible-count");
const searchInput = document.querySelector("#location-search");
const clearSearch = document.querySelector("#clear-search");
const searchResults = document.querySelector("#search-results");
const zoomLabel = document.querySelector("#zoom-level");
const selectedCategories = new Set();
const categoryLayers = new Map();
let locations = [];
let categories = [];
let map;
let markerCluster;
let mapReady = false;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function getCategoryId(location) {
  return String(location.category_id ?? "");
}

function getCategory(location) {
  return categories.find((item) => String(item.id) === getCategoryId(location));
}

function getGroupTitle(location) {
  return location.category_group_title || getCategory(location)?.group_title || location.group_name || "其他";
}

function getCategoryTitle(location) {
  return location.category_title || location.category_name || getCategory(location)?.title || "未分类";
}

function validIconUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "https:" && url.hostname === "ue.17173cdn.com" ? url.href : "";
  } catch {
    return "";
  }
}

function validPoiImageUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "https:" && url.hostname === "i.17173cdn.com" ? url.href : "";
  } catch {
    return "";
  }
}

function getLocationCountByCategory() {
  const counts = new Map();
  locations.forEach((location) => {
    const id = getCategoryId(location);
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return counts;
}

function renderCategories(groups) {
  const counts = getLocationCountByCategory();
  categoryList.replaceChildren();
  groups.forEach((group, index) => {
    const groupName = group.title;
    const items = categories.filter((category) => category.group_title === groupName);
    const details = createElement("details", "category-group");
    details.dataset.group = groupName;
    if (groupName === "地点" || (!groups.some((item) => item.title === "地点") && index === 0)) {
      details.open = true;
    }

    const heading = createElement("summary", "group-heading");
    const groupCheckbox = createElement("input", "group-checkbox");
    groupCheckbox.type = "checkbox";
    groupCheckbox.setAttribute("aria-label", `选择${groupName}全部分类`);
    const title = createElement("span", "group-title", groupName);
    const groupCount = items.reduce((sum, item) => sum + (counts.get(String(item.id)) || 0), 0);
    const count = createElement("span", "group-count", String(groupCount));
    heading.append(groupCheckbox, title, count);
    details.append(heading);

    const options = createElement("div", "category-items");
    items.forEach((category) => {
      const categoryId = String(category.id);
      const option = createElement("label", "category-option");
      const checkbox = createElement("input", "category-checkbox");
      checkbox.type = "checkbox";
      checkbox.value = categoryId;
      checkbox.setAttribute("aria-label", category.title);
      const iconUrl = validIconUrl(category.icon);
      if (iconUrl) {
        const icon = createElement("img");
        icon.src = iconUrl;
        icon.alt = "";
        icon.loading = "lazy";
        option.append(checkbox, icon);
      } else {
        option.append(checkbox);
      }
      option.append(createElement("span", "", category.title));
      option.append(createElement("small", "", String(counts.get(categoryId) || 0)));
      options.append(option);
      categoryLayers.set(categoryId, { category, checkbox, groupCheckbox });
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedCategories.add(categoryId);
        else selectedCategories.delete(categoryId);
        updateGroupCheckbox(groupCheckbox, items);
        renderMarkers();
      });
    });
    details.append(options);
    categoryList.append(details);

    groupCheckbox.addEventListener("change", () => {
      items.forEach((category) => {
        const categoryId = String(category.id);
        const input = categoryLayers.get(categoryId)?.checkbox;
        if (!input) return;
        input.checked = groupCheckbox.checked;
        if (input.checked) selectedCategories.add(categoryId);
        else selectedCategories.delete(categoryId);
      });
      renderMarkers();
    });
  });
}

function updateGroupCheckbox(checkbox, groupCategories) {
  const checkedCount = groupCategories.filter((category) =>
    selectedCategories.has(String(category.id))
  ).length;
  checkbox.checked = checkedCount === groupCategories.length && checkedCount > 0;
  checkbox.indeterminate = checkedCount > 0 && checkedCount < groupCategories.length;
}

function makePoiIcon(location) {
  const iconUrl = validIconUrl(location.category_icon) || validIconUrl(getCategory(location)?.icon);
  if (!iconUrl) {
    return L.divIcon({ className: "", html: '<span class="poi-marker poi-fallback">✦</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
  }
  return L.divIcon({
    className: "",
    html: `<span class="poi-marker"><img src="${iconUrl}" alt="" loading="lazy"></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -15],
  });
}

function makePopup(location) {
  const popup = createElement("div", "poi-popup");
  const heading = createElement("div", "poi-popup-heading");
  const categoryIcon = validIconUrl(location.category_icon) || validIconUrl(getCategory(location)?.icon);
  if (categoryIcon) {
    const icon = createElement("img");
    icon.src = categoryIcon;
    icon.alt = "";
    heading.append(icon);
  }
  const titleBlock = createElement("span");
  titleBlock.append(
    createElement("strong", "", location.title || "未命名地点"),
    createElement("small", "", `${getGroupTitle(location)} · ${getCategoryTitle(location)}`)
  );
  heading.append(titleBlock);
  popup.append(heading);
  if (location.description) popup.append(createElement("p", "poi-popup-description", location.description));

  const imageUrl = validPoiImageUrl(location.image);
  if (imageUrl) {
    const image = createElement("img", "poi-detail-image");
    image.src = imageUrl;
    image.alt = `${location.title || "地点"}图片`;
    image.loading = "lazy";
    popup.append(image);
  }

  const source = createElement("a", "poi-popup-source", "地点资料来源：17173 ↗");
  source.href = "https://map.17173.com/rocom/maps/shijie";
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  popup.append(source);
  return popup;
}

function selectedLocations() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  if (query) {
    return locations.filter((location) =>
      [location.title, location.description, getCategoryTitle(location), getGroupTitle(location)]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query))
    );
  }
  return locations.filter((location) => selectedCategories.has(getCategoryId(location)));
}

function renderMarkers() {
  if (!mapReady) return;
  markerCluster.clearLayers();
  const filtered = selectedLocations();
  const bounds = map.getBounds().pad(.14);
  const inView = filtered.filter((location) =>
    bounds.contains([Number(location.latitude), Number(location.longitude)])
  );
  const markers = inView.map((location) => {
    const marker = L.marker([Number(location.latitude), Number(location.longitude)], {
      icon: makePoiIcon(location),
      title: location.title || getCategoryTitle(location),
      alt: `${location.title || getCategoryTitle(location)}，点击查看详情`,
    });
    marker.options.poiId = String(location.id);
    marker.bindPopup(makePopup(location), { maxWidth: 320 });
    return marker;
  });
  markerCluster.addLayers(markers);
  visibleCount.textContent = searchInput.value.trim()
    ? `搜索 ${filtered.length.toLocaleString()} · 本区域 ${inView.length.toLocaleString()}`
    : `已筛选 ${filtered.length.toLocaleString()} · 本区域 ${inView.length.toLocaleString()}`;
  if (searchInput.value.trim()) renderSearchResults(filtered);
  else {
    searchResults.hidden = true;
    searchResults.replaceChildren();
  }
}

function renderSearchResults(matches) {
  searchResults.replaceChildren();
  if (!matches.length) {
    searchResults.append(createElement("div", "search-empty", "没有找到匹配的地点"));
    searchResults.hidden = false;
    return;
  }
  matches.slice(0, 30).forEach((location) => {
    const button = createElement("button", "search-result");
    button.type = "button";
    const imageUrl = validIconUrl(location.category_icon) || validIconUrl(getCategory(location)?.icon);
    if (imageUrl) {
      const image = createElement("img");
      image.src = imageUrl;
      image.alt = "";
      button.append(image);
    }
    const text = createElement("span");
    text.append(
      createElement("strong", "", location.title || "未命名地点"),
      createElement("small", "", `${getGroupTitle(location)} · ${getCategoryTitle(location)}`)
    );
    button.append(text);
    button.addEventListener("click", () => {
      const findMarker = () => markerCluster.getLayers().find((marker) =>
        marker.options.poiId === String(location.id)
      );
      const match = findMarker();
      if (match) {
        markerCluster.zoomToShowLayer(match, () => match.openPopup());
      } else {
        map.once("moveend", () => {
          const movedMarker = findMarker();
          if (movedMarker) markerCluster.zoomToShowLayer(movedMarker, () => movedMarker.openPopup());
        });
        map.setView(
          [Number(location.latitude), Number(location.longitude)],
          Math.max(map.getZoom(), 12),
          { animate: true, duration: .45 }
        );
      }
      searchResults.hidden = true;
    });
    searchResults.append(button);
  });
  if (matches.length > 30) {
    searchResults.append(createElement("div", "search-empty", `共 ${matches.length.toLocaleString()} 个结果，请继续输入缩小范围`));
  }
  searchResults.hidden = false;
}

function showNotice(message) {
  mapNotice.textContent = message;
  mapNotice.hidden = false;
}

async function loadMapData() {
  const files = ["metadata.json", "categories.json", "locations.json"];
  const responses = await Promise.all(files.map((file) =>
    fetch(`${DATA_ENDPOINT}${encodeURIComponent(file)}`)
  ));
  for (const response of responses) {
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `地图资料请求失败（HTTP ${response.status}）。`);
    }
  }
  const [metadata, categoryData, locationData] = await Promise.all(responses.map((response) => response.json()));
  if (!Array.isArray(categoryData.categories) || !Array.isArray(categoryData.groups) || !Array.isArray(locationData)) {
    throw new Error("地图资料格式不正确，暂时无法显示地图。");
  }
  categories = categoryData.categories;
  locations = locationData.filter((location) =>
    Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
  );
  mapLocationCount.textContent = `${locations.length.toLocaleString()} 个地点`;
  renderCategories(categoryData.groups);

  const defaultGroup = categoryData.groups.find((group) => group.title === "地点") || categoryData.groups[0];
  if (defaultGroup) {
    categories.filter((category) => category.group_title === defaultGroup.title).forEach((category) => {
      const id = String(category.id);
      selectedCategories.add(id);
      const entry = categoryLayers.get(id);
      if (entry) entry.checkbox.checked = true;
    });
    const groupCheckbox = categoryList.querySelector(`[data-group="${CSS.escape(defaultGroup.title)}"] .group-checkbox`);
    if (groupCheckbox) groupCheckbox.checked = true;
  }
  document.querySelector("#category-list .map-loading")?.remove();
  document.querySelector("#map-data-source").textContent = `地图资料更新：${metadata.fetched_at ? new Date(metadata.fetched_at).toLocaleDateString("zh-CN") : "未知"}`;
  renderMarkers();
}

function initializeMap() {
  if (!window.L || typeof L.markerClusterGroup !== "function") {
    throw new Error("地图组件加载失败，请检查网络连接后刷新页面。");
  }
  map = L.map("world-map", {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: false,
    maxBounds: [[-0.02, -1.42], [1.42, 0.02]],
    maxBoundsViscosity: .8,
  });
  L.tileLayer(TILE_TEMPLATE, {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    tileSize: 256,
    noWrap: true,
    keepBuffer: 2,
    attribution: '<a href="https://map.17173.com/rocom/maps/shijie" target="_blank" rel="noopener noreferrer">17173 洛克王国世界互动地图</a>',
    errorTileUrl: "",
  }).addTo(map);
  markerCluster = L.markerClusterGroup({
    chunkedLoading: true,
    chunkInterval: 80,
    chunkDelay: 30,
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 13,
  });
  map.addLayer(markerCluster);
  mapReady = true;
  map.on("zoomend", () => { zoomLabel.textContent = `${map.getZoom()}×`; });
  map.on("moveend", renderMarkers);
  zoomLabel.textContent = `${DEFAULT_ZOOM}×`;
}

document.querySelector("#zoom-in").addEventListener("click", () => map?.zoomIn());
document.querySelector("#zoom-out").addEventListener("click", () => map?.zoomOut());
document.querySelector("#reset-view").addEventListener("click", () => map?.setView(DEFAULT_CENTER, DEFAULT_ZOOM));
document.querySelector("#show-all").addEventListener("click", () => {
  categoryLayers.forEach(({ checkbox }, id) => {
    checkbox.checked = true;
    selectedCategories.add(id);
  });
  categoryList.querySelectorAll(".group-checkbox").forEach((checkbox) => {
    checkbox.checked = true;
    checkbox.indeterminate = false;
  });
  renderMarkers();
});
document.querySelector("#hide-all").addEventListener("click", () => {
  categoryLayers.forEach(({ checkbox }, id) => {
    checkbox.checked = false;
    selectedCategories.delete(id);
  });
  categoryList.querySelectorAll(".group-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
    checkbox.indeterminate = false;
  });
  renderMarkers();
});
searchInput.addEventListener("input", () => {
  clearSearch.hidden = searchInput.value.length === 0;
  renderMarkers();
});
clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  clearSearch.hidden = true;
  searchResults.hidden = true;
  renderMarkers();
  searchInput.focus();
});
document.addEventListener("click", (event) => {
  if (!searchResults.contains(event.target) && event.target !== searchInput) searchResults.hidden = true;
});
document.querySelector("#panel-collapse").addEventListener("click", () => {
  document.querySelector("#category-panel").classList.add("is-collapsed");
});
document.querySelector("#panel-expand").addEventListener("click", () => {
  document.querySelector("#category-panel").classList.remove("is-collapsed");
});
document.querySelector("#mobile-panel-toggle").addEventListener("click", () => {
  const panel = document.querySelector("#category-panel");
  panel.classList.toggle("is-collapsed");
});

try {
  initializeMap();
  loadMapData().catch((error) => {
    categoryList.replaceChildren(createElement("div", "data-error", error.message));
    mapLocationCount.textContent = "地图资料未载入";
    showNotice(error.message);
  });
} catch (error) {
  categoryList.replaceChildren(createElement("div", "data-error", error.message));
  mapLocationCount.textContent = "地图未载入";
  showNotice(error.message);
}
