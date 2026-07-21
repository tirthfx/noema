# Noema Knowledge Workspace Redesign

**Date:** 2026-07-19  
**Status:** Implemented and verified on 2026-07-20  
**Scope:** Desktop Electron app, existing React renderer and Electron main-process services

## Product outcome

Noema will become a proactive knowledge workspace instead of a chat interface placed on top of an Obsidian index.

The core loop is:

1. Capture knowledge.
2. Understand it through grounded answers.
3. Detect gaps, tensions, and unfinished thinking.
4. Turn insights into approved notes or artifacts.
5. Resurface important material later.

The redesign preserves Noema's strongest guarantees:

- The user's Markdown vault remains the source of truth.
- Answers and artifacts expose their supporting passages.
- No write reaches disk without an editable approval preview.
- The interface states when evidence is missing or when an answer includes inference.

## Design direction

Noema is a focused desktop instrument used by researchers, educators, and students in long reading and thinking sessions. The visual system should be calm in a bright workspace, information-dense enough to support real work, and restrained enough that evidence remains the focal point.

Reference influences:

- Prometheus EduAI: answers produce next actions, weak areas become recoverable loops, and empty states teach the user what to do.
- One Shot Hotels: visual restraint, flatter surfaces, and generous spacing around essential decisions.
- Mosby's Files: dossiers and evidence fragments create structure without generic card grids.
- Existing Noema design: the light Reading Room, green verification signal, amber activity signal, serif reading content, and mono machine metadata.

Design controls:

- Design variance: 6/10. Familiar product layout with a few asymmetric editorial moments.
- Motion intensity: 3/10. Fast state transitions only.
- Visual density: 6/10. A working research tool, not an art-gallery landing page.
- Theme: light Reading Room for this release.
- Accent discipline: green only for verified or approved state; amber only while the agent is actively working.
- Shape discipline: 12px panels, 8px controls, full-pill tags only.

## Information architecture

The primary navigation becomes:

### Today

The default workspace. It answers, "What deserves my attention now?"

It contains:

- A concise vault briefing with index health and recent change context.
- Three context-aware suggested prompts.
- Up to three resurfaced notes.
- Open knowledge gaps and unresolved tensions.
- Unfinished approved or generated work when available.
- A compact Ask composer so the user can start immediately.

### Ask

Grounded conversational work over the selected vault.

It contains:

- Context-aware prompt suggestions before the first message.
- Tool activity represented as compact evidence-gathering steps.
- Answers labeled as source-backed, inferred across sources, or insufficiently supported.
- Expandable exact source passages.
- Post-answer actions: save insight, create artifact, find tension, connect notes, add to review, and ask a follow-up.

### Create

The current literature-review feature becomes an artifact studio.

Initial artifact types:

- Literature review
- Research brief
- Study guide
- Outline
- Annotated bibliography

The existing persona selector remains a tone control and never weakens grounding requirements.

### Review

A structured queue for unfinished thinking rather than a second artifact form.

Review items include:

- Unsupported assumption
- Contradicting sources
- Open question
- Weak connection
- Stale understanding
- Suggested follow-up

Items have `open`, `exploring`, and `resolved` states. The first implementation may derive items from answer actions and artifact tensions without adding a new model pipeline.

### Capture

URL and raw-text capture remains, with clearer preview and failure states. Capture suggestions explain what will be created before the user submits.

### Library

Library replaces the technical "Corpus" label and combines:

- Indexed note list
- Search and filtering
- Indexed, stale, and failed status
- Folder scope
- Discovered connection proposals
- Vault health and ignored-folder explanation

The manual Link tab is removed from primary navigation. Linking becomes an action where context exists: after an answer, from a review item, or from selected Library notes.

## Context-aware suggested prompts

Suggested prompts must help users understand what Noema can do and must not require a model call merely to render the interface.

### Input signals

The suggestion builder may use:

- Indexed note titles and paths
- Resurfaced note titles
- Recent user questions in the current session
- Current workspace mode
- Artifact tensions
- Selected Library notes
- Index state and failure state

### Prompt families

