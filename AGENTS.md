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
├── .husky/
│   └── pre-commit        # Runs lint-staged before each commit
├── eslint.config.js      # ESLint flat config (JS/JSX)
├── .prettierrc           # Prettier formatting rules
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

# Lint all source files
npm run lint

# Lint and auto-fix
npm run lint:fix

# Format all source files with Prettier
npm run format
```

## Code Style & Conventions

- **Reuse code**: Isolate logic into a shared function or hook when it appears more than once.
- **Short functions**: Prefer shorter, focused functions. Break long functions into smaller, testable pieces.
- **Self-explanatory**: Prioritize self-documenting code with meaningful variable and function names over heavy commenting.
- **KISS (Keep It Simple, Stupid)**: Avoid over-engineering. Choose the simplest solution that works effectively.
- **Reduce, don't accumulate**: Actively identify and remove redundant code, unused files, and dead paths. Fewer lines and fewer files are preferred over extra ones. When adding new functionality that replaces existing logic, delete the old code — don't leave it around "just in case." Only remove code when you're confident it's truly unused, not speculatively.
- **Leverage libraries, import sparingly**: Prefer well-known, battle-tested libraries over hand-rolled solutions. But import only the specific modules or functions you need — avoid pulling in entire packages to minimize bundle size and dependency footprint.
- **React**: Use functional components and Hooks. Avoid class components.
- **Styling**: Maintain vanilla CSS in `style.css` for simplicity unless a specific need arises.

### Linting & Formatting
- **ESLint** (`eslint.config.js`) — flat config (ESM). Two config blocks: one for backend (`lib/`, `bin/`) with Node.js globals, one for frontend (`src/`) with browser globals + `react-hooks` + `react-refresh` plugins. `eslint-config-prettier` disables formatting-related rules.
- **Prettier** (`.prettierrc`) — single quotes, trailing commas, 2-space indent, 80 char print width, semicolons.
- **Pre-commit hook** — Husky + lint-staged. On every `git commit`, staged `.js`/`.jsx` files are auto-formatted with Prettier then linted with ESLint (`--fix`). Staged `.css` files are auto-formatted with Prettier. Config lives in `package.json` under `"lint-staged"`.
- Unused variables are warnings (not errors) with `argsIgnorePattern: '^_'` — prefix intentionally unused params with `_`.

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

### Hunk-Level Unstage & Revert
Per-hunk action buttons that appear on hover in the diff hunk header row, allowing users to unstage or discard individual hunks directly from the diff view.

**Backend:**
- `lib/git.js` exports `buildHunkPatch(gitRoot, filePath, chunkIndex, expectedOldStart)` (internal), `unstageHunk(gitRoot, filePath, chunkIndex, oldStart)`, and `revertHunk(gitRoot, filePath, chunkIndex, oldStart)`.
  - `buildHunkPatch` re-runs `git diff --cached` for the file, extracts the target chunk, cross-checks `oldStart` to detect stale diffs, and reconstructs a valid unified diff patch.
  - `unstageHunk` applies the patch in reverse to the index (`git apply --cached --reverse`).
  - `revertHunk` does the same plus applies in reverse to the working tree (`git apply --reverse`), discarding changes entirely.
- `lib/server.js` exposes `POST /api/hunk-unstage` and `POST /api/hunk-revert`, both accepting `{ filePath, chunkIndex, oldStart }`.

**Frontend:**
- `src/components/DiffViewer.jsx` — Table restructured from single `<tbody>` to per-chunk `<tbody className="hunk-tbody">` for CSS hover targeting. `HunkHeader` renders an "Unstage" text button and a revert (undo icon) button inside a `.hunk-actions` div. Revert shows a `confirm()` dialog.
- `src/App.jsx` — `handleUnstageHunk` and `handleRevertHunk` callbacks POST to the API, show a toast, and call `reloadDiffs()` on success. Both are passed as props to `<DiffViewer>`.
- `src/style.css` — `.hunk-actions` floats right in the hunk header, hidden by default (`opacity: 0`), revealed on `.hunk-tbody:hover`. `.hunk-action-btn` uses the `btn-sm` style pattern. `.hunk-action-revert:hover` uses danger (red) colors.

**Edge cases:** Stale diff detection via `oldStart` cross-check; handles added files (`--- /dev/null`) and deleted files (`+++ /dev/null`); file disappears from diff after last hunk action (handled by `reloadDiffs()`).

### Per-Project Comment Persistence
Draft comments are stashed per project/worktree so they survive project switches and are restored when switching back.

**Implementation:**
- `src/hooks/useComments.js` — `useComments(projectKey)` accepts a project key (the `gitRoot` path). Internally maintains a `storeRef` (`Map<projectKey, commentsByFile>`) and a `prevKeyRef`. A `useEffect` on `projectKey` saves the current comments under the old key and restores the target key's comments (or `{}`). All existing functions (`addComment`, `updateComment`, `deleteComment`, `allComments`) are unchanged.
- `src/App.jsx` — `gitRoot` state is declared before `useComments(gitRoot)` so the hook always receives the current project key. `switchProject()` clears `activeForm` and `editingComment` before reloading diffs, preventing stale comment forms from lingering after a switch.

**Edge cases:** First load with empty `gitRoot` is a no-op; switching back restores comments from the map; rapid switching is safe because save/restore uses a functional `setCommentsByFile` updater.

### Toggleable & Resizable Comment Panel
The comment panel (right sidebar) can be toggled open/closed via a header button and resized by dragging its left edge.

**Toggle button:**
- A floating edge toggle (`comment-panel-toggle`) — a tiny 16x48px pill anchored to the right viewport edge (or the left edge of the panel when open). Hidden by default (`opacity: 0`), revealed on hover near the comment panel border. Uses a `chevron_right`/`chevron_left` icon. Rendered in `src/App.jsx` outside the grid layout as a fixed-position button when `hasComments` is true.
- `src/App.jsx` — `commentPanelOpen` state (default `true`). `showCommentPanel` derived from `hasComments && commentPanelOpen`. The `has-comments` CSS class and `CommentPanel` visibility both use `showCommentPanel`.

**Resizable panel:**
- Follows the same pattern as the sidebar resizer (pointer drag with RAF-throttled guide line, keyboard arrows, localStorage persistence).
- Constants: `COMMENT_PANEL_MIN_WIDTH = 240`, `COMMENT_PANEL_MAX_WIDTH = 480`, `COMMENT_PANEL_DEFAULT_WIDTH = 280`, `COMMENT_PANEL_STORAGE_KEY = 'staging-comment-panel-width'`.
- `src/App.jsx` — `commentPanelWidth` state initialized from localStorage. `handleCommentResizeStart` mirrors `handleSidebarResizeStart` with inverted delta (dragging left = wider). `handleCommentResizeKeyDown` supports arrow key resizing.
- `src/style.css` — Grid becomes 5 columns when `has-comments`: `sidebar | 10px | 1fr | 10px | comment-panel-width`. `.comment-resizer` mirrors `.sidebar-resizer` styles. `.comment-resize-guide` positioned from the right. `body.is-resizing-comment-panel` sets `col-resize` cursor.

### Syntax Highlighting
Diff lines are syntax-highlighted using **highlight.js/lib/core** with selective language imports (~50KB gzipped). No highlight.js CSS theme is imported — token colors are defined as `--hljs-*` CSS custom properties in both light and dark theme blocks, using a GitHub-inspired palette.

**Setup:**
- `src/utils/highlight.js` — Imports `hljs` core + 20 language grammars (JS, TS, Python, Go, Rust, Java, C/C++, C#, Ruby, PHP, Bash, CSS, XML/HTML, JSON, YAML, Markdown, SQL, Dockerfile, Swift). Exports `highlightLine(code, filePath)` which returns an HTML string or `null` for unknown languages.
- Extension-to-language map (e.g. `js→javascript`, `py→python`) + filename map (`Dockerfile→dockerfile`, `Makefile→bash`).
- Each line is highlighted independently via `useMemo` in the `DiffLine` component. Multi-line constructs may not highlight across boundaries, which is standard for diff tools.

**Frontend:**
- `src/components/DiffViewer.jsx` — `DiffLine` calls `highlightLine()` in a `useMemo`, renders via `dangerouslySetInnerHTML` when HTML is returned (safe — highlight.js escapes input), falls back to plain text for unknown languages.
- `src/style.css` — `--hljs-*` tokens in both theme blocks. Class rules scoped under `.line-code` map highlight.js classes (`.hljs-keyword`, `.hljs-string`, `.hljs-comment`, etc.) to tokens. All tokens force `background: transparent` so diff line backgrounds show through.

**Graceful fallback:** Files with unrecognized extensions render as plain text (no highlighting attempted).

### Sticky File Headers
When scrolling through a long file diff, the file card header (filename, status badge, stats, actions) sticks below the 64px app header so the user always knows which file they're viewing. Pure CSS — no JavaScript.

**Implementation (3 CSS changes in `src/style.css`):**
- `#diff-container` — `overflow-x: clip` (was `auto`). Individual `.diff-file-body` elements handle their own horizontal scroll, so container-level scroll is unnecessary. `clip` avoids creating a scroll container that would break sticky.
- `.diff-file` — `overflow: clip` (was `hidden`). Clips content for `border-radius` without creating a scroll container, allowing sticky to work through it.
- `.diff-file-header` — `position: sticky; top: 64px; z-index: 10`. Sticks directly below the app header while its parent `.diff-file` is in view, then scrolls away naturally when the next file card appears.

