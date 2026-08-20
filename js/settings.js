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

const IMAGE_PROVIDERS = {
  openai: { label: "OpenAI Images", needsKey: true },
  openrouter: { label: "OpenRouter (t2i)", needsKey: true },
  stability: { label: "Stability AI", needsKey: true },
  pollinations: { label: "Pollinations (free)", needsKey: false },
};

const THEMES = {
  purple: { label: "Purple", accent1: "#a78bfa", accent2: "#d946ef" },
  pink: { label: "Pink", accent1: "#f472b6", accent2: "#fb7185" },
  blue: { label: "Ocean", accent1: "#60a5fa", accent2: "#22d3ee" },
  green: { label: "Forest", accent1: "#34d399", accent2: "#4ade80" },
  amber: { label: "Amber", accent1: "#fbbf24", accent2: "#fb923c" },
  custom: { label: "Custom", accent1: null, accent2: null },
};

const EXPLICITNESS = [
  { value: "sfw", label: "SFW", desc: "Clean, non-explicit roleplay only." },
  { value: "suggestive", label: "Suggestive", desc: "Flirtatious and implied, but not explicit." },
  { value: "explicit", label: "Explicit", desc: "Fully uncensored adult roleplay and imagery." },
];

const IMAGE_SAFETY = [
  { value: "safe", label: "Safe", desc: "No NSFW image generations." },
  { value: "suggestive", label: "Suggestive", desc: "Revealing but non-explicit images." },
  { value: "explicit", label: "Explicit", desc: "Adult image generations allowed." },
];

const STORE_KEY = "pfrp.settings.v1";
const GATE_KEY = "pfrp.agreed.v1";

const DEFAULT_SETTINGS = {
  version: 1,
  provider: "openrouter",
  baseUrl: "",
  apiKey: "",
  model: "",
  system: "",
  temperature: 1.0,
  nsfw: {
    chatDefault: "explicit",
    imageSafety: "explicit",
  },
  theme: "purple",
  themeCustom: "#a78bfa",
  dark: true,
  formatting: {
    default: true,
    defaultColor: "",
    actions: true,
    actionsChar: "*",
    actionsColor: "#b9b0d0",
    quotes: true,
    quotesChar: '"',
    quotesColor: "#c4b5fd",
    thoughts: true,
    thoughtsChar: "`",
    thoughtsColor: "#fbbf24",
  },
  ui: {
    drawerOpen: true,
    ctxOpen: false,
    lastDrawer: "chats",
    lastOpen: {},
  },
  user: {
    name: "You",
    personaText: "",
  },
  images: {
    provider: "pollinations",
    apiKey: "",
    model: "",
    width: 1024,
    height: 1024,
  },
};

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return deepMerge(structuredClone(DEFAULT_SETTINGS), parsed);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function deepMerge(base, over) {
  for (const k of Object.keys(over)) {
    if (
      over[k] &&
      typeof over[k] === "object" &&
      !Array.isArray(over[k]) &&
      base[k] &&
      typeof base[k] === "object" &&
      !Array.isArray(base[k])
    ) {
      deepMerge(base[k], over[k]);
    } else {
      base[k] = over[k];
    }
  }
  return base;
}

const Settings = {
  data: loadSettings(),

  save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
  },

  getProvider() {
    return PROVIDERS[this.data.provider] || PROVIDERS.openrouter;
  },

  gatePassed() {
    return localStorage.getItem(GATE_KEY) === "1";
  },
  setGatePassed() {
    localStorage.setItem(GATE_KEY, "1");
  },

  explicitnessLabel(v) {
    const f = EXPLICITNESS.find((x) => x.value === v);
    return f ? f.label : v;
  },
};

window.pfrpSettings = Settings;
window.PROVIDERS = PROVIDERS;
window.IMAGE_PROVIDERS = IMAGE_PROVIDERS;
window.THEMES = THEMES;
window.EXPLICITNESS = EXPLICITNESS;
window.IMAGE_SAFETY = IMAGE_SAFETY;
