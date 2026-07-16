# Noema — Memory

Living state file. **Read this first, every session, before writing code.** Update the "currently working on" line when you start work and the log/checklist when you stop. This file is append-only for the log section — never delete past entries, only add to them.

This is a clean restart. Full pre-restart history (naming journey, the original web-app architecture, the model-provider saga) lives in `Noema - Update.md` in the Obsidian vault — not reproduced here. Decision numbering below starts fresh at D1 for this build era.

---

## Status

**Restart date:** 16 Jul 2026
**Deadline:** 21 Jul 2026, 5:00 PM PT / 22 Jul 2026, 5:30 AM IST
**Current phase:** Phase 7 complete. Phase 8 (cross-platform packaging) is next.

## Currently working on

> Update this line every session. Example: `Phase 1 — resolving which NIM model to use for embeddings (architecture.md §6 open item).`

Phase 8 — Cross-platform packaging.

---

## Phase-by-phase checklist

Mirrors `phases.md`. Check off acceptance criteria, not just "touched the code."

- [x] **Phase 0** — Scaffold & skeleton (Electron+React+Vite+TS+Tailwind, security settings on from the start, folder picker, launches clean on macOS; Windows manual verification remains pending until a Windows runner is available)
- [x] **Phase 1** — Vault ingestion & index (heading-based chunks, NIM embeddings, `.noema/index.json`, incremental re-index, read-only tools working; automated temporary-vault verification passed)
- [x] **Phase 2** — Agent loop core (tool-calling loop, minimal chat UI, visible tool calls)
- [x] **Phase 3** — HERO: Notes → Artifact (citation validator, Citation component, Tensions section, persona picker)
- [x] **Phase 4** — Ask-your-knowledge (grounded Q&A, refusal path)
- [x] **Phase 5** — Capture & auto-file (text/URL capture, editable preview, approved writes; **PDF capture cut — see D17**)
- [x] **Phase 6** — Proactive recall + seed data (deterministic demo vault with a real tension and a real hidden connection)
- [x] **Phase 7** — Corpus overview + polish pass (F6 list/tree, indexed/stale/error state, determinate index progress, error/empty/loading/motion/amber audit; custom titlebar retained)
- [ ] **Phase 8** — Cross-platform packaging (electron-builder, both unsigned, GitHub Actions dual-runner build, README run instructions)
- [ ] **Phase 9** — Demo video, README, submission

## Open technical items (resolve before/during the phase noted)

