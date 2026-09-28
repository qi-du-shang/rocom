import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const elements = {
  stage: document.querySelector("#pet-stage"),
  canvas: document.querySelector("#pet-canvas"),
  title: document.querySelector("#pet-title"),
  subtitle: document.querySelector("#pet-subtitle"),
  badge: document.querySelector("#appearance-badge"),
  loading: document.querySelector("#pet-loading"),
  loadingTitle: document.querySelector("#loading-title"),
  loadingDetail: document.querySelector("#loading-detail"),
  progress: document.querySelector("#loading-progress"),
  percent: document.querySelector("#loading-percent"),
  status: document.querySelector("#viewer-status"),
  notice: document.querySelector("#pet-notice"),
  modelSelect: document.querySelector("#model-select"),
  appearanceSelect: document.querySelector("#appearance-select"),
  eyesSelect: document.querySelector("#eyes-select"),
  actionSelect: document.querySelector("#action-select"),
  actionHint: document.querySelector("#action-hint"),
  appearanceHint: document.querySelector("#appearance-hint"),
  playAction: document.querySelector("#play-action"),
};

const renderer = new THREE.WebGLRenderer({
  canvas: elements.canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 200);
const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI * 0.82;
controls.target.set(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xe4f4ff, 0x44618b, 2.2));
scene.add(new THREE.AmbientLight(0xffffff, 1.15));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(-4, 7, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.bias = -0.00035;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x80c6ff, 1.1);
fillLight.position.set(4, 3, -4);
scene.add(fillLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.ShadowMaterial({ color: 0x285d91, opacity: 0.26 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -100;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const clock = new THREE.Clock();
const state = {
  config: null,
  model: null,
  mixer: null,
  actions: new Map(),
  bodyMaterials: [],
  eyeMaterials: [],
  modelTextures: new Set(),
  bodyTexture: null,
  appearanceTextures: new Map(),
  currentEyeTexture: null,
  maskTexture: null,
  seasonTextures: new Map(),
  appearanceRequest: 0,
  currentModelId: null,
  appearanceId: "official",
  eyeId: "default",
  idleAction: null,
  currentAction: null,
};

const ACTION_LABELS = {
  Alert: "警觉",
  Anger: "生气",
  CallOut: "呼唤",
  Fear: "害怕",
  Happy: "开心",
  Idle: "待机",
  Relax: "放松",
  Sad: "难过",
  Shock: "受惊",
  Show: "展示",
  SleepEnd: "醒来",
  SleepLoop: "熟睡",
  SleepStand: "站立睡眠",
  SleepStart: "入睡",
};

function setProgress(value, detail) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  elements.progress.style.width = `${percent}%`;
  elements.percent.textContent = `${percent}%`;
  if (detail) elements.loadingDetail.textContent = detail;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
}

function showError(message) {
  elements.notice.hidden = false;
  elements.notice.textContent = message;
  elements.loadingTitle.textContent = "宠物加载失败";
  elements.loadingDetail.textContent = message;
  elements.loading.querySelector(".loading-spinner").hidden = true;
  elements.loading.classList.remove("is-hidden");
  setStatus(message, true);
}

function assetUrl(url) {
  if (typeof url === "string" && url.startsWith("/api/pet-viewer/asset/")) {
    return apiUrl(url);
  }
  if (typeof url !== "string" || !/^https:\/\/[^/]+\/.+/.test(url)) {
    throw new Error("宠物服务返回了无效的资源地址。");
  }
  return url;
}

async function loadTexture(url, colorSpace = THREE.SRGBColorSpace) {
  const texture = await textureLoader.loadAsync(assetUrl(url));
  texture.colorSpace = colorSpace;
  texture.flipY = false;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  texture.needsUpdate = true;
  return texture;
}

function isBodyMaterial(material) {
  return /(?:_By1|_By_|_By)$/i.test(material?.name || "");
}

function isEyeMaterial(material) {
  return /_(?:Es|Mh)\d*$/i.test(material?.name || "");
}

function getModel(modelId) {
  return state.config.pet.models.find((model) => model.id === modelId);
}

function setSelectOptions(select, options, value, labelFor) {
  select.replaceChildren();
  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = labelFor(item);
    select.append(option);
  }
  select.value = value;
  select.disabled = options.length === 0;
}

function populateControls() {
  const models = state.config.pet.models || [];
  const appearances = state.config.pet.appearances || [];
  const eyes = state.config.pet.eyes || [];
  const requestedModel = new URLSearchParams(window.location.search).get("model");
  const defaultModel = state.config.pet.defaultModel || models[0]?.id;
  state.currentModelId = models.some((model) => model.id === requestedModel)
    ? requestedModel
    : defaultModel;
  state.appearanceId = appearances.some((appearance) => appearance.id === state.config.pet.defaultAppearance)
    ? state.config.pet.defaultAppearance
    : appearances[0]?.id || "official";
  state.eyeId = eyes[0]?.id || "default";

  setSelectOptions(elements.modelSelect, models, state.currentModelId, (model) => model.label);
  setSelectOptions(elements.appearanceSelect, appearances, state.appearanceId, (appearance) => appearance.label);
  setSelectOptions(elements.eyesSelect, eyes, state.eyeId, (eye) => eye.label);

  elements.modelSelect.addEventListener("change", () => loadModel(elements.modelSelect.value));
  elements.appearanceSelect.addEventListener("change", () => {
    state.appearanceId = elements.appearanceSelect.value;
    void applyAppearance();
  });
  elements.eyesSelect.addEventListener("change", () => {
    state.eyeId = elements.eyesSelect.value;
    applyEyeExpression(state.eyeId);
  });
  elements.actionSelect.addEventListener("change", () => {
    const actionName = elements.actionSelect.value;
    if (actionName) playAction(actionName);
  });
  elements.playAction.addEventListener("click", () => playAction(elements.actionSelect.value));
  document.querySelector("#reset-view").addEventListener("click", () => {
    if (state.model) fitModel(state.model.scene);
  });
}

function disposeModel() {
  if (!state.model) return;
  scene.remove(state.model.scene);
  state.model.scene.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material) return;
      material.dispose();
    });
  });
  for (const texture of state.modelTextures) texture.dispose();
  state.modelTextures.clear();
  state.bodyTexture?.dispose();
  state.currentEyeTexture?.dispose();
  state.maskTexture?.dispose();
  for (const texture of state.seasonTextures.values()) texture.dispose();
  state.seasonTextures.clear();
  state.mixer?.stopAllAction();
  state.mixer = null;
  state.actions.clear();
  state.bodyMaterials = [];
  state.eyeMaterials = [];
  state.model = null;
  state.bodyTexture = null;
  state.currentEyeTexture = null;
  state.maskTexture = null;
}

