# AGENTS.md

## Project Overview

**Staging** is a CLI tool that launches a local browser interface for reviewing Git staged changes. It provides a GitHub-style diff view with inline threaded comments, allowing developers to review and commit their work directly from a rich UI before pushing.

## Tech Stack

- **Frontend:** React 19, Vite, Vanilla CSS
- **Backend:** Node.js, Hono (lightweight web framework), ESM modules
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
- **lib/server.js**: Bridges the CLI and the frontend using Hono. It serves the `dist` folder via `serveStatic` (streaming) and exposes API routes.

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

## Features

### Collapse All / Expand All Toggle
A header button that collapses or expands all diff file viewers at once. State is managed in `App.jsx` via `globalCollapsed` + `collapseVersion` (a version counter that triggers effects even when the boolean doesn't change). Each `DiffViewer` syncs its local `collapsed` state from the global signal via `useEffect`, while individual per-file toggles continue to work independently.

### Project Navigator
A breadcrumb-style navigator in the header: `[project ▾] / staging / [⑂ branch ▾]`. The left segment lists sibling git repos (scanned from the parent directory) and the right segment lists git worktrees. Selecting either switches the active `gitRoot` on the server and reloads all diffs.

**Backend:**
- `lib/git.js` exports `getCurrentBranch()`, `discoverSiblingProjects()`, `listWorktrees()`, and `clearSummaryCache()`.
- `lib/server.js` exposes `GET /api/project-info` (returns project name, branch, sibling projects, worktrees) and `POST /api/switch-project` (accepts `{ path }`, validates it's a git repo, updates `gitRoot`, returns new project-info).

**Frontend:**
- `src/components/ProjectNavigator.jsx` renders the breadcrumb with two dropdown menus (project selector, worktree selector). Dropdowns close on outside click.
- `App.jsx` holds `projectInfo` state (fetched on mount from `/api/project-info`) and a `switchProject(path)` handler that POSTs to `/api/switch-project`, resets all diff state, and re-fetches everything.
- `Header.jsx` receives `projectInfo` and `onSwitchProject` props and renders the `ProjectNavigator` in place of the standalone logo when project info is available.

### File Navigator (Sidebar)
The file sidebar (`FileSidebar.jsx`, replacing the old `FileList.jsx`) supports two view modes — **flat list** and **file-system tree** — plus a search bar for filtering.

**View modes:**
- **Flat list** (default): Same behavior as the original `FileList` — a flat list of staged file paths with status dots and stats.
- **Tree view**: A recursive directory tree with collapsible folders. Directories sorted before files, both alphabetically. Toggled via icon buttons in the sidebar header (Material Symbols `list` / `account_tree`). View preference is persisted in `localStorage` as `staging-file-view`.

**Search bar:**
- Filters files by case-insensitive path substring match. Works in both views. In tree view, shows matching files and their ancestor directories (all auto-expanded).

**"Show all files" toggle (tree view only):**
- A checkbox toggle below the search bar. When enabled, fetches `GET /api/tracked-files` once and merges all tracked (non-staged) files into the tree. Non-staged files render with `opacity: 0.4`, no status dot, no stats, and are not clickable.

**Backend:**
- `lib/git.js` exports `getTrackedFiles(gitRoot)` — runs `git ls-files -z` and returns an array of all tracked file paths.
- `lib/server.js` exposes `GET /api/tracked-files` — returns `{ files: string[] }`.

**Frontend:**
- `src/utils/fileTree.js` — `buildFileTree(fileSummaries, allTrackedFiles?)` builds a nested tree structure; `filterTree(tree, query)` prunes the tree to search matches.
- `src/components/FileSidebar.jsx` — main sidebar component containing `FlatFileList`, `FileTreeView`, and `FileTreeNode` sub-components.
- `App.jsx` imports `FileSidebar` (same props as the old `FileList`: `files`, `loadedFilesByPath`, `onSelectFile`).

## Agent Guidelines

- **Documentation Updates**:  As a coding agent working on this `staging` project. You MUST update this `AGENTS.md` file on every meaningful feature, enhancement, or logic addition. This update should be the final step of every implementation plan.
