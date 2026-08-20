"use strict";

const Provider = {
  headers() {
    const s = pfrpSettings.data;
    const preset = PROVIDERS[s.provider];
    const headers = { "Content-Type": "application/json" };
    if (preset.needsKey && s.apiKey) headers["Authorization"] = "Bearer " + s.apiKey;
    if (s.provider === "openrouter") {
      headers["HTTP-Referer"] = location.origin || "http://localhost";
      headers["X-Title"] = "pfrp";
    }
    return headers;
  },

  baseUrl() {
    const s = pfrpSettings.data;
    return s.baseUrl || this.getProvider().baseUrl;
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
    const body = {
      model: model || s.model,
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
    const res = await fetch(this.baseUrl() + "/chat/completions", {
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
  },

  async complete(messages, opts = {}) {
    const body = this.buildBody(messages, { ...opts, stream: false });
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
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  },
};

window.Provider = Provider;
