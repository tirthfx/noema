# Noema — Design

Research-instrument aesthetic, not a consumer AI toy. Dark only. Amber is a signal, not a decoration — it means "the agent is acting" or "this is a citation," nowhere else. If you find yourself reaching for amber to make a button look nicer, don't.

---

## 1. Color & theme

All values as CSS custom properties in `src/styles/tokens.css`, consumed by `tailwind.config.ts` — no raw hex values inside component files.

```css
:root {
  /* Backgrounds — layered, not flat */
  --bg-base:        #0B0D0F;   /* window background */
  --bg-surface:      #14171A;   /* cards, panels */
  --bg-elevated:     #1C2024;   /* modals, EditablePreview, popovers */
  --bg-inset:        #0E1012;   /* code/mono blocks, tool-call chips */

  /* Borders */
  --border-subtle:   #2A2F35;
  --border-strong:    #3A4046;

  /* Text — warm off-white, not pure white (paper-under-lamp, not screen-glow) */
  --text-primary:    #E8E6E1;
  --text-secondary:  #9BA0A6;
  --text-tertiary:   #6B7178;

  /* The one accent — agent activity + citations, nothing else */
  --accent-amber:      #D9A441;
  --accent-amber-dim:  #8A6A32;   /* hover/pressed, and amber-on-dark-bg text */
  --accent-amber-bg:   #2A2213;   /* citation chip background */

  /* Status — muted, not neon */
  --state-success:   #7A9B76;
  --state-error:     #B56A5C;
  --state-warning:   #C9A45C;
}
```

Usage discipline:
- `--accent-amber` appears on: the tool-call indicator while the agent is acting, the Citation component's border/icon, and nowhere in standard navigation, buttons, or chrome.
- Everything else in the UI is grayscale (`--bg-*`, `--text-*`, `--border-*`). If a screen has more than one amber element competing for attention at once, that's a bug, not a feature.

## 2. Fonts

Three fonts, each with one job. Never mix them within the same line of text.

| Font | Role | Where |
|---|---|---|
| **Inter** | UI chrome — "click this" | Buttons, nav, labels, menus, form inputs |
| **Source Serif 4** | Note & artifact content — "read this" | Note bodies, generated artifacts (literature reviews, etc.), the Q&A answer text |
| **JetBrains Mono** | Machine-generated/machine-referential — "the machine did this" | Tool-call indicators, file paths, citation source references, index/debug info |

```css
--font-ui:     'Inter', system-ui, sans-serif;
--font-content: 'Source Serif 4', Georgia, serif;
--font-mono:    'JetBrains Mono', 'SF Mono', monospace;
```

