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
- `lib/pull-requests.js`: open pull/merge request lookup through platform CLIs (`gh`, `glab`, `az`)
- `lib/server.js`: API routes + static serving
- `src/App.jsx`: top-level state + orchestration
- `src/components/DiffViewer.jsx`: core diff rendering/actions/comments
- `src/components/Header.jsx`: top toolbar actions
- `src/components/FileSidebar.jsx`: flat/tree navigator + search
- `src/hooks/useComments.js`: comment state and persistence
- `lib/review-state.js`: on-disk review state (comments, reviewed marks), one file per project under `~/.staging-reviews/`
- `src/utils/reviewStorage.js`: the client side of that state, the comment lifecycle (pending → sent → file changed) and how staleness is decided
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
- Keep all raw git operations in `lib/git.js`; platform CLI calls (`gh`, `glab`, `az`) stay in `lib/pull-requests.js`. The only network activity is git talking to the remote (update check, push, pull) and those CLIs talking to their platform; keep it that way and keep each such call opt-out via config.
- Keep HTTP surface in `lib/server.js`; frontend should not shell out directly.
- Keep cross-cutting app state in `src/App.jsx`; keep presentational logic inside components.
- Keep comments and review interactions in reusable hooks/helpers rather than duplicating local state logic.

## High-Value API Routes
- `GET /api/diff`: staged diff payload (main data source); `?base=<branch>` compares the index against the merge-base with that branch instead of `HEAD` (400 with `code: 'INVALID_BASE'` for a bad ref)
- `GET /api/project-info`, `POST /api/switch-project`: repo/worktree navigation, plus `branches` and the suggested `defaultBase`
- `GET /api/pull-request`: the open request for the current branch (`{ enabled, pullRequest }`), fetched separately because the CLI can be slow
- `GET /api/tracked-files`: sidebar "show all files"
- `GET /api/file-content`, `GET /api/raw-file`: preview/context loading
- `POST /api/file-unstage`, `POST /api/file-stage`, `POST /api/file-revert`
- `GET /api/review-state?key=<root>`, `PUT /api/review-state`: the current project's persisted comments and reviewed marks (409 for any other key)
- `POST /api/edit-line`, `POST /api/file-write`: replace one line / the whole staged copy of a file (the document itself in preview mode); both refuse when the working tree has unstaged changes to it
- `POST /api/hunk-unstage`, `POST /api/hunk-revert`
- `POST /api/unstage-all`
- `POST /api/send-comments`
- `POST /api/commit`, `POST /api/push`

## Feature Map (Where To Edit)
- Project/worktree navigation: `src/components/ProjectNavigator.jsx`, `src/App.jsx`, `lib/server.js`, `lib/git.js`
- Compare against a base branch: `src/components/ProjectNavigator.jsx` (picker), `src/App.jsx` (`compareBase`, hides index-only actions), `lib/git.js` (`resolveCompareBase`), `bin/staging.js` (`--base`)
- Pull request detection: `lib/pull-requests.js` (one `PROVIDERS` entry per platform), `lib/server.js` (`/api/pull-request`), `src/App.jsx` (selects the target only with `--pr` / `basePullRequest`, and never over an explicit base), `bin/staging.js` (`--pr`), `src/utils/format.js` (names the request in the handoff)
- Sidebar tree/search: `src/components/FileSidebar.jsx`, `src/utils/fileTree.js`, `lib/server.js`
- Diff actions (file/hunk stage/revert): `src/components/DiffViewer.jsx`, `lib/server.js`, `lib/git.js`
- Markdown/HTML preview: `src/utils/renderPreview.js`, `src/components/PreviewBody.jsx`, `src/components/DiffViewer.jsx`, `src/PreviewApp.jsx`, `lib/server.js`
- Preview copy/edit actions: `src/components/FileEditor.jsx`, `src/utils/fileContent.js`, `lib/git.js` (`writeStagedFile`), `lib/server.js` (`/api/file-write`)
- Preview comment anchoring: `src/utils/anchorComments.js`, `src/components/PreviewBody.jsx`
- Collapsed-context expansion: `src/utils/gapCalc.js`, `src/components/DiffViewer.jsx`
- Comments + panel behavior: `src/hooks/useComments.js`, `src/components/CommentPanel.jsx`, `src/App.jsx`
- Review state across sessions (persisted comments, stale comments, reviewed marks): `lib/review-state.js` + `lib/server.js` (`/api/review-state`, one JSON file per project), `src/utils/reviewStorage.js` (client + fingerprint checks), `src/hooks/useProjectStore.js` (per-project state mirrored to the server), `lib/git.js` (`parseRawDiffOutput` supplies each summary file's `fingerprint`)
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

## Releasing (Every Merge To Main Ships)
- The in-app update prompt installs `origin/main` directly, so every merge to `main` is a release. There is no separate release step.
- Any change under `src/`, `lib/` or `bin/` must bump `version` in `package.json` (and `package-lock.json`) and add a dated `## x.y.z - YYYY-MM-DD` entry at the top of `CHANGELOG.md`. Features bump minor, fixes bump patch. Never leave an `Unreleased` section.
- `npm run check:release` enforces this against `origin/main`. Run it before every push; wire it into `.husky/pre-push` (`git fetch --quiet origin main && node scripts/check-release.mjs --against origin/main`) so a push cannot ship code without a release entry. The `Release check` workflow (`.github/workflows/release-check.yml`) runs the same script on every pull request to `main`, with no third-party actions and a read-only token. Do not bypass hooks to push.

## Documentation Expectations
- Update `AGENTS.md` only for meaningful architectural or workflow changes.
- Update `README.md` for user-facing behavior, setup, or CLI/config changes.
- Keep both docs brief and current.
