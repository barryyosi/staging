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

### Progress Ring
A circular SVG progress indicator in the header that replaces the text-based summary pill, showing visual completion feedback for the review flow. Uses collapsed state as a proxy for "reviewed" — when a file is collapsed, it's marked as reviewed. Clicking the ring toggles a stats popover showing addition/deletion line counts.

**Implementation:**
- `src/components/ProgressRing.jsx` — Three sub-components: `ProgressRing` (36px SVG circle with 3px stroke, animated via `stroke-dashoffset`), `StatsPopover` (pill showing `+N / -M` lines, auto-closes on outside click), `ProgressRingWithStats` (wrapper managing popover visibility).
- Progress calculated as `reviewedFiles.size / files.length`. SVG uses `var(--accent)` for fill stroke, `var(--border-1)` for track. Counter inside ring displays `reviewed/total` in 11px monospace.
- `src/App.jsx` — `reviewedFiles` state (Set of file paths), `handleFileReviewed(filePath, isReviewed)` callback that adds/removes from Set, cleared on project switch and reload. Passed as props to Header and DiffViewer.
- `src/components/DiffViewer.jsx` — `useEffect` hook calls `onFileReviewed(filePath, collapsed)` whenever `collapsed` state changes, reporting collapsed files as "reviewed" to parent.
- `src/style.css` — `.progress-ring-wrap`, `.progress-ring-btn` (36x36 transparent button with hover/focus states), `.progress-ring-svg`, `.progress-ring-fill` (0.3s transition on `stroke-dashoffset`), `.progress-ring-label` (11px monospace counter), `.stats-popover` (positioned below ring with scale-in animation).

**Edge cases:** 0 files shows "0/0", all reviewed shows full circle (100%), unreview (expand) decreases ring with backward animation, project switch resets to "0/N". All animations disabled via `@media (prefers-reduced-motion: reduce)`.

### Keyboard Shortcuts
Global keyboard shortcuts for navigation and actions, plus a `?` button in the header that opens a reference modal. Terminal-inspired aesthetic with `<kbd>` pill badges. Platform-aware (⌘ on Mac, Ctrl elsewhere).

**Shortcuts:**
- **Navigation:** `j` (next file), `k` (prev file), `gg` (first file, sequence with 1s timeout), `G` (last file)
- **Actions:** `x` (toggle collapse current file), `z` (collapse/expand all), `?` (show shortcuts modal)
- **Commit:** `Cmd/Ctrl+Enter` (open commit modal), `Esc` (close modal)

**Implementation:**
- `src/components/ShortcutsModal.jsx` — Modal overlay with three categories (Navigation, Actions, Commit), `<kbd>` tags styled as pills (6px radius, subtle border, `var(--bg-surface-2)` background). Platform detection via `navigator.platform`, displays `⌘` or `Ctrl` accordingly. Escape to close, overlay click to close.
- `src/components/Header.jsx` — `.btn-shortcuts` button (30x30 circular, `help` icon, matches `.theme-toggle` style) inserted before `.btn-collapse-all`. Accepts `onShowShortcuts` prop.
- `src/App.jsx` — `showShortcutsModal` state, lazy import for `ShortcutsModal`, callbacks for show/close. Global keyboard handler in `useEffect` listens to `keydown` events, checks if typing in input/textarea/contenteditable or if modal/form is open (disables shortcuts when true). Helper functions: `scrollToAdjacentFile(direction)` finds current file via `getBoundingClientRect` and scrolls to next/prev, `scrollToFile(position)` scrolls to first or last file, `toggleCurrentFileCollapse()` finds file in viewport center and clicks `.file-action-collapse` button.
- `src/style.css` — `.btn-shortcuts` matches `.theme-toggle` pattern (30x30, circular, transparent bg, hover reveals). `.modal-shortcuts` (520px width, wider than CommitModal), `.shortcuts-grid` (single column with gap), `.shortcut-category-title` (11px uppercase, muted), `.shortcut-row` (flex row), `.shortcut-key` (pill badge, 6px radius, `var(--bg-surface-2)` bg, subtle border, box-shadow), `.shortcut-then` (italic "then" label for `gg` sequence), `.shortcut-desc` (13px body text).

**Edge cases:** Shortcuts disabled when typing in form fields, rapid key presses prevented via early returns, `gg` sequence has 1s timeout (cleared on unmount), j/k at boundaries clamped to first/last file.

### Breadcrumb Truncation
Long project and branch names in the ProjectNavigator breadcrumb are truncated with ellipsis (`text-overflow: ellipsis`) and show full name in native `title` tooltip. Simple CSS-only change with minimal component updates.

