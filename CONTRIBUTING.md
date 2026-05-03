# Contributing to Sam Code

Thank you for considering contributing to Sam Code! We welcome contributions from the community.

## How to Contribute

### Reporting Bugs

Before submitting a bug report, please check if the issue has already been reported. When you are ready to report a bug, please include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Screenshots or screen recordings if applicable
- Your operating system and Sam Code version

### Suggesting Features

Feature requests are welcome! Please provide:

- A clear description of the feature
- Why this feature would be useful to users
- Any potential implementation considerations

### Submitting Changes

1. Fork the repository on GitHub
2. Create a new branch for your changes:
   ```bash
   git checkout -b feature-or-fix-name
   ```
3. Make your changes
4. Ensure your code follows the project's coding standards
5. Test your changes thoroughly
6. Commit your changes:
   ```bash
   git commit -m "Description of changes"
   ```
7. Push to your fork:
   ```bash
   git push origin feature-or-fix-name
   ```
8. Open a Pull Request against the main branch

## Coding Standards

### JavaScript/React

- Use ES6+ features
- Follow React best practices
- Use functional components with hooks when appropriate
- Keep components small and focused
- Use meaningful variable and function names
- Add comments for complex logic

### Styling

- Use Tailwind CSS utility classes
- Follow the existing design system
- Keep responsive design in mind
- Use semantic HTML where possible

### Commit Messages

Use clear, descriptive commit messages:

- `feat: add new feature`
- `fix: resolve issue with file saving`
- `docs: update documentation`
- `style: fix formatting`
- `refactor: restructure code`
- `test: add tests`
- `chore: update dependencies`

## Development Setup

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Git

### Getting Started

```bash
# Fork and clone the repository
git clone https://github.com/your-username/Sam-Code.git
cd Sam-Code

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building

```bash
# For local testing
npm run build

# Platform-specific builds
npm run build:win   # Windows
npm run build:mac   # macOS
npm run build:linux # Linux
```

## Testing Guidelines

While Sam Code doesn't have automated tests yet, please:

1. Test your changes manually
2. Ensure existing functionality still works
3. Test on multiple platforms if possible
4. Pay attention to UI/UX consistency

## Community

Please be respectful and considerate of others when contributing. We follow the [Contributor Covenant](https://www.contributor-covenant.org/) code of conduct.

## Getting Help

If you need help with your contribution:

- Check existing issues and pull requests
- Ask questions in the issue tracker
- Look at the existing code for patterns and conventions

Thank you for contributing to Sam Code!
