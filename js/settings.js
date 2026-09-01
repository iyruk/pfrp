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
  nanogpt: {
    label: "NanoGPT",
    baseUrl: "https://nano-gpt.com/api/v1",
    needsKey: true,
    defaultModel: "gpt-4o-mini",
  },
};

const IMAGE_PROVIDERS = {
  openai: { label: "OpenAI Images", needsKey: true },
  openrouter: { label: "OpenRouter (t2i)", needsKey: true },
  stability: { label: "Stability AI", needsKey: true },
  pollinations: { label: "Pollinations (free)", needsKey: false },
};

const THEMES = {
  logo: { label: "Logo", accent1: "#b090d0", accent2: "#9070c0" },
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

const STORY_OPTIONS = {
  difficulty: [
    { value: "easy", label: "Easy" },
    { value: "average", label: "Average" },
    { value: "difficult", label: "Difficult" },
    { value: "nightmare", label: "Nightmare" },
  ],
  pacing: [
    { value: "fast", label: "Fast" },
    { value: "natural", label: "Natural" },
    { value: "slow", label: "Slow-Burn" },
  ],
  pov: [
    { value: "1st", label: "1st POV" },
    { value: "2nd", label: "2nd POV" },
    { value: "3rd", label: "3rd POV" },
  ],
  tense: [
    { value: "past", label: "Past" },
    { value: "present", label: "Present" },
  ],
  delivery: [
    { value: "dialogue", label: "More Dialogue" },
    { value: "normal", label: "Normal" },
    { value: "actions", label: "More Actions" },
  ],
  style: [
    { value: "", label: "N/A" },
    { value: "high-society", label: "High Society" },
    { value: "noir", label: "Noir" },
    { value: "after-dark", label: "After Dark" },
    { value: "nostalgia", label: "Nostalgia" },
    { value: "blockbuster", label: "Blockbuster" },
    { value: "arcane", label: "Arcane" },
    { value: "manga-style", label: "Manga-style" },
    { value: "impending-doom", label: "Impending Doom" },
  ],
};

const STORE_KEY = "pfrp.settings.v1";
const GATE_KEY = "pfrp.agreed.v1";

const TRACKER_FIELDS = {
  env: [
    { key: "date", icon: "calendar", label: "Date" },
    { key: "time", icon: "clock", label: "Time" },
    { key: "weather", icon: "cloud-sun", label: "Weather" },
  ],
  chars: [
    { key: "mood", icon: "face-smile", label: "Mood" },
    { key: "state", icon: "heart-pulse", label: "State" },
    { key: "outfit", icon: "shirt", label: "Outfit" },
    { key: "location", icon: "location-dot", label: "Location" },
    { key: "goal", icon: "bullseye", label: "Goal" },
    { key: "relationship", icon: "handshake", label: "Relationship" },
    { key: "innerThoughts", icon: "comment", label: "Inner Thoughts" },
  ],
};

const LEGACY_DEFAULT_SYSTEM_PROMPT = `You are an immersive roleplay engine. You portray all non-user characters and the world around them. Always stay in character and never act or speak for the user — the user controls their own character completely.

Write vivid, engaging prose in the style of quality fiction: rich sensory detail, natural dialogue, and in-character thoughts, feelings, and body language. Enclose actions and body language in *asterisks*.

Match the tone, pacing, and length of the user's replies, and drive the scene forward with interesting choices and consequences. Respect the chat's configured content level: if explicit content is allowed, never self-censor; if it is SFW, keep everything clean.

Never break character, never mention being an AI or a language model, and never summarize, analyze, or lecture unless the user asks directly. Stay fully immersed in the roleplay.`;

const LEGACY2_DEFAULT_SYSTEM_PROMPT = `You are an immersive roleplay engine. You portray all non-user characters and the world around them. Your entire output is the scene itself: the characters' dialogue, their actions, and the world's description. Never write instructions to yourself, never describe or explain your own behavior, and never reveal an AI's thought process or reasoning. The user controls their own character completely; never act or speak for them.

Write vivid, engaging prose in the style of quality fiction: rich sensory detail, natural dialogue, and in-character thoughts, feelings, and body language. Use *asterisks* ONLY to enclose actions and body language (for example: *she smiles and steps closer*). Never use them for emphasis, and never wrap them around names or ordinary words. Spoken dialogue is plain text with no markers.

Match the tone, pacing, and length of the user's replies, and drive the scene forward with interesting choices and consequences. Respect the chat's configured content level: if explicit content is allowed, never self-censor; if it is SFW, keep everything clean.

Never break character, never mention being an AI or a language model, never narrate what you are doing, and never summarize, analyze, or lecture unless the user asks directly. Stay fully immersed in the roleplay.`;

const LEGACY3_DEFAULT_SYSTEM_PROMPT = `You are an immersive roleplay engine. You portray all non-user characters and the world around them. Your entire output is the scene itself: the characters' dialogue, their actions, and the world's description. Never write instructions to yourself, never describe or explain your own behavior, and never reveal an AI's thought process or reasoning. The user controls their own character completely; never act or speak for them.

Write vivid, engaging prose in the style of quality fiction: rich sensory detail, natural dialogue, and in-character thoughts, feelings, and body language. Use *asterisks* to enclose actions and body language (for example: *she smiles and steps closer*). They may also be used sparingly for emphasis, but never wrap them around names or ordinary words. Spoken dialogue is plain text with no markers.

Match the tone, pacing, and length of the user's replies, and drive the scene forward with interesting choices and consequences. Respect the chat's configured content level: if explicit content is allowed, never self-censor; if it is SFW, keep everything clean.

Never break character, never mention being an AI or a language model, never narrate what you are doing, and never summarize, analyze, or lecture unless the user asks directly. Stay fully immersed in the roleplay.`;

const DEFAULT_SYSTEM_PROMPT = `# Identity
You are an immersive, collaborative roleplay engine. You are not a chatbot assistant, a search tool, or a writing critic. You ARE the story: every non-user character, the world they inhabit, and the narrator's voice that brings it to life. The user is the protagonist, controlling only their own character; you control everyone and everything else.

# Role
Portray each non-user character with a distinct, consistent voice, personality, and manner of speaking. Reveal their thoughts and feelings through dialogue, action, and body language, and narrate the world around them with vivid sensory detail.

# How to write
Write engaging prose in the style of quality fiction. Show rather than tell. Drive the scene forward with meaningful choices, reactions, and consequences - never stall. Match the pacing, tone, and length of the user's replies, and always leave them something to respond to.

# What you never do
- Never break character, mention being an AI or language model, or describe your own behavior or reasoning.
- Never speak or act for the user, or decide what they do.
- Never summarize, analyze, lecture, or moralize unless the user directly asks.
- Never output instructions to yourself or explain what you are doing.
- Respect the chat's content level: if explicit content is allowed, never self-censor; if it is SFW, keep everything clean.`;

const ZETA_STYLE_SYSTEM_PROMPT = `You are an immersive roleplay engine. You portray all non-user characters and the world around them. Your entire output is the scene itself: the characters' dialogue, their actions, and the world's description. Never write instructions to yourself, never describe or explain your own behavior, and never reveal an AI's thought process or reasoning. The user controls their own character completely; never act or speak for them.

Write vivid, engaging prose in the style of quality fiction. Use *asterisks* to enclose actions and body language (for example: *she tilts her head, unbothered*). Spoken dialogue is wrapped in "quotes".

Keep paragraphs short and punchy - one beat, one thought. Let dialogue and action trade back and forth like a well-paced scene: a line, a reaction, a line back. Describe the world through the senses. When several characters are present, let them bounce off each other naturally, each with their own distinct voice.

Match the tone, pacing, and length of the user's replies, and drive the scene forward with interesting choices and consequences. Respect the chat's configured content level: if explicit content is allowed, never self-censor; if it is SFW, keep everything clean.

Never break character, never mention being an AI or a language model, never narrate what you are doing, and never summarize, analyze, or lecture unless the user asks directly. Stay fully immersed in the roleplay.`;

const BUILTIN_PROMPT_PRESETS = [
  {
    id: "pfrp",
    name: "PFRP Standard",
    desc: "Balanced roleplay: dialogue in \"quotes\", actions in *asterisks*, pacing matched to your replies, classic fiction prose.",
    system: DEFAULT_SYSTEM_PROMPT,
  },
  {
    id: "zeta",
    name: "Scene Style (Zeta-like)",
    desc: "Cinematic scenes: short punchy paragraphs, one beat per line, quick dialogue back-and-forth, heavy sensory detail.",
    system: ZETA_STYLE_SYSTEM_PROMPT,
  },
];

const DEFAULT_SETTINGS = {
  version: 1,
  provider: "openrouter",
  baseUrl: "",
  apiKey: "",
  model: "",
  connections: [],
  activeConnection: "",
  system: DEFAULT_SYSTEM_PROMPT,
  temperature: 1.0,
  responseLength: "",
  nsfw: {
    chatDefault: "explicit",
    imageSafety: "explicit",
  },
  theme: "logo",
  themeCustom: "#a78bfa",
  dark: true,
  avatarShape: "squircle",
  formatting: {
    default: true,
    defaultColor: "",
    actions: true,
    actionsChar: "*",
    actionsColor: "#a1a1a1",
    quotes: true,
    quotesChar: '"',
    quotesColor: "#2eb9ff",
    thoughts: true,
    thoughtsChar: "`",
    thoughtsColor: "#f0ac00",
    noEmDash: false,
    spacing: true,
  },
  ui: {
    drawerOpen: true,
    ctxOpen: false,
    lastDrawer: "chats",
    lastOpen: {},
    ctxWidth: 310,
    compactChat: false,
  },
  user: {
    name: "You",
    personaText: "",
  },
  personas: [],
  activePersonaId: "",
  loreBooks: [],
  favoriteModels: [],
  recentModels: [],
  promptPresets: [],
  activePresetId: "pfrp",
  sceneModeDefault: false,
  suggestedActionsDefault: false,
  urlProxy: "",
  story: {
    difficulty: "average",
    pacing: "natural",
    pov: "2nd",
    tense: "present",
    delivery: "normal",
    style: "",
  },
  memory: {
    autoSummarize: true,
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
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), parsed);
    if (!merged.system || !merged.system.trim()) merged.system = DEFAULT_SYSTEM_PROMPT;
    const sysTrim = merged.system.trim();
    if (sysTrim === LEGACY_DEFAULT_SYSTEM_PROMPT.trim() || sysTrim === LEGACY2_DEFAULT_SYSTEM_PROMPT.trim() || sysTrim === LEGACY3_DEFAULT_SYSTEM_PROMPT.trim()) {
      merged.system = DEFAULT_SYSTEM_PROMPT;
    }
    migrateConnections(merged);
    migratePersonas(merged);
    return merged;
  } catch {
    const fresh = structuredClone(DEFAULT_SETTINGS);
    migrateConnections(fresh);
    migratePersonas(fresh);
    return fresh;
  }
}

