# Noema — Phases

**Today:** 16 Jul 2026. **Deadline:** 21 Jul 2026, 5:00 PM PT (22 Jul, 5:30 AM IST).
That's roughly **5.5 build days** — tighter than the prior 8-day estimate, and this restart also adds cross-platform desktop packaging on top of what was previously a web app. Budget accordingly: the hero (Phase 3) gets the most protected time, and packaging (Phase 8) is treated as real work, not an afternoon.

Order is hero-first after the shared plumbing is in place — F1 and F4 share almost all their retrieval/citation infrastructure, so building them back-to-back is cheaper than the feature list order suggests.

---

## Phase 0 — Scaffold & skeleton
*Day 1 morning*

- Electron + React + Vite + TypeScript(strict) + Tailwind wired up, three-process split in place (`main` / `preload` / `renderer`) with the security settings from `rules.md` §3 already on from the start, not bolted on later.
- Design tokens from `design.md` wired into `tailwind.config.ts` and `styles/tokens.css`.
- Native vault-folder picker working; path persisted to `.noema/config.json`.
- Empty-state window that opens, shows the picker, and closes cleanly on both a Windows VM/machine and a Mac if at all possible this early — catching a platform-specific launch bug on Day 1 is cheap; catching it on Day 5 is not.

**Acceptance:** app launches on both OSes, picks a folder, and quits without a crash. Nothing else needs to work yet.

## Phase 1 — Vault ingestion & index
*Day 1 afternoon → Day 2 morning*

