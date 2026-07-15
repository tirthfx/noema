# Noema — Memory

Living state file. **Read this first, every session, before writing code.** Update the "currently working on" line when you start work and the log/checklist when you stop. This file is append-only for the log section — never delete past entries, only add to them.

This is a clean restart. Full pre-restart history (naming journey, the original web-app architecture, the model-provider saga) lives in `Noema - Update.md` in the Obsidian vault — not reproduced here. Decision numbering below starts fresh at D1 for this build era.

---

## Status

**Restart date:** 16 Jul 2026
**Deadline:** 21 Jul 2026, 5:00 PM PT / 22 Jul 2026, 5:30 AM IST
**Current phase:** Phase 0 complete. Phase 1 (Vault ingestion & index) is next.

## Currently working on

> Update this line every session. Example: `Phase 1 — resolving which NIM model to use for embeddings (architecture.md §6 open item).`

Phase 1 — resolving the NIM embedding model and implementing vault ingestion and the persistent index.

---

## Phase-by-phase checklist

Mirrors `phases.md`. Check off acceptance criteria, not just "touched the code."

- [x] **Phase 0** — Scaffold & skeleton (Electron+React+Vite+TS+Tailwind, security settings on from the start, folder picker, launches clean on macOS; Windows manual verification remains pending until a Windows runner is available)
- [ ] **Phase 1** — Vault ingestion & index (chunking decided, embeddings wired, `.noema/index.json`, incremental re-index, read-only tools working)
- [ ] **Phase 2** — Agent loop core (tool-calling loop, minimal chat UI, visible tool calls)
- [ ] **Phase 3** — HERO: Notes → Artifact (citation validator, Citation component, Tensions section, persona picker)
- [ ] **Phase 4** — Ask-your-knowledge (grounded Q&A, refusal path)
- [ ] **Phase 5** — Capture & auto-file (text/URL capture, editable preview, approved writes, PDF if time allows)
- [ ] **Phase 6** — Proactive recall + seed data (deterministic demo vault with a real tension and a real hidden connection)
- [ ] **Phase 7** — Corpus overview + polish pass
- [ ] **Phase 8** — Cross-platform packaging (electron-builder, both unsigned, GitHub Actions dual-runner build, README run instructions)
- [ ] **Phase 9** — Demo video, README, submission

## Open technical items (resolve before/during the phase noted)

- [ ] **Embedding model** — which NIM model to use for embeddings; not yet pinned. Blocks Phase 1. Check the current NIM model catalog first; fall back to a pure-JS approach if nothing suitable (no native/compiled deps — see `rules.md`).
- [ ] **Chunking strategy** — heading-based vs. fixed-token-window; decide once in Phase 1 and record the decision here, don't leave it ambiguous across sessions.

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

*(Add D11+ here as new decisions get made — never renumber or delete existing ones.)*

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

---

## Quick reference

- Repo: `tirthfx/noema` (GitHub)
- Runtime model: NIM, `z-ai/glm-5.2`, `https://integrate.api.nvidia.com/v1/chat/completions`
- Env var: `NVIDIA_API_KEY`
- Vault data lives at: `<user's chosen folder>/.noema/`
- Six docs live at: `docs/` in the repo (commit all six, every time — a prior era lost `memory.md` from a commit by accident)
