# AGENTS.md

## Project Overview

**Staging** is a CLI tool that launches a local browser interface for reviewing Git staged changes. It provides a GitHub-style diff view with inline threaded comments, allowing developers to review and commit their work directly from a rich UI before pushing.

## Tech Stack

- **Frontend:** React 19, Vite, Vanilla CSS
- **Backend:** Node.js, Express (implied), `simple-git`
- **Runtime:** Node.js >= 18.0.0

## Project Structure

```
staging/
├── bin/
│   └── staging.js        # CLI entry point
├── lib/
│   ├── config.js         # Configuration management
│   ├── git.js            # Git command wrappers & diff parsing
│   ├── server.js         # Local server handling API & static assets
│   └── open-browser.js   # Cross-platform browser opener
├── src/
│   ├── components/       # React UI components
│   ├── hooks/            # Custom React hooks
│   ├── utils/            # Frontend utilities
│   ├── App.jsx           # Main application shell
│   ├── main.jsx          # React entry point
│   └── style.css         # Global styles
├── package.json
└── vite.config.js
```

## Development Commands

```bash
# Install dependencies
npm install

# Start the frontend development server (HMR enabled)
npm run dev

# Build the frontend for production
npm run build

# Run the CLI tool locally (mounts current directory)
npm start
```

## Code Style & Conventions

- **Reuse code**: Isolate logic into a shared function or hook when it appears more than once.
- **Short functions**: Prefer shorter, focused functions. Break long functions into smaller, testable pieces.
- **Self-explanatory**: Prioritize self-documenting code with meaningful variable and function names over heavy commenting.
- **KISS (Keep It Simple, Stupid)**: Avoid over-engineering. Choose the simplest solution that works effectively.
- **React**: Use functional components and Hooks. Avoid class components.
- **Styling**: Maintain vanilla CSS in `style.css` for simplicity unless a specific need arises.

## Architecture Guidelines

### Backend (Node.js)
- **lib/git.js**: Handles all raw git interactions. Ensure output parsing is robust.
- **lib/server.js**: Bridges the CLI and the frontend. It serves the `dist` folder in production and proxies API requests.

### Frontend (React)
- **State Management**: Use React Context or simple state for now. Avoid Redux unless complexity demands it.
- **Performance**: Large diffs need to be rendered efficiently. Use virtualization if the DOM gets too heavy.

## Common workflows

- **Adding a new feature**:
  1.  Create backend logic in `lib/` if needed.
  2.  Expose via API in `lib/server.js`.
  3.  Build frontend component in `src/`.
  4.  Verify end-to-end with `npm start`.

- **Debugging**:
  - Run `npm run dev` for frontend iteration.
  - Check terminal output for backend logs.
