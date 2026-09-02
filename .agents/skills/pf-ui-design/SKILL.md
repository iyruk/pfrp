---
name: pf-ui-design
description: The user's UI/UX design standard for Perchance generator projects (pfacc, pfstory, pflot, pfrpg, etc.). Use when building, redesigning, or restyling any UI in these projects — character selection pages, character editors, cards, menus, modals, toasts, icons, search/sort, group chats. Also use when the user says "conform to my design standard", "match my style", or references this skill.
---

# PF UI Design Standard

The user's preferred design language for all Perchance app projects. When asked to build or restyle UI, follow this standard. When unsure, follow the established patterns below rather than inventing new ones.

## Core principles

1. **Theming**: Never hardcode colors. Always use the app's existing CSS variables (`--background`, `--box-color`, `--card`, `--border-color`, `--text-color`, `--link-color` as accent, `--border-radius`, `--border-radius-sm`, `--border-radius-pill`, `--transition`). Support light/dark via `prefers-color-scheme`.
2. **Contrast rules**: Text uses full-contrast `--text-color`. Dimmed/secondary text uses `var(--text-color)` at reduced opacity (0.45–0.6) — never a gray from the border/surface palette. **Placeholders must be readable in both themes**: `input::placeholder, textarea::placeholder { color: var(--text-color); opacity: 0.45; }` — never `var(--border-color)` or hardcoded grays. Accent (`--link-color`) is used for links, active states, highlights, and icon color; success #3d7a5e / #2e9e44, warning #e98721, danger #b05050 / #d64545 are the complementary status colors.
   - **Audit every text token per theme** with a WCAG contrast check before shipping: text ≥ 4.5:1 on the default background (≥ 3:1 only for purely decorative icons, never for readable text). Check against the darkest dark-mode surface AND the lightest light-mode surface, because tokens are reused across `--bg`, `--bg-surface`, `--bg-overlay`, and modal overlays.
   - **`--text-dim` / `--text-muted` tokens**: If a project defines these, they are still text tokens — they must hold ≥ 4:1 in both themes, and keep the lightness hierarchy `--text` > `--text-dim` > `--text-muted` within each theme. In dark mode a near-black muted gray fails badly (e.g. `#4a4843` on `#0a0711` is ~2.2:1 — unreadable); brighten it (e.g. dark: `--text-dim:#8f8980`, `--text-muted:#7a7670` ≈ 5.8:1 / 4.4:1 on `#0a0711`). When a muted token can't be both dimmer than `--text-dim` and readable, brighten `--text-dim` first to create headroom.
   - **Never stack extra `opacity` on an already-dim token** (e.g. a button at `opacity:0.4` on `--text-muted`) — the two multiply into invisibility. Hover-revealed/opacity-hidden controls are invisible on touch devices where there is no hover: secondary icon buttons are always visible, ≥ 1.7rem tap targets, `--text-dim` color, accent on hover (see Dossier-style editors).
3. **Type & sizing scale** (use consistently — mixed sizes make the site look unfinished):
   - Body/base text: browser default (16px); modals, prompt2 inputs/textareas/selects: 0.9rem
   - Page/section titles: 1.3rem; modal choice buttons: 1rem; card names: 0.85rem; card taglines: 0.72rem
   - Primary UI buttons (action pills): 0.85rem, padding ~0.4rem 1rem, pill radius
   - Compact buttons/icon buttons: 0.72–0.8rem (1.7rem circle icon buttons; ⋯ menu buttons 0.78rem)
   - Labels/hints: 0.72–0.78rem; panels/trees: 0.8rem; toasts: 12.5px; tooltips: 0.75rem
   - Native `<select>` cannot render HTML icons — for icon-bearing dropdown options use a custom dropdown component (button + popup menu, FA icons + labels).
