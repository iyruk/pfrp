"use strict";

const $ = (id) => document.getElementById(id);

const els = {
  railLogo: $("railLogo"),
  drawer: $("drawer"),
  dTitle: $("dTitle"),
  dList: $("dList"),
  dSearch: $("dSearch"),
  createBtn: $("createBtn"),
  importBtn: $("importBtn"),
  importInput: $("importInput"),
  dropOverlay: $("dropOverlay"),
  dCollapse: $("dCollapse"),
  drawerMenu: $("drawerMenu"),
  settingsBtn: $("settingsBtn"),
  chatAvatar: $("chatAvatar"),
  chatName: $("chatName"),
  chatSub: $("chatSub"),
  msgsInner: $("msgsInner"),
  msgs: $("msgs"),
  emptyState: $("emptyState"),
  input: $("input"),
  composer: $("composer"),
  speakerRow: $("speakerRow"),
  suggestedRow: $("suggestedRow"),
  guidedBtn: $("guidedBtn"),
  sendBtn: $("sendBtn"),
  stopBtn: $("stopBtn"),
  helpWrite: $("helpWrite"),
  imgBtn: $("imgBtn"),
  ctxToggle: $("ctxToggle"),
  ctxwrap: $("ctxwrap"),
  ctx: $("ctx"),
  welcomeOverlay: $("welcomeOverlay"),
  welcomeName: $("welcomeName"),
  welcomeDesc: $("welcomeDesc"),
  welcomeContinue: $("welcomeContinue"),
  welcomeRefuse: $("welcomeRefuse"),
  welcomeGen: $("welcomeGen"),
  charDot: $("charDot"),
};

let activeDrawer = "chats";
let characters = [];
let threads = [];
let activeThread = null;
let activeCharacter = null;
let activeScene = null;
let contextChar = null;
let activeMessages = [];
let streams = new Map();
let chatContextTab = "persona";
let chatSettingsTab = "settings";
let trackerSubTab = "world";
let modelCache = [];
let modelCacheFor = null;
let prevDrawer = null;
let composerGuided = false;
const convertingJobs = new Map();
let charSort = "updated";
let charFolderFilter = "";
let charTagFilter = "";
let chatSort = "updated";
let chatFolderFilter = "";
let loreEntries = [];
let imageRecords = [];
let scenes = [];
let settingsShowTab = null;

function isConverting(c) {
  return !!(c && c.converting);
}

function isGenerating(threadId) {
  return streams.has(threadId);
}

function isProviderConfigured(conn) {
  return Provider.isConfigured(conn);
}

function ensureProviderConfigured(actionName = "use this feature") {
  if (isProviderConfigured()) return true;
  const conn = pfrpSettings.activeConnection();
  const preset = PROVIDERS[conn.provider] || PROVIDERS.openrouter;

  const wrap = UI.el("div", "");
  wrap.appendChild(UI.el("p", "modal-desc", `An AI connection is required before ${actionName}. Please configure your API key or connection details in Settings > Connection.`));

  const act = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  const openSet = UI.el("button", "btn primary", `${UI.fa("gear")} Open Settings`);
  cancel.addEventListener("click", () => overlay.remove());
  openSet.addEventListener("click", () => {
    overlay.remove();
    openSettingsModal();
    if (typeof settingsShowTab === "function") settingsShowTab("conn");
  });
  act.append(cancel, openSet);
  wrap.appendChild(act);
  const overlay = UI.openModal(wrap, { title: "AI Connection Required" });
  return false;
}

function currentThreadModel() {
  return (activeThread && activeThread.modelName) || pfrpSettings.activeConnection().model || (PROVIDERS[pfrpSettings.activeConnection().provider] || PROVIDERS.openrouter).defaultModel || "";
}

function rememberModel(model) {
  if (!model) return;
  const s = pfrpSettings.data;
  if (!Array.isArray(s.recentModels)) s.recentModels = [];
  s.recentModels = s.recentModels.filter((r) => r.model !== model);
  s.recentModels.unshift({ model, at: Date.now() });
  s.recentModels = s.recentModels.slice(0, 8);
  pfrpSettings.save();
}

function storySetting(t, key) {
  const defs = pfrpSettings.data.story || {};
  if (t && t[key] != null && t[key] !== "") return t[key];
  return defs[key] != null ? defs[key] : STORY_DEFAULTS[key];
}

const STORY_DEFAULTS = {
  difficulty: "average",
  pacing: "natural",
  pov: "2nd",
  tense: "present",
  delivery: "normal",
  style: "",
};

const STORY_INSTRUCTIONS = {
  difficulty: {
    easy: "World difficulty is easy - characters naturally cooperate and situations resolve smoothly.",
    average: "Characters' behavior naturally aligns with the situation and their personality.",
    difficult: "Characters are often uncooperative - expect resistance, friction, and complications.",
    nightmare: "The world is hostile - characters are frequently uncooperative and situations turn dangerous.",
  },
  pacing: {
    fast: "Pacing: explosive, rapid scenario progression.",
    natural: "Pacing: realistic scenario progression.",
    slow: "Pacing: slow-burn - let scenes simmer and tension build gradually.",
  },
  pov: {
    "1st": "Point of view: first person (I/me) for narration and descriptions.",
    "2nd": "Point of view: second person - describe the world as the user experiences it (you).",
    "3rd": "Point of view: third person - narrate from an external perspective (he/she/they).",
  },
  tense: {
    past: "Tense: past - narrate events as they happened (e.g. she walked).",
    present: "Tense: present - narrate events as they happen (e.g. she walks).",
  },
  delivery: {
    dialogue: "Narrative delivery: lean toward more dialogue than description.",
    normal: "Narrative delivery: balance dialogue and description.",
    actions: "Narrative delivery: lean toward more actions and body language than dialogue.",
  },
  style: {
    "high-society": "Storytelling style: high society - elegant, formal, opulent tone.",
    noir: "Storytelling style: noir - hardboiled, shadowy, cynical tone.",
    "after-dark": "Storytelling style: after dark - sensual, atmospheric, late-night tone.",
    nostalgia: "Storytelling style: nostalgia - wistful, warm, memory-tinged tone.",
    blockbuster: "Storytelling style: blockbuster - cinematic, high-stakes, spectacle-driven tone.",
    arcane: "Storytelling style: arcane - mystical, esoteric, magical tone.",
    "manga-style": "Storytelling style: manga - dramatic, exaggerated, panel-like beats.",
    "impending-doom": "Storytelling style: impending doom - creeping dread and ominous foreshadowing.",
  },
};

function storyInstructions(t) {
  const lines = [];
  const keys = ["difficulty", "pacing", "pov", "tense", "delivery", "style"];
  for (const key of keys) {
    const v = storySetting(t, key);
    if (!v) continue;
    const line = (STORY_INSTRUCTIONS[key] || {})[v];
    if (line) lines.push(line);
  }
  return lines;
}

function storyControls(get, set) {
  const grid = UI.el("div", "story-grid");
  const defs = [
    ["difficulty", "World Difficulty"],
    ["pacing", "Pacing"],
    ["pov", "Point of View"],
    ["tense", "Chat Tense"],
    ["delivery", "Narrative Delivery"],
    ["style", "Storytelling Style"],
  ];
  for (const [key, label] of defs) {
    const cell = UI.el("div", "form-group");
    cell.appendChild(UI.el("label", "field-label", label));
    const sel = UI.el("select", "select");
    for (const o of STORY_OPTIONS[key]) {
      const opt = UI.el("option", "", o.label);
      opt.value = o.value;
      sel.appendChild(opt);
    }
    sel.value = get(key) || "";
    sel.addEventListener("change", () => set(key, sel.value));
    cell.appendChild(sel);
    grid.appendChild(cell);
  }
  return grid;
}

function toggleFavoriteModel(model) {
  if (!model) return false;
  const s = pfrpSettings.data;
  if (!Array.isArray(s.favoriteModels)) s.favoriteModels = [];
  const i = s.favoriteModels.indexOf(model);
  if (i >= 0) {
    s.favoriteModels.splice(i, 1);
    pfrpSettings.save();
    return false;
  }
  s.favoriteModels.unshift(model);
  pfrpSettings.save();
  return true;
}

function isFavoriteModel(model) {
  return !!model && (pfrpSettings.data.favoriteModels || []).includes(model);
}

function modelChipsRow(currentModel, onPick) {
  const s = pfrpSettings.data;
  const row = UI.el("div", "model-chips");
  const favs = (s.favoriteModels || []).slice(0, 5);
  const recents = (s.recentModels || [])
    .map((r) => r.model)
    .filter((m) => m !== currentModel && !favs.includes(m))
    .slice(0, 5);
  const add = (model, icon, title) => {
    const chip = UI.el("button", "fchip", `${UI.fa(icon)} ${esc(model)}`);
    chip.title = title;
    chip.addEventListener("click", () => onPick(model));
    row.appendChild(chip);
  };
  for (const m of favs) add(m, "star", "Favorite model - click to use");
  for (const m of recents) add(m, "clock", "Recently used - click to use");
  return row;
}

function invalidateModelCache() {
  modelCache = [];
  modelCacheFor = null;
}

async function loadModelCache() {
  if (!isProviderConfigured()) {
    modelCache = [];
    modelCacheFor = null;
    return;
  }
  const connId = pfrpSettings.activeConnection().id;
  try {
    const data = await Provider.listModels();
    const list = Array.isArray(data.data)
      ? data.data.map((m) => m.id)
      : Array.isArray(data.models)
        ? data.models.map((m) => m.name || m.id)
        : [];
    modelCache = list.filter(Boolean).sort();
    modelCacheFor = connId;
  } catch {
    modelCache = [];
    modelCacheFor = null;
  }
}

function buildModelControl(t) {
  const wrap = UI.el("div", "");
  const current = (t && t.modelName) || pfrpSettings.activeConnection().model;
  const pick = async (model) => {
    if (!t) return;
    t.modelName = model;
    await pfrpDB.put("threads", t);
    rememberModel(model);
    renderContext();
    UI.showToast("Model set to " + model);
  };
  const chips = modelChipsRow(current, pick);
  wrap.appendChild(chips);

  const row = UI.el("div", "key-row");
  const sel = UI.el("select", "select");
  const options = new Set(modelCache);
  if (current) options.add(current);
  for (const id of options) {
    sel.appendChild(UI.el("option", "", id));
  }
  sel.value = current || "";
  sel.addEventListener("change", async () => {
    if (!t) return;
    t.modelName = sel.value;
    await pfrpDB.put("threads", t);
    rememberModel(sel.value);
    renderContext();
    UI.showToast("Model set to " + sel.value);
  });
  const starBtn = UI.el("button", "iconbtn" + (isFavoriteModel(current || "") ? " fav" : ""), UI.fa("star"));
  starBtn.title = "Toggle favorite for the current model";
  starBtn.addEventListener("click", () => {
    toggleFavoriteModel(current || "");
    renderContext();
  });
  const refresh = UI.el("button", "iconbtn", UI.fa("rotate"));
  refresh.title = "Refresh model list";
  refresh.addEventListener("click", async () => {
    refresh.disabled = true;
    await loadModelCache();
    refresh.disabled = false;
    renderContext();
    UI.showToast(modelCache.length ? modelCache.length + " models loaded" : "Could not fetch models", { type: modelCache.length ? "" : "err" });
  });
  if (!modelCache.length || modelCacheFor !== pfrpSettings.activeConnection().id) {
    loadModelCache().then(() => {
      if (activeThread === t) renderContext();
    });
  }
  row.append(sel, starBtn, refresh);
  wrap.appendChild(row);
  return wrap;
}

/* ---------------- CROSS-TAB SYNC ---------------- */
const Sync = {
  _channel: null,
  _fallbackKey: "pfrp.sync.ping.v1",

  init() {
    const handle = (msg) => {
      if (!msg) return;
      if (msg.type === "dataReset") {
        location.reload();
        return;
      }
      if (msg.type === "dataChanged") this.onDataChanged();
    };
    if (typeof BroadcastChannel !== "undefined") {
      this._channel = new BroadcastChannel("pfrp-sync");
      this._channel.onmessage = (e) => handle(e.data);
    }
    window.addEventListener("storage", (e) => {
      if (e.key !== this._fallbackKey || !e.newValue) return;
      const v = String(e.newValue);
      handle({ type: v.split(":")[0] });
    });
  },

  notify() {
    if (this._channel) {
      this._channel.postMessage({ type: "dataChanged", at: Date.now() });
    }
    try {
      localStorage.setItem(this._fallbackKey, "dataChanged:" + Date.now());
    } catch {}
  },

  onDataChanged() {
    if (streams.size) return;
    loadData().then(() => {
      renderCenter();
      renderContext();
      if (activeThread) {
        const id = activeThread.id;
        return pfrpDB.byIndex("messages", "threadId", id).then((all) => {
          activeMessages = all.sort((a, b) => a.order - b.order);
          renderAllMessages();
        });
      }
    });
  },
};

/* ---------------- WELCOME / GATE ---------------- */
function initWelcome() {
  if (pfrpSettings.gatePassed()) {
    els.welcomeOverlay.remove();
    return;
  }
  els.welcomeOverlay.style.display = "flex";

  const conn = pfrpSettings.activeConnection();
  const provEl = $("welcomeProvider");
  const modelEl = $("welcomeModel");
  const keyEl = $("welcomeApiKey");
  const keyToggle = $("welcomeKeyToggle");
  const keyLink = $("welcomeKeyLink");
  const keyWrap = $("welcomeKeyWrap");
  const urlEl = $("welcomeBaseUrl");
  const urlWrap = $("welcomeUrlWrap");
  const urlHint = $("welcomeUrlHint");
  const testBtn = $("welcomeTestBtn");
  const testStatus = $("welcomeTestStatus");

  if (provEl) provEl.value = conn.provider || "openrouter";
  if (modelEl) modelEl.value = conn.model || "";
  if (keyEl) keyEl.value = conn.apiKey || "";
  if (urlEl) urlEl.value = conn.baseUrl || "";

  const KEY_LINKS = {
    openrouter: { url: "https://openrouter.ai/keys", label: "Get OpenRouter key" },
    openai: { url: "https://platform.openai.com/api-keys", label: "Get OpenAI key" },
    nanogpt: { url: "https://nano-gpt.com", label: "Get NanoGPT key" },
  };

  const URL_HINTS = {
    ollama: "Set OLLAMA_ORIGINS=\"*\" (or rp.iyruk.com) on your machine for browser access.",
    nanogpt: "NanoGPT requires an API key from nano-gpt.com.",
  };

  function updateWelcomeProviderUI() {
    if (!provEl) return;
    const p = provEl.value;
    const preset = PROVIDERS[p] || PROVIDERS.openrouter;
    const needsKey = preset.needsKey;
    if (keyWrap) keyWrap.style.display = needsKey ? "" : "none";
    if (keyLink) {
      if (KEY_LINKS[p]) {
        keyLink.href = KEY_LINKS[p].url;
        keyLink.innerHTML = `${KEY_LINKS[p].label} <i class="fa-solid fa-arrow-up-right-from-square"></i>`;
        keyLink.style.display = "";
      } else {
        keyLink.style.display = "none";
      }
    }
    if (urlWrap) urlWrap.style.display = p === "ollama" ? "" : "none";
    if (urlEl) urlEl.placeholder = preset.baseUrl || "";
    if (urlHint) urlHint.textContent = URL_HINTS[p] || "";
    if (modelEl) modelEl.placeholder = preset.defaultModel || "";
  }

  if (provEl) {
    provEl.addEventListener("change", updateWelcomeProviderUI);
    updateWelcomeProviderUI();
  }

  if (keyToggle && keyEl) {
    keyToggle.addEventListener("click", () => {
      const isPass = keyEl.type === "password";
      keyEl.type = isPass ? "text" : "password";
      keyToggle.innerHTML = `<i class="fa-solid fa-${isPass ? "eye-slash" : "eye"}"></i>`;
    });
  }

  function applyWelcomeToConn() {
    const c = pfrpSettings.activeConnection();
    if (provEl) c.provider = provEl.value;
    if (keyEl) c.apiKey = keyEl.value.trim();
    if (modelEl) c.model = modelEl.value.trim();
    if (urlEl) c.baseUrl = urlEl.value.trim();
    return c;
  }

  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      applyWelcomeToConn();
      if (!isProviderConfigured()) {
        testStatus.textContent = "Please enter an API key first.";
        testStatus.style.color = "var(--danger)";
        return;
      }
      testBtn.disabled = true;
      testStatus.textContent = "Testing connection…";
      testStatus.style.color = "";
      try {
        const data = await Provider.ping();
        const reply = data.choices?.[0]?.message?.content || "Connected";
        testStatus.textContent = "Connected! " + reply.trim().slice(0, 30);
        testStatus.style.color = "var(--ok)";
      } catch (e) {
        testStatus.textContent = "Connection failed: " + e.message;
        testStatus.style.color = "var(--danger)";
      } finally {
        testBtn.disabled = false;
      }
    });
  }

  els.welcomeRefuse.addEventListener("click", () => {
    document.body.innerHTML = "<div style='display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-dim)'>You must be 18 or older to use this application.</div>";
  });

  els.welcomeContinue.addEventListener("click", () => {
    applyWelcomeToConn();
    const name = els.welcomeName.value.trim() || "You";
    const desc = els.welcomeDesc.value.trim();
    const personas = pfrpSettings.data.personas || [];
    const defaultPersona = personas.find((p) => p.id === "default");
    if (defaultPersona) {
      defaultPersona.name = name;
      defaultPersona.description = desc;
    } else {
      personas.unshift({ id: "default", name, description: desc });
    }
    pfrpSettings.data.personas = personas;
    pfrpSettings.data.activePersonaId = "default";
    pfrpSettings.data.user.name = name;
    pfrpSettings.data.user.personaText = desc;
    pfrpSettings.save();
    pfrpSettings.setGatePassed();
    els.welcomeOverlay.remove();
    if (isProviderConfigured()) {
      UI.showToast("Welcome to Purple's RP, " + name);
    } else {
      UI.showToast("Welcome! Tip: Add an API key in Settings > Connection to chat.", { duration: 6000 });
    }
  });

  els.welcomeGen.addEventListener("click", async () => {
    applyWelcomeToConn();
    const name = els.welcomeName.value.trim();
    const hint = els.welcomeDesc.value.trim();
    if (!name) {
      UI.showToast("Enter your name first", { type: "err" });
      return;
    }
    if (!isProviderConfigured()) {
      UI.showToast("Please enter an API key in Step 2 first", { type: "err" });
      if (keyEl) keyEl.focus();
      return;
    }
    els.welcomeGen.disabled = true;
    els.welcomeGen.innerHTML = UI.fa("spinner") + " Generating…";
    try {
      const sys = "You are helping a user describe themselves for roleplay. Return ONLY a short second-person-free, first-person persona description (3-6 sentences) covering personality, style, and how they like stories to go. No markdown, no extra text.";
      const text = await Provider.complete([{ role: "user", content: "My name is " + name + (hint ? ". Here is what I wrote about myself: " + hint : ".") }], { system: sys, temperature: 0.8 });
      els.welcomeDesc.value = text.trim();
    } catch (e) {
      UI.showToast("Generation failed: " + e.message, { type: "err" });
    } finally {
      els.welcomeGen.disabled = false;
      els.welcomeGen.innerHTML = UI.fa("wand-magic-sparkles") + " Generate with AI";
    }
  });
}

/* ---------------- THEME ---------------- */
function applyTheme() {
  const s = pfrpSettings.data;
  const t = THEMES[s.theme] || THEMES.purple;
  let a1, a2;
  if (s.theme === "custom") {
    a1 = s.themeCustom || "#a78bfa";
    a2 = s.themeCustom || "#a78bfa";
  } else {
    a1 = t.accent1;
    a2 = t.accent2;
  }
  document.documentElement.dataset.theme = s.dark ? "dark" : "light";
  const root = document.documentElement.style;
  root.setProperty("--link-color", a1);
  root.setProperty("--link-color-2", a1);
  root.setProperty("--link-soft", hexToRgba(a1, 0.12));
  root.setProperty("--accent1", a1);
  root.setProperty("--accent2", a2);
  applyAvatarShape();
}
function applyAvatarShape() {
  const shape = pfrpSettings.data.avatarShape || "circle";
  document.documentElement.dataset.avatarShape = ["circle", "square", "squircle"].includes(shape) ? shape : "circle";
}
function applyCompactMode() {
  const compact = !!(pfrpSettings.data.ui && pfrpSettings.data.ui.compactChat);
  if (compact) document.documentElement.dataset.compact = "1";
  else delete document.documentElement.dataset.compact;
}
function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------------- DRAWER ---------------- */
const DRAWERS = {
  chats: { icon: "comments", title: "Chats", build: renderChatsDrawer, create: "chat", folders: "threads" },
  chars: { icon: "masks-theater", title: "Characters", build: renderCharsDrawer, create: "char", folders: "characters" },
  scenes: { icon: "film", title: "Scenes", build: renderScenesDrawer, create: "scene" },
  images: { icon: "images", title: "Images", build: renderImagesDrawer, create: "image" },
  lore: { icon: "book", title: "Lore", build: renderLoreDrawer, create: "lore" },
};

function setDrawer(key) {
  closeMenu();
  const changed = prevDrawer !== key;
  prevDrawer = key;
  activeDrawer = key;
  contextChar = null;
  if (key === "chats") closeCtxPanelVisual();
  else setCtx(false);
  els.ctxToggle.style.display = key === "chats" ? "" : "none";
  document.querySelectorAll(".rail-btn[data-drawer]").forEach((b) => {
    b.classList.toggle("active", b.dataset.drawer === key);
  });
  const d = DRAWERS[key];
  els.dTitle.innerHTML = `${UI.fa(d.icon)}${d.title}`;
  d.build();
  els.dSearch.value = "";
  els.createBtn.style.display = d.create ? "" : "none";
  els.createBtn.title = "Create " + d.title.toLowerCase().replace(/s$/, "");
  els.drawerMenu.style.display = d.folders ? "" : "none";
  pfrpSettings.data.ui.lastDrawer = key;
  pfrpSettings.save();
  openDrawer();
  if (changed) restoreDrawerSelection(key);
  if (isMobileWidth()) setDrawerOpen(false);
}

function restoreDrawerSelection(key) {
  if (key === "chats") {
    const lastId = pfrpSettings.data.ui.lastOpen && pfrpSettings.data.ui.lastOpen.chats;
    if (lastId && threads.some((t) => t.id === lastId)) {
      openThread(lastId, true);
      return;
    }
    clearCenterSelection();
    renderEmptySelection("chats");
  } else if (key === "chars") {
    const lastId = pfrpSettings.data.ui.lastOpen && pfrpSettings.data.ui.lastOpen.chars;
    if (lastId && characters.some((c) => c.id === lastId)) {
      viewCharacter(lastId);
      return;
    }
    clearCenterSelection();
    renderEmptySelection("chars");
  } else if (key === "scenes") {
    const lastId = pfrpSettings.data.ui.lastOpen && pfrpSettings.data.ui.lastOpen.scenes;
    if (lastId && scenes.some((s) => s.id === lastId)) {
      viewScene(lastId);
      return;
    }
    clearCenterSelection();
    renderEmptySelection("scenes");
  } else {
    clearCenterSelection();
    renderEmptySelection(key);
  }
}

function clearCenterSelection() {
  activeThread = null;
  activeCharacter = null;
  activeScene = null;
  activeMessages = [];
  contextChar = null;
  renderCenter();
}

function setDrawerOpen(open) {
  els.drawer.classList.toggle("collapsed", !open);
  els.drawer.classList.toggle("open", open);
  pfrpSettings.data.ui.drawerOpen = open;
  pfrpSettings.save();
  let pin = els.drawer._pin;
  if (open) {
    if (pin) pin.remove();
    els.drawer._pin = null;
    els.dCollapse.innerHTML = UI.fa("angles-left");
    els.dCollapse.title = "Collapse panel";
  } else {
    if (!pin) {
      pin = UI.el("button", "drawer-pin", UI.fa("angles-right"));
      pin.title = "Expand panel";
      pin.addEventListener("click", () => setDrawerOpen(true));
      document.querySelector(".rail").appendChild(pin);
      els.drawer._pin = pin;
    }
  }
}

function openDrawer() {
  setDrawerOpen(true);
}

function avatarHtml(record, size = "") {
  const cls = size ? "av " + size : "av";
  if (record && record.avatar && record.avatar.startsWith("data:")) {
    return `<div class="${cls}" style="background:linear-gradient(135deg,var(--accent1),var(--accent2))"><img src="${record.avatar}" alt=""></div>`;
  }
  const initial = (record && record.name ? record.name[0] : "?").toUpperCase();
  return `<div class="${cls}" style="background:linear-gradient(135deg,var(--accent1),var(--accent2))">${initial}</div>`;
}

function threadAvatarDataUrl(t) {
  if (t && t.avatar && t.avatar.startsWith("data:")) return t.avatar;
  if (t && t.character && t.character.avatar && t.character.avatar.startsWith("data:")) return t.character.avatar;
  return "";
}

function userAvatarHtml() {
  const persona = threadPersona(activeThread) || pfrpSettings.activePersona();
  if (persona && persona.avatar) {
    return `<div class="av"><img src="${persona.avatar}" alt=""></div>`;
  }
  const u = pfrpSettings.data.user;
  const initial = ((persona && persona.name) ? persona.name[0] : (u.name ? u.name[0] : "U")).toUpperCase();
  if (u.avatar) {
    return `<div class="av"><img src="${u.avatar}" alt=""></div>`;
  }
  return `<div class="av" style="background:linear-gradient(135deg,#22d3ee,#6366f1)">${initial}</div>`;
}

function sortSelect(current, onChange) {
  const sel = UI.el("select", "select d-sort");
  const opts = [["updated", "Last modified"], ["name", "Name A-Z"]];
  for (const [v, l] of opts) {
    const o = UI.el("option", "", l);
    o.value = v;
    sel.appendChild(o);
  }
  sel.value = current;
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function folderChips(folders, current, onChange, label = "All") {
  const row = UI.el("div", "folders");
  const mk = (value, text) => {
    const chip = UI.el("button", "fchip" + (current === value ? " active" : ""), (value ? UI.fa("folder") + " " : "") + esc(text));
    chip.addEventListener("click", () => onChange(value));
    row.appendChild(chip);
  };
  mk("", label);
  for (const f of folders) mk(f, f);
  return row;
}

function renderChatsDrawer() {
  const wrap = UI.el("div", "");
  wrap.appendChild(sortSelect(chatSort, (v) => { chatSort = v; renderChatsDrawer(); }));
  const chatFolders = [...new Set(threads.map((t) => t.folderPath || "").filter(Boolean))].sort();
  if (chatFolders.length) {
    wrap.appendChild(folderChips(chatFolders, chatFolderFilter, (v) => { chatFolderFilter = v; renderChatsDrawer(); }));
  }
  let list = threads.filter((t) => (chatFolderFilter ? (t.folderPath || "") === chatFolderFilter : true));
  if (chatSort === "name") list = list.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else list = list.slice().sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
  els.dList.innerHTML = "";
  els.dList.appendChild(wrap);

  const items = list.map(
    (t) => `<div class="d-item ${activeThread && activeThread.id === t.id ? "active" : ""} ${isGenerating(t.id) ? "generating" : ""}" data-thread="${t.id}">
      ${avatarHtml(t.character, t.avatar)}
      ${t.explicitness === "explicit" ? `<span class="nsfw-badge" title="Explicit content">18+</span>` : ""}
      <div class="d-body"><div class="d-name">${esc(t.name)}</div><div class="d-sub">${isGenerating(t.id) ? "generating..." : t.isGroup ? t.memberNames.join(", ") : esc((t.character && t.character.name) || "") + " · " + (t.isGroup ? "group" : "Individual")}</div></div>
      ${isGenerating(t.id) ? `<span class="d-spin"></span>` : `<button class="d-menu" data-threadmenu="${t.id}" title="More">${UI.fa("ellipsis")}</button>`}
    </div>`
  );
  const listEl = UI.el("div", "d-items");
  listEl.innerHTML = items.join("") || `<div class="empty"><p>No chats yet. Create one to begin.</p></div>`;
  wrap.appendChild(listEl);

  els.dList.querySelectorAll(".d-item[data-thread]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-threadmenu]")) return;
      openThread(parseInt(el.dataset.thread));
    });
  });
  els.dList.querySelectorAll("[data-threadmenu]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = b.closest(".d-item");
      const open = t.classList.contains("menuOpen");
      document.querySelectorAll(".d-item").forEach((x) => x.classList.remove("menuOpen"));
      t.classList.toggle("menuOpen", !open);
      if (!open) showThreadMenu(b, parseInt(b.dataset.threadmenu));
    });
  });
}

function renderCharsDrawer() {
  const wrap = UI.el("div", "");
  wrap.appendChild(sortSelect(charSort, (v) => { charSort = v; renderCharsDrawer(); }));
  const charFolders = [...new Set(characters.map((c) => c.folderPath || "").filter(Boolean))].sort();
  if (charFolders.length) {
    wrap.appendChild(folderChips(charFolders, charFolderFilter, (v) => { charFolderFilter = v; renderCharsDrawer(); }));
  }
  const allTags = [...new Set(characters.flatMap((c) => c.tags || []).filter((t) => t !== "example"))].sort();
  if (allTags.length) {
    const tagRow = UI.el("div", "folders");
    const mk = (value, text) => {
      const chip = UI.el("button", "fchip" + (charTagFilter === value ? " active" : ""), (value ? UI.fa("tag") + " " : "") + esc(text));
      chip.addEventListener("click", () => { charTagFilter = value; renderCharsDrawer(); });
      tagRow.appendChild(chip);
    };
    mk("", "All");
    for (const t of allTags) mk(t, t);
    wrap.appendChild(tagRow);
  }

  let items = characters.filter((c) => (charFolderFilter ? (c.folderPath || "") === charFolderFilter : true));
  if (charTagFilter) items = items.filter((c) => (c.tags || []).includes(charTagFilter));
  if (charSort === "name") items = items.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else items = items.slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  const main = items.map(
    (c) => `<div class="d-item ${c.converting ? "converting" : ""}" data-char="${c.id}">
      ${avatarHtml(c)}
      ${c.explicitness === "explicit" ? `<span class="nsfw-badge" title="Explicit content">18+</span>` : ""}
      ${c.converting ? `<span class="d-spin"></span>` : ""}
      <div class="d-body"><div class="d-name">${esc(c.name)}</div><div class="d-sub">${c.converting ? "converting with AI..." : esc(c.tagline || c.description || "")}</div></div>
      ${c.converting ? `<button class="d-menu cancel" data-cancelconv="${c.id}" title="Cancel conversion">${UI.fa("xmark")}</button>` : `<button class="d-menu" data-charmenu="${c.id}" title="More">${UI.fa("ellipsis")}</button>`}
    </div>`
  );

  const missing = missingSeedCharacters();
  const examples = missing.length
    ? `<div class="d-sec">Example characters</div>` +
      missing
        .map(
          (s) => `<div class="d-item example-item" data-example="${s.seedId}">
            <div class="av" style="background:linear-gradient(135deg,var(--accent1),var(--accent2))">${s.avatar && s.avatar.startsWith("data:") ? `<img src="${s.avatar}" alt="">` : esc((s.name[0] || "?").toUpperCase())}</div>
            ${s.explicitness === "explicit" ? `<span class="nsfw-badge" title="Explicit content">18+</span>` : ""}
            <div class="d-body"><div class="d-name">${esc(s.name)}</div><div class="d-sub">${esc(s.tagline || "")} · click to add</div></div>
            <button class="d-menu add" title="Add this character">${UI.fa("plus")}</button>
          </div>`
        )
        .join("")
    : "";

  els.dList.innerHTML = "";
  els.dList.appendChild(wrap);
  const listEl = UI.el("div", "d-items");
  listEl.innerHTML = main.join("") || `<div class="empty"><p>No characters yet. Create one or import a character card.</p></div>`;
  wrap.appendChild(listEl);
  const exEl = UI.el("div", "");
  exEl.innerHTML = examples;
  wrap.appendChild(exEl);

  els.dList.querySelectorAll(".d-item[data-char]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-charmenu]") || e.target.closest("[data-cancelconv]")) return;
      const id = parseInt(el.dataset.char);
      const c = characters.find((x) => x.id === id);
      if (c && c.converting) {
        UI.showToast("This character is being converted. Cancel or wait for it to finish.", { type: "err" });
        return;
      }
      viewCharacter(id);
    });
  });
  els.dList.querySelectorAll("[data-cancelconv]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      cancelConversion(parseInt(b.dataset.cancelconv));
    });
  });
  els.dList.querySelectorAll("[data-charmenu]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = b.closest(".d-item");
      const open = t.classList.contains("menuOpen");
      document.querySelectorAll(".d-item").forEach((x) => x.classList.remove("menuOpen"));
      t.classList.toggle("menuOpen", !open);
      if (!open) showCharMenu(b, parseInt(b.dataset.charmenu));
    });
  });
  els.dList.querySelectorAll("[data-example]").forEach((el) => {
    el.addEventListener("click", async () => {
      const seed = SEED_CHARACTERS.find((s) => s.seedId === el.dataset.example);
      if (!seed) return;
      await pfrpDB.add("characters", {
        seedId: seed.seedId,
        name: seed.name,
        tagline: seed.tagline,
        description: seed.description,
        personality: seed.personality,
        attitude: seed.attitude,
        appearance: seed.appearance,
        scenario: seed.scenario,
        first_mes: seed.first_mes,
        mes_example: seed.mes_example,
        system_prompt: seed.system_prompt,
        explicitness: seed.explicitness,
        avatar: seed.avatar || "",
        tags: seed.seedId === "nova-sfw" ? ["example"] : ["example", "nsfw"],
        seedVersion: SEED_VERSION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await loadData();
      UI.showToast("Added " + seed.name);
    });
  });
}

function renderImagesDrawer() {
  const wrap = UI.el("div", "");
  if (!imageRecords.length) {
    wrap.appendChild(UI.el("div", "empty", `<p>No images yet. Generate one with the image button in the chat header, or from Settings > Images.</p>`));
  } else {
    const grid = UI.el("div", "img-grid");
    for (const rec of imageRecords.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) {
      const cell = UI.el("div", "img-cell");
      const imgEl = UI.el("img", "");
      imgEl.src = rec.url || rec.dataUrl || "";
      imgEl.alt = esc(rec.prompt || "Image");
      imgEl.loading = "lazy";
      cell.appendChild(imgEl);
      cell.title = rec.prompt || "";
      cell.addEventListener("click", () => viewImageModal(rec));
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
  }
  els.dList.innerHTML = "";
  els.dList.appendChild(wrap);
}

function viewImageModal(rec) {
  const wrap = UI.el("div", "img-view");
  const imgEl = UI.el("img", "img-view-img");
  imgEl.src = rec.url || rec.dataUrl || "";
  wrap.appendChild(imgEl);
  if (rec.prompt) wrap.appendChild(UI.el("div", "img-view-prompt", esc(rec.prompt)));
  const act = UI.el("div", "modal-actions");
  const send = UI.el("button", "btn primary", UI.fa("paper-plane") + " Send to chat");
  send.addEventListener("click", async () => {
    if (!activeThread) {
      UI.showToast("Open a chat first", { type: "err" });
      return;
    }
    overlay.remove();
    await sendImageToChat(rec);
  });
  const avatar = UI.el("button", "btn", UI.fa("user") + " Set as avatar");
  avatar.addEventListener("click", () => {
    overlay.remove();
    avatarPickerForImage(rec);
  });
  const del = UI.el("button", "btn danger", UI.fa("trash") + " Delete");
  del.addEventListener("click", async () => {
    const ok = await UI.confirmModal({ title: "Delete image?", message: "This image will be permanently removed from your gallery.", confirmText: "Delete" });
    if (!ok) return;
    await pfrpDB.del("images", rec.id);
    await loadData();
    overlay.remove();
    UI.showToast("Image deleted");
  });
  act.append(send, avatar, del);
  wrap.appendChild(act);
  const overlay = UI.openModal(wrap, { title: "Image" });
}

async function sendImageToChat(rec) {
  const t = activeThread;
  if (!t) return;
  const msg = {
    threadId: t.id,
    role: "user",
    content: rec.prompt || "Image",
    image: rec.url || rec.dataUrl,
    creationTime: Date.now(),
    order: activeMessages.length ? activeMessages[activeMessages.length - 1].order + 1 : 0,
  };
  const id = await pfrpDB.add("messages", msg);
  msg.id = id;
  activeMessages.push(msg);
  t.lastMessageTime = Date.now();
  t.updatedAt = Date.now();
  await pfrpDB.put("threads", t);
  renderAllMessages();
  updateComposerState();
  UI.showToast("Image sent to chat");
}

function avatarPickerForImage(rec) {
  const wrap = UI.el("div", "");
  const list = UI.el("div", "folder-pick");
  for (const c of characters) {
    const row = UI.el("button", "frow", `${avatarHtml(c)} ${esc(c.name)}`);
    row.addEventListener("click", async () => {
      c.avatar = rec.url || rec.dataUrl;
      c.updatedAt = Date.now();
      await pfrpDB.put("characters", c);
      overlay.remove();
      await loadData();
      UI.showToast("Avatar updated for " + c.name);
    });
    list.appendChild(row);
  }
  if (!characters.length) {
    list.appendChild(UI.el("div", "hint", "No characters yet."));
  }
  wrap.appendChild(list);
  const overlay = UI.openModal(wrap, { title: "Set as avatar" });
}

function openGenerateImageModal() {
  const img = pfrpSettings.data.images || {};
  const wrap = UI.el("div", "");
  wrap.appendChild(UI.el("label", "field-label", "Prompt"));
  const promptIn = UI.el("textarea", "textarea");
  promptIn.rows = 3;
  promptIn.placeholder = "Describe the image...";
  wrap.appendChild(promptIn);
  const status = UI.el("div", "img-status");
  const act = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const generate = UI.el("button", "btn primary", UI.fa("wand-magic-sparkles") + " Generate");
  const result = UI.el("div", "img-result");
  let generatedRec = null;

  generate.addEventListener("click", async () => {
    if (!Provider.isImageConfigured()) {
      UI.showToast("Please configure an API key for your Image Provider in Settings > Images, or switch to Pollinations (free).", { type: "err" });
      openSettingsModal();
      if (typeof settingsShowTab === "function") settingsShowTab("img");
      return;
    }
    const prompt = promptIn.value.trim();
    if (!prompt) {
      UI.showToast("Describe the image first", { type: "err" });
      return;
    }
    generate.disabled = true;
    status.textContent = "Generating...";
    try {
      const out = await Provider.image({ prompt, width: img.width || 1024, height: img.height || 1024 });
      generatedRec = {
        prompt,
        url: out.url,
        width: img.width || 1024,
        height: img.height || 1024,
        type: "generated",
        createdAt: Date.now(),
      };
      generatedRec.id = await pfrpDB.add("images", generatedRec);
      imageRecords.push(generatedRec);
      result.innerHTML = `<img src="${esc(out.url)}" alt="">`;
      result.style.display = "";
      status.textContent = "Done. Send it to the chat, or close to keep it in the gallery.";
    } catch (e) {
      status.textContent = "Generation failed: " + e.message;
    } finally {
      generate.disabled = false;
    }
  });

  const sendBtn = UI.el("button", "btn", UI.fa("paper-plane") + " Send to chat");
  sendBtn.addEventListener("click", async () => {
    if (!generatedRec) {
      UI.showToast("Generate an image first", { type: "err" });
      return;
    }
    overlay.remove();
    await sendImageToChat(generatedRec);
  });
  act.append(cancel, generate, sendBtn);
  wrap.appendChild(act);
  wrap.appendChild(status);
  wrap.appendChild(result);
  const overlay = UI.openModal(wrap, { title: "Generate image", wide: true });
}

function renderLoreDrawer() {
  const wrap = UI.el("div", "");
  const books = pfrpSettings.data.loreBooks || [];
  if (!books.length) {
    wrap.appendChild(UI.el("div", "empty", `<p>No lore books yet. Create one to store world facts, character backstories, and plot points.</p>`));
  }
  for (const b of books) {
    const entries = loreEntries.filter((e) => e.bookId === b.id);
    const sec = UI.el("div", "lore-book");
    const head = UI.el("div", "lore-book-head");
    head.appendChild(UI.el("span", "lore-book-name", `${UI.fa("book")} ${esc(b.name)}`));
    head.appendChild(UI.el("span", "lore-count", entries.length + (entries.length === 1 ? " entry" : " entries")));
    const addBtn = UI.el("button", "iconbtn", UI.fa("plus"));
    addBtn.title = "Add lore entry";
    addBtn.addEventListener("click", () => openLoreEntryEditor(null, b.id));
    const menuBtn = UI.el("button", "iconbtn", UI.fa("ellipsis"));
    menuBtn.title = "Book options";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showMenu(menuBtn, [
        { icon: "pen", label: "Rename book", desc: "Change the book's name", onClick: () => renameLoreBook(b) },
        { icon: "trash", label: "Delete book", desc: "Deletes the book and its " + entries.length + " entries", danger: true, onClick: () => deleteLoreBook(b) },
      ]);
    });
    head.append(addBtn, menuBtn);
    sec.appendChild(head);
    for (const e of entries) {
      const item = UI.el("div", "d-item lore-entry" + (e.enabled === false ? " lore-disabled" : ""));
      item.dataset.lore = e.id;
      item.innerHTML = `<div class="lore-ic">${UI.fa("scroll")}</div>
        <div class="d-body"><div class="d-name">${esc(e.name || "Untitled")}</div><div class="d-sub">${e.keys && e.keys.length ? esc(e.keys.join(", ")) : "always active"}${e.characterId ? " · " + esc((characters.find((c) => c.id === e.characterId) || {}).name || "character") : ""}</div></div>
        <div class="switch${e.enabled === false ? "" : " on"}" title="Enable / disable"></div>`;
      const sw = item.querySelector(".switch");
      sw.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        e.enabled = e.enabled === false;
        await pfrpDB.put("lore", e);
        renderLoreDrawer();
      });
      item.addEventListener("click", () => openLoreEntryEditor(e, b.id));
      sec.appendChild(item);
    }
    wrap.appendChild(sec);
  }
  els.dList.innerHTML = "";
  els.dList.appendChild(wrap);
}