- `.md` file walk (skip `.noema/`, `.obsidian/`).
- Chunking strategy decided and documented in `memory.md` (heading-based vs. fixed-window — pick one, don't leave it open).
- Embedding calls wired to NIM (model TBD per `architecture.md` §6 — resolve this *first*, it blocks everything else in this phase).
- `.noema/index.json` persistence; incremental re-index on relaunch via mtime check.
- `search_notes` / `read_note` / `list_notes` tools working and testable independent of any chat UI (a small script/console call is fine for this phase).

**Acceptance:** pointing the app at a real vault produces a populated `.noema/index.json`, and a manual `search_notes` call against a known topic returns sensible chunk matches.

## Phase 2 — Agent loop core
*Day 2 afternoon*

- Tool-calling loop in `electron/agent.ts` against NIM, wired to the three read-only tools from Phase 1.
- Minimal chat UI in the renderer (input box, message list, `ToolCallIndicator`).
- End-to-end: user types a question → agent calls `search_notes`/`read_note` → answer comes back in the UI.

**Acceptance:** a real question about the test vault produces an answer that clearly used retrieved content (visible tool calls in the UI), even with no citation formatting yet.

## Phase 3 — HERO: Notes → Artifact (F1)
*Day 2 evening → Day 3, most of the day*

This phase gets the largest time budget on purpose — it's the demo.

- Literature-review generation flow: topic in → retrieval across relevant chunks → synthesized draft out.
- `citation-validator.ts`: every claim resolves to an exact/near-exact match in a real note before it's allowed to render as cited; failures are stripped or flagged, never silently trusted.
- `Citation.tsx` component (signature component — see `design.md`) rendering the validated citations.
- "Tensions & Open Questions" section: surfaces contradictions found across the user's own notes, citing both sides.
- Persona/style picker (Academic / Socratic Critic / Plain-Language) — tone only, validator still runs regardless of persona.

**Acceptance:** run against the real seed vault (Phase 6), the artifact reads as a genuine literature review, every citation click-checks against the source note, and at least one real tension is surfaced if the seed data has one (seed data should be written to guarantee this — see Phase 6).

## Phase 4 — Ask-your-knowledge (F4)
*Day 4 morning*

- Reuses Phase 3's retrieval + citation-validator infrastructure almost entirely — this is intentionally cheap after Phase 3 is done.
- Refusal path: if retrieval finds nothing relevant, say so plainly rather than answering from general knowledge.

**Acceptance:** a grounded question gets a cited answer; an out-of-scope question gets a clean refusal, not a hallucinated one.

## Phase 5 — Capture & auto-file (F3)
*Day 4 afternoon*

- Text and URL capture → clean note draft → `EditablePreview` → approved write via `write_note`.
- PDF capture only if time allows this phase — see cut order below.
- `link_notes` proposal flow, same approval gate.

**Acceptance:** pasting a URL produces a real, approved, on-disk `.md` file in the vault, linked from wherever the user chose.

## Phase 6 — Proactive recall (F2) + seed data
*Day 4 evening*

- Seed vault: a small, deliberately-written set of notes with at least one real cross-note contradiction (feeds Phase 3's Tensions section) and at least one non-obvious connection (feeds F2/F5).
- F2: on launch/idle, surface up to 3 read-only recall cards from the index.

**Acceptance:** the seed vault reliably produces a specific, repeatable demo moment — this is what actually runs during judging, so make it deterministic, not "usually works."

## Phase 7 — Corpus overview (F6) + polish
*Day 5 morning*

- Simple list/tree of indexed notes with status (indexed / stale / error) — not a graph.
- UI polish pass against `design.md` (empty states, error states, motion, titlebar handling on both OSes).

**Acceptance:** the app looks and feels like the design doc, not like a bunch of working features in default styling.

## Phase 8 — Cross-platform packaging
*Day 5 afternoon → evening*

This is real work, budget it as such:

- `electron-builder.yml` targets: `nsis` for Windows, `dmg`/`zip` for macOS.
- **Both unsigned** for this build (accepted risk, see `rules.md` and README requirement below) — do not lose a day chasing a code-signing certificate this week.
- **Strongly recommended:** build both targets via **GitHub Actions** (a `windows-latest` and a `macos-latest` runner) rather than trying to cross-build or borrow two physical machines. This sidesteps the single-developer-machine problem entirely and produces both installers from one push.
- README section: exact steps a judge needs to run an unsigned build — "More info → Run anyway" on Windows SmartScreen, right-click → Open (or `xattr -d com.apple.quarantine`) on macOS Gatekeeper. Write this assuming the reader has never done it before.
- Attach both built artifacts to a GitHub Release.

**Acceptance:** a clean Windows machine and a clean Mac (or VM) can each download the release asset and get the app running by following only the README.

## Phase 9 — Demo video, README, submission
*Day 6 (deadline day) — morning buffer, submit well before 5:00 PM PT*

- Demo video is now the **primary** judged artifact, more than usual for a hackathon, because installation friction means many judges may watch rather than run it. Script it tightly around the three differentiators and the hero flow.
- README: problem/solution, three differentiators, how GPT-5.6/Codex and NIM/glm-5.2 each contributed (required by the rules), install instructions from Phase 8, link to demo video.
- Verify all six `docs/` files are actually committed.
- Submit on Devpost with time to spare — do not target the literal deadline minute.

---

## Cut order if behind schedule

If Day 4 arrives and Phase 3 (the hero) isn't solid yet, cut in this order — never cut or shortcut Phase 3 or its citation validation:

1. F6 (Corpus overview) — a static "N notes indexed" label is an acceptable substitute.
2. F2 (Proactive recall) — cut entirely if needed; F1 alone still carries the demo.
3. F3 — narrow to text-only capture, drop URL/PDF parsing.
4. F5 (Hidden connections) — fold whatever's useful into F1's Tensions section and drop it as a separate feature.
5. F7/F8 (stretch features) — first things cut, before any of the above.

**Never cut:** F1's citation validation, or F4's refusal-on-no-match behavior. A demo that fabricates a citation live in front of judges is worse than a smaller feature set.

## Post-hackathon roadmap (not this build)

Offline/local-LLM mode, Obsidian community plugin, ambient audio capture, autonomous multi-day web research, prompt/KV caching, full epistemic-audit daemon, vision/image ingestion, code signing + notarization for both platforms, auto-update mechanism.
