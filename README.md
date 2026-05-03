# Sam Code - A Modern Code Editor

![Sam Code Logo](resources/icon.png)

Sam Code is a modern, open-source code editor built with Electron, React, and Monaco Editor. It features a clean interface, integrated terminal, AI-powered coding assistant, and extensible marketplace for additional functionality.

## ✨ Features

- **Modern Interface**: Clean, customizable UI with light/dark themes
- **Powerful Editor**: Built on Monaco Editor (same as VS Code) with syntax highlighting for 100+ languages
- **Integrated Terminal**: Full-featured terminal using xterm.js and node-pty
- **AI Assistant**: Built-in coding assistant powered by OpenAI (configurable)
- **Marketplace**: Extensible plugin system for additional features
- **Cross-Platform**: Available for Windows, macOS, and Linux
- **File Explorer**: Native file system navigation and operations
- **Notebook Support**: Jupyter notebook editing capabilities
- **Customizable**: Extensive settings and keybindings

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/Houssemeddine-mag/Sam-Code.git
cd Sam-Code

# Install dependencies
npm install
```

### Development

```bash
# Start the application in development mode
npm run dev
```

This will start:
- Electron main process
- Vite development server for the renderer
- Hot module replacement for fast development

### Building for Production

```bash
# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux

# Build for all platforms (requires respective OS)
npm run build
```

The built applications will be available in the `dist/` directory.

## 📦 Project Structure

```
sam-code/
├── .github/                 # GitHub Actions workflows
│   └── workflows/
│       └── build-installers.yml   # CI/CD for cross-platform builds
├── build/                   # Build resources and icons
├── dist/                    # Built executables (generated)
├── downloads/               # Downloadable binaries (for distribution)
├── landing/                 # Landing page assets
├── marketplace/             # Landing page and marketplace
├── resources/               # Application icons and assets
├── render-downloads/        # Render.com download service
├── src/                     # Source code
│   ├── main/                # Electron main process
│   │   ├── index.js         # Main application entry point
│   │   └── marketplace.js   # Marketplace package management
│   ├── preload/             # Electron preload scripts
│   │   └── index.js         # Preload script for security
│   └── renderer/            # React renderer process
│       ├── index.html       # HTML template
│       └── src/             # React source code
│           ├── App.jsx      # Main application component
│           ├── components/  # Reusable UI components
│           └── assets/      # Styles and assets
├── .gitignore               # Git ignore rules
├── electron-builder.yml     # Electron builder configuration
├── electron.vite.config.mjs # Vite configuration for Electron
├── package.json             # Project dependencies and scripts
└── README.md                # This file
```

## 🔧 Configuration

### Environment Variables

The application can be configured using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | API key for OpenAI assistant | (required for AI features) |
| `SAMCODE_DATA_DIR` | Custom data directory | OS-specific app data folder |

### AI Assistant Setup

To enable the AI coding assistant:

1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Set the environment variable:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```
3. Or configure it in the application settings panel

## 🛠️ Development Guidelines

### Code Style

- Follows standard JavaScript/React conventions
- Uses ESLint and Prettier for code formatting
- Commit messages should be descriptive and follow conventional commits

### Adding Features

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Testing

- Manual testing is recommended for UI changes
- Test on all target platforms when possible
- Ensure builds work for Windows, macOS, and Linux

## 📱 Platform Support

Sam Code is built and tested on:

| Platform | Status | Notes |
|----------|--------|-------|
| Windows 10/11 | ✅ Supported | NSIS installer |
| macOS 12+ | ✅ Supported | DMG installer |
| Ubuntu 22.04+ | ✅ Supported | AppImage |
| Other Linux | ⚠️ Community | May work with dependencies |

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### How to Contribute

1. Report bugs and feature requests in the [Issues](https://github.com/Houssemeddine-mag/Sam-Code/issues) section
2. Submit pull requests with improvements
3. Improve documentation
4. Add translations
5. Suggest new features

### Contribution Process

1. Fork the repository
2. Create your feature branch
3. Make changes
4. Ensure code passes linting: `npm run lint`
5. Test your changes thoroughly
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [React](https://reactjs.org/) - UI library
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor component
- [Vite](https://vitejs.dev/) - Build tool
- [Electron-Vite](https://electron-vite.org/) - Electron + Vite integration
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Lucide Icons](https://lucide.dev/) - Beautiful open-source icons
- [Xterm.js](https://xtermjs.org/) - Terminal emulator
- [Node-PTY](https://github.com/microsoft/node-pty) - Pseudoterminal for Node.js

## 📞 Support

For questions and support:
- Open an issue in the [GitHub Issues](https://github.com/Houssemeddine-mag/Sam-Code/issues) section
- Check the [Discussions](https://github.com/Houssemeddine-mag/Sam-Code/discussions) for community help
- Review the [documentation](#) for common questions

---

Made with ❤️ by the open-source community
