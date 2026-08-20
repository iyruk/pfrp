"use strict";

const Import = {
  readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  },

  async parseFile(file) {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".png")) {
      return [this.parseCardPng(await this.readAsArrayBuffer(file))];
    }
    if (name.endsWith(".json")) {
      const text = await file.text();
      return this.parseCharacterJson(text);
    }
    throw new Error("Unsupported file type: " + file.name + " (use a .png or .json character card)");
  },

  parseCharacterJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Could not parse JSON file.");
    }
    if (data && data.formatName === "dexie") {
      return this.fromDexie(data);
    }
    if (data && data.spec && data.data) {
      return [this.fromCharaCard(data)];
    }
    if (data && (data.kind === "character" || (data.characterBook && data.persona))) {
      return [this.fromAgnaistic(data)];
    }
    throw new Error("Unrecognized character format.");
  },

  parseCardPng(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunks = readPngChunks(bytes);
    for (const c of chunks) {
      if (c.type === "tEXt" || c.type === "iTXt" || c.type === "zTXt") {
        const text = decodeTextChunk(c, bytes);
        if (text && text.keyword === "chara") {
          let json;
          try {
            json = JSON.parse(base64DecodeUtf8(text.text));
          } catch {
            throw new Error("chara chunk in PNG is not valid JSON.");
          }
          return this.fromCharaCard(json, bytesToDataUrl(bytes));
        }
      }
    }
    throw new Error("No character data (chara chunk) found in this PNG.");
  },

  fromCharaCard(card, avatarOverride = "") {
    const d = card.data || {};
    const avatar = avatarOverride || normalizeAvatar(d.avatar) || "";
    return {
      name: d.name || card.name || "Unnamed",
      tagline: (d.tags && d.tags.length ? d.tags.join(", ") : "") || "",
      description: d.description || "",
      personality: d.personality || "",
      scenario: d.scenario || "",
      first_mes: d.first_mes || "",
      mes_example: d.mes_example || "",
      system_prompt: d.system_prompt || "",
      post_history_instructions: d.post_history_instructions || "",
      alternate_greetings: d.alternate_greetings || [],
      tags: d.tags || [],
      creator: d.creator || "",
      character_version: d.character_version || "",
      avatar,
      created: card.create_date || d.created || "",
    };
  },

  fromAgnaistic(a) {
    const persona = (a.persona && a.persona.attributes && a.persona.attributes.text) || [];
    const descParts = [];
    if (a.description) descParts.push(a.description);
    if (persona.length) descParts.push(persona.join("\n"));
    return {
      name: a.name || "Unnamed",
      tagline: (a.tags && a.tags.length ? a.tags.join(", ") : "") || "",
      description: descParts.join("\n\n"),
      personality: a.personality || "",
      scenario: a.scenario || "",
      first_mes: a.greeting || "",
      mes_example: a.sampleChat || "",
      system_prompt: a.systemPrompt || "",
      post_history_instructions: a.postHistoryInstructions || "",
      alternate_greetings: a.alternateGreetings || [],
      tags: a.tags || [],
      creator: a.creator || "",
      character_version: a.characterVersion || "",
      avatar: (a.avatar && a.avatar.base64) ? normalizeAvatar(a.avatar.base64) : "",
      created: a.createdAt || "",
    };
  },

  fromDexie(data) {
    const tables = data.data && data.data.data ? data.data.data : [];
    const charTable = tables.find((t) => t.tableName === "characters");
    if (!charTable || !charTable.rows || !charTable.rows.length) {
      throw new Error("This Dexie backup contains no characters.");
    }
    const chars = [];
    for (const row of charTable.rows) {
      const c = this.fromDexieCharacter(row);
      if (c) chars.push(c);
    }
    if (!chars.length) throw new Error("No importable characters found in this Dexie backup.");
    return chars;
  },

  fromDexieCharacter(row) {
    if (!row || !row.name) return null;
    let avatar = "";
    if (row.avatar) {
      if (typeof row.avatar === "string") avatar = normalizeAvatar(row.avatar);
      else if (row.avatar.url) avatar = normalizeAvatar(row.avatar.url);
      else if (row.avatar.base64) avatar = normalizeAvatar(row.avatar.base64);
    }
    let personaText = "";
    if (row.persona) {
      if (typeof row.persona === "string") personaText = row.persona;
      else if (row.persona.attributes && row.persona.attributes.text) personaText = row.persona.attributes.text.join("\n");
      else if (row.persona.text) personaText = row.persona.text;
    }
    const descriptionParts = [row.roleInstruction || row.description || ""];
    if (personaText) descriptionParts.push(personaText);
    const tagline = row.metaDescription || row.tagline || "";
    return {
      name: row.name,
      tagline,
      description: descriptionParts.filter(Boolean).join("\n\n"),
      personality: row.personality || "",
      scenario: row.scenario || "",
      first_mes: (row.initialMessages && row.initialMessages.length ? row.initialMessages[0] : "") || row.greeting || "",
      mes_example: row.sampleChat || row.mes_example || "",
      system_prompt: row.systemPrompt || "",
      post_history_instructions: row.postHistoryInstructions || "",
      alternate_greetings: row.alternateGreetings || (row.initialMessages && row.initialMessages.length > 1 ? row.initialMessages.slice(1) : []),
      tags: row.tags || [],
      creator: row.creator || "",
      character_version: row.characterVersion || "",
      avatar,
      temperature: typeof row.temperature === "number" ? row.temperature : null,
      created: row.creationTime ? new Date(row.creationTime).toISOString() : "",
    };
  },
};

function normalizeAvatar(avatar) {
  if (typeof avatar === "string" && avatar.startsWith("data:")) return avatar;
  return "";
}

function readPngChunks(bytes) {
  const chunks = [];
  if (bytes.length < 8 || bytes[0] !== 0x89) return chunks;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const len = readUint32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    chunks.push({ type, length: len, offset });
    offset += 12 + len;
    if (type === "IEND") break;
  }
  return chunks;
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function base64DecodeUtf8(text) {
  const clean = text.replace(/\s+/g, "");
  let binary;
  try {
    binary = atob(clean);
  } catch {
    throw new Error("chara chunk is not valid base64.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function bytesToDataUrl(bytes, mime = "image/png") {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return "data:" + mime + ";base64," + btoa(binary);
}

function decodeTextChunk(chunk, bytes) {
  const dataStart = chunk.offset + 8;
  const data = bytes.subarray(dataStart, dataStart + chunk.length);
  if (chunk.type === "tEXt") {
    const nul = data.indexOf(0);
    if (nul < 0) return null;
    const keyword = String.fromCharCode.apply(null, data.subarray(0, nul));
    const text = new TextDecoder().decode(data.subarray(nul + 1));
    return { keyword, text };
  }
  if (chunk.type === "iTXt") {
    const nul1 = data.indexOf(0);
    if (nul1 < 0) return null;
    const keyword = String.fromCharCode.apply(null, data.subarray(0, nul1));
    const nul2 = data.indexOf(0, nul1 + 1);
    if (nul2 < 0) return null;
    const afterLang = nul2 + 1;
    const nul3 = data.indexOf(0, afterLang);
    if (nul3 < 0) return null;
    const compressed = data[nul3 + 1];
    if (compressed === 1) return null;
    const text = new TextDecoder().decode(data.subarray(nul3 + 2));
    return { keyword, text };
  }
  return null;
}

window.Import = Import;
Import._readPngChunks = readPngChunks;
Import._decodeTextChunk = decodeTextChunk;
Import._readUint32 = readUint32;
