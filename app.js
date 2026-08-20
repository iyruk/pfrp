"use strict";

const PROVIDERS = {
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    defaultModel: "openai/gpt-4o-mini",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    defaultModel: "gpt-4o-mini",
  },
  ollama: {
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    defaultModel: "llama3.2",
  },
};

const STORE_KEY = "pfrp.settings.v1";

const $ = (id) => document.getElementById(id);

const els = {
  provider: $("provider"),
  baseUrl: $("baseUrl"),
  apiKey: $("apiKey"),
  toggleKey: $("toggleKey"),
  model: $("model"),
  loadModels: $("loadModels"),
  testConn: $("testConn"),
  connStatus: $("connStatus"),
  system: $("system"),
  temperature: $("temperature"),
  tempValue: $("tempValue"),
  newChat: $("newChat"),
  clearMsgs: $("clearMsgs"),
  messages: $("messages"),
  emptyState: $("emptyState"),
  composer: $("composer"),
  input: $("input"),
  sendBtn: $("sendBtn"),
  stopBtn: $("stopBtn"),
};

let settings = loadSettings();
let messages = loadChat();
let streaming = null;

function loadSettings() {
  try {
    return Object.assign(
      { provider: "openrouter", baseUrl: "", apiKey: "", model: "", system: "", temperature: 1.0 },
      JSON.parse(localStorage.getItem(STORE_KEY) || "{}")
    );
  } catch {
    return { provider: "openrouter", baseUrl: "", apiKey: "", model: "", system: "", temperature: 1.0 };
  }
}

function saveSettings() {
  localStorage.setItem(STORE_KEY, JSON.stringify(settings));
}

function loadChat() {
  try {
    return JSON.parse(localStorage.getItem("pfrp.chat.v1") || "[]");
  } catch {
    return [];
  }
}

function saveChat() {
  localStorage.setItem("pfrp.chat.v1", JSON.stringify(messages));
  els.emptyState.classList.toggle("hidden", messages.length > 0);
}

function applySettingsToUI() {
  els.provider.value = settings.provider;
  const preset = PROVIDERS[settings.provider];
  els.baseUrl.value = settings.baseUrl || preset.baseUrl;
  els.apiKey.value = settings.apiKey;
  els.apiKey.placeholder = preset.needsKey ? "sk-..." : "not needed for Ollama";
  els.model.value = settings.model || preset.defaultModel;
  els.system.value = settings.system;
  els.temperature.value = settings.temperature;
  els.tempValue.textContent = "temp: " + settings.temperature.toFixed(1);
  els.connStatus.textContent = "";
  els.connStatus.className = "status";
}

function applyUIToSettings() {
  settings.provider = els.provider.value;
  settings.baseUrl = els.baseUrl.value.trim();
  settings.apiKey = els.apiKey.value.trim();
  settings.model = els.model.value.trim();
  settings.system = els.system.value;
  settings.temperature = parseFloat(els.temperature.value);
  saveSettings();
}

function currentHeaders() {
  const headers = { "Content-Type": "application/json" };
  const preset = PROVIDERS[settings.provider];
  if (preset.needsKey && settings.apiKey) {
    headers["Authorization"] = "Bearer " + settings.apiKey;
  }
  if (settings.provider === "openrouter") {
    headers["HTTP-Referer"] = location.origin || "http://localhost";
    headers["X-Title"] = "pfrp";
  }
  return headers;
}

function setStatus(text, kind) {
  els.connStatus.textContent = text;
  els.connStatus.className = "status" + (kind ? " " + kind : "");
}

async function requestJson(path, options) {
  const res = await fetch(settings.baseUrl + path, options);
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data.error?.message || data.message || JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    const err = new Error(detail || "HTTP " + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function buildChatBody(stream) {
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
  const system = settings.system.trim();
  return {
    model: settings.model,
    messages: system ? [{ role: "system", content: system }, ...history] : history,
    temperature: settings.temperature,
    stream,
  };
}

async function loadModels() {
  applyUIToSettings();
  if (!settings.baseUrl) return setStatus("Enter a base URL first.", "err");
  setStatus("Fetching models...");
  els.loadModels.disabled = true;
  try {
    const data = await requestJson("/models", { headers: currentHeaders() });
    const list = (data.data || [])
      .map((m) => m.id)
      .filter(Boolean)
      .sort();
    if (!list.length) return setStatus("No models returned.");
    const current = settings.model;
    const datalist = document.getElementById("modelList") || (() => {
      const dl = document.createElement("datalist");
      dl.id = "modelList";
      document.body.appendChild(dl);
      return dl;
    })();
    datalist.innerHTML = "";
    list.forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      datalist.appendChild(opt);
    });
    els.model.setAttribute("list", "modelList");
    setStatus(list.length + " models loaded. Pick one from the dropdown.", "ok");
    if (!current || !list.includes(current)) {
      els.model.value = list.includes("gpt-4o-mini") ? "gpt-4o-mini"
        : list.includes("llama3.2") ? "llama3.2"
        : list[0];
      applyUIToSettings();
    }
  } catch (e) {
    setStatus("Model fetch failed: " + e.message, "err");
  } finally {
    els.loadModels.disabled = false;
  }
}

