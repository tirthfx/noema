# Noema Design System

Noema is a warm, light reading room with the structure of a research dossier. It should feel calm enough for sustained work and precise enough to trust during a demo.

## Product structure

- Today is the default workspace and answers what deserves attention now.
- Ask semantically routes from the whole recent conversation: answer directly, search the indexed corpus with validated citations, or request explicit file/folder context and resume the same turn after selection.
- Create turns corpus evidence into literature reviews.
- Review holds open knowledge loops, not generic notifications.
- Capture drafts sources, meeting recaps, and contextual links behind editable approval.
- Library shows the exact searchable corpus.
- Focus Memory is explicit, visible, local, and user-controlled.

## Visual language

- Warm wall, white reading surface, ink-like text.
- Source Serif 4 for reading and argument.
- Geist for controls, navigation, and the editorial corpus onboarding.
- JetBrains Mono for paths, status, evidence labels, and system activity.
- Green is the sole product accent and means selected, verified, local, or approved.
- Amber is reserved for live agent activity.
- Hairline separators create dossier structure. Avoid generic card grids.
- Radii stay between 3px and 7px except true status pills.
- Workspace motion is limited to brief state feedback and the small agent activity pulse. The first-run corpus story may use reduced-motion-safe GSAP reveal, stack, and scrub sequences.

## Interaction rules

- Every useful view has a next action.
- Suggested prompts come from current recalls, review items, focus sessions, and index size.
- Provider failures preserve retrieved evidence and never reveal raw API payloads.
- No vault write occurs outside EditablePreview approval.
- Focus Memory never starts automatically, requires one named local source to be selected, and stores only user-entered context and checkpoints.
- Local context requests render as an agent-style handoff card with file and folder choices. Active selections stay visible as removable composer chips.
- Every answer offers a collapsed “How Noema approached this” summary: intent and evidence mode, never raw hidden chain-of-thought.
- Live-web answers use the existing claim/citation reading treatment, open citations externally, and offer a Save source action into Capture.
- All content paths truncate or wrap safely.
- Keyboard focus is visible. Dialogs focus their editor and close with Escape.
- The interface is light-only and respects reduced motion.

## Anti-patterns

- Dark AI styling, glass effects, decorative gradients, neon, and floating blobs.
- Side-stripe alert blocks.
- Decorative color or motion.
- Hand-built SVG icons.
- Raw provider output in the renderer.
- Claims of continuous OCR, microphone capture, or autonomous behavioral profiling.