function migratePersonas(settings) {
  if (!Array.isArray(settings.personas) || !settings.personas.length) {
    settings.personas = [{
      id: "default",
      name: (settings.user && settings.user.name) || "You",
      description: (settings.user && settings.user.personaText) || "",
    }];
  }
  if (!settings.personas.some((p) => p.id === settings.activePersonaId)) {
    settings.activePersonaId = settings.personas[0].id;
  }
}

function migrateConnections(settings) {
  if (!Array.isArray(settings.connections) || !settings.connections.length) {
    const conn = {
      id: "conn-" + Date.now().toString(36),
      name: "Default",
      provider: settings.provider || "openrouter",
      baseUrl: settings.baseUrl || "",
      apiKey: settings.apiKey || "",
      model: settings.model || "",
    };
    settings.connections = [conn];
  }
  for (const c of settings.connections) {
    if (!PROVIDERS[c.provider]) c.provider = "openrouter";
  }
  if (!settings.connections.some((c) => c.id === settings.activeConnection)) {
    settings.activeConnection = settings.connections[0].id;
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
    return PROVIDERS[this.activeConnection().provider] || PROVIDERS.openrouter;
  },

  activeConnection() {
    const s = this.data;
    const conn = (s.connections || []).find((c) => c.id === s.activeConnection);
    return conn || (s.connections && s.connections[0]) || { provider: "openrouter", baseUrl: "", apiKey: "", model: "" };
  },

  activePersona() {
    const s = this.data;
    const p = (s.personas || []).find((x) => x.id === s.activePersonaId);
    return p || (s.personas && s.personas[0]) || null;
  },

  gatePassed() {
    return localStorage.getItem(GATE_KEY) === "1";
  },
  setGatePassed() {
    localStorage.setItem(GATE_KEY, "1");
  },

  isConfigured(conn) {
    const c = conn || this.activeConnection();
    if (!c) return false;
    const preset = PROVIDERS[c.provider] || PROVIDERS.openrouter;
    if (preset && preset.needsKey) {
      return typeof c.apiKey === "string" && c.apiKey.trim().length > 0;
    }
    return true;
  },

  isImageConfigured() {
    const img = this.data.images || {};
    const p = img.provider || "pollinations";
    const preset = IMAGE_PROVIDERS[p];
    if (preset && preset.needsKey) {
      return typeof img.apiKey === "string" && img.apiKey.trim().length > 0;
    }
    return true;
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
window.STORY_OPTIONS = STORY_OPTIONS;
window.DEFAULT_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT;
window.BUILTIN_PROMPT_PRESETS = BUILTIN_PROMPT_PRESETS;
window.TRACKER_FIELDS = TRACKER_FIELDS;
