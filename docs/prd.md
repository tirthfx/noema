# Noema — Product Requirements Document

**Status:** Restart, clean build. Platform pivot: cross-platform **desktop app (Windows + macOS)**, Electron shell.
**Hackathon:** OpenAI Build Week (Devpost `openai.devpost.com`), Track: Work & Productivity. Deadline **21 Jul 2026, 5:00 PM PT / 22 Jul 2026, 5:30 AM IST**.

> **Product update — 20 Jul 2026:** The standalone corpus flow supersedes the Obsidian-first positioning below. Noema owns `Documents/Noema Library`; Obsidian and ordinary Markdown folders are optional connectors. Meeting memory, Work Timeline, suggested prompts, and quick Ask are now in the hackathon-safe continuity loop. See `project_status_compilation.md` for current scope.

---

## 1. What to build

**One-liner:** Noema is a local-first knowledge corpus that remembers the source, the decision, and the unfinished thought.

**The problem:** Notes accumulate but sit inert. Nothing re-reads them, nothing notices when two notes from six months apart contradict each other, and turning a pile of notes into a finished piece of writing is still 100% manual labor. Chat-based AI tools (ChatGPT, Claude, etc.) don't fix this — they have no persistent memory of *your* specific notes, and they only answer, they never act.

**The solution:** Noema creates or connects a real folder on disk, indexes it, and gives an LLM agent bounded tools to read, search, propose writes, and link real `.md` files — with every generated claim traceable back to a real note and every write gated by approval.

**Not** a ChatGPT wrapper. Three differentiators — always lead with these in the demo and README:

1. **Persistent memory of your own knowledge** — the index accumulates across the entire vault and across every session, unlike a per-conversation chat window.
2. **It acts, not just answers** — it has tools. It files notes, writes links, and generates artifacts itself, subject to user approval.
3. **It's proactive** — it surfaces forgotten, related notes unprompted, without being asked.

**Sharpest answer to "isn't this just NotebookLM?":** NotebookLM is per-notebook, per-session, and pull-only. Noema is a persistent, accumulating corpus on the user's own disk that pushes recall at the user unprompted, and writes back into that same corpus.

---

## 2. Target users

**In scope:** Researchers, educators, and students who already keep (or are willing to keep) an Obsidian vault of notes — literature notes, lecture notes, reading notes, source material.

**Explicitly out of scope:** Developers. No dev-handoff-doc artifact type, no code-comment-to-note pipeline, no "explain this repo" feature. Building for a developer audience would mean building for the demo author, not the target user — resist the pull toward this even if it's the easiest audience to imagine.

**Persona shorthand used throughout the docs:** "the researcher" — someone with 200+ notes who has forgotten what's in half of them, and who occasionally needs to turn a folder of scattered reading notes into a coherent literature review.

---

## 3. Hero feature (the demo)

**F1 — Notes → Artifact.** The single most important thing this app does. Point it at a topic; it pulls the relevant notes from the vault and produces a finished research artifact — **literature review is the flagship artifact type** — with every claim in the output traceable back to a real note, and citations **code-validated**, not trusted to the model's word. A separate validator function checks that cited text actually exists in the source note before it's allowed to render. This is the load-bearing feature for both the demo and the judging rubric (Technological Implementation, Quality of the Idea).

---

## 4. Full feature set