Load via local font files bundled with the app (not a CDN — this is a desktop app, don't add a network dependency for something this basic).

## 3. Typographic scale

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-display` | 28px / 36px | 600 | Artifact titles |
| `text-heading` | 20px / 28px | 600 | Section headings (Tensions & Open Questions, etc.) |
| `text-body-ui` | 14px / 20px | 400–500 | UI chrome (Inter) |
| `text-body-content` | 17px / 28px | 400 | Note/artifact prose (Source Serif 4) — generous line-height, this is reading material |
| `text-caption` | 12px / 16px | 400 | Secondary labels, timestamps |
| `text-mono` | 13px / 18px | 400 | Tool calls, paths, citation refs (JetBrains Mono) |

Keep the scale small and don't add sizes ad hoc — six sizes is enough for this app's actual surface area.

## 4. Component specs

### Citation (signature component)

The single most important visual element in the app — this is what makes F1's grounding claim *visible*, not just true in code.

- Renders as a small pill/chip inline with the artifact text: amber border (`--accent-amber`), amber-tinted background (`--accent-amber-bg`), mono-font label showing the note title (truncated) in `text-mono`.
- Hover: a preview popover shows the exact quoted passage from the source note, in `text-body-content` (Source Serif 4), so the user can visually compare "what was claimed" against "what the note actually says" without leaving the artifact.
- Click: opens the source note (reveal in Finder/Explorer, or open in the user's actual Obsidian app if a path association exists — don't try to reimplement a note viewer, see `rules.md`'s editor-library ban).
- A citation that failed code-validation never reaches this component in its normal state — it either doesn't render, or renders in a distinct "unverified" visual state (desaturated, no amber, small warning glyph) if you choose to surface failures rather than silently drop them. Pick one behavior and be consistent.

### ToolCallIndicator

- Mono font, small, sits inline in the chat/agent stream: e.g. `search_notes("citation styles") →  4 matches`.
- While a call is in flight: a subtle amber pulse (opacity breathing, not a spinner icon) — calm, not busy-looking.
- Always visible, never collapsed by default — hiding tool calls behind a toggle undermines the "it acts, not just answers" differentiator; the acting should be *seen*.

### EditablePreview

- Elevated surface (`--bg-elevated`), appears as a panel/modal before any `write_note`/`link_notes` commits.
- Shows the proposed content as an editable text area (plain textarea-level editing, not a rich editor — see `rules.md`), with a clear diff-style affordance if editing an existing note (added lines subtly highlighted, not a full diff library — keep this hand-rolled and simple).
- Two actions only: **Approve & write** / **Discard**. No silent third path.

### RecallCard (F2)

- Small, read-only card, `--bg-surface`, no amber (recall is not "the agent acting," it's a passive surface) — reserve amber discipline even here.
- Max 3 on screen at once, dismissible individually.

### ArtifactView (F1 output)

- `text-body-content` throughout, `text-heading` for section breaks, Citation components inline.
- "Tensions & Open Questions" section visually set apart — a left border in `--state-warning` (not amber — amber is reserved for citations/agent-activity, this is a content-level flag, different meaning) and a `text-heading` label.

### CorpusOverview (F6)

- Plain list/tree, `text-body-ui` + `text-mono` for paths, status dot per note (indexed / stale / error) using the muted status colors. Explicitly not a force-directed graph — resist the pull to make this "look impressive," it should look like a file browser.

## 5. Motion

- Minimal and purposeful: 150–200ms, ease-out, on fades/slides for panel open/close and hover states.
- No spring/bounce easing anywhere — it reads as playful, which fights the research-instrument tone.
- The one deliberate exception is the amber "thinking" pulse on `ToolCallIndicator` — slow (∼1.2s cycle), subtle opacity breathing, never a spinning icon.

## 6. Empty / error / loading states

- Empty states (no vault picked, no index yet, no recall cards): calm, single-line `text-secondary` copy plus one clear action — never a cutesy illustration or multi-paragraph onboarding wall.
- Error states: specific and plain-language (see `rules.md`'s error-handling table for what each one actually needs to say) — never a generic "something went wrong."
- Loading (indexing progress, artifact generation in progress): a determinate progress indicator where the count is knowable (indexing N of M files), and the amber pulse pattern from `ToolCallIndicator` where it isn't.
- No emoji anywhere in UI copy.

## 7. Platform-specific chrome (Windows + macOS, one Electron codebase)

- Both platforms use a **custom, hidden-native titlebar** (`titleBarStyle: 'hiddenInset'` on macOS, a custom draggable region + custom min/max/close controls on Windows) rather than the OS-default title bar — this keeps the window chrome consistent with the dark theme instead of showing a jarring light-mode default bar.
- macOS: traffic-light controls stay top-left (native, don't try to relocate them).
- Windows: custom minimize/maximize/close controls top-right, styled to match — `text-tertiary` icons, hover states in `--bg-elevated`.
- If time is short (see `phases.md` cut order), falling back to each OS's default titlebar is an acceptable degradation — it's a polish item, not a functional one.

## 8. Anti-patterns (don't do these)

- Glassmorphism / frosted-glass panels
- Purple-to-blue gradients
- Inter-only or Poppins-only typography (the three-font system is the point)
- Floating blob/organic background shapes
- Neon glow effects
- Emoji in UI copy
- More than one amber element competing for attention on screen at once