### Auto-Hiding Scrollbars
Scrollbars are invisible by default and only appear during active scrolling, then fade out after ~800ms — matching macOS trackpad behavior. Pill-shaped (fully rounded) thumb.

**CSS (`src/style.css`):**
- WebKit: Thumb starts `background: transparent` with `transition: background 0.3s`. `.is-scrolling::-webkit-scrollbar-thumb` sets `background: var(--border-1)`.
- Firefox: `scrollbar-width: thin; scrollbar-color: transparent transparent` on `*`. `.is-scrolling` overrides `scrollbar-color` to show the thumb.
- `height: 6px` added to `::-webkit-scrollbar` for horizontal scrollbar support. Thumb uses `border-radius: 100px` for pill shape.

**JS (`src/main.jsx`):**
- A global IIFE registers a single `scroll` listener on `document` (capture phase). On scroll, adds `.is-scrolling` to `e.target`. A per-element timeout (stored in a `WeakMap`) removes the class after 800ms of inactivity. No per-component wiring needed.

## UI Style & Design Guidelines

### Design Philosophy
The UI follows a **minimal, monospace-driven aesthetic** inspired by developer tooling — clean surfaces, subtle borders, and restrained color. The look is utilitarian but polished, similar to GitHub's diff view crossed with a modern code editor.