| ID | Feature | Description | Priority |
|---|---|---|---|
| **F1** | **Notes → Artifact** (hero) | Literature review (flagship), plus annotated bibliography, lecture outline, study guide, essay draft. Every claim cited; citations code-validated against the real vault. Includes a **"Tensions & Open Questions"** section that surfaces contradictions found across the user's own notes, citing both sides. | Must-have |
| **F2** | Proactive recall | Unprompted surfacing of forgotten, related notes. Max 3 cards at a time. Read-only — never a trigger for a write action. | Must-have |
| **F3** | Capture & auto-file | Text / URL / PDF → clean, filed, linked note. Every write action (new note, new link) requires an **editable preview** the user approves before anything touches disk — never a blind write. | Must-have |
| **F4** | Ask Noema | Semantic, conversation-aware routing chooses a direct reply, citation-validated corpus retrieval, explicit local file/folder context, or bounded live-web research. Selected context resumes the original request; typed paths never imply access. Answers expose a concise approach summary, while corpus and web claims **refuse to invent facts** without validated evidence. | Must-have |
| **F5** | Hidden connections | Surfaces non-obvious links between notes the user didn't explicitly draw. User must accept before any write happens. | Should-have |
| **F6** | Corpus overview | A simple list/tree of what's indexed and its status. Explicitly **not** a graph view — Obsidian already owns that. | Should-have |
| **F7** *(new)* | Session continuity card | On relaunch, a single small card: "Since you were last here: N notes changed, M new connections found." Cheap to build on top of F2's infra, reinforces the "persistent memory" differentiator without new agent logic. | Nice-to-have / stretch |
| **F8** *(new)* | Batch artifact export | Once F1 works for one topic, let the user queue 2–3 topics and export a small folder of artifacts in one pass. Good demo-closer ("look, it just did three literature reviews while I talked") but pure UI/orchestration on top of F1 — no new agent capability. | Nice-to-have / stretch |

**Refinements folded into F1/F3/F5:**
- Editable preview before any `write_note` / `link_notes` call — never a pure binary approve/reject, the user can edit inline before committing.
- Synthesis persona/style picker for F1 (Academic / Socratic Critic / Plain-Language) — **tone only**, never relaxes the grounding or citation rules.

**Cut / rejected — post-hackathon roadmap only, not this build:**
- A note editor (Obsidian owns that)
- A graph view (Obsidian owns that)
- Any hosted database, any auth/accounts
- Offline / local-LLM mode (WebGPU/WebLLM or similar) — also carries the same "does this even use the featured model" risk as swapping providers; not worth compounding that risk twice
- An Obsidian community plugin (this is a standalone app, not a plugin, by design)
- Ambient mic / system-audio-loopback capture, any voice/"Jarvis" interaction loop
- Autonomous multi-day external web research (arXiv/Scholar scraping)
- Prompt/KV context caching
- A full background epistemic-auditing daemon (kept only the in-artifact Tensions section from this idea)
- Vision/image ingestion — cut for this build specifically because the demo doesn't need it; if revisited later it will use a different model, not the primary reasoning model (see `architecture.md` §Model routing)
- Code signing / notarization for either platform — accepted as a known distribution-friction risk for the hackathon window (see `phases.md`)
- Auto-update mechanism

---

## 5. Success criteria

- The hero flow (F1) works live, end-to-end, on a real vault with real notes, in under the judges' ~3-minute attention window.
- Every claim in a generated artifact is either backed by a validated citation or is visibly flagged/excluded — never silently fabricated.
- The app runs on both Windows and macOS from one codebase without platform-specific feature gaps.
- README clearly explains how GPT-5.6/Codex-generated code and the runtime model (NVIDIA NIM, `z-ai/glm-5.2`) each contributed — required by the judging rules.

## 6. Judging alignment (OpenAI Build Week, official rubric)

- **Stage One (pass/fail):** "reasonably fits the theme and reasonably applies the required APIs/SDKs." Fit is the app itself (an agent doing knowledge work); the note-worthy risk is that the *runtime* model is NIM/glm-5.2, not GPT-5.6 — an accepted, already-litigated risk (see `Noema - Update.md` in the vault, Decision D16 in the prior build era). Codex itself is the required tool for *building* the app and satisfies this independently of the runtime model choice.
- **Stage Two (equally weighted):**
  - *Technological Implementation* — carried almost entirely by F1's code-validated citation pipeline and the tool-calling agent loop.
  - *Design* — carried by the dark, research-instrument aesthetic in `design.md` and the Citation component specifically.
  - *Potential Impact* — carried by the researcher/educator/student framing and the "accumulating corpus, not a session" differentiator.
  - *Quality of the Idea* — carried by leading with the three differentiators, every time, in README and demo narration.

## 7. Distribution note (affects judging, not just users)

This is a **desktop app**, not a hosted web app. Judges must download and run an installer/binary rather than click a link. This is a real, accepted friction cost relative to a web deploy — see `phases.md` for the mitigation (demo video is now the primary judged artifact; README carries clear run instructions for unsigned builds on both OSes).
