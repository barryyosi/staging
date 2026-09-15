# Changelog

## 0.5.0 - 2026-09-15

### Features
- Detect the open pull or merge request for the checked-out branch through the platform CLI already signed in on the machine (`gh`, `glab`, `az repos`) and default the review to its target branch, so the agent receives a review of the request itself. The compare picker shows the request, links to it, and the handoff names it. Opt out with `detectPullRequest: false`; force a platform for self-hosted remotes with `pullRequestProvider`.

## 0.4.0 - 2026-09-15

### Features
- Compare the review against a base branch: pick one from the header, pass `--base <branch>`, or set `baseBranch` in `.stagingrc.json`. The diff then covers everything the branch adds on top of its merge-base with that branch, committed and staged alike.

## 0.3.0 - 2026-09-06

### Features
- Side-by-side (split) diff layout with a global toggle.
- Standalone markdown and HTML file preview mode.
- Inline block comments in markdown previews, anchored to source lines, in both the diff view and the standalone preview.
- Drag the `+` gutter button to comment on a range of lines. Ranges are sent to the agent as `Lines a-b`.

### Fixes
- The update prompt shows the commit behind each version and how many commits are new, so it can no longer read "v0.2.0 → v0.2.0" when the version number was not bumped.
- The update prompt lists every changelog entry since the running version, and falls back to the new commits when the changelog has no entry for them.
- A checkout that was updated but not restarted now asks for a restart instead of reporting up to date.
- Preview comments send the agent their current line after a live reload instead of a stale one.
- Clipboard sends stay inside the click gesture (Safari) and report a refused write instead of claiming success.
- The block comment button in previews is reachable and clickable; reopening an open block form keeps its draft.
- Hunk actions are preserved for deletion-only rows in split view.

## 0.2.0 - 2026-03-21

### Features
- Open a "What's New" modal as soon as Staging detects a newer version on `origin/main`.
- Show the current version, the available version, and the latest feature highlights before the user updates.

### Fixes
- Keep update prompts tied to the remote changelog so the modal describes the version that will actually be installed.
- Let users dismiss the update prompt without losing access to it by reopening it from the header update indicator.

## 0.1.0 - 2026-03-20

### Features
- Initial release of Staging with staged diff review, inline comments, and agent handoff flows.

### Fixes
- First public release.