function newLoreBook() {
  const rw = UI.el("div", "");
  const inp = UI.el("input", "input");
  inp.placeholder = "e.g. World, Characters, Magic system";
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") create.click(); });
  rw.appendChild(inp);
  const act = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  const create = UI.el("button", "btn primary", UI.fa("plus") + " Create book");
  cancel.addEventListener("click", () => overlay.remove());
  create.addEventListener("click", () => {
    const name = inp.value.trim();
    if (!name) return;
    const books = pfrpSettings.data.loreBooks || [];
    books.push({ id: "book-" + Date.now().toString(36), name, createdAt: Date.now() });
    pfrpSettings.data.loreBooks = books;
    pfrpSettings.save();
    overlay.remove();
    renderLoreDrawer();
    UI.showToast("Lore book created");
  });
  act.append(create, cancel);
  rw.appendChild(act);
  const overlay = UI.openModal(rw, { title: "New lore book" });
}

function renameLoreBook(b) {
  const rw = UI.el("div", "");
  const inp = UI.el("input", "input");
  inp.value = b.name;
  rw.appendChild(inp);
  const act = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  const save = UI.el("button", "btn primary", "Rename");
  cancel.addEventListener("click", () => overlay.remove());
  save.addEventListener("click", () => {
    const name = inp.value.trim();
    if (!name) return;
    b.name = name;
    pfrpSettings.save();
    overlay.remove();
    renderLoreDrawer();
    UI.showToast("Book renamed");
  });
  act.append(save, cancel);
  rw.appendChild(act);
  const overlay = UI.openModal(rw, { title: "Rename lore book" });
}

async function deleteLoreBook(b) {
  const entries = loreEntries.filter((e) => e.bookId === b.id);
  const ok = await UI.confirmModal({
    title: "Delete lore book?",
    message: `"${b.name}" and its ${entries.length} entr${entries.length === 1 ? "y" : "ies"} will be permanently deleted.`,
    confirmText: "Delete",
  });
  if (!ok) return;
  for (const e of entries) await pfrpDB.del("lore", e.id);
  pfrpSettings.data.loreBooks = (pfrpSettings.data.loreBooks || []).filter((x) => x.id !== b.id);
  pfrpSettings.save();
  await loadData();
  UI.showToast("Lore book deleted");
}

function openLoreEntryEditor(entry, bookId) {
  const isNew = !entry;
  const e = entry || { name: "", content: "", keys: [], enabled: true, characterId: "", threadId: "" };
  const wrap = UI.el("div", "");

  const gName = UI.el("div", "form-group");
  gName.appendChild(UI.el("label", "field-label", "Name"));
  const nameIn = UI.el("input", "input");
  nameIn.value = e.name || "";
  gName.appendChild(nameIn);
  wrap.appendChild(gName);

  const gContent = UI.el("div", "form-group");
  gContent.appendChild(UI.el("label", "field-label", "Content"));
  const contentIn = UI.el("textarea", "textarea");
  contentIn.rows = 8;
  contentIn.value = e.content || "";
  gContent.appendChild(contentIn);
  wrap.appendChild(gContent);

  const gKeys = UI.el("div", "form-group");
  gKeys.appendChild(UI.el("label", "field-label", "Trigger keys"));
  const keysIn = UI.el("input", "input");
  keysIn.value = (e.keys || []).join(", ");
  gKeys.appendChild(keysIn);
  gKeys.appendChild(UI.el("div", "hint", "Comma-separated words or phrases. When one appears in recent messages, this lore is added to the prompt. Leave empty to always include it."));
  wrap.appendChild(gKeys);

  const gScope = UI.el("div", "form-group");
  gScope.appendChild(UI.el("label", "field-label", "Scope"));
  const scopeSel = UI.el("select", "select");
  const globalOpt = UI.el("option", "", "Global (all chats)");
  globalOpt.value = "";
  scopeSel.appendChild(globalOpt);
  for (const c of characters) {
    const o = UI.el("option", "", "Character: " + c.name);
    o.value = c.id;
    scopeSel.appendChild(o);
  }
  scopeSel.value = e.characterId || "";
  gScope.appendChild(scopeSel);
  gScope.appendChild(UI.el("div", "hint", "Global lore applies to every chat; character lore only to chats with that character."));
  wrap.appendChild(gScope);

  const enRow = UI.el("div", "rowline");
  enRow.appendChild(UI.el("span", "", "Enabled"));
  const enSw = UI.el("div", "switch" + (e.enabled === false ? "" : " on"));
  enSw.addEventListener("click", () => enSw.classList.toggle("on"));
  enRow.appendChild(enSw);
  wrap.appendChild(enRow);

  const act = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + (isNew ? " Add entry" : " Save"));
  save.addEventListener("click", async () => {
    const record = Object.assign({}, e, {
      name: nameIn.value.trim(),
      content: contentIn.value.trim(),
      keys: keysIn.value.split(",").map((k) => k.trim()).filter(Boolean),
      enabled: enSw.classList.contains("on"),
      characterId: scopeSel.value ? parseInt(scopeSel.value) : "",
      updatedAt: Date.now(),
    });
    if (!record.name && !record.content) {
      UI.showToast("Add a name or content first", { type: "err" });
      return;
    }
    if (isNew) {
      record.bookId = bookId;
      record.createdAt = Date.now();
      await pfrpDB.add("lore", record);
    } else {
      await pfrpDB.put("lore", record);
    }
    overlay.remove();
    await loadData();
    UI.showToast(isNew ? "Lore entry added" : "Lore entry saved");
  });
  let delBtn = null;
  if (!isNew) {
    delBtn = UI.el("button", "btn danger", UI.fa("trash") + " Delete");
    delBtn.addEventListener("click", async () => {
      const ok = await UI.confirmModal({ title: "Delete lore entry?", message: `"${e.name || "Untitled"}" will be permanently deleted.`, confirmText: "Delete" });
      if (!ok) return;
      await pfrpDB.del("lore", e.id);
      overlay.remove();
      await loadData();
      UI.showToast("Lore entry deleted");
    });
  }
  if (delBtn) act.appendChild(delBtn);
  act.appendChild(save);
  act.appendChild(cancel);
  wrap.appendChild(act);
  const overlay = UI.openModal(wrap, { title: isNew ? "New lore entry" : "Edit lore entry", wide: true });
}

function matchingLore(c, t) {
  if (!loreEntries.length) return [];
  const recent = (activeMessages || []).slice(-12).map((m) => (m.content || "").toLowerCase()).join("\n");
  return loreEntries.filter((e) => {
    if (e.enabled === false) return false;
    if (e.characterId && (!c || e.characterId !== c.id)) return false;
    if (e.threadId && (!t || e.threadId !== t.id)) return false;
    const keys = (e.keys || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
    if (!keys.length) return true;
    return keys.some((k) => recent.includes(k));
  });
}

function renderScenesDrawer() {
  const wrap = UI.el("div", "");
  if (!scenes.length) {
    wrap.appendChild(UI.el("div", "empty", `<p>No scenes yet. A scene bundles a setting with its characters, so you can start chats from it with one click.</p>`));
  }
  const list = scenes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const s of list) {
    const ids = (s.characterIds || []).filter((id) => characters.some((c) => c.id === id));
    const item = UI.el("div", "d-item scene-item");
    item.dataset.scene = s.id;
    const icHtml = s.avatar && s.avatar.startsWith("data:")
      ? `<div class="av" style="background:linear-gradient(135deg,var(--accent1),var(--accent2))"><img src="${s.avatar}" alt=""></div>`
      : `<div class="lore-ic">${UI.fa("film")}</div>`;
    item.innerHTML = `${icHtml}
      <div class="d-body"><div class="d-name">${esc(s.name || "Unnamed scene")}</div><div class="d-sub">${esc(s.tagline || s.scenario || "")}${ids.length ? " · " + ids.length + (ids.length === 1 ? " character" : " characters") : ""}</div></div>
      <button class="d-menu" data-scenemenu="${s.id}" title="More">${UI.fa("ellipsis")}</button>`;
    item.querySelector("[data-scenemenu]").addEventListener("click", (e) => {
      e.stopPropagation();
      showMenu(item.querySelector("[data-scenemenu]"), [
        { icon: "pen", label: "Edit scene", onClick: () => openSceneEditor(s) },
        { icon: "trash", label: "Delete scene", danger: true, onClick: async () => {
          const ok = await UI.confirmModal({ title: "Delete scene?", message: `"${s.name || "Unnamed"}" will be permanently deleted. Chats using it keep their text.`, confirmText: "Delete" });
          if (!ok) return;
          await pfrpDB.del("scenes", s.id);
          await loadData();
          UI.showToast("Scene deleted");
        } },
      ]);
    });
    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-scenemenu]")) return;
      viewScene(s.id);
    });
    wrap.appendChild(item);
  }
  els.dList.innerHTML = "";
  els.dList.appendChild(wrap);
}

function viewScene(id) {
  const s = scenes.find((x) => x.id === id);
  if (!s) return;
  activeScene = s;
  activeThread = null;
  activeCharacter = null;
  activeMessages = [];
  contextChar = null;
  closeCtxPanelVisual();
  setDrawerOpen(true);
  pfrpSettings.data.ui.lastOpen = pfrpSettings.data.ui.lastOpen || {};
  pfrpSettings.data.ui.lastOpen.scenes = id;
  pfrpSettings.save();
  renderCenter();
  els.dList.querySelectorAll(".d-item[data-scene]").forEach((el) => {
    el.classList.toggle("active", parseInt(el.dataset.scene) === id);
  });
  renderContext();
}

function renderSceneView(s) {
  els.chatName.textContent = s.name || "Scene";
  els.chatSub.textContent = s.tagline || "Scene";
  els.chatAvatar.innerHTML = s.avatar && s.avatar.startsWith("data:") ? `<img src="${s.avatar}" alt="">` : (s.name ? s.name[0].toUpperCase() : "+");
  els.chatAvatar.style.background = "linear-gradient(135deg,var(--accent1),var(--accent2))";
  els.msgsInner.innerHTML = "";

  const view = UI.el("div", "char-view");
  view.appendChild(UI.el("div", "char-view-av", s.avatar && s.avatar.startsWith("data:") ? `<img src="${s.avatar}" alt="">` : (s.name ? s.name[0].toUpperCase() : "+")));
  view.appendChild(UI.el("h2", "char-view-name", esc(s.name || "Unnamed scene")));
  if (s.tagline) view.appendChild(UI.el("p", "char-view-tag", esc(s.tagline)));

  const actions = UI.el("div", "char-view-actions");
  const start = UI.el("button", "btn primary", UI.fa("comment") + " Start chat");
  start.addEventListener("click", () => startChatFromScene(s));
  const edit = UI.el("button", "btn", UI.fa("pen") + " Edit");
  edit.addEventListener("click", () => openSceneEditor(s));
  actions.append(start, edit);
  view.appendChild(actions);

  const body = UI.el("div", "char-view-body");
  if (s.scenario) {
    const card = UI.el("div", "char-view-sec");
    card.appendChild(UI.el("h3", "", `${UI.fa("map")} Scenario`));
    card.appendChild(UI.el("div", "char-view-sec-body", renderMarkdown(s.scenario)));
    body.appendChild(card);
  }
  if (s.intro) {
    const card = UI.el("div", "char-view-sec");
    card.appendChild(UI.el("h3", "", `${UI.fa("clapperboard")} Opening`));
    const t = activeThread || { characterIds: s.characterIds };
    const introBlocks = parseSceneBlocks(s.intro, t);
    card.appendChild(UI.el("div", "char-view-sec-body opening-body", sceneOpeningHtml(introBlocks.length ? introBlocks : [{ narrator: true, name: "Narrator", content: s.intro }])));
    body.appendChild(card);
  }
  const chars = (s.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter(Boolean);
  if (chars.length) {
    const card = UI.el("div", "char-view-sec");
    card.appendChild(UI.el("h3", "", `${UI.fa("masks-theater")} Characters`));
    const row = UI.el("div", "scene-chars");
    for (const c of chars) {
      const cell = UI.el("div", "scene-char");
      cell.appendChild(UI.el("div", "", avatarHtml(c, "")));
      cell.appendChild(UI.el("span", "", esc(c.name)));
      cell.addEventListener("click", () => viewCharacter(c.id));
      row.appendChild(cell);
    }
    card.appendChild(row);
    body.appendChild(card);
  }
  view.appendChild(body);
  els.msgsInner.appendChild(view);
  els.msgs.scrollTop = 0;
}

function openSceneEditor(scene) {
  const isNew = !scene;
  const s = scene || { name: "", tagline: "", scenario: "", characterIds: [], avatar: "" };
  const wrap = UI.el("div", "");
  const upLabel = UI.el("label", "avatar-upload");
  const avInput = UI.el("input", "input");
  avInput.type = "file";
  avInput.accept = "image/*";
  const avPrev = UI.el("div", "av", s.avatar ? "" : "F");
  if (s.avatar) avPrev.innerHTML = `<img src="${s.avatar}" alt="">`;
  avPrev.appendChild(UI.el("span", "avatar-edit", UI.fa("camera") + " <span>Change</span>"));
  upLabel.append(avInput, avPrev);
  let avatarData = s.avatar || "";
  avInput.addEventListener("change", () => {
    const file = avInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      avatarData = reader.result;
      avPrev.innerHTML = `<img src="${avatarData}" alt="">`;
      avPrev.appendChild(UI.el("span", "avatar-edit", UI.fa("camera") + " <span>Change</span>"));
    };
    reader.readAsDataURL(file);
  });
  wrap.appendChild(upLabel);
  const gName = UI.el("div", "form-group");
  gName.appendChild(UI.el("label", "field-label", "Name"));
  const nameIn = UI.el("input", "input");
  nameIn.value = s.name || "";
  gName.appendChild(nameIn);
  wrap.appendChild(gName);
  const gTag = UI.el("div", "form-group");
  gTag.appendChild(UI.el("label", "field-label", "Tagline"));
  const tagIn = UI.el("input", "input");
  tagIn.value = s.tagline || "";
  gTag.appendChild(tagIn);
  wrap.appendChild(gTag);
  const gScen = UI.el("div", "form-group");
  gScen.appendChild(UI.el("label", "field-label", "Scenario / setting"));
  const scenIn = UI.el("textarea", "textarea");
  scenIn.rows = 4;
  scenIn.value = s.scenario || "";
  gScen.appendChild(scenIn);
  wrap.appendChild(gScen);
  const gIntro = UI.el("div", "form-group");
  gIntro.appendChild(UI.el("label", "field-label", "Opening scene (optional)"));
  const introIn = UI.el("textarea", "textarea");
  introIn.rows = 6;
  introIn.value = s.intro || "";
  introIn.placeholder = "[Rena]\n*grins from the doorway* \"Well, well...\"\n\n[Narrator]\nThe hallway goes quiet.";
  gIntro.appendChild(introIn);
  gIntro.appendChild(UI.el("div", "hint", "Posted as the first message when a chat starts from this scene. Use [Name] blocks for each speaker and [Narrator] for narration."));
  wrap.appendChild(gIntro);
  const gChars = UI.el("div", "form-group");
  gChars.appendChild(UI.el("label", "field-label", "Characters"));
  const charBoxes = [];
  const charList = UI.el("div", "folder-pick");
  const selected = new Set(s.characterIds || []);
  for (const c of characters) {
    const lab = UI.el("label", "checkbox-row");
    const cb = UI.el("input", "");
    cb.type = "checkbox";
    cb.checked = selected.has(c.id);
    charBoxes.push({ cb, c });
    lab.append(cb, UI.el("span", "", esc(c.name)));
    charList.appendChild(lab);
  }
  gChars.appendChild(charList);
  if (!characters.length) gChars.appendChild(UI.el("div", "hint", "No characters yet. You can add them later by editing the scene."));
  wrap.appendChild(gChars);

  const act = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + (isNew ? " Create scene" : " Save"));
  save.addEventListener("click", async () => {
    const record = Object.assign({}, s, {
      name: nameIn.value.trim() || "Unnamed scene",
      tagline: tagIn.value.trim(),
      scenario: scenIn.value.trim(),
      intro: introIn.value.trim(),
      characterIds: charBoxes.filter((b) => b.cb.checked).map((b) => b.c.id),
      avatar: avatarData,
      updatedAt: Date.now(),
    });
    if (isNew) {
      record.createdAt = Date.now();
      await pfrpDB.add("scenes", record);
    } else {
      await pfrpDB.put("scenes", record);
    }
    overlay.remove();
    await loadData();
    UI.showToast(isNew ? "Scene created" : "Scene saved");
  });
  act.append(cancel, save);
  wrap.appendChild(act);
  const overlay = UI.openModal(wrap, { title: isNew ? "New scene" : "Edit scene", wide: true });
}

async function startChatFromScene(scene) {
  const ids = (scene.characterIds || []).filter((id) => characters.some((c) => c.id === id));
  if (!ids.length) {
    UI.showToast("This scene has no characters yet - edit it to add some", { type: "err" });
    return;
  }
  const personaId = pfrpSettings.data.activePersonaId;
  let id = null;
  if (ids.length === 1) {
    id = await createChatWithCharacter(ids[0], personaId);
  } else {
    id = await createGroupThread(ids, personaId);
  }
  const t = threads.find((x) => x.id === id);
  if (t) {
    t.sceneId = scene.id;
    if (scene.scenario) t.scenario = scene.scenario;
    if (scene.avatar) t.avatar = scene.avatar;
    await pfrpDB.put("threads", t);
  }
  if (t && scene.intro) {
    const merged = mergeConsecutiveBlocks(parseSceneBlocks(scene.intro, t));
    for (let i = 0; i < merged.length; i++) {
      const b = merged[i];
      const msg = {
        threadId: t.id,
        role: "assistant",
        name: b.narrator ? "Narrator" : b.name,
        characterId: b.characterId || null,
        narrator: !!b.narrator,
        content: b.content,
        creationTime: Date.now(),
        order: i,
      };
      const mid = await pfrpDB.add("messages", msg);
      msg.id = mid;
      activeMessages.push(msg);
    }
    if (merged.length) renderAllMessages();
  }
}

function sceneChooserModal(characterIds, personaId, isGroup) {
  const wrap = UI.el("div", "");
  wrap.appendChild(UI.el("p", "modal-desc", "Start this chat inside a scene (a saved world/setting), or just jump in?"));
  wrap.appendChild(choiceCard("ban", "No scene", "Start the chat immediately", () => {
    overlay.remove();
    if (isGroup) createGroupThread(characterIds, personaId);
    else startChatWithCharacter(characterIds[0], personaId);
  }));
  wrap.appendChild(choiceCard("film", "Pick a scene", "Use one of your saved scenes", () => {
    overlay.remove();
    pickSceneModal();
  }));
  wrap.appendChild(choiceCard("plus", "Quick scene", "Type a short setting right now (not saved)", () => {
    overlay.remove();
    quickSceneModal(characterIds, personaId, isGroup);
  }));
  const overlay = UI.openModal(wrap, { title: "Start with a scene?" });
}

function pickSceneModal() {
  const wrap = UI.el("div", "");
  if (!scenes.length) {
    wrap.appendChild(UI.el("div", "hint", "No saved scenes yet. Create one from the Scenes tab."));
  }
  for (const s of scenes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) {
    const ids = (s.characterIds || []).filter((id) => characters.some((c) => c.id === id));
    const row = UI.el("button", "frow", `${UI.fa("film")} ${esc(s.name || "Unnamed")}`);
    row.addEventListener("click", () => {
      overlay.remove();
      startChatFromScene(s);
    });
    wrap.appendChild(row);
    if (s.tagline || ids.length) wrap.appendChild(UI.el("div", "hint", esc((s.tagline ? s.tagline + " · " : "") + (ids.length ? ids.length + (ids.length === 1 ? " character" : " characters") : ""))));
  }
  const overlay = UI.openModal(wrap, { title: "Pick a scene" });
}

function quickSceneModal(characterIds, personaId, isGroup) {
  const wrap = UI.el("div", "");
  const gName = UI.el("div", "form-group");
  gName.appendChild(UI.el("label", "field-label", "Scene name (optional)"));
  const nameIn = UI.el("input", "input");
  gName.appendChild(nameIn);
  wrap.appendChild(gName);
  const gScen = UI.el("div", "form-group");
  gScen.appendChild(UI.el("label", "field-label", "Setting"));
  const scenIn = UI.el("textarea", "textarea");
  scenIn.rows = 3;
  scenIn.placeholder = "e.g. A rainy night in a neon city, the power flickering...";
  gScen.appendChild(scenIn);
  wrap.appendChild(gScen);
  const act = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const start = UI.el("button", "btn primary", UI.fa("play") + " Start");
  start.addEventListener("click", async () => {
    const scenario = scenIn.value.trim();
    overlay.remove();
    let id = null;
    if (isGroup) {
      id = await createGroupThread(characterIds, personaId);
    } else {
      id = await startChatWithCharacter(characterIds[0], personaId);
    }
    const t = threads.find((x) => x.id === id);
    if (t && scenario) {
      t.scenario = scenario;
      await pfrpDB.put("threads", t);
      if (activeThread && activeThread.id === id) renderThreadUI();
    }
  });
  act.append(cancel, start);
  wrap.appendChild(act);
  const overlay = UI.openModal(wrap, { title: "Quick scene" });
}

const summarizingThreads = new Set();
const SUMMARY_THRESHOLD = 25;
const SUMMARY_KEEP = 15;

function summarySlice(t) {
  const sinceOrder = t.summarizedUpToOrder == null ? -1 : t.summarizedUpToOrder;
  const eligible = activeMessages.filter((m) => (m.role === "user" || m.role === "assistant") && m.order > sinceOrder);
  if (!eligible.length) return [];
  const keepFrom = eligible[eligible.length - Math.min(SUMMARY_KEEP, eligible.length)].order;
  return eligible.filter((m) => m.order < keepFrom);
}

async function runSummary(t, toSummarize) {
  const transcript = toSummarize
    .flatMap((m) => {
      if (m.blocks && m.blocks.length) {
        return m.blocks.map((b) => (b.narrator ? "Narrator: " + b.content : b.name + ": " + b.content));
      }
      return [m.role === "user" ? "User: " + (m.image ? "[Image: " + (m.content || "attached image") + "]" : m.content) : (m.name || "Character") + ": " + (m.image ? "[Image: " + (m.content || "attached image") + "]" : m.content)];
    })
    .join("\n\n");
  const sys = "You are a story summarizer for a roleplay chat. Merge the previous summary (if provided) with the new conversation below into ONE continuous third-person story summary. Preserve everything the next scene depends on: who is present and their relationships, the current location and time, each character's current state (mood, condition, outfit, position), ongoing goals, injuries, items, promises, secrets, and unresolved plot threads. Write tight, factual narration (no dialogue, no commentary), around 400-600 words. Prioritize continuity-critical facts over flavor; when in doubt, keep the fact and cut the description.";
  summarizingThreads.add(t.id);
  UI.showToast("Summarizing older messages in the background...", { duration: 3500 });
  try {
    const tracker = trackerPromptText(t);
    const text = await Provider.complete([{ role: "user", content: "Previous summary:\n" + (t.summary || "(none)") + "\n\nCurrent tracked state:\n" + (tracker || "(none)") + "\n\nNew conversation:\n" + transcript }], { system: sys, temperature: 0.4 });
    const summary = (text || "").trim();
    if (!summary) return;
    t.summary = summary;
    t.summarizedUpToOrder = toSummarize[toSummarize.length - 1].order;
    await pfrpDB.put("threads", t);
    UI.showToast("Chat summary updated");
  } catch (e) {
    UI.showToast("Summary failed: " + e.message, { type: "err" });
  } finally {
    summarizingThreads.delete(t.id);
  }
}

async function maybeSummarize(t) {
  const mem = pfrpSettings.data.memory || {};
  if (mem.autoSummarize === false) return;
  if (!isProviderConfigured()) return;
  if (!t || summarizingThreads.has(t.id)) return;
  const sinceOrder = t.summarizedUpToOrder == null ? -1 : t.summarizedUpToOrder;
  const eligible = activeMessages.filter((m) => (m.role === "user" || m.role === "assistant") && m.order > sinceOrder);
  if (eligible.length < SUMMARY_THRESHOLD) return;
  const toSummarize = summarySlice(t);
  if (!toSummarize.length) return;
  await runSummary(t, toSummarize);
}

async function summarizeNow(t) {
  if (!ensureProviderConfigured("summarizing the chat")) return;
  if (!t || summarizingThreads.has(t.id)) return;
  t.summarizedUpToOrder = 0;
  const toSummarize = summarySlice(t);
  if (!toSummarize.length) {
    UI.showToast("Not enough messages to summarize yet", { type: "err" });
    return;
  }
  await runSummary(t, toSummarize);
  renderContext();
}

function buildPersonasSettings() {
  const wrap = UI.el("div", "account-panel");
  const personas = pfrpSettings.data.personas || [];
  const activeId = pfrpSettings.data.activePersonaId;

  wrap.appendChild(UI.el("div", "hint", "Personas tell the characters who you are. Pick one when starting a chat, or convert a character into a persona from its menu."));

  for (const p of personas) {
    const item = UI.el("div", "d-item persona-item" + (p.id === activeId ? " active" : ""));
    const av = UI.el("div", "");
    av.innerHTML = avatarHtml(p);
    item.appendChild(av);
    const star = UI.el("button", "d-menu" + (p.id === activeId ? " star" : ""), UI.fa(p.id === activeId ? "star" : "circle"));
    star.title = p.id === activeId ? "Active persona" : "Set as active persona";
    star.style.opacity = "1";
    star.addEventListener("click", async (e) => {
      e.stopPropagation();
      pfrpSettings.data.activePersonaId = p.id;
      pfrpSettings.save();
      if (settingsShowTab) settingsShowTab("personas");
      UI.showToast("Active persona: " + p.name);
    });
    const body = UI.el("div", "d-body");
    body.appendChild(UI.el("div", "d-name", esc(p.name || "Unnamed")));
    body.appendChild(UI.el("div", "d-sub", esc(p.description ? p.description.slice(0, 60) + (p.description.length > 60 ? "…" : "") : "No description")));
    item.appendChild(body);
    item.appendChild(star);

    const menuBtn = UI.el("button", "d-menu", UI.fa("ellipsis"));
    menuBtn.style.opacity = "1";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showMenu(menuBtn, [
        { icon: "pen", label: "Edit persona", onClick: () => editPersonaModal(p) },
        { icon: "trash", label: "Delete persona", danger: true, onClick: async () => {
          if (pfrpSettings.data.personas.length <= 1) {
            UI.showToast("You need at least one persona", { type: "err" });
            return;
          }
          const ok = await UI.confirmModal({ title: "Delete persona?", message: "Chats using this persona will fall back to your active persona.", confirmText: "Delete" });
          if (!ok) return;
          pfrpSettings.data.personas = pfrpSettings.data.personas.filter((x) => x.id !== p.id);
          if (pfrpSettings.data.activePersonaId === p.id) pfrpSettings.data.activePersonaId = pfrpSettings.data.personas[0].id;
          pfrpSettings.save();
          if (settingsShowTab) settingsShowTab("personas");
          UI.showToast("Persona deleted");
        } },
      ]);
    });
    item.appendChild(menuBtn);
    wrap.appendChild(item);
  }

  const addBtn = UI.el("button", "addbtn", UI.fa("plus") + " New persona");
  addBtn.addEventListener("click", () => editPersonaModal(null));
  wrap.appendChild(addBtn);
  return wrap;
}

function editPersonaModal(p) {
  const isNew = !p;
  const rw = UI.el("div", "");

  const head = UI.el("div", "dossier-head");
  const avatarG = UI.el("div", "form-group");
  avatarG.appendChild(UI.el("label", "field-label", "Profile image"));
  const upLabel = UI.el("label", "avatar-upload");
  const avatarInput = UI.el("input", "input");
  avatarInput.type = "file";
  avatarInput.accept = "image/*";
  const avatarPreview = UI.el("div", "av", p && p.avatar ? "" : "A");
  if (p && p.avatar) avatarPreview.innerHTML = `<img src="${p.avatar}" alt="">`;
  avatarPreview.appendChild(UI.el("span", "avatar-edit", UI.fa("camera") + " <span>Change</span>"));
  upLabel.append(avatarInput, avatarPreview);
  avatarG.appendChild(upLabel);
  let avatarData = (p && p.avatar) || "";
  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      avatarData = reader.result;
      avatarPreview.innerHTML = `<img src="${avatarData}" alt="">`;
      avatarPreview.appendChild(UI.el("span", "avatar-edit", UI.fa("camera") + " <span>Change</span>"));
    };
    reader.readAsDataURL(file);
  });
  head.appendChild(avatarG);

  const idCol = UI.el("div", "dossier-id");
  const nameG = UI.el("div", "form-group");
  nameG.appendChild(UI.el("label", "field-label", "Name"));
  const name = UI.el("input", "input");
  name.type = "text";
  name.value = p ? p.name : "";
  name.placeholder = "Who are you in these stories?";
  nameG.appendChild(name);
  idCol.appendChild(nameG);
  head.appendChild(idCol);
  rw.appendChild(head);

  const descG = UI.el("div", "form-group");
  const descLabelRow = UI.el("div", "sys-label-row");
  descLabelRow.appendChild(UI.el("label", "field-label", "Description"));
  const genBtn = UI.el("button", "btn ghost small", UI.fa("wand-magic-sparkles") + " Generate with AI");
  genBtn.addEventListener("click", async () => {
    if (!ensureProviderConfigured("generating a persona with AI")) return;
    genBtn.disabled = true;
    const n = name.value.trim() || "you";
    const guide = desc.value.trim();
    try {
      const sys = "You are helping a user describe themselves for roleplay. Return ONLY a short first-person persona description (3-6 sentences) covering personality, style, and how they like stories to go. No markdown, no extra text.";
      const text = await Provider.complete([{ role: "user", content: "My name is " + n + (guide ? ". Guide me using this: " + guide : ".") }], { system: sys, temperature: 0.8 });
      desc.value = text.trim();
    } catch (e) {
      UI.showToast("Generation failed: " + e.message, { type: "err" });
    } finally {
      genBtn.disabled = false;
    }
  });
  descLabelRow.appendChild(genBtn);
  descG.appendChild(descLabelRow);
  const desc = UI.el("textarea", "textarea");
  desc.value = p ? p.description : "";
  desc.placeholder = "Personality, style, background  -  anything the characters should know about you.";
  descG.appendChild(desc);
  descG.appendChild(UI.el("div", "hint", "AI generation uses what you've written here as a guide. Leave it empty and the AI will come up with a persona on its own."));
  rw.appendChild(descG);

  const row = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + (isNew ? " Create" : " Save"));
  save.addEventListener("click", () => {
    const record = p || { id: "persona-" + Date.now().toString(36) };
    record.name = name.value.trim() || "Unnamed";
    record.description = desc.value.trim();
    record.avatar = avatarData;
    if (isNew) pfrpSettings.data.personas.push(record);
    if (isNew) pfrpSettings.data.activePersonaId = record.id;
    pfrpSettings.save();
    overlay.remove();
    if (settingsShowTab) settingsShowTab("personas");
    UI.showToast(isNew ? "Persona created" : "Persona saved");
  });
  row.append(cancel, save);
  rw.appendChild(row);
  const overlay = UI.openModal(rw, { title: isNew ? "New persona" : "Edit persona", wide: true });
}

