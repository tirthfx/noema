# Noema — Architecture

Covers app flow, process architecture, folder/file structure, tech stack, data model, agent tools, model routing, index strategy, and error boundaries. Written as an agent-readable spec — Codex should build directly from this, not improvise around it. If something here needs to change, that's a decision to log in `memory.md`, not a silent deviation.

---

## 1. Process architecture (Electron, three contexts)

Electron gives us three separate JS contexts. Keep the boundary strict — this is also a security rule, see `rules.md`.

```
┌─────────────────────────────┐
│  Main process (Node)        │  fs access, NIM API calls, index persistence,
│  - vault.ts                 │  window/menu lifecycle. The only process with
│  - index.ts                 │  network access or real filesystem access.
│  - agent.ts                 │
│  - ipc-handlers.ts          │
└──────────────┬──────────────┘
               │ ipcMain.handle / ipcRenderer.invoke (typed, whitelisted)
┌──────────────┴──────────────┐
│  Preload (contextBridge)    │  Exposes a narrow `window.noema.*` API.
│  - preload.ts               │  Nothing else crosses this boundary.
└──────────────┬──────────────┘
               │
┌──────────────┴──────────────┐
│  Renderer (React, sandboxed)│  UI only. No Node APIs, no direct fs,
│  - src/App.tsx               │  no direct network calls. Talks to main
│  - src/components/...        │  exclusively via window.noema.*
│  - src/state/...             │
└─────────────────────────────┘
```

**Why this matters for a hackathon build specifically:** it's tempting to turn on `nodeIntegration` in the renderer to move faster. Don't — it's a five-minute shortcut that creates a real security hole (a malicious note title or fetched web page could otherwise reach `fs`/`child_process`), and judges/reviewers who open the source will see it immediately. Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

---

## 2. App flow (user's path through the app)

1. **Launch** → app window opens, no vault loaded yet. Empty state per `design.md`.
2. **Pick vault folder** → native OS folder picker (`dialog.showOpenDialog`, main process). Path stored (not the folder contents) for next launch.
3. **Index** → main process walks the folder for `.md` files, chunks + embeds new/changed files, persists to `<vault>/.noema/index.json`. Progress shown in UI. Re-launching the same vault does an incremental re-index (mtime/hash check), not a full rebuild.
4. **Home screen** → corpus overview (F6) + proactive recall cards (F2) if any exist.
5. **Agent interaction** → chat-style input. Every user turn goes through the tool-calling loop (§5). Two things it can produce:
   - **An answer** (F4 — Ask-your-knowledge), grounded, cited, or a refusal if nothing relevant was retrieved.
   - **An artifact** (F1 — the hero), a longer synthesis with per-claim citations and a Tensions section.
6. **Write actions** (F3/F5 — new note, new link) never happen silently. The agent proposes; the UI shows an **editable preview**; the user edits and/or approves; only then does main process write to disk.
7. **Relaunch** → vault path remembered, incremental re-index, session-continuity card (F7) if built.

---

## 3. Folder & file structure

### Repo structure

```
noema/
├── docs/
│   ├── prd.md
│   ├── architecture.md
│   ├── rules.md
│   ├── phases.md
│   ├── design.md
│   └── memory.md
├── electron/
│   ├── main.ts              # app lifecycle, window creation, menu
│   ├── preload.ts            # contextBridge, whitelisted API surface
│   ├── ipc-handlers.ts       # ipcMain.handle registrations, one per tool/action
│   ├── vault.ts              # fs walk, chunking, file read/write
│   ├── index.ts              # embedding calls, cosine search, index persistence
│   ├── agent.ts              # tool-calling loop, NIM client
│   ├── tools/
│   │   ├── search-notes.ts
│   │   ├── read-note.ts
│   │   ├── list-notes.ts
│   │   ├── write-note.ts
│   │   └── link-notes.ts
│   └── citation-validator.ts # code-validates every citation before render
├── src/                       # renderer (React)
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Citation.tsx      # signature component, see design.md
│   │   ├── ToolCallIndicator.tsx
│   │   ├── EditablePreview.tsx
│   │   ├── ArtifactView.tsx
│   │   ├── RecallCard.tsx
│   │   └── CorpusOverview.tsx
│   ├── state/                # React context + hooks, no external state lib
│   └── styles/
│       └── tokens.css         # design tokens from design.md
├── shared/
│   └── types.ts               # types shared between main/preload/renderer
├── build/                     # electron-builder icons, entitlements
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

### Inside the user's actual vault (created by Noema, lives with their notes)

```
<vault>/
├── ... user's existing .md files, untouched unless they approve a write ...
└── .noema/
    ├── index.json           # chunk + embedding store, mirrors indexed notes
    └── config.json           # per-vault settings (last-indexed timestamps, persona pref)