**Implementation:**
- `src/components/ProjectNavigator.jsx` — Added `title={projectName}` attribute to project segment label (line 94), `title={branch}` to branch segment label (line 123). No other changes, dropdown functionality preserved.
- `src/style.css` — `.nav-segment-label` rule: `max-width: 160px`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`. Applied to both project and branch labels. Balances readability with header density.

**Edge cases:** Short names (<160px) show no ellipsis, very long names (>160px) truncated with "...", dropdown click works normally (clickable area unchanged).

### Loading & Transition Animations
Diff cards appear with a staggered entrance animation (fade + downward settle) for polished visual feedback. Project switching triggers a brief scale/fade transition signaling context change. All animations respect `prefers-reduced-motion` for accessibility.

**Implementation:**
- `@keyframes diff-card-enter` - 0.2s fade-in + translateY(4px→0), 40ms stagger per card
- `@keyframes project-switch` - 0.55s scale(0.985) + opacity(0.3) fade-out/in
- Applied via `.entering` class on mount (App.jsx) and `.switching` class on project switch
- CSS uses existing `--ease` easing, all motion disabled via `@media (prefers-reduced-motion: reduce)`

**CSS (src/style.css):**
- Card entrance keyframes and `.diff-file.entering` class after `.diff-file` base styles
- Project switch keyframes and `#diff-container.switching` class
- Accessibility media query disabling animations when motion is reduced

**Frontend:**
- `src/App.jsx` - `isSwitchingProject` state flag, updated `switchProject()` function with 550ms timeout, `.switching` class applied to `#diff-container`, `className="entering"` and `style={{ animationDelay }}` passed to each `DiffViewer`
- `src/components/DiffViewer.jsx` - Accepts `className` and `style` props, applies to root `.diff-file` div

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
- Filters files by fuzzy path match (powered by `fuzzysort`). Works in both views. Matched characters are highlighted in the file names. In tree view, shows matching files and their ancestor directories (all auto-expanded). Results in flat list view are sorted by match score.

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
Per-hunk action buttons rendered inside a dark floating pill that appears on hover over each hunk `<tbody>`.

**Backend:**
- `lib/git.js` exports `buildHunkPatch(gitRoot, filePath, chunkIndex, expectedOldStart)` (internal), `unstageHunk(gitRoot, filePath, chunkIndex, oldStart)`, and `revertHunk(gitRoot, filePath, chunkIndex, oldStart)`.
  - `buildHunkPatch` re-runs `git diff --cached` for the file, extracts the target chunk, cross-checks `oldStart` to detect stale diffs, and reconstructs a valid unified diff patch.
  - `unstageHunk` applies the patch in reverse to the index (`git apply --cached --reverse`).
  - `revertHunk` does the same plus applies in reverse to the working tree (`git apply --reverse`), discarding changes entirely.
- `lib/server.js` exposes `POST /api/hunk-unstage` and `POST /api/hunk-revert`, both accepting `{ filePath, chunkIndex, oldStart }`.

**Frontend:**
- `src/components/DiffViewer.jsx` — Diff table uses 4 columns: `line-action | line-num | line-content | line-hunk-actions`. The 4th column (`line-hunk-actions`) is `sticky; right: 0` and has zero width, serving as the anchor for the floating pill. `HunkHeader` renders `<HunkActions>` inside the 4th `<td>`. `HunkActions` wraps two buttons (revert, unstage) inside a `.hunk-action-pill` — a dark floating capsule with gradient background, glass border, and multi-layer shadow. It appears on `.hunk-tbody:hover` with a scale-pop animation (`scale(0.92) → scale(1)`). Revert button hover turns red. `DiffLine` renders an empty 4th `<td>`. `CommentForm` and `CommentBubble` use `colSpan="4"`.
- `src/App.jsx` — `handleUnstageHunk` and `handleRevertHunk` callbacks POST to the API, show a toast, and call `reloadDiffs()` on success. Both are passed as props to `<DiffViewer>`.
- `src/style.css` — `.line-hunk-actions` is sticky-right with background matching the row type (surface/hunk/add/del). `.hunk-action-pill` uses dark gradient, `border-radius: 100px`, and elevation shadows. `.hunk-action-btn` is 28px circular with light translucent bg on dark pill; revert hover uses red danger tint.

**Edge cases:** Stale diff detection via `oldStart` cross-check; handles added files (`--- /dev/null`) and deleted files (`+++ /dev/null`); file disappears from diff after last hunk action (handled by `reloadDiffs()`).

### File-Level Controls
Always-visible action buttons in the file card header: revert, unstage, and collapse chevron.

**Layout:** `[status] [path] [stats] ...auto-margin... [revert ↺] [unstage −] [collapse ∧]`