function openSettingsModal() {
  const wrap = UI.el("div", "settings-tabs");
  const tabbar = UI.el("div", "settings-nav");
  const body = UI.el("div", "settings-tab-body");
  const footer = UI.el("div", "settings-footer");

  const cats = [
    { id: "conn", label: "Connection", icon: "plug", build: buildConnectionSettings },
    { id: "gen", label: "Generation", icon: "sliders", build: buildGenerationSettings },
    { id: "nsfw", label: "Content", icon: "shield-halved", build: buildNsfwSettings },
    { id: "personas", label: "Personas", icon: "circle-user", build: buildPersonasSettings },
    { id: "img", label: "Images", icon: "images", build: buildImageSettings },
    { id: "fmt", label: "Formatting", icon: "font", build: buildFormattingSettings },
    { id: "app", label: "Appearance", icon: "palette", build: buildThemeSettings },
    { id: "data", label: "Data", icon: "database", build: buildDataSettings },
  ];

  function show(id) {
    const cat = cats.find((c) => c.id === id);
    body.innerHTML = "";
    body.appendChild(cat.build());
    footer.innerHTML = "";
    body.querySelectorAll(".modal-actions").forEach((row) => footer.appendChild(row));
    footer.style.display = footer.children.length ? "" : "none";
    tabbar.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.id === id));
  }
  settingsShowTab = show;

  for (const c of cats) {
    const b = UI.el("button", "", `${UI.fa(c.icon)} ${c.label}`);
    b.dataset.id = c.id;
    b.addEventListener("click", () => show(c.id));
    tabbar.appendChild(b);
  }
  wrap.append(tabbar, body);
  const overlay = UI.openModal(wrap, { title: "Settings", wide: true });
  overlay.classList.add("settings-overlay");
  overlay.querySelector(".modal").classList.add("settings-modal");
  overlay.querySelector(".modal-body").appendChild(footer);
  show("conn");
}

/* ---------------- SETTINGS BUILDERS ---------------- */
function buildConnectionSettings() {
  const wrap = UI.el("div", "");
  const s = pfrpSettings.data;

  const selectWrap = UI.el("div", "form-group");
  selectWrap.appendChild(UI.el("label", "field-label", "Connection"));
  const connRow = UI.el("div", "key-row");
  const connSel = UI.el("select", "select");
  const addBtn = UI.el("button", "", UI.fa("plus") + " Add");
  const delBtn = UI.el("button", "", UI.fa("trash"));
  delBtn.title = "Delete this connection";
  connRow.append(connSel, addBtn, delBtn);
  selectWrap.appendChild(connRow);
  selectWrap.appendChild(UI.el("div", "hint", "Save multiple connections (OpenRouter, OpenAI, local Ollama…) and switch between them. The selected one is the active connection used for chats."));
  wrap.appendChild(selectWrap);

  const nameWrap = UI.el("div", "form-group");
  nameWrap.appendChild(UI.el("label", "field-label", "Name"));
  const name = UI.el("input", "input");
  name.type = "text";
  name.placeholder = "e.g. Home OpenRouter, Mac Ollama";
  nameWrap.appendChild(name);
  wrap.appendChild(nameWrap);

  const provWrap = UI.el("div", "form-group");
  provWrap.appendChild(UI.el("label", "field-label", "Provider"));
  const provSel = UI.el("select", "select");
  for (const [k, p] of Object.entries(PROVIDERS)) {
    const o = UI.el("option", "", p.label);
    o.value = k;
    provSel.appendChild(o);
  }
  provWrap.appendChild(provSel);
  wrap.appendChild(provWrap);

  const URL_HINTS = {
    openrouter: "Uses https://openrouter.ai/api/v1",
    openai: "Uses https://api.openai.com/v1",
    nanogpt: "Uses https://nano-gpt.com/api/v1 (OpenAI-compatible)",
    ollama: "Local Ollama  -  http://127.0.0.1:11434/v1 on the machine running it, or your machine's LAN IP when browsing from another device.",
  };

  const ollamaHelp = UI.el("button", "btn ghost small", UI.fa("circle-question") + " Need help?");
  ollamaHelp.title = "Open Ollama's docs about allowing web origins (OLLAMA_ORIGINS)";
  ollamaHelp.style.display = "none";
  ollamaHelp.addEventListener("click", () => {
    window.open("https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-allow-additional-web-origins-to-access-ollama", "_blank");
  });
  wrap.appendChild(ollamaHelp);

  const urlWrap = UI.el("div", "form-group");
  urlWrap.appendChild(UI.el("label", "field-label", "Base URL"));
  const url = UI.el("input", "input");
  url.type = "text";
  url.placeholder = "https://openrouter.ai/api/v1";
  const urlHint = UI.el("div", "hint", "");
  urlWrap.appendChild(url);
  urlWrap.appendChild(urlHint);
  wrap.appendChild(urlWrap);

  const keyWrap = UI.el("div", "form-group");
  keyWrap.appendChild(UI.el("label", "field-label", "API Key"));
  const keyRow = UI.el("div", "key-row");
  const key = UI.el("input", "input");
  key.type = "password";
  key.placeholder = "sk-...";
  const eye = UI.el("button", "", UI.fa("eye"));
  eye.addEventListener("click", () => (key.type = key.type === "password" ? "text" : "password"));
  keyRow.append(key, eye);
  keyWrap.appendChild(keyRow);
  wrap.appendChild(keyWrap);

  const modelWrap = UI.el("div", "form-group");
  modelWrap.appendChild(UI.el("label", "field-label", "Model"));
  const modelChips = UI.el("div", "");
  modelWrap.appendChild(modelChips);
  const modelRow = UI.el("div", "key-row");
  const modelSel = UI.el("select", "select");
  const customModel = UI.el("input", "input");
  customModel.type = "text";
  customModel.placeholder = "Enter custom model ID…";
  customModel.style.display = "none";
  const fetchBtn = UI.el("button", "", UI.fa("cloud-arrow-down") + " Fetch");
  const starModel = UI.el("button", "iconbtn", UI.fa("star"));
  starModel.title = "Toggle favorite for the selected model";
  const currentConnModel = () => (modelSel.value === "__custom__" ? customModel.value.trim() : modelSel.value);
  starModel.addEventListener("click", () => {
    toggleFavoriteModel(currentConnModel());
    loadConn();
  });
  const renderModelChips = () => {
    modelChips.innerHTML = "";
    const chips = modelChipsRow(currentConnModel(), (m) => {
      if (new Set(modelCache).has(m)) {
        modelSel.value = m;
        customModel.style.display = "none";
        customModel.value = "";
      } else {
        modelSel.value = "__custom__";
        customModel.style.display = "";
        customModel.value = m;
      }
      renderModelChips();
      starModel.classList.toggle("fav", isFavoriteModel(m));
    });
    modelChips.appendChild(chips);
  };
  modelRow.append(modelSel, starModel, fetchBtn);
  modelWrap.appendChild(modelRow);
  modelWrap.appendChild(customModel);
  wrap.appendChild(modelWrap);

  const proxyWrap = UI.el("div", "form-group");
  proxyWrap.appendChild(UI.el("label", "field-label", "URL fetch proxy (optional)"));
  const proxyIn = UI.el("input", "input");
  proxyIn.type = "text";
  proxyIn.placeholder = "e.g. http://localhost:8787/?url=";
  proxyIn.value = s.urlProxy || "";
  proxyIn.addEventListener("input", () => {
    s.urlProxy = proxyIn.value.trim();
    pfrpSettings.save();
  });
  proxyWrap.appendChild(proxyIn);
  proxyWrap.appendChild(UI.el("div", "hint", "Used by Create character from URL. Some sites block the built-in public proxies - run your own tiny proxy (see resources/cors-proxy.js) and paste its address here, with the URL appended after it. Without a proxy, you can still paste page content manually in the URL dialog."));
  wrap.appendChild(proxyWrap);

  function fillModelOptions(currentModel) {
    const opts = new Set(modelCache);
    if (currentModel) opts.add(currentModel);
    modelSel.innerHTML = "";
    const list = [...opts].sort();
    for (const id of list) {
      const o = UI.el("option", "", id);
      o.value = id;
      modelSel.appendChild(o);
    }
    const other = UI.el("option", "", "Other…");
    other.value = "__custom__";
    modelSel.appendChild(other);
    if (currentModel && opts.has(currentModel)) {
      modelSel.value = currentModel;
      customModel.style.display = "none";
      customModel.value = "";
    } else if (currentModel) {
      modelSel.value = "__custom__";
      customModel.style.display = "";
      customModel.value = currentModel;
    } else {
      modelSel.value = "";
      customModel.style.display = "none";
      customModel.value = "";
    }
    renderModelChips();
    starModel.classList.toggle("fav", isFavoriteModel(currentConnModel()));
  }

  modelSel.addEventListener("change", () => {
    if (modelSel.value === "__custom__") {
      customModel.style.display = "";
      customModel.focus();
    } else {
      customModel.style.display = "none";
      customModel.value = "";
    }
  });

  const status = UI.el("div", "status-line");
  const row = UI.el("div", "modal-actions");
  const test = UI.el("button", "btn", UI.fa("plug") + " Test connection");
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + " Save");

  function currentConn() {
    const c = s.connections.find((x) => x.id === connSel.value) || s.connections[0];
    return c;
  }

  function refreshConnSelect() {
    connSel.innerHTML = "";
    for (const c of s.connections) {
      const o = UI.el("option", "", c.name || "Connection");
      o.value = c.id;
      connSel.appendChild(o);
    }
    connSel.value = s.activeConnection;
  }

  function loadConn() {
    const c = currentConn();
    const preset = PROVIDERS[c.provider] || PROVIDERS.openrouter;
    name.value = c.name || "";
    provSel.value = c.provider in PROVIDERS ? c.provider : "openrouter";
    url.value = c.baseUrl || "";
    url.placeholder = preset.baseUrl;
    urlHint.textContent = URL_HINTS[c.provider] || "";
    const needsKey = preset.needsKey;
    keyWrap.style.display = needsKey ? "" : "none";
    key.value = c.apiKey || "";
    key.placeholder = needsKey ? "sk-..." : "";
    ollamaHelp.style.display = c.provider === "ollama" ? "" : "none";
    fillModelOptions(c.model || "");
  }

  function applyToConn() {
    const c = currentConn();
    c.name = name.value.trim() || c.name || "Connection";
    c.provider = provSel.value;
    c.baseUrl = url.value.trim();
    c.apiKey = key.value.trim();
    c.model = modelSel.value === "__custom__" ? customModel.value.trim() : modelSel.value;
    return c;
  }

  function updateProviderUI() {
    const preset = PROVIDERS[provSel.value] || PROVIDERS.openrouter;
    url.placeholder = preset.baseUrl;
    urlHint.textContent = URL_HINTS[provSel.value] || "";
    keyWrap.style.display = preset.needsKey ? "" : "none";
    ollamaHelp.style.display = provSel.value === "ollama" ? "" : "none";
  }

  provSel.addEventListener("change", updateProviderUI);

  connSel.addEventListener("change", () => {
    s.activeConnection = connSel.value;
    pfrpSettings.save();
    invalidateModelCache();
    loadConn();
  });

  addBtn.addEventListener("click", () => {
    const c = { id: "conn-" + Date.now().toString(36), name: "New connection", provider: "openrouter", baseUrl: "", apiKey: "", model: "" };
    s.connections.push(c);
    s.activeConnection = c.id;
    pfrpSettings.save();
    invalidateModelCache();
    refreshConnSelect();
    loadConn();
  });

  delBtn.addEventListener("click", async () => {
    if (s.connections.length <= 1) {
      UI.showToast("You need at least one connection", { type: "err" });
      return;
    }
    const ok = await UI.confirmModal({ title: "Delete connection?", message: "This removes the connection from your saved list.", confirmText: "Delete" });
    if (!ok) return;
    const id = connSel.value;
    s.connections = s.connections.filter((c) => c.id !== id);
    s.activeConnection = s.connections[0].id;
    pfrpSettings.save();
    invalidateModelCache();
    refreshConnSelect();
    loadConn();
  });

  fetchBtn.addEventListener("click", async () => {
    applyToConn();
    fetchBtn.disabled = true;
    status.textContent = "Fetching models…";
    status.style.color = "";
    try {
      const data = await Provider.listModels();
      const list = (data.data || []).map((m) => m.id).filter(Boolean).sort();
      if (!list.length) {
        status.textContent = "No models returned.";
        return;
      }
      modelCache = list;
      modelCacheFor = pfrpSettings.activeConnection().id;
      fillModelOptions(applyToConn().model || "");
      status.textContent = list.length + " models loaded.";
      status.style.color = "var(--ok)";
    } catch (e) {
      status.textContent = "Model fetch failed: " + e.message;
      status.style.color = "var(--danger)";
    } finally {
      fetchBtn.disabled = false;
    }
  });

  test.addEventListener("click", async () => {
    const c = applyToConn();
    s.activeConnection = c.id;
    connSel.value = c.id;
    test.disabled = true;
    status.textContent = "Testing…";
    status.style.color = "";
    try {
      const data = await Provider.ping();
      const reply = data.choices?.[0]?.message?.content || "(empty)";
      status.textContent = "Connected. Model replied: " + JSON.stringify(reply.trim());
      status.style.color = "var(--ok)";
    } catch (e) {
      status.textContent = "Connection failed: " + e.message;
      status.style.color = "var(--danger)";
    } finally {
      test.disabled = false;
    }
  });

  save.addEventListener("click", () => {
    const prevProvider = currentConn().provider;
    applyToConn();
    pfrpSettings.save();
    if (currentConn().provider !== prevProvider) invalidateModelCache();
    refreshConnSelect();
    UI.showToast("Settings saved");
  });

  row.append(save, test);
  wrap.appendChild(row);
  wrap.appendChild(status);
  refreshConnSelect();
  loadConn();
  if (!modelCache.length && connSel.value === s.activeConnection) {
    loadModelCache().then(() => {
      const c = currentConn();
      if (c) fillModelOptions(c.model || "");
    });
  }
  return wrap;
}

const TEMPERATURE_HELP = "Temperature controls how creative or focused responses are:<br><br>0.0-0.4  -  focused, predictable, follows instructions closely<br>0.5-0.9  -  balanced, natural roleplay voice<br>1.0+  -  very creative and unpredictable<br><br>Applied to new chats; each chat can override it in Chat Settings.";

function temperatureControl(get, set, { help = TEMPERATURE_HELP, liveSave = false } = {}) {
  const row = UI.el("div", "key-row");
  const temp = UI.el("input", "input");
  temp.type = "range";
  temp.min = 0; temp.max = 2; temp.step = 0.1;
  temp.value = get() != null ? get() : 1;
  const tempVal = UI.el("span", "hint", Number(temp.value).toFixed(1));
  temp.addEventListener("input", () => (tempVal.textContent = Number(temp.value).toFixed(1)));
  temp.addEventListener("change", () => set(parseFloat(temp.value)));
  const helpBtn = UI.el("button", "iconbtn small", UI.fa("circle-question"));
  helpBtn.title = "What is temperature?";
  UI.tooltip(helpBtn, help);
  row.append(temp, tempVal, helpBtn);
  void liveSave;
  return row;
}

function buildGenerationSettings() {
  const wrap = UI.el("div", "");
  const s = pfrpSettings.data;
  wrap.appendChild(UI.el("label", "field-label", "Default temperature for new chats"));
  wrap.appendChild(temperatureControl(
    () => s.temperature,
    (v) => { s.temperature = v; pfrpSettings.save(); }
  ));
  wrap.appendChild(UI.el("div", "hint", "New chats start with this temperature. You can adjust it per chat in Chat Settings."));
  wrap.appendChild(UI.el("div", "spacer-h", ""));
  wrap.appendChild(UI.el("label", "field-label", "Response length"));
  const lenRow = UI.el("div", "key-row");
  const len = UI.el("select", "select");
  const opts = [
    ["", "Model default"],
    ["short", "Short (1-2 paragraphs)"],
    ["medium", "Medium (3-5 paragraphs)"],
    ["long", "Long (detailed)"],
  ];
  for (const [v, l] of opts) {
    const o = UI.el("option", "", l);
    o.value = v;
    len.appendChild(o);
  }
  len.value = s.responseLength || "";
  len.addEventListener("change", () => {
    s.responseLength = len.value;
    pfrpSettings.save();
  });
  const lenHelp = UI.el("button", "iconbtn small", UI.fa("circle-question"));
  UI.tooltip(lenHelp, "Preferred length for AI responses. Added to the system prompt for new chats.");
  lenRow.append(len, lenHelp);
  wrap.appendChild(lenRow);
  wrap.appendChild(UI.el("div", "hint", "Short keeps scenes snappy; long gives rich, detailed prose."));
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  const mem = pfrpSettings.data.memory || (pfrpSettings.data.memory = {});
  const sumRow = UI.el("div", "rowline");
  sumRow.appendChild(UI.el("span", "", "Auto-summarize long chats"));
  const sumSw = UI.el("div", "switch" + (mem.autoSummarize !== false ? " on" : ""));
  sumSw.addEventListener("click", () => {
    mem.autoSummarize = mem.autoSummarize === false;
    sumSw.classList.toggle("on", mem.autoSummarize);
    pfrpSettings.save();
  });
  sumRow.appendChild(sumSw);
  wrap.appendChild(sumRow);
  wrap.appendChild(UI.el("div", "hint", "When a chat grows long, older messages are summarized in the background so the AI remembers the story. The rolling summary is fed back into prompts while the summarized messages are dropped from the context."));
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  wrap.appendChild(UI.el("label", "field-label", "Style preset"));
  const presetWrap = UI.el("div", "form-group");
  const presetSel = UI.el("select", "select");
  const presetDesc = UI.el("div", "hint");
  const allPresets = () => [...BUILTIN_PROMPT_PRESETS, ...(pfrpSettings.data.promptPresets || [])];
  const fillPresets = () => {
    presetSel.innerHTML = "";
    for (const p of allPresets()) {
      const o = UI.el("option", "", p.name + (p.id === pfrpSettings.data.activePresetId ? " (active)" : ""));
      o.value = p.id;
      presetSel.appendChild(o);
    }
    presetSel.value = pfrpSettings.data.activePresetId || "pfrp";
    updateDesc();
  };
  const updateDesc = () => {
    const p = allPresets().find((x) => x.id === presetSel.value);
    presetDesc.textContent = p && p.desc ? p.desc : "Custom preset.";
  };
  presetSel.addEventListener("change", updateDesc);
  fillPresets();
  presetWrap.appendChild(presetSel);
  presetWrap.appendChild(presetDesc);
  wrap.appendChild(presetWrap);
  const presetRow = UI.el("div", "key-row");
  const applyBtn = UI.el("button", "", UI.fa("check") + " Apply");
  applyBtn.addEventListener("click", () => {
    const p = allPresets().find((x) => x.id === presetSel.value);
    if (!p) return;
    s.system = p.system;
    pfrpSettings.data.activePresetId = p.id;
    pfrpSettings.save();
    sys.value = s.system;
    fillPresets();
    UI.showToast("Style preset applied: " + p.name);
  });
  const saveBtn = UI.el("button", "", UI.fa("floppy-disk") + " Save current");
  saveBtn.addEventListener("click", () => {
    const rw = UI.el("div", "");
    const inp = UI.el("input", "input");
    inp.placeholder = "Preset name";
    inp.value = "";
    rw.appendChild(inp);
    const act = UI.el("div", "modal-actions");
    const cancel = UI.el("button", "btn ghost", "Cancel");
    const ok = UI.el("button", "btn primary", "Save preset");
    cancel.addEventListener("click", () => ov.remove());
    ok.addEventListener("click", () => {
      const name = inp.value.trim();
      if (!name) return;
      const presets = pfrpSettings.data.promptPresets || [];
      presets.push({ id: "preset-" + Date.now().toString(36), name, system: s.system });
      pfrpSettings.data.promptPresets = presets;
      pfrpSettings.data.activePresetId = presets[presets.length - 1].id;
      pfrpSettings.save();
      ov.remove();
      fillPresets();
      UI.showToast("Preset saved");
    });
    act.append(ok, cancel);
    rw.appendChild(act);
    const ov = UI.openModal(rw, { title: "Save current style as preset" });
  });
  const delBtn = UI.el("button", "", UI.fa("trash"));
  delBtn.title = "Delete the selected custom preset";
  delBtn.addEventListener("click", async () => {
    const p = allPresets().find((x) => x.id === presetSel.value);
    if (!p || BUILTIN_PROMPT_PRESETS.some((b) => b.id === p.id)) {
      UI.showToast("Built-in presets cannot be deleted", { type: "err" });
      return;
    }
    const ok = await UI.confirmModal({ title: "Delete preset?", message: `"${p.name}" will be permanently removed.`, confirmText: "Delete" });
    if (!ok) return;
    pfrpSettings.data.promptPresets = (pfrpSettings.data.promptPresets || []).filter((x) => x.id !== p.id);
    if (pfrpSettings.data.activePresetId === p.id) pfrpSettings.data.activePresetId = "pfrp";
    pfrpSettings.save();
    fillPresets();
    UI.showToast("Preset deleted");
  });
  presetRow.append(applyBtn, saveBtn, delBtn);
  wrap.appendChild(presetRow);
  wrap.appendChild(UI.el("div", "hint", "Presets swap the default system prompt below. Save your current prompt as a custom preset any time."));
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  const sysWrap = UI.el("div", "form-group");
  const sysLabelRow = UI.el("div", "sys-label-row");
  sysLabelRow.appendChild(UI.el("label", "field-label", "Default system prompt"));
  const restore = UI.el("button", "btn ghost small", UI.fa("rotate-left") + " Restore default prompt");
  restore.title = "Restore the built-in default roleplay prompt";
  restore.addEventListener("click", () => {
    sys.value = DEFAULT_SYSTEM_PROMPT;
    s.system = DEFAULT_SYSTEM_PROMPT;
    pfrpSettings.data.activePresetId = "pfrp";
    pfrpSettings.save();
    fillPresets();
    UI.showToast("Default prompt restored");
  });
  sysLabelRow.appendChild(restore);
  sysWrap.appendChild(sysLabelRow);
  const sys = UI.el("textarea", "textarea");
  sys.value = s.system;
  sys.placeholder = "Optional default system prompt for new chats...";
  sys.addEventListener("input", () => {
    s.system = sys.value;
    pfrpSettings.save();
  });
  sysWrap.appendChild(sys);
  wrap.appendChild(sysWrap);
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  const smdRow = UI.el("div", "rowline");
  smdRow.appendChild(UI.el("span", "", "Scene mode for new chats"));
  const smdSw = UI.el("div", "switch" + (s.sceneModeDefault ? " on" : ""));
  smdSw.addEventListener("click", () => {
    s.sceneModeDefault = !s.sceneModeDefault;
    smdSw.classList.toggle("on", s.sceneModeDefault);
    pfrpSettings.save();
  });
  smdRow.appendChild(smdSw);
  wrap.appendChild(smdRow);
  wrap.appendChild(UI.el("div", "hint", "New chats start in Scene mode (one response writes the whole scene with speaker blocks and narrator beats). Can be toggled per chat in Chat Settings."));
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  wrap.appendChild(UI.el("label", "field-label", "Story defaults"));
  wrap.appendChild(storyControls(
    (k) => (pfrpSettings.data.story || {})[k],
    (k, v) => {
      pfrpSettings.data.story = pfrpSettings.data.story || {};
      pfrpSettings.data.story[k] = v;
      pfrpSettings.save();
    }
  ));
  wrap.appendChild(UI.el("div", "hint", "Story defaults for new chats. Each chat can override these in Chat Settings."));
  return wrap;
}

function buildNsfwSettings() {
  const wrap = UI.el("div", "");
  const s = pfrpSettings.data.nsfw;

  wrap.appendChild(UI.el("label", "field-label", "Default explicitness for new chats"));
  wrap.appendChild(segControl(EXPLICITNESS, s.chatDefault, (v) => (s.chatDefault = v)));
  wrap.appendChild(UI.el("div", "hint", "Controls how explicit new roleplay can get. Overridable per chat."));
  wrap.appendChild(UI.el("div", "spacer-h", ""));
  wrap.appendChild(UI.el("label", "field-label", "Image safety level"));
  wrap.appendChild(segControl(IMAGE_SAFETY, s.imageSafety, (v) => (s.imageSafety = v)));
  wrap.appendChild(UI.el("div", "hint", "Applied to all image generations."));
  const saveRow = UI.el("div", "modal-actions");
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + " Save");
  save.addEventListener("click", () => { pfrpSettings.save(); UI.showToast("NSFW settings saved"); });
  saveRow.appendChild(save);
  wrap.appendChild(saveRow);
  return wrap;
}

function segControl(options, current, onChange) {
  const seg = UI.el("div", "seg");
  for (const o of options) {
    const b = UI.el("button", o.value === current ? "active" : "", o.label);
    b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      onChange(o.value);
    });
    seg.appendChild(b);
  }
  return seg;
}

function buildImageSettings() {
  const wrap = UI.el("div", "");
  const img = pfrpSettings.data.images || (pfrpSettings.data.images = {});
  if (!img.provider) img.provider = "pollinations";

  const provWrap = UI.el("div", "form-group");
  provWrap.appendChild(UI.el("label", "field-label", "Image provider"));
  const provSel = UI.el("select", "select");
  for (const [k, p] of Object.entries(IMAGE_PROVIDERS)) {
    const o = UI.el("option", "", p.label);
    o.value = k;
    provSel.appendChild(o);
  }
  provSel.value = img.provider;
  provWrap.appendChild(provSel);
  wrap.appendChild(provWrap);

  const keyWrap = UI.el("div", "form-group");
  keyWrap.appendChild(UI.el("label", "field-label", "API key"));
  const keyIn = UI.el("input", "input");
  keyIn.type = "password";
  keyIn.placeholder = "Needed for OpenAI / OpenRouter / Stability";
  keyIn.value = img.apiKey || "";
  keyWrap.appendChild(keyIn);
  wrap.appendChild(keyWrap);

  const modelWrap = UI.el("div", "form-group");
  modelWrap.appendChild(UI.el("label", "field-label", "Model (optional)"));
  const modelIn = UI.el("input", "input");
  modelIn.placeholder = "e.g. dall-e-3  -  leave empty for the provider default";
  modelIn.value = img.model || "";
  modelWrap.appendChild(modelIn);
  wrap.appendChild(modelWrap);

  const updateKeyVisibility = () => {
    const preset = IMAGE_PROVIDERS[provSel.value];
    keyWrap.style.display = preset && !preset.needsKey ? "none" : "";
  };
  provSel.addEventListener("change", () => updateKeyVisibility());

  const SIZE_PRESETS = {
    default: [
      { w: 1024, h: 1024, label: "Square (1024x1024)" },
      { w: 1344, h: 768, label: "Landscape (1344x768)" },
      { w: 768, h: 1344, label: "Portrait (768x1344)" },
    ],
  };
  const sizesFor = () => SIZE_PRESETS.default;
  const sizeWrap = UI.el("div", "form-group");
  sizeWrap.appendChild(UI.el("label", "field-label", "Size"));
  const sizeSel = UI.el("select", "select");
  const fillSizes = () => {
    const sizes = sizesFor();
    const cur = img.width && img.height ? img.width + "x" + img.height : "";
    sizeSel.innerHTML = "";
    for (const s of sizes) {
      const o = UI.el("option", "", s.label);
      o.value = s.w + "x" + s.h;
      sizeSel.appendChild(o);
    }
    if (cur && sizes.some((s) => s.w + "x" + s.h === cur)) sizeSel.value = cur;
  };
  sizeWrap.appendChild(sizeSel);
  wrap.appendChild(sizeWrap);
  wrap.appendChild(UI.el("div", "hint", "Pollinations is free and needs no key. Other providers use their own image APIs. Image safety level lives on the Content tab."));

  provSel.addEventListener("change", () => fillSizes());
  fillSizes();

  const saveRow = UI.el("div", "modal-actions");
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + " Save");
  save.addEventListener("click", () => {
    img.provider = provSel.value;
    img.apiKey = keyIn.value.trim();
    img.model = modelIn.value.trim();
    const dims = (sizeSel.value || "1024x1024").split("x");
    img.width = parseInt(dims[0]) || 1024;
    img.height = parseInt(dims[1]) || 1024;
    pfrpSettings.save();
    UI.showToast("Image settings saved");
  });
  saveRow.appendChild(save);
  wrap.appendChild(saveRow);
  updateKeyVisibility();
  return wrap;
}

function buildFormattingSettings() {
  const wrap = UI.el("div", "");
  const f = pfrpSettings.data.formatting;
  const grid = UI.el("div", "fmt-grid");

  const makeSwitch = (key) => {
    const sw = UI.el("div", "switch" + (f[key] ? " on" : ""));
    sw.addEventListener("click", () => {
      f[key] = !f[key];
      sw.classList.toggle("on", f[key]);
    });
    return sw;
  };

  const makeColor = (colorKey, key) => {
    const colorIn = UI.el("input", "input");
    colorIn.type = "color";
    colorIn.value = f[colorKey] || "#ffffff";
    colorIn.disabled = !f[key];
    colorIn.title = "Color";
    colorIn.style.width = "44px";
    colorIn.style.padding = "2px";
    colorIn.style.height = "var(--control-md)";
    colorIn.addEventListener("input", () => { f[colorKey] = colorIn.value; updateFmtPreview(wrap); });
    return colorIn;
  };

  const addType = (t) => {
    const box = UI.el("div", "fmt-type");
    const top = UI.el("div", "fmt-type-head");
    top.appendChild(UI.el("span", "", t.label));
    const sw = makeSwitch(t.key);
    top.appendChild(sw);
    box.appendChild(top);
    box.appendChild(UI.el("div", "hint", t.desc));

    const controls = UI.el("div", "fmt-controls");
    const colorIn = makeColor(t.colorKey, t.key);
    if (t.charKey) {
      const charIn = UI.el("input", "input");
      charIn.type = "text";
      charIn.maxLength = 1;
      charIn.value = f[t.charKey] || "";
      charIn.disabled = !f[t.key];
      charIn.title = "Delimiter character";
      charIn.style.width = "52px";
      charIn.addEventListener("input", () => { f[t.charKey] = charIn.value; updateFmtPreview(wrap); });
      controls.append(UI.el("span", "hint", "Char"), charIn, UI.el("span", "hint", "Color"), colorIn);
    } else {
      controls.append(UI.el("span", "hint", "Color"), colorIn);
    }
    box.appendChild(controls);

    sw.addEventListener("click", () => {
      colorIn.disabled = !f[t.key];
      const ch = box.querySelector("input[type=text]");
      if (ch) ch.disabled = !f[t.key];
      updateFmtPreview(wrap);
    });
    return box;
  };

  grid.appendChild(addType({ label: "Default text", desc: "Colors everything not covered below", key: "default", colorKey: "defaultColor", charKey: null }));
  grid.appendChild(addType({ label: "Actions", desc: "e.g. *she smiles*", key: "actions", charKey: "actionsChar", colorKey: "actionsColor" }));
  grid.appendChild(addType({ label: "Quotes / speech", desc: "e.g. \"hello there\"", key: "quotes", charKey: "quotesChar", colorKey: "quotesColor" }));
  grid.appendChild(addType({ label: "Inner thoughts", desc: "e.g. `I wonder…`", key: "thoughts", charKey: "thoughtsChar", colorKey: "thoughtsColor" }));
  wrap.appendChild(grid);

  wrap.appendChild(UI.el("div", "spacer-h", ""));
  const noDashRow = UI.el("div", "rowline");
  noDashRow.appendChild(UI.el("span", "", "Never use em-dashes"));
  const noDashSw = UI.el("div", "switch" + (f.noEmDash ? " on" : ""));
  noDashSw.addEventListener("click", () => {
    f.noEmDash = !f.noEmDash;
    noDashSw.classList.toggle("on", f.noEmDash);
  });
  noDashRow.appendChild(noDashSw);
  wrap.appendChild(noDashRow);
  wrap.appendChild(UI.el("div", "hint", "Adds an instruction telling the AI to avoid em-dashes in its writing."));

  const spacingRow = UI.el("div", "rowline");
  spacingRow.appendChild(UI.el("span", "", "Spaced paragraphs"));
  const spacingSw = UI.el("div", "switch" + (f.spacing ? " on" : ""));
  spacingSw.addEventListener("click", () => {
    f.spacing = !f.spacing;
    spacingSw.classList.toggle("on", f.spacing);
  });
  spacingRow.appendChild(spacingSw);
  wrap.appendChild(spacingRow);
  wrap.appendChild(UI.el("div", "hint", "Each action, line of dialogue, and thought gets its own paragraph for clean, readable output. Turn off for run-on prose."));

  wrap.appendChild(UI.el("div", "fmt-preview", buildFmtPreviewHtml()));
  const saveWrap = UI.el("div", "modal-actions");
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + " Save");
  save.addEventListener("click", () => { pfrpSettings.save(); UI.showToast("Formatting saved"); });
  saveWrap.appendChild(save);
  wrap.appendChild(saveWrap);
  return wrap;
}

function buildFmtPreviewHtml() {
  const f = pfrpSettings.data.formatting;
  const defColor = f.default && f.defaultColor ? `style="color:${f.defaultColor}"` : "";
  const parts = [];
  parts.push(`<span class="fmt-def" ${defColor}>Plain dialogue and narration that has no formatting applied.</span>`);
  if (f.actions) parts.push(` <span class="fmt-act" style="color:${f.actionsColor}">${esc(f.actionsChar)}she smiles, stepping closer${esc(f.actionsChar)}</span>`);
  if (f.quotes) parts.push(` <span class="fmt-q" style="color:${f.quotesColor}">${esc(f.quotesChar)}I've missed you${esc(f.quotesChar)}</span>`);
  if (f.thoughts) parts.push(` <span class="fmt-th" style="color:${f.thoughtsColor}">${esc(f.thoughtsChar)}Something feels off tonight${esc(f.thoughtsChar)}</span>`);
  return parts.join(" ");
}
function updateFmtPreview(container) {
  const p = (container || document).querySelector(".fmt-preview");
  if (p) p.innerHTML = buildFmtPreviewHtml();
}

