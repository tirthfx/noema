# Noema — Memory

Living state file. **Read this first, every session, before writing code.** Update the "currently working on" line when you start work and the log/checklist when you stop. This file is append-only for the log section — never delete past entries, only add to them.

This is a clean restart. Full pre-restart history (naming journey, the original web-app architecture, the model-provider saga) lives in `Noema - Update.md` in the Obsidian vault — not reproduced here. Decision numbering below starts fresh at D1 for this build era.

---

## Status

**Restart date:** 16 Jul 2026
**Deadline:** 21 Jul 2026, 5:00 PM PT / 22 Jul 2026, 5:30 AM IST
**Current phase:** Phase 3 complete. Phase 4 (Ask-your-knowledge) is next.

## Currently working on

> Update this line every session. Example: `Phase 1 — resolving which NIM model to use for embeddings (architecture.md §6 open item).`

Phase 4 — building grounded Ask-your-knowledge with a clear no-match refusal path.

---

## Phase-by-phase checklist

Mirrors `phases.md`. Check off acceptance criteria, not just "touched the code."

- [x] **Phase 0** — Scaffold & skeleton (Electron+React+Vite+TS+Tailwind, security settings on from the start, folder picker, launches clean on macOS; Windows manual verification remains pending until a Windows runner is available)
- [x] **Phase 1** — Vault ingestion & index (heading-based chunks, NIM embeddings, `.noema/index.json`, incremental re-index, read-only tools working; automated temporary-vault verification passed)
- [x] **Phase 2** — Agent loop core (tool-calling loop, minimal chat UI, visible tool calls)
- [x] **Phase 3** — HERO: Notes → Artifact (citation validator, Citation component, Tensions section, persona picker)
- [ ] **Phase 4** — Ask-your-knowledge (grounded Q&A, refusal path)
- [ ] **Phase 5** — Capture & auto-file (text/URL capture, editable preview, approved writes, PDF if time allows)
- [ ] **Phase 6** — Proactive recall + seed data (deterministic demo vault with a real tension and a real hidden connection)
- [ ] **Phase 7** — Corpus overview + polish pass
- [ ] **Phase 8** — Cross-platform packaging (electron-builder, both unsigned, GitHub Actions dual-runner build, README run instructions)
- [ ] **Phase 9** — Demo video, README, submission

## Open technical items (resolve before/during the phase noted)

- [x] **Embedding model** — `nvidia/llama-nemotron-embed-1b-v2`, 2048 dimensions. Confirmed against the live NIM catalog and `/v1/embeddings`; passages use `input_type: "passage"`, queries use `input_type: "query"`.
- [x] **Chunking strategy** — heading-based. Each Markdown heading and its following body become one chunk, preserving the local claim/context relationship needed for research-note retrieval.

---

## Decisions log (this build era — D1 onward)

