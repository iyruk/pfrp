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
  sendBtn: $("sendBtn"),
  stopBtn: $("stopBtn"),
  attachBtn: $("attachBtn"),
  helpWrite: $("helpWrite"),
  imgBtn: $("imgBtn"),
  modelSelect: $("modelSelect"),
  modelRefresh: $("modelRefresh"),
  ctxToggle: $("ctxToggle"),
  ctxwrap: $("ctxwrap"),
  ctx: $("ctx"),
  gateOverlay: $("gateOverlay"),
  gateYes: $("gateYes"),
  gateNo: $("gateNo"),
  charDot: $("charDot"),
};

let activeDrawer = "chats";
let characters = [];
let threads = [];
let activeThread = null;
let activeCharacter = null;
let contextChar = null;
let activeMessages = [];
let streams = new Map();
let chatContextTab = "persona";
let modelCache = [];
let prevDrawer = null;

function isGenerating(threadId) {
  return streams.has(threadId);
}

function currentThreadModel() {
  return (activeThread && activeThread.modelName) || pfrpSettings.data.model;
}

async function loadModelCache() {
  try {
    const data = await Provider.listModels();
    modelCache = (data.data || []).map((m) => m.id).filter(Boolean).sort();
  } catch {
    modelCache = [];
  }
}

function updateModelSelect() {
  if (!els.modelSelect) return;
  if (!activeThread) {
    els.modelSelect.style.display = "none";
    els.modelRefresh.style.display = "none";
    return;
  }
  const current = currentThreadModel();
  const options = new Set(modelCache);
  if (current) options.add(current);
  els.modelSelect.innerHTML = "";
  for (const id of options) {
    const o = UI.el("option", "", id);
    els.modelSelect.appendChild(o);
  }
  els.modelSelect.value = current || "";
  els.modelSelect.style.display = "";
  els.modelRefresh.style.display = "";
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

/* ---------------- GATE ---------------- */
function initGate() {
  if (pfrpSettings.gatePassed()) {
    els.gateOverlay.remove();
    return;
  }
  els.gateOverlay.style.display = "flex";
  els.gateYes.addEventListener("click", () => {
    pfrpSettings.setGatePassed();
    els.gateOverlay.remove();
    UI.showToast("Welcome to pfrp");
  });
  els.gateNo.addEventListener("click", () => {
    document.body.innerHTML = "<div style='display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-dim)'>You must be 18 or older to use this application.</div>";
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
}
function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------------- DRAWER ---------------- */
const DRAWERS = {
  chats: { icon: "comments", title: "Chats", build: renderChatsDrawer, create: "chat" },
  chars: { icon: "masks-theater", title: "Characters", build: renderCharsDrawer, create: "char" },
  images: { icon: "images", title: "Images", build: renderImagesDrawer, create: "image" },
  lore: { icon: "book", title: "Lore", build: renderLoreDrawer, create: "lore" },
  account: { icon: "circle-user", title: "Account", build: renderAccountDrawer, create: null },
};

function setDrawer(key) {
  const changed = prevDrawer !== key;
  prevDrawer = key;
  activeDrawer = key;
  contextChar = null;
  setCtx(false);
  document.querySelectorAll(".rail-btn[data-drawer]").forEach((b) => {
    b.classList.toggle("active", b.dataset.drawer === key);
  });
  const d = DRAWERS[key];
  els.dTitle.innerHTML = `${UI.fa(d.icon)}${d.title}`;
  d.build();
  els.dSearch.value = "";
  els.createBtn.style.display = d.create ? "" : "none";
  els.createBtn.title = "Create " + d.title.toLowerCase().replace(/s$/, "");
  pfrpSettings.data.ui.lastDrawer = key;
  pfrpSettings.save();
  openDrawer();
  if (changed) restoreDrawerSelection(key);
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
  } else {
    clearCenterSelection();
    renderEmptySelection(key);
  }
}

function clearCenterSelection() {
  activeThread = null;
  activeCharacter = null;
  activeMessages = [];
  contextChar = null;
  renderCenter();
}

function setDrawerOpen(open) {
  els.drawer.classList.toggle("collapsed", !open);
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
      els.rail.appendChild(pin);
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

function userAvatarHtml() {
  const u = pfrpSettings.data.user;
  const initial = (u.name ? u.name[0] : "U").toUpperCase();
  if (u.avatar) {
    return `<div class="av"><img src="${u.avatar}" alt=""></div>`;
  }
  return `<div class="av" style="background:linear-gradient(135deg,#22d3ee,#6366f1)">${initial}</div>`;
}

function renderChatsDrawer() {
  const list = threads.slice().sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
  els.dList.innerHTML = list.length
    ? list
        .map(
          (t) => `<div class="d-item ${activeThread && activeThread.id === t.id ? "active" : ""} ${isGenerating(t.id) ? "generating" : ""}" data-thread="${t.id}">
            ${avatarHtml(t.character, "")}
            <div class="d-body"><div class="d-name">${esc(t.name)}</div><div class="d-sub">${isGenerating(t.id) ? "generating…" : t.isGroup ? t.memberNames.join(", ") : esc((t.character && t.character.name) || "") + " · " + (t.isGroup ? "group" : "Individual")}</div></div>
            ${isGenerating(t.id) ? `<span class="d-spin"></span>` : `<button class="d-menu" data-threadmenu="${t.id}" title="More">${UI.fa("ellipsis")}</button>`}
          </div>`
        )
        .join("")
    : `<div class="empty"><p>No chats yet. Create one to begin.</p></div>`;
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
  els.dList.innerHTML = "";

  const main = characters.length
    ? characters
        .map(
          (c) => `<div class="d-item" data-char="${c.id}">
            ${avatarHtml(c)}
            <div class="d-body"><div class="d-name">${esc(c.name)}</div><div class="d-sub">${esc(c.tagline || c.description || "")}</div></div>
            <button class="d-menu" data-charmenu="${c.id}" title="More">${UI.fa("ellipsis")}</button>
          </div>`
        )
        .join("")
    : `<div class="empty"><p>No characters yet. Create one or import a character card.</p></div>`;

  const missing = missingSeedCharacters();
  const examples = missing.length
    ? `<div class="d-sec">Example characters</div>` +
      missing
        .map(
          (s) => `<div class="d-item example-item" data-example="${s.seedId}">
            <div class="av" style="background:linear-gradient(135deg,var(--accent1),var(--accent2))">${s.avatar && s.avatar.startsWith("data:") ? `<img src="${s.avatar}" alt="">` : esc((s.name[0] || "?").toUpperCase())}</div>
            <div class="d-body"><div class="d-name">${esc(s.name)}</div><div class="d-sub">${esc(s.tagline || "")} · click to add</div></div>
            <button class="d-menu add" title="Add this character">${UI.fa("plus")}</button>
          </div>`
        )
        .join("")
    : "";

  els.dList.innerHTML = main + examples;

  els.dList.querySelectorAll(".d-item[data-char]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-charmenu]")) return;
      viewCharacter(parseInt(el.dataset.char));
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
        first_mes: seed.first_mes,
        explicitness: seed.explicitness,
        avatar: seed.avatar || "",
        tags: seed.seedId === "nova-sfw" ? ["example"] : ["example", "nsfw"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await loadData();
      UI.showToast("Added " + seed.name);
    });
  });
}

