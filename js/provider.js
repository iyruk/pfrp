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

  isConfigured(conn) {
    return pfrpSettings.isConfigured(conn);
  },

  isImageConfigured() {
    return pfrpSettings.isImageConfigured();
  },

  async requestJson(path, options) {
    const res = await fetch(this.baseUrl() + path, options);
    if (!res.ok) {
      const raw = await res.text();
      let detail = raw;
      try {
        const data = JSON.parse(raw);
        detail = data.error?.message || data.message || raw;
      } catch {}
      const err = new Error(detail || "HTTP " + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  buildBody(messages, { stream = false, system, temperature, model, max_tokens, extra = {} } = {}) {
    const s = pfrpSettings.data;
    const conn = this.connection();
    const preset = PROVIDERS[conn.provider] || PROVIDERS.openrouter;
    const body = {
      model: model || conn.model || preset.defaultModel || "",
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

  _getPerchanceAi() {
    if (typeof root !== "undefined" && typeof root.ai === "function") return root.ai;
    if (typeof window.parent !== "undefined" && window.parent.root && typeof window.parent.root.ai === "function") return window.parent.root.ai;
    return null;
  },

  _getPerchanceT2i() {
    if (typeof root !== "undefined" && typeof root.t2i === "function") return root.t2i;
    if (typeof window.parent !== "undefined" && window.parent.root && typeof window.parent.root.t2i === "function") return window.parent.root.t2i;
    return null;
  },

  _formatPerchancePrompt(messages, system) {
    const parts = [];
    if (system && system.trim()) {
      parts.push("[System Instruction]:\n" + system.trim());
    }
    for (const m of messages) {
      if (m.role === "system") {
        parts.push("[System Instruction]:\n" + m.content);
      } else if (m.role === "user") {
        parts.push("User: " + m.content);
      } else if (m.role === "assistant") {
        const name = m.name ? m.name : "Assistant";
        parts.push(name + ": " + m.content);
      }
    }
    return parts.join("\n\n");
  },

  async listModels() {
    const conn = this.connection();
    if (conn.provider === "perchance") {
      return { data: [{ id: "default", name: "Perchance Default" }] };
    }
    return this.requestJson("/models", { headers: this.headers() });
  },

  async ping() {
    const conn = this.connection();
    if (conn.provider === "perchance") {
      const ai = this._getPerchanceAi();
      if (!ai) throw new Error("Perchance AI plugin is only available when running on Perchance.org");
      return { ok: true, status: "Perchance AI ready" };
    }
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
      const raw = await res.text();
      let detail = raw;
      try {
        const data = JSON.parse(raw);
        detail = data.error?.message || raw;
      } catch {}
      throw new Error(detail || "HTTP " + res.status);
    }
    return res.json();
  },

  async *stream(messages, opts = {}) {
    if (!this.isConfigured()) {
      const conn = this.connection();
      const preset = PROVIDERS[conn.provider] || PROVIDERS.openrouter;
      throw new Error(`AI provider "${preset.label}" is not configured. Please add an API key in Settings > Connection.`);
    }
    const conn = this.connection();
    if (conn.provider === "perchance") {
      const ai = this._getPerchanceAi();
      if (!ai) {
        throw new Error("Perchance AI plugin is only available when running on Perchance.org.");
      }
      const instruction = this._formatPerchancePrompt(messages, opts.system);
      logRequest("chat (perchance stream)", { instruction }, "perchance:ai");
      const queue = [];
      let done = false;
      let error = null;
      let notify = null;

      const push = (item) => {
        queue.push(item);
        if (notify) {
          const fn = notify;
          notify = null;
          fn();
        }
      };

      let streamObj = null;
      try {
        streamObj = ai({
          instruction,
          startWith: " ",
          onChunk: (data) => {
            if (data.textChunk) push({ choices: [{ delta: { content: data.textChunk } }] });
          },
          onFinish: (data) => {
            done = true;
            if (data.stopReason === "error") error = new Error("Perchance AI generation failed");
            if (notify) {
              const fn = notify;
              notify = null;
              fn();
            }
          },
        });
      } catch (e) {
        throw new Error("Perchance AI invocation error: " + e.message);
      }

      if (opts.signal) {
        opts.signal.addEventListener("abort", () => {
          if (streamObj && typeof streamObj.stop === "function") streamObj.stop();
        });
      }

      let full = "";
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          const item = queue.shift();
          const d = item.choices?.[0]?.delta?.content;
          if (d) full += d;
          yield item;
        } else if (done) {
          break;
        } else {
          await new Promise((r) => { notify = r; });
        }
      }
      if (error) throw error;
      logResponse(full);
      return;
    }

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
      const raw = await res.text();
      let detail = raw;
      try {
        const data = JSON.parse(raw);
        detail = data.error?.message || raw;
      } catch {}
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
    if (!this.isConfigured()) {
      const conn = this.connection();
      const preset = PROVIDERS[conn.provider] || PROVIDERS.openrouter;
      throw new Error(`AI provider "${preset.label}" is not configured. Please add an API key in Settings > Connection.`);
    }
    const conn = this.connection();
    if (conn.provider === "perchance") {
      const ai = this._getPerchanceAi();
      if (!ai) {
        throw new Error("Perchance AI plugin is only available when running on Perchance.org.");
      }
      const instruction = this._formatPerchancePrompt(messages, opts.system);
      logRequest("complete (perchance)", { instruction }, "perchance:ai");
      return new Promise((resolve, reject) => {
        let streamObj = null;
        try {
          streamObj = ai({
            instruction,
            startWith: " ",
            onFinish: (data) => {
              if (data.stopReason === "error") reject(new Error("Perchance AI generation failed"));
              else {
                logResponse(data.text || "");
                resolve(data.text || "");
              }
            },
          });
        } catch (e) {
          return reject(new Error("Perchance AI invocation error: " + e.message));
        }
        if (opts.signal) {
          opts.signal.addEventListener("abort", () => {
            if (streamObj && typeof streamObj.stop === "function") streamObj.stop();
            reject(new DOMException("Aborted", "AbortError"));
          });
        }
      });
    }

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
      const raw = await res.text();
      let detail = raw;
      try {
        const data = JSON.parse(raw);
        detail = data.error?.message || raw;
      } catch {}
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
    const preset = IMAGE_PROVIDERS[p];
    if (preset && preset.needsKey && !key.trim()) {
      throw new Error(`Image provider "${preset.label}" requires an API key. Configure it in Settings > Images or switch to Pollinations (free).`);
    }
    if (p === "perchance") {
      const t2i = this._getPerchanceT2i();
      if (!t2i) {
        throw new Error("Perchance Image plugin is only available when running on Perchance.org.");
      }
      return new Promise((resolve, reject) => {
        try {
          t2i({
            prompt,
            onFinish: (result) => {
              try {
                const dataUrl = result.canvas ? result.canvas.toDataURL("image/jpeg") : (result.url || "");
                if (!dataUrl) return reject(new Error("No image canvas returned from Perchance T2I"));
                resolve({ url: dataUrl });
              } catch (e) {
                reject(new Error("Failed to extract Perchance image: " + e.message));
              }
            },
          });
        } catch (e) {
          reject(new Error("Perchance T2I invocation error: " + e.message));
        }
      });
    }
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
