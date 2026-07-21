# Noema Knowledge Workspace Implementation Plan

**Status:** Complete and verified on 2026-07-20.

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Turn Noema into a polished, demo-ready desktop knowledge workspace with a useful Today screen, context-aware prompts, resilient grounded answers, an actionable Review queue, and an explicit opt-in local Focus Memory session.

**Architecture:** Keep Electron as the trusted local shell and React as the renderer. Add small pure TypeScript modules for prompt generation, review derivation, and focus-session summaries so behavior is testable without Electron. Keep all vault writes behind the existing proposal approval gate. Screen sharing uses an explicit local Electron source picker; persisted focus records contain only user-entered context/checkpoints and derived local note matches.

**Tech Stack:** Electron 36, React 19, TypeScript 5.8, electron-vite, Node smoke tests, existing CSS tokens.

**Execution note:** This workspace is not a git repository, so worktree and commit steps are intentionally omitted. Verification remains mandatory after every behavior group.

---

### Task 1: Add workspace behavior contracts and tests

**Files:** `shared/types.ts`, `shared/workspace.ts`, `electron/phase6-smoke.ts`, `electron.vite.config.ts`, `package.json`

1. Write a failing smoke test for deterministic suggested prompts, local review items, focus recap construction, and safe provider error copy.
2. Run `npm run smoke:workspace` and confirm it fails because the module or entry is missing.
3. Add the minimal shared types and pure functions required by the test.
4. Re-run the smoke and confirm it passes.

### Task 2: Scope vault indexing to user knowledge

**Files:** `electron/phase0-smoke.ts`, `electron/vault.ts`

1. Add a failing regression assertion proving hidden folders and generated dependency folders are excluded while normal nested notes remain indexed.
2. Run `npm run smoke:local` and confirm the assertion fails.
3. Implement a single directory policy that skips hidden and generated folders.
4. Re-run the local smoke.

### Task 3: Preserve evidence when NIM fails

**Files:** `shared/types.ts`, `shared/workspace.ts`, `electron/agent.ts`, `src/components/AnswerView.tsx`

1. Extend workspace smoke with a failing assertion for deterministic evidence fallback shaping.
2. Add an evidence fallback result containing matched note excerpts and calm, sanitized availability text.
3. Change `answerQuestion` to pass already-retrieved evidence directly to one bounded completion request instead of launching a second tool loop.
4. On timeout, malformed output, or provider failure, return retrieved evidence instead of raw provider text.
5. Re-run workspace smoke, answer smoke when network is available, and typecheck.

### Task 4: Add local Review and Focus Memory services

**Files:** `shared/types.ts`, `electron/workspace-store.ts`, `electron/ipc-handlers.ts`, `electron/preload.ts`

1. Add failing workspace-store assertions for local JSON persistence and deletion.
2. Implement review-state and focus-session persistence under Electron user data.
3. Expose list/save/delete IPC methods with input validation.
4. Keep focus records local and support recap note proposals through the existing approval-token gate.
5. Run smoke and typecheck.

### Task 5: Build the complete workspace flow

**Files:** `src/App.tsx`, `src/components/*Workspace.tsx`, `src/components/FocusMemory.tsx`, existing renderer components

1. Make Today the default screen with one primary next action, review queue, recent recall, and prompt suggestions.
2. Keep Ask conversation focused and attach useful actions after answers.
3. Turn literature review into Create and knowledge gaps into Review.
4. Move manual linking into a contextual Capture action and rename Corpus to Library.
5. Add Focus Memory with OS screen/window selection, explicit start/stop, persistent visible indicator, manual checkpoints, local recap, related-note suggestions, delete, read aloud, and save-to-vault approval.
6. Ensure all failure, empty, loading, and offline states remain useful.

### Task 6: Apply the restrained dossier visual system

**Files:** `src/styles/app.css`, `src/styles/tokens.css`, `docs/design.md`

1. Implement the declared light-only reading-room aesthetic with compact navigation, dossier labels, strong type hierarchy, one green accent, and disciplined radii.
2. Remove side-stripe error styling, decorative motion, raw SVG navigation art, excessive cards, and overflowing machine paths.
3. Add responsive behavior, keyboard focus, reduced-motion handling, 44px interactive targets where practical, `100dvh`, and dialog semantics.

### Task 7: Verify the product end to end

**Files:** `README.md`, `docs/demo-script.md`

1. Run `npm run typecheck`.
2. Run `npm run smoke:local`, `npm run smoke:workspace`, `npm run smoke:artifact`, and `npm run smoke:capture`.
3. Run `npm run build:unpack`.
4. Launch Electron and inspect Today, Ask recovery, Review, Capture, Library, and Focus Memory at desktop and narrow widths.
5. Fix verified defects using systematic debugging and repeat the checks.
6. Update README and demo script to match the shipped experience and privacy boundary.
