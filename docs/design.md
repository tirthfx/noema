# Noema — Design

**Reading Room**: a warm-white study, not a consumer AI toy and not another dark AI app. Light only. The instrument metaphor stays — signals mean things — but the room is lit.

Two signal colors, one meaning each:
- **Green** means *verified* — validated citations, approved writes, primary actions that commit. If green appears, code checked something or the user approved something.
- **Amber** means *the agent is acting* — the tool-call pulse while a call is in flight, and nowhere else.

If you reach for either color to make something look nicer, don't.

---

## 1. Color & theme

All values as CSS custom properties in `src/styles/tokens.css` — no raw hex values inside component files.

```css
:root {
  /* Grounds — warm paper, layered */
  --bg-wall:   #F7F6F2;   /* window ground, sidebar, composer */
  --bg-panel:  #FFFFFF;   /* the reading surface, cards, modals */
  --bg-inset:  #F1EFEA;   /* mono blocks, inputs on panel */
  --bg-scrim:  rgb(34 36 42 / 42%);

  /* Borders */
  --border-subtle: #E4E2DC;
  --border-strong: #CBC8C0;

  /* Text — ink on paper */
  --text-primary:   #22242A;
  --text-secondary: #6E7076;
  --text-tertiary:  #989A9F;

  /* Signals */
  --accent-green:      #31614C;   /* citations, verification, primary actions */
  --accent-green-soft: #EAF0EC;   /* citation chip bg, selected nav bg */
  --accent-amber:      #B0813B;   /* agent activity pulse ONLY */

  /* Status — muted, not neon */
  --state-success: #4C7A5C;
  --state-error:   #A94F42;
  --state-warning: #A87F34;
}
```

Usage discipline:
- `--accent-green` appears on: the Citation component, the selected sidebar item, primary action buttons, and confirmation copy for approved writes.
- `--accent-amber` appears on: the ToolCallIndicator while a call is running. Nowhere else.
- Everything else is ink-on-paper neutrals. If a screen has signals competing for attention, that's a bug.

## 2. Fonts

Three fonts, each with one job. Never mix them within the same line of text.

| Font | Role | Where |
|---|---|---|
| **Inter** | UI chrome — "click this" | Buttons, nav, labels, form inputs |
| **Source Serif 4** | Reading — "read this" | Questions, answers, artifacts, empty-state guidance, view titles |
| **JetBrains Mono** | Machine-referential — "the machine did this" | Tool calls, file paths, citation refs, index stats |

Loaded via bundled font files (no CDN — desktop app).

## 3. Typographic scale

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-display` | 27px / 36px | 600 | Artifact titles |
| `text-heading` | 20px / 28px | 600 | Section headings |
| `text-question` | 19px / 1.4 | 600 | The user's question in the stream (serif) |
| `text-body-content` | 16px / 1.75 | 400 | Answer/artifact prose (serif) — generous line-height, this is reading material |
| `text-body-ui` | 13–14px / 20px | 400–600 | UI chrome (Inter) |
| `text-caption` | 11–12px / 16px | 400–500 | Secondary labels, eyebrows |
| `text-mono` | 11–13px / 18px | 400 | Tool calls, paths (JetBrains Mono) |

## 4. Layout

Sidebar app, one main surface:

- **Sidebar** (218px, `--bg-wall`): brand, then the five workspace modes — Ask, Review, Capture, Link, Corpus — as nav items with stroke icons. Selected item gets `--accent-green-soft` bg + green text. Footer: vault name, index stats in mono, a quiet "Switch vault" text link. The top ~30px is a drag region (macOS traffic lights live here).
- **Main column**: a slim header (serif view title; on Ask, the mono tagline "grounded · citations validated in code"; Windows window controls on Windows), then the reading surface (`--bg-panel`, white), then the composer.
- **Composer** (`--bg-wall` strip): one pill-shaped row (`--bg-panel`, hairline border, soft radius) whose fields change with the mode. One green primary button per row. Corpus has no composer.
- The reading surface is the only white area — light-from-the-page, like a manuscript on a desk.

## 5. Component specs

### Citation (signature component)
- Small pill inline with artifact/answer text: green border, `--accent-green-soft` background, mono label with the note title.
- Hover: popover with the exact quoted passage in serif on white, soft shadow.
- Click: reveal the source note in Finder/Explorer.
- A citation that failed code-validation never renders in this state.

### ToolCallIndicator
- Mono, small, tertiary ink, inline in the stream: `search_notes("…") → 5 matches`.
- While running: amber with a slow opacity pulse (~1.2s) — the only amber in the app.
- Always visible, never collapsed.

### EditablePreview
- Modal over a dark scrim: white panel, 12px radius, soft shadow.
- Eyebrow in green (PROPOSED NEW NOTE / PROPOSED EDIT), path in mono, the "nothing has been written yet" promise as a caption.
- Added-lines block with a `--state-success` left rule; plain textarea; actions bottom-right — Discard (text) then **Approve & write** (green primary). Two actions only.

### RecallCard (F2)
- On the Ask view only, above the stream: `--bg-wall` cards with hairline borders, 9px radius, max 3, dismiss appears on hover. Path eyebrow in small green mono caps ("RESURFACED" treatment). No amber — recall is passive.

### CorpusOverview (F6)
- Fills the reading surface when Corpus is selected: plain hairline-separated list rows — status dot (muted success/warning/error), Inter title, mono path, status label. A file browser, not a graph.

## 6. Motion

- 150–180ms ease-out fades/slides on panel open and hover. No spring/bounce.
- The one deliberate exception: the amber pulse on running tool calls.

## 7. Empty / error / loading states

- Empty states: one calm serif sentence explaining what the mode does and the promise that applies ("Nothing is written without your approval"), plus the composer itself. No illustrations, no emoji.
- Errors: specific and plain-language per `rules.md`'s table, in a `--state-error` left-rule block.
- Loading: determinate "Indexing N of M files" in the sidebar stats where knowable; amber pulse where not.

## 8. Platform chrome

- Custom hidden-native titlebar on both platforms (`hiddenInset` on macOS, frameless + custom controls on Windows). Window `backgroundColor` matches `--bg-wall` so there's no flash.
- macOS traffic lights top-left over the sidebar drag region; Windows min/max/close top-right in the main header.

## 9. Anti-patterns (don't do these)

- Dark-mode-by-default AI-tool styling — the light room is the identity
- Glassmorphism, gradients, floating blobs, neon glow
- Emoji in UI copy
- Green or amber used decoratively — both are semantic signals only
- More than one signal competing for attention at once
