# Noema

Noema is a desktop knowledge workspace with its own local Markdown corpus. It turns notes, meetings, captures, and focus checkpoints into searchable working memory without treating model output as evidence. Existing folders and Obsidian vaults remain optional connectors.

## The problem

Researchers, educators, and students accumulate notes that are hard to revisit as a whole. Important connections and contradictions stay buried, and turning scattered reading notes into a reliable draft still takes manual work. Ordinary chat tools do not retain a user's corpus as persistent working knowledge, and they cannot safely act on it.

## The solution

Noema creates `Documents/Noema Library` as a transparent corpus of ordinary files, gives an agent bounded tools to search and read it, and turns retrieved notes into grounded answers and research artifacts. Every displayed citation is checked in code against the source note. Any proposed write stays editable and unwritten until the user explicitly approves it.

## Why Noema

1. **Code-validated citations, not model-made references.** A claim only renders with a citation after Noema verifies the cited text against the corpus; unsupported claims are removed.
2. **An agent that can act, behind an approval gate.** Capture, meeting, and linking flows produce editable proposals. Nothing reaches the corpus until the user chooses **Approve & write**.
3. **A daily knowledge loop.** Today suggests useful next prompts, Review turns resurfaced notes into recovery work, and every answer offers a concrete next action.
4. **Hackathon-safe Focus Memory.** A user explicitly selects one screen or window, adds checkpoints, and receives a local recap connected to related notes. No screen image or focus record is sent to NIM, and recap notes still require approval.
5. **Private continuity, without ambient surveillance.** Work Timeline uses real local file timestamps, meeting tasks can enter Review, and `Cmd/Ctrl + Shift + Space` reopens Ask from anywhere. Noema never starts background screen or audio capture.
6. **A useful assistant, not a compulsory search box.** Noema semantically interprets the conversation and chooses a direct response, selected local context, or citation-validated corpus retrieval. When a local file or folder is needed, it asks for explicit access and resumes the same request after selection.
7. **Live research with a visible approach.** Current or explicitly online questions trigger bounded web research, readable-source extraction, and code-validated clickable citations. Every answer can reveal a concise decision summary, and web sources can enter the existing editable Capture flow.

The interface is a light Reading Room: a calm, sidebar-based workspace where green means verified and amber appears only while the agent is actively using a tool.

## Demo video

A public demo-video link will be added here once the recording is uploaded. The recording plan is in [`docs/demo-script.md`](docs/demo-script.md).

## Built with

- **GPT-5.6 / Codex** was used to design, implement, test, and package the Electron application. Codex contributed the final submission pass.
- **Tirth Shendage** contributed the hackathon submission, product direction, and demo refinement.
- **NVIDIA NIM** runs the app at runtime: `meta/llama-3.1-8b-instruct` powers the agent and `nvidia/llama-nemotron-embed-1b-v2` provides corpus embeddings.

## Download and run

The [Package desktop apps workflow](https://github.com/tirthfx/noema/actions/workflows/package.yml) publishes unsigned desktop artifacts. Verified run `29519838958` produced:

- macOS: ARM64 and x64 `.dmg` and `.zip` packages.
- Windows: x64 NSIS installer and portable `.exe` packages.

### macOS

1. Download the artifact that matches your Mac (`arm64` for Apple Silicon; `x64` for Intel).
2. Open the `.dmg` and drag Noema to Applications, or unzip the `.zip`.
3. Because this hackathon build is unsigned, Control-click Noema, choose **Open**, then choose **Open** again in the confirmation dialog. You only need to do this the first time.
4. If macOS still blocks the app, open **System Settings → Privacy & Security** and choose **Open Anyway** for Noema.

### Windows

1. Download the x64 NSIS installer, or use the portable `.exe` if you do not want an installation.
2. Run the file. Windows SmartScreen may show a protection screen because the build is unsigned.
3. Choose **More info**, then **Run anyway**. The installer lets you select an installation folder.

## Before your first corpus index

Noema uses NVIDIA NIM for embeddings and synthesis. Set `NVIDIA_API_KEY` in your environment before launching the app. For development, you can also create a local `.env` file:

```bash
NVIDIA_API_KEY=your_key_here
```

The key stays in Electron's main process and is never exposed to the renderer.

> **Hackathon packaging risk:** current judge/demo installers deliberately bundle `.env` so
> they run with zero setup. Anyone who receives an installer can extract that NVIDIA key.
> Do not distribute these builds publicly; remove the `extraResources` entry and rotate the
> key before a public release.

## Development

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run smoke:local
npm run smoke:workspace
npm run package:mac
```

Windows packages are built on the native Windows GitHub Actions runner; macOS packages are built on the native macOS runner. This avoids cross-platform packaging mismatches.

## MCP: let other agents query your corpus

Noema can expose its indexed corpus to other agents (Claude, Codex, etc.) over the Model Context Protocol, so an agent working on something else can pull grounded, cited context from your notes instead of guessing or making you re-explain it.

```bash
npm run mcp
```

This starts a read-only stdio MCP server with four tools: `search_notes`, `read_note`, `list_notes`, and `ask_corpus` (a fully synthesized, citation-validated answer — the same grounding pipeline as the in-app Ask). By default it reads whichever vault you last opened in the desktop app; point it at a specific vault instead with `NOEMA_VAULT_PATH=/path/to/vault`.

There is deliberately no `write_note` or `link_notes` tool here. Every write in Noema stays behind the in-app `EditablePreview` approval gate — an external agent can read and ask, but it cannot commit anything to disk without a human clicking **Approve & write** inside the app itself.

## Knowledge workspace UI

The app is a warm-paper, light-only workspace with six connected areas: Today, Ask, Create, Review, Capture, and Library. Green marks selected, verified, local, and approved states. Amber appears only while an agent operation is active.

### Focus Memory privacy boundary

- It never starts automatically.
- Screen or window selection is explicit through Noema's local Electron source picker.
- The current hackathon build stores user-entered session context, timestamps, and checkpoints locally.
- It does not claim continuous OCR, microphone capture, system-audio capture, or behavioral profiling.
- Saving a recap to the corpus opens the same editable approval gate as every other write.

### Selected context privacy boundary

- Typing a local path never grants filesystem access. Noema opens a native picker and reads only the file or folder the user explicitly selects.
- The renderer receives an opaque token, not authority to request arbitrary paths. Context tokens expire after four hours.
- Reads are text-only and bounded; dependency/build folders, hidden files, `.env` files, credentials, and private-key-like files are excluded.
- Selected text is sent to NVIDIA NIM to answer the current request. It is not imported into the persistent corpus unless the user separately approves a Capture write.