- Explain: "Explain the main argument in [note]."
- Synthesize: "What connects [note A] and [note B]?"
- Challenge: "Find an assumption these notes do not support."
- Create: "Turn my notes on [topic] into a research brief."
- Recall: "Quiz me on something I may have forgotten."
- Recover: "Show what you found before the answer timed out."

### Behavior rules

- Show three suggestions at once.
- Suggestions change by workspace and available context.
- Clicking a suggestion fills or submits the relevant composer.
- Never expose hidden folders or internal `.agents`, `.codex`, `.git`, or `node_modules` paths.
- Fall back to clear generic prompts when the vault has too little usable context.
- Suggestions are phrased as actions the user can understand, not internal tool commands.

## Main workspace layout

The app keeps a left navigation rail and one main task surface.

### Sidebar

- Noema wordmark and a quiet current-vault selector.
- Six navigation destinations.
- Compact index-health footer showing discovered, indexed, stale, and failed counts.
- Settings entry for API status and privacy explanation.

### Main header

- Current workspace title and a one-line purpose statement.
- Contextual controls only when needed.
- API/index status is visible but does not dominate a healthy state.

### Main content

- Maximum readable width for answer prose.
- Wider evidence and Library layouts when the content requires it.
- Sparse separators instead of nested card containers.
- Source paths are truncated visually but remain available through title text and accessible labels.

### Composer

- Composer remains reachable at the bottom of Today and Ask.
- Suggested prompts sit immediately above the composer in the empty state.
- Enter submits; Shift+Enter inserts a newline.
- Sending state preserves the user's submitted question and shows an explicit evidence-gathering status.

## Answer and action model

Each completed answer has:

- Direct answer
- Grounding state
- Source passages
- Optional inference note
- A maximum of four relevant actions

Actions use existing capabilities where possible:

- `Save insight` creates a gated note proposal.
- `Create from this` transfers the topic to Create.
- `Find tension` asks a focused follow-up.
- `Connect notes` creates a gated link proposal.
- `Add to review` creates a local review item.

Actions that can change the vault always route through `EditablePreview`.

## Failure and degraded-state design

### Wrong or unsafe vault scope

The indexer ignores:

- All hidden directories by default
- `.noema`
- `.obsidian`
- `.git`
- `.agents`
- `.codex`
- `node_modules`
- Build and output directories

The first-run flow explains what a valid Obsidian vault looks like and offers the bundled seed vault for demonstration.

### Missing API key

The app remains usable for Library browsing and local capture preparation. The Ask/Create composers show an actionable configuration state instead of becoming mysteriously disabled.

### Chat timeout

If retrieval succeeded but answer generation timed out:

- Preserve and display the retrieved passages.
- Replace the raw red error block with a concise recovery panel.
- Offer `Retry answer`, `Ask a narrower question`, and `Open sources`.
- Do not expose raw provider responses in the renderer.

### No relevant evidence

Noema explains that the selected vault does not support the question, shows the searched scope, and suggests prompts based on the strongest available topics. It does not present an empty answer as a successful response.

### Indexing failure

Library remains browsable for already known files. The UI identifies the failed file when available and offers retry, switch vault, and ignored-folder guidance.

## Component boundaries

The monolithic `App.tsx` will be split into bounded components and hooks:

- `AppShell`: navigation, selected workspace, vault and global status.
- `TodayWorkspace`: daily briefing, resurfacing, prompt suggestions, open loops.
- `AskWorkspace`: conversation stream, evidence, actions, composer.
- `CreateWorkspace`: artifact type, topic, persona, output.
- `ReviewWorkspace`: knowledge-gap queue and state changes.
- `CaptureWorkspace`: capture form and proposal state.
- `LibraryWorkspace`: search, health, notes, and connections.
- `SuggestedPrompts`: deterministic context-aware prompt presentation.
- `RecoveryPanel`: typed provider, retrieval, index, and configuration recovery.
- `useVaultWorkspace`: vault loading, indexing, notes, corpus, and status.
- `useAgentConversation`: messages, tool activity, answer state, and retries.

No new global state dependency is required. React hooks and explicit props are sufficient for this release.

## Data additions

Shared types will add:

- `WorkspaceMode`
- `PromptSuggestion`
- `GroundingState`
- `RetrievedEvidence`
- `ReviewItem`
- `ReviewItemStatus`
- `VaultHealth`
- Typed recovery/error categories

Review items may initially persist under `.noema/review.json`, separate from user Markdown. Any conversion into a Markdown note still requires approval.

## Accessibility

- All navigation and suggestion controls are keyboard reachable.
- Focus remains visible against every surface.
- The conversation uses a dedicated status live region instead of making the entire message list live.
- Citation popovers support click, keyboard focus, Escape, and touch.
- Editable preview uses dialog semantics, focus trapping, Escape close, and focus restoration.
- Reduced-motion preferences remove nonessential transitions.
- Body text, placeholders, status text, and controls meet WCAG AA contrast.

## Privacy communication

Before the first Ask/Create request, Noema states that relevant vault text and the user's query are sent to NVIDIA NIM for embedding or generation. Local-first refers to storage and ownership, not fully offline inference.

The API key remains in the Electron main process. Provider responses and secrets never render in the UI.

## Focus Memory hackathon feature

Focus Memory is an explicit, visible work-session recorder. It is not an always-on surveillance feature.

### User flow

1. The user starts a focus session from Today.
2. Noema asks the user to select one named window or screen through its local Electron source picker.
3. A persistent recording indicator exposes Pause and Stop controls.
4. Noema stores a sparse local timeline of session timestamps, source labels, and user-provided context.
5. When the session stops, Noema creates a local session recap and suggests related vault notes using local lexical matching.
6. Today can later resurface the unfinished session and its related notes.
7. The user may dismiss it, delete it, read the recap aloud, or approve saving it into the vault.

### Privacy constraints

- Focus Memory never starts automatically.
- The user selects the captured source through a visible local source picker.
- A visible indicator remains present for the entire active session.
- No captured image or extracted screen text is sent to NVIDIA.
- Session records remain inside Noema's local application data.
- The user can delete one session or all Focus Memory data.
- No Focus Memory item becomes Markdown without editable approval.
- Voice output is user-triggered and uses the operating system's speech synthesis.

### Hackathon implementation boundary

The reliable demo path records explicit user checkpoints and session context while the selected display stream is active. Continuous OCR, microphone capture, system-audio capture, invisible background recording, and behavioral profiling are deferred. The interface and storage contract leave room for local OCR after the hackathon without claiming it already exists.

## Testing and acceptance criteria

### Automated checks

- TypeScript typecheck passes.
- Existing local smoke tests pass.
- Prompt suggestion tests cover rich vault, sparse vault, mode changes, and unsafe hidden paths.
- Index walker tests prove hidden and generated directories are excluded.
- Timeout tests prove retrieved evidence survives a failed generation call.
- Review item persistence tests cover create, update, and reload.
- Focus Memory tests cover explicit start/stop, local persistence, deletion, and absence of provider calls.
- Citation validation behavior remains unchanged.

### Visual and interaction checks

- Today opens by default after a vault is ready.
- The user sees useful suggested prompts before typing.
- Empty, indexing, missing-key, no-evidence, timeout, and healthy states are visually distinct.
- Navigation and composers work at compact laptop widths without clipped controls.
- No source path escapes its container.
- All write actions still require editable approval.
- Electron window is checked in a real rendered run, not only through static code inspection.

## Implementation order

1. Correct vault scoping and typed failure data.
2. Add deterministic suggested-prompt and review-item models.
3. Split the app shell into workspace components.
4. Build Today and the redesigned Ask flow.
5. Build Create, Review, Capture, and Library surfaces.
6. Harden dialogs, citations, keyboard behavior, and privacy copy.
7. Run automated checks and rendered Electron QA.

## Explicitly deferred

- Continuous voice input and autonomous speech output
- Continuous OCR and automatic interpretation of every screen frame
- Local model downloads or on-device inference
- Plugin marketplace
- General computer control
- Autonomous background research outside the vault
- Cloud accounts or synchronization

User-triggered local read-aloud is included in Focus Memory. Continuous voice interaction may follow later, but it does not belong in the current focused knowledge-workspace release.