- [x] **Embedding model** — `nvidia/llama-nemotron-embed-1b-v2`, 2048 dimensions. Confirmed against the live NIM catalog and `/v1/embeddings`; passages use `input_type: "passage"`, queries use `input_type: "query"`.
- [x] **Chunking strategy** — heading-based. Each Markdown heading and its following body become one chunk, preserving the local claim/context relationship needed for research-note retrieval.
- [ ] **Demo quota strategy (resolve before Phase 9 — needs a call from Tirth)** — one session of Phase 5 building plus smoke runs exhausted `z-ai/glm-5.2`'s NIM free-tier quota (D15); `smoke:answer` ended the session unable to run. Phase 6's seed work and the Phase 9 demo recording draw on the same model, and a spent quota mid-judging is indistinguishable from a broken app. Options: record the demo well before the deadline and treat the video as the artifact (already the D5 plan); obtain a second NIM key; or add a documented fallback model. A fallback conflicts with D2 and the README's required NIM/glm-5.2 attribution, so this is a decision to make deliberately, not silently.

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
| D14 | Refuse grounded Q&A below a top retrieval cosine score of `0.28` | Live testing showed the embedding model's relevant short-note query score falls below `0.52`; `0.28` still rejects the unrelated black-hole query while allowing the validator—not the similarity score alone—to make final support decisions. |
| D15 | **A persistent NIM `429` means that model's quota is spent, not that the key lacks access or the code is broken. Keep `z-ai/glm-5.2` (D2 stands) and wait it out — do not swap models in response to a 429.** | Verified live this session: `glm-5.2` returned `429` on six consecutive probes while embeddings and four other chat models returned `200` on the same key. That evidence *looks* exactly like a per-model access restriction and was initially misdiagnosed as one, prompting a model swap to `deepseek-ai/deepseek-v4-pro`. Hours later the picture inverted — `glm-5.2` returned `200` after sitting unused, while `deepseek-v4-pro` returned `429` after this session's smoke runs burned through it, and did not recover across 100s of probing. NIM meters the free tier **per model**; a spent model 429s for a long window, then recovers on its own. The swap was reverted. Cost: most of a session. Next session: if chat 429s, check `/v1/models` and a second model before touching any code, then pause rather than swap. |
| D16 | `link_notes` ships as a deterministic proposal builder invoked from the UI (explicit from-note, to-note, context), **not** yet as a model-callable tool, despite `architecture.md` §5 listing it in the tool table | Phase 5's requirement is the approval gate, which this satisfies exactly — and a deterministic trigger is demoable and testable without model latency or a model choosing note pairs at random. The agent originating link suggestions is F5 (Hidden connections), a Should-have; wiring `link_notes` into the loop's existing gated-tool path is a small add when F5 lands. The gate itself is already generic: `GATED_TOOLS` covers both names, and `tools/link-notes.ts` cannot write regardless of caller. |
| D17 | **PDF capture cut from Phase 5** | `phases.md` marks it "only if time allows" and puts it behind text and URL in the cut order. Text and URL capture are both built and verified. Every JS-only PDF text extractor is a real dependency to run through the scope-creep test, and the session's remaining budget went to correcting D15's misdiagnosis. Text + URL fully satisfy F3's acceptance criteria. Revisit only after Phase 8 packaging is safe. |
| D18 | Recall the first three indexed note paths, dismissible for the current renderer session | This deterministic index-backed heuristic guarantees a repeatable demo without model calls or recommendation-system complexity; cards are read-only. |
| D19 | Retain the custom hidden-native titlebar on both platforms | The existing implementation already meets `design.md` §7: `hiddenInset` leaves macOS traffic lights native at top-left, while Windows uses the themed custom minimize/maximize/close controls at top-right. No fallback to OS-default chrome was needed. |

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

**16 Jul 2026** — Phase 4 complete. Plain chat now pre-searches the vault and refuses before model generation when its best cosine match is below `0.28`; the calm no-match state is distinct from an error. Covered questions go through the existing read-only tool loop and Phase 3 validator, then render the same Citation component used by artifacts. Unsupported answer claims are stripped just like artifact claims. Added `npm run smoke:answer`; its live NIM run passed both a cited-answer assertion and an unrelated-question refusal. The shared structured-output parser also accepts a fenced JSON wrapper from NIM without weakening validation. Next: Phase 5 only.

**16 Jul 2026** — Phase 2–4 audit. Re-ran strict type checking and the live NIM smoke build paths. Fixed a Phase 4 error-path regression: a failed preliminary similarity search now emits a completed tool activity (`search failed`), so the amber pulse cannot remain active after failure.

**16 Jul 2026** — NIM 429 investigation, misdiagnosed then corrected. Chat completions began failing with HTTP 429 through the app's existing one-retry path. Live probing showed `glm-5.2` returning 429 six times running while `/v1/embeddings` and four other chat models returned 200 on the same key — read as a per-model access restriction, and the runtime model was swapped to `deepseek-ai/deepseek-v4-pro`. That conclusion was wrong. Re-probing later inverted the result: `glm-5.2` recovered to 200 after sitting idle, while `deepseek-v4-pro` began 429ing after this session's smoke runs and stayed down across 100s of probes. The real behaviour is per-model free-tier quota that depletes and later recovers (D15). The swap was reverted; `CHAT_MODEL` is `z-ai/glm-5.2` again, keeping D2 and the README's required NIM/glm-5.2 attribution intact. Two genuine bugs found underneath it and kept: the 429/5xx backoff computed a **0 ms** delay whenever NIM omitted a `retry-after` header (`Number(null)` is `0`, which passes `Number.isFinite`), so both attempts fired back-to-back against a limited endpoint; and the model id was duplicated in `agent.ts` and `index.ts`'s `verifyChatAccess`, free to drift apart. The id is now one exported `CHAT_MODEL` constant, and 429 errors carry the model name and response body so this is self-diagnosing next time. `parseModelJson` also now skips a reasoning prefix (`</think>`) and finds a fenced JSON block anywhere in the reply, rather than only stripping a fence anchored at the start.

