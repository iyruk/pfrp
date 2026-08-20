"use strict";

const Export = {
  toCharaCard(c, spec = "chara_card_v2") {
    const data = {
      name: c.name || "",
      description: c.description || "",
      personality: c.personality || "",
      scenario: c.scenario || "",
      first_mes: c.first_mes || "",
      mes_example: c.mes_example || "",
      creator_notes: "",
      system_prompt: c.system_prompt || "",
      post_history_instructions: c.post_history_instructions || "",
      alternate_greetings: c.alternate_greetings || [],
      tags: c.tags || [],
      creator: c.creator || "",
      character_version: c.character_version || "",
      extensions: {},
    };
    if (c.avatar && c.avatar.startsWith("data:")) data.avatar = c.avatar;
    return {
      spec,
      spec_version: spec === "chara_card_v3" ? "3.0" : "2.0",
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.first_mes,
      mes_example: data.mes_example,
      data,
    };
  },

  toCharaCardJson(c) {
    return JSON.stringify(this.toCharaCard(c), null, 2);
  },

  async toPngCard(c) {
    const cardJson = this.toCharaCard(c);
    const base64 = base64EncodeUnicode(JSON.stringify(cardJson));
    const pngBytes = await buildPngBase(c);
    const out = insertChunk(pngBytes, "tEXt", concatBytes(asciiBytes("chara"), [0], asciiBytes(base64)));
    return new Blob([out], { type: "image/png" });
  },

  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  safeName(name) {
    return (name || "character").replace(/[\\/:*?"<>|]/g, "_").trim() || "character";
  },
};

function base64EncodeUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function asciiBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function concatBytes(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function buildPngBase(c) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (c.avatar && c.avatar.startsWith("data:")) {
    try {
      const img = await loadImage(c.avatar);
      const s = Math.min(size / img.width, size / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.fillStyle = "#191525";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    } catch {
      drawPlaceholder(ctx, size, c);
    }
  } else {
    drawPlaceholder(ctx, size, c);
  }
  const dataUrl = canvas.toDataURL("image/png");
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function drawPlaceholder(ctx, size, c) {
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#8b5cf6");
  g.addColorStop(1, "#d946ef");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const initial = (c.name ? c.name[0] : "?").toUpperCase();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold " + size * 0.5 + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initial, size / 2, size / 2);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function insertChunk(png, type, data) {
  const iendOffset = findChunk(png, "IEND");
  const newChunk = buildChunk(type, data);
  const out = new Uint8Array(png.length + newChunk.length);
  out.set(png.subarray(0, iendOffset), 0);
  out.set(newChunk, iendOffset);
  out.set(png.subarray(iendOffset), iendOffset + newChunk.length);
  return out;
}

function findChunk(png, type) {
  let offset = 8;
  while (offset + 12 <= png.length) {
    const len = ((png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3]) >>> 0;
    const t = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
    if (t === type) return offset;
    offset += 12 + len;
  }
  throw new Error("IEND chunk not found");
}

function buildChunk(type, data) {
  const typeBytes = asciiBytes(type);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length);
  const crc = crc32(concatBytes(typeBytes, data));
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(len, 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(crcBytes, 8 + data.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

window.Export = Export;
Export._buildChunk = buildChunk;
Export._insertChunk = insertChunk;
Export._findChunk = findChunk;
Export._crc32 = crc32;
Export._base64EncodeUnicode = base64EncodeUnicode;