3. **Consistent type/control scale** — define and use these CSS variables everywhere; never mix ad-hoc sizes:
   - `--font-2xs: 0.62rem` — micro badges only (folder chips on cards)
   - `--font-xs: 0.7rem` — meta text, compact sidebar controls (folder tree sort select)
   - `--font-sm: 0.78rem` — buttons, dropdown/popup menus, toasts, tree rows, tabs
   - `--font-md: 0.85rem` — inputs, selects, card names, standard body UI
   - `--font-lg: 0.95rem` — modal titles, big choice buttons
   - `--font-xl: 1.1rem` — page headings
   - Control heights: `--control-sm: 1.6rem` (small icon buttons), `--control-md: 2rem` (standard buttons/inputs), `--control-lg: 2.4rem` (primary actions).
    All inputs/selects/buttons in the same row share the same height (`min-height: var(--control-md)`); icon-only buttons use `--control-sm`; never use percentage font sizes (e.g. `font-size:110%`).
- **Typography rules**: never use em-dashes (—) or en-dashes (–) in any UI copy (labels, hints, placeholders, toasts, descriptions) — use commas or plain hyphens. Refer to two-person chats as **"Individual"**, never "1-on-1".
- **Modal footers & action rows** (hard rule, applies to every project): Save/Cancel and other action button rows NEVER live inside a scrollable body. They are hoisted into a fixed footer outside the scroll container so nothing scrolls behind or below them: full-width row, top border, same background as the modal, bottom corners rounded to the modal radius, no gap below. Settings-style multi-tab modals get the same footer treatment per tab (footer populated on tab switch, hidden when the tab has no actions). Inside panel cards, action buttons sit in a consistent button row with a clear gap (e.g. `.panel-card .key-row { margin-top: 12px; }`) below the card text. **One button style everywhere**: identical `.btn` styling (same padding, height `--control-md`, radius, font size) across modal footers, panel cards, and inline rows - no ad-hoc variations.
- **Roleplay chat formatting**: the quote/speech SETTING (toggle, delimiter char, color) must exist, and the rendered message shows the dialogue WITH its quote characters, colored. Handle straight, curly, and mixed quote pairs ("…", "…", "…" variants) automatically.
2. **Mockups first**: For any significant layout change (new pages, redesigned screens), create standalone HTML mockup files with dummy data in a `design-samples/` folder (e.g. `variant-a.html`, `variant-b.html`) BEFORE touching production code. Let the user pick a variant, then implement that one.
3. **Cards, not rows**: Character/thread lists use a centered card grid — `repeat(auto-fill, minmax(160px, 1fr))` capped via `max-width` (≈900px) so it never exceeds ~5 columns, fluid on smaller screens. Cards show avatar (circular), name, tagline (2-line clamp), folder badge. Hover: subtle lift (`translateY(-2px)`) + shadow.
4. **Menu-first cards**: Cards keep only identity visible (avatar, name, tagline, IDs). ALL management actions (edit, folder, persona, duplicate, share, delete, rename, export, favorite…) live in a **⋯ (ellipsis) dropdown menu** revealed on hover. Menu must persist while open (`menuOpen` class raises the card's z-index so neighboring cards don't cover it), and closes on any action or outside click. On touch devices, hover-revealed buttons are always visible.
5. **Click = choice popup**: Clicking a card opens a centered popup with large clean action buttons, each with a short description underneath (e.g. "Start new chat — A 1-on-1 chat with X", "Group chat… — Chat with X and others you pick"). Use `prompt2` with a `none`-type HTML section; wire buttons before the prompt opens.
6. **Dossier-style editors**: Editing screens have a header card (profile pic on the left, name + tagline inputs next to it) followed by a **tab bar** of pill-style tabs (FA icons + label). First tab is "Character Details" (avatar/identity fields + personality). Fields are grouped logically (Personality → Chat setup → Appearance → Memory → Lore → Advanced). No "show hidden settings" button — every field is always visible inside its tab.
7. **Search & sort**: Instant, debounced (~300ms) search that also matches folders and taglines. A sort dropdown (default "name A–Z") that sorts BOTH items and folders (folders ordered by the same metric computed from their contents).

## Icons

