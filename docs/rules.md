# Noema — Rules

Hard bans and hard requirements for anyone (human or Codex) writing code in this repo. If a rule here blocks something that seems necessary, that's a `memory.md` decision to log and get sign-off on — not a reason to quietly route around it.

---

## 1. Tech stack — use

- **Electron** (main/preload/renderer split, strict `contextIsolation`)
- **React + TypeScript**, `strict: true` in `tsconfig.json`, no `any` without a comment explaining why
- **Vite** for the renderer bundle
- **Tailwind CSS**, config driven entirely by the tokens in `design.md` — no ad-hoc hex values in components
- **electron-builder** for packaging both targets
- Plain **React state + Context** for app state
- Plain **JSON files** (`.noema/index.json`, `.noema/config.json`) for persistence
- NIM's OpenAI-compatible SDK shape via plain `fetch` (Node's built-in fetch in the main process) — no separate OpenAI SDK wrapper needed for a single provider

## 2. Tech stack — avoid, and why

| Banned | Why |
|---|---|
| Any ORM / hosted database (Postgres, SQLite via native bindings, etc.) | Two plain JSON files are enough at vault scale; a database is scope creep that also reintroduces the native-module cross-platform build risk below |
| Native/compiled Node modules (`better-sqlite3`, `sharp`, etc.) | Native modules need prebuilt binaries per OS/arch. Getting this wrong is a classic way to lose a day debugging `node-gyp` on a machine you don't have the deadline to spare. If a JS-only alternative exists, use it. |
| Global state library (Redux, Zustand, MobX, Recoil) | App state is small enough for React Context; a state library here is convenience, not necessity — fails the scope-creep test below |
| Auth library / accounts | No accounts in this product at all |
| Graph-visualization library | Obsidian already owns the graph view (F6 is explicitly a list/tree, not a graph) |
| Rich-text or code editor library (Monaco, CodeMirror, TipTap) | Obsidian owns note editing; `EditablePreview` is a diff/textarea-level UI, not a full editor |
| Prebuilt UI kit (MUI, Chakra, shadcn as a dependency) | Build components by hand from `design.md` tokens — a kit fights the intentional, non-templated look this app needs |
| `nodeIntegration: true` / disabling `contextIsolation` / Electron `remote` module | Security boundary violation — see `architecture.md` §1. Never, even temporarily "to move faster." |
| Auto-updater (`electron-updater`) | Out of scope for a hackathon submission; adds a whole separate failure surface |
| Analytics/telemetry of any kind | Not needed, and adds a data-handling question nobody asked for |
| Anything requiring the user to create an account or enter payment info | Out of scope entirely |

**Scope-creep test** — before adding *any* new dependency, ask: does this replace something Node, Electron, or React already gives us for free, or does it just look convenient right now? If the former, it's probably fine. If the latter, don't — log it in `memory.md`'s dependency log with the answer to this question, even for ones you do add, so the next session can see the reasoning.

## 3. Electron security rules (non-negotiable)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the renderer `BrowserWindow`.
- The **only** bridge between renderer and main is `preload.ts`'s `contextBridge.exposeInMainWorld`, with an explicit, narrow, typed API — never expose `ipcRenderer` directly.
- A Content-Security-Policy meta tag in the renderer's `index.html` restricting script sources to `'self'`.
- The NIM API key is read in the **main process only** (env var or `safeStorage`-encrypted local file) and never serialized into anything the renderer can read.
- No `<webview>` tags, no loading of remote URLs into app windows beyond what's explicitly needed (there shouldn't be any for this app).

## 4. Agent behavior rules

- **Grounding is not negotiable.** Every claim in an F1 artifact or F4 answer must resolve to an actual passage in an actual indexed note. If retrieval finds nothing relevant, the agent must say so — it does not fill the gap from general knowledge.
- **Citations are code-validated, not trusted.** A dedicated validator (`electron/citation-validator.ts`) checks that the cited text is actually present (exact or near-exact match) in the source note *before* a citation is allowed to render. A citation that fails validation is dropped from the output or flagged, never silently rendered as if verified.
- **No silent writes.** `write_note` and `link_notes` never touch disk directly from the agent loop. They always produce a proposal that flows through `EditablePreview`, and only a user-approved commit performs the actual fs write.
- **Tool visibility.** Whenever the agent calls a tool, the UI shows which tool and on what input (`ToolCallIndicator.tsx`) — the user should never wonder whether the agent just quietly did something.
- **Persona/style picker changes tone only.** Switching Academic / Socratic Critic / Plain-Language must never relax the grounding or citation-validation rules above — enforce this in code (the validator runs regardless of persona), not just in the prompt.
- **Proactive recall (F2) is read-only.** It can suggest; it can never itself trigger a write.

## 5. Error-handling boundaries for the AI/agent layer

These exist because model output is the least trustworthy input in the whole system — treat it accordingly.

| Situation | Required behavior |
|---|---|
| Model returns malformed or partial tool-call JSON | Catch at parse time; show the raw response and a retry option; never guess at intent or silently drop the turn |
| Model call times out or errors (5xx, network) | One automatic retry, then a visible, specific error state — never an infinite spinner |
| Model hallucinates a note path that doesn't exist | `read_note`/`search_notes` return a clear "not found" tool result; the agent must handle that result and not fabricate content to compensate |
| Model produces a claim with no matching citation | Citation validator strips or flags it; it does not block the rest of the artifact from rendering |
| Index file missing/corrupt at startup | Treat as empty index, offer full rebuild with progress — never crash |
| fs write fails (permissions, locked file, disk full) | Surface the actual OS error in the preview flow; never retry silently or swallow the error |
| NIM 403 on chat completions specifically | Check whether it's the known "Public API Endpoints" personal-org restriction (see `architecture.md` §6) before treating it as a code bug |

## 6. AI-agent (Codex) working rules

- Read `memory.md` **first**, every session, before writing any code.
- Update `memory.md`'s "currently working on" line at the start of a work session and its checklist/log at the end — don't leave it stale.
- If a decision in these docs seems wrong once you're actually building, say so and log the proposed change in `memory.md`'s decision log — don't just quietly deviate.
- Run every new dependency through the scope-creep test in §2 before adding it, and log the answer even for ones you keep.
- All six docs (`prd.md`, `architecture.md`, `rules.md`, `phases.md`, `design.md`, `memory.md`) must be committed to `docs/` in the repo — a prior build era lost `memory.md` from the commit by accident; don't repeat that.
