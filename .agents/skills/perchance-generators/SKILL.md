---
name: perchance-generators
description: Build and modify Perchance.org generators, including Perchance list syntax, HTML panel code, plugin integration, and all Perchance language features.
---

# Perchance.org Generator Skill

You are an expert in [Perchance.org](https://perchance.org) generators. This skill covers the complete Perchance language, the editor interface, and common plugins.

## Editor Panels
Perchance generators have 4 panels in the editor:

### Lists Panel
The primary coding panel where Perchance list syntax (similar to JavaScript-like DSL) goes. This is where lists, variables, functions, and logic are defined. Code in this panel uses Perchance's own syntax.

### HTML Panel
Standard HTML/CSS with Perchance square-bracket expressions embedded for dynamic output. Use `[listName]` to output a random item from a list, and `<button onclick="update()">` to re-randomize.

### Tester Panel
A live console to test Perchance expressions. Type `[listName]` or any valid Perchance expression to see evaluated output.

### Preview Panel
Live preview of the generator HTML output. Auto-updates as you type. Can be full-screened to get the shareable URL.

## Perchance Language Syntax

### Core Rules

- **Lists** are defined as `listName` followed by indented items
- Indentation: **1 tab** or **2 spaces** per level
- Items at the same indent level are siblings; deeper indentation creates sub-lists
- Comments: `//` for single-line comments
- Escape characters: `\\` for backslash, `\[` for literal `[`, `\]` for literal `]`, `\{` `\}` for curly brackets, `\=` for literal `=`, `\s` for space, `\t` for tab, `\^` for literal `^`

### List Structure

```
animal
  dog
  cat
  bird

output
  The [animal] runs fast.
```

The special list `output` controls what the generator emits. `[animal]` in any context selects a random item from the `animal` list.

### Square Brackets `[...]`

Used to reference lists and execute expressions. `[listName]` selects a random item from `listName`. `[animal]` in the HTML panel outputs a random animal.

Inside square brackets:
- Reference lists by plain name (not wrapped in extra brackets)
- Assign variables: `[x = list.selectOne]`
- Use methods: `[list.selectMany(3).joinItems(", ")]`
- Execute JavaScript expressions: `[x + 1]`, `[x > 5 ? "big" : "small"]`
- Call functions: `[myFunction(arg)]`

### Curly Brackets `{...}` (Shorthand Lists)

Inline random selection with pipe `|` separators:

```
{item1|item2|item3}
```

Odds in curly blocks: `{item1|item2^3|item3}` (item2 is 3x more likely)

Number ranges: `{1-10}`, `{-5-5}`, `{0.5-1.5}`

Character ranges: `{a-z}`

**Spaces matter** inside curly blocks: `{hi|hello}` ≠ `{ hi | hello }`

### Odds / Weights

Static odds: append `^number` to any list item
```
fruit
  apple
  banana^3
  cherry^0.5
```

Dynamic odds: `^[expression]` re-evaluated each time the list is accessed
```
adjective
  great ^[score > 3]
  good  ^[score > 1]
  bad
```

Where `score` is a variable set earlier.

Operators for dynamic odds: `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&` (and), `||` (or)

### Variable Assignment & Storage

```
output
  [f = fruit.selectOne] I like [f] and [f]!
```

Store evaluated (fully resolved) items:
```
[f = fruit.selectOne.evaluateItem]
// or simply
[f = fruit.evaluateItem]
```

Multiple evaluations: `[x = fruit.selectOne, y = vegetable.selectOne] ... [x] [y]`

Empty assignment (execute without output): `[x = list.selectOne, ""]`

### Hierarchical Lists (Sub-lists)

```
vehicle
  car
    make
      Toyota
      Honda
      Ford
    engine
      V6
      V8
  boat
    make
      Yamaha
      Bayliner

output
  [vehicle.car.make] [vehicle.boat.make]
```

Access sub-lists with dot notation: `parent.child.grandchild`

### Methods & Properties

#### Selection Methods
- `.selectOne` — pick one random item (default behavior)
- `.selectMany(n)` — pick n items (with repeats)
- `.selectMany(min, max)` — random count between min and max
- `.selectUnique(n)` — pick n unique items (no repeats)
- `.selectUnique(min, max)` — random unique count
- `.selectAll` — get all items (drops odds weighting)

#### String Manipulation
- `.joinItems(separator)` — join array items with separator: `[list.selectMany(3).joinItems(", ")]`
- `.replaceText(old, new)` — string replace

#### String Transforms (Grammar)
- `.upperCase` / `.lowerCase` / `.titleCase` / `.sentenceCase`
- `.singular` / `.plural`
- `.pastTense` / `.presentTense` / `.futureTense`
- `.possessive`
- `.negativeForm`

#### Special Methods
- `.consumableList` — creates a depletable copy of a list (items removed as used)
  ```
  [deck = card.consumableList]
  [deck] [deck] [deck]  // each output is unique until depleted
  ```
- `.evaluateItem` — fully evaluates an item (resolving all nested brackets/blocks)
- `.createClone()` — creates an independent copy of a list
- `.getAllKeys` / `.getChildNames` — introspection
- `.getOdds` / `.getLength` — numeric properties
- `.sumItems` — sum all numeric items

### `$output` Keyword

Controls what a list outputs when referenced:

```
person
  age = 68
  name = Anita
  $output = My name is [this.name] and I'm [this.age]
```

Use `this` to reference sibling properties within the same list. Also used for generator-level exports: `$output = [myMainList]`.

### Functions

Define reusable logic with `=>` syntax. The canonical form is `functionName(args) =>` followed by an **indented body** — indentation is semantic in `lists.perchance`, and the parser is line-based, so the body lines must be indented consistently (2 spaces) below the `=>` line:

```
function(options) =>
  return options
```

Functions can take parameters and must `return` a value. Any JavaScript is valid inside, and functions can be `async`:

```
async generateName(options) =>
  let result = await ai({ instruction: "..." })
  return result.text
```

Example with branching:

```
selectName(g) =>
  result = (g == "female") ? names.female :
  (g == "male") ? names.male :
  names['non-binary']
  return result

output
  [selectName(gender.selectOne)]
```

**Important: Function scoping.** Perchance compiles functions to `let` declarations at the top level. This means they create **global bindings** (accessible as plain `funcName()` from *both* panels) but NOT `window` properties (`typeof window.funcName === 'undefined'`). When calling from JS in `index.html`, always check and call directly: `if (typeof funcName === 'function') funcName(args)` — never use `window.funcName`.

### If/Else and Ternary

Ternary: `[condition ? valueIfTrue : valueIfFalse]`

Long-form if/else:
```
if (condition) {
  expr1
} else if (condition2) {
  expr2
} else {
  expr3
}
```

### Dynamic Sub-list Referencing

Use variables to select sub-lists dynamically:

```
[vehicle[myVar]]
```

### Imports

Import other generators as plugins:
```
dice = {import:dice-plugin}
// usage: [dice("1d6")]
```

Import with property access:
```
{import:generator-name}
```

### Built-in Generators
Perchance has ~37 built-in generators you can import: animals, colors, nouns, countries, names, etc.

## Common Plugins

### Text to Image Plugin (`https://perchance.org/text-to-image-plugin`)
Generates images from text prompts using AI. Usage:
```
t2i = {import:text-to-image-plugin}
```
Then call with a prompt string to generate an image. Check the specific plugin page for exact API parameters (prompt, dimensions, style, etc.).

### AI Text Plugin (`https://perchance.org/ai-text-plugin`)
Generates AI text completions (similar to LLM chat/completion).
```
ai = {import:ai-text-plugin}
```
Usage typically involves passing a prompt/messages and receiving generated text. Check the plugin page for current API.

### KV Plugin (`https://perchance.org/kv-plugin`)
Key-value data store for persisting data across sessions (uses IndexedDB under the hood). Stores structured-cloneable values (objects, arrays, numbers, strings) directly — no JSON serialization needed.

**CRITICAL: The API is namespace-based and promise-based.** There is NO bare `kv.set()` / `kv.get()`. `kv` is a Proxy where every property access returns a "folder" store object. You MUST use `kv.<folderName>.<method>(...)` and you MUST `await` every call (IndexedDB is async):

```js
kv = {import:kv-plugin}

// ⚠️ WRONG — kv.get / kv.set don't exist; property access returns a store object:
kv.set("abc", 123)          // ✗
let num = kv.get("abc")     // ✗ returns a store object, not the value

// ✅ RIGHT — namespace (folder) + await:
await kv.stories.set("fairytale1", "Once upon a time...");  // save
let text = await kv.stories.get("fairytale1");              // load (undefined if missing)

// Any folder name works (creates a separate store):
await kv.characters.set("Bob", {name:"Bob", hp:100, inventory:["stick","flask"]});
```

Full API (each folder object has all of these, all promise-based):
- Reads: `get(key)`, `has(key)`, `getMany(keys)`, `entries()`, `keys()`, `values()`
- Writes: `set(key, value)`, `setMany([key,value]...)`, `update(key, setterFn)`, `delete(key)`, `deleteMany(keys)`, `clear()`

**Use `update()` for atomic read-modify-write** (avoids lost-update races between concurrent async code):
```js
await kv.game.update("gold", v => v + 1);          // atomic increment
await kv.characters.update("bob", char => char.hp--);  // atomic object mutation
// NOT: let v = await kv.folder.get("gold"); await kv.folder.set("gold", v+1);  // race-prone
```

Since `kv` is defined in `lists.perchance`, keep all KV access there — call `kv.<folder>.<method>()` **directly** inside `lists.perchance` functions (the plugin is a callable Proxy, no wrapper needed) and `await` those functions from `index.html`. Also see the "KV Key Separation Pattern" and "Calling Plugins From `lists.perchance`" notes below.

### Font Awesome Icon Plugin (`https://perchance.org/fa-icon-plugin`)
Renders Font Awesome icons in the generator.
```
icon = {import:fa-icon-plugin}
// usage in HTML panel: [icon("icon-name")]
// e.g. [icon("cat")], [icon("heart")], [icon("star")]
```
The imported plugin is directly callable in `lists.perchance` (`icon("star")` returns `<i class="fas fa-star"></i>`), and `[icon("name")]` works in the HTML panel.

**RULE: Always use FA-plugin icons for UI icons in this user's projects — never plain emoji.**
- Static HTML panel: `[icon("name")]` (Perchance bracket expression).
- JS-generated HTML: call the plugin **directly** — it is a function itself. `icon("star")` in `lists.perchance`, `root.icon("star")` from `index.html` JS. No wrapper helper needed. Always include an emoji/text fallback for safety: `icon("star") || "⭐"`.
- The user dislikes the crown emoji specifically; use `star` for "main character".
- Replace emojis in small sections at a time; never blanket-replace strings that might contain emoji-like data.

### Pftexteditor Plugin (`https://perchance.org/pftexteditor`)
A full-featured rich text editor that can be embedded in generators for user text input/editing. Import and configure with options for height, toolbar buttons, etc.

## HTML Panel Patterns

Basic output:
```html
<p>[output]</p>
<button onclick="update()">Randomize</button>
```

Update specific elements (pass CSS selector):
```html
<button onclick="update('#result')">Randomize</button>
```

CSS styling is applied inline or via `<style>` tags directly in the HTML panel.

## File Conventions

When creating Perchance generators as local files, use these conventions:

- `lists.perchance` — contains the **Lists Panel** code (Perchance list syntax)
- `index.html` — contains the **HTML Panel** code (HTML/CSS/JS with `[...]` expressions)

Both files are placed in the generator's project directory. This keeps the two editor panels separate for easy copying into Perchance's online editor.

**Encoding hygiene (critical):** keep both files as UTF-8 **without BOM**. Re-encoding through tools that default to CP1252 (Windows PowerShell `Get-Content`/`Set-Content`, some editors) silently corrupts every non-ASCII character (emojis, accents) into mojibake (`âœï¸`, `ðŸ—‘ï¸`). Before deploying, verify: strict UTF-8 decode of the whole file passes (no invalid sequences), no BOM, and JS scripts pass `node --check`. If mojibake ever appears, recover by treating the corrupted chars as CP1252-encoded bytes and re-decoding as UTF-8 — but never round-trip the file through a text editor in the process.

## Best Practices

1. **Use `evaluateItem`** when storing results in variables to avoid re-evaluation
2. **Use `consumableList`** for drawing without replacement (card decks, unique assignments)
3. **Prefer `selectUnique`** over repeated `selectOne` when you need multiple unique items at once
4. **Use functions** to reuse complex logic instead of duplicating code
5. **Use dynamic odds** (`^[...]`) for context-sensitive weighting
6. **Use `$output`** to control what gets exported from lists or from the generator
7. **Import plugins** with `{import:plugin-name}` to reuse community-built functionality
8. **Variables inside square brackets** should be referenced by bare name (no extra `[]`)
9. **Escape special characters** with backslash when you need literal `[`, `]`, `{`, `}`, `=`, `^`
10. **Indentation is semantic** — wrong indentation breaks list hierarchy

## Perchance-Specific Gotchas (learned from experience)

### HTML Panel: `{{...}}` is Perchance Syntax
Double curly braces in the HTML panel are **always parsed as Perchance curly-block syntax** (`{item1|item2}`). Even `{{char}}` or `{{user}}` will trigger syntax errors. To display literal `{` or `}`, escape with backslash: `\{char\}`. This applies even inside HTML text content and attribute values. JavaScript strings inside `<script>` tags are safe since Perchance doesn't parse those.

### `$types` Must Not Reference Array Indices
When building data for ai-character-chat's Dexie format, `$types` entries like `"initialMessages.0.hiddenFrom": "arrayNonindexKeys"` will cause errors because Perchance traverses array-index paths. Use the field name directly: `"hiddenFrom": "arrayNonindexKeys"` (no `.0.` prefix).

### Multi-Line Template Literals in `lists.perchance`
When defining Perchance list functions with backtick template literals, the closing backtick **must be on its own line at the same indentation as the parent property**. Perchance's parser is line-based and will fail if the closing backtick is inline or at wrong indentation.

**Better yet: avoid multi-line template literals entirely.** Perchance's parser struggles with inconsistent indentation across backtick lines. Use single-line string concatenation instead:
```js
// DON'T (parser errors):
let s = `line one
  line two
  line three`;

// DO:
let s = "line one\n" +
  "line two\n" +
  "line three";
```

All function calls from `index.html` JS must use the bare name (no `window.` prefix). The `typeof` check must also use the bare name: `typeof myFunction === 'function'`.

### `{ }` Braces After `if` at DSL Level Can Break Parsing
At the Perchance DSL level (outside JavaScript expressions), `if` statements with `{ }` blocks can confuse the parser. Use one-liners or indentation-based blocks:
```js
// OK — one-liner:
if (condition) return;

// OK — indentation-based block:
if (condition)
  doSomething();

// RISKY — braces at DSL level can cause parse errors:
if (condition) { doSomething(); }
```

Inside JavaScript `()` expressions (e.g., callback bodies inside `ai({...})`), `{ }` works normally.

### Iframe Browsing Context Destroyed on `remove()`/`innerHTML`
When you call `.remove()` on an iframe or overwrite a parent's `innerHTML`, the iframe's browsing context (including any iframe-based image generation) is permanently destroyed. The only safe way to reposition an iframe is `appendChild` to move it to a different in-document parent.

### Strip Image URLs and Prompt Lines from AI Context
When sending existing text to the AI as context, strip these to save tokens (they're irrelevant for text generation):
- `data:image/...;base64,...` URLs: `.replace(/data:image\/[^;\s]+;base64,[^\s]+/g, '')`
- `Image Prompt:` / `Image Data URL:` lines: `.replace(/^[ \t]*(?:Image Prompt|Image Data URL): [^\r\n]*(\r?\n|$)/gm, '')`

### `ai()` Is Available in Both Panels
The AI text plugin (`ai = {import:ai-text-plugin}`) can be called from **both** documents — directly inside `lists.perchance` functions, and from `index.html` JavaScript via `root.ai(...)`. Preferred style: keep the whole AI flow in `lists.perchance` (async functions work fine there) and call it from `index.html` via the bare function name:

```
// lists.perchance
async generateReply(options) =>
  let stream = ai({ ... })
  return stream

// index.html
if (typeof generateReply === 'function') {
  let stream = await generateReply({ ... });
}
```

**`ai()` stream callback API:**
```js
let stream = ai({
  instruction: "...",
  startWith: " ",  // Must NOT be empty string — use " " (space)
  onStart: (data) => { /* stream started */ },
  onChunk: (data) => {
    data.textChunk;  // latest chunk of text
    // Accumulate manually: newContent += data.textChunk
  },
  onFinish: (data) => {
    data.stopReason;  // 'finished', 'error', 'user', 'length', 'cancelled'
    data.text;        // full accumulated text
  },
});
stream.stop();  // cancels the stream (triggers onFinish with 'user' reason)
```
Store the stream reference globally (`window.myStream = stream`) so JS can stop it later.

### Icons via `fa-icon-plugin`
Font Awesome icons are rendered using `{import:fa-icon-plugin}` (standard import name: `icon`). Use `[icon("icon-name")]` in the HTML panel, call `icon("icon-name")` directly in `lists.perchance` functions, or fall back to `root.icon` in `index.html` JS. See the Font Awesome section above for the full icon rules.

### `lists.perchance` vs `index.html` Boundary
Keep as much code as possible in `lists.perchance` — `index.html` should only contain HTML/CSS and the required scripting that *must* live in the document (DOM wiring, event listeners, UI updates).

- `lists.perchance` (Lists Panel): ALL logic — lists, variables, and **JavaScript functions** (functions CAN be stored here, they just need the correct format: canonical form `name(args) =>` followed by an **indented body**. Indentation is semantic in `lists.perchance` and more particular than in `index.html`, so every body line must be indented below the `=>` line):
  ```
  function(options) =>
    return options
  ```
  Plugin imports and plugin calls (`ai()`, `t2i()`, `kv.<folder>.<method>()`, `icon("name")`, etc.) all live here. Plugins imported in this panel are **directly callable** — no `root.` prefix needed.
- `index.html` (HTML Panel): HTML/CSS and only the DOM scripting that can't be moved. It calls `lists.perchance` functions by **bare name** (they compile to global `let` bindings, not `window` properties): `if (typeof funcName === 'function') funcName(args)`.
- `ai()` can be called from **both** documents — directly in `lists.perchance` functions (preferred), or in `index.html` JS when the flow must live there.
- Keep plugin import names consistent across projects: `ai = {import:ai-text-plugin}`, `t2i = {import:text-to-image-plugin}`, `icon = {import:fa-icon-plugin}`, `kv = {import:kv-plugin}`, `comments = {import:comments-plugin}`, etc. Import names may vary by plugin page, but keep this standard where possible.
- These are separate panels in the online editor. When working locally, keep them in separate files (`lists.perchance` + `index.html`).

### Event Delegation with innerHTML Re-renders
When using event delegation (e.g., `container.addEventListener('click', handler)`), replacing `container.innerHTML` does NOT break the listener (it's on the container itself). However, all child DOM elements are destroyed and recreated.

### One-Time Guard for Delegated Click Handlers on Re-rendered DOM
When messages/cards are re-rendered constantly and the same handler would otherwise be re-registered on every render, bind the delegated listener **once** on `window` (or a stable container) behind a global flag:
```js
if (!window.alreadyAddedImageButtonClickHandler) {
  window.alreadyAddedImageButtonClickHandler = true;
  window.addEventListener("click", async function(e) {
    if (e.target.classList.contains("keep-generated-image-button")) { /* ... */ }
    if (e.target.classList.contains("delete-generated-image-button")) { /* ... */ }
  });
}
```
Re-renders rebuild the DOM but never re-run this setup block, so handlers stay single-registered.

### Escape AI/User-Generated Text in HTML Attributes
Any attribute built from prompt, AI, or user text (`data-*`, `title`, `alt`) must be HTML-escaped. Unescaped double quotes break the attribute — the browser truncates the value at the quote, so reading it back via `dataset` yields a corrupted string and any key-based round-trip (e.g., looking up a saved image by its prompt) silently fails:
```js
// ❌ prompt containing " breaks the attribute:
`<div data-prompt="${prompt}">`
// ✅
`<div data-prompt="${sanitizeHtml(prompt)}">`
```
`sanitizeHtml` escapes `&`, `"`, `<`, `>`, and the browser decodes entities back when you read `dataset`, so the round-trip is lossless. Same rule applies to `title` and `alt` attributes.

### Guard Nested Writes into Storage-Loaded Objects
Records loaded from IndexedDB/KV may lack optional fields (schema evolved, or written by older code). Before mutating nested paths, initialize the chain or guard it:
```js
let msg = await db.messages.get(id);
if (!msg) return;
msg.customData = msg.customData || {};
msg.customData.__savedImages = msg.customData.__savedImages || {};
```
The render side must guard the same way: `if (obj.customData && obj.customData.__savedImages && obj.customData.__savedImages[key])`.

### Perchance Runs in an Iframe
The generator executes within an iframe. Access `window.parent` to reach the outer page, and use the Perchance `root` object (injected into the iframe) for engine APIs like `root.generateShareLinkForCharacter(...)` or `root.loadDataFromUrlThatReferencesCloudStorageFile(...)`. Note: imported plugins are called *directly* from `lists.perchance` — `root.<pluginName>` is only needed as a fallback from `index.html` JS.

### Calling Plugins From `lists.perchance` (No `root.` Needed)
Plugins imported in `lists.perchance` are **directly callable** in that panel — no `root.` object required:

```
// lists.perchance
ai = {import:ai-text-plugin}
t2i = {import:text-to-image-plugin}
icon = {import:fa-icon-plugin}

someFn(options) =>
  let text = await ai({ instruction: "..." })
  let image = t2i({ prompt: "..." })
  return icon("star")
```

From `index.html` JavaScript, imported plugins are NOT global variables — call them via the `root` object: `root.ai(...)`, `root.t2i(...)`, `root.icon(...)` (Perchance injects imported plugins onto `root`). Use optional chaining: `root?.ai?.(...)`. Keep the bulk of plugin work inside `lists.perchance` functions (called by bare name) so `index.html` stays minimal.

### `ai()` Stream Callback Data Contract
The `ai()` function returns a stream object and fires callbacks with specific data shapes:
- `onChunk(data)`: `data.textChunk` (string) — latest text fragment
- `onFinish(data)`: `data.stopReason` ('finished'|'error'|'user'|'length'|'cancelled'), `data.text` (string) — full accumulated text
- `stream.stop()` — cancels the stream (onFinish fires with 'user' reason)

### Line-Buffered AI Parsing Pattern
When streaming AI output that needs line-by-line parsing (e.g., structured character fields), use a per-character buffer:
```js
// Initialize:
appState._charBuffers[name] = '';

// In onChunk:
appState._charBuffers[name] += data.textChunk;
let lines = appState._charBuffers[name].split('\n');
if (lines.length > 1) {
  appState._charBuffers[name] = lines.pop();  // keep incomplete line
  lines.forEach(line => parseLine(line, charObj));  // process complete lines
}

// In onFinish:
if (appState._charBuffers[name]) {
  parseLine(appState._charBuffers[name], charObj);  // flush last line
}
```

### Stale Closure References with Re-parsing
When you re-parse data from a DOM element (e.g., textarea) and replace an array, any pre-existing references to objects in that array become stale. Always re-find from the live array on every callback:
```js
// ❌ Broken — `char` is captured once and becomes orphaned:
let char = appState.characters.find(c => c.name === name);
stream = ai({
  onChunk: (data) => { parseLine(data, char); },  // char is STALE after first re-parse
});

// ✅ Fixed — re-find from live array each time:
stream = ai({
  onChunk: (data) => {
    let cur = appState.characters.find(c => c.name === name);
    if (cur) parseLine(data, cur);
  },
});
```

### Structured Data Round-trip Pattern
When using a textarea as the source of truth, maintain structured state via serialize/parse round-trip:
```js
// Write state to textarea:
window._serializeOutput = function() {
  outputEl.value = formatStory(story) + formatChars(characters);
};

// Read state back from textarea:
window._parseCharsFromOutput = function() {
  let blocks = parseCharacterBlocks(outputEl.value);
  appState.characters = blocks.map(/* extract fields */);
};
// Call _parseCharsFromOutput() before any operation that reads appState.characters.
```

### Iframe Preservation for Image Results
When an iframe (from `textToImagePlugin`) exists in the DOM, never use `innerHTML` on its parent container — this destroys the iframe's browsing context and kills any in-progress image generation. Instead, check for an existing iframe and only update the surrounding UI:
```js
function renderImageContainer() {
  let ctn = document.getElementById('imageCtn');
  let hasIframe = ctn.querySelector('iframe');
  if (hasIframe) {
    // Only update the buttons/UI area — never touch the result div
    let btns = ctn.querySelector('.buttons');
    if (btns) btns.innerHTML = buildButtonHtml();
    return;
  }
  // No iframe — safe to rebuild everything
  ctn.innerHTML = buildFullHtml();
}
```

### `textToImagePlugin` Canvas Data URL
Extract the generated image as a data URL in the `onFinish` callback — call `t2i({...})` **directly** in `lists.perchance` functions, or `root.t2i({...})` from `index.html` JS:
```js
t2i({
  prompt: '...',
  onFinish: function(result) {
    try {
      let dataUrl = result.canvas.toDataURL('image/jpeg');
      appState.imageDataUrl = dataUrl;
    } catch(e) {}
    // Replace iframe with static img:
    appState.imageHtml = '<img src="' + dataUrl.replace(/"/g,'&quot;') + '" style="max-width:100%;">';
    renderImageContainer();
  },
});
```

### `console.debug` for Streaming Debugging
Perchance generators have no console hiding — all `console.debug` calls are visible in the browser DevTools. Use them liberally during development to trace data flow:
```js
console.debug('[myFeature] onChunk', {name, chunk:data.textChunk, cur});
console.debug('_serializeOutput', {fields:chars.map(c=>({name:c.name,age:c.age}))});
```
This is especially valuable for debugging AI streaming issues where the AI is producing output but the UI isn't updating.

### Debounced Textarea `oninput`
When handling textarea changes that trigger re-parsing and re-rendering, use a debounce pattern to avoid flicker during rapid typing:
```js
let _debounceTimer;
outputEl.oninput = () => {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    window._parseStoryFromOutput();
    window._parseCharsFromOutput();
    renderStoryPanel();
    renderCharacters();
  }, 200);
};
```

### Character Field Model as `[key, label]` Array
Define character fields as a single source of truth array of `[internalKey, displayLabel]` pairs. Both serialization and parsing use this array:
```js
window.charFields = [
  ['age','Age'], ['gender','Gender'], ['role','Role in Story'],
  ['appearance','Physical Appearance'], ['personality','Personality'],
  // ...
];

// Serialize:
charFields.map(([key, label]) => char[key] ? label + ': ' + char[key] : '')

// Parse:
charFields.forEach(([key, label]) => {
  let rx = new RegExp("^" + escapeRegex(label) + ":\\s*(.+)", "i");
  let m = line.match(rx);
  if (m) charObj[key] = m[1].trim();
});
```

### Helper Functions for Text Processing
Always define these reusable helpers in `index.html`:
```js
window.escapeRegex = function(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
window.htmlEscape = function(str) { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
```

### Dossier Cache Key for Skip-Re-render
Avoid flicker in character dossiers by computing a cache key from field values and skipping render when unchanged:
```js
let cacheKey = window.charFields.map(([key]) => char[key] || '').join('|');
if (_lastBody[charName] === cacheKey) return;
_lastBody[charName] = cacheKey;
```

### Two-Stage AI → Image Generation
For generating cover art or illustrations, use a two-stage pipeline:
1. **Stage 1**: Use `ai()` to generate a rich visual description based on story/character data (instruct to "describe what the image should look like for an artist")
2. **Stage 2**: Use the AI-generated description as the prompt for `textToImagePlugin`

This produces far better results than programmatically concatenated field data.

### Export to AI Character Chat (Dexie Format)
When exporting multiple characters for AI Character Chat:
- **`{user}`** = first character with data (protagonist), marked `customData.isPersona = true`
- **`{char}`** = second character, is the main chat character
- Always offer a popup for the user to override these auto-assignments
- The main character's `userCharacter` field should be populated with the user's `name`, `avatar`, and `roleInstruction`
- Merge the user's `roleInstruction` into the main character's card under a `# {{user}} Description:` section
- The `{char}` and `{user}` shortcuts should NOT be duplicated in the per-character shortcuts list
- Multi-character Dexie exports cannot use share links — hide the Share button and show a download-only message
- Filename pattern: `{StoryTitle}_{YYYY_MM_DD_HH_MM}.json`

### KV Key Separation Pattern
When using the KV plugin for persistent storage, use separate folders/namespaces (or prefixed keys within a folder) for different data types:
```
kv.stories.set(id, data)   — story data folder, keyed by story id
kv.meta.set("stories_meta", metaArr)   — app-level metadata folder
kv.backups.set(id, backupArr)
```
Since every `kv.<folderName>` access creates a separate IndexedDB store, folder-per-purpose is the cleanest separation. Prefixed keys (`story_{id}`, `characters_{id}`) also work within a single folder. Remember every method returns a promise — always `await`.

### UI Section Toggle via State Flag
For collapsible/togglable UI sections, use a simple boolean state flag:
```js
appState.sectionVisible = false;

function toggleSection() {
  appState.sectionVisible = !appState.sectionVisible;
  renderSection();  // checks the flag and hides/shows
}

function renderSection() {
  let ctn = document.getElementById('sectionCtn');
  if (!appState.sectionVisible) { ctn.innerHTML = ''; return; }
  // ... render full content
}
```

### Active Stream Tracking with `getCharActive`
Track whether a character has an active AI stream for UI state (loading spinners, disabled buttons):
```js
appState.charStreams = {};  // {name: stream}
window.getCharActive = function(name) { return !!appState.charStreams?.[name]; };

// Set when stream starts:
appState.charStreams[name] = stream;

// Clear on finish:
delete appState.charStreams[name];
```

### Strip Image Data from AI Context
When submitting existing text as context for AI text generation, always strip binary image data and metadata lines to save tokens:
```js
context = context
  .replace(/data:image\/[^;\s]+;base64,[^\s]+/g, '')
  .replace(/^[ \t]*(?:Image Prompt|Image Data URL): [^\r\n]*(\r?\n|$)/gm, '');
```

### `stopReason` Values
The `onFinish(data)` callback's `data.stopReason` can be:
- `'finished'` — completed normally
- `'error'` — generation failed
- `'user'` — cancelled via `stream.stop()`
- `'length'` — hit token limit
- `'cancelled'` — cancelled by system

Always handle `'error'` and `'user'` to restore UI state:
```js
if (data.stopReason === 'error' || data.stopReason === 'user') {
  // Rollback or show error
}
```

### Don't Rely on `for...of` for Imported Perchance Lists
Imported generators (like `t2iStyles = {import:t2i-styles}`) return plain JS objects, not iterable Perchance lists. Use `Object.keys()` or `for...in`:
```js
let keys = Object.keys(t2iStyles);
for (let i = 0; i < keys.length; i++) {
  let name = keys[i];
  let data = t2iStyles[name];
}
```
Never use `for (let item of t2iStyles)` or `.selectAll()` — they don't work on imported objects.

### `[input.description]` in Imported Plugins Evaluates in YOUR Context
When you import a plugin that uses `[input.description]` (like t2i-styles), Perchance evaluates that variable in YOUR generator's context. If `input.description` doesn't exist, it becomes `undefined`. Either:
- Define `input.description` in your generator before the import evaluates
- Or don't import the plugin — instead build a local style array with `{description}` placeholders replaced via JS string operations

### Prefer Local Style/Template Arrays Over Dynamic Plugin Imports
For UI elements like style dropdowns, a local JS array with simple string placeholders (`{description}`) is much simpler than importing a plugin and fighting Perchance evaluation:
```js
window.styles = [
  {name: 'Anime', prompt: 'anime art of {description}, masterpiece'},
  {name: 'Cinematic', prompt: '{description}, cinematic shot, dynamic lighting'},
];
// Usage: style.prompt.split('{description}').join(actualPrompt)
```
Use `str.split('{placeholder}').join(value)` instead of regex `replace()` — avoids any regex escaping issues with `{` and `}`.

### Storing Clean vs Styled Prompts
Keep two separate concepts:
- **Clean prompt** (`char.imagePrompt`) — raw AI-generated visual description without any style wrapping
- **Styled prompt** — clean prompt wrapped with the selected style's prefix/suffix at generation time

Never store the styled version back into the clean prompt field. Always apply the style at the point of use (image generation, export), reading the clean prompt and the current style selection independently.

### `for...in` vs `Object.keys()` for Perchance Objects
Imported generators that return objects can be iterated with both `for...in` and `Object.keys()`. However, `for...in` may include prototype properties. Prefer `Object.keys()` filtered to exclude internal keys (`$output`, `_...`).

### Blank Lines Must Not Reset Continuation State
When parsing multi-line fields (dialogue examples, summaries), blank lines between the field label and continuation content should NOT reset the field tracker. Only `##`/`###` section headers should clear continuation state:
```js
if (tl.startsWith('##') || tl.startsWith('###')) {
  _lastField = null;
  return false;
}
if (!tl) return false;  // blank line — don't clear _lastField
```

### Per-Character Continuation Tracking
When processing multiple character streams in parallel, continuation state (`_lastField`) must be keyed per-character UID, not global:
```js
// ❌ Global — characters overwrite each other's continuation context
window._lastField = key;

// ✅ Per-UID — each character tracks independently
window._lastField[uid] = key;
```

### Regex `(.+)` Requires Content — Use `(.*)` for Empty Fields
When parsing field labels, `(.+)` requires at least one character after the colon. If the AI puts content on the next line (like bullet points), the regex fails:
```js
// ❌ Fails on "Dialogue Examples:\n- \"...\""
/^Dialogue Examples:\s*(.+)/i

// ✅ Captures empty content, then continuation handles the next lines
/^Dialogue Examples:\s*(.*)/i
```

### Shared Mutable State Must Be Window-Accessible from Both Panels
Cache objects like `_dossierLastBody` that need to be invalidated from Perchance code must be on `window.appState`, not a `let` variable. Use `window.appState._dossierLastBody = {}` so both index.html JS and lists.perchance can clear it:
```js
window.appState._dossierLastBody = {};
// Both panels read/write window.appState._dossierLastBody
```

### Character Export: `contextInfoToggle` Must Be `"no"` with Proper `customData.contextInfo`
ACC (AI Character Chat) reads `customData.contextInfo.basic` even when `contextInfoToggle` is `"no"`. If the structure doesn't have `basic` as an object, it throws `Cannot read properties of undefined (reading 'enabled')`. Always include:
```js
customData: { contextInfo: { basic: { prompt: "..." }, detailed: {} } }
contextInfoToggle: "no"
```

### PNG Character Card Export (SillyTavern/Janitor AI)
To create a PNG with embedded character data:
1. Build the SillyTavern V3 JSON via `buildSillyTavernJson`
2. Base64-encode the JSON string
3. Draw the avatar on a canvas, export as PNG blob
4. Parse the PNG binary, find the IEND chunk
5. Insert TWO `tEXt` chunks (both `chara` and `ccv3` keywords with the same base64 JSON) before IEND
6. CRC32 must be computed correctly for each chunk
7. Concatenate and download as `.png`

### Bulk Regeneration Should Sync Global Complexity
When regenerating all characters via `character_generator`, sync each character's complexity to the current `complexitySelectEl` dropdown value AND update `charComplexityMap` so it survives `_parseCharsFromOutput` re-parsing:
```js
let gComp = window.charComplexity || 'simple';
window.appState.charComplexityMap ??= {};
window.appState.characters.forEach(c => {
  c.complexity = gComp;
  window.appState.charComplexityMap[c._uid || c.name] = gComp;
});
```

### Style Dropdown Order in Section Headers
When dynamically inserting elements into a section header, use `insertBefore(newEl, actionsEl)` to place the style dropdown BEFORE the action buttons, not before the chevron (which would put it after actions):
```js
let actionsEl = sec.querySelector('.char-image-actions');
if (actionsEl) { headerEl.insertBefore(sel, actionsEl); }
else { headerEl.insertBefore(sel, headerEl.querySelector('.dossier-section-chevron')); }
```

### `canvas.toBlob()` for PNG Data, Not `toDataURL()`
When reading PNG binary data for chunk manipulation, use `canvas.toBlob()` + `FileReader.readAsArrayBuffer()` to get the raw `Uint8Array`, not `canvas.toDataURL()` which gives a base64 string that's harder to manipulate at the chunk level.

### Avoid Inline `onchange` with Complex Quote Escaping
Instead of `onchange="var s=this; var n=s.getAttribute('data-char'); ..."` with `\'` escaping, define a `window.setImageStyle(sel)` function and use `onchange="setImageStyle(this)"`. This eliminates quote-escaping bugs in JS-generated HTML strings.

### `buildAddCharacterPayload` Should Strip Internal Fields
When creating a shareable character payload for Perchance's `addCharacter` format, strip internal/system fields (`$types`, `contextInfo`, `contextInfoPrompt`, `creationTime`, etc.) before sending:
```js
let fields = { ...charObj };
["$types","autoUpdatePersona","contextInfo","contextInfoPrompt",...].forEach(k => delete fields[k]);
return { addCharacter: fields, quickAdd: true };
```

### Split Large Functions by Responsibility
Keep index.html JS focused on DOM/UI. Move pure data functions (parsing, serialization, UID management, text escaping) to lists.perchance. Perchance functions compile to `let` declarations accessible globally (but NOT on `window`). Call them via bare name, or use `_callPerchanceFn('funcName', args)` as a bridge.

### Debounced Auto-Save with Dirty Checking
Use a content hash to skip unnecessary KV saves:
```js
function _computeStoryHash() {
  return [output, chars, imageData, complexity, ...].join('|||');
}
async function saveCurrentStory() {
  let hash = _computeStoryHash();
  if (hash === _lastSavedHash) return; // unchanged
  await getKv().set(...);
  _lastSavedHash = hash;
}
```
Include ALL mutable state in the hash (image data, complexity maps, collapsed sections, cover visibility) so any change triggers a save.

### Invalidate Render Caches on State Changes
The dossier cache (`_dossierLastBody`) and roster cache (`_lastRosterHtml`) must be cleared whenever image state, complexity, or style changes occur — otherwise the UI won't reflect the new state even though data is correct.