function buildThemeSettings() {
  const wrap = UI.el("div", "");
  const s = pfrpSettings.data;

  const modeRow = UI.el("div", "rowline");
  modeRow.appendChild(UI.el("span", "", "Toggle Dark Mode"));
  const modeSw = UI.el("div", "switch" + (s.dark ? " on" : ""));
  modeRow.appendChild(modeSw);
  modeSw.addEventListener("click", () => {
    s.dark = !s.dark;
    modeSw.classList.toggle("on", s.dark);
    pfrpSettings.save();
    applyTheme();
  });
  wrap.appendChild(modeRow);

  const compactRow = UI.el("div", "rowline");
  compactRow.appendChild(UI.el("span", "", "Compact chat"));
  const compactSw = UI.el("div", "switch" + (s.ui.compactChat ? " on" : ""));
  compactRow.appendChild(compactSw);
  compactSw.addEventListener("click", () => {
    s.ui.compactChat = !s.ui.compactChat;
    compactSw.classList.toggle("on", s.ui.compactChat);
    pfrpSettings.save();
    applyCompactMode();
  });
  wrap.appendChild(compactRow);
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  wrap.appendChild(UI.el("label", "field-label", "Profile image shape"));
  const shapeSeg = UI.el("div", "seg");
  for (const o of [{ value: "circle", label: "Circle" }, { value: "square", label: "Square" }, { value: "squircle", label: "Squircle" }]) {
    const b = UI.el("button", (s.avatarShape || "circle") === o.value ? "active" : "", o.label);
    b.addEventListener("click", () => {
      shapeSeg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      s.avatarShape = o.value;
      pfrpSettings.save();
      applyAvatarShape();
    });
    shapeSeg.appendChild(b);
  }
  wrap.appendChild(shapeSeg);
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  wrap.appendChild(UI.el("label", "field-label", "Accent color"));
  const seg = UI.el("div", "seg");
  const swatches = UI.el("div", "theme-swatches");
  const customRow = UI.el("div", "form-row custom-color");
  const customLabel = UI.el("label", "field-label custom-color", "Custom accent");

  const updateCustomVisibility = () => {
    const show = s.theme === "custom";
    customRow.style.display = show ? "flex" : "none";
    customLabel.style.display = show ? "block" : "none";
  };

  for (const [k, t] of Object.entries(THEMES)) {
    if (k === "custom") {
      const b = UI.el("button", s.theme === "custom" ? "active" : "", t.label);
      b.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        swatches.querySelectorAll(".swatch").forEach((x) => x.classList.remove("active"));
        s.theme = "custom";
        pfrpSettings.save();
        applyTheme();
        updateCustomVisibility();
      });
      seg.appendChild(b);
    } else {
      const sw = UI.el("button", "swatch" + (s.theme === k ? " active" : ""), "");
      sw.style.background = `linear-gradient(135deg,${t.accent1},${t.accent2})`;
      sw.title = t.label;
      sw.addEventListener("click", () => {
        swatches.querySelectorAll(".swatch").forEach((x) => x.classList.remove("active"));
        seg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        sw.classList.add("active");
        s.theme = k;
        pfrpSettings.save();
        applyTheme();
        updateCustomVisibility();
      });
      swatches.appendChild(sw);
    }
  }
  wrap.appendChild(swatches);
  wrap.appendChild(seg);

  const colorIn = UI.el("input", "input");
  colorIn.type = "color";
  colorIn.value = s.themeCustom || "#a78bfa";
  colorIn.addEventListener("input", () => {
    s.themeCustom = colorIn.value;
    colorHex.value = colorIn.value.toUpperCase();
    pfrpSettings.save();
    applyTheme();
  });
  const colorHex = UI.el("input", "input");
  colorHex.type = "text";
  colorHex.value = (s.themeCustom || "#a78bfa").toUpperCase();
  colorHex.addEventListener("input", () => {
    const v = colorHex.value;
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
      const hex = v.startsWith("#") ? v : "#" + v;
      s.themeCustom = hex;
      colorIn.value = hex;
      pfrpSettings.save();
      applyTheme();
    }
  });
  customRow.append(colorIn, colorHex);

  wrap.appendChild(customLabel);
  wrap.appendChild(customRow);
  updateCustomVisibility();

  return wrap;
}

function buildDataSettings() {
  const wrap = UI.el("div", "");
  wrap.appendChild(UI.el("p", "modal-desc", "Your characters, chats, images, and settings are stored in this browser. If the app misbehaves or shows stale data, a reset will clear it and start fresh."));

  const bcard = UI.el("div", "panel-card");
  bcard.appendChild(UI.el("h4", "", `${UI.fa("floppy-disk")} Backup`));
  bcard.appendChild(UI.el("div", "hint", "Export everything (characters, chats, messages, lore, images, and settings) to a JSON file, or restore a previous backup. Restoring merges into your current data and restores your settings."));
  const brow = UI.el("div", "key-row");
  const exportBtn = UI.el("button", "btn", UI.fa("download") + " Export backup");
  exportBtn.addEventListener("click", () => exportBackup());
  const importBtn = UI.el("button", "btn", UI.fa("upload") + " Import backup");
  const importInput = UI.el("input", "input");
  importInput.type = "file";
  importInput.accept = ".json,application/json";
  importInput.style.display = "none";
  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    await importBackupFile(importInput.files[0]);
    importInput.value = "";
  });
  brow.append(exportBtn, importBtn, importInput);
  bcard.appendChild(brow);
  wrap.appendChild(bcard);
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  const pcard = UI.el("div", "panel-card danger-zone");
  pcard.appendChild(UI.el("h4", "", `${UI.fa("triangle-exclamation")} Reset App Data`));
  pcard.appendChild(UI.el("div", "hint", "Deletes all local characters, chats, images, and settings, then reloads the app."));
  const resetRow = UI.el("div", "key-row");
  const btn = UI.el("button", "btn danger", UI.fa("trash") + " Reset app data");
  btn.addEventListener("click", async () => {
    const ok = await UI.confirmModal({
      title: "Reset all app data?",
      message: "This permanently deletes every character, chat, image, and your settings from this browser. This cannot be undone.",
      confirmText: "Reset everything",
    });
    if (ok) await resetAppData();
  });
  resetRow.appendChild(btn);
  pcard.appendChild(resetRow);
  wrap.appendChild(pcard);

  wrap.appendChild(UI.el("div", "spacer-h", ""));
  const pcard2 = UI.el("div", "panel-card danger-zone");
  pcard2.appendChild(UI.el("h4", "", `${UI.fa("circle-info")} About`));
  pcard2.appendChild(UI.el("div", "hint", "Purple's RP  -  local roleplay app. Data never leaves this browser except direct calls to your configured AI/image providers."));
  wrap.appendChild(pcard2);

  return wrap;
}

async function resetAppData() {
  try {
    await pfrpDB.nuke();
  } catch (e) {
    console.error("DB nuke failed", e);
  }
  localStorage.clear();
  location.reload();
}

/* ---------------- CHARACTER CHOICES / MENUS ---------------- */
function choiceCard(icon, title, desc, onClick) {
  const b = UI.el("button", "choice");
  b.innerHTML = `${UI.fa(icon)}<div><b>${esc(title)}</b><span>${esc(desc)}</span></div>`;
  b.addEventListener("click", onClick);
  return b;
}

/* ---------------- POPOVER MENUS ---------------- */
let activeMenu = null;

function closeMenu() {
  if (activeMenu) {
    if (activeMenu._cleanup) activeMenu._cleanup();
    activeMenu.remove();
    activeMenu = null;
  }
  document.querySelectorAll(".d-item.menuOpen").forEach((x) => x.classList.remove("menuOpen"));
}

function showMenu(anchor, items) {
  closeMenu();
  const menu = UI.el("div", "popmenu");
  for (const it of items) {
    const b = UI.el("button", "popmenu-item" + (it.danger ? " danger" : ""));
    b.innerHTML = `${UI.fa(it.icon)}<div><b>${esc(it.label)}</b>${it.desc ? `<span>${esc(it.desc)}</span>` : ""}</div>`;
    b.addEventListener("click", () => {
      closeMenu();
      if (it.onClick) it.onClick();
    });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  activeMenu = menu;

  const r = anchor.getBoundingClientRect();
  const mw = Math.min(300, menu.offsetWidth || 260);
  menu.style.width = mw + "px";
  let left = Math.min(r.right - mw, window.innerWidth - mw - 8);
  left = Math.max(8, left);
  const mh = menu.offsetHeight || (items.length * 54 + 12);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight) top = Math.max(8, r.top - mh - 6);
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  const onDocClick = (e) => {
    if (menu.contains(e.target) || (anchor && anchor.contains(e.target))) return;
    closeMenu();
  };
  const onEsc = (e) => {
    if (e.key === "Escape") closeMenu();
  };
  setTimeout(() => {
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
  }, 0);
  menu._cleanup = () => {
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onEsc);
  };
}

function folderPickerModal(title, currentPath, existingFolders, onSet) {
  const rw = UI.el("div", "");
  const list = UI.el("div", "folder-pick");
  const add = (f) => {
    const row = UI.el("button", "frow" + ((currentPath || "") === f ? " current" : ""), UI.fa(f ? "folder" : "folder-open") + " " + esc(f || "No folder"));
    row.addEventListener("click", async () => {
      overlay.remove();
      await onSet(f);
    });
    list.appendChild(row);
  };
  add("");
  for (const f of existingFolders) add(f);
  const nr = UI.el("div", "newfolder");
  const inp = UI.el("input", "input");
  inp.placeholder = "New folder name";
  const create = UI.el("button", "btn primary", UI.fa("plus") + " Create");
  create.addEventListener("click", async () => {
    const name = inp.value.trim();
    if (!name) return;
    overlay.remove();
    await onSet(name);
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") create.click();
  });
  nr.append(inp, create);
  rw.append(list, nr);
  const overlay = UI.openModal(rw, { title });
}

function manageFoldersModal(storeName) {
  const recs = storeName === "characters" ? characters : threads;
  const folders = [...new Set(recs.map((r) => r.folderPath || "").filter(Boolean))].sort();
  if (!folders.length) {
    UI.showToast("No folders yet. Use Move to folder on a " + (storeName === "characters" ? "character" : "chat") + " to create one.");
    return;
  }
  const rw = UI.el("div", "");
  for (const f of folders) {
    const count = recs.filter((r) => (r.folderPath || "") === f).length;
    const row = UI.el("div", "frow-manage");
    const body = UI.el("div", "fbody");
    body.append(UI.el("div", "fname", esc(f)), UI.el("div", "fsub", count + (count === 1 ? " item" : " items")));
    const re = UI.el("button", "icon-btn", UI.fa("pen"));
    re.title = "Rename folder";
    re.addEventListener("click", () => {
      const rw2 = UI.el("div", "");
      const inp = UI.el("input", "input");
      inp.value = f;
      rw2.appendChild(inp);
      const act = UI.el("div", "modal-actions");
      const cancel = UI.el("button", "btn ghost", "Cancel");
      const ok = UI.el("button", "btn primary", "Rename");
      cancel.addEventListener("click", () => ov2.remove());
      ok.addEventListener("click", async () => {
        const nn = inp.value.trim();
        if (!nn) return;
        for (const r of recs) {
          if ((r.folderPath || "") === f) {
            r.folderPath = nn;
            await pfrpDB.put(storeName, r);
          }
        }
        if (storeName === "characters") {
          if (charFolderFilter === f) charFolderFilter = nn;
        } else if (chatFolderFilter === f) {
          chatFolderFilter = nn;
        }
        ov2.remove();
        await loadData();
        UI.showToast("Folder renamed");
      });
      act.append(cancel, ok);
      rw2.appendChild(act);
      const ov2 = UI.openModal(rw2, { title: "Rename folder" });
    });
    const del = UI.el("button", "icon-btn danger", UI.fa("trash"));
    del.title = "Delete folder (items move to no folder)";
    del.addEventListener("click", async () => {
      const yes = await UI.confirmModal({ title: "Delete folder?", message: `"${f}" will be removed. Its ${count} item${count === 1 ? "" : "s"} will stay, moved to no folder.`, confirmText: "Delete" });
      if (!yes) return;
      for (const r of recs) {
        if ((r.folderPath || "") === f) {
          r.folderPath = "";
          await pfrpDB.put(storeName, r);
        }
      }
      if (storeName === "characters") {
        if (charFolderFilter === f) charFolderFilter = "";
      } else if (chatFolderFilter === f) {
        chatFolderFilter = "";
      }
      await loadData();
      UI.showToast("Folder deleted");
    });
    row.append(body, re, del);
    rw.appendChild(row);
  }
  UI.openModal(rw, { title: "Manage folders" });
}

function showCharMenu(anchor, id) {
  const c = characters.find((x) => x.id === id);
  if (!c) return;
  const items = [
    { icon: "pen", label: "Edit", desc: "Open the character editor", onClick: () => openCharacterEditor(c) },
    { icon: "folder-open", label: "Move to folder", desc: (c.folderPath || "No folder"), onClick: () => folderPickerModal("Move to folder", c.folderPath || "", [...new Set(characters.map((x) => x.folderPath || "").filter(Boolean))].sort(), async (f) => {
      c.folderPath = f || "";
      c.updatedAt = Date.now();
      await pfrpDB.put("characters", c);
      await loadData();
      UI.showToast("Moved to " + (f || "No folder"));
    }) },
    { icon: "user", label: "Convert to persona", desc: "Use this character as a persona you roleplay as", onClick: () => convertCharacterToPersona(c) },
    { icon: "file-arrow-up", label: "Export card", desc: "PNG or JSON  -  SillyTavern, TavernAI, Agnai", onClick: () => exportCharacter(c) },
  ];
  if (needsConversion(c) && !c.converting) {
    items.push({ icon: "wand-magic-sparkles", label: "Convert to PFRP", desc: "AI splits the description into structured fields", onClick: async () => {
      const ok = await UI.confirmModal({ title: "Convert to PFRP?", message: "The AI reads the description and fills in personality, appearance, scenario, first message, and example dialogue. Your description text is kept. You can cancel from the character list while it works.", confirmText: "Convert" });
      if (!ok) return;
      c.converting = true;
      await pfrpDB.put("characters", c);
      await loadData();
      const ac = new AbortController();
      convertingJobs.set(c.id, ac);
      try {
        const converted = await aiConvertCharacter(c, ac.signal);
        await pfrpDB.put("characters", Object.assign({}, c, converted, { converting: false, updatedAt: Date.now() }));
        UI.showToast("Character converted to PFRP format");
      } catch (e) {
        if (ac.signal.aborted) {
          return;
        }
        c.converting = false;
        await pfrpDB.put("characters", c);
        UI.showToast("Conversion failed: " + e.message, { type: "err" });
      } finally {
        convertingJobs.delete(c.id);
        await loadData();
      }
    } });
  }
  items.push({ icon: "trash", label: "Delete", desc: "Remove " + c.name, danger: true, onClick: async () => {
    const linked = threads.filter((t) => !t.isGroup && t.characterId === id);
    let delChats = false;
    let extra = null;
    if (linked.length) {
      const lab = UI.el("label", "checkbox-row");
      const cb = UI.el("input", "");
      cb.type = "checkbox";
      cb.addEventListener("change", () => { delChats = cb.checked; });
      lab.append(cb, UI.el("span", "", `Also delete ${linked.length} chat${linked.length === 1 ? "" : "s"} where ${esc(c.name)} is the primary character`));
      extra = lab;
    }
    const ok = await UI.confirmModal({ title: "Delete character?", message: `"${c.name}" will be permanently deleted.`, confirmText: "Delete", extra });
    if (ok) {
      if (delChats) {
        for (const t of linked) {
          const msgs = await pfrpDB.byIndex("messages", "threadId", t.id);
          for (const m of msgs) await pfrpDB.del("messages", m.id);
          await pfrpDB.del("threads", t.id);
        }
      }
      await pfrpDB.del("characters", id);
      await loadData();
      if (activeThread && !threads.some((t) => t.id === activeThread.id)) clearCenterSelection();
      if (activeCharacter && !characters.some((x) => x.id === activeCharacter.id)) clearCenterSelection();
      UI.showToast(delChats ? "Character and their chats deleted" : "Character deleted");
    }
  } });
  showMenu(anchor, items);
}

function convertCharacterToPersona(c) {
  const personas = pfrpSettings.data.personas || [];
  const persona = {
    id: "persona-" + Date.now().toString(36),
    name: c.name,
    description: c.description || c.tagline || "",
    sourceCharacterId: c.id,
  };
  personas.push(persona);
  pfrpSettings.data.personas = personas;
  pfrpSettings.data.activePersonaId = persona.id;
  pfrpSettings.save();
  UI.showToast("Persona \"" + c.name + "\" created and set as your active persona");
}

function showThreadMenu(anchor, id) {
  const t = threads.find((x) => x.id === id);
  if (!t) return;

  const renameChat = () => {
    const rw = UI.el("div", "");
    const inp = UI.el("input", "input");
    inp.type = "text";
    inp.value = t.name || "";
    rw.appendChild(inp);
    const row = UI.el("div", "modal-actions");
    const cancel = UI.el("button", "btn ghost", "Cancel");
    cancel.addEventListener("click", () => overlay2.remove());
    const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + " Save");
    save.addEventListener("click", async () => {
      t.name = inp.value.trim() || "Unnamed chat";
      await pfrpDB.put("threads", t);
      overlay2.remove();
      await loadData();
      if (activeThread && activeThread.id === t.id) renderThreadUI();
      UI.showToast("Chat renamed");
    });
    row.append(cancel, save);
    rw.appendChild(row);
    const overlay2 = UI.openModal(rw, { title: "Rename chat" });
  };

  const editCharacters = () => {
    if (!t.isGroup) {
      if (t.character) openCharacterEditor(t.character);
      return;
    }
    const members = (t.characterIds || []).map((cid) => characters.find((c) => c.id === cid)).filter(Boolean);
    const rw = UI.el("div", "");
    for (const m of members) {
      rw.appendChild(choiceCard("pen", m.name, "Edit " + esc(m.tagline || m.name), () => {
        overlay2.remove();
        openCharacterEditor(m);
      }));
    }
    const overlay2 = UI.openModal(rw, { title: "Edit group characters" });
  };

  showMenu(anchor, [
    { icon: "pen", label: "Rename chat", desc: "Change this chat's name", onClick: renameChat },
    { icon: "masks-theater", label: t.isGroup ? "Edit characters" : "Edit character", desc: t.isGroup ? "Edit any member of this group" : "Edit " + ((t.character && t.character.name) || ""), onClick: editCharacters },
    { icon: "folder-open", label: "Move to folder", desc: (t.folderPath || "No folder"), onClick: () => folderPickerModal("Move to folder", t.folderPath || "", [...new Set(threads.map((x) => x.folderPath || "").filter(Boolean))].sort(), async (f) => {
      t.folderPath = f || "";
      await pfrpDB.put("threads", t);
      await loadData();
      if (activeThread && activeThread.id === t.id) renderThreadUI();
      UI.showToast("Moved to " + (f || "No folder"));
    }) },
    { icon: "trash", label: "Delete chat", desc: "Delete \"" + t.name + "\"", danger: true, onClick: async () => {
      const ok = await UI.confirmModal({ title: "Delete chat?", message: `"${t.name}" and all its messages will be deleted.`, confirmText: "Delete" });
      if (ok) {
        await pfrpDB.del("threads", id);
        const all = await pfrpDB.getAll("messages");
        for (const m of all.filter((m) => m.threadId === id)) await pfrpDB.del("messages", m.id);
        if (activeThread && activeThread.id === id) closeThread();
        await loadData();
        UI.showToast("Chat deleted");
      }
    } },
  ]);
}

/* ---------------- CHARACTER EDITOR ---------------- */
function openCharacterEditor(c = {}) {
  if (c.converting) {
    UI.showToast("This character is being converted. Cancel or wait for it to finish.", { type: "err" });
    return;
  }
  const wrap = UI.el("div", "");
  const isNew = !c.id;
  const state = Object.assign({}, c, { _explicitness: c.explicitness || pfrpSettings.data.nsfw.chatDefault });

  let ctxFn = () => "(no details yet)";

  const genFieldBtn = (label, targetEl) => {
    const btn = UI.el("button", "iconbtn small", "");
    btn.appendChild(UI.el("i", "fa-solid fa-wand-magic-sparkles"));
    btn.title = "Generate this field with AI, using the other details as context";
    btn.addEventListener("click", async () => {
      if (!ensureProviderConfigured("generating character fields with AI")) return;
      btn.disabled = true;
      btn.innerHTML = "";
      btn.appendChild(UI.el("i", "fa-solid fa-circle-notch fa-spin"));
      try {
        const sys = "You are a character card editor. Given the existing character details, write ONLY the requested field content. No markdown, no extra text, no explanations.";
        const text = await Provider.complete([{ role: "user", content: "Requested field: " + label + "\n\n" + ctxFn() }], { system: sys, temperature: 0.8 });
        targetEl.value = text.trim();
      } catch (e) {
        UI.showToast("Generation failed: " + e.message, { type: "err" });
      } finally {
        btn.disabled = false;
        btn.innerHTML = "";
        btn.appendChild(UI.el("i", "fa-solid fa-wand-magic-sparkles"));
      }
    });
    return btn;
  };

  const f = (label, ph, value, tag = "input", gen = false) => {
    const g = UI.el("div", "form-group");
    const labelRow = UI.el("div", "sys-label-row");
    labelRow.appendChild(UI.el("label", "field-label", label));
    const el = UI.el(tag, tag === "textarea" ? "textarea" : "input");
    if (tag !== "textarea") {
      el.type = "text";
      el.placeholder = ph;
    } else {
      el.placeholder = ph;
    }
    el.value = value || "";
    if (gen) labelRow.appendChild(genFieldBtn(label, el));
    g.appendChild(labelRow);
    g.appendChild(el);
    return { g, el };
  };

  const header = UI.el("div", "dossier-head");
  const avatarG = UI.el("div", "form-group");
  avatarG.appendChild(UI.el("label", "field-label", "Avatar"));
  const uploadLabel = UI.el("label", "avatar-upload");
  const avatarInput = UI.el("input", "input");
  avatarInput.type = "file";
  avatarInput.accept = "image/*";
  const avatarPreview = UI.el("div", "av", c.avatar ? "" : "A");
  if (c.avatar) {
    avatarPreview.innerHTML = `<img src="${c.avatar}" alt="">`;
  }
  avatarPreview.appendChild(UI.el("span", "avatar-edit", UI.fa("camera") + " <span>Change</span>"));
  uploadLabel.append(avatarInput, avatarPreview);
  avatarG.appendChild(uploadLabel);
  let avatarData = c.avatar || "";
  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      avatarData = reader.result;
      avatarPreview.innerHTML = `<img src="${avatarData}" alt="">`;
      avatarPreview.appendChild(UI.el("span", "avatar-edit", UI.fa("camera") + " <span>Change</span>"));
    };
    reader.readAsDataURL(file);
  });
  header.appendChild(avatarG);

  const idCol = UI.el("div", "dossier-id");
  const g1 = f("Name", "e.g. Seraphina", c.name);
  const g2 = f("Tagline", "Short description shown on cards", c.tagline);
  const gTags = f("Tags", "Comma-separated labels for filtering", (c.tags || []).join(", "));
  idCol.append(g1.g, g2.g, gTags.g);
  header.appendChild(idCol);
  wrap.appendChild(header);

  const tabs = UI.el("div", "tabbar");
  const tabBody = UI.el("div", "settings-tab-body");
  const tabDefs = [
    { id: "details", icon: "align-left", label: "Details" },
    { id: "chat", icon: "comments", label: "Chat" },
    { id: "media", icon: "images", label: "Media" },
  ];
  let activeTab = "details";

  const gDesc = f("Description", "Who they are, personality, backstory (free-form, markdown sections welcome)", c.description, "textarea", true);
  gDesc.g.appendChild(UI.el("div", "hint", "Tip: use {{char}} for this character's name and {{user}} for the user's name."));
  const gAppear = f("Appearance", "How they look (optional)", c.appearance, "textarea", true);
  const gPersonality = f("Personality", "Short trait list, e.g. caring, protective, witty", c.personality, "textarea", true);
  const gAttitude = f("How they treat {{user}}", "How this character acts toward the user, e.g. \"Treats you like an old rival she plans to finally beat\"", c.attitude, "textarea", true);
  const gScenario = f("Scenario", "Setting / situation", c.scenario, "textarea", true);

  const photosG = UI.el("div", "form-group");
  photosG.appendChild(UI.el("label", "field-label", "Photos"));
  const photosRow = UI.el("div", "photos-row");
  let photoList = (c.photos || []).map((p) => (typeof p === "string" ? { url: p } : p)).slice();
  const renderPhotos = () => {
    photosRow.innerHTML = "";
    for (let i = 0; i < photoList.length; i++) {
      const cell = UI.el("div", "photo-cell");
      const img = UI.el("img", "");
      img.src = photoList[i].url || "";
      cell.appendChild(img);
      const rm = UI.el("button", "photo-rm", UI.fa("xmark"));
      rm.title = "Remove photo";
      rm.addEventListener("click", () => {
        photoList.splice(i, 1);
        renderPhotos();
      });
      cell.appendChild(rm);
      photosRow.appendChild(cell);
    }
    const addLabel = UI.el("label", "photo-cell add", UI.fa("plus"));
    const addInput = UI.el("input", "");
    addInput.type = "file";
    addInput.accept = "image/*";
    addInput.multiple = true;
    addInput.style.display = "none";
    addLabel.appendChild(addInput);
    addLabel.title = "Add photos (jpg, png, gif)";
    addInput.addEventListener("change", () => {
      for (const file of addInput.files) {
        const reader = new FileReader();
        reader.onload = () => {
          photoList.push({ url: reader.result });
          renderPhotos();
        };
        reader.readAsDataURL(file);
      }
      addInput.value = "";
    });
    photosRow.appendChild(addLabel);
  };
  renderPhotos();
  photosG.appendChild(photosRow);
  photosG.appendChild(UI.el("div", "hint", "Extra pictures of this character. From the character view you can set one as the avatar."));

  const nsfwG = UI.el("div", "form-group");
  nsfwG.appendChild(UI.el("label", "field-label", "Explicitness"));
  const seg = UI.el("div", "seg");
  for (const o of EXPLICITNESS) {
    const b = UI.el("button", o.value === state._explicitness ? "active" : "", o.label);
    b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state._explicitness = o.value;
    });
    seg.appendChild(b);
  }
  nsfwG.appendChild(seg);

  const gFirst = f("First message", "The opening message (greeting)", c.first_mes, "textarea", true);
  const gExample = f("Example dialogue", "Sample exchanges showing their voice (optional)", c.mes_example, "textarea", true);
  const gAlt = f("Alternate greetings", "One greeting per line (optional)", (c.alternate_greetings || []).join("\n"), "textarea");
  const gSystem = f("System prompt (character)", "Extra instructions appended to the system prompt (optional)", c.system_prompt, "textarea", true);
  const gPost = f("Post-history instructions", "Instructions injected after the chat history (optional)", c.post_history_instructions, "textarea", true);

  ctxFn = () => {
    const parts = [];
    const add = (label, v) => { if (v && v.trim()) parts.push(label + ": " + v.trim()); };
    add("Name", g1.el.value);
    add("Tagline", g2.el.value);
    add("Description", gDesc.el.value);
    add("Appearance", gAppear.el.value);
    add("Personality", gPersonality.el.value);
    add("How they treat you", gAttitude.el.value);
    add("Scenario", gScenario.el.value);
    add("First message", gFirst.el.value);
    add("Example dialogue", gExample.el.value);
    add("System prompt", gSystem.el.value);
    add("Post-history instructions", gPost.el.value);
    return parts.join("\n\n") || "(no details yet)";
  };

  const detailsBody = UI.el("div", "");
  detailsBody.append(gDesc.g, gAppear.g, gPersonality.g, gAttitude.g, gScenario.g, nsfwG);
  const chatBody = UI.el("div", "");
  chatBody.append(gFirst.g, gExample.g, gAlt.g, gSystem.g, gPost.g);
  const mediaBody = UI.el("div", "");
  mediaBody.append(photosG);

  function showTab(id) {
    activeTab = id;
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    tabBody.innerHTML = "";
    tabBody.appendChild(id === "details" ? detailsBody : id === "chat" ? chatBody : mediaBody);
  }

  for (const td of tabDefs) {
    const b = UI.el("button", "stab" + (activeTab === td.id ? " active" : ""), `${UI.fa(td.icon)} ${td.label}`);
    b.dataset.tab = td.id;
    b.addEventListener("click", () => showTab(td.id));
    tabs.appendChild(b);
  }
  wrap.appendChild(tabs);
  wrap.appendChild(tabBody);
  showTab("details");

  const buttons = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + (isNew ? " Create" : " Save"));
  save.addEventListener("click", async () => {
    const record = Object.assign({}, c, {
      name: g1.el.value.trim() || "Unnamed",
      tagline: g2.el.value.trim(),
      tags: gTags.el.value.split(",").map((x) => x.trim()).filter(Boolean),
      description: gDesc.el.value.trim(),
      appearance: gAppear.el.value.trim(),
      personality: gPersonality.el.value.trim(),
      attitude: gAttitude.el.value.trim(),
      scenario: gScenario.el.value.trim(),
      first_mes: gFirst.el.value.trim(),
      mes_example: gExample.el.value.trim(),
      alternate_greetings: gAlt.el.value.split("\n").map((x) => x.trim()).filter(Boolean),
      system_prompt: gSystem.el.value.trim(),
      post_history_instructions: gPost.el.value.trim(),
      explicitness: state._explicitness,
      avatar: avatarData,
      photos: photoList,
      updatedAt: Date.now(),
    });
    if (isNew) {
      record.createdAt = Date.now();
      await pfrpDB.add("characters", record);
    } else {
      await pfrpDB.put("characters", record);
    }
    overlay.remove();
    await loadData();
    UI.showToast(isNew ? "Character created" : "Character saved");
  });
  buttons.append(save, cancel);
  wrap.appendChild(buttons);

  const overlay = UI.openModal(wrap, { title: isNew ? "New character" : "Edit " + esc(state.name || "character"), wide: true });
}

function newCharacterChooser() {
  const wrap = UI.el("div", "");
  wrap.appendChild(choiceCard("file-import", "Import", "Import a character card (PNG or JSON)", () => {
    overlay.remove();
    els.importInput.click();
  }));
  wrap.appendChild(choiceCard("pen", "From Scratch", "Build a character manually", () => {
    overlay.remove();
    openCharacterEditor();
  }));
  wrap.appendChild(choiceCard("wand-magic-sparkles", "AI Generated", "Describe a character and let the AI draft it", () => {
    overlay.remove();
    aiGenerateCharacter();
  }));
  wrap.appendChild(choiceCard("link", "From URL", "Paste a link to a wiki page or character card site and let the AI build the character", () => {
    overlay.remove();
    aiCharacterFromUrl();
  }));
  wrap.appendChild(choiceCard("database", "From Character DB", "Browse the community character database (coming soon)", () => {
    overlay.remove();
    UI.showToast("Character DB coming soon");
  }));
  const overlay = UI.openModal(wrap, { title: "New character" });
}

function stripHtmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmbeddedCharacter(html) {
  const candidates = [];
  const jsonLd = String(html).match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLd) {
    for (const block of jsonLd) {
      const inner = block.replace(/<[^>]+>/g, "");
      try {
        const data = JSON.parse(inner);
        if (Array.isArray(data)) candidates.push(...data);
        else candidates.push(data);
      } catch {}
    }
  }
  const nextData = String(html).match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    try {
      const parsed = JSON.parse(nextData[1]);
      candidates.push(parsed);
    } catch {}
  }
  for (const data of candidates) {
    const found = deepFindCharacter(data);
    if (found) return found;
  }
  return null;
}

function deepFindCharacter(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return null;
  const name = node.name;
  const looksLikeCard =
    name &&
    (node.description || node.personality || node.greeting || node.first_mes || node.firstMessage || node.scenario || node.instructions || node.mes_example);
  if (looksLikeCard) return node;
  for (const key of Object.keys(node)) {
    const found = deepFindCharacter(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function corsFriendlyHost(url) {
  try {
    const origin = new URL(url).origin;
    return (
      origin.endsWith("jsdelivr.net") ||
      origin.endsWith("catbox.moe") ||
      (origin.endsWith("huggingface.co") && url.includes("/resolve/")) ||
      origin === "https://raw.githubusercontent.com"
    );
  } catch {
    return false;
  }
}

async function fetchPageViaProxy(url, signal) {
  const attempts = [];
  if (corsFriendlyHost(url)) {
    try {
      const direct = await fetch(url, { signal });
      attempts.push("direct:" + direct.status);
      if (direct.ok) {
        const text = await direct.text();
        if (text && text.length >= 60) return text;
      }
    } catch (e) {
      attempts.push("direct:" + (e && e.name));
    }
  }
  const custom = (pfrpSettings.data.urlProxy || "").trim();
  if (custom) {
    try {
      const res = await fetch(custom + encodeURIComponent(url), { signal });
      attempts.push("custom:" + res.status);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length >= 60) return text;
      }
    } catch (e) {
      attempts.push("custom:" + (e && e.name));
    }
  }
  const proxies = [
    ["allorigins", (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u)],
    ["corsproxy", (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u)],
    ["codetabs", (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)],
  ];
  let lastErr = null;
  for (const [name, p] of proxies) {
    try {
      const res = await fetch(p(url), { signal });
      attempts.push(name + ":" + res.status);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (!text || text.length < 60) throw new Error("empty");
      console.log("[URL] fetched via " + name + ": " + url + " (" + text.length + " chars)");
      return text;
    } catch (e) {
      lastErr = e;
      console.warn("[URL] " + name + " failed for " + url + ": " + (e && e.message));
    }
  }
  const detail = new Error("all fetch routes failed (" + attempts.join(", ") + ")");
  console.warn("[URL] giving up on " + url + "  -  " + attempts.join(", "));
  throw detail;
}

function extractCharacterImages(html) {
  const map = {};
  const re = /<img[^>]+alt="Profile image of ([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const name = m[1].trim();
    const tag = m[0];
    const srcSet = (tag.match(/srcSet="([^"]+)/i) || [])[1];
    const src = (tag.match(/src="([^"]+)"/i) || [])[1];
    const url = (srcSet ? srcSet.split(/\s+/)[0] : src) || "";
    if (/^https?:\/\//i.test(url)) map[name.toLowerCase()] = url;
  }
  return map;
}

function findImageForName(html, name) {
  const s = String(html);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp('<img[^>]+alt="[^"]*' + escaped + '[^"]*"[^>]*>', "i");
  const tag = s.match(re);
  if (!tag) return null;
  const srcSet = (tag[0].match(/srcSet="([^"]+)/i) || [])[1];
  const src = (tag[0].match(/src="([^"]+)"/i) || [])[1];
  const url = (srcSet ? srcSet.split(/\s+/)[0] : src) || "";
  return /^https?:\/\//i.test(url) ? url : null;
}