### Theming
- **Dual theme** — light and dark — controlled via `data-theme` attribute on `<html>`.
- All colors are defined as CSS custom properties in `[data-theme="light"]` and `[data-theme="dark"]` blocks at the top of `style.css`. Never use hard-coded colors in component styles; always reference `var(--*)` tokens.
- Theme preference is persisted in `localStorage` (`staging-theme`) and initialized before React mounts (inline script in `index.html`) to prevent flash.
- Respect `prefers-color-scheme: dark` as the default when no saved preference exists.

### Color Tokens (key groups)
| Token group | Purpose |
|---|---|
| `--bg-body`, `--bg-surface`, `--bg-surface-2`, `--bg-hover` | Background layers (body → card → nested → hover) |
| `--text-1`, `--text-2`, `--text-3` | Primary / secondary / muted text |
| `--border-1`, `--border-2` | Borders (stronger / softer) |
| `--accent`, `--accent-hover`, `--accent-soft` | Monochrome accent (near-black in light, near-white in dark) |
| `--add-*`, `--del-*` | Diff addition (green) and deletion (red) backgrounds, text, line-number fills |
| `--comment-bg`, `--comment-border` | Amber-tinted comment highlights |
| `--toast-success-*`, `--toast-error-*`, `--toast-info-*` | Semantic toast notification colors |
| `--shadow-sm/md/lg/overlay` | Elevation shadows (heavier in dark theme) |

### Typography
- **Primary font:** `JetBrains Mono` — used for _everything_ (body, buttons, code). Loaded from Google Fonts.
- Both `--font-sans` and `--font-mono` resolve to JetBrains Mono (monospace stack), keeping the entire UI typographically uniform.
- **Base body:** `font-size` inherited, `line-height: 1.5`, antialiased rendering.
- **Scale:** 10px (micro labels) → 11px (stats, hints) → 12px (sidebar, file paths, diff code) → 13px (body text, buttons, comments) → 14px (logo, separators) → 16px (modal headings).
- **Weights:** 400 (normal), 500 (medium — paths, stats), 600 (semibold — buttons, headings, labels), 700 (bold — nav segments, active items).
- **Letter-spacing:** Slight negative tracking (`-0.01em` to `-0.02em`) on headings and buttons for a tighter feel. Uppercase labels use positive tracking (`0.03em`).

