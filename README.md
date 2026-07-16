# Noema

Noema is a desktop knowledge agent for an Obsidian vault. It indexes Markdown notes on your device, answers from those notes with validated citations, and proposes every write for your approval.

## Download and run

Each GitHub Actions run publishes unsigned desktop artifacts:

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

## Before your first vault index

Noema uses NVIDIA NIM for embeddings and synthesis. Set `NVIDIA_API_KEY` in your environment before launching the app. For development, you can also create a local `.env` file:

```bash
NVIDIA_API_KEY=your_key_here
```

The key stays in Electron's main process and is never exposed to the renderer.

## Development

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run smoke:local
npm run package:mac
```

Windows packages are built on the native Windows GitHub Actions runner; macOS packages are built on the native macOS runner. This avoids cross-platform packaging mismatches.

## Reading Room UI

The app is a warm-paper, light-only workspace with five sidebar modes: Ask, Review, Capture, Link, and Corpus. Green marks verified citations and approved actions; amber appears only while an agent tool call is in progress.
