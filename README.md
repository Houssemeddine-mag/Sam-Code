# Sam Code

**A modern, open-source code editor built on Electron, React, and Monaco.**

Sam Code brings a fast editing experience, an integrated terminal, a multi-provider AI assistant, notebook support, and an extensible marketplace into a single lightweight desktop app.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#-platform-support)

---

## ✨ Features

| | Feature | What it does |
|---|---|---|
| 🖥️ | **Monaco editor** | The same editing engine as VS Code, with syntax highlighting for 100+ languages |
| 💻 | **Integrated terminal** | Real PTY-backed terminal powered by `xterm.js` and `node-pty` |
| 🤖 | **AI assistant** | Chat-driven coding help with file edits and terminal commands |
| 🔌 | **Multi-provider AI** | OpenRouter, OpenAI, Anthropic, Google, Ollama (local), and OpenCode |
| 🧩 | **Marketplace** | Install extensions, plugins, and notebook runtimes on demand |
| 📓 | **Notebooks** | Run Jupyter cells with rich output and persistent Python state |
| 📄 | **PDF viewer** | Read PDFs inside the editor with zoom and page navigation |
| 🎨 | **Themes** | Light and dark appearance modes with a customizable layout |
| 💾 | **Autosave & sessions** | Restore open files, recent folders, and workspace state |
| 🌍 | **Cross-platform** | Windows (NSIS), macOS (DMG), and Linux (AppImage) |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (20 LTS recommended)
- **npm** 9+
- **Git**
- **Python 3** _(optional — only needed for notebook execution)_

### Install & run

```bash
git clone https://github.com/Houssemeddine-mag/Sam-Code.git
cd Sam-Code

npm install     # also rebuilds native deps via postinstall
npm run dev     # launches Electron + Vite with hot reload
```

`npm run dev` starts the Electron main process, the Vite dev server for the renderer, and hot module replacement.

### Build an installer

```bash
npm run build:win     # Windows  → dist/*.exe
npm run build:mac     # macOS    → dist/*.dmg
npm run build:linux   # Linux    → dist/*.AppImage
npm run build:unpack  # Unpacked app for local testing
```

Build artifacts are written to `dist/`. Each target should be built on its native OS; tagged `v*` pushes trigger the cross-platform CI workflow in `.github/workflows/build-installers.yml`.

---

## 📜 Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the app in development mode with HMR |
| `npm start` | Preview a production build |
| `npm run build` | Compile main, preload, and renderer bundles into `out/` |
| `npm run build:unpack` | Build and package an unpacked app (`electron-builder --dir`) |
| `npm run build:win` | Clean, regenerate icons, build, and package for Windows |
| `npm run build:mac` | Build and package for macOS |
| `npm run build:linux` | Build and package for Linux |
| `npm run lint` | Run ESLint (cached) |
| `npm run format` | Format the repo with Prettier |
| `npm run prepare:icons` | Regenerate app icons from `resources/` |
| `npm run clean:dist` | Remove previous build output |

---

## 🤖 AI Assistant Setup

The assistant is configured **inside the app**, not through environment variables. Open **Settings → AI** and provide a connection and API key. Keys are stored locally in the app.

| Provider | How to connect |
|---|---|
| **OpenRouter** | Paste an `sk-or-…` key (default when no connection is set) |
| **OpenAI** | Paste an `sk-…` key or set the API base URL |
| **Anthropic** | Paste an `sk-ant-…` key |
| **Google** | Paste a Gemini API key (`AIza…`) |
| **Ollama** | Point at a local endpoint such as `http://localhost:11434` |
| **OpenCode** | Use an OpenCode endpoint and its Zen model |

The provider is inferred automatically from the key or URL, and can be overridden manually. Model lists are discovered from the provider when supported.

---

## 🗂️ Project Structure