- **Font Awesome via the fa-icon-plugin — ALWAYS. Every UI icon must come from the FA plugin; never use a plain emoji for a UI icon.** This is a hard rule.
- Static HTML panel: `[icon("name")]` (Perchance bracket expression).
- JS-generated HTML: `faIcon("name") || "EMOJI-FALLBACK"` helper that checks `typeof icon === "function"` then `root.icon` (plugins are accessed via `root` in these apps), returning `null` if unavailable. Always keep an emoji/text fallback for safety.
- Common choices: `theater-masks` (characters), `comments` (chat/thread), `address-card` (details), `palette` (appearance/images), `brain` (memory), `book` (lore), `cog` (settings/advanced), `globe`, `tools`, `search`, `palette`, `folder`, `pen`, `copy`, `link`, `trash`, `star`, `users`, `ellipsis-h`, `arrow-up`, `upload`, `download`, `comment`, `ghost`, `bars`, `times`.
- Replace emojis in small sections at a time (never blanket-replace code that might contain emoji-like data).

## Toasts (design from pfrpg)

Universal bottom-center toast system (stacked, gap 6px):

- `.toast` — solid background (`var(--background)`), 1px `var(--border-color)` border, `var(--border-radius)`, padding `0.5rem 1rem`, font-size 12.5px, `box-shadow: 0 8px 28px rgba(0,0,0,0.4)`, **opacity fade only** (no slide/translate), max-width `min(92vw, 480px)`.
- Spinner for running tasks: 14px circle, 2px border with accent `border-top-color`, `spin 0.8s linear infinite`.
- **Task toasts are click-to-stop**: normal text shows `Label (click to stop)`; on hover the border turns danger red (`#b05050` + `rgba(176,80,80,0.14)` background) and the text swaps to `⚠️ Stop Label?`. Clicking cancels and transitions to `⚠️ stopped`.
- Finish states: `✅ done` or `⚠️ stopped`, then auto-fade after ~1.2s.
- API: `showToast(message, {duration, type, actions, id})`, `showTaskToast(taskId, label, onCancel)`, `finishTaskToast(taskId, stopReason)`, `updateToast(id, message, {type, duration})`, `hideToast(id)`. Duration `0` = persistent.
- Use task toasts for any long-running background work (AI replies, regeneration, context info generation, spawning) so the user always knows what's running.

## Modals & tooltips

- Modals must be truly centered on the viewport (`align-items:center` AND `justify-content:center` on the fixed overlay).
- ℹ️ info icons render a **rich HTML hover tooltip** (fixed-position element appended to `document.body`, positioned via `getBoundingClientRect`, flips below the icon when no room above). Never rely on native `title` attributes. Tooltips preserve original line breaks (`\n` → `<br>`).
- **Tooltip contrast** — tooltips must clearly stand out from whatever they hover over (modals, chat backgrounds, images). Use an elevated surface (`var(--box-color)`), a 1.5px accent border (`var(--link-color)`), and a strong shadow (`0 12px 32px rgba(0,0,0,0.45)`). Never use the same color as the page background (`var(--background)`) — it blends in. Text stays full-contrast `var(--text-color)`.
- Tooltip elements are removed when their modal/section closes; shared tooltip elements persist across re-renders to avoid leaks.

## Group chats

- A "main" character hosts the chat thread; every other member becomes a 🎭 shortcut button (`/ai @Name#id respond and stay fully in character as …`) added to the thread.
- Member selection happens in a clean modal with instant search + scrollable list + a `star` button to set exactly one main (gold highlight). First selected is main by default.

## Verification & safety

- After edits, extract each `<script>` block and run `node --check` (module scripts as `.mjs`). Never ship without this.
- Automated regex transformations on this codebase are risky: injection patterns like `^\s{6}(\w+): \{` can match non-spec object literals (e.g. result-assembly code) — always scan for out-of-place injections and verify no functions leak into objects that get persisted to IndexedDB (Dexie can't clone functions).
- prompt2 gotchas: every `[data-spec-key]` element needs a matching spec entry (even `{}`) or `updateInputVisibilies` throws; tabs can be implemented via a hidden input + `show: (values) => values.__activeTab === "x"` on each spec.