async function splitIntoCharacters(pageText, signal) {
  const SPLIT_SYS = 'You are a character card parser. Given content about a story, plot, or cast, return ONLY valid JSON in this shape: {"plot": {"title": string, "tagline": string (short), "scenario": string (the shared setting/situation), "intro": string (the opening scene exactly as provided, written as one or more [Name] blocks - [Name] on its own line followed by that character\'s opening lines, and [Narrator] for narration; omit if the source has no opening scene)}, "characters": [{"name": string, "tagline": string (short, 3-6 words), "description": string (detailed persona/backstory), "personality": string (comma-separated traits), "attitude": string (one line on how this character acts toward the user), "appearance": string}]}. Split into separate entries ONLY when the content describes genuinely distinct named characters. If it is one persona (even with aliases or alternate forms), return a single character. Never include the user or reader-protagonist placeholder as a character. 1-8 characters. Preserve all facts; do not invent new ones. No markdown fences, no extra text.';
  const text = await Provider.complete([{ role: "user", content: "Source content:\n" + pageText }], { system: SPLIT_SYS, temperature: 0.4, signal });
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

function sceneOpeningHtml(blocks) {
  return blocks
    .map((b) => {
      const c = b.characterId ? characters.find((x) => x.id === b.characterId) : null;
      const av = b.narrator
        ? `<div class="av av-narrator">${UI.fa("book-open")}</div>`
        : avatarHtml(c, "");
      return `<div class="msg opening-msg"><div class="av-wrap">${av}</div>
        <div class="bubble"><div class="who">${esc(b.name)}</div><div class="body">${formatText(b.content)}</div></div>
      </div>`;
    })
    .join("");
}

async function handleSplitResult(split, opts = {}) {
  const chars = (split.characters || []).filter((c) => c && (c.name || c.description));
  if (!chars.length) throw new Error("No characters found on the page");
  if (chars.length === 1) {
    let one = chars[0];
    one.scenario = one.scenario || (split.plot && split.plot.scenario) || "";
    one.tagline = one.tagline || (split.plot && split.plot.tagline) || "";
    if (split.plot && split.plot.intro && !(one.first_mes || "").trim()) {
      one.first_mes = String(split.plot.intro).trim();
    }
    if (opts.convCb && opts.convCb.checked && needsPfrpFill(one)) {
      one = await fillPfrpFields(Object.assign({ name: one.name, description: one.description }, one), opts.signal);
    }
    let avatarDataUrl = opts.avatarDataUrl || "";
    if (!avatarDataUrl && opts.pageHtml) {
      const imgMap = extractCharacterImages(opts.pageHtml);
      const url = imgMap[(one.name || "").toLowerCase()] || findImageForName(opts.pageHtml, one.name);
      if (url) {
        try {
          avatarDataUrl = await fetchImageAsDataUrl(url, opts.signal);
        } catch {}
      }
    }
    if (opts.overlay) opts.overlay.remove();
    openCharacterEditor(avatarDataUrl ? Object.assign({}, one, { avatar: avatarDataUrl }) : one);
  } else {
    if (opts.overlay) opts.overlay.remove();
    reviewSplitModal(split.plot || {}, chars, opts.pageHtml || "", opts.avatarDataUrl || "");
  }
}

function reviewSplitModal(plot, chars, pageHtml = "", coverUrl = "") {
  const imgMap = extractCharacterImages(pageHtml || "");
  const wrap = UI.el("div", "");
  wrap.appendChild(UI.el("p", "modal-desc", `This looks like ${chars.length} distinct characters${plot && plot.title ? ' in "' + esc(plot.title) + '"' : ""}. Import them as separate characters, or keep everything as one?`));
  const list = UI.el("div", "folder-pick");
  for (const c of chars) {
    const url = imgMap[(c.name || "").toLowerCase()] || findImageForName(pageHtml || "", c.name || "");
    const row = UI.el("div", "frow split-row");
    const av = UI.el("div", "av split-av", c.name ? c.name[0].toUpperCase() : "?");
    if (url) av.innerHTML = `<img src="${esc(url)}" alt="">`;
    row.appendChild(av);
    const body = UI.el("div", "split-info");
    body.appendChild(UI.el("b", "", esc(c.name || "Unnamed")));
    body.appendChild(UI.el("span", "hint", esc(String(c.personality || c.attitude || c.description || "").slice(0, 110))));
    row.appendChild(body);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  const act = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const asOne = UI.el("button", "btn", UI.fa("user") + " Keep as one");
  asOne.addEventListener("click", () => {
    const merged = {
      name: (plot && plot.title) || (chars[0] && chars[0].name) || "Unnamed",
      tagline: (plot && plot.tagline) || "",
      description: [plot && plot.scenario, ...chars.map((c) => (c.name || "?") + ": " + (c.description || c.personality || "")), plot && plot.intro ? "Opening scene:\n" + plot.intro : ""].filter(Boolean).join("\n\n"),
      scenario: (plot && plot.scenario) || "",
    };
    overlay.remove();
    openCharacterEditor(merged);
  });
  const importBtn = UI.el("button", "btn primary", UI.fa("user-group") + " Import as " + chars.length + " characters");
  importBtn.addEventListener("click", async () => {
    const ids = [];
    for (const c of chars) {
      let avatar = "";
      const url = imgMap[(c.name || "").toLowerCase()] || findImageForName(pageHtml || "", c.name || "");
      if (url) {
        try {
          avatar = await fetchImageAsDataUrl(url, null);
        } catch (e) {
          console.warn("[URL] avatar fetch failed for " + c.name + ": " + (e && e.message));
        }
      }
      const id = await pfrpDB.add("characters", {
        name: c.name || "Unnamed",
        tagline: c.tagline || "",
        description: c.description || "",
        personality: c.personality || "",
        attitude: c.attitude || "",
        appearance: c.appearance || "",
        scenario: (plot && plot.scenario) || c.scenario || "",
        explicitness: pfrpSettings.data.nsfw.chatDefault,
        tags: [],
        avatar,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      ids.push(id);
    }
    overlay.remove();
    await loadData();
    UI.showToast("Imported " + chars.length + " characters");
    if (plot && plot.scenario) {
      let sceneAvatar = "";
      if (coverUrl) {
        try {
          sceneAvatar = await fetchImageAsDataUrl(coverUrl, null);
        } catch (e) {
          console.warn("[URL] scene cover fetch failed: " + (e && e.message));
        }
      }
      const preview = UI.el("div", "panel-card");
      preview.appendChild(UI.el("h4", "", `${UI.fa("film")} ${esc(plot.title || "Untitled scene")}`));
      if (plot.tagline) preview.appendChild(UI.el("div", "field", `<b>Tagline</b><br>${esc(plot.tagline)}`));
      preview.appendChild(UI.el("div", "field", `<b>Scenario</b><br>${esc(plot.scenario)}`));
      preview.appendChild(UI.el("div", "field", `<b>Characters</b><br>${esc(chars.map((c) => c.name).join(", "))}`));
      const saveScene = await UI.confirmModal({
        title: "Save this scene?",
        message: "Save the scene below with these characters, so you can start chats from it later?",
        confirmText: "Save scene",
        danger: false,
        extra: preview,
      });
      if (saveScene) {
        await pfrpDB.add("scenes", {
          name: plot.title || chars.map((c) => c.name).join(", "),
          tagline: plot.tagline || "",
          scenario: plot.scenario,
          intro: plot.intro || "",
          characterIds: ids,
          avatar: sceneAvatar,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await loadData();
        UI.showToast("Scene saved");
      }
    }
    const start = await UI.confirmModal({
      title: "Start a group chat?",
      message: "Start a group chat with these characters right away?",
      confirmText: "Start chat",
      danger: false,
    });
    if (start) {
      await createGroupThread(ids, null);
    } else {
      setDrawer("chars");
    }
  });
  act.append(cancel, asOne, importBtn);
  wrap.appendChild(act);
  const overlay = UI.openModal(wrap, {
    title: "Multiple characters detected",
    wide: true,
    onBackdrop: async () => {
      const ok = await UI.confirmModal({
        title: "Close without importing?",
        message: "Closing now discards the detected characters and scene.",
        confirmText: "Discard",
      });
      if (ok) overlay.remove();
    },
  });
}

async function fillPfrpFields(rec, signal) {
  try {
    const converted = await aiConvertCharacter(rec, signal);
    const merged = Object.assign({}, converted, rec);
    for (const k of ["name", "personality", "attitude", "appearance", "scenario", "first_mes", "mes_example"]) {
      if (!String(merged[k] || "").trim() && String(converted[k] || "").trim()) merged[k] = converted[k];
    }
    return merged;
  } catch {
    return rec;
  }
}

function needsPfrpFill(rec) {
  return !!(
    rec &&
    String(rec.description || "").trim() &&
    ["personality", "attitude", "appearance", "scenario", "first_mes", "mes_example"].some((k) => !String(rec[k] || "").trim())
  );
}

let urlImportActive = false;
let urlImportAbort = null;
let importPill = null;

function showImportPill(onRestore) {
  if (importPill) return;
  importPill = UI.el("div", "import-pill");
  const label = UI.el("span", "", "Importing character from URL...");
  const cancelBtn = UI.el("button", "iconbtn", UI.fa("xmark"));
  cancelBtn.title = "Cancel import";
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (urlImportAbort) urlImportAbort.abort();
  });
  importPill.append(UI.el("span", "spinner"), label, cancelBtn);
  importPill.title = "Click to restore the import dialog";
  importPill.addEventListener("click", () => {
    if (onRestore) onRestore();
  });
  document.body.appendChild(importPill);
}

function hideImportPill() {
  if (importPill) {
    importPill.remove();
    importPill = null;
  }
}

function endUrlImport() {
  urlImportActive = false;
  urlImportAbort = null;
  hideImportPill();
}

function aiCharacterFromUrl() {
  const wrap = UI.el("div", "");
  wrap.appendChild(UI.el("p", "modal-desc", "Paste a link to a fandom wiki page or a character card site. The AI reads the page and drafts the character for you to review and edit. Card sites are downloaded directly, including the character's image."));
  const inp = UI.el("input", "input");
  inp.type = "url";
  inp.placeholder = "https://...";
  wrap.appendChild(inp);
  const convRow = UI.el("label", "checkbox-row");
  const convCb = UI.el("input", "");
  convCb.type = "checkbox";
  convRow.append(convCb, UI.el("span", "", "Convert to PFRP format (fills in missing fields with AI)"));
  wrap.appendChild(convRow);
  const status = UI.el("div", "hint");

  const pasteCtn = UI.el("div", "form-group");
  pasteCtn.style.display = "none";
  pasteCtn.appendChild(UI.el("label", "field-label", "Or paste the page content"));
  const pasteTa = UI.el("textarea", "textarea");
  pasteTa.rows = 5;
  pasteTa.placeholder = "If automatic fetching is blocked, open the page yourself, copy its content, and paste it here.";
  pasteCtn.appendChild(pasteTa);
  const pasteBtn = UI.el("button", "btn", UI.fa("clipboard") + " Use pasted content");
  pasteBtn.addEventListener("click", async () => {
    const text = pasteTa.value.trim();
    if (!text) {
      UI.showToast("Paste the page content first", { type: "err" });
      return;
    }
    if (!ensureProviderConfigured("parsing characters with AI")) return;
    if (urlImportActive) {
      UI.showToast("A URL import is already running", { type: "err" });
      return;
    }
    urlImportActive = true;
    showImportPill(() => {
      if (!overlay.isConnected) document.body.appendChild(overlay);
    });
    pasteBtn.disabled = true;
    status.textContent = "Finding the characters...";
    const pAc = new AbortController();
    urlImportAbort = pAc;
    try {
      const split = await splitIntoCharacters(text.slice(0, 12000), pAc.signal);
      endUrlImport();
      await handleSplitResult(split, { overlay, signal: pAc.signal });
    } catch (e) {
      endUrlImport();
      status.textContent = "Failed: " + e.message;
      pasteBtn.disabled = false;
    }
  });
  pasteCtn.appendChild(pasteBtn);
  wrap.appendChild(pasteCtn);

  const row = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  let ac = null;
  let running = false;
  const doMinimize = () => {
    overlay.remove();
  };
  const gen = UI.el("button", "btn primary", UI.fa("wand-magic-sparkles") + " Create character");
  gen.addEventListener("click", async () => {
    const url = inp.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      UI.showToast("Enter a valid URL starting with http(s)://", { type: "err" });
      return;
    }
    if (!ensureProviderConfigured("importing characters from URL with AI")) return;
    if (urlImportActive) {
      UI.showToast("A URL import is already running", { type: "err" });
      return;
    }
    urlImportActive = true;
    showImportPill(() => {
      if (!overlay.isConnected) document.body.appendChild(overlay);
    });
    gen.disabled = true;
    running = true;
    gen.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Working...';
    status.textContent = "Looking for a character card...";
    try {
      ac = new AbortController();
      urlImportAbort = ac;

      let cardRecord = null;
      for (const trySite of [tryAicharactercards, tryCharacterTavern, tryChub, tryJannyai]) {
        try {
          const rec = await trySite(url, ac.signal);
          if (rec) {
            cardRecord = rec;
            break;
          }
        } catch (e) {
          console.warn("Card site extraction failed:", e && e.message);
        }
      }
      if (cardRecord) {
        if (convCb.checked && needsPfrpFill(cardRecord)) {
          status.textContent = "Converting the card to PFRP format...";
          cardRecord = await fillPfrpFields(cardRecord, ac.signal);
        }
        status.textContent = "Card found - opening the editor...";
        endUrlImport();
        overlay.remove();
        openCharacterEditor(cardRecord);
        return;
      }

      let pageText = "";
      let pageHtml = "";
      let imageUrl = null;
      let fields = null;

      const wiki = wikiPageInfo(url);
      if (wiki) {
        status.textContent = "Reading the wiki page...";
        const w = await fetchWikiPage(url, ac.signal);
        if (w) {
          pageText = w.text;
          imageUrl = w.imageUrl;
        }
      }

      if (!pageText) {
        status.textContent = "Fetching the page...";
        const html = await fetchPageViaProxy(url, ac.signal);
        pageHtml = html;
        const embedded = extractEmbeddedCharacter(html);
        if (embedded) {
          fields = {
            name: embedded.name || "",
            tagline: embedded.tagline || embedded.shortDescription || "",
            description: embedded.description || embedded.instructions || "",
            personality: embedded.personality || "",
            appearance: embedded.appearance || embedded.appearanceDescription || "",
            scenario: embedded.scenario || "",
            first_mes: embedded.first_mes || embedded.greeting || embedded.firstMessage || "",
            mes_example: embedded.mes_example || embedded.exampleDialogue || "",
          };
          imageUrl = embedded.image || embedded.avatarUrl || embedded.profileImageUrl || embedded.avatar || null;
          status.textContent = "Found a character card on the page - refining with AI...";
        }
        pageText = stripHtmlToText(html).slice(0, 12000);
        imageUrl = imageUrl || extractImageUrl(html);
      }
      if (!pageText) throw new Error("The page has no readable content");

      let avatarDataUrl = "";
      if (imageUrl) {
        status.textContent = "Fetching the character image...";
        try {
          avatarDataUrl = await fetchImageAsDataUrl(imageUrl, ac.signal);
        } catch (e) {
          console.warn("Avatar fetch failed:", e && e.message);
        }
      }

      status.textContent = "Finding the characters...";
      const hint = fields ? "Known fields found on the page (keep and refine them):\n" + JSON.stringify(fields) + "\n\nPage content:\n" + pageText : "Page content:\n" + pageText;
      const split = await splitIntoCharacters(hint, ac.signal);
      endUrlImport();
      await handleSplitResult(split, { overlay, convCb, signal: ac.signal, avatarDataUrl, pageHtml });
    } catch (e) {
      running = false;
      endUrlImport();
      if (overlay.isConnected) {
        status.textContent = "Failed: " + e.message + "  -  this site may block automatic fetching. Set a URL fetch proxy in Settings > Connection, or paste the page content below.";
        pasteCtn.style.display = "";
      } else {
        UI.showToast("URL import failed: " + e.message, { type: "err" });
      }
      gen.disabled = false;
      gen.innerHTML = UI.fa("wand-magic-sparkles") + " Create character";
    }
  });
  row.append(cancel, gen);
  wrap.appendChild(row);
  wrap.appendChild(status);
  const overlay = UI.openModal(wrap, { title: "Create character from URL", wide: true, onBackdrop: doMinimize });
  const head = overlay.querySelector(".modal-head");
  const closeBtn = head.querySelector(".iconbtn");
  const rightWrap = UI.el("div", "modal-head-right");
  const minBtn = UI.el("button", "iconbtn", UI.fa("window-minimize"));
  minBtn.title = "Minimize (the import continues in the background)";
  minBtn.addEventListener("click", doMinimize);
  rightWrap.append(minBtn, closeBtn);
  head.appendChild(rightWrap);
  inp.focus();
}

function wikiPageInfo(url) {
  const m = String(url).match(/^https?:\/\/([^/]+)\/(?:[a-z-]+\/)*wiki\/([^#?]+)/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const looksWiki = /fandom\.com|wikia\.com|gamepedia\.com|wiki/.test(host) || String(url).toLowerCase().includes("/wiki/");
  if (!looksWiki) return null;
  return {
    apiBase: "https://" + host + "/api.php",
    page: decodeURIComponent(m[2].replace(/_/g, " ")),
  };
}

async function fetchWikiPage(url, signal) {
  const info = wikiPageInfo(url);
  if (!info) return null;
  try {
    const apiUrl = info.apiBase + "?action=parse&page=" + encodeURIComponent(info.page) + "&format=json&prop=text&redirects=1&origin=*";
    const res = await fetch(apiUrl, { signal });
    if (!res.ok) {
      console.warn("[URL] wiki api failed: " + apiUrl + " -> " + res.status);
      return null;
    }
    const data = await res.json();
    if (data.error || !data.parse || !data.parse.text) return null;
    const pageText = stripHtmlToText(data.parse.text["*"]).slice(0, 12000);
    if (!pageText) return null;
    console.log("[URL] wiki page fetched: " + url + " (" + pageText.length + " chars)");
    let imageUrl = null;
    try {
      const title = data.parse.title || info.page;
      const imgUrl = info.apiBase + "?action=query&titles=" + encodeURIComponent(title) + "&prop=pageimages&format=json&piprop=thumbnail&pithumbsize=600&origin=*";
      const imgRes = await fetch(imgUrl, { signal });
      const imgData = await imgRes.json();
      const pages = (imgData && imgData.query && imgData.query.pages) || {};
      for (const k of Object.keys(pages)) {
        if (pages[k].thumbnail && pages[k].thumbnail.source) {
          imageUrl = pages[k].thumbnail.source;
          break;
        }
      }
    } catch (e) {
      console.warn("[URL] wiki image lookup failed: " + (e && e.message));
    }
    return { text: pageText, imageUrl };
  } catch (e) {
    console.warn("[URL] wiki fetch failed for " + url + ": " + (e && e.message));
    return null;
  }
}

function extractImageUrl(html) {
  const s = String(html);
  const og = s.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || s.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og) return og[1];
  const tw = s.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (tw) return tw[1];
  const rel = s.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
  if (rel) return rel[1];
  return null;
}

async function fetchBlobViaProxy(url, signal) {
  const attempts = [];
  if (corsFriendlyHost(url)) {
    try {
      const direct = await fetch(url, { signal });
      attempts.push("direct:" + direct.status);
      if (direct.ok) {
        const blob = await direct.blob();
        if (blob && blob.size > 40) return blob;
      }
    } catch (e) {
      attempts.push("direct:" + (e && e.name));
    }
  }
  const custom = (pfrpSettings.data.urlProxy || "").trim();
  if (custom) {
    try {
      const res = await fetch(custom + encodeURIComponent(url), { signal });
      attempts.push("custom:" + res.status);
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 40) return blob;
      }
    } catch (e) {
      attempts.push("custom:" + (e && e.name));
    }
  }
  const proxies = [
    ["corsproxy", (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u)],
    ["allorigins", (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u)],
    ["codetabs", (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)],
  ];
  let lastErr = null;
  for (const [name, p] of proxies) {
    try {
      const res = await fetch(p(url), { signal });
      attempts.push(name + ":" + res.status);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const blob = await res.blob();
      if (blob && blob.size > 40) {
        console.log("[URL] blob via " + name + ": " + url + " (" + blob.size + " bytes)");
        return blob;
      }
      throw new Error("empty");
    } catch (e) {
      lastErr = e;
      console.warn("[URL] " + name + " failed for " + url + ": " + (e && e.message));
    }
  }
  const detail = new Error("all fetch routes failed (" + attempts.join(", ") + ")");
  console.warn("[URL] giving up on " + url + "  -  " + attempts.join(", "));
  throw detail;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(url, signal) {
  try {
    const direct = await fetch(url, { signal });
    if (direct.ok) {
      const blob = await direct.blob();
      if (blob && blob.size > 40) return await blobToDataUrl(blob);
    }
  } catch {}
  return await blobToDataUrl(await fetchBlobViaProxy(url, signal));
}

async function cardRecordFromBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  const records = await Import.parseFile(file);
  const rec = records && records[0];
  if (!rec || !rec.name || rec.name === "Unnamed") return null;
  return rec;
}

async function fetchJsonViaProxy(url, signal) {
  const attempts = [];
  const custom = (pfrpSettings.data.urlProxy || "").trim();
  if (custom) {
    try {
      const res = await fetch(custom + encodeURIComponent(url), { signal });
      attempts.push("custom:" + res.status);
      if (res.ok) return await res.json();
    } catch (e) {
      attempts.push("custom:" + (e && e.name));
    }
  }
  const proxies = [
    ["corsproxy", (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u)],
    ["allorigins", (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u)],
    ["codetabs", (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)],
  ];
  let lastErr = null;
  for (const [name, p] of proxies) {
    try {
      const res = await fetch(p(url), { signal });
      attempts.push(name + ":" + res.status);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn("[URL] " + name + " failed for " + url + ": " + (e && e.message));
    }
  }
  const detail = new Error("all fetch routes failed (" + attempts.join(", ") + ")");
  console.warn("[URL] giving up on " + url + "  -  " + attempts.join(", "));
  throw detail;
}

async function tryAicharactercards(url, signal) {
  const m = String(url).match(/aicharactercards\.com\/cards\/([0-9]+)/i);
  if (!m) return null;
  const id = m[1];
  try {
    const blob = await fetchBlobViaProxy("https://api.aicharactercards.com/api/cards/" + id + "/download", signal);
    const rec = await cardRecordFromBlob(blob, "card.png");
    if (rec) return rec;
  } catch (e) {
    console.warn("aicharactercards download failed:", e && e.message);
  }
  try {
    const json = await fetchJsonViaProxy("https://api.aicharactercards.com/api/cards/" + id, signal);
    if (json && (json.title || json.description)) {
      let avatar = "";
      if (json.imageUrl) {
        const imgUrl = /^https?:\/\//i.test(json.imageUrl) ? json.imageUrl : "https://aicharactercards.com" + (json.imageUrl.startsWith("/") ? "" : "/") + json.imageUrl;
        try {
          avatar = await fetchImageAsDataUrl(imgUrl, signal);
        } catch {}
      }
      return {
        name: json.title || "",
        tagline: (json.tags && json.tags.join(", ")) || "",
        description: json.description || "",
        avatar,
      };
    }
  } catch (e) {
    console.warn("aicharactercards JSON failed:", e && e.message);
  }
  return null;
}

async function tryCharacterTavern(url, signal) {
  const m = String(url).match(/(?:character-tavern\.com|tavern\.com)\/character\/([^?#]+)/i);
  if (!m) return null;
  const path = m[1].split("?")[0];
  const cardUrl = "https://ct-cards.storage.character-tavern.com/" + path + ".png";
  let blob = null;
  try {
    const direct = await fetch(cardUrl, { signal });
    if (direct.ok) {
      blob = await direct.blob();
    }
  } catch {}
  if (!blob || blob.size <= 40) {
    blob = await fetchBlobViaProxy(cardUrl, signal);
  }
  return await cardRecordFromBlob(blob, "card.png");
}

async function tryChub(url, signal) {
  const m = String(url).match(/chub\.ai\/characters\/([^/?#]+)/i);
  if (!m) return null;
  const id = m[1];
  try {
    const res = await fetch("https://gateway.chub.ai/api/characters/" + encodeURIComponent(id) + "?full=true&nocache=" + Math.random(), { signal });
    if (res.ok) {
      const json = await res.json();
      const def = json && json.node && json.node.definition;
      if (def && def.name) {
        let avatar = "";
        try {
          avatar = await fetchImageAsDataUrl(json.node.avatar_url || def.avatar || "", signal);
        } catch {}
        return {
          name: def.name,
          description: def.description || json.node.description || "",
          personality: def.personality || def.tavern_personality || "",
          scenario: def.scenario || "",
          first_mes: def.first_message || "",
          mes_example: def.example_dialogs || "",
          alternate_greetings: def.alternate_greetings || [],
          avatar,
        };
      }
    }
  } catch {}
  try {
    const blob = await fetchBlobViaProxy("https://avatars.charhub.io/avatars/" + encodeURIComponent(id) + "/chara_card_v2.png?nocache=" + Math.random(), signal);
    return await cardRecordFromBlob(blob, "card.png");
  } catch {
    return null;
  }
}

async function tryJannyai(url, signal) {
  if (!/jannyai\.com|janitorai\.com/i.test(url)) return null;
  const id = String(url).split("/").filter(Boolean).pop().split("?")[0];
  const html = await fetchPageViaProxy("https://jannyai.com/characters/" + encodeURIComponent(id), signal);
  const props = String(html).match(/props="(\{&quot;imageUrl.+?)"/);
  if (!props) return null;
  const jsonText = props[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const json = JSON.parse(jsonText);
  const char = json.character ? json.character[1] : null;
  if (!char) return null;
  for (const key of Object.keys(char)) char[key] = char[key] && char[key][1];
  let avatar = "";
  const avatarUrl = (json.imageUrl && json.imageUrl[1]) || char.avatar || "";
  if (avatarUrl) {
    try {
      avatar = await fetchImageAsDataUrl(avatarUrl, signal);
    } catch {}
  }
  return {
    name: char.name || "",
    tagline: (char.tags && char.tags.join(", ")) || "",
    description: char.description || "",
    personality: char.personality || "",
    appearance: char.appearance || "",
    scenario: char.scenario || "",
    first_mes: char.firstMessage || char.first_mes || "",
    mes_example: char.exampleDialogs || char.example_dialogue || "",
    avatar,
  };
}

function aiGenerateCharacter() {
  const wrap = UI.el("div", "");
  wrap.appendChild(UI.el("p", "modal-desc", "Describe the character you want  -  personality, looks, setting. The AI will draft their details for you to review and edit."));
  const ta = UI.el("textarea", "textarea");
  ta.placeholder = "e.g. A shy librarian witch in a sleepy seaside town who brews tea that shows people their future…";
  ta.style.minHeight = "90px";
  wrap.appendChild(ta);
  const status = UI.el("div", "hint");
  const row = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const gen = UI.el("button", "btn primary", UI.fa("wand-magic-sparkles") + " Generate");
  gen.addEventListener("click", async () => {
    if (!ensureProviderConfigured("generating a character with AI")) return;
    const idea = ta.value.trim();
    if (!idea) {
      UI.showToast("Describe the character first", { type: "err" });
      return;
    }
    gen.disabled = true;
    status.textContent = "Generating character…";
    try {
      const sys = 'You are a character creator. Return ONLY valid JSON with these fields: {"name": string, "tagline": string (short, 3-6 words), "description": string (detailed persona/backstory, markdown allowed), "personality": string (comma-separated traits), "attitude": string (one line on how the character acts toward the user, e.g. "Treats you like an old rival she plans to finally beat"), "appearance": string, "scenario": string, "first_mes": string (an opening message spoken by the character), "mes_example": string (one short example dialogue exchange)}. No markdown fences, no extra text outside the JSON.';
      const text = await Provider.complete([{ role: "user", content: "Create a roleplay character based on this idea: " + idea }], { system: sys, temperature: 1.0 });
      const cleaned = text.replace(/```json|```/g, "").trim();
      const data = JSON.parse(cleaned);
      overlay.remove();
      openCharacterEditor(data);
    } catch (e) {
      status.textContent = "Generation failed: " + e.message;
      gen.disabled = false;
    }
  });
  row.append(cancel, gen);
  wrap.appendChild(row);
  wrap.appendChild(status);
  const overlay = UI.openModal(wrap, { title: "AI generate character" });
}

/* ---------------- IMPORT / EXPORT ---------------- */
function needsConversion(rec) {
  return !!(
    rec &&
    rec.description &&
    (rec.description || "").trim().length > 200 &&
    !(rec.personality || "").trim() &&
    !(rec.appearance || "").trim() &&
    !(rec.scenario || "").trim() &&
    !(rec.mes_example || "").trim()
  );
}

async function aiConvertCharacter(rec, signal) {
  const sys = 'You are a character card parser. Given a raw character description, return ONLY valid JSON with these fields: {"name": string, "tagline": string, "description": string (condensed persona and backstory), "personality": string (comma-separated traits), "attitude": string (one line on how the character acts toward the user), "appearance": string, "scenario": string, "first_mes": string, "mes_example": string}. Preserve all facts from the input; do not invent new ones. No markdown fences, no extra text.';
  const text = await Provider.complete([{ role: "user", content: "Raw card:\n" + rec.description }], { system: sys, temperature: 0.3, signal });
  const cleaned = text.replace(/```json|```/g, "").trim();
  const fields = JSON.parse(cleaned);
  return Object.assign({}, rec, fields);
}

async function cancelConversion(id) {
  const ac = convertingJobs.get(id);
  if (ac) ac.abort();
  const c = characters.find((x) => x.id === id);
  if (c) {
    if (c.placeholder) {
      await pfrpDB.del("characters", id);
      UI.showToast("Import cancelled");
    } else {
      c.converting = false;
      await pfrpDB.put("characters", c);
      UI.showToast("Conversion cancelled, character unchanged");
    }
  }
  convertingJobs.delete(id);
  await loadData();
}

function promptConvertChoice(name) {
  return new Promise((resolve) => {
    const wrap = UI.el("div", "");
    const configured = isProviderConfigured();
    const hintText = configured
      ? ""
      : "<br><br><span class='hint' style='color:var(--warn);'><i class='fa-solid fa-triangle-exclamation'></i> AI provider is not configured. Configure an API key in Settings > Connection to use AI conversion, or import as-is.</span>";
    wrap.appendChild(UI.el("p", "modal-desc", "\"" + esc(name) + "\" has everything in a single description. Convert it to PFRP format? The AI reads the description and fills the structured fields (personality, appearance, scenario, first message, example dialogue). The original text stays in the description either way." + hintText));
    const applyAll = UI.el("label", "checkbox-row", "");
    const cb = UI.el("input", "");
    cb.type = "checkbox";
    applyAll.append(cb, UI.el("span", "", "Apply this choice to all remaining imports"));
    wrap.appendChild(applyAll);
    const actions = UI.el("div", "modal-actions");
    const convertBtn = UI.el("button", "btn primary", "Convert to PFRP");
    const asIs = UI.el("button", "btn", "Import As-is");
    const done = (v) => { overlay.remove(); resolve({ choice: v, applyAll: cb.checked }); };
    convertBtn.addEventListener("click", () => {
      if (!ensureProviderConfigured("converting character cards with AI")) return;
      done("convert");
    });
    asIs.addEventListener("click", () => done("asis"));
    actions.append(convertBtn, asIs);
    wrap.appendChild(actions);
    const overlay = UI.openModal(wrap, { title: "Import format" });
  });
}

async function importFiles(files) {
  const list = Array.from(files).filter((f) => /\.(png|json)$/i.test(f.name));
  if (!list.length) {
    UI.showToast("Drop a .png or .json character card", { type: "err" });
    return;
  }

  let ok = 0, fail = 0, skipped = 0;
  let firstError = "";
  let stickyChoice = null;
  for (const file of list) {
    try {
      const parsed = await Import.parseFile(file);
      for (const rec of parsed) {
        let targetRec = rec;
        let phId = null;
        if (needsConversion(rec)) {
          let choice = stickyChoice;
          if (!choice) {
            const res = await promptConvertChoice(rec.name || "Unnamed");
            choice = res.choice;
            if (res.applyAll) stickyChoice = choice;
          }
          if (choice === "convert") {
            const baseName = rec.name || "Unnamed";
            let phName = baseName;
            let tries = 0;
            while (characters.some((c) => c.name === phName)) {
              tries++;
              phName = baseName + " (converting" + (tries > 1 ? " " + tries : "") + ")";
            }
            phId = await pfrpDB.add("characters", {
              name: phName,
              tagline: "Converting card with AI...",
              converting: true,
              placeholder: true,
              explicitness: pfrpSettings.data.nsfw.chatDefault,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            await loadData();
            const ac = new AbortController();
            convertingJobs.set(phId, ac);
            try {
              targetRec = await aiConvertCharacter(rec, ac.signal);
            } catch (e) {
              if (ac.signal.aborted) {
                if (convertingJobs.has(phId)) {
                  await pfrpDB.del("characters", phId);
                  convertingJobs.delete(phId);
                  await loadData();
                }
                skipped++;
                continue;
              }
              console.error("AI conversion failed for", rec.name, e);
              UI.showToast("AI conversion failed, importing as-is: " + (e && e.message ? e.message : e), { type: "err" });
              targetRec = rec;
            }
            convertingJobs.delete(phId);
          }
        }
        const record = Object.assign({}, targetRec, {
          name: targetRec.name || "Unnamed",
          explicitness: rec.explicitness || pfrpSettings.data.nsfw.chatDefault,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        delete record.created;
        delete record.temperature;
        delete record.converting;
        delete record.placeholder;
        delete record.id;
        if (phId) {
          record.id = phId;
          await pfrpDB.put("characters", record);
          ok++;
          await loadData();
          continue;
        }
        await pfrpDB.add("characters", record);
        ok++;
      }
    } catch (e) {
      fail++;
      if (!firstError) firstError = e && e.message ? e.message : String(e);
      console.error("Import failed for", file.name, e);
    }
  }
  await loadData();
  if (ok) UI.showToast("Imported " + ok + " character" + (ok > 1 ? "s" : ""));
  if (skipped) UI.showToast(skipped + " skipped");
  if (fail) UI.showToast(fail + " file" + (fail > 1 ? "s" : "") + " failed to import" + (firstError ? ": " + firstError : ""), { type: "err" });
}

async function importFromPicker() {
  const files = els.importInput.files;
  if (files && files.length) await importFiles(files);
  els.importInput.value = "";
}

async function exportCharacter(c) {
  const wrap = UI.el("div", "");
  const name = Export.safeName(c.name);

  wrap.appendChild(UI.el("p", "modal-desc", "Export " + esc(c.name) + " as a compatible character card."));

  const pngChoice = choiceCard("image", "PNG card", "Character Card · SillyTavern · TavernAI · Agnai · Perchance ACC", () => {
    overlay.remove();
    doExportPng(c, name);
  });
  const jsonChoice = choiceCard("file-code", "Character Card (JSON)", "SillyTavern / TavernAI / Perchance ACC", () => {
    overlay.remove();
    doExportJson(c, name);
  });
  const agnaiChoice = choiceCard("file-code", "Agnaistic (JSON)", "Agnai.com import", () => {
    overlay.remove();
    doExportAgnaistic(c, name);
  });
  wrap.append(pngChoice, jsonChoice, agnaiChoice);
  const overlay = UI.openModal(wrap, { title: "Export " + esc(c.name) });
}

async function doExportPng(c, name) {
  try {
    const blob = await Export.toPngCard(c);
    Export.download(blob, name + ".png");
    UI.showToast("Exported " + name + ".png");
  } catch (e) {
    UI.showToast("Export failed: " + e.message, { type: "err" });
  }
}

function doExportJson(c, name) {
  Export.download(new Blob([Export.toCharaCardJson(c)], { type: "application/json" }), name + ".json");
  UI.showToast("Exported " + name + ".json");
}

function doExportAgnaistic(c, name) {
  const a = {
    kind: "character",
    name: c.name || "",
    description: c.description || "",
    personality: c.personality || "",
    appearance: c.appearance || "",
    scenario: c.scenario || "",
    greeting: c.first_mes || "",
    sampleChat: c.mes_example || "",
    systemPrompt: c.system_prompt || "",
    postHistoryInstructions: c.post_history_instructions || "",
    alternateGreetings: c.alternate_greetings || [],
    tags: c.tags || [],
    creator: c.creator || "",
    characterVersion: c.character_version || "",
    persona: { kind: "text", attributes: { text: [c.personality || ""] } },
    visualType: "avatar",
    insert: { prompt: "", depth: 3 },
  };
  if (c.avatar && c.avatar.startsWith("data:")) a.avatar = { base64: c.avatar };
  Export.download(new Blob([JSON.stringify(a, null, 2)], { type: "application/json" }), name + ".json");
  UI.showToast("Exported " + name + ".json (Agnaistic)");
}

function setupImportDrop() {
  let dragCount = 0;
  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCount++;
    els.dropOverlay.classList.add("show");
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCount = Math.max(0, dragCount - 1);
    if (dragCount === 0) els.dropOverlay.classList.remove("show");
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCount = 0;
    els.dropOverlay.classList.remove("show");
    if (e.dataTransfer && e.dataTransfer.files) importFiles(e.dataTransfer.files);
  });

  els.importBtn.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", importFromPicker);
}

/* ---------------- THREADS / CHAT ---------------- */
async function loadData() {
  characters = await pfrpDB.getAll("characters");
  threads = await pfrpDB.getAll("threads");
  loreEntries = await pfrpDB.getAll("lore");
  imageRecords = await pfrpDB.getAll("images");
  scenes = await pfrpDB.getAll("scenes");
  for (const t of threads) {
    const c = characters.find((x) => x.id === t.characterId);
    t.character = c;
    t.memberNames = (t.characterIds || []).map((id) => (characters.find((x) => x.id === id) || {}).name || "?");
    if (!t.memberNames.length && c) t.memberNames = [c.name];
    if (!t.avatar && t.sceneId) {
      const sc = scenes.find((x) => x.id === t.sceneId);
      if (sc && sc.avatar) t.avatar = sc.avatar;
    }
  }
  els.charDot.classList.toggle("hidden", characters.length === 0);
  DRAWERS[activeDrawer] && DRAWERS[activeDrawer].build();
}

async function createChatWithCharacter(characterId, personaId) {
  const c = characters.find((x) => x.id === characterId);
  const thread = {
    name: "Chat with " + c.name,
    characterId,
    characterIds: [characterId],
    isGroup: false,
    sceneMode: !!pfrpSettings.data.sceneModeDefault,
    suggestedActions: !!pfrpSettings.data.suggestedActionsDefault,
    userPersonaId: personaId || pfrpSettings.data.activePersonaId,
    explicitness: pfrpSettings.data.nsfw.chatDefault,
    temperature: pfrpSettings.data.temperature,
    modelName: pfrpSettings.activeConnection().model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastMessageTime: Date.now(),
  };
  const id = await pfrpDB.add("threads", thread);
  await loadData();
  await openThread(id);
  return id;
}

async function startChatWithCharacter(characterId, personaId) {
  const c = characters.find((x) => x.id === characterId);
  const persona = (personaId && (pfrpSettings.data.personas || []).find((p) => p.id === personaId)) || pfrpSettings.activePersona();
  if (c && c.first_mes) {
    const id = await createChatWithCharacter(characterId, personaId);
    const t = threads.find((x) => x.id === id);
    const text = applyTemplateVars(c.first_mes, c, persona);
    const blocks = parseSceneBlocks(text, t);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const msg = {
        threadId: id,
        characterId: b.characterId || null,
        role: "assistant",
        name: b.narrator ? "Narrator" : b.name,
        content: b.content,
        creationTime: Date.now(),
        order: i,
      };
      const mid = await pfrpDB.add("messages", msg);
      msg.id = mid;
      activeMessages.push(msg);
    }
    await openThread(id);
    UI.showToast("Chat started");
  } else {
    await createChatWithCharacter(characterId, personaId);
    UI.showToast("Chat started");
  }
}

function personaPickerRow() {
  return personaSelectControl(
    () => pfrpSettings.data.activePersonaId,
    (id) => {
      pfrpSettings.data.activePersonaId = id;
      pfrpSettings.save();
    },
    { label: "Who are you?", hintText: "This persona is shared with the characters so they know who you are." }
  );
}

function startChatChooser(c) {
  const wrap = UI.el("div", "");
  wrap.appendChild(personaPickerRow());
  wrap.appendChild(UI.el("div", "spacer-h", ""));
  wrap.appendChild(choiceCard("comment", "Individual Chat", "Chat with " + esc(c.name), () => {
    overlay.remove();
    sceneChooserModal([c.id], pfrpSettings.data.activePersonaId, false);
  }));
  wrap.appendChild(choiceCard("user-group", "Group chat", "Chat with " + esc(c.name) + " and others you pick", () => {
    overlay.remove();
    startGroupChat(c.id);
  }));
  const overlay = UI.openModal(wrap, { title: "Start a chat with " + esc(c.name) });
}

function startGroupChat(primaryId) {
  const primary = primaryId ? characters.find((x) => x.id === primaryId) : null;
  const others = primaryId ? characters.filter((x) => x.id !== primaryId) : characters.slice();
  const selected = new Set(primaryId ? [primaryId] : []);
  const wrap = UI.el("div", "");
  wrap.appendChild(personaPickerRow());
  wrap.appendChild(UI.el("div", "spacer-h", ""));
  wrap.appendChild(UI.el("p", "modal-desc", primary ? "Choose additional characters for the group. " + esc(primary.name) + " is included." : "Select the characters to include in the group."));

  const search = UI.el("input", "input");
  search.type = "text";
  search.placeholder = "Search characters…";
  search.addEventListener("input", () => renderGroupList());
  wrap.appendChild(search);
  const list = UI.el("div", "group-pick");

  const renderGroupList = () => {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = "";
    const candidates = primary
      ? [primary, ...others.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.tagline || "").toLowerCase().includes(q))]
      : others.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.tagline || "").toLowerCase().includes(q));
    for (const c of candidates) {
      const b = UI.el("button", "choice group-choice" + (selected.has(c.id) ? " sel" : ""));
      b.innerHTML = `${avatarHtml(c)}<div><b>${esc(c.name)}</b><span>${esc(c.tagline || c.description || "")}</span></div>`;
      b.style.alignItems = "center";
      b.style.gap = "12px";
      b.addEventListener("click", () => {
        if (selected.has(c.id)) {
          selected.delete(c.id);
          b.classList.remove("sel");
        } else {
          selected.add(c.id);
          b.classList.add("sel");
        }
        create.disabled = selected.size === 0;
      });
      list.appendChild(b);
    }
  };
  renderGroupList();
  wrap.appendChild(list);

  const row = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const create = UI.el("button", "btn primary", UI.fa("user-group") + " Create group chat");
  create.disabled = selected.size === 0;
  create.addEventListener("click", () => {
    overlay.remove();
    sceneChooserModal([...selected], pfrpSettings.data.activePersonaId, true);
  });
  row.append(cancel, create);
  wrap.appendChild(row);

  const overlay = UI.openModal(wrap, { title: "New group chat", wide: true });
}

function newChatChooser() {
  const wrap = UI.el("div", "");
  wrap.appendChild(choiceCard("comment", "Individual Chat", "Chat with one character", () => {
    overlay.remove();
    pickCharacterForChat();
  }));
  wrap.appendChild(choiceCard("user-group", "Group chat", "Chat with multiple characters", () => {
    overlay.remove();
    startGroupChat(null);
  }));
  const overlay = UI.openModal(wrap, { title: "Start a new chat" });
}

async function createGroupThread(characterIds, personaId) {
  const chars = characterIds.map((id) => characters.find((c) => c.id === id)).filter(Boolean);
  if (!chars.length) return;
  const names = chars.map((c) => c.name);
  const thread = {
    name: names.join(", "),
    characterId: characterIds[0],
    characterIds,
    isGroup: true,
    autoRespond: true,
    multiTurn: true,
    sceneMode: !!pfrpSettings.data.sceneModeDefault,
    suggestedActions: !!pfrpSettings.data.suggestedActionsDefault,
    lastSpeakerId: characterIds[0],
    userPersonaId: personaId || pfrpSettings.data.activePersonaId,
    explicitness: pfrpSettings.data.nsfw.chatDefault,
    temperature: pfrpSettings.data.temperature,
    modelName: pfrpSettings.activeConnection().model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastMessageTime: Date.now(),
  };
  const id = await pfrpDB.add("threads", thread);
  await loadData();
  await openThread(id);
  UI.showToast("Group chat started");
  return id;
}

function pickCharacterForChat() {
  const wrap = UI.el("div", "");
  if (!characters.length) {
    wrap.appendChild(UI.el("p", "modal-desc", "No characters yet. Create a character first."));
    const b = UI.el("button", "btn primary", UI.fa("plus") + " Create character");
    b.addEventListener("click", () => { overlay.remove(); openCharacterEditor(); });
    wrap.appendChild(b);
    const overlay = UI.openModal(wrap, { title: "New chat" });
    return;
  }

  wrap.appendChild(personaPickerRow());
  wrap.appendChild(UI.el("div", "spacer-h", ""));

  const toolbar = UI.el("div", "picker-toolbar");
  const search = UI.el("input", "input");
  search.type = "text";
  search.placeholder = "Search characters…";
  const sortSel = UI.el("select", "select");
  const sortOpts = [["updated", "Last modified"], ["name", "Name A-Z"]];
  for (const [v, l] of sortOpts) {
    const o = UI.el("option", "", l);
    o.value = v;
    sortSel.appendChild(o);
  }
  sortSel.value = "updated";
  toolbar.append(search, sortSel);
  wrap.appendChild(toolbar);

  const folders = [...new Set(characters.map((c) => c.folderPath || "").filter(Boolean))];
  let folderFilter = "";
  const folderRow = UI.el("div", "folders");
  const makeFchip = (label, value) => {
    const chip = UI.el("button", "fchip" + (folderFilter === value ? " active" : ""), (value ? UI.fa("folder") + " " : "") + esc(label));
    chip.addEventListener("click", () => {
      folderFilter = value;
      folderRow.querySelectorAll(".fchip").forEach((x) => x.classList.remove("active"));
      chip.classList.add("active");
      renderList();
    });
    folderRow.appendChild(chip);
  };
  makeFchip("All", "");
  for (const f of folders) makeFchip(f, f);
  wrap.appendChild(folderRow);

  const list = UI.el("div", "picker-list");

  function renderList() {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = "";
    let items = characters.filter((c) => (folderFilter ? (c.folderPath || "") === folderFilter : true));
    if (sortSel.value === "name") items = items.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else items = items.slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    for (const c of items) {
      if (q && !(c.name || "").toLowerCase().includes(q) && !(c.tagline || "").toLowerCase().includes(q)) continue;
      const b = UI.el("button", "choice");
      b.innerHTML = `${avatarHtml(c)}<div><b>${esc(c.name)}</b><span>${esc(c.tagline || "Start an individual chat")}</span></div>`;
      b.style.alignItems = "center";
      b.style.gap = "12px";
      b.addEventListener("click", () => {
        overlay.remove();
        startChatWithCharacter(c.id, pfrpSettings.data.activePersonaId);
      });
      list.appendChild(b);
    }
    if (!list.children.length) list.appendChild(UI.el("div", "hint", "No characters match."));
  }
  renderList();
  search.addEventListener("input", renderList);
  sortSel.addEventListener("change", renderList);
  wrap.appendChild(list);

  const overlay = UI.openModal(wrap, { title: "Start a new chat", wide: true });
}

async function openThread(id, silent = false) {
  const t = threads.find((x) => x.id === id);
  if (!t) return;
  activeThread = t;
  activeCharacter = null;
  contextChar = null;
  closeCtxPanelVisual();
  const all = await pfrpDB.byIndex("messages", "threadId", id);
  activeMessages = all.sort((a, b) => a.order - b.order);
  const live = streams.get(id);
  if (live && live.placeholder && !activeMessages.includes(live.placeholder)) {
    activeMessages.push(live.placeholder);
  }
  pfrpSettings.data.ui.lastOpen = pfrpSettings.data.ui.lastOpen || {};
  pfrpSettings.data.ui.lastOpen.chats = id;
  pfrpSettings.save();
  renderThreadUI();
  renderAllMessages();
  updateComposerState();
  if (!silent) {
    els.dSearch.value = "";
    renderChatsDrawer();
    setDrawer("chats");
  } else {
    renderChatsDrawer();
  }
}

function renderCenter() {
  if (activeThread) {
    renderThreadUI();
    renderAllMessages();
    updateComposerState();
    return;
  }
  if (activeCharacter) {
    renderCharacterView(activeCharacter);
    updateComposerState();
    return;
  }
  if (activeScene) {
    renderSceneView(activeScene);
    updateComposerState();
    return;
  }
  renderEmptySelection();
  updateComposerState();
}

function closeThread() {
  activeThread = null;
  activeMessages = [];
  renderCenter();
}

const EMPTY_MESSAGES = {
  chats: {
    sub: "Select a chat",
    body: "Select a chat from the list, or create a new one.",
  },
  chars: {
    sub: "Select a character",
    body: "Select a character from the list to view its details, or create/import one.",
  },
  images: {
    sub: "Images",
    body: "Image generation and the media gallery are coming soon.",
  },
  lore: {
    sub: "Lore",
    body: "Lore books and memories are coming soon.",
  },
  account: {
    sub: "Account",
    body: "Account and user persona settings are coming soon.",
  },
};

function renderEmptySelection(key = "") {
  els.chatAvatar.innerHTML = '<i class="fa-solid fa-masks-theater"></i>';
  els.chatAvatar.style.background = "linear-gradient(135deg,var(--accent1),var(--accent2))";
  const m = EMPTY_MESSAGES[key] || EMPTY_MESSAGES.chats;
  els.chatName.textContent = "Purple's RP";
  els.chatSub.textContent = m.sub;
  els.msgsInner.innerHTML = "";
  const empty = UI.el("div", "empty");
  empty.innerHTML = "<p>" + m.body + "</p>";
  els.msgsInner.appendChild(empty);
}

function viewCharacter(id) {
  const c = characters.find((x) => x.id === id);
  if (!c) return;
  if (c.converting) {
    UI.showToast("This character is being converted. Cancel or wait for it to finish.", { type: "err" });
    return;
  }
  activeCharacter = c;
  activeThread = null;
  activeMessages = [];
  contextChar = null;
  closeCtxPanelVisual();
  setDrawerOpen(true);
  pfrpSettings.data.ui.lastOpen = pfrpSettings.data.ui.lastOpen || {};
  pfrpSettings.data.ui.lastOpen.chars = id;
  pfrpSettings.save();
  renderCenter();
  els.dList.querySelectorAll(".d-item[data-char]").forEach((el) => {
    el.classList.toggle("active", parseInt(el.dataset.char) === id);
  });
  renderContext();
}

function renderCharacterView(c) {
  els.chatName.textContent = c.name;
  els.chatSub.textContent = c.tagline || "Character";
  els.chatAvatar.innerHTML = c.avatar && c.avatar.startsWith("data:") ? `<img src="${c.avatar}" alt="">` : (c.name ? c.name[0].toUpperCase() : "+");
  els.chatAvatar.style.background = "linear-gradient(135deg,var(--accent1),var(--accent2))";
  els.msgsInner.innerHTML = "";

  const view = UI.el("div", "char-view");
  view.appendChild(UI.el("div", "char-view-av", c.avatar && c.avatar.startsWith("data:") ? `<img src="${c.avatar}" alt="">` : (c.name ? c.name[0].toUpperCase() : "+")));

  const h = UI.el("h2", "char-view-name", esc(c.name));
  view.appendChild(h);
  if (c.tagline) view.appendChild(UI.el("p", "char-view-tag", esc(c.tagline)));
  view.appendChild(UI.el("div", "tags", (c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")));

  const expl = UI.el("span", "tag expl-badge", "Explicitness: " + pfrpSettings.explicitnessLabel(c.explicitness || pfrpSettings.data.nsfw.chatDefault));
  view.appendChild(expl);

  const actions = UI.el("div", "char-view-actions");
  const start = UI.el("button", "btn primary", UI.fa("comment") + " Start chat");
  start.addEventListener("click", () => startChatChooser(c));
  const edit = UI.el("button", "btn", UI.fa("pen") + " Edit");
  edit.addEventListener("click", () => openCharacterEditor(c));
  const exp = UI.el("button", "btn", UI.fa("file-arrow-up") + " Export");
  exp.addEventListener("click", () => exportCharacter(c));
  actions.append(start, edit, exp);
  view.appendChild(actions);

  if (c.photos && c.photos.length) {
    const photoWrap = UI.el("div", "char-view-photos");
    const toggle = UI.el("button", "btn ghost small", `${UI.fa("images")} Photos (${c.photos.length})`);
    toggle.addEventListener("click", () => {
      const open = photoWrap.classList.toggle("open");
      toggle.innerHTML = (open ? UI.fa("angle-up") : UI.fa("images")) + ` Photos (${c.photos.length})`;
    });
    const row = UI.el("div", "char-photos");
    for (const p of c.photos) {
      const img = UI.el("img", "");
      img.src = (typeof p === "string" ? p : p.url) || "";
      img.loading = "lazy";
      img.addEventListener("click", () => openPhotoModal(c, p));
      row.appendChild(img);
    }
    photoWrap.append(toggle, row);
    view.appendChild(photoWrap);
  }

  const persona = threadPersona(activeThread) || pfrpSettings.activePersona();
  const r = (txt) => {
    const charName = c ? (c.name || "") : "";
    return String(txt || "").split("{{char}}").join(charName);
  };
  const sections = [
    { title: "Description", icon: "align-left", text: r(c.description) },
    { title: "Personality", icon: "person", text: r(c.personality) },
    { title: "How they treat you", icon: "hand", text: r(c.attitude) },
    { title: "Appearance", icon: "eye", text: r(c.appearance) },
    { title: "Scenario", icon: "map", text: r(c.scenario) },
    { title: "First message", icon: "comment-dots", text: r(c.first_mes) },
    { title: "Example dialogue", icon: "message", text: r(c.mes_example) },
  ];
  const body = UI.el("div", "char-view-body");
  for (const s of sections) {
    if (!s.text) continue;
    const card = UI.el("div", "char-view-sec");
    card.appendChild(UI.el("h3", "", `${UI.fa(s.icon)} ${s.title}`));
    card.appendChild(UI.el("div", "char-view-sec-body", renderMarkdown(s.text).split("{{user}}").join('<span class="tpl-token">{{user}}</span>')));
    body.appendChild(card);
  }
  view.appendChild(body);

  els.msgsInner.appendChild(view);
  els.msgs.scrollTop = 0;
}

function renderThreadUI() {
  const t = activeThread;
  const c = t.character;
  els.chatName.textContent = t.name;
  els.chatSub.textContent = (t.isGroup ? t.memberNames.join(", ") : (c ? c.name : "?")) + " · " + (t.isGroup ? "group" : "Individual");
  const chatImg = threadAvatarDataUrl(t);
  els.chatAvatar.innerHTML = chatImg ? `<img src="${chatImg}" alt="">` : (c ? c.name[0].toUpperCase() : "+");
  els.chatAvatar.style.background = "linear-gradient(135deg,var(--accent1),var(--accent2))";
  renderSpeakerRow();
  renderSuggestedActions();
}

function renderSpeakerRow() {
  const t = activeThread;
  const row = els.speakerRow;
  if (!row) return;
  row.innerHTML = "";
  const show = !!t;
  row.classList.toggle("hidden", !show);
  if (!show) return;
  const members = (t.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter(Boolean);

  if (t.isGroup) {
    const auto = UI.el("button", "speaker-chip" + (!t.pendingSpeaker && t.autoRespond !== false ? " sel" : ""));
    auto.innerHTML = UI.fa("wand-magic-sparkles") + "<span>Auto</span>";
    auto.title = "Let the AI pick who responds";
    auto.addEventListener("click", () => {
      t.pendingSpeaker = null;
      pfrpDB.put("threads", t);
      renderSpeakerRow();
    });
    row.appendChild(auto);
  }

  for (const c of members) {
    const chip = UI.el("button", "speaker-chip" + (t.pendingSpeaker === c.id ? " sel" : ""));
    chip.innerHTML = avatarHtml(c) + "<span>" + esc(c.name) + "</span>";
    chip.title = "Ask " + c.name + " to respond";
    chip.addEventListener("click", () => {
      t.pendingSpeaker = t.pendingSpeaker === c.id ? null : c.id;
      pfrpDB.put("threads", t);
      renderSpeakerRow();
    });
    row.appendChild(chip);
  }

  const narrator = UI.el("button", "speaker-chip narrator" + (t.pendingSpeaker === "narrator" ? " sel" : ""));
  narrator.innerHTML = UI.fa("book-open") + "<span>Narrator</span>";
  narrator.title = "Narrate the scene or describe the world";
  narrator.addEventListener("click", () => {
    t.pendingSpeaker = t.pendingSpeaker === "narrator" ? null : "narrator";
    pfrpDB.put("threads", t);
    renderSpeakerRow();
  });
  row.appendChild(narrator);
  updateInputPlaceholder();
}

function renderAllMessages() {
  els.msgsInner.innerHTML = "";
  if (!activeMessages.length) {
    els.msgsInner.appendChild(els.emptyState);
    return;
  }
  for (const m of activeMessages) {
    els.msgsInner.appendChild(renderMessage(m));
  }
  scrollToBottom();
}

function scrollToBottom() {
  els.msgs.scrollTop = els.msgs.scrollHeight;
}

function roleLabel(m) {
  if (m.role === "user") {
    const persona = threadPersona(activeThread) || pfrpSettings.activePersona();
    return (persona && persona.name) || pfrpSettings.data.user.name || "You";
  }
  if (m.name) return m.name;
  if (m.role === "system") return "System";
  return "Assistant";
}

function consecutiveAssistantAfter(m) {
  if (!m || m.role !== "user") return [];
  const idx = activeMessages.indexOf(m);
  if (idx < 0) return [];
  const out = [];
  for (let i = idx + 1; i < activeMessages.length; i++) {
    const n = activeMessages[i];
    if (n.role === "user") break;
    if (n.role === "assistant") out.push(n);
  }
  return out;
}

function renderMessage(m) {
  const isScene = !!(m.blocks && m.blocks.length);
  let c = characters.find((x) => x.id === m.characterId);
  if (isScene && !c) {
    const firstChar = m.blocks.find((b) => b.characterId);
    c = firstChar ? characters.find((x) => x.id === firstChar.characterId) : null;
  }
  const clickable = m.role !== "user" && c;
  const isNarratorMsg = m.narrator === true || (m.narrator == null && (m.name === "Narrator" || (m.characterId == null && !c && m.role === "assistant")));
  const row = UI.el("div", "msg " + (m.role === "user" ? "user" : "") + (isNarratorMsg ? " narrator" : ""));
  if (m._loading) {
    const bubble = UI.el("div", "bubble streaming");
    const body = UI.el("div", "body");
    body.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    bubble.appendChild(body);
    row.appendChild(bubble);
    return row;
  }
  if (m.role === "user") {
    const userAv = UI.el("div", "");
    userAv.innerHTML = userAvatarHtml();
    row.appendChild(userAv);
  } else if (isNarratorMsg) {
    const navAv = UI.el("div", "av av-narrator");
    navAv.innerHTML = UI.fa("feather");
    row.appendChild(navAv);
  } else {
    const avWrap = UI.el("div", "");
    avWrap.innerHTML = avatarHtml(c || (m.name ? { name: m.name } : null), "");
    if (clickable) {
      avWrap.classList.add("av-click");
      avWrap.addEventListener("click", () => setContextChar(c.id));
    }
    row.appendChild(avWrap);
  }
  const bubble = UI.el("div", (isNarratorMsg ? "narration" : "bubble") + (m.isStreaming && !isNarratorMsg ? " streaming" : ""));
  const who = isNarratorMsg ? null : UI.el("span", "who" + (clickable ? " who-click" : ""), roleLabel(m));
  if (who && isScene) who.style.display = "none";
  if (who && clickable) who.addEventListener("click", () => setContextChar(c.id));
  const body = UI.el("div", "body");
  if (isScene) {
    if (m.isStreaming && !m.content) {
      body.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    } else {
      body.innerHTML = sceneBlocksHtml(m.blocks);
    }
  } else if (m.image) {
    const imgEl = UI.el("img", "msg-img");
    imgEl.src = m.image;
    body.appendChild(imgEl);
    if (m.content && m.content !== "Image") body.appendChild(UI.el("div", "msg-img-cap", formatText(m.content)));
  } else if (m.isStreaming && !m.content) {
    body.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  } else {
    body.innerHTML = formatText(m.content);
    applyDefaultColor(body);
  }

  if (!m.isStreaming) {
    body.addEventListener("dblclick", () => inlineEdit(m, body));
  }
  if (who) bubble.append(who, body);
  else bubble.appendChild(body);
  row.appendChild(bubble);

  const actions = UI.el("div", "msg-actions");
  if (!m.isStreaming) {
    const regen = UI.el("button", "iconbtn warn", UI.fa("rotate-right"));
    regen.title = "Regenerate";
    regen.addEventListener("click", () => regenerate(m));
    const edit = UI.el("button", "iconbtn", UI.fa("pen"));
    edit.title = "Edit";
    edit.addEventListener("click", () => editMessage(m));
    const del = UI.el("button", "iconbtn", UI.fa("trash"));
    del.title = "Delete message";
    del.addEventListener("click", async () => {
      const related = consecutiveAssistantAfter(m);
      let alsoDelete = related.length > 0;
      let extra = null;
      if (related.length) {
        const wrap = UI.el("div", "checkbox-row");
        const cb = UI.el("input", "");
        cb.type = "checkbox";
        cb.checked = true;
        cb.addEventListener("change", () => { alsoDelete = cb.checked; });
        wrap.append(cb, UI.el("span", "", `Also delete the ${related.length} generated response${related.length === 1 ? "" : "s"}`));
        extra = wrap;
      }
      const ok = await UI.confirmModal({ title: "Delete message?", message: "This message will be permanently removed from the chat.", confirmText: "Delete", extra });
      if (!ok) return;
      const remove = new Set(related);
      remove.add(m);
      for (const x of remove) if (x.id) await pfrpDB.del("messages", x.id);
      activeMessages = activeMessages.filter((x) => !remove.has(x));
      renderAllMessages();
      UI.showToast("Message deleted");
    });
    actions.append(regen, edit, del);
    if (m.variants && m.variants.length) {
      const gen = generationInfo(m);
      if (gen.total > 1) {
        const nav = UI.el("span", "gen-nav");
        const older = UI.el("button", "gen-arrow", UI.fa("angle-left"));
        older.title = "Previous generation";
        older.disabled = gen.pos <= 0;
        older.addEventListener("click", () => switchGeneration(m, -1));
        const newer = UI.el("button", "gen-arrow", UI.fa("angle-right"));
        newer.title = "Next generation";
        newer.disabled = gen.pos >= gen.total - 1;
        newer.addEventListener("click", () => switchGeneration(m, 1));
        const label = UI.el("span", "gen-count", (gen.pos + 1) + "/" + gen.total);
        nav.append(older, label, newer);
        actions.appendChild(nav);
      }
    }
  }
  bubble.appendChild(actions);
  return row;
}

function formatText(text) {
  const f = pfrpSettings.data.formatting;
  const a = f.actionsChar || "", q = f.quotesChar || "", t = f.thoughtsChar || "";
  if ((f.actions && a.length > 1) || (f.quotes && q.length > 1) || (f.thoughts && t.length > 1)) {
    let out = esc(text);
    const ae = esc(a), qe = esc(q), te = esc(t);
    const ac = f.actionsColor, qc = f.quotesColor, tc = f.thoughtsColor;
    if (f.actions && a) out = out.replace(new RegExp(escapeRe(ae) + "([^*" + escapeRe(ae) + "]+)" + escapeRe(ae), "g"), `<span class="fmt-act" style="color:${ac}">$1</span>`);
    if (f.quotes && q) out = out.replace(new RegExp(escapeRe(qe) + "([^\\n" + escapeRe(qe) + "]+)" + escapeRe(qe), "g"), `<span class="fmt-q" style="color:${qc}">$1</span>`);
    if (f.thoughts && t) out = out.replace(new RegExp(escapeRe(te) + "([^`\\n" + escapeRe(te) + "]+)" + escapeRe(te), "g"), `<span class="fmt-th" style="color:${tc}">$1</span>`);
    return out;
  }
  return renderMarkdown(text);
}

function renderMarkdown(text) {
  const lines = text.split("\n");
  const html = [];
  let code = null, para = [], list = null;
  const flushPara = () => {
    if (para.length) {
      html.push(`<div class="md-p">${para.map(mdInline).join("<br>")}</div>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      html.push(`<${list.type}>${list.items.map((li) => `<li>${mdInline(li)}</li>`).join("")}</${list.type}>`);
      list = null;
    }
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (code === null) {
        flushPara();
        flushList();
        code = [];
      } else {
        html.push(`<pre class="md-code"><code>${esc(code.join("\n"))}</code></pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      html.push(`<h${h[1].length} class="md-h">${mdInline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushPara();
      flushList();
      html.push(`<hr class="md-hr">`);
      continue;
    }
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      flushPara();
      flushList();
      html.push(`<blockquote class="md-q">${mdInline(q[1])}</blockquote>`);
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    para.push(line);
  }
  flushPara();
  flushList();
  if (code !== null) html.push(`<pre class="md-code"><code>${esc(code.join("\n"))}</code></pre>`);
  return html.join("");
}

function mdInline(s) {
  const f = pfrpSettings.data.formatting;
  const a = f.actionsChar || "*", q = f.quotesChar || '"', t = f.thoughtsChar || "`";
  const ac = f.actionsColor, qc = f.quotesColor, tc = f.thoughtsColor;
  let out = "", i = 0;
  const n = s.length;
  const span = (cls, style, content) => `<span class="${cls}"${style ? ` style="${style}"` : ""}>${esc(content)}</span>`;
  while (i < n) {
    const ch = s[i];
    if (ch === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i) {
        out += span("fmt-th", f.thoughts ? `color:${tc}` : "", s.slice(i + 1, end));
        i = end + 1;
        continue;
      }
    }
    if (s.startsWith("***", i)) {
      const end = s.indexOf("***", i + 3);
      if (end > i) {
        out += `<strong><em>${esc(s.slice(i + 3, end))}</em></strong>`;
        i = end + 3;
        continue;
      }
    }
    if (s.startsWith("**", i)) {
      const end = s.indexOf("**", i + 2);
      if (end > i) {
        out += `<strong>${esc(s.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }
    if (s.startsWith("~~", i)) {
      const end = s.indexOf("~~", i + 2);
      if (end > i) {
        out += `<s>${esc(s.slice(i + 2, end))}</s>`;
        i = end + 2;
        continue;
      }
    }
    if (f.actions && a.length === 1 && ch === a) {
      const end = s.indexOf(a, i + 1);
      if (end > i + 1) {
        out += span("fmt-act", `color:${ac}`, s.slice(i + 1, end));
        i = end + 1;
        continue;
      }
    }
    if (f.quotes && q.length === 1 && (ch === q || (q === '"' && (ch === "\u201c" || ch === "\u201d")) || (q === "'" && (ch === "\u2018" || ch === "\u2019")))) {
      let end = -1;
      const variants = q === '"' ? ['"', "\u201c", "\u201d"] : ["'", "\u2018", "\u2019"];
      for (const v of variants) {
        const vEnd = s.indexOf(v, i + 1);
        if (vEnd > i && (end < 0 || vEnd < end)) end = vEnd;
      }
      if (end > i + 1) {
        out += span("fmt-q", `color:${qc}`, s.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    if (ch === "*" && !(f.actions && a === "*")) {
      const end = s.indexOf("*", i + 1);
      if (end > i + 1) {
        out += `<em>${esc(s.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const m = s.slice(i).match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
      if (m && /^https?:\/\//i.test(m[2])) {
        out += `<a href="${esc(m[2])}" target="_blank" rel="noopener">${esc(m[1])}</a>`;
        i += m[0].length;
        continue;
      }
    }
    out += esc(ch);
    i++;
  }
  return out;
}

function applyDefaultColor(el) {
  const f = pfrpSettings.data.formatting;
  if (f.default && f.defaultColor) {
    el.style.color = f.defaultColor;
  } else {
    el.style.color = "";
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- SEND / STREAM ---------------- */
function formattingConventions() {
  const f = pfrpSettings.data.formatting || {};
  const lines = [];
  if (f.actions && f.actionsChar) {
    lines.push(`Enclose actions, body language, and narration in ${f.actionsChar}asterisks${f.actionsChar}  -  for example: ${f.actionsChar}she smiles and steps closer${f.actionsChar}. They may also be used sparingly for emphasis, but never wrap them around names or ordinary words.`);
  }
  if (f.quotes && f.quotesChar) {
    lines.push(`Wrap spoken dialogue in ${f.quotesChar}quotation marks${f.quotesChar}  -  for example: ${f.quotesChar}I've missed you${f.quotesChar}.`);
  }
  if (f.thoughts && f.thoughtsChar) {
    lines.push(`Wrap inner thoughts in ${f.thoughtsChar}backticks${f.thoughtsChar}  -  for example: ${f.thoughtsChar}Something feels off tonight${f.thoughtsChar}.`);
  }
  if (f.spacing) {
    lines.push("Paragraph formatting: write with clean spacing  -  each action block, each line of spoken dialogue, and each inner thought on its own paragraph, separated by blank lines.");
  } else {
    lines.push("Paragraph formatting: run-on prose is fine  -  actions and dialogue can flow together in the same paragraph.");
  }
  if (!lines.length) return "";
  return "Formatting conventions (always follow these):\n" + lines.join("\n");
}

function ensureTracker(t) {
  if (!t.tracker) t.tracker = {};
  if (!t.tracker.env) t.tracker.env = {};
  if (!t.tracker.chars) t.tracker.chars = {};
  if (!t.tracker.enabled) t.tracker.enabled = {};
  return t.tracker;
}

function trackerEnabled(t, key) {
  return !!(t && t.tracker && t.tracker.enabled && t.tracker.enabled[key]);
}

function trackerPromptText(t) {
  const tr = t && t.tracker;
  if (!tr) return "";
  const env = [];
  for (const f of TRACKER_FIELDS.env) {
    if (trackerEnabled(t, f.key) && tr.env[f.key]) env.push(f.label + ": " + tr.env[f.key]);
  }
  const parts = [];
  if (env.length) parts.push("Current environment:\n" + env.join("\n"));
  const members = sceneMembers(t);
  for (const c of members) {
    const cs = tr.chars && tr.chars[c.id];
    if (!cs) continue;
    const lines = [];
    for (const f of TRACKER_FIELDS.chars) {
      if (trackerEnabled(t, f.key) && cs[f.key]) lines.push(f.label + ": " + cs[f.key]);
    }
    if (lines.length) parts.push(c.name + "'s current state:\n" + lines.join("\n"));
  }
  return parts.join("\n\n");
}

const trackingThreads = new Set();

let trackerToast = null;
function showTrackerToast() {
  if (trackerToast) return;
  let host = document.getElementById("toasts");
  if (!host) {
    host = UI.el("div", "toasts");
    host.id = "toasts";
    document.body.appendChild(host);
  }
  trackerToast = UI.el("div", "toast in");
  trackerToast.innerHTML = '<span class="spinner"></span><span>Updating story tracker…</span>';
  host.appendChild(trackerToast);
}
function hideTrackerToast() {
  if (trackerToast) {
    trackerToast.remove();
    trackerToast = null;
  }
}

function parseLooseJson(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

const ENV_RULES = {
  date: "Check the conversation and any provided details for dates or days of the week. If a specific date is given, use it. If only a weekday is given, pick a date on that weekday around the year 2020. If nothing is given, pick any plausible date around 2020.",
  time: "Check for time references, including vague ones like morning, afternoon, evening, night, dawn, noon. Turn them into a concrete time (e.g. night -> 11:00 PM, morning -> 9:00 AM). If nothing is given, pick a sensible time.",
  weather: "Use the weather if the story specifies it, otherwise pick something simple like Clear skies.",
};

const CHAR_RULES = {
  mood: "Keep the current mood unless the recent chat shows a shift; if empty, infer it from how they have been talking and acting. One short phrase.",
  state: "Keep the current state unless the chat shows a change; if empty, use a single short phrase (Awake, Sleeping, Passed Out, Dying, Dead).",
  outfit: "Keep the current outfit unless the chat describes a clothing change; if empty, use the card's appearance if provided, otherwise invent one that fits the scene.",
  location: "Keep the current location unless the chat shows movement; if empty, give a short up-to-three-tier location (e.g. \"On bed, Her Bedroom, Family House\").",
  goal: "Keep the current goal unless the chat shows it changed; if empty, derive a short goal from the card if provided.",
  relationship: "Keep current relationships unless the chat shows a change; if empty, derive from the card the character's relationship to the user and any other characters (e.g. \"Thomas (Brother / Secret lover), Jake (Boyfriend)\").",
  innerThoughts: "Update from the recent scene - what the character is privately thinking now, even if unshown.",
};

function recentTranscript(t) {
  return (activeMessages || []).filter((m) => !m._live && (m.role === "user" || m.role === "assistant")).slice(-8)
    .map((m) => (m.role === "user" ? "User: " + m.content : (m.name || "Character") + ": " + m.content)).join("\n\n");
}

function trackerEnvText(t) {
  const tr = t && t.tracker;
  if (!tr) return "";
  const lines = [];
  for (const f of TRACKER_FIELDS.env) if (tr.env[f.key]) lines.push(f.label + ": " + tr.env[f.key]);
  return lines.join("\n");
}

function trackerCharText(t, c) {
  const tr = t && t.tracker;
  if (!tr) return "";
  const cs = tr.chars && tr.chars[c.id];
  if (!cs) return "";
  const lines = [];
  for (const f of TRACKER_FIELDS.chars) if (cs[f.key]) lines.push(f.label + ": " + cs[f.key]);
  return lines.join("\n");
}

function random2020Date() {
  const start = new Date(2020, 0, 1).getTime();
  const end = new Date(2020, 11, 31).getTime();
  const d = new Date(start + Math.random() * (end - start));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
}

async function trackEnv(tt) {
  const envFields = TRACKER_FIELDS.env.filter((f) => trackerEnabled(tt, f.key));
  if (!envFields.length) return null;
  const shape = envFields.map((f) => `"${f.key}": "..."`).join(", ");
  const rules = envFields.map((f) => `- ${f.key}: ${ENV_RULES[f.key]}`).join("\n");
  const sys = `You track the environment of a roleplay story. Return JSON in EXACTLY this shape, with a value for every field:
{${shape}}

Rules:
${rules}

Return ONLY the JSON object. No markdown fences, no explanations.`;
  const text = await Provider.complete([{ role: "user", content: "Current tracked state:\n" + (trackerEnvText(tt) || "(none)") + "\n\nRecent messages:\n" + recentTranscript(tt) }], { system: sys, temperature: 0.2, max_tokens: 300 });
  try { console.log("[tracker][env] raw:", text); } catch {}
  return parseLooseJson(text);
}

function trackerNeedsCard(t, c) {
  const tr = t && t.tracker;
  const cs = tr && tr.chars && tr.chars[c.id];
  const readAt = cs && cs._cardReadAt;
  if (!readAt) return true;
  const cardUpdated = c.updatedAt || c.createdAt || 0;
  return cardUpdated > readAt;
}

function charCardBrief(c, persona) {
  const r = (txt) => applyTemplateVars(txt, c, persona);
  const trunc = (s) => String(s || "").replace(/\s+/g, " ").slice(0, 400);
  const lines = [];
  if (c.description) lines.push("Description: " + trunc(r(c.description)));
  if (c.personality) lines.push("Personality: " + trunc(r(c.personality)));
  if (c.appearance) lines.push("Appearance: " + trunc(r(c.appearance)));
  if (c.attitude) lines.push("How they treat the user: " + trunc(r(c.attitude)));
  if (c.scenario) lines.push("Scenario: " + trunc(r(c.scenario)));
  return lines.join("\n");
}

async function trackChars(tt) {
  const charFields = TRACKER_FIELDS.chars.filter((f) => trackerEnabled(tt, f.key));
  const members = sceneMembers(tt);
  if (!charFields.length || !members.length) return null;
  const persona = threadPersona(tt);
  const shape = charFields.map((f) => `"${f.key}": "..."`).join(", ");
  const rules = charFields.map((f) => `- ${f.key}: ${CHAR_RULES[f.key]}`).join("\n");
  const charShapes = members.map((c) => `"${(c.name || "").replace(/"/g, '\\"')}": {${shape}}`).join(", ");
  const needCard = members.filter((c) => trackerNeedsCard(tt, c));
  let cardsSection = "";
  if (needCard.length) {
    cardsSection = "\n\nCharacter cards (use these only to fill fields that are still empty):\n" + needCard.map((c) => `=== ${esc(c.name)} ===\n${charCardBrief(c, persona)}`).join("\n\n");
  }
  const sys = `You update the current state of the characters in a roleplay, mostly from the recent chat. Return JSON in EXACTLY this shape, with a value for every field:
{"characters": {${charShapes}}}${cardsSection}

Rules (apply to every character):
${rules}

Return ONLY the JSON object. No markdown fences, no explanations.`;
  const current = members.map((c) => (c.name + ":\n" + (trackerCharText(tt, c) || "(none)"))).join("\n\n");
  const text = await Provider.complete([{ role: "user", content: "Current state:\n" + (current || "(none)") + "\n\nRecent messages:\n" + recentTranscript(tt) }], { system: sys, temperature: 0.4, max_tokens: 800 });
  try { console.log("[tracker][chars] raw:", text); } catch {}
  return parseLooseJson(text);
}

async function updateTracker(t) {
  const tt = threads.find((x) => x.id === t.id) || t;
  const enabledKeys = TRACKER_FIELDS.env.concat(TRACKER_FIELDS.chars).map((f) => f.key).filter((k) => trackerEnabled(tt, k));
  if (!enabledKeys.length) return;
  if (!isProviderConfigured()) return;
  if (trackingThreads.has(tt.id)) return;
  if (!currentThreadModel()) return;
  trackingThreads.add(tt.id);
  showTrackerToast();
  try {
    const members = sceneMembers(tt);
    const tr = ensureTracker(tt);
    const [envData, charsData] = await Promise.all([trackEnv(tt), trackChars(tt)]);
    if (envData) {
      for (const k of Object.keys(envData)) if (envData[k]) tr.env[k] = String(envData[k]).trim();
    }
    if (charsData && charsData.characters) {
      for (const name of Object.keys(charsData.characters)) {
        const c = members.find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
        if (!c) continue;
        tr.chars[c.id] = tr.chars[c.id] || {};
        tr.chars[c.id]._cardReadAt = Date.now();
        const cv = charsData.characters[name];
        for (const k of Object.keys(cv)) if (cv[k]) tr.chars[c.id][k] = String(cv[k]).trim();
      }
    }
    if (trackerEnabled(tt, "date") && !tr.env.date) tr.env.date = random2020Date();
    if (trackerEnabled(tt, "time") && !tr.env.time) tr.env.time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (trackerEnabled(tt, "weather") && !tr.env.weather) tr.env.weather = "Clear skies";
    tt.tracker = tr;
    await pfrpDB.put("threads", tt);
    if (activeThread && activeThread.id === tt.id) { activeThread = tt; renderContext(); }
  } catch (e) {
    console.warn("[tracker] update failed:", e && e.message);
  } finally {
    trackingThreads.delete(tt.id);
    hideTrackerToast();
  }
}

async function generateSuggestedActions(t) {
  const tt = threads.find((x) => x.id === t.id) || t;
  if (!tt.suggestedActions) return;
  if (!isProviderConfigured()) return;
  if (!currentThreadModel()) return;
  try {
    const recent = (activeMessages || []).filter((m) => !m._live && (m.role === "user" || m.role === "assistant")).slice(-10)
      .map((m) => (m.role === "user" ? "User: " + m.content : (m.name || "Character") + ": " + m.content)).join("\n\n");
    const sys = `You suggest the user's next action in a roleplay. Given the latest scene, propose exactly 4 distinct, actionable options for what the USER (not the AI characters) could do or say next. Write each as a short full sentence in second person, present tense, from the user's perspective. Return ONLY valid JSON: {"options": ["...", "...", "...", "..."]}. Keep each option under about 15 words. Vary approach, tone, and risk. No markdown fences, no extra text.`;
    const text = await Provider.complete([{ role: "user", content: "Latest scene:\n" + recent }], { system: sys, temperature: 0.7, max_tokens: 200 });
    const data = parseLooseJson(text);
    if (!data) return;
    const opts = ((data && data.options) || []).filter((o) => typeof o === "string" && o.trim()).slice(0, 4);
    tt.suggestions = opts;
    await pfrpDB.put("threads", tt);
    if (activeThread && activeThread.id === tt.id) { activeThread = tt; renderSuggestedActions(); }
  } catch (e) {
    console.warn("[actions] failed:", e && e.message);
  }
}

function postTurn(t) {
  (async () => {
    await updateTracker(t);
    await generateSuggestedActions(t);
    await maybeSummarize(t);
  })();
}

function renderSuggestedActions() {
  const row = els.suggestedRow;
  if (!row) return;
  row.innerHTML = "";
  const t = activeThread;
  const opts = t && t.suggestedActions && t.suggestions ? t.suggestions : [];
  if (!opts.length) { row.classList.add("hidden"); return; }
  row.classList.remove("hidden");
  for (const o of opts) {
    const chip = UI.el("button", "action-chip", esc(o));
    chip.title = "Send this action";
    chip.addEventListener("click", () => {
      if (!activeThread || isGenerating(activeThread.id)) return;
      els.input.value = o;
      sendMessage();
    });
    row.appendChild(chip);
  }
}

function applyTemplateVars(text, c, persona) {
  if (!text) return text;
  const charName = c ? (c.name || "") : "";
  const userName = persona ? (persona.name || "You") : (pfrpSettings.data.user.name || "You");
  return String(text).split("{{char}}").join(charName).split("{{user}}").join(userName);
}

function basePromptParts(c) {
  const parts = [];
  const sys = (pfrpSettings.data.system || "").trim() || DEFAULT_SYSTEM_PROMPT;
  parts.push(sys);
  const rl = pfrpSettings.data.responseLength;
  if (rl === "short") parts.push("Keep your responses short: roughly 1-2 paragraphs.");
  else if (rl === "medium") parts.push("Keep your responses medium length: roughly 3-5 paragraphs.");
  else if (rl === "long") parts.push("Write long, detailed responses with rich description.");
  const story = storyInstructions(activeThread);
  for (const line of story) parts.push(line);
  if (pfrpSettings.data.formatting && pfrpSettings.data.formatting.noEmDash) {
    parts.push("Writing style: never use the em-dash character. Use commas, periods, or other punctuation instead.");
  }
  const conventions = formattingConventions();
  if (conventions) parts.push(conventions);
  const t = activeThread;
  if (t) {
    if (t.scenario) parts.push("Scene: " + t.scenario);
    if (t.summary) parts.push("Story so far (summary of earlier messages):\n" + t.summary);
    if (t.memory) parts.push("Chat memory (facts to remember):\n" + t.memory);
    const tracker = trackerPromptText(t);
    if (tracker) parts.push("Current story state (keep these facts consistent):\n" + tracker);
  }
  const persona = threadPersona(activeThread);
  if (persona) {
    const pdesc = persona.description ? " " + applyTemplateVars(persona.description, c, persona) : "";
    parts.push("The user you are interacting with is " + persona.name + "." + pdesc + " Never assume who the user is beyond this, and never speak or act for them.");
  }
  return parts;
}

function threadPersona(t) {
  if (!t) return pfrpSettings.activePersona();
  const personas = pfrpSettings.data.personas || [];
  if (t.userPersonaId) {
    const p = personas.find((x) => x.id === t.userPersonaId);
    if (p) return p;
  }
  return pfrpSettings.activePersona();
}

function personaSelectControl(get, set, { label = "Your persona", hintText = "" } = {}) {
  const wrap = UI.el("div", "");
  wrap.appendChild(UI.el("label", "field-label", label));
  const personas = pfrpSettings.data.personas || [];
  const sel = UI.el("select", "select");
  for (const p of personas) {
    const o = UI.el("option", "", p.name || "Persona");
    o.value = p.id;
    sel.appendChild(o);
  }
  sel.value = get() || (personas[0] && personas[0].id) || "";
  sel.addEventListener("change", () => set(sel.value));
  wrap.appendChild(sel);
  if (hintText) wrap.appendChild(UI.el("div", "hint", hintText));
  return wrap;
}

function updateInputPlaceholder() {
  if (composerGuided) {
    els.input.placeholder = "Draft the selected speaker's reply… (Enter to generate)";
    return;
  }
  const t = activeThread;
  if (t && t.pendingSpeaker === "narrator") {
    els.input.placeholder = "Describe the scene or set the story  -  the Narrator writes it in third person…";
    return;
  }
  els.input.placeholder = "Write your reply…  (Enter to send, Shift+Enter for a new line)";
}

function explicitnessLine() {
  const t = activeThread;
  if (!t) return "";
  return t.explicitness === "explicit" ? "Explicit adult content is allowed." : t.explicitness === "suggestive" ? "Suggestive but not explicit content is allowed." : "Keep content non-explicit (SFW).";
}

function currentSystemPrompt() {
  return currentSystemPromptFor(null);
}

function currentSystemPromptFor(c) {
  const t = activeThread;
  if (!c) c = t && t.character;
  const parts = basePromptParts(c);
  if (c) {
    const persona = threadPersona(t);
    const r = (txt) => applyTemplateVars(txt, c, persona);
    if (c.description) parts.push("Character: " + c.name + "\n" + r(c.description));
    if (c.personality) parts.push("Personality: " + r(c.personality));
    if (c.attitude) parts.push("How they treat the user: " + r(c.attitude));
    if (c.appearance) parts.push("Appearance: " + r(c.appearance));
    if (c.scenario) parts.push("Scenario: " + r(c.scenario));
    if (c.mes_example) parts.push("Example dialogue (match this voice):\n" + r(c.mes_example));
    const lore = matchingLore(c, t);
    if (lore.length) {
      parts.push("Relevant lore (world facts the character knows):\n" + lore.map((e) => (e.name ? `[${e.name}]\n` : "") + r(e.content)).join("\n\n"));
    }
    if (c.system_prompt) parts.push(r(c.system_prompt));
    if (c.memory) parts.push("Character memory notes:\n" + r(c.memory));
    const expl = explicitnessLine();
    parts.push(
      `You are roleplaying ONLY as "${c.name}" right now. Your entire reply is ${c.name}'s actions and dialogue in the scene  -  nothing else. ` +
      `Do not write any other character's dialogue or actions, do not narrate what other characters do or say, and never write the user's actions for them. ` +
      `Do not prefix your reply with ${c.name}'s name or any label - just write the character's own words and actions directly.` +
      (expl ? " " + expl : "")
    );
    if (c.post_history_instructions) parts.push(r(c.post_history_instructions));
  } else {
    const expl = explicitnessLine();
    if (expl) parts.push(expl);
  }
  return parts.join("\n\n");
}

function narratorSystemPrompt() {
  const t = activeThread;
  const parts = basePromptParts(null);
  const members = t && t.characterIds ? (t.characterIds || []).map((id) => (characters.find((x) => x.id === id) || {}).name).filter(Boolean) : [];
  if (members.length) parts.push("Characters present in this chat: " + members.join(", ") + ".");
  parts.push("You are the Narrator for this scene  -  not any specific character. Describe the world, the environment, and the actions of any characters present, including story characters who are not part of this chat, in third person. You may include short lines of dialogue for any character when it serves the scene. Move the story forward and set the atmosphere. Do not prefix your reply with any name or label  -  write the narration directly, as plain third-person prose.");
  const expl = explicitnessLine();
  if (expl) parts.push(expl);
  return parts.join("\n\n");
}

function resolveSpeaker(t) {
  if (t.pendingSpeaker === "narrator") return { narrator: true };
  if (t.isGroup) {
    if (t.pendingSpeaker) {
      const c = characters.find((x) => x.id === t.pendingSpeaker);
      if (c) return { character: c };
    }
    if (t.autoRespond !== false) {
      const c = characters.find((x) => x.id === t.lastSpeakerId) || characters.find((x) => x.id === t.characterId) || t.character || null;
      if (c) return { character: c };
    }
    return null;
  }
  return t.character ? { character: t.character } : null;
}

function buildHistory(t) {
  const since = t.summarizedUpToOrder == null ? -1 : t.summarizedUpToOrder;
  return activeMessages
    .filter((m) => (m.role === "user" || m.role === "assistant") && !m._live && m.order > since)
    .flatMap((m) => {
      if (m.blocks && m.blocks.length) {
        return m.blocks.map((b) => ({
          role: "assistant",
          content: (b.narrator ? "[Narrator]: " : b.name + ": ") + b.content,
        }));
      }
      return [
        {
          role: m.role,
          content: m.image ? "[Image: " + (m.content || "attached image") + "]" : t.isGroup && m.role === "assistant" && m.name ? m.name + ": " + m.content : m.content,
        },
      ];
    });
}

async function generateResponse(t, speaker, { guided = "", orderBase } = {}) {
  const name = speaker.narrator ? "Narrator" : speaker.character.name;
  const characterId = speaker.narrator ? null : speaker.character.id;
  const persona = threadPersona(t);
  const guidedResolved = guided ? applyTemplateVars(guided, speaker.character || null, persona) : "";
  const asstMsg = {
    threadId: t.id,
    role: "assistant",
    name,
    characterId,
    content: guidedResolved,
    creationTime: Date.now(),
    order: orderBase,
    isStreaming: true,
    _live: true,
  };
  activeMessages.push(asstMsg);

  const ac = new AbortController();
  streams.set(t.id, { ac, placeholder: asstMsg });

  renderAllMessages();
  renderChatsDrawer();
  updateComposerState();

  const history = buildHistory(t);
  const system = speaker.narrator ? narratorSystemPrompt() : currentSystemPromptFor(speaker.character);

  let full = guidedResolved;
  try {
    for await (const chunk of Provider.stream(history, {
      system,
      temperature: t.temperature,
      model: currentThreadModel(),
      signal: ac.signal,
    })) {
      if (ac.signal.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        asstMsg.content = full;
        updateLiveBubble(t.id, full);
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") UI.showToast("Generation failed: " + e.message, { type: "err" });
  } finally {
    streams.delete(t.id);
    asstMsg.isStreaming = false;
    delete asstMsg._live;
    if (!full) full = ac.signal.aborted ? (guided || "(stopped)") : "(no response)";
    asstMsg.content = full;
    const id = await pfrpDB.add("messages", asstMsg);
    asstMsg.id = id;
    delete asstMsg.isStreaming;
    if (!speaker.narrator) t.lastSpeakerId = speaker.character.id;
    t.lastMessageTime = Date.now();
    t.updatedAt = Date.now();
    await pfrpDB.put("threads", t);
    if (!ac.signal.aborted) rememberModel(currentThreadModel());
    await loadData();
    activeThread = threads.find((x) => x.id === t.id) || null;
    if (activeThread && activeThread.id === t.id) renderAllMessages();
    renderChatsDrawer();
    renderSpeakerRow();
    updateComposerState();
  }
  return asstMsg;
}

async function directorNext(t) {
  const members = (t.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter(Boolean);
  if (members.length < 2) return null;
  const names = members.map((m) => m.name);
  const recent = activeMessages
    .filter((m) => !m._live && (m.role === "user" || m.role === "assistant"))
    .slice(-6)
    .map((m) => (m.role === "user" ? "{{user}}: " + m.content : (m.name || "assistant") + ": " + m.content))
    .join("\n\n");
  const sys = `You are the scene director for a group roleplay. The characters are: ${names.join(", ")}. Read the conversation and decide what happens next: reply with ONLY the exact name of a character who should speak to advance the scene (reacting, interjecting, or entering the scene because they are involved), or NARRATOR if a short third-person scene or setting beat fits better than another character line (use NARRATOR sparingly - never twice in a row), or NONE if the scene should wait for the user.`;
  try {
    const text = await Provider.complete([{ role: "user", content: recent }], { system: sys, temperature: 0.2, max_tokens: 8 });
    const clean = text.trim().replace(/["'.]/g, "");
    const c = members.find((m) => m.name.toLowerCase() === clean.toLowerCase());
    try { console.log("[AI] Director decision:", clean || "(empty)"); } catch {}
    if (c) return c.name;
    if (clean.toLowerCase() === "narrator") return "Narrator";
    return null;
  } catch {
    return null;
  }
}

function sceneMembers(t) {
  const list = t.isGroup ? (t.characterIds || []).map((id) => characters.find((c) => c.id === id)) : [t.character];
  return list.filter(Boolean);
}

function sceneSystemPrompt(t) {
  const parts = basePromptParts(t.character || null);
  const members = sceneMembers(t);
  const persona = threadPersona(t);
  const r = (txt, c) => applyTemplateVars(txt, c, persona);
  const cards = members.map((c) => {
    const lines = [];
    if (c.appearance) lines.push("Appearance: " + r(c.appearance, c));
    if (c.personality) lines.push("Personality: " + r(c.personality, c));
    if (c.attitude) lines.push("Treats the user: " + r(c.attitude, c));
    return c.name + ": " + lines.join("; ");
  });
  parts.push("Characters in this scene:\n" + cards.join("\n"));
  const primary = members[0];
  const lore = matchingLore(primary, t);
  if (lore.length) {
    parts.push("Relevant lore:\n" + lore.map((e) => (e.name ? `[${e.name}]\n` : "") + r(e.content, primary)).join("\n\n"));
  }
  parts.push(`Write the next scene segment. Switch between the characters above (and only those named above) as the moment demands, using this exact format:

[Character Name]
Their dialogue in "quotes" and *actions in asterisks*.

[Narrator]
Third-person narration describing the world, the pacing, or what happens between lines.

Rules:
- Each block MUST start with the name in [square brackets] on its OWN line, immediately followed by that character's lines. Never prefix a name inline like "Rena: ..." - always use a [Rena] header on its own line.
- Use ONLY the names listed above plus Narrator.
- 2-6 blocks per response. Vary who speaks - do not let one character dominate.
- Use Narrator blocks sparingly, when a beat of description or scene-setting improves the flow - never after every line.
- Keep each block short and punchy - one beat, one thought.
- End on a line that invites the user to respond.
- Match the length of the user's reply, and drive the scene forward.`);
  const expl = explicitnessLine();
  if (expl) parts.push(expl);
  return parts.join("\n\n");
}

const SPEAKER_BLOCKLIST = new Set([
  "a", "an", "the", "and", "but", "or", "if", "else", "so", "as", "of", "for", "to", "in", "on",
  "at", "by", "with", "from", "into", "onto", "out", "up", "down", "over", "under", "above",
  "below", "after", "before", "during", "while", "when", "where", "how", "why", "what", "who",
  "which", "then", "than", "now", "soon", "once", "later", "again", "already", "almost", "always",
  "never", "sometimes", "usually", "often", "finally", "eventually", "instead", "however", "although",
  "though", "unless", "until", "because", "since", "meanwhile", "suddenly", "note", "notes",
  "this", "that", "these", "those", "it", "he", "she", "they", "we", "you", "i", "my", "your", "his",
  "her", "their", "our", "me", "him", "them", "us", "there", "here", "inside", "outside", "behind",
  "around", "near", "far", "away", "toward", "towards", "through", "across", "against", "along",
  "between", "among", "within", "without", "beyond", "despite", "per", "via", "except", "thanks",
  "please", "wait", "hold", "look", "listen", "god", "oh", "ah", "hey", "hmm", "okay", "ok", "yeah",
  "well", "no", "not", "none", "all", "just", "only", "even", "still", "yet", "first", "second",
  "third", "next", "last", "yes", "maybe", "perhaps", "somewhere", "everywhere", "anywhere", "nowhere",
  "someone", "everyone", "anyone",
]);

function looksLikeSpeakerName(label) {
  if (!label || /\d/.test(label)) return false;
  const words = label.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return false;
  for (const w of words) {
    if (!/^[\p{Lu}][\p{L}'\u2019.\-]*$/u.test(w)) return false;
    if (SPEAKER_BLOCKLIST.has(w.toLowerCase())) return false;
  }
  return true;
}

function stripMarkdownWrappers(text) {
  let s = text.trim();
  s = s.replace(/^#{1,6}\s*/, "");
  s = s.replace(/^[*_]{1,3}(.+?)[*_]{1,3}$/, "$1");
  return s.trim();
}

function parseSceneBlocks(text, t) {
  const lines = text.split("\n");
  const raw = [];
  let current = null;
  const knownNames = (t && t.characterIds ? t.characterIds.map((id) => (characters.find((x) => x.id === id) || {}).name) : []).concat(t && t.character ? [t.character.name] : []).filter(Boolean);

  const isKnownName = (label) => label && knownNames.some((n) => n && n.toLowerCase() === label.toLowerCase());
  const pushHeader = (label) => {
    if (current && current.content.trim()) raw.push(current);
    current = { label: label, content: "" };
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const bracket = trimmed.match(/^\[(.+?)\]$/);
    if (bracket) {
      const inner = stripMarkdownWrappers(bracket[1]);
      pushHeader(inner || "Narrator");
      continue;
    }

    const unwrapped = stripMarkdownWrappers(trimmed);
    const bare = unwrapped.replace(/[:：—–]\s*$/, "").trim();
    if (bare && (bare.toLowerCase() === "narrator" || isKnownName(bare) || looksLikeSpeakerName(bare))) {
      pushHeader(bare);
      continue;
    }

    const colon = trimmed.match(/^(.+?)\s*[:：]\s+(.*)$/);
    if (colon) {
      const label = stripMarkdownWrappers(colon[1]);
      if (label.toLowerCase() === "narrator" || isKnownName(label) || looksLikeSpeakerName(label)) {
        pushHeader(label);
        current.content += colon[2] + "\n";
        continue;
      }
    }

    const dash = trimmed.match(/^(.+?)\s*[—–]\s+(.*)$/);
    if (dash && !/[—–]/.test(dash[2])) {
      const label = stripMarkdownWrappers(dash[1]);
      if (label.toLowerCase() === "narrator" || isKnownName(label)) {
        pushHeader(label);
        current.content += dash[2] + "\n";
        continue;
      }
    }

    if (current) {
      current.content += line + "\n";
    } else {
      if (!current) current = { label: "", content: "" };
      current.content += line + "\n";
    }
  }
  if (current && current.content.trim()) raw.push(current);
  return raw
    .map((b) => {
      const label = (b.label || "").trim();
      const isNarrator = !label || label.toLowerCase() === "narrator";
      if (isNarrator) {
        return { speaker: label || "Narrator", name: "Narrator", characterId: null, narrator: true, content: b.content.trim() };
      }
      const c = characters.find((x) => (x.name || "").toLowerCase() === label.toLowerCase());
      if (c) {
        return { speaker: label, name: c.name, characterId: c.id, narrator: false, content: b.content.trim() };
      }
      return { speaker: label, name: label, characterId: null, narrator: false, content: b.content.trim() };
    })
    .filter((b) => b.content);
}

function sceneBlocksHtml(blocks) {
  return blocks
    .map(
      (b) => `<div class="scene-block${b.narrator ? " narrator" : ""}">
        <div class="scene-who">${b.narrator ? UI.fa("book-open") + " Narrator" : esc(b.name)}</div>
        <div class="scene-body">${formatText(b.content)}</div>
      </div>`
    )
    .join("");
}

function updateLiveScene(threadId, msg) {
  if (!activeThread || activeThread.id !== threadId) return;
  const bubble = document.querySelector(".bubble.streaming");
  if (bubble) {
    const body = bubble.querySelector(".body");
    if (body) {
      body.innerHTML = sceneBlocksHtml(msg.blocks || []);
      scrollToBottom();
    }
  }
}

async function generateScene(t, orderBase) {
  const loading = {
    threadId: t.id,
    role: "assistant",
    name: "",
    characterId: null,
    content: "",
    creationTime: Date.now(),
    order: orderBase,
    isStreaming: true,
    _live: true,
    _loading: true,
  };
  activeMessages.push(loading);
  const ac = new AbortController();
  streams.set(t.id, { ac, placeholder: loading });
  renderAllMessages();
  renderChatsDrawer();
  updateComposerState();
  const history = buildHistory(t);
  const system = sceneSystemPrompt(t);
  let full = "";
  const live = [];
  try {
    for await (const chunk of Provider.stream(history, {
      system,
      temperature: t.temperature,
      model: currentThreadModel(),
      signal: ac.signal,
    })) {
      if (ac.signal.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        const blocks = parseSceneBlocks(full, t);
        const merged = mergeConsecutiveBlocks(blocks);
        if (!merged.length) continue;
        if (activeMessages.includes(loading)) {
          activeMessages = activeMessages.filter((x) => x !== loading);
        }
        for (let i = 0; i < merged.length; i++) {
          const b = merged[i];
          const name = b.narrator ? "Narrator" : b.name;
          const cid = b.characterId || null;
          if (i < live.length) {
            live[i].name = name;
            live[i].characterId = cid;
            live[i].narrator = !!b.narrator;
            live[i].content = b.content;
            live[i].isStreaming = i === merged.length - 1;
          } else {
            const m = {
              threadId: t.id,
              role: "assistant",
              name,
              characterId: cid,
              narrator: !!b.narrator,
              content: b.content,
              creationTime: Date.now(),
              order: orderBase + i,
              isStreaming: true,
              _live: true,
            };
            live.push(m);
            activeMessages.push(m);
          }
        }
        while (live.length > merged.length) {
          const rm = live.pop();
          activeMessages = activeMessages.filter((x) => x !== rm);
        }
        for (let i = 0; i < live.length; i++) live[i].isStreaming = i === live.length - 1;
        if (activeThread && activeThread.id === t.id) {
          renderAllMessages();
          scrollToBottom();
        }
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") UI.showToast("Scene failed: " + e.message, { type: "err" });
  } finally {
    streams.delete(t.id);
    if (activeMessages.includes(loading)) {
      activeMessages = activeMessages.filter((x) => x !== loading);
    }
    if (!ac.signal.aborted) rememberModel(currentThreadModel());
    if (!full && ac.signal.aborted) full = "(stopped)";
    if (!full && !live.length) full = "(no response)";
    let finalMerged = mergeConsecutiveBlocks(parseSceneBlocks(full, t));
    if (!finalMerged.length && full.trim()) finalMerged = [{ speaker: "Narrator", name: "Narrator", characterId: null, narrator: true, content: full.trim() }];
    if (live.length) {
      for (let i = 0; i < live.length; i++) {
        const b = finalMerged[i];
        if (b) {
          live[i].name = b.narrator ? "Narrator" : b.name;
          live[i].characterId = b.characterId || null;
          live[i].narrator = !!b.narrator;
          live[i].content = b.content;
        }
        live[i].isStreaming = false;
        delete live[i]._live;
        const toSave = { threadId: live[i].threadId, role: live[i].role, name: live[i].name, characterId: live[i].characterId, narrator: !!live[i].narrator, content: live[i].content, creationTime: live[i].creationTime, order: live[i].order };
        const mid = await pfrpDB.add("messages", toSave);
        live[i].id = mid;
        delete live[i].isStreaming;
      }
      while (live.length < finalMerged.length) {
        const b = finalMerged[live.length];
        const m = { threadId: t.id, role: "assistant", name: b.narrator ? "Narrator" : b.name, characterId: b.characterId || null, narrator: !!b.narrator, content: b.content, creationTime: Date.now(), order: orderBase + live.length };
        const mid = await pfrpDB.add("messages", m);
        m.id = mid;
        activeMessages.push(m);
        live.push(m);
      }
    } else {
      let order = orderBase;
      for (const b of finalMerged) {
        const m = { threadId: t.id, role: "assistant", name: b.narrator ? "Narrator" : b.name, characterId: b.characterId || null, narrator: !!b.narrator, content: b.content, creationTime: Date.now(), order };
        const mid = await pfrpDB.add("messages", m);
        m.id = mid;
        activeMessages.push(m);
        order++;
      }
    }
    t.lastMessageTime = Date.now();
    t.updatedAt = Date.now();
    await pfrpDB.put("threads", t);
    await loadData();
    activeThread = threads.find((x) => x.id === t.id) || null;
    if (activeThread && activeThread.id === t.id) renderAllMessages();
    renderChatsDrawer();
    renderSpeakerRow();
    updateComposerState();
  }
}

function mergeConsecutiveBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.name === b.name && last.narrator === b.narrator && last.characterId === b.characterId) {
      last.content += "\n\n" + b.content;
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

async function regenerateScene(t, m) {
  if (!ensureProviderConfigured("regenerating a scene")) return;
  const regenerateSingle = m.characterId != null || m.name === "Narrator";
  const prevContent = m.content;
  m.isStreaming = true;
  m._live = true;
  const ac = new AbortController();
  streams.set(t.id, { ac, placeholder: m });
  renderAllMessages();
  renderChatsDrawer();
  updateComposerState();
  const history = activeMessages
    .filter((x) => x.role === "user" || x.role === "assistant")
    .filter((x) => !x._live)
    .filter((x) => x.order <= m.order)
    .filter((x) => x.order > (t.summarizedUpToOrder == null ? -1 : t.summarizedUpToOrder))
    .flatMap((x) => {
      if (x.blocks && x.blocks.length) {
        return x.blocks.map((b) => ({ role: "assistant", content: (b.narrator ? "[Narrator]: " : b.name + ": ") + b.content }));
      }
      return [{ role: x.role, content: x.image ? "[Image: " + (x.content || "attached image") + "]" : t.isGroup && x.role === "assistant" && x.name ? x.name + ": " + x.content : x.content }];
    });
  const system = sceneSystemPrompt(t);
  let full = "";
  try {
    for await (const chunk of Provider.stream(history, {
      system,
      temperature: t.temperature,
      model: currentThreadModel(),
      signal: ac.signal,
    })) {
      if (ac.signal.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        m.content = full;
        m.blocks = parseSceneBlocks(full, t);
        updateLiveScene(t.id, m);
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") UI.showToast("Scene failed: " + e.message, { type: "err" });
  } finally {
    streams.delete(t.id);
    m.isStreaming = false;
    delete m._live;
    if (full) {
      normalizeGenerations(m);
      m.variants.push(full);
      m.genPos = m.variants.length - 1;
      m.content = full;
      m.blocks = parseSceneBlocks(full, t);
      await pfrpDB.put("messages", m);
      if (!ac.signal.aborted) rememberModel(currentThreadModel());
    } else {
      m.content = prevContent;
    }
    if (activeThread && activeThread.id === t.id) renderAllMessages();
    renderChatsDrawer();
    updateComposerState();
    maybeSummarize(t);
  }
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text) return;
  const t = activeThread;
  if (!t) {
    UI.showToast("Open or create a chat first", { type: "err" });
    return;
  }
  if (!ensureProviderConfigured("sending a message")) {
    return;
  }
  if (isGenerating(t.id)) {
    UI.showToast("A response is already generating in this chat", { type: "err" });
    return;
  }
  if (trackingThreads.has(t.id)) {
    UI.showToast("Story tracker is still updating - give it a moment", { type: "err" });
    return;
  }
  if (!currentThreadModel()) {
    UI.showToast("Set a model in Settings first", { type: "err" });
    openSettingsModal();
    return;
  }

  const guided = composerGuided && t.pendingSpeaker != null;
  els.input.value = "";

  if (guided) {
    const speaker = resolveSpeaker(t);
    if (!speaker) {
      UI.showToast("Pick a character or the Narrator for guided mode", { type: "err" });
      return;
    }
    const orderBase = activeMessages.length ? activeMessages[activeMessages.length - 1].order + 1 : 0;
    await generateResponse(t, speaker, { guided: text, orderBase });
    postTurn(t);
    return;
  }

  const userMsg = {
    threadId: t.id,
    role: "user",
    content: text,
    creationTime: Date.now(),
    order: activeMessages.length ? activeMessages[activeMessages.length - 1].order + 1 : 0,
  };
  const uid = await pfrpDB.add("messages", userMsg);
  userMsg.id = uid;
  activeMessages.push(userMsg);

  const speaker = resolveSpeaker(t);
  if (!speaker) {
    renderAllMessages();
    t.lastMessageTime = Date.now();
    t.updatedAt = Date.now();
    await pfrpDB.put("threads", t);
    await loadData();
    renderChatsDrawer();
    UI.showToast("Message sent (auto-response off  -  pick a character to get a reply)");
    return;
  }

  const orderBase = userMsg.order + 1;
  if (t.sceneMode) {
    await generateScene(t, orderBase);
  } else {
    await generateResponse(t, speaker, { orderBase });

    if (t.isGroup && t.autoRespond !== false && t.multiTurn !== false && t.pendingSpeaker == null) {
      let count = 1;
      while (count < 3) {
        const last = activeMessages[activeMessages.length - 1];
        if (!last || last.role === "user") break;
        const next = await directorNext(t);
        if (!next) break;
        const orderBase = activeMessages.length ? activeMessages[activeMessages.length - 1].order + 1 : 0;
        if (next === "Narrator") {
          await generateResponse(t, { narrator: true }, { orderBase });
        } else {
          const c = characters.find((x) => (x.name || "").toLowerCase() === next.toLowerCase());
          if (!c) break;
          await generateResponse(t, { character: c }, { orderBase });
        }
        count++;
      }
    }
  }

  postTurn(t);
}

async function regenerate(m) {
  const t = activeThread;
  if (!t) return;
  if (!ensureProviderConfigured("regenerating a response")) return;
  if (m.role !== "assistant" || m._live) return;
  if (isGenerating(t.id)) {
    UI.showToast("A response is already generating in this chat", { type: "err" });
    return;
  }
  if (m.blocks && m.blocks.length) {
    await regenerateScene(t, m);
    return;
  }
  const idx = activeMessages.indexOf(m);
  if (idx < 0) return;
  const userIdx = idx - 1;
  const userMsg = activeMessages[userIdx];
  if (!userMsg || userMsg.role !== "user") return;

  const prevContent = m.content;
  m.isStreaming = true;
  m._live = true;

  const ac = new AbortController();
  streams.set(t.id, { ac, placeholder: m });

  renderAllMessages();
  renderChatsDrawer();
  updateComposerState();

  const history = activeMessages
    .filter((x) => x.role === "user" || x.role === "assistant")
    .filter((x) => !x._live)
    .filter((x) => x.order <= m.order)
    .filter((x) => x.order > (t.summarizedUpToOrder == null ? -1 : t.summarizedUpToOrder))
    .flatMap((x) => {
      if (x.blocks && x.blocks.length) {
        return x.blocks.map((b) => ({ role: "assistant", content: (b.narrator ? "[Narrator]: " : b.name + ": ") + b.content }));
      }
      return [
        {
          role: x.role,
          content: x.image ? "[Image: " + (x.content || "attached image") + "]" : t.isGroup && x.role === "assistant" && x.name ? x.name + ": " + x.content : x.content,
        },
      ];
    });

  const speaker = characters.find((c) => c.id === m.characterId) || t.character || null;
  const regenSystem = m.name === "Narrator" || m.characterId == null ? narratorSystemPrompt() : currentSystemPromptFor(speaker);

  let full = "";
  try {
    for await (const chunk of Provider.stream(history, {
      system: regenSystem,
      temperature: t.temperature,
      model: currentThreadModel(),
      signal: ac.signal,
    })) {
      if (ac.signal.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        m.content = full;
        updateLiveBubble(t.id, full);
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") UI.showToast("Regeneration failed: " + e.message, { type: "err" });
  } finally {
    streams.delete(t.id);
    m.isStreaming = false;
    delete m._live;
    if (full) {
      normalizeGenerations(m);
      m.variants.push(full);
      m.genPos = m.variants.length - 1;
      m.content = full;
      await pfrpDB.put("messages", m);
      if (!ac.signal.aborted) rememberModel(currentThreadModel());
    } else {
      m.content = prevContent;
    }
    if (activeThread && activeThread.id === t.id) renderAllMessages();
    renderChatsDrawer();
    updateComposerState();
    maybeSummarize(t);
  }
}

function updateLiveBubble(threadId, full) {
  if (!activeThread || activeThread.id !== threadId) return;
  const bubble = document.querySelector(".bubble.streaming");
  if (bubble) {
    const body = bubble.querySelector(".body");
    if (body) {
      body.innerHTML = formatText(full);
      applyDefaultColor(body);
    }
    scrollToBottom();
  }
}

function updateComposerState() {
  const gen = !!(activeThread && isGenerating(activeThread.id));
  els.sendBtn.style.display = gen ? "none" : "";
  els.stopBtn.style.display = gen ? "" : "none";
  if (els.composer) els.composer.style.display = activeThread ? "" : "none";
}

function inlineEdit(m, body) {
  const ta = UI.el("textarea", "inline-edit");
  ta.value = m.content;
  const prevW = body.clientWidth || 0;
  const prevH = body.clientHeight || 0;
  body.innerHTML = "";
  body.appendChild(ta);
  const row = UI.el("div", "inline-edit-actions");
  const saveBtn = UI.el("button", "btn primary small", UI.fa("check") + " Save");
  const cancelBtn = UI.el("button", "btn ghost small", UI.fa("xmark") + " Cancel");
  row.append(saveBtn, cancelBtn);
  body.appendChild(row);
  ta.focus();
  if (prevW) ta.style.width = Math.max(160, prevW) + "px";
  const targetH = Math.max(40, prevH || 60);
  ta.style.height = "auto";
  ta.style.height = Math.max(targetH, Math.min(ta.scrollHeight, 360)) + "px";
  const cancel = () => renderAllMessages();
  cancelBtn.addEventListener("click", cancel);
  saveBtn.addEventListener("click", async () => {
    normalizeGenerations(m);
    m.variants.push(ta.value);
    m.genPos = m.variants.length - 1;
    m.content = ta.value;
    if (m.blocks) m.blocks = parseSceneBlocks(m.content, activeThread);
    m.isEdited = true;
    await pfrpDB.put("messages", m);
    renderAllMessages();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveBtn.click();
  });
}

function normalizeGenerations(m) {
  if (m._gensNormalized) return;
  m._gensNormalized = true;
  const list = (m.variants || []).slice();
  const idx = list.indexOf(m.content);
  let pos = (typeof m.genPos === "number" && m.genPos >= 0 && m.genPos < list.length) ? m.genPos : (idx >= 0 ? idx : list.length);
  if (idx < 0) list.push(m.content);
  if (pos >= list.length) pos = list.length - 1;
  if (pos < 0) pos = 0;
  m.variants = list;
  m.genPos = pos;
  m.content = list[pos];
}

function generationInfo(m) {
  normalizeGenerations(m);
  const variants = m.variants || [];
  return { total: variants.length, pos: m.genPos };
}

async function switchGeneration(m, dir) {
  const { total, pos } = generationInfo(m);
  const target = Math.max(0, Math.min(total - 1, pos + dir));
  if (target === pos) return;
  m.content = m.variants[target];
  m.genPos = target;
  if (m.blocks) m.blocks = parseSceneBlocks(m.content, activeThread);
  m.isEdited = true;
  await pfrpDB.put("messages", m);
  renderAllMessages();
  UI.showToast("Generation " + (target + 1) + " of " + total);
}

async function editMessage(m) {
  const wrap = UI.el("div", "");
  const ta = UI.el("textarea", "textarea");
  ta.value = m.content;
  ta.style.minHeight = "140px";
  wrap.appendChild(ta);
  const row = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + " Save");
  save.addEventListener("click", async () => {
    normalizeGenerations(m);
    m.variants.push(ta.value);
    m.genPos = m.variants.length - 1;
    m.content = ta.value;
    if (m.blocks) m.blocks = parseSceneBlocks(m.content, activeThread);
    m.isEdited = true;
    await pfrpDB.put("messages", m);
    overlay.remove();
    renderAllMessages();
  });
  row.append(cancel, save);
  wrap.appendChild(row);
  const overlay = UI.openModal(wrap, { title: "Edit message", wide: true });
}

/* ---------------- CONTEXT PANEL ---------------- */
function closeCtxPanelVisual() {
  els.ctxwrap.classList.add("collapsed");
  els.ctxToggle.classList.remove("toggled");
}

function setCtx(open) {
  if (open && activeDrawer === "chars") return;
  els.ctxwrap.classList.toggle("collapsed", !open);
  els.ctxToggle.classList.toggle("toggled", open);
  if (open) applyCtxWidth();
  else els.ctxwrap.style.width = "";
  pfrpSettings.data.ui.ctxOpen = open;
  pfrpSettings.save();
}
function applyCtxWidth() {
  if (isMobileWidth() || els.ctxwrap.classList.contains("collapsed")) {
    els.ctxwrap.style.width = "";
    return;
  }
  const w = pfrpSettings.data.ui.ctxWidth || 310;
  els.ctxwrap.style.width = Math.min(Math.max(w, 300), Math.max(300, Math.floor(window.innerWidth * 0.6))) + "px";
}
function setContextChar(id) {
  contextChar = id ? (characters.find((x) => x.id === id) || null) : null;
  renderContext();
  if (id) setCtx(true);
}

function renderContext() {
  const wrap = els.ctx;
  wrap.innerHTML = "";
  const t = activeThread;
  const target = contextChar || activeCharacter || null;

  const head = UI.el("div", "ctx-head");
  head.appendChild(UI.el("i", target ? "fa-solid fa-address-card" : "fa-solid fa-sliders"));
  head.appendChild(document.createTextNode(target ? target.name : (t ? "Chat" : "Details")));
  const pr = UI.el("div", "pin-right");
  const pin = UI.el("button", "iconbtn", UI.fa("thumbtack"));
  pin.title = "Pin";
  const close = UI.el("button", "iconbtn", UI.fa("xmark"));
  close.title = "Close";
  close.addEventListener("click", () => setCtx(false));
  pr.append(pin, close);
  head.appendChild(pr);
  wrap.appendChild(head);

  if (target) {
    renderContextCharacter(wrap, target, t);
  } else {
    renderContextChat(wrap, t);
  }
}

function renderContextCharacter(wrap, c, t) {
  const card = UI.el("div", "ccard");
  const av = UI.el("div", "");
  av.innerHTML = avatarHtml(c);
  card.appendChild(av);
  card.appendChild(UI.el("h3", "", esc(c.name)));
  card.appendChild(UI.el("p", "", esc(c.tagline || c.description || "")));
  const tags = UI.el("div", "tags", (c.tags || []).map((x) => `<span class="tag">${esc(x)}</span>`).join(""));
  card.appendChild(tags);
  card.appendChild(UI.el("span", "tag", "Explicitness: " + pfrpSettings.explicitnessLabel(c.explicitness || pfrpSettings.data.nsfw.chatDefault)));
  wrap.appendChild(card);

  if (c.photos && c.photos.length) {
    const pcard = UI.el("div", "panel-card");
    pcard.appendChild(UI.el("h4", "", `${UI.fa("images")} Media`));
    const row = UI.el("div", "char-photos");
    for (const p of c.photos) {
      const img = UI.el("img", "");
      img.src = (typeof p === "string" ? p : p.url) || "";
      img.loading = "lazy";
      img.addEventListener("click", () => openPhotoModal(c, p));
      row.appendChild(img);
    }
    pcard.appendChild(row);
    wrap.appendChild(pcard);
  }

  const tabs = UI.el("div", "tabbar");
  const tabDefs = [
    { id: "persona", icon: "person", label: "Persona" },
    { id: "chat", icon: "sliders", label: "Chat" },
    { id: "memory", icon: "brain", label: "Memory" },
  ];
  for (const td of tabDefs) {
    const b = UI.el("button", "stab" + (chatContextTab === td.id ? " active" : ""), `${UI.fa(td.icon)} ${td.label}`);
    b.addEventListener("click", () => {
      chatContextTab = td.id;
      renderContext();
    });
    tabs.appendChild(b);
  }
  wrap.appendChild(tabs);

  if (chatContextTab === "chat") {
    const pcard = UI.el("div", "panel-card");
    pcard.appendChild(UI.el("h4", "", `${UI.fa("sliders")} Character Defaults`));
    pcard.appendChild(UI.el("label", "field-label", "Explicitness"));
    pcard.appendChild(segControl(EXPLICITNESS, c.explicitness || pfrpSettings.data.nsfw.chatDefault, async (v) => {
      c.explicitness = v;
      await pfrpDB.put("characters", c);
    }));
    pcard.appendChild(UI.el("div", "hint", "Per-chat settings appear once you start a chat with this character."));
    wrap.appendChild(pcard);
  } else if (chatContextTab === "memory") {
    const pcard = UI.el("div", "panel-card");
    pcard.appendChild(UI.el("h4", "", `${UI.fa("brain")} Memory Notes`));
    pcard.appendChild(UI.el("div", "hint", "Facts about this character that the AI should always remember in chats with them."));
    pcard.appendChild(UI.el("textarea", "textarea ctx-memory", esc(c.memory || "")));
    const ta = pcard.querySelector("textarea");
    ta.placeholder = "e.g. Prefers tea over coffee; allergic to bees; owes a debt to the night market boss...";
    let memTimer = null;
    ta.addEventListener("input", () => {
      clearTimeout(memTimer);
      memTimer = setTimeout(async () => {
        c.memory = ta.value.trim() || "";
        await pfrpDB.put("characters", c);
      }, 600);
    });
    const loreForChar = loreEntries.filter((e) => e.enabled !== false && e.characterId === c.id);
    if (loreForChar.length) {
      pcard.appendChild(UI.el("div", "spacer-h", ""));
      pcard.appendChild(UI.el("h4", "", `${UI.fa("book")} Character Lore`));
      for (const e of loreForChar) {
        pcard.appendChild(UI.el("div", "field", `<b>${esc(e.name || "Untitled")}</b><br>${esc(e.content)}`));
      }
    }
    wrap.appendChild(pcard);
  } else {
    const pcard = UI.el("div", "panel-card");
    pcard.appendChild(UI.el("h4", "", `${UI.fa("address-card")} Details`));
    const persona = threadPersona(activeThread) || pfrpSettings.activePersona();
    const r = (txt) => applyTemplateVars(txt, c, persona);
    pcard.appendChild(UI.el("div", "field", `<b>Description</b><br>${esc(r(c.description) || "None")}`));
    pcard.appendChild(UI.el("div", "field", `<b>Personality</b><br>${esc(r(c.personality) || "None")}`));
    pcard.appendChild(UI.el("div", "field", `<b>How they treat you</b><br>${esc(r(c.attitude) || "None")}`));
    pcard.appendChild(UI.el("div", "field", `<b>Appearance</b><br>${esc(r(c.appearance) || "None")}`));
    pcard.appendChild(UI.el("div", "field", `<b>Scenario</b><br>${esc(r(c.scenario) || "None")}`));
    pcard.appendChild(UI.el("div", "field", `<b>First message</b><br>${esc(r(c.first_mes) || "None")}`));
    wrap.appendChild(pcard);
  }
}

function trackerFieldInput(t, scope, key, value, label, icon, charId) {
  const g = UI.el("div", "tracker-field");
  g.appendChild(UI.el("label", "field-label", `${UI.fa(icon)} ${label}`));
  const input = UI.el("textarea", "input tracker-field-ta");
  input.rows = 1;
  input.value = value || "";
  input.placeholder = "Not set yet";
  g.appendChild(input);
  const autoGrow = () => {
    input.style.height = "auto";
    input.style.height = Math.max(38, input.scrollHeight) + "px";
  };
  let timer = null;
  input.addEventListener("input", () => {
    autoGrow();
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const tr = ensureTracker(t);
      const v = input.value.trim();
      if (scope === "env") {
        tr.env[key] = v;
      } else {
        tr.chars[charId] = tr.chars[charId] || {};
        tr.chars[charId][key] = v;
      }
      await pfrpDB.put("threads", t);
    }, 500);
  });
  requestAnimationFrame(autoGrow);
  return g;
}

function trackerControlsUI(t) {
  const tr = ensureTracker(t);
  const card = UI.el("div", "panel-card");
  card.appendChild(UI.el("h4", "", `${UI.fa("book-open")} Story Tracker`));

  const members = sceneMembers(t);
  const enabledEnv = TRACKER_FIELDS.env.filter((f) => trackerEnabled(t, f.key));
  const enabledChars = TRACKER_FIELDS.chars.filter((f) => trackerEnabled(t, f.key));
  const hasAny = enabledEnv.length || enabledChars.length;

  const subTabs = [];
  if (enabledEnv.length) subTabs.push({ id: "world", icon: "globe", label: "World" });
  if (enabledChars.length) {
    for (const c of members) subTabs.push({ id: "char:" + c.id, icon: "", label: c.name });
  }

  if (!subTabs.length) {
    const state = UI.el("div", "tracker-state");
    state.appendChild(UI.el("div", "field-label", "Tracked information"));
    state.appendChild(UI.el("div", "hint", "Enable fields below to start tracking. The AI fills these in as the story moves, and you can edit them any time."));
    card.appendChild(state);
  } else {
    if (!subTabs.some((s) => s.id === trackerSubTab)) trackerSubTab = subTabs[0].id;

    const subTabbar = UI.el("div", "tabbar tracker-subtabbar");
    for (const s of subTabs) {
      const b = UI.el("button", "stab" + (trackerSubTab === s.id ? " active" : ""), s.icon ? `${UI.fa(s.icon)} ${esc(s.label)}` : esc(s.label));
      b.addEventListener("click", () => {
        trackerSubTab = s.id;
        renderContext();
      });
      subTabbar.appendChild(b);
    }
    card.appendChild(subTabbar);

    const state = UI.el("div", "tracker-state");
    if (trackerSubTab === "world") {
      state.appendChild(UI.el("div", "field-label", "World"));
      for (const f of enabledEnv) {
        state.appendChild(trackerFieldInput(t, "env", f.key, tr.env[f.key] || "", f.label, f.icon));
      }
    } else {
      const cid = parseInt(trackerSubTab.slice(5), 10);
      const c = members.find((x) => x.id === cid);
      if (c) {
        const cs = tr.chars && tr.chars[c.id];
        state.appendChild(UI.el("div", "field-label", esc(c.name)));
        for (const f of enabledChars) {
          state.appendChild(trackerFieldInput(t, "char", f.key, cs ? (cs[f.key] || "") : "", f.label, f.icon, c.id));
        }
      }
    }
    card.appendChild(state);
  }

  const toggleHead = UI.el("button", "tracker-collapse-head");
  toggleHead.innerHTML = `${UI.fa("toggle-on")} <span>Tracking options</span> <i class="fa-solid fa-chevron-down tracker-caret"></i>`;
  const toggleBody = UI.el("div", "tracker-collapse-body hidden");
  const toggle = async (key, sw) => {
    tr.enabled[key] = !tr.enabled[key];
    sw.classList.toggle("on", tr.enabled[key]);
    await pfrpDB.put("threads", t);
    renderContext();
  };
  const buildToggles = () => {
    toggleBody.innerHTML = "";
    toggleBody.appendChild(UI.el("div", "field-label", "Environment"));
    for (const f of TRACKER_FIELDS.env) {
      const row = UI.el("div", "rowline");
      row.appendChild(UI.el("span", "", `${UI.fa(f.icon)} ${f.label}`));
      const sw = UI.el("div", "switch" + (tr.enabled[f.key] ? " on" : ""));
      sw.addEventListener("click", () => toggle(f.key, sw));
      row.appendChild(sw);
      toggleBody.appendChild(row);
    }
    if (members.length) {
      toggleBody.appendChild(UI.el("div", "spacer-h", ""));
      toggleBody.appendChild(UI.el("div", "field-label", "Characters"));
      for (const f of TRACKER_FIELDS.chars) {
        const row = UI.el("div", "rowline");
        row.appendChild(UI.el("span", "", `${UI.fa(f.icon)} ${f.label}`));
        const sw = UI.el("div", "switch" + (tr.enabled[f.key] ? " on" : ""));
        sw.addEventListener("click", () => toggle(f.key, sw));
        row.appendChild(sw);
        toggleBody.appendChild(row);
      }
    }
  };
  buildToggles();
  toggleHead.addEventListener("click", () => {
    const hidden = toggleBody.classList.toggle("hidden");
    const caret = toggleHead.querySelector(".tracker-caret");
    if (caret) caret.className = "fa-solid " + (hidden ? "fa-chevron-down" : "fa-chevron-up") + " tracker-caret";
  });
  card.appendChild(toggleHead);
  card.appendChild(toggleBody);

  card.appendChild(UI.el("div", "hint", "When a field is on, the AI updates it in the background as the story changes, and it is injected into every prompt to keep the story consistent."));
  return card;
}

function renderContextChat(wrap, t) {
  if (!t) {
    const pcard = UI.el("div", "panel-card");
    pcard.appendChild(UI.el("h4", "", `${UI.fa("circle-info")} No Selection`));
    pcard.appendChild(UI.el("div", "hint", "Open a chat to see its details and settings, or click a character to view their profile."));
    wrap.appendChild(pcard);
    return;
  }

  const tabDefs = [
    { id: "settings", icon: "sliders", label: "Settings" },
    { id: "details", icon: "comments", label: "Details" },
    { id: "tracker", icon: "book-open", label: "Tracker" },
    { id: "memory", icon: "brain", label: "Memory" },
  ];
  const tabs = UI.el("div", "tabbar");
  for (const td of tabDefs) {
    const b = UI.el("button", "stab" + (chatSettingsTab === td.id ? " active" : ""), `${UI.fa(td.icon)} ${td.label}`);
    b.addEventListener("click", () => {
      chatSettingsTab = td.id;
      renderContext();
    });
    tabs.appendChild(b);
  }
  wrap.appendChild(tabs);

  if (chatSettingsTab === "details") {
    wrap.appendChild(chatDetailsUI(t));
  } else if (chatSettingsTab === "tracker") {
    wrap.appendChild(trackerControlsUI(t));
  } else if (chatSettingsTab === "memory") {
    wrap.appendChild(chatMemoryUI(t));
  } else {
    wrap.appendChild(chatSettingsUI(t));
  }
}

function chatDetailsUI(t) {
  const info = UI.el("div", "panel-card");
  info.appendChild(UI.el("h4", "", `${UI.fa("comments")} Chat Details`));
  const memberNames = t.isGroup ? t.memberNames.join(", ") : (t.character ? t.character.name : "None");

  const avUpload = UI.el("label", "avatar-upload");
  const avInput = UI.el("input", "input");
  avInput.type = "file";
  avInput.accept = "image/*";
  const avPrev = UI.el("div", "av");
  const chatImg = threadAvatarDataUrl(t);
  if (chatImg) avPrev.innerHTML = `<img src="${chatImg}" alt="">`;
  else avPrev.textContent = memberNames ? memberNames[0].toUpperCase() : "?";
  avPrev.appendChild(UI.el("span", "avatar-edit", UI.fa("camera") + " <span>Change</span>"));
  avUpload.append(avInput, avPrev);
  const avRow = UI.el("div", "rowline");
  avRow.appendChild(UI.el("span", "", "Chat image"));
  avRow.appendChild(avUpload);
  info.appendChild(avRow);
  avInput.addEventListener("change", () => {
    const file = avInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      t.avatar = reader.result;
      await pfrpDB.put("threads", t);
      avPrev.innerHTML = `<img src="${t.avatar}" alt="">`;
      avPrev.appendChild(UI.el("span", "avatar-edit", UI.fa("camera") + " <span>Change</span>"));
      renderThreadUI();
      renderChatsDrawer();
      UI.showToast("Chat image updated");
    };
    reader.readAsDataURL(file);
  });

  info.appendChild(UI.el("div", "field", `<b>Name</b><br>${esc(t.name)}`));
  info.appendChild(UI.el("div", "field", `<b>Characters</b><br>${esc(memberNames)}`));
  info.appendChild(UI.el("div", "field", `<b>Type</b><br>${t.isGroup ? "Group" : "Individual"}`));
  info.appendChild(UI.el("div", "field", `<b>Messages</b><br>${activeMessages.length}`));

  const personaCard = UI.el("div", "panel-card");
  personaCard.appendChild(UI.el("h4", "", `${UI.fa("user")} You`));
  personaCard.appendChild(personaSelectControl(
    () => t.userPersonaId || pfrpSettings.data.activePersonaId,
    async (id) => {
      t.userPersonaId = id;
      await pfrpDB.put("threads", t);
      UI.showToast("Persona updated for this chat");
    },
    { hintText: "This chat's persona  -  how the characters see you. Falls back to your active persona." }
  ));

  const wrap = UI.el("div", "ctx-stack");
  wrap.appendChild(info);
  wrap.appendChild(personaCard);
  return wrap;
}

function chatSettingsUI(t) {
  const settings = UI.el("div", "panel-card");
  settings.appendChild(UI.el("h4", "", `${UI.fa("sliders")} Chat Settings`));
  settings.appendChild(UI.el("label", "field-label", "Explicitness"));
  settings.appendChild(segControl(EXPLICITNESS, t.explicitness, async (v) => {
    t.explicitness = v;
    await pfrpDB.put("threads", t);
  }));
  settings.appendChild(UI.el("div", "spacer-h", ""));

  const smRow = UI.el("div", "rowline");
  smRow.appendChild(UI.el("span", "", "Scene mode"));
  const smSw = UI.el("div", "switch" + (t.sceneMode ? " on" : ""));
  smSw.addEventListener("click", async () => {
    t.sceneMode = !t.sceneMode;
    smSw.classList.toggle("on", t.sceneMode);
    await pfrpDB.put("threads", t);
  });
  smRow.appendChild(smSw);
  settings.appendChild(smRow);
  settings.appendChild(UI.el("div", "hint", "One response writes the whole scene - several characters and narrator beats interleaved, regenerated and deleted as a single unit."));
  settings.appendChild(UI.el("div", "spacer-h", ""));

  const saRow = UI.el("div", "rowline");
  saRow.appendChild(UI.el("span", "", "Suggested actions"));
  const saSw = UI.el("div", "switch" + (t.suggestedActions ? " on" : ""));
  saSw.addEventListener("click", async () => {
    t.suggestedActions = !t.suggestedActions;
    saSw.classList.toggle("on", t.suggestedActions);
    await pfrpDB.put("threads", t);
    if (!t.suggestedActions) t.suggestions = [];
    renderSuggestedActions();
  });
  saRow.appendChild(saSw);
  settings.appendChild(saRow);
  settings.appendChild(UI.el("div", "hint", "After each reply, offers 4 things you can do next - pick one or type your own."));
  settings.appendChild(UI.el("div", "spacer-h", ""));

  settings.appendChild(UI.el("label", "field-label", "Story"));
  settings.appendChild(storyControls(
    (k) => storySetting(t, k),
    async (k, v) => {
      t[k] = v;
      await pfrpDB.put("threads", t);
    }
  ));
  settings.appendChild(UI.el("div", "hint", "Overrides the global story defaults for this chat."));
  settings.appendChild(UI.el("div", "spacer-h", ""));
  if (t.isGroup) {
    const arRow = UI.el("div", "rowline");
    arRow.appendChild(UI.el("span", "", "Auto-respond"));
    const arSw = UI.el("div", "switch" + (t.autoRespond !== false ? " on" : ""));
    arSw.addEventListener("click", async () => {
      t.autoRespond = t.autoRespond === false;
      arSw.classList.toggle("on", t.autoRespond);
      await pfrpDB.put("threads", t);
      renderSpeakerRow();
    });
    arRow.appendChild(arSw);
    settings.appendChild(arRow);
    settings.appendChild(UI.el("div", "hint", "When off, no character replies automatically  -  pick one from the composer instead."));
    settings.appendChild(UI.el("div", "spacer-h", ""));

    const mtRow = UI.el("div", "rowline");
    mtRow.appendChild(UI.el("span", "", "Multi-turn replies"));
    const mtSw = UI.el("div", "switch" + (t.multiTurn !== false ? " on" : ""));
    mtSw.addEventListener("click", async () => {
      t.multiTurn = t.multiTurn === false;
      mtSw.classList.toggle("on", t.multiTurn);
      await pfrpDB.put("threads", t);
    });
    mtRow.appendChild(mtSw);
    settings.appendChild(mtRow);
    settings.appendChild(UI.el("div", "hint", "Characters can talk back and forth between your messages  -  up to 3 replies before waiting for you."));
    settings.appendChild(UI.el("div", "spacer-h", ""));
  }
  settings.appendChild(UI.el("label", "field-label", "Temperature"));
  settings.appendChild(temperatureControl(
    () => (t.temperature != null ? t.temperature : 1),
    async (v) => {
      t.temperature = v;
      await pfrpDB.put("threads", t);
    },
    { help: "Temperature controls how creative or focused this chat's responses are:<br><br>0.0-0.4  -  focused and predictable<br>0.5-0.9  -  balanced, natural roleplay voice<br>1.0+  -  very creative and unpredictable" }
  ));
  settings.appendChild(UI.el("div", "spacer-h", ""));
  settings.appendChild(UI.el("label", "field-label", "Model"));
  settings.appendChild(buildModelControl(t));
  return settings;
}

function chatMemoryUI(t) {
  const memory = UI.el("div", "panel-card");
  memory.appendChild(UI.el("h4", "", `${UI.fa("brain")} Memory & Summary`));
  memory.appendChild(UI.el("label", "field-label", "Chat memory"));
  memory.appendChild(UI.el("textarea", "textarea ctx-memory", esc(t.memory || "")));
  const memTa = memory.querySelector("textarea");
  memTa.placeholder = "Facts the AI should always remember in this chat...";
  let memTimer = null;
  memTa.addEventListener("input", () => {
    clearTimeout(memTimer);
    memTimer = setTimeout(async () => {
      t.memory = memTa.value.trim() || "";
      await pfrpDB.put("threads", t);
    }, 600);
  });
  memory.appendChild(UI.el("div", "hint", "Injected into every prompt for this chat."));
  memory.appendChild(UI.el("div", "spacer-h", ""));
  memory.appendChild(UI.el("h4", "", `${UI.fa("scroll")} Story Summary`));
  const sumText = UI.el("div", "field summary-box", esc(t.summary || "No summary yet. It builds up automatically as the chat grows long."));
  memory.appendChild(sumText);
  const sumRow = UI.el("div", "key-row");
  const sumNow = UI.el("button", "btn", UI.fa("wand-magic-sparkles") + " Summarize now");
  sumNow.addEventListener("click", () => summarizeNow(t));
  const clearSum = UI.el("button", "btn ghost", UI.fa("broom") + " Clear");
  clearSum.addEventListener("click", async () => {
    t.summary = "";
    t.summarizedUpToOrder = 0;
    await pfrpDB.put("threads", t);
    renderContext();
    UI.showToast("Summary cleared");
  });
  sumRow.append(sumNow, clearSum);
  memory.appendChild(sumRow);
  return memory;
}

function openPhotoModal(c, photo) {
  const url = (typeof photo === "string" ? photo : photo.url) || "";
  const wrap = UI.el("div", "");
  const img = UI.el("img", "img-view-img");
  img.src = url;
  wrap.appendChild(img);
  const act = UI.el("div", "modal-actions");
  const avatar = UI.el("button", "btn primary", UI.fa("user") + " Set as avatar");
  avatar.addEventListener("click", async () => {
    c.avatar = url;
    c.updatedAt = Date.now();
    await pfrpDB.put("characters", c);
    await loadData();
    overlay.remove();
    renderCenter();
    UI.showToast("Avatar updated");
  });
  const del = UI.el("button", "btn danger", UI.fa("trash") + " Remove photo");
  del.addEventListener("click", async () => {
    c.photos = (c.photos || []).filter((x) => x !== photo);
    await pfrpDB.put("characters", c);
    await loadData();
    overlay.remove();
    renderCenter();
    UI.showToast("Photo removed");
  });
  act.append(avatar, del);
  wrap.appendChild(act);
  const overlay = UI.openModal(wrap, { title: "Photo" });
}

/* ---------------- EVENTS / INIT ---------------- */

function initEvents() {
  document.querySelectorAll(".rail-btn[data-drawer]").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.drawer === activeDrawer && !els.drawer.classList.contains("collapsed")) {
        setDrawerOpen(false);
        return;
      }
      setDrawer(b.dataset.drawer);
    });
  });

  els.railLogo.addEventListener("click", () => {
    setDrawer("chats");
    if (!activeThread) closeThread();
  });

  els.dSearch.addEventListener("input", () => {
    const q = els.dSearch.value.toLowerCase();
    els.dList.querySelectorAll(".d-item").forEach((el) => {
      const txt = (el.textContent || "").toLowerCase();
      el.style.display = txt.includes(q) ? "" : "none";
    });
  });

  els.createBtn.addEventListener("click", () => {
    const d = DRAWERS[activeDrawer];
    if (!d || !d.create) return;
    if (d.create === "char") {
      newCharacterChooser();
    } else if (d.create === "chat") {
      newChatChooser();
    } else if (d.create === "lore") {
      newLoreBook();
    } else if (d.create === "image") {
      openGenerateImageModal();
    } else if (d.create === "scene") {
      openSceneEditor(null);
    } else {
      UI.showToast(d.title + " creation coming in a later step");
    }
  });

  els.settingsBtn.addEventListener("click", openSettingsModal);

  els.drawerMenu.addEventListener("click", () => {
    const d = DRAWERS[activeDrawer];
    if (d && d.folders) manageFoldersModal(d.folders);
  });

  els.dCollapse.addEventListener("click", () => setDrawerOpen(false));

  const resizeHandle = UI.el("div", "ctx-resize");
  els.ctxwrap.appendChild(resizeHandle);
  applyCtxWidth();
  window.addEventListener("resize", applyCtxWidth);
  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizeHandle.classList.add("active");
    const startX = e.clientX;
    const startW = els.ctxwrap.getBoundingClientRect().width;
    const onMove = (ev) => {
      const w = Math.min(Math.max(startW - (ev.clientX - startX), 300), Math.max(300, Math.floor(window.innerWidth * 0.6)));
      els.ctxwrap.style.width = w + "px";
    };
    const onUp = () => {
      resizeHandle.classList.remove("active");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      pfrpSettings.data.ui.ctxWidth = Math.round(els.ctxwrap.getBoundingClientRect().width);
      pfrpSettings.save();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  els.ctxToggle.addEventListener("click", () => {
    if (activeDrawer === "chars") return;
    const open = !els.ctxwrap.classList.contains("collapsed");
    const isChatView = !contextChar && !!activeThread;
    if (open && isChatView) {
      setCtx(false);
      return;
    }
    if (!activeThread) {
      UI.showToast("Open a chat to view its settings", { type: "err" });
      return;
    }
    contextChar = null;
    chatContextTab = "chat";
    setCtx(true);
    renderContext();
  });

  els.sendBtn.addEventListener("click", sendMessage);
  els.guidedBtn.addEventListener("click", () => {
    composerGuided = !composerGuided;
    els.guidedBtn.classList.toggle("toggled", composerGuided);
    updateInputPlaceholder();
    if (composerGuided) UI.showToast("Guided mode: your text drafts the selected speaker's reply");
  });
  els.stopBtn.addEventListener("click", () => {
    const t = activeThread;
    if (t && streams.has(t.id)) {
      streams.get(t.id).ac.abort();
    }
  });
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  els.input.addEventListener("input", () => {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 8 * parseFloat(getComputedStyle(els.input).lineHeight)) + "px";
  });
  els.imgBtn.addEventListener("click", openGenerateImageModal);
  els.helpWrite.addEventListener("click", () => UI.showToast("Help-me-write coming in a later step"));
}

function isMobileWidth() {
  return window.innerWidth <= 700;
}

async function init() {
  initWelcome();
  applyTheme();
  applyCompactMode();
  renderCenter();
  renderContext();
  await loadData();
  await ensureSeedCharacters();
  await loadData();
  await loadModelCache();
  const ui = pfrpSettings.data.ui;
  const desiredOpen = isMobileWidth() ? false : ui.drawerOpen !== false;
  setDrawer(DRAWERS[ui.lastDrawer] ? ui.lastDrawer : "chats");
  setDrawerOpen(desiredOpen);
  setCtx(false);
  Sync.init();
  initEvents();
  setupImportDrop();
  renderCenter();
}

init();