function renderImagesDrawer() {
  els.dList.innerHTML = `<div class="empty"><p>Image generation &amp; gallery coming in a later step.</p></div>`;
}

function renderLoreDrawer() {
  els.dList.innerHTML = `<div class="empty"><p>Lore books coming in a later step.</p></div>`;
}

function renderAccountDrawer() {
  els.dList.innerHTML = `<div class="empty"><p>Account &amp; user persona coming soon.</p></div>`;
}

function openSettingsModal() {
  const wrap = UI.el("div", "settings-tabs");
  const tabbar = UI.el("div", "seg");
  const body = UI.el("div", "settings-tab-body");

  const cats = [
    { id: "conn", label: "Connection", icon: "plug", build: buildConnectionSettings },
    { id: "nsfw", label: "Content", icon: "shield-halved", build: buildNsfwSettings },
    { id: "fmt", label: "Formatting", icon: "font", build: buildFormattingSettings },
    { id: "app", label: "Appearance", icon: "palette", build: buildThemeSettings },
    { id: "data", label: "Data", icon: "database", build: buildDataSettings },
  ];

  function show(id) {
    const cat = cats.find((c) => c.id === id);
    body.innerHTML = "";
    body.appendChild(cat.build());
    tabbar.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.id === id));
  }

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
  show("conn");
}