**16 Jul 2026** — Phase 5 complete (F3, Capture & auto-file). Text and URL capture both build a filed note draft through the agent; **PDF capture cut (D17)**. URL capture fetches in the main process and reduces HTML to readable text with hand-rolled extraction — prefers `<article>`/`<main>`, drops script/style/nav/header/footer chrome, decodes entities — so **no new dependency was added this phase** (scope-creep test: a scraping or DOM library would only be convenient, and regexes over fetched HTML are enough to hand the model clean text). The agent sees the vault's existing folders and files drafts to match; a live run correctly proposed `Research/interleaving.md` into the existing `Research/` folder. `write_note` and `link_notes` return `NoteProposal` objects and **cannot** write: neither `agent.ts` nor anything in `tools/` imports `writeVaultNote`, so the only path from a proposal to disk is the `vault:approve-write` IPC handler, reached solely by an approved `EditablePreview` commit — the gate is enforced by the module graph, not by convention. The shared tool loop now routes gated tool calls to a handler that returns a proposal and stops the loop; a rejected proposal (bad path, missing note) goes back to the model as an ordinary tool result so it can correct itself. `EditablePreview` writes its current textarea state, so edits made in the panel are what land on disk, and highlights added lines by comparing live against `baseContent` (hand-rolled line comparison, no diff library). `approveWrite` returns a structured `WriteResult` rather than throwing, so a real OS error reaches the panel instead of being buried in Electron's IPC wrapper text; `describeWriteFailure` maps EACCES/EPERM/EROFS/ENOSPC/EBUSY/EISDIR/ENAMETOOLONG/ENOENT to plain language while always keeping the raw OS code and message. Added `npm run smoke:capture`, which serves a local HTML page over `node:http` (deterministic, no external site) and asserts all of: URL capture proposes without writing, an edited draft is what actually lands on disk, a discarded proposal writes nothing, `link_notes` proposes without modifying the note, a hallucinated note path is rejected rather than fabricated, and a `chmod 0o555` folder surfaces a real `EACCES`. Phase 3 and Phase 4 smoke tests both re-pass on `glm-5.2` after the loop refactor; strict TypeScript passes on both configs. Remaining for a desktop pass: the capture and preview flows have not been driven through the real Electron UI, only through the main-process layer they sit on. Next: Phase 6 only.

**16 Jul 2026** — Phase 5 desktop UI pass (`npm run dev`), driven against the real 46-note vault. The main-process layer was already verified by `smoke:capture`, but driving the actual Electron window surfaced four bugs that the smoke tests structurally could not see — three of them pre-existing:

