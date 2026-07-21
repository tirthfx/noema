# Noema Demo Recording Runbook

Target length: 3 minutes. Use `seed-vault/` so answers and citations are repeatable.

## Before recording

1. Run `npm run typecheck`, `npm run smoke:local`, `npm run smoke:workspace`, `npm run smoke:artifact`, `npm run smoke:answer`, and `npm run smoke:capture`.
2. Launch Noema, choose `seed-vault/`, and wait for the local index.
3. If NIM is slow, keep recording. The evidence-preserving fallback is now a product feature, not a dead end.

## 0:00 to 0:35 | Today and the product promise

Open Today.

Say: "Noema is a local-first knowledge workspace for an Obsidian vault. It does not begin with an empty chat box. It begins with what deserves my attention, based on notes I should revisit, open knowledge loops, and my last work session."

Point out suggested prompts and the Review queue. Mention that suggestions are deterministic and useful even before a generation call.

## 0:35 to 1:10 | Focus Memory

Select the Noema window or a safe demo window, enter "Prepare the learning science argument," and start a focus session. Add two checkpoints, then finish.

Say: "This is the hackathon-safe version of ambient memory. I opt in, select one source, and add the moments I might forget. Noema stores this session record locally, reconnects it to related notes, and can read the recap aloud. It does not claim invisible recording or continuous OCR."

Click Save recap and show EditablePreview. Discard it for now to prove that nothing writes automatically.

## 1:10 to 1:50 | Grounded Ask with graceful recovery

Choose a suggested prompt or ask "What improves durable learning?"

If the answer completes, open a citation and show the source passage. If NIM times out, show the matching note excerpts that remain available.

Say: "Retrieval happens once. If generation is unavailable, Noema preserves the evidence instead of throwing away the useful part or exposing a raw provider error. A composed claim only renders after its quote is validated against the note on disk."

Use Review later on the answer to show that conversation becomes action.

## 1:50 to 2:25 | Create and Review

Open Create, use the topic "retrieval practice, spacing, and durable learning," and generate an Academic literature review.

Show one validated claim and one tension. Then open Review and mark one open loop complete.

Say: "Create turns notes into an inspectable argument. Review turns resurfaced knowledge into deliberate recovery, so the product has a learning loop rather than a collection of disconnected AI tools."

## 2:25 to 2:50 | Capture with approval

Open Capture and paste a short text source. Generate the draft and show the path, full Markdown, and approval controls.

Say: "Noema can prepare a change, but the only route to disk is this editable approval gate. The same rule applies to captured sources, note links, and focus recaps."

Approve the demo note.

## 2:50 to 3:00 | Close

Open Library briefly, then return to Today.

Say: "Noema closes the loop from capture, to understanding, to gaps, to action, to recall, while keeping its evidence and permissions honest."