**Implementation:**
- `src/components/DiffViewer.jsx` — `.file-actions` contains three `.file-action-btn` buttons (revert, unstage, collapse). The collapse button uses `expand_less` icon with CSS rotation for collapsed state. No separate `onClick` — the click bubbles to the header's `toggleCollapse`.
- `src/style.css` — `.file-actions` has `margin-left: auto` (no longer hidden on hover). `.file-action-btn` is 26px circular, transparent bg, `var(--text-3)` icon color. Hover: `var(--bg-hover)` bg + `var(--text-1)` color. Revert hover uses red danger tint. Collapse chevron animates 180deg rotation via `transform: rotate()` with `0.2s var(--ease)` transition.

### Unstage All
A global "Unstage all" button centered below all diff cards that unstages every staged file at once.

**Backend:**
- `lib/git.js` exports `unstageAll(gitRoot)` — runs `git reset HEAD`, clears the summary cache.
- `lib/server.js` exposes `POST /api/unstage-all`.

**Frontend:**
- `src/App.jsx` — `handleUnstageAll` callback shows a `confirm()` dialog, POSTs to `/api/unstage-all`, shows a toast, and calls `reloadDiffs()` on success. The button is rendered after `loadedFiles.map(...)` when `loadedFiles.length > 0`, using `.btn .btn-secondary .btn-unstage-all` classes with a `remove` icon.
- `src/style.css` — `.btn-unstage-all` has `margin: 24px auto; display: flex; gap: 6px`.

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

### Comment Dismissal
Users can dismiss individual comments and all comments at once directly from the comment panel sidebar.

**Individual dismiss:**
- A small 20px circular X button (`panel-dismiss-btn`) on each `.panel-comment-item`, positioned absolute top-right.
- Hidden by default (`opacity: 0`), revealed on `.panel-comment-item:hover` — consistent with hover-reveal patterns used for hunk actions and inline comment buttons.
- Uses `close` Material Symbol at 14px. `e.stopPropagation()` prevents the parent click-to-scroll.
- Calls `onDeleteComment(id)` — same `deleteComment` function used by inline `CommentBubble` delete buttons.

**Dismiss all:**
- A muted uppercase text button (`panel-dismiss-all-btn`) in the panel header, right-aligned next to "COMMENTS (n)".
- `var(--text-3)` color, no background, hover → `var(--text-2)`.
- Shows `confirm()` dialog before clearing. Calls `deleteAllComments()` from `useComments` hook which sets `commentsByFile` to `{}`.

**Implementation:**
- `src/hooks/useComments.js` — exports `deleteAllComments` alongside existing functions.
- `src/App.jsx` — `handleDismissAllComments` callback with confirm dialog, passed as `onDismissAll` prop to `CommentPanel`. `handleDeleteComment` passed as `onDeleteComment`.
- `src/components/CommentPanel.jsx` — `.panel-header` div wraps `h2` + dismiss-all button. Each `.panel-comment-item` contains a `.panel-dismiss-btn`.
- `src/style.css` — `.panel-header` flex row, `.panel-dismiss-all-btn` minimal text button, `.panel-dismiss-btn` absolute-positioned circle with hover-reveal.

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

### Markdown/HTML Preview Viewer
Files with previewable extensions (`.md`, `.markdown`, `.html`, `.htm`) get a per-file "Diff | Preview" toggle in the file card header. Switching to Preview renders the full staged file content as formatted HTML, with selection-based commenting.

**Backend:**
- `lib/git.js` exports `getStagedFileContent(gitRoot, filePath)` — runs `git show :filePath` to get the staged version.
- `lib/server.js` exposes `GET /api/file-content?filePath=...` — returns `{ content: string }`.

**Frontend:**
- `src/utils/renderPreview.js` — `isPreviewable(filePath)` checks extensions; `renderPreview(content, filePath)` converts markdown via `marked` (GFM) or passes HTML through, then sanitizes with `DOMPurify`.
- `src/components/DiffViewer.jsx`:
  - **View mode toggle** — A `.view-mode-toggle` pill button (Diff | Preview) in the file header, only for previewable files. Uses the same sliding-thumb pattern as `FileSidebar`'s view toggle.
  - **Preview fetching** — On switching to preview mode, fetches `/api/file-content` once and caches the rendered HTML in component state. Resets on remount (after `reloadDiffs()`).
  - **`PreviewBody`** sub-component renders sanitized HTML via `dangerouslySetInnerHTML` inside `.preview-content`.
  - **Selection-based commenting** — On `mouseup`, detects text selection within the preview container, computes character offset relative to `textContent`, shows a floating `.preview-comment-btn` (pill with `add_comment` icon, scale-pop animation). Clicking opens a `PreviewCommentForm`.
  - **Text highlighting** — A `useEffect` walks text nodes via `TreeWalker`, wrapping commented ranges in `<mark class="preview-highlight" data-comment-id="...">`. Highlights are rebuilt from scratch when comments or HTML change.
  - **`PreviewCommentForm`** and **`PreviewCommentBubble`** — Div-based equivalents of `CommentForm`/`CommentBubble` (which are table-row-based). Reuse the same CSS classes for visual consistency.

