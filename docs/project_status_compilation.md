# Noema — Current Project Status

Updated 20 July 2026 after the standalone-corpus and continuity-flow pass.

## Product state

Noema is a secure Electron + React + TypeScript knowledge workspace. It now owns its product identity and storage model: a new user can create `Documents/Noema Library`, containing `Sources`, `Notes`, `Artifacts`, `Focus`, `Meetings`, and `.noema`. A normal Markdown folder or Obsidian vault can still be connected without migration.

The current runtime uses NVIDIA NIM `meta/llama-3.1-8b-instruct` for agent generation and `nvidia/llama-nemotron-embed-1b-v2` for embeddings. The renderer never receives the API key.

## Completed flows

- Standalone corpus creation, relaunch persistence, incremental indexing, Markdown/text imports, collision-safe filenames, and connected-folder compatibility.
- Grounded Ask with code-validated citations, honest refusal, and source evidence fallback when generation is unavailable.
- Create for citation-validated literature reviews and explicit tensions.
- Capture for text, URLs, note links, and pasted meeting transcripts. Every write remains an editable proposal until approval.
- Meeting recaps include decisions and selectable action items that can enter Review after the note is approved.
- Today provides deterministic suggested prompts, open Review items, Focus Memory, and a timestamp-honest Work Timeline.
- Focus Memory is opt-in and manual: the user selects one visible source, enters context/checkpoints, and can delete or approve a recap. No OCR, screenshot archive, microphone, or ambient behavioral profile is created.
- `Cmd/Ctrl + Shift + Space` brings Noema forward and focuses Ask without starting capture.
- Library exposes the actual indexed corpus and imports files into `Sources`.
- The onboarding and corpus flow use the refined editorial UI, self-hosted fonts, and reduced-motion-safe GSAP transitions.

## Littlebird-inspired boundary

Noema adopts continuity patterns—not ambient collection: full-context chat, meeting recall, proactive daily orientation, timeline recovery, and quick re-entry. Continuous screen/audio monitoring remains intentionally excluded from the hackathon build. Corpus files and workspace state stay local; only the user's query and relevant retrieved text are sent to NVIDIA NIM when an AI action is requested.

## Verification status

- Strict main and renderer TypeScript compilation passes.
- `smoke:corpus` passes, covering owned structure, safe imports, text conversion, collision handling, and real note timestamps.
- Existing deterministic smoke suites remain available for local index, workspace, capture, answers, artifacts, and meetings. Live suites require NIM availability and consume quota.
- The live NIM meeting suite passes, including recap parsing, action-item extraction, gated-write behavior, and timeline ordering.
- The unpacked macOS application packages successfully on Electron 43.1.1. The dependency audit reports zero known vulnerabilities.

## Submission work outside the codebase

- Record and upload the final three-minute demo.
- Add its public URL to the README and submission.
- Verify current CI artifacts and finalize the Devpost entry.