| # | Decision | Rationale |
|---|---|---|
| D1 | Full restart from the prior web-app build; carry forward name (Noema), audience (researchers/educators/students), hero feature (F1, code-validated citations), and design language | Prior scaffold only reached Phase 0; cleaner to restart docs than retrofit |
| D2 | Runtime model: **NVIDIA NIM, `z-ai/glm-5.2`**, kept over GPT-5.6 despite Stage-One pass/fail risk on the "reasonably applies the required APIs/SDKs" gate | Carried forward from the prior build era's Decision D16 — not being re-litigated; full reasoning in `Noema - Update.md` §5 |
| D3 | Vision/image ingestion **cut from this build's scope entirely** | Not needed for the demo; if revisited later, route to a different model rather than `glm-5.2` |
| D4 | Tool calling on `z-ai/glm-5.2` **confirmed** available | Unblocks Phase 3's synthesis step — standard tool-calling loop, no PTC-equivalent fallback needed |
| D5 | Platform pivot: **desktop app, Windows + macOS**, from a single Electron codebase — reverses the prior build era's explicit "native app rejected for hackathon" call | Accepted knowingly: judges must now download/install rather than click a link, a real judging-friction cost. Mitigated by treating the demo video as the primary judged artifact and giving packaging (Phase 8) a full time slot rather than an afterthought. |
| D6 | Electron chosen over Tauri | Faster, more reliable for Codex to scaffold correctly inside a ~5.5-day window; Tauri's Rust core adds build/debug risk this build can't afford |
| D7 | No code signing / notarization for either platform this build | Time constraint; README documents the unsigned-build workaround for both OSes instead |
| D8 | Both Windows and Mac installers built via GitHub Actions (`windows-latest` + `macos-latest` runners), not cross-compiled or built on borrowed hardware | Removes the single-developer-machine bottleneck for producing two native builds |
| D9 | Persistence is two plain JSON files (`.noema/index.json`, `.noema/config.json`) — no embedded database | Vault-scale data doesn't need one; also avoids native-module cross-platform build risk |
| D10 | Keep a small last-vault pointer in Electron's app-data directory; validate it against `<vault>/.noema/config.json` on launch | A config living only inside an unknown vault cannot be discovered on relaunch. The vault-local config remains the authoritative record; the pointer only locates it. |
| D11 | Use NIM `nvidia/llama-nemotron-embed-1b-v2` embeddings at 2048 dimensions | Live catalog and endpoint verification confirmed availability. It is a multilingual, long-document retrieval model and explicitly supports distinct passage/query embeddings. |
| D12 | Chunk notes by Markdown headings | Heading boundaries retain a note's argument and its local context better than arbitrary windows while keeping Phase 1 implementation transparent and dependency-free. |
| D13 | Strip claims and tension sides with no verified citations | The artifact must never make unsupported prose appear grounded. A real-note excerpt replaces a near-matched model quote before render so every displayed popover is checkable. |

*(Add D13+ here as new decisions get made — never renumber or delete existing ones.)*

## Blocked / needs user input

*(empty — nothing currently blocked)*

## Dependencies added (with scope-creep-test answer)

| Dependency | Scope-creep test answer | Added in phase |
|---|---|---|
| `electron` | Provides the required desktop main/preload/renderer process model | Phase 0 |
| `electron-vite` | Bundles Electron main/preload and the Vite renderer from one TypeScript codebase; replaces manual multi-process bundler setup | Phase 0 |
| `electron-builder` | Produces the required macOS/Windows installer targets; replaces manual platform packaging | Phase 0 |
| `react`, `react-dom` | Provide the specified renderer UI layer | Phase 0 |
| `vite`, `@vitejs/plugin-react` | Provide the specified renderer development/build pipeline | Phase 0 |
| `tailwindcss`, `autoprefixer` | Consume the specified design tokens through Tailwind and generate portable CSS | Phase 0 |
| `@fontsource/inter`, `@fontsource/source-serif-4`, `@fontsource/jetbrains-mono` | Bundle the required fonts locally instead of loading them from a CDN | Phase 0 |
| `typescript`, `@electron-toolkit/tsconfig`, `@types/node`, `@types/react`, `@types/react-dom` | Enforce strict TypeScript across the Electron and React boundaries | Phase 0 |

> Format going forward: `package-name — replaces X that Node/Electron/React doesn't give for free / just convenient (justify why it's in anyway) — Phase N`

## Append-only session log

**16 Jul 2026** — Docs restart session. All six docs (`prd.md`, `architecture.md`, `rules.md`, `phases.md`, `design.md`, `memory.md`) written from scratch against the new Electron/Windows+Mac pivot. Nothing built yet. Next session should start at Phase 0.