```

No hidden database file, no SQLite file, no binary format — both files are plain JSON so a curious user (or judge) can open them in a text editor and understand exactly what Noema stored about their vault.

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Electron** | Chosen over Tauri for build reliability inside a ~5–6 day window — see `memory.md` decision log. |
| Renderer framework | **React + TypeScript (strict)** | |
| Bundler | **Vite** | Not Next.js — there's no SSR/routing need for a single-window desktop app; Vite is faster and simpler for an Electron renderer. |
| Styling | **Tailwind CSS**, custom config from `design.md` tokens | |
| Packaging | **electron-builder** | Targets: `nsis` (Windows `.exe`) and `dmg`/`zip` (macOS). Both unsigned for this build — see `rules.md` and `phases.md`. |
| Runtime model | **NVIDIA NIM**, model `z-ai/glm-5.2`, endpoint `https://integrate.api.nvidia.com/v1/chat/completions` (OpenAI-compatible request/response shape) | Confirmed: tool-calling supported. Vision: not used this build. |
| Embeddings | **NIM embeddings endpoint** — model TBD, verify against the current NIM model catalog at build start | Flagged open item, see §6. |
| Secrets | `NVIDIA_API_KEY`, read from `.env` at build time / OS keychain via Electron `safeStorage` at runtime — **never** in renderer code or renderer-visible config | |

**Explicitly not used:** ORM, hosted database, auth library, global state library (Redux/Zustand/MobX), graph-visualization library, rich-text/code editor library, prebuilt UI kit. Full rationale in `rules.md`.

---

## 5. Agent tools (tool-calling loop)

The agent loop lives in `electron/agent.ts`, calling NIM's OpenAI-compatible tool-calling interface. Tool definitions:

| Tool | Args | Effect | Write? |
|---|---|---|---|
| `search_notes` | `query: string, topK: number` | Cosine search over `.noema/index.json`, returns chunk matches with note path + excerpt | No |
| `read_note` | `path: string` | Returns full note content | No |
| `list_notes` | `folder?: string` | Returns note paths/titles, optionally scoped to a folder | No |
| `write_note` | `path: string, content: string` | Proposes a new/edited note — **routes to editable preview, not a direct write** | Yes (gated) |
| `link_notes` | `fromPath: string, toPath: string, context: string` | Proposes a wikilink insertion — **routes to editable preview** | Yes (gated) |

Any tool marked "Yes (gated)" never touches disk directly from `agent.ts`. It returns a proposal object; the renderer shows `EditablePreview.tsx`; only a user-approved commit calls the actual fs write in `vault.ts`.

---

## 6. Model routing

- **Chat/synthesis/tool-calling:** NIM, `z-ai/glm-5.2`, OpenAI-compatible `/v1/chat/completions` shape (verified format: `messages[]`, `tools[]`, standard `tool_calls` in response).
- **Embeddings:** not yet pinned to a specific NIM model — **verify against NIM's current model catalog in the first build session** before writing index code around a specific dimension size. If no suitable embedding-capable model is available on NIM, fall back to a small pure-JS embedding approach rather than pulling in a native/compiled dependency (cross-platform build risk, see `rules.md`).
- **Vision:** not used. If ever added post-hackathon, route to a separate, explicitly vision-capable model rather than assuming `glm-5.2` handles it.

**Known setup gotcha (from NVIDIA's own developer forums, worth budgeting debug time for):** some NIM API keys under a "Personal" organization type return `403 Forbidden {"detail":"Authorization failed"}` specifically on `/v1/chat/completions` (while `/v1/models` works fine with the same key) until "Public API Endpoints" access is enabled on the account. If chat completions fail with a 403 but the key itself checks out against `/v1/models`, this is the first thing to check — not a bug in Noema's request code.

---

## 7. Index strategy

1. Walk vault for `*.md`, skip `.noema/` and any Obsidian internal folders (`.obsidian/`).
2. Chunk each note (by heading or fixed token window — pick one and document it in `memory.md` once decided).
3. Embed each chunk.
4. Persist `{ notePath, chunkId, text, embedding, mtime }` records to `.noema/index.json`.
5. On load, read the whole file into an in-memory array/Map for cosine similarity search — no query language, no index server, just a linear scan (vault-scale, this is fast enough and avoids a database dependency entirely).
6. On re-launch, compare each note's `mtime` against the stored record; only re-embed changed/new files; drop records for deleted files.

---

## 8. Error boundaries

| Failure | Handling |
|---|---|
| NIM API timeout/5xx | One retry, then a visible error card in the UI — never a silent hang |
| NIM 403 on chat completions | Surface the "Public API Endpoints" hint from §6 directly in the error message |
| Malformed/incomplete tool-call JSON from the model | Catch at the parse boundary, show the raw response + a retry action; never silently drop the turn |
| `.noema/index.json` missing or corrupt | Treat as "no index" and offer a full rebuild with a progress bar — never crash on load |
| fs write failure (permission denied, file locked, disk full) | Surface the OS error to the user in the `EditablePreview` flow; never silently retry or silently drop the write |
| Citation fails code-validation | Exclude that specific claim from the artifact (or flag it inline as unverified) rather than let it render as if validated — grounding is not negotiable, see `rules.md` |
| Vault folder moved/deleted since last launch | Detect on launch, prompt to re-pick the folder rather than erroring on a stale path |
