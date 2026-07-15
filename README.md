# Noema

Noema is a desktop knowledge agent for Obsidian vaults. This repository is currently at Phase 0: the secure Electron shell, design foundation, and native vault picker.

## Development

```bash
npm install
npm run dev
```

The renderer is sandboxed and accesses the native vault picker only through the typed `window.noema` bridge.