/* ---------------- SETTINGS BUILDERS ---------------- */
function buildConnectionSettings() {
  const wrap = UI.el("div", "");
  const s = pfrpSettings.data;

  const provWrap = UI.el("div", "form-group");
  provWrap.appendChild(UI.el("label", "field-label", "Provider"));
  const provSel = UI.el("select", "select");
  for (const [k, p] of Object.entries(PROVIDERS)) {
    const o = UI.el("option", "", p.label);
    o.value = k;
    provSel.appendChild(o);
  }
  provSel.value = s.provider;
  provWrap.appendChild(provSel);
  wrap.appendChild(provWrap);

  const urlWrap = UI.el("div", "form-group");
  urlWrap.appendChild(UI.el("label", "field-label", "Base URL"));
  const url = UI.el("input", "input");
  url.type = "text";
  url.value = s.baseUrl || PROVIDERS[s.provider].baseUrl;
  url.placeholder = PROVIDERS[s.provider].baseUrl;
  urlWrap.appendChild(url);
  wrap.appendChild(urlWrap);

  const keyWrap = UI.el("div", "form-group");
  keyWrap.appendChild(UI.el("label", "field-label", "API Key"));
  const keyRow = UI.el("div", "key-row");
  const key = UI.el("input", "input");
  key.type = "password";
  key.value = s.apiKey;
  key.placeholder = PROVIDERS[s.provider].needsKey ? "sk-..." : "not needed for Ollama";
  const eye = UI.el("button", "", UI.fa("eye"));
  eye.addEventListener("click", () => (key.type = key.type === "password" ? "text" : "password"));
  keyRow.append(key, eye);
  keyWrap.appendChild(keyRow);
  wrap.appendChild(keyWrap);

  const modelWrap = UI.el("div", "form-group");
  modelWrap.appendChild(UI.el("label", "field-label", "Model"));
  const modelRow = UI.el("div", "key-row");
  const model = UI.el("input", "input");
  model.type = "text";
  model.value = s.model || PROVIDERS[s.provider].defaultModel;
  model.placeholder = PROVIDERS[s.provider].defaultModel;
  const fetchBtn = UI.el("button", "", UI.fa("cloud-arrow-down") + " Fetch");
  modelRow.append(model, fetchBtn);
  modelWrap.appendChild(modelRow);
  wrap.appendChild(modelWrap);

  const sysWrap = UI.el("div", "form-group");
  sysWrap.appendChild(UI.el("label", "field-label", "Default system prompt"));
  const sys = UI.el("textarea", "textarea");
  sys.value = s.system;
  sys.placeholder = "Optional default system prompt for new chats…";
  sysWrap.appendChild(sys);
  wrap.appendChild(sysWrap);

  const status = UI.el("div", "status-line");
  const row = UI.el("div", "modal-actions");
  const test = UI.el("button", "btn", UI.fa("plug") + " Test connection");
  test.addEventListener("click", async () => {
    s.provider = provSel.value;
    s.baseUrl = url.value.trim();
    s.apiKey = key.value.trim();
    s.model = model.value.trim() || PROVIDERS[s.provider].defaultModel;
    s.system = sys.value;
    pfrpSettings.save();
    test.disabled = true;
    status.textContent = "Testing…";
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
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + " Save");
  save.addEventListener("click", () => {
    s.provider = provSel.value;
    s.baseUrl = url.value.trim();
    s.apiKey = key.value.trim();
    s.model = model.value.trim() || PROVIDERS[s.provider].defaultModel;
    s.system = sys.value;
    pfrpSettings.save();
    UI.showToast("Settings saved");
  });
  row.append(save, test);
  wrap.appendChild(row);
  wrap.appendChild(status);
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
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + " Save");
  save.addEventListener("click", () => { pfrpSettings.save(); UI.showToast("NSFW settings saved"); });
  wrap.appendChild(save);
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

  wrap.appendChild(UI.el("div", "fmt-preview", buildFmtPreviewHtml()));
  const saveWrap = UI.el("div", "fmt-save");
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

  const pcard = UI.el("div", "panel-card danger-zone");
  pcard.appendChild(UI.el("h4", "", `${UI.fa("triangle-exclamation")} Reset App Data`));
  pcard.appendChild(UI.el("div", "hint", "Deletes all local characters, chats, images, and settings, then reloads the app."));
  const btn = UI.el("button", "btn danger", UI.fa("trash") + " Reset app data");
  btn.addEventListener("click", async () => {
    const ok = await UI.confirmModal({
      title: "Reset all app data?",
      message: "This permanently deletes every character, chat, image, and your settings from this browser. This cannot be undone.",
      confirmText: "Reset everything",
    });
    if (ok) await resetAppData();
  });
  pcard.appendChild(btn);
  wrap.appendChild(pcard);

  wrap.appendChild(UI.el("div", "spacer-h", ""));
  const pcard2 = UI.el("div", "panel-card danger-zone");
  pcard2.appendChild(UI.el("h4", "", `${UI.fa("circle-info")} About`));
  pcard2.appendChild(UI.el("div", "hint", "Purple's RP — local roleplay app. Data never leaves this browser except direct calls to your configured AI/image providers."));
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

function showCharMenu(anchor, id) {
  const c = characters.find((x) => x.id === id);
  const wrap = UI.el("div", "");
  wrap.appendChild(choiceCard("pen", "Edit", "Edit " + esc(c.name), () => { overlay.remove(); openCharacterEditor(c); }));
  wrap.appendChild(choiceCard("file-arrow-up", "Export card", "PNG or JSON — compatible with SillyTavern, TavernAI, Agnai", () => {
    overlay.remove();
    exportCharacter(c);
  }));
  wrap.appendChild(choiceCard("trash", "Delete", "Remove " + esc(c.name), async () => {
    overlay.remove();
    const ok = await UI.confirmModal({ title: "Delete character?", message: `"${c.name}" will be permanently deleted.`, confirmText: "Delete" });
    if (ok) {
      await pfrpDB.del("characters", id);
      await loadData();
      UI.showToast("Character deleted");
    }
  }));
  const overlay = UI.openModal(wrap, { title: c.name });
}

function showThreadMenu(anchor, id) {
  const t = threads.find((x) => x.id === id);
  const wrap = UI.el("div", "");
  wrap.appendChild(choiceCard("trash", "Delete chat", "Delete \"" + esc(t.name) + "\"", async () => {
    overlay.remove();
    const ok = await UI.confirmModal({ title: "Delete chat?", message: `"${t.name}" and all its messages will be deleted.`, confirmText: "Delete" });
    if (ok) {
      await pfrpDB.del("threads", id);
      const all = await pfrpDB.getAll("messages");
      for (const m of all.filter((m) => m.threadId === id)) await pfrpDB.del("messages", m.id);
      if (activeThread && activeThread.id === id) closeThread();
      await loadData();
      UI.showToast("Chat deleted");
    }
  }));
  const overlay = UI.openModal(wrap, { title: t.name });
}

/* ---------------- CHARACTER EDITOR ---------------- */
function openCharacterEditor(c = {}) {
  const wrap = UI.el("div", "");
  const isNew = !c.id;

  const f = (label, ph, value, tag = "input") => {
    const g = UI.el("div", "form-group");
    g.appendChild(UI.el("label", "field-label", label));
    const el = UI.el(tag, tag === "textarea" ? "textarea" : "input");
    if (tag !== "textarea") {
      el.type = "text";
      el.placeholder = ph;
    } else {
      el.placeholder = ph;
    }
    el.value = value || "";
    g.appendChild(el);
    return { g, el };
  };

  const g1 = f("Name", "e.g. Seraphina", c.name);
  const g2 = f("Tagline", "Short description shown on cards", c.tagline);
  const g3 = f("Description", "Who they are, personality, backstory", c.description, "textarea");
  const g4 = f("First message", "The opening message (greeting)", c.first_mes, "textarea");
  const g5 = f("Scenario", "Setting / situation", c.scenario, "textarea");

  const nsfwG = UI.el("div", "form-group");
  nsfwG.appendChild(UI.el("label", "field-label", "Explicitness"));
  const seg = UI.el("div", "seg");
  for (const o of EXPLICITNESS) {
    const b = UI.el("button", o.value === (c.explicitness || pfrpSettings.data.nsfw.chatDefault) ? "active" : "", o.label);
    b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      wrap._explicitness = o.value;
    });
    seg.appendChild(b);
  }
  nsfwG.appendChild(seg);
  wrap._explicitness = c.explicitness || pfrpSettings.data.nsfw.chatDefault;

  const avatarG = UI.el("div", "form-group");
  avatarG.appendChild(UI.el("label", "field-label", "Avatar"));
  const avatarRow = UI.el("div", "key-row");
  const avatarInput = UI.el("input", "input");
  avatarInput.type = "file";
  avatarInput.accept = "image/*";
  const avatarPreview = UI.el("div", "av", c.avatar ? "" : "A");
  if (c.avatar) {
    avatarPreview.innerHTML = `<img src="${c.avatar}" alt="">`;
  }
  avatarRow.append(avatarInput, avatarPreview);
  avatarG.appendChild(avatarRow);
  let avatarData = c.avatar || "";
  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      avatarData = reader.result;
      avatarPreview.innerHTML = `<img src="${avatarData}" alt="">`;
    };
    reader.readAsDataURL(file);
  });

  const buttons = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const save = UI.el("button", "btn primary", UI.fa("floppy-disk") + (isNew ? " Create" : " Save"));
  save.addEventListener("click", async () => {
    const record = Object.assign({}, c, {
      name: g1.el.value.trim() || "Unnamed",
      tagline: g2.el.value.trim(),
      description: g3.el.value.trim(),
      first_mes: g4.el.value.trim(),
      scenario: g5.el.value.trim(),
      explicitness: wrap._explicitness,
      avatar: avatarData,
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
  buttons.append(cancel, save);

  wrap.append(g1.g, g2.g, g3.g, g4.g, g5.g, nsfwG, avatarG, buttons);
  const overlay = UI.openModal(wrap, { title: isNew ? "New character" : "Edit character", wide: true });
}

/* ---------------- IMPORT / EXPORT ---------------- */
async function importFiles(files) {
  const list = Array.from(files).filter((f) => /\.(png|json)$/i.test(f.name));
  if (!list.length) {
    UI.showToast("Drop a .png or .json character card", { type: "err" });
    return;
  }
  let ok = 0, fail = 0;
  for (const file of list) {
    try {
      const parsed = await Import.parseFile(file);
      for (const rec of parsed) {
        const record = Object.assign({}, rec, {
          explicitness: rec.explicitness || pfrpSettings.data.nsfw.chatDefault,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        delete record.created;
        delete record.temperature;
        await pfrpDB.add("characters", record);
        ok++;
      }
    } catch (e) {
      fail++;
      console.error("Import failed for", file.name, e);
    }
  }
  await loadData();
  if (ok) UI.showToast("Imported " + ok + " character" + (ok > 1 ? "s" : ""));
  if (fail) UI.showToast(fail + " file" + (fail > 1 ? "s" : "") + " failed to import", { type: "err" });
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
  for (const t of threads) {
    const c = characters.find((x) => x.id === t.characterId);
    t.character = c;
    t.memberNames = (t.characterIds || []).map((id) => (characters.find((x) => x.id === id) || {}).name || "?");
    if (!t.memberNames.length && c) t.memberNames = [c.name];
  }
  els.charDot.classList.toggle("hidden", characters.length === 0);
  DRAWERS[activeDrawer] && DRAWERS[activeDrawer].build();
}

async function createChatWithCharacter(characterId) {
  const c = characters.find((x) => x.id === characterId);
  const thread = {
    name: "Chat with " + c.name,
    characterId,
    characterIds: [characterId],
    isGroup: false,
    explicitness: pfrpSettings.data.nsfw.chatDefault,
    temperature: pfrpSettings.data.temperature,
    modelName: pfrpSettings.data.model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastMessageTime: Date.now(),
  };
  const id = await pfrpDB.add("threads", thread);
  await loadData();
  await openThread(id);
  return id;
}

async function startChatWithCharacter(characterId) {
  const c = characters.find((x) => x.id === characterId);
  if (c && c.first_mes) {
    const id = await createChatWithCharacter(characterId);
    const msg = { threadId: id, characterId, role: "assistant", name: c.name, content: c.first_mes, creationTime: Date.now(), order: 0 };
    await pfrpDB.add("messages", msg);
    await openThread(id);
    UI.showToast("Chat started");
  } else {
    await createChatWithCharacter(characterId);
    UI.showToast("Chat started");
  }
}

function startChatChooser(c) {
  const wrap = UI.el("div", "");
  wrap.appendChild(choiceCard("comment", "Individual Chat", "Chat with " + esc(c.name), () => {
    overlay.remove();
    startChatWithCharacter(c.id);
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
  wrap.appendChild(UI.el("p", "modal-desc", primary ? "Choose additional characters for the group. " + esc(primary.name) + " is included." : "Select the characters to include in the group."));

  const list = UI.el("div", "group-pick");
  const addChoice = (c) => {
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
  };
  if (primary) addChoice(primary);
  for (const c of others) addChoice(c);
  wrap.appendChild(list);

  const row = UI.el("div", "modal-actions");
  const cancel = UI.el("button", "btn ghost", "Cancel");
  cancel.addEventListener("click", () => overlay.remove());
  const create = UI.el("button", "btn primary", UI.fa("user-group") + " Create group chat");
  create.disabled = selected.size === 0;
  create.addEventListener("click", () => {
    overlay.remove();
    createGroupThread([...selected]);
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

async function createGroupThread(characterIds) {
  const chars = characterIds.map((id) => characters.find((c) => c.id === id)).filter(Boolean);
  if (!chars.length) return;
  const names = chars.map((c) => c.name);
  const thread = {
    name: names.join(", "),
    characterId: characterIds[0],
    characterIds,
    isGroup: true,
    explicitness: pfrpSettings.data.nsfw.chatDefault,
    temperature: pfrpSettings.data.temperature,
    modelName: pfrpSettings.data.model,
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
  for (const c of characters) {
    const b = UI.el("button", "choice");
    b.innerHTML = `${avatarHtml(c)}<div><b>${esc(c.name)}</b><span>${esc(c.tagline || c.description || "Start an individual chat")}</span></div>`;
    b.style.alignItems = "center";
    b.style.gap = "12px";
    b.addEventListener("click", () => {
      overlay.remove();
      startChatWithCharacter(c.id);
    });
    wrap.appendChild(b);
  }
  const overlay = UI.openModal(wrap, { title: "Start a new chat" });
}

async function openThread(id, silent = false) {
  const t = threads.find((x) => x.id === id);
  if (!t) return;
  activeThread = t;
  activeCharacter = null;
  contextChar = null;
  setCtx(false);
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
  updateModelSelect();
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
    updateModelSelect();
    return;
  }
  if (activeCharacter) {
    renderCharacterView(activeCharacter);
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
  activeCharacter = c;
  activeThread = null;
  activeMessages = [];
  contextChar = null;
  setCtx(false);
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

  const sections = [
    { title: "Description", icon: "align-left", text: c.description },
    { title: "Personality", icon: "person", text: c.personality },
    { title: "Scenario", icon: "map", text: c.scenario },
    { title: "First message", icon: "comment-dots", text: c.first_mes },
    { title: "Example dialogue", icon: "message", text: c.mes_example },
  ];
  const body = UI.el("div", "char-view-body");
  for (const s of sections) {
    if (!s.text) continue;
    const card = UI.el("div", "char-view-sec");
    card.appendChild(UI.el("h3", "", `${UI.fa(s.icon)} ${s.title}`));
    card.appendChild(UI.el("div", "char-view-sec-body", esc(s.text)));
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
  els.chatAvatar.innerHTML = c && c.avatar ? `<img src="${c.avatar}" alt="">` : (c ? c.name[0].toUpperCase() : "+");
  els.chatAvatar.style.background = "linear-gradient(135deg,var(--accent1),var(--accent2))";
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
  if (m.role === "user") return pfrpSettings.data.user.name || "You";
  if (m.name) return m.name;
  if (m.role === "system") return "System";
  return "Assistant";
}

function renderMessage(m) {
  const row = UI.el("div", "msg " + (m.role === "user" ? "user" : ""));
  const c = characters.find((x) => x.id === m.characterId);
  const clickable = m.role !== "user" && c;
  if (m.role === "user") {
    const userAv = UI.el("div", "");
    userAv.innerHTML = userAvatarHtml();
    row.appendChild(userAv);
  } else {
    const avWrap = UI.el("div", "");
    avWrap.innerHTML = avatarHtml(c, "");
    if (clickable) {
      avWrap.classList.add("av-click");
      avWrap.addEventListener("click", () => setContextChar(c.id));
    }
    row.appendChild(avWrap);
  }
  const bubble = UI.el("div", "bubble" + (m.isStreaming ? " streaming" : ""));
  const who = UI.el("span", "who" + (clickable ? " who-click" : ""), roleLabel(m));
  if (clickable) who.addEventListener("click", () => setContextChar(c.id));
  const body = UI.el("div", "body");
  if (m.isStreaming && !m.content) {
    body.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  } else {
    body.innerHTML = formatText(m.content);
    applyDefaultColor(body);
  }
  bubble.append(who, body);
  row.appendChild(bubble);

  const actions = UI.el("div", "msg-actions");
  if (!m.isStreaming) {
    const regen = UI.el("button", "iconbtn warn", UI.fa("rotate-right"));
    regen.title = "Regenerate";
    regen.addEventListener("click", () => regenerate(m));
    const edit = UI.el("button", "iconbtn", UI.fa("pen"));
    edit.title = "Edit";
    edit.addEventListener("click", () => editMessage(m));
    actions.append(regen, edit);
    if (m.variants && m.variants.length) {
      const vers = UI.el("button", "iconbtn", UI.fa("layer-group"));
      vers.title = m.variants.length + " previous generation" + (m.variants.length > 1 ? "s" : "");
      vers.addEventListener("click", () => versionsModal(m));
      actions.appendChild(vers);
    }
  }
  bubble.appendChild(actions);
  return row;
}

function formatText(text) {
  const f = pfrpSettings.data.formatting;
  let out = esc(text);
  const a = esc(f.actionsChar), q = esc(f.quotesChar), t = esc(f.thoughtsChar);
  const ac = f.actionsColor, qc = f.quotesColor, tc = f.thoughtsColor;
  if (f.actions && a) out = out.replace(new RegExp(escapeRe(a) + "([^*" + escapeRe(a) + "]+)" + escapeRe(a), "g"), `<span class="fmt-act" style="color:${ac}">$1</span>`);
  if (f.quotes && q) out = out.replace(new RegExp(escapeRe(q) + "([^\\n" + escapeRe(q) + "]+)" + escapeRe(q), "g"), `<span class="fmt-q" style="color:${qc}">$1</span>`);
  if (f.thoughts && t) out = out.replace(new RegExp(escapeRe(t) + "([^`\\n" + escapeRe(t) + "]+)" + escapeRe(t), "g"), `<span class="fmt-th" style="color:${tc}">$1</span>`);
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
function currentSystemPrompt() {
  const t = activeThread;
  const c = t && t.character;
  const parts = [];
  if (pfrpSettings.data.system.trim()) parts.push(pfrpSettings.data.system.trim());
  if (c) {
    if (c.description) parts.push("Character: " + c.name + "\n" + c.description);
    if (c.scenario) parts.push("Scenario: " + c.scenario);
    if (c.personality) parts.push("Personality: " + c.personality);
    parts.push(`The character "${c.name}" must stay in character.` + (t.explicitness === "explicit" ? " Explicit adult content is allowed." : t.explicitness === "suggestive" ? " Suggestive but not explicit content is allowed." : " Keep content non-explicit (SFW)."));
  }
  return parts.join("\n\n");
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text) return;
  const t = activeThread;
  if (!t) {
    UI.showToast("Open or create a chat first", { type: "err" });
    return;
  }
  if (isGenerating(t.id)) {
    UI.showToast("A response is already generating in this chat", { type: "err" });
    return;
  }
  if (!currentThreadModel()) {
    UI.showToast("Set a model in Settings first", { type: "err" });
    openSettingsModal();
    return;
  }

  els.input.value = "";
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

  const asstMsg = {
    threadId: t.id,
    role: "assistant",
    name: t.character ? t.character.name : "Assistant",
    characterId: t.characterId,
    content: "",
    creationTime: Date.now(),
    order: userMsg.order + 1,
    isStreaming: true,
    _live: true,
  };
  activeMessages.push(asstMsg);

  const ac = new AbortController();
  streams.set(t.id, { ac, placeholder: asstMsg });

  renderAllMessages();
  renderChatsDrawer();
  updateComposerState();

  const history = activeMessages
    .filter((m) => (m.role === "user" || m.role === "assistant") && !m._live)
    .map((m) => ({ role: m.role, content: m.content }));

  let full = "";
  try {
    for await (const chunk of Provider.stream(history, {
      system: currentSystemPrompt(),
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
    if (!full) full = ac.signal.aborted ? "(stopped)" : "(no response)";
    asstMsg.content = full;
    const id = await pfrpDB.add("messages", asstMsg);
    asstMsg.id = id;
    delete asstMsg.isStreaming;
    t.lastMessageTime = Date.now();
    t.updatedAt = Date.now();
    await pfrpDB.put("threads", t);
    await loadData();
    activeThread = threads.find((x) => x.id === t.id) || null;
    if (activeThread && activeThread.id === t.id) renderAllMessages();
    renderChatsDrawer();
    updateComposerState();
  }
}

async function regenerate(m) {
  const t = activeThread;
  if (!t) return;
  if (m.role !== "assistant" || m._live) return;
  if (isGenerating(t.id)) {
    UI.showToast("A response is already generating in this chat", { type: "err" });
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
    .map((x) => ({ role: x.role, content: x.content }));

  let full = "";
  try {
    for await (const chunk of Provider.stream(history, {
      system: currentSystemPrompt(),
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
      m.variants = m.variants || [];
      const last = m.variants[m.variants.length - 1];
      if (prevContent && prevContent !== last) m.variants.push(prevContent);
      m.content = full;
      await pfrpDB.put("messages", m);
    } else {
      m.content = prevContent;
    }
    if (activeThread && activeThread.id === t.id) renderAllMessages();
    renderChatsDrawer();
    updateComposerState();
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
}

function versionsModal(m) {
  const wrap = UI.el("div", "");
  const current = m.content;
  const all = [current, ...(m.variants || []).slice().reverse()];
  wrap.appendChild(UI.el("p", "modal-desc", "Choose which generation to show. The current version is listed first."));
  all.forEach((text, i) => {
    const preview = (text || "").length > 140 ? text.slice(0, 140) + "…" : text;
    const b = UI.el("button", "choice" + (i === 0 ? " sel" : ""), "");
    b.innerHTML = `<div><b>${i === 0 ? "Current" : i === 1 ? "Previous" : "Older"}</b><span>${esc(preview || "(empty)")}</span></div>`;
    b.addEventListener("click", async () => {
      if (i === 0) {
        overlay.remove();
        return;
      }
      const chosen = all[i];
      const variants = (m.variants || []).slice();
      const vi = variants.indexOf(chosen);
      if (vi >= 0) variants.splice(vi, 1);
      variants.push(m.content);
      m.content = chosen;
      m.variants = variants;
      m.isEdited = true;
      await pfrpDB.put("messages", m);
      overlay.remove();
      renderAllMessages();
      UI.showToast("Switched to a previous generation");
    });
    wrap.appendChild(b);
  });
  const overlay = UI.openModal(wrap, { title: "Message generations" });
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
    m.variants = m.variants || [];
    if (m.content) m.variants.push(m.content);
    m.content = ta.value;
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
function setCtx(open) {
  els.ctxwrap.classList.toggle("collapsed", !open);
  els.ctxToggle.classList.toggle("toggled", open);
  pfrpSettings.data.ui.ctxOpen = open;
  pfrpSettings.save();
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
    pcard.appendChild(UI.el("h4", "", `${UI.fa("brain")} Memory & Lore`));
    pcard.appendChild(UI.el("div", "hint", "Memory & lore features arrive in a later step."));
    wrap.appendChild(pcard);
  } else {
    const pcard = UI.el("div", "panel-card");
    pcard.appendChild(UI.el("h4", "", `${UI.fa("address-card")} Details`));
    pcard.appendChild(UI.el("div", "field", `<b>Description</b><br>${esc(c.description || "—")}`));
    pcard.appendChild(UI.el("div", "field", `<b>Personality</b><br>${esc(c.personality || "—")}`));
    pcard.appendChild(UI.el("div", "field", `<b>Scenario</b><br>${esc(c.scenario || "—")}`));
    pcard.appendChild(UI.el("div", "field", `<b>First message</b><br>${esc(c.first_mes || "—")}`));
    wrap.appendChild(pcard);
  }
}

function renderContextChat(wrap, t) {
  if (!t) {
    const pcard = UI.el("div", "panel-card");
    pcard.appendChild(UI.el("h4", "", `${UI.fa("circle-info")} No Selection`));
    pcard.appendChild(UI.el("div", "hint", "Open a chat to see its details and settings, or click a character to view their profile."));
    wrap.appendChild(pcard);
    return;
  }

  const info = UI.el("div", "panel-card");
  info.appendChild(UI.el("h4", "", `${UI.fa("comments")} Chat Details`));
  const memberNames = t.isGroup ? t.memberNames.join(", ") : (t.character ? t.character.name : "—");
  info.appendChild(UI.el("div", "field", `<b>Name</b><br>${esc(t.name)}`));
  info.appendChild(UI.el("div", "field", `<b>Characters</b><br>${esc(memberNames)}`));
  info.appendChild(UI.el("div", "field", `<b>Type</b><br>${t.isGroup ? "Group" : "Individual"}`));
  info.appendChild(UI.el("div", "field", `<b>Messages</b><br>${activeMessages.length}`));
  wrap.appendChild(info);

  const settings = UI.el("div", "panel-card");
  settings.appendChild(UI.el("h4", "", `${UI.fa("sliders")} Chat Settings`));
  settings.appendChild(UI.el("label", "field-label", "Explicitness"));
  settings.appendChild(segControl(EXPLICITNESS, t.explicitness, async (v) => {
    t.explicitness = v;
    await pfrpDB.put("threads", t);
  }));
  settings.appendChild(UI.el("div", "spacer-h", ""));
  settings.appendChild(UI.el("label", "field-label", "Temperature"));
  const tempRow = UI.el("div", "key-row");
  const temp = UI.el("input", "input");
  temp.type = "range";
  temp.min = 0; temp.max = 2; temp.step = 0.1; temp.value = t.temperature != null ? t.temperature : 1;
  const tempVal = UI.el("span", "hint", Number(t.temperature != null ? t.temperature : 1).toFixed(1));
  temp.addEventListener("input", () => (tempVal.textContent = Number(temp.value).toFixed(1)));
  temp.addEventListener("change", async () => {
    t.temperature = parseFloat(temp.value);
    await pfrpDB.put("threads", t);
  });
  tempRow.append(temp, tempVal);
  settings.appendChild(tempRow);
  wrap.appendChild(settings);

  const memory = UI.el("div", "panel-card");
  memory.appendChild(UI.el("h4", "", `${UI.fa("brain")} Memory & Lore`));
  memory.appendChild(UI.el("div", "hint", "Memory & lore features arrive in a later step."));
  wrap.appendChild(memory);
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
      openCharacterEditor();
    } else if (d.create === "chat") {
      newChatChooser();
    } else {
      UI.showToast(d.title + " creation coming in a later step");
    }
  });

  els.settingsBtn.addEventListener("click", openSettingsModal);

  els.dCollapse.addEventListener("click", () => setDrawerOpen(false));

  els.ctxToggle.addEventListener("click", () => setCtx(els.ctxwrap.classList.contains("collapsed")));

  els.sendBtn.addEventListener("click", sendMessage);
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
  els.attachBtn.addEventListener("click", () => UI.showToast("Image attachment coming in a later step"));
  els.imgBtn.addEventListener("click", () => UI.showToast("Image generation coming in a later step"));
  els.helpWrite.addEventListener("click", () => UI.showToast("Help-me-write coming in a later step"));

  els.modelSelect.addEventListener("change", async () => {
    if (!activeThread) return;
    activeThread.modelName = els.modelSelect.value;
    await pfrpDB.put("threads", activeThread);
    UI.showToast("Model set to " + els.modelSelect.value);
  });
  els.modelRefresh.addEventListener("click", async () => {
    els.modelRefresh.disabled = true;
    await loadModelCache();
    els.modelRefresh.disabled = false;
    updateModelSelect();
    UI.showToast(modelCache.length ? modelCache.length + " models loaded" : "Could not fetch models", { type: modelCache.length ? "" : "err" });
  });
}

async function init() {
  initGate();
  applyTheme();
  renderCenter();
  renderContext();
  await loadData();
  await ensureSeedCharacters();
  await loadData();
  await loadModelCache();
  const ui = pfrpSettings.data.ui;
  setDrawer(DRAWERS[ui.lastDrawer] ? ui.lastDrawer : "chats");
  setDrawerOpen(ui.drawerOpen !== false);
  setCtx(ui.ctxOpen !== false);
  Sync.init();
  initEvents();
  setupImportDrop();
  renderCenter();
}

init();