1. **Link-row layout (mine).** The two note `<select>`s sized to their longest note title and squeezed the context input to a sliver, wrapping "Propose link" onto two clipped lines. Only `input` carried `flex: 1`. Fixed with a `.link-controls` rule sharing the row.
2. **`list_notes(folder)` reported populated folders as empty (pre-existing, Phase 1).** `normalize("Learning/")` keeps the trailing slash, so the prefix became `"Learning//"` and matched nothing. Caught live: the agent called `list_notes("Learning/")` on a folder holding 10 notes and got `0`. The model naturally writes the trailing slash, so this silently misled it on every folder query. Now trims trailing slashes and `./` before rebuilding the prefix.
3. **Index `rename` race (pre-existing, Phase 1; survived the Phase 0–1 audit).** A reload raised `ENOENT: rename index.json.tmp → index.json`. `React.StrictMode` double-invokes effects in dev, so two `getSaved()` calls ran two concurrent `refresh()`es; both wrote the same temp path and the second rename found it already consumed. `load()` had a matching flaw — it set `loaded = true` *before* awaiting the read, so a concurrent caller saw an empty index as loaded. `refresh()` is now queued (not coalesced: a post-write refresh must observe the new note), `load()` is a memoised promise, and the temp file is unique per write so a second app instance cannot collide. The index survived intact throughout — the atomic write's failure recovery held.
4. **`ToolCallIndicator` mislabelled the new tools (mine).** Its fallback returned `list_notes()` for anything that wasn't `search_notes`/`read_note`, so `write_note` and `link_notes` rendered under another tool's name — a direct **rules.md §4** violation, since tool visibility exists precisely so the user knows what ran. Now an exhaustive `switch` with no `default`, so TypeScript fails the build if a future tool ships without a label.

Verified end-to-end in the real app: capture of `https://en.wikipedia.org/wiki/Spaced_repetition` produced a clean 7.7KB draft, correctly filed into the vault's existing `Learning/` folder, with the source URL preserved; **disk confirmed empty of it while the proposal sat open**; approving wrote it and the index moved 46 notes/359 chunks → 47/364 via the post-write refresh; a `link_notes` proposal rendered `PROPOSED EDIT` with the hand-rolled "Adds to the existing note" highlight and left the target note byte-identical (7722 bytes, 0 wikilinks) both while open and after Discard. `smoke:capture` and `smoke:artifact` re-pass after all four fixes; **`smoke:answer` could not be re-run — `glm-5.2`'s quota was exhausted by this session (D15 confirmed a third time), so Phase 4 remains verified only as of before the `index.ts` refactor.** Phase 3 exercises the same load/refresh and tool-loop paths and passed after it. Re-run `npm run smoke:answer` once quota recovers.

Deferred to Phase 7 polish (not Phase 5 acceptance): the `EditablePreview` panel is taller than the message-list viewport, and the textarea swallows wheel events, so reaching Approve/Discard needs a scroll started outside the textarea — design.md calls the component a "panel/modal", and promoting it to a real overlay would fix both. Also, a focused capture `<select>` draws a macOS system-accent focus ring, which reads as amber on this machine and could collide with design.md's amber discipline; it is the OS accent (blue by default), not a Noema token, so it will not appear amber on most machines.

**16 Jul 2026** — Phase 7 complete (F6, Corpus overview + polish). Added `CorpusOverview` as a plain, file-browser-style list of vault Markdown notes with muted indexed/stale/error dots; it deliberately has no graph behavior or dependency. The index now reports determinate `N of M files` progress through the typed Electron bridge, and identifies the individual note that fails during a refresh. Polished the empty state to one calm action, made the write preview a reachable overlay panel, audited UI error fallbacks for action-specific language, kept all amber limited to active tool calls and citations, and confirmed there is no emoji UI copy. The deterministic Phase 6 demo corpus remains at repository `seed-vault/`; its recall heuristic remains the first three indexed note paths, dismissible for the current renderer session (D18). Retained the already-built custom titlebar rather than falling back to OS defaults (D19). TypeScript, the local smoke suite, and an unpacked production build pass. Next: Phase 8 packaging.

---

## Quick reference

- Repo: `tirthfx/noema` (GitHub)
- Runtime model: NIM, `z-ai/glm-5.2`, `https://integrate.api.nvidia.com/v1/chat/completions`
- Env var: `NVIDIA_API_KEY`
- Vault data lives at: `<user's chosen folder>/.noema/`
- Six docs live at: `docs/` in the repo (commit all six, every time — a prior era lost `memory.md` from a commit by accident)