function fitModel(root) {
  root.scale.setScalar(1);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.01);
  root.position.sub(center);
  root.position.y -= size.y * 0.13;
  root.updateMatrixWorld(true);

  const fittedBounds = new THREE.Box3().setFromObject(root);
  const distance = maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.85;
  ground.position.set(0, fittedBounds.min.y - maxDimension * 0.01, -maxDimension * 0.2);
  ground.scale.set(maxDimension * 0.12, maxDimension * 0.12, 1);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = Math.max(distance * 100, 100);
  camera.position.set(0, size.y * 0.035, distance);
  controls.target.set(0, 0, 0);
  controls.minDistance = distance * 0.55;
  controls.maxDistance = distance * 2.5;
  camera.updateProjectionMatrix();
  controls.update();
}

function resizeRenderer() {
  const width = Math.max(elements.stage.clientWidth, 1);
  const height = Math.max(elements.stage.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function applyEyeExpression(eyeId) {
  const eye = state.config.pet.eyes.find((item) => item.id === eyeId);
  if (!eye) return;
  const [offsetX, offsetY] = eye.uv || [0, 0];
  for (const material of state.eyeMaterials) {
    if (!material.map) continue;
    material.map.offset.set(offsetX, offsetY);
    material.map.updateMatrix();
    material.needsUpdate = true;
  }
}

function createSeasonShader(material) {
  const patch = {
    shader: null,
    mask: null,
    noise: null,
    enabled: 0,
    colorA: new THREE.Vector3(1, 1, 1),
    colorB: new THREE.Vector3(1, 1, 1),
  };
  material.userData.petSeason = patch;
  material.onBeforeCompile = (shader) => {
    patch.shader = shader;
    Object.assign(shader.uniforms, {
      petSeasonMask: { value: patch.mask },
      petSeasonNoise: { value: patch.noise },
      petSeasonEnabled: { value: patch.enabled },
      petSeasonColorA: { value: patch.colorA },
      petSeasonColorB: { value: patch.colorB },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nvarying vec2 vPetSeasonUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvPetSeasonUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D petSeasonMask;
uniform sampler2D petSeasonNoise;
uniform float petSeasonEnabled;
uniform vec3 petSeasonColorA;
uniform vec3 petSeasonColorB;
varying vec2 vPetSeasonUv;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
if (petSeasonEnabled > 0.5) {
  float petArea = smoothstep(0.39, 0.41, texture2D(petSeasonMask, fract(vPetSeasonUv)).a);
  vec2 petWeights = texture2D(petSeasonNoise, fract(vPetSeasonUv)).rg;
  float petWeightSum = max(petWeights.r + petWeights.g, 0.001);
  vec3 petSeasonColor = (petSeasonColorA * petWeights.r + petSeasonColorB * petWeights.g) / petWeightSum;
  diffuseColor.rgb = mix(diffuseColor.rgb, petSeasonColor, petArea);
}`,
      );
  };
  material.customProgramCacheKey = () => "roco-pet-season-preview-v1";
  material.needsUpdate = true;
}

async function applyAppearance() {
  const appearance = state.config.pet.appearances.find((item) => item.id === state.appearanceId);
  if (!appearance) return;
  const requestId = ++state.appearanceRequest;
  try {
    let texture = state.bodyTexture;
    if (appearance.asset) {
      if (!state.appearanceTextures.has(appearance.id)) {
        state.appearanceTextures.set(appearance.id, await loadTexture(appearance.asset));
      }
      texture = state.appearanceTextures.get(appearance.id);
    }
    let noiseTexture = null;
    if (appearance.special && appearance.noiseAsset) {
      if (!state.seasonTextures.has(appearance.id)) {
        state.seasonTextures.set(appearance.id, await loadTexture(appearance.noiseAsset, THREE.NoColorSpace));
      }
      noiseTexture = state.seasonTextures.get(appearance.id);
    }
    if (requestId !== state.appearanceRequest) return;
    for (const material of state.bodyMaterials) {
      material.map = texture;
      material.color.set(0xffffff);
      if (appearance.special && appearance.colorA && appearance.colorB) {
        const patch = material.userData.petSeason;
        patch.mask = state.maskTexture;
        patch.noise = noiseTexture;
        patch.enabled = state.maskTexture && noiseTexture ? 1 : 0;
        patch.colorA.set(...appearance.colorA);
        patch.colorB.set(...appearance.colorB);
        if (patch.shader) {
          patch.shader.uniforms.petSeasonMask.value = patch.mask;
          patch.shader.uniforms.petSeasonNoise.value = patch.noise;
          patch.shader.uniforms.petSeasonEnabled.value = patch.enabled;
          patch.shader.uniforms.petSeasonColorA.value = patch.colorA;
          patch.shader.uniforms.petSeasonColorB.value = patch.colorB;
        }
        elements.appearanceHint.textContent = "当前为赛季外观预览，颜色基于接口提供的调色数据。";
      } else {
        const patch = material.userData.petSeason;
        patch.enabled = 0;
        if (patch.shader) patch.shader.uniforms.petSeasonEnabled.value = 0;
        elements.appearanceHint.textContent = "外观及贴图由宠物展示接口提供。";
      }
      material.needsUpdate = true;
    }
    elements.badge.textContent = appearance.label;
  } catch (error) {
    elements.appearanceHint.textContent = error.message;
    setStatus(error.message, true);
  }
}

function playAction(actionName) {
  const action = state.actions.get(actionName);
  if (!action) return;
  state.mixer.stopAllAction();
  action.reset();
  const looping = /^(?:Idle|SleepLoop|SleepStand)$/i.test(actionName);
  action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
  action.clampWhenFinished = !looping;
  action.play();
  state.currentAction = action;
}

function returnToIdle() {
  if (state.idleAction) playAction(state.idleAction);
}

async function loadModel(modelId) {
  const petModel = getModel(modelId);
  if (!petModel) return;
  elements.modelSelect.disabled = true;
  elements.appearanceSelect.disabled = true;
  elements.eyesSelect.disabled = true;
  elements.actionSelect.disabled = true;
  elements.playAction.disabled = true;
  elements.loading.classList.remove("is-hidden");
  elements.loading.querySelector(".loading-spinner").hidden = false;
  elements.loadingTitle.textContent = `正在加载${petModel.label}`;
  setProgress(4, `准备读取模型资源（约 ${(petModel.packageBytes / 1048576).toFixed(1)} MB）…`);
  setStatus(`正在加载：${petModel.label}`);
  disposeModel();
  state.currentModelId = modelId;

  try {
    const assets = { ...state.config.assets, ...petModel.assets };
    const [bodyTexture, eyeTexture, maskTexture] = await Promise.all([
      loadTexture(assets.body),
      loadTexture(assets.eyes),
      assets.mask ? loadTexture(assets.mask, THREE.NoColorSpace) : Promise.resolve(null),
    ]);
    state.bodyTexture = bodyTexture;
    state.currentEyeTexture = eyeTexture;
    state.maskTexture = maskTexture;
    setProgress(20, "贴图已载入，正在读取 3D 模型…");

    const gltf = await loader.loadAsync(assetUrl(assets.model), (event) => {
      if (event.lengthComputable) setProgress(20 + event.loaded / event.total * 65, "正在下载并解析宠物模型…");
    });
    state.model = gltf;
    gltf.scene.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const originalMaterials = Array.isArray(node.material) ? node.material : [node.material];
      const materials = originalMaterials.map((material) => material.clone());
      originalMaterials.forEach((material) => {
        if (material.map) state.modelTextures.add(material.map);
      });
      node.material = Array.isArray(node.material) ? materials : materials[0];
      for (const material of materials) {
        material.metalness = 0;
        material.roughness = 0.82;
        if (isEyeMaterial(material)) {
          material.map = eyeTexture.clone();
          material.map.colorSpace = THREE.SRGBColorSpace;
          material.alphaTest = 0.25;
          material.transparent = false;
          state.modelTextures.add(material.map);
          state.eyeMaterials.push(material);
        } else if (isBodyMaterial(material)) {
          material.map = bodyTexture;
          createSeasonShader(material);
          state.bodyMaterials.push(material);
        }
        material.needsUpdate = true;
      }
    });
    scene.add(gltf.scene);
    elements.title.textContent = petModel.label;
    elements.subtitle.textContent = petModel.subtitle || "";
    fitModel(gltf.scene);
    applyEyeExpression(state.eyeId);
    await applyAppearance();

    state.mixer = new THREE.AnimationMixer(gltf.scene);
    const allowedActions = new Set(state.config.pet.allowedActions || []);
    for (const clip of gltf.animations || []) {
      if (allowedActions.size && !allowedActions.has(clip.name)) continue;
      state.actions.set(clip.name, state.mixer.clipAction(clip));
    }
    const actionOptions = [...state.actions.keys()].map((id) => ({ id }));
    const idleName = [...state.actions.keys()].find((name) => /^Idle$/i.test(name))
      || [...state.actions.keys()].find((name) => /Idle/i.test(name));
    state.idleAction = idleName || null;
    setSelectOptions(elements.actionSelect, actionOptions, idleName || actionOptions[0]?.id, (action) => ACTION_LABELS[action.id] || action.id);
    elements.playAction.disabled = actionOptions.length === 0;
    elements.actionHint.textContent = actionOptions.length
      ? `此形态包含 ${actionOptions.length} 个模型动作。`
      : "此模型没有可播放的动画。";
    if (idleName) playAction(idleName);
    state.mixer.addEventListener("finished", (event) => {
      if (event.action === state.currentAction && event.action !== state.idleAction) returnToIdle();
    });

    elements.loading.classList.add("is-hidden");
    elements.modelSelect.disabled = false;
    elements.appearanceSelect.disabled = false;
    elements.eyesSelect.disabled = false;
    elements.actionSelect.disabled = actionOptions.length === 0;
    setProgress(100, "模型加载完成。");
    setStatus(`已加载 · ${actionOptions.length} 个可选动作`);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("model", modelId);
    history.replaceState(null, "", currentUrl);
  } catch (error) {
    elements.modelSelect.disabled = false;
    elements.appearanceSelect.disabled = false;
    elements.eyesSelect.disabled = false;
    elements.actionSelect.disabled = true;
    showError(error.message || "宠物模型加载失败，请稍后重试。");
  }
}

function animate() {
  requestAnimationFrame(animate);
  state.mixer?.update(Math.min(clock.getDelta(), 0.05));
  controls.update();
  renderer.render(scene, camera);
}

async function initialize() {
  if (!renderer.capabilities.isWebGL2 && !renderer.capabilities.isWebGL) {
    throw new Error("当前浏览器不支持 WebGL，无法显示 3D 宠物模型。");
  }
  setProgress(2, "正在读取展示配置…");
  const response = await fetch(apiUrl("/api/pet-viewer/config"), { cache: "no-store" });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `宠物展示配置读取失败（HTTP ${response.status}）。`);
  }
  state.config = await response.json();
  if (state.config.enabled !== true || !Array.isArray(state.config.pet?.models) || !state.config.pet.models.length) {
    throw new Error("宠物展示服务当前没有可用的模型。");
  }
  populateControls();
  new ResizeObserver(resizeRenderer).observe(elements.stage);
  window.addEventListener("resize", resizeRenderer);
  resizeRenderer();
  animate();
  await loadModel(state.currentModelId);
}

initialize().catch((error) => {
  console.error("Pet viewer initialization failed:", error);
  showError(error.message || "宠物展示初始化失败，请稍后重试。");
});