**Comment model extension:**
- Preview comments use `lineType: 'preview'` with extra fields: `selectedText`, `textOffset`, `textLength`.
- `useComments.addComment` accepts an optional `extra = {}` spread parameter (backward-compatible).
- `App.jsx` has `handleAddPreviewComment(file, selectedText, textOffset, textLength)` and passes extra fields through `handleSubmitComment`.

**CommentPanel:**
- Preview comments show a `format_quote` icon + truncated selected text instead of "Line N".
- `scrollToComment` finds `<mark>` elements for preview comments, `.comment-row` for diff comments.

**Dependencies:** `marked` (markdown→HTML, GFM), `dompurify` (HTML sanitization).

### Expand Collapsed Context
GitHub-style expand buttons between diff hunks that reveal hidden context lines. When a diff has collapsed context between hunks (or before the first / after the last hunk), clickable expand rows let users progressively reveal the surrounding unchanged code.

**Backend:**
- `lib/git.js` exports `getStagedFileContent(gitRoot, filePath)` (shared with Preview Viewer), `countFileLines(content)`, and `attachTotalLines(gitRoot, files)`. `attachTotalLines` is called inside `getStagedDiffPage` and `getStagedDiff` to add `totalNewLines` to each non-binary file object — the total line count of the staged version.
- `lib/server.js` — `GET /api/file-content?filePath=...` is reused to fetch full staged file content on-demand (same endpoint as Preview Viewer).

**Frontend:**
- `src/utils/gapCalc.js` — `computeGaps(chunks, totalNewLines)` computes an array of gap objects `{ position, newStart, newEnd, oldStart, oldEnd, afterChunkIndex, lines }` for top, middle (between hunks), and bottom gaps. `buildContextChanges(rawLines, newStartLine, oldStartLine)` converts raw line strings into context change objects with proper `ln1`/`ln2`. Exports `EXPAND_STEP` (20 lines).
- `src/components/DiffViewer.jsx`:
  - **`ExpandRow`** — A `<tbody className="expand-tbody">` containing a single row with expand controls. For small gaps (≤ 20 lines): single "Expand all N lines" button with `unfold_more` icon. For large gaps (> 20 lines): three buttons — "Expand 20 ↓" (`expand_more`), "Expand all N" (`unfold_more`), "Expand 20 ↑" (`expand_less`).
  - **State** — `expandedGaps` stores per-gap data: `{ topLines, bottomLines, allLines, isLoading }`. `fileContentCache` ref caches fetched file content to avoid re-fetching on each expand click. Both are cleared when `file.chunks` changes (reload/unstage/revert).
  - **`handleExpand(gap, direction, count)`** — Fetches full file via `/api/file-content` (cached), slices the requested line range, converts to context change objects, and merges into `expandedGaps` state. Supports `'all'`, `'down'` (from top of gap), and `'up'` (from bottom of gap) directions.
  - **Rendering** — The table render loop interleaves chunks with gap sections via `gapsByAfterChunk` lookup map. Each gap renders: expanded topLines `<tbody>` → `ExpandRow` (if remaining lines) → expanded bottomLines `<tbody>`. Expanded lines are rendered as regular `DiffLine` components with full comment support (commentable, syntax-highlighted).
- `src/style.css` — `.diff-expand-row td` uses `var(--hunk-bg)` background with dashed borders. `.expand-controls` is a flex row of `.expand-btn` pill buttons (11px, `var(--hunk-text)` color, hover → `var(--text-1)` + `var(--bg-hover)`). `.expanded-context-tbody` lines use `var(--bg-surface)` background on sticky columns.

**Partial expansion:** Multiple clicks progressively fill the gap — "Expand 20 ↓" adds 20 lines from the top, "Expand 20 ↑" adds 20 from the bottom, and the remaining count updates. When fully expanded, the expand row disappears.

**Edge cases:** Added files (single hunk, typically no gaps). Deleted files (no new version, `totalNewLines` omitted). Binary files (no chunks, no gaps). Stale data after unstage/revert (cleared via `useEffect` on `file.chunks`).

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