### Spacing & Layout
- **Header:** Sticky, 64px height, glassmorphic (translucent + `backdrop-filter: blur(16px)`).
- **Grid layout:** 3-column (`sidebar | resizer | diff-area`), expanding to 4 columns when comments exist (`+ comment-panel`). Sidebar width is user-resizable via a drag handle with a default of `240px`.
- **Spacing rhythm:** 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 / 48px. Stick to these values for padding, margins, and gaps.
- **Padding conventions:** Sidebar items `6px 12px`, cards `8px 14px`, modals `28px`, diff container `12px 24px`.

### Border Radius
- `100px` — pill shapes for standard buttons (`.btn`) and search inputs. Used directly, not via a token.
- `--radius: 24px` — mid-size rounded elements (toast, commit banner, comment panel items, modal textarea).
- `--radius-lg: 10px` — cards (diff file cards, modals).
- `999px` — fully-round elements (icon buttons, toggle thumbs, status dots, small inline buttons).
- `12px` — comment bubbles, comment form input wraps.
- `8px` — dropdown menus, tree file items, flat file list items, small hints.
- `6px` — dropdown items, `.btn-sm`.
- `3px` — file status badges.

### Buttons
Three tiers:
1. **`.btn-primary`** — Solid fill (`--accent`), white text, pill shape, subtle shadow, lifts 1px on hover (`translateY(-1px)`). Used for primary actions (Commit).
2. **`.btn-secondary`** — Transparent with a light border, pill shape, border darkens on hover. Used for secondary actions (Send to Agent).
3. **`.btn-sm`** — Compact (24px height), 6px radius, thin border. Used inline (comment actions, pagination).
- All buttons use `100px` border-radius (pill) at standard size, `cursor: pointer`, and `transition` on background/border/color/shadow.
- Disabled buttons: `opacity: 1` (no dimming), muted background + text, `pointer-events: none`.

### Icons
- **Icon set:** Google Material Symbols Rounded (`material-symbols-rounded`), loaded as a web font.
- **Usage:** Always wrap in `<span className="material-symbols-rounded">icon_name</span>`.
- **Sizes:** 15px (toggle switches), 16px (nav/dropdown icons), 18px (inline comment button), 22px (header toolbar buttons).

### Interactions & Motion
- **Easing:** `--ease: cubic-bezier(0.25, 0.1, 0.25, 1)` — used on virtually all transitions. (`--ease-spring` is defined but currently unused.)
- **Duration:** 0.12s–0.15s for micro-interactions (hover, focus), 0.2s for state changes (collapse, theme switch), 0.3s for larger transitions (toasts).
- **Hover:** `--bg-hover` background or `brightness()` filter (diff lines).
- **Focus-visible:** `box-shadow` ring (`0 0 0 2px surface, 0 0 0 4px accent-soft`).
- **Modals:** Fade in overlay + scale card from 0.97 → 1 using `var(--ease)`.
- Comment buttons start hidden (`opacity: 0, scale(0.9)`) and reveal on row hover.

### Diff Table
- Monospace, 12px, 20px line-height. Fixed table layout.
- Line numbers: 48px width, right-aligned, muted color, clickable (for comment trigger).
- Added lines: tinted green background. Deleted lines: tinted red background. Hunk headers: neutral gray.

### Scrollbars
- WebKit custom scrollbar: 6px wide, transparent track, `--border-1` thumb, darkens on hover.

### Accessibility
- Use `aria-label` and `title` attributes on icon-only buttons.
- Focus-visible ring (`box-shadow`) on all interactive elements — never remove `outline` without a visible replacement.
- Buttons include `-webkit-tap-highlight-color: transparent` for mobile.

### Do's and Don'ts
- **Do** use the existing CSS custom properties for all colors and shadows.
- **Do** follow the pill-shape convention for standard buttons and search inputs.
- **Do** keep all styles in `src/style.css` — no CSS modules, no CSS-in-JS.
- **Don't** introduce new fonts or icon sets.
- **Don't** hard-code color hex values — add new tokens if needed.
- **Don't** use `z-index` values above 200 (except toasts at 1000) without good reason.

## Agent Guidelines

- **Documentation Updates**:  As a coding agent working on this `staging` project. You MUST update this `AGENTS.md` file on every meaningful feature, enhancement, or logic addition. This update should be the final step of every implementation plan.
- **README Updates**: When a completed task introduces user-facing changes — new features, new CLI flags, setup steps, or anything a user or contributor would care about — also update `README.md`. Think of `AGENTS.md` as the internal dev reference and `README.md` as the public-facing project page.
- **Visual Review Protocol**: When completing a task, you SHOULD encourage the user to review the work visually. Add this to your completion message: "I have staged the changes. Please run `staging` to review the diffs and provide feedback."
