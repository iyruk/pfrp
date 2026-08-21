"use strict";

const Provider = {
  connection() {
    return pfrpSettings.activeConnection();
  },

  headers() {
    const conn = this.connection();
    const preset = PROVIDERS[conn.provider] || PROVIDERS.openrouter;
    const headers = { "Content-Type": "application/json" };
    if (preset.needsKey && conn.apiKey) headers["Authorization"] = "Bearer " + conn.apiKey;
    if (conn.provider === "openrouter") {
      headers["HTTP-Referer"] = location.origin || "http://localhost";
      headers["X-Title"] = "pfrp";
    }
    return headers;
  },

  baseUrl() {
    const conn = this.connection();
    return conn.baseUrl || this.getProvider().baseUrl;
  },

  getProvider() {
    return pfrpSettings.getProvider();
  },

  async requestJson(path, options) {
    const res = await fetch(this.baseUrl() + path, options);
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
  },

  buildBody(messages, { stream = false, system, temperature, model, max_tokens, extra = {} } = {}) {
    const s = pfrpSettings.data;
    const conn = this.connection();
    const body = {
      model: model || conn.model,
      messages,
      temperature: temperature != null ? temperature : s.temperature,
      stream,
      ...extra,
    };
    if (max_tokens) body.max_tokens = max_tokens;
    if (system && system.trim()) {
      body.messages = [{ role: "system", content: system }, ...body.messages];
    }
    return body;
  },

  async listModels() {
    return this.requestJson("/models", { headers: this.headers() });
  },

  async ping() {
    const s = pfrpSettings.data;
    const body = this.buildBody(
      [{ role: "user", content: "Reply with exactly: PING OK" }],
      { max_tokens: 10 }
    );
    const res = await fetch(this.baseUrl() + "/chat/completions", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
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
    return res.json();
  },

  async *stream(messages, opts = {}) {
    const body = this.buildBody(messages, { ...opts, stream: true });
    const url = this.baseUrl() + "/chat/completions";
    logRequest("chat (stream)", body, url);
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: opts.signal,
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
    let full = "";
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
          if (payload === "[DONE]") {
            logResponse(full);
            return;
          }
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) full += delta;
            yield chunk;
          } catch {}
        }
      }
      logResponse(full);
    } finally {
      reader.releaseLock();
    }
  },

  async complete(messages, opts = {}) {
    const body = this.buildBody(messages, { ...opts, stream: false });
    const url = this.baseUrl() + "/chat/completions";
    logRequest("complete", body, url);
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: opts.signal,
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
    const out = data.choices?.[0]?.message?.content || "";
    logResponse(out);
    return out;
  },

  async image({ prompt, width = 1024, height = 1024, provider, apiKey, model, signal }) {
    const img = pfrpSettings.data.images || {};
    const p = provider || img.provider || "pollinations";
    const key = apiKey != null ? apiKey : img.apiKey || "";
    if (p === "pollinations") {
      const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=" + width + "&height=" + height + "&nologo=true";
      return { url };
    }
    if (p === "openai" || p === "openrouter") {
      const base = p === "openai" ? "https://api.openai.com/v1" : "https://openrouter.ai/api/v1";
      const size = width >= height ? (width > 1024 ? "1792x1024" : "1024x1024") : (height > 1024 ? "1024x1792" : "1024x1024");
      const res = await fetch(base + "/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key,
          ...(p === "openrouter" ? { "HTTP-Referer": location.origin || "http://localhost", "X-Title": "pfrp" } : {}),
        },
        body: JSON.stringify({
          model: model || (p === "openai" ? "dall-e-3" : "openai/dall-e-3"),
          prompt,
          n: 1,
          size,
        }),
        signal,
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
      const url = data.data?.[0]?.url;
      if (!url) throw new Error("No image returned by the provider");
      return { url };
    }
    if (p === "stability") {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("output_format", "webp");
      if (width && height) {
        form.append("width", Math.min(width, 1536));
        form.append("height", Math.min(height, 1536));
      }
      const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, Accept: "image/*" },
        body: form,
        signal,
      });
      if (!res.ok) {
        let detail = "";
        try {
          detail = (await res.json()).message || "";
        } catch {
          detail = await res.text();
        }
        throw new Error(detail || "HTTP " + res.status);
      }
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      return { url: dataUrl };
    }
    throw new Error("Unknown image provider: " + p);
  },
};

function logRequest(kind, body, url) {
  try {
    console.groupCollapsed("[AI] " + kind + " request -> " + (body.model || "?"));
    console.log("URL:", url);
    const sys = Array.isArray(body.messages) && body.messages[0] && body.messages[0].role === "system" ? body.messages[0].content : "(no system prompt)";
    console.log("System prompt:\n" + sys);
    console.log("Messages:", body.messages);
    if (body.temperature != null) console.log("Temperature:", body.temperature);
    console.groupEnd();
  } catch {}
}

function logResponse(text) {
  try {
    console.groupCollapsed("[AI] response");
    console.log(text);
    console.groupEnd();
  } catch {}
}

window.Provider = Provider;