async function testConnection() {
  applyUIToSettings();
  if (!settings.model) return setStatus("Enter a model name first.", "err");
  setStatus("Sending test request to " + settings.model + "...");
  els.testConn.disabled = true;
  try {
    const res = await fetch(settings.baseUrl + "/chat/completions", {
      method: "POST",
      headers: currentHeaders(),
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: "Reply with exactly: PING OK" }],
        max_tokens: 10,
      }),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data.error?.message || JSON.stringify(data);
      } catch {
        detail = await res.text();
      }
      throw new Error(detail || "HTTP " + res.status);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "(empty reply)";
    setStatus("Connected. Model replied: \"" + reply.trim() + "\"", "ok");
  } catch (e) {
    setStatus("Connection failed: " + e.message, "err");
  } finally {
    els.testConn.disabled = false;
  }
}

function addMessage(role, content) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  if (role === "user") {
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = "you";
    el.appendChild(meta);
  }
  const body = document.createElement("div");
  body.className = "body";
  body.textContent = content;
  el.appendChild(body);
  els.messages.appendChild(el);
  els.messages.scrollTop = els.messages.scrollHeight;
  return { el, body };
}

async function* streamLines() {
  const res = await fetch(settings.baseUrl + "/chat/completions", {
    method: "POST",
    headers: currentHeaders(),
    body: JSON.stringify(buildChatBody(true)),
  });
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data.error?.message || JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || "HTTP " + res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          yield JSON.parse(payload);
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text || streaming) return;
  applyUIToSettings();
  if (!settings.model) return setStatus("Enter a model name first.", "err");

  els.input.value = "";
  els.emptyState.classList.add("hidden");

  const userMsg = addMessage("user", text);
  messages.push({ role: "user", content: text });
  saveChat();

  const asstMsg = addMessage("assistant", "");
  asstMsg.el.classList.add("streaming");
  els.sendBtn.disabled = true;
  els.stopBtn.classList.remove("hidden");

  let full = "";
  let error = null;
  const ac = new AbortController();
  streaming = ac;

  els.stopBtn.onclick = () => {
    ac.abort();
    if (streaming) {
      asstMsg.el.classList.remove("streaming");
      streaming = null;
      els.sendBtn.disabled = false;
      els.stopBtn.classList.add("hidden");
    }
  };

  try {
    for await (const chunk of streamLines()) {
      if (ac.signal.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        asstMsg.body.textContent = full;
        els.messages.scrollTop = els.messages.scrollHeight;
      }
    }
    if (ac.signal.aborted && !full) {
      throw new Error("Stopped.");
    }
    if (!full && !ac.signal.aborted) {
      full = "(model returned an empty response)";
    }
  } catch (e) {
    error = e;
    asstMsg.body.textContent = full || "Error: " + e.message;
    if (e.message !== "Stopped.") asstMsg.el.classList.add("error");
  } finally {
    asstMsg.el.classList.remove("streaming");
    if (error && !full) {
      asstMsg.el.classList.add("error");
    } else if (full) {
      messages.push({ role: "assistant", content: full });
      saveChat();
    }
    streaming = null;
    els.sendBtn.disabled = false;
    els.stopBtn.classList.add("hidden");
    els.stopBtn.onclick = null;
  }
}

function renderChat() {
  els.messages.innerHTML = "";
  els.emptyState.classList.toggle("hidden", messages.length > 0);
  for (const m of messages) {
    const { el, body } = addMessage(m.role, m.content);
    if (m.role === "user") {
      const meta = el.querySelector(".meta");
      meta.textContent = "you";
    }
    void body;
  }
}

function newChat() {
  messages = [];
  saveChat();
  renderChat();
}

els.provider.addEventListener("change", () => {
  const preset = PROVIDERS[els.provider.value];
  const currentPreset = PROVIDERS[settings.provider];
  if (!settings.baseUrl || settings.baseUrl === currentPreset.baseUrl) {
    els.baseUrl.value = preset.baseUrl;
  }
  if (!settings.model || settings.model === currentPreset.defaultModel) {
    els.model.value = preset.defaultModel;
  }
  els.apiKey.placeholder = preset.needsKey ? "sk-..." : "not needed for Ollama";
  applyUIToSettings();
});

els.temperature.addEventListener("input", () => {
  els.tempValue.textContent = "temp: " + parseFloat(els.temperature.value).toFixed(1);
});

els.toggleKey.addEventListener("click", () => {
  els.apiKey.type = els.apiKey.type === "password" ? "text" : "password";
});

els.loadModels.addEventListener("click", loadModels);
els.testConn.addEventListener("click", testConnection);
els.newChat.addEventListener("click", newChat);
els.clearMsgs.addEventListener("click", newChat);
els.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

applySettingsToUI();
renderChat();