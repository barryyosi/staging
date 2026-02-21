# AGENTS.md

## Purpose
This is the internal quick guide for agents working on **Staging**.
Keep it concise and practical. Put deep implementation details in code comments or focused docs.

## Project Overview
**Staging** is a local CLI tool that opens a browser UI for reviewing staged Git changes, adding inline comments, and completing review actions before commit/push.

## Tech Stack
- Frontend: React 19, Vite, vanilla CSS
- Backend: Node.js, Hono, ESM modules
- Runtime: Node.js >= 18

## Key Paths
- `bin/staging.js`: CLI entry point
- `lib/config.js`: config defaults + merge logic
- `lib/git.js`: git wrappers and diff parsing
- `lib/server.js`: API routes + static serving
- `src/App.jsx`: top-level state + orchestration
- `src/components/DiffViewer.jsx`: core diff rendering/actions/comments
- `src/components/Header.jsx`: top toolbar actions
- `src/components/FileSidebar.jsx`: flat/tree navigator + search
- `src/hooks/useComments.js`: comment state and persistence
- `src/style.css`: global styles + theme tokens

## Development Commands
```bash
npm install      # install deps
npm run dev      # frontend dev server (HMR)
npm run build    # production build
npm start        # run CLI locally
npm run lint     # lint all JS/JSX
npm run lint:fix # lint with auto-fix
npm run format   # prettier format
```

## Architecture (Most Important)
- Keep all raw git operations in `lib/git.js`.
- Keep HTTP surface in `lib/server.js`; frontend should not shell out directly.
- Keep cross-cutting app state in `src/App.jsx`; keep presentational logic inside components.
- Keep comments and review interactions in reusable hooks/helpers rather than duplicating local state logic.

## High-Value API Routes
- `GET /api/diff`: staged diff payload (main data source)
- `GET /api/project-info`, `POST /api/switch-project`: repo/worktree navigation
- `GET /api/tracked-files`: sidebar "show all files"
- `GET /api/file-content`, `GET /api/raw-file`: preview/context loading
- `POST /api/file-unstage`, `POST /api/file-stage`, `POST /api/file-revert`
- `POST /api/hunk-unstage`, `POST /api/hunk-revert`
- `POST /api/unstage-all`
- `POST /api/send-comments`
- `POST /api/commit`, `POST /api/push`

## Feature Map (Where To Edit)
- Project/worktree navigation: `src/components/ProjectNavigator.jsx`, `src/App.jsx`, `lib/server.js`, `lib/git.js`
- Sidebar tree/search: `src/components/FileSidebar.jsx`, `src/utils/fileTree.js`, `lib/server.js`
- Diff actions (file/hunk stage/revert): `src/components/DiffViewer.jsx`, `lib/server.js`, `lib/git.js`
- Markdown/HTML preview: `src/utils/renderPreview.js`, `src/components/DiffViewer.jsx`, `lib/server.js`
- Collapsed-context expansion: `src/utils/gapCalc.js`, `src/components/DiffViewer.jsx`
- Comments + panel behavior: `src/hooks/useComments.js`, `src/components/CommentPanel.jsx`, `src/App.jsx`
- Send-to-agent mediums: `src/components/Header.jsx`, `src/App.jsx`, `lib/server.js`, `lib/config.js`

## Coding Conventions
- Prefer small, focused functions.
- Reuse hooks/helpers when logic appears more than once.
- Keep code self-explanatory with clear names.
- Use functional React components and hooks (no class components).
- Keep styling in `src/style.css` unless there is a strong reason not to.
- Remove dead code when replacing behavior; do not keep legacy paths "just in case".

## Linting and Formatting
- ESLint flat config in `eslint.config.js` (separate backend/frontend blocks).
- Prettier rules in `.prettierrc` (single quotes, trailing commas, 2-space indent).
- Husky + lint-staged run on commit.
- For intentionally unused params, prefix with `_`.

## UI Guardrails
- Use existing CSS tokens (`var(--...)`); avoid hard-coded colors.
- Keep existing visual language (monospace-first, minimal tooling aesthetic).
- Respect accessibility: focus-visible states, keyboard interaction, and `prefers-reduced-motion`.

## Typical Change Workflow
1. Add/update backend logic in `lib/` when needed.
2. Expose/adjust API route in `lib/server.js`.
3. Implement UI behavior in `src/`.
4. Run `npm run lint` (and targeted verification).
5. Validate end-to-end with `npm start`.

## Documentation Expectations
- Update `AGENTS.md` only for meaningful architectural or workflow changes.
- Update `README.md` for user-facing behavior, setup, or CLI/config changes.
- Keep both docs brief and current.