**16 Jul 2026** — Phase 0 complete. Scaffolded Noema with Electron, React, Vite, strict TypeScript, Tailwind, and electron-builder. Applied `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a renderer CSP, and a narrow typed `window.noema` bridge from the initial shell. Implemented native vault-folder selection, writes `<vault>/.noema/config.json`, and validates the stored vault on relaunch. Added all design tokens and bundled Inter, Source Serif 4, and JetBrains Mono locally. Confirmed TypeScript compilation, a production macOS arm64 package build, and foreground macOS Electron launch without startup errors. Windows launch/manual picker verification remains for a Windows machine or CI runner.

**16 Jul 2026** — Phase 1 complete. Queried the live NIM catalog, selected `nvidia/llama-nemotron-embed-1b-v2` (2048 dimensions), and verified both its embeddings endpoint and `z-ai/glm-5.2` chat completions with HTTP 200. Implemented the main-process Markdown walker (skips `.noema/` and `.obsidian/`), heading-based chunking, plain-JSON incremental index, cosine search, and the three read-only tools behind the typed IPC bridge. NIM requests retry once on timeouts/5xx; chat 403s surface the Public API Endpoints hint. A temporary vault smoke test verified relevant search results, zero re-embeds when unchanged, selective re-embedding after editing one note, record removal after deletion, and corrupt-index rebuild without a crash. A final approved real-vault check indexed 46 notes / 1,141 chunks, returned ranked semantic-search matches, and re-embedded zero unchanged chunks. Next: Phase 2 only — chat UI and tool-calling loop.

**16 Jul 2026** — Phase 0–1 audit and hardening pass. Fixed atomic index persistence and failure recovery so a failed embedding/write cannot leave a partial in-memory index; invalid stored records now force a full rebuild. Read-only IPC tools no longer initiate a vault re-scan, their incoming values are validated, saved-vault validation now requires a directory, and existing index counts remain visible after a failed refresh. The renderer now offers an explicit retry for failed/corrupt index builds; external window-open requests are denied. Re-verified strict TypeScript, the synthetic semantic-search smoke test (including zero unchanged re-embeds), local fonts and security settings, renderer API-key absence, and the unpacked macOS app contents.

**16 Jul 2026** — Phase 2 complete. Added the main-process NIM `z-ai/glm-5.2` tool-calling loop and exposed it through a narrow `agent:send-message` IPC handler; the renderer has no NIM access. The loop supplies only `search_notes`, `read_note`, and `list_notes`, executes all tool calls returned in a turn sequentially, appends each result as a `tool` message, and continues until a plain assistant response. Tool activity is sent over the existing restricted bridge and rendered inline by default, with the amber pulse limited to the in-flight portion of each call. A malformed response or tool-argument JSON is stopped at the parse boundary and shown with the raw response plus retry; NIM timeouts/5xx retry once then show a specific error. Strict TypeScript and an unpacked production build pass. No NIM-specific response quirk was observed during this build verification; Phase 3 can reuse this loop but must add citation validation before treating generated claims as grounded.

**16 Jul 2026** — Phase 2 re-check. Corrected the chat stream so tool calls remain in their chronological position before the assistant answer and remain visible across later turns. Tool execution errors now become a completed tool result, which prevents an amber in-flight pulse from getting stuck and gives the model an explicit error result to handle. Strict TypeScript passes. A repeat unpacked-package attempt compiled and bundled successfully but could not complete the packaging download because the build environment could not resolve GitHub.

**16 Jul 2026** — Phase 3 complete. Added the Notes → Artifact literature-review flow on top of the Phase 2 read-only tool loop, with Academic, Socratic Critic, and Plain-Language tone controls. The main-process citation validator reads each cited vault note and strips any claim or tension side without an exact/near-exact source match; for near matches it substitutes an actual passage from the source note before the renderer receives it. The ArtifactView renders validated citation pills with hoverable source passages and a click action that reveals the source file in the OS file browser. Tensions require two validated sides and render with the specified warning border. Persona only alters the prompt tone; validation is unconditional in `generateArtifact`. Strict TypeScript and the Electron/Vite production bundle pass. Live NIM and manually contradictory-vault verification remain the next manual test before demo capture.

**16 Jul 2026** — Phase 3 live verification. Added and ran `npm run smoke:artifact` against a temporary two-note vault containing a real contradiction. The NIM-backed run indexed the vault, generated an artifact through the tool loop, and passed assertions for at least one validated claim, no uncited rendered claims, and at least one validated tension. The visible citation hover/click and the three persona variations remain desktop UI checks for the next demo pass.

---

## Quick reference

- Repo: `tirthfx/noema` (GitHub)
- Runtime model: NIM, `z-ai/glm-5.2`, `https://integrate.api.nvidia.com/v1/chat/completions`
- Env var: `NVIDIA_API_KEY`
- Vault data lives at: `<user's chosen folder>/.noema/`
- Six docs live at: `docs/` in the repo (commit all six, every time — a prior era lost `memory.md` from a commit by accident)