```text
sam-code/
├── .github/workflows/        # CI: cross-platform installer builds
├── build/                    # Build resources (icons, entitlements)
├── build-scripts/            # Icon generation and dist cleanup
├── marketplace/              # Marketplace catalog, packages, and plugins
│   ├── catalog.json          # Source catalog consumed by the UI
│   ├── packages/             # Installable package manifests + entries
│   └── plugins/              # Editor and workflow plugins
├── render-downloads/         # Render.com download service
├── resources/                # App icons and static assets
├── src/
│   ├── main/
│   │   ├── index.js          # Electron main process, IPC, terminal, notebooks
│   │   └── marketplace.js    # Package install / activation logic
│   ├── preload/
│   │   └── index.js          # Secure bridge exposed to the renderer
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.jsx      # React entry + Monaco workers
│   │       ├── App.jsx       # Main application shell
│   │       ├── TerminalDock.jsx
│   │       ├── TerminalPane.jsx
│   │       ├── PdfViewer.jsx
│   │       ├── components/   # Reusable UI components
│   │       └── assets/       # Styles
│   └── shared/
│       └── providerUtils.js  # Provider/model helpers shared by main + renderer
├── electron-builder.yml      # Packaging configuration
├── electron.vite.config.mjs  # Electron + Vite configuration
└── package.json
```

### How the pieces fit

1. **Main process** (`src/main`) owns windows, file system access, PTYs, notebook workers, and marketplace installs.
2. **Preload** (`src/preload`) exposes a narrow, context-isolated API to the renderer.
3. **Renderer** (`src/renderer`) is the React UI. Monaco workers are registered in `main.jsx`.
4. **Shared** (`src/shared`) holds logic that must stay free of Node/Electron imports so both sides can use it.

When adding a new capability, expose it as an IPC handler in the main process, surface it through the preload bridge, then consume it in the renderer. Keep context isolation enabled and validate any paths crossing the boundary.

---

## 🧩 Extending Sam Code

The marketplace lives in `marketplace/`. To add an extension or package:

1. Create `marketplace/packages/<your-id>/`.
2. Add a `manifest.json` with `id`, `name`, `version`, `type`, `entry`, and any `features` / `ui` metadata.
3. Implement the entry (usually `index.mjs`) and document usage in a local `README.md`.
4. Register it in `marketplace/catalog.json` so the UI can discover it.

See [`marketplace/README.md`](marketplace/README.md) for the catalog layout and available package groups.

---

## 🧑‍💻 Development Guidelines

- **Style** — ES modules, functional React components with hooks, Tailwind CSS utilities.
- **Linting** — run `npm run lint` before opening a PR; `npm run format` applies Prettier.
- **Commits** — use conventional messages (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- **Testing** — there is no automated suite yet; manually verify affected flows on your platform and note what you tested in the PR.

### Contribution flow

```bash
git checkout -b feature/amazing-feature
# ...make changes...
npm run lint
git commit -m "feat: add amazing feature"
git push origin feature/amazing-feature
```

Then open a Pull Request. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full guide.

---

## 🩺 Troubleshooting

| Problem | Fix |
|---|---|
| `node-pty` fails to build | Install build tools for your OS, then run `npm rebuild node-pty` (or reinstall with `npm install`) |
| Terminal does not open | Ensure the native module matches your Electron version; `postinstall` runs `electron-builder install-app-deps` |
| Notebooks will not run | Make sure `python`/`python3` is on `PATH`; install `jupyter`-adjacent deps only if a notebook imports them |
| AI requests fail | Check the key, provider, and endpoint in Settings → AI; local Ollama endpoints must be reachable |
| Windows build leaves stale files | `npm run clean:dist` before rebuilding (already part of `build:win`) |
| Blank window after `npm run build` | Run `npm start` to preview the built output, and check the terminal for main-process errors |

---

## 📱 Platform Support

| Platform | Status | Installer |
|---|---|---|
| Windows 10/11 | ✅ Supported | NSIS `.exe` |
| macOS 12+ | ✅ Supported | `.dmg` |
| Ubuntu 22.04+ | ✅ Supported | `.AppImage` |
| Other Linux | ⚠️ Community | May work with extra system libraries |

---

## 🤝 Contributing

Contributions of all sizes are welcome — bug reports, features, docs, translations, and marketplace packages.

- 🐛 [Report a bug](https://github.com/Houssemeddine-mag/Sam-Code/issues)
- 💡 [Request a feature](https://github.com/Houssemeddine-mag/Sam-Code/issues)
- 💬 [Join the discussions](https://github.com/Houssemeddine-mag/Sam-Code/discussions)
- 📖 Read [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## 📄 License

Released under the [MIT License](LICENSE).

## 🙏 Acknowledgments

Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), [Vite](https://vitejs.dev/), [Electron-Vite](https://electron-vite.org/), [Tailwind CSS](https://tailwindcss.com/), [Lucide](https://lucide.dev/), [xterm.js](https://xtermjs.org/), and [node-pty](https://github.com/microsoft/node-pty).

---

Made with ❤️ by the open-source community.
