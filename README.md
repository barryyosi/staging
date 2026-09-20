<div align="center">
  <img src="src/logo.svg" height="120" alt="Staging Logo" />
  <h1>Staging</h1>
  <p><strong>Review your coding agent's changes in the browser. Comment inline. Send the feedback back.</strong></p>
</div>

---

Staging is a local CLI that opens a GitHub-style review of a repository's staged changes. You read the diff, leave comments on lines, and send them to your agent as a review file, the clipboard, or plain stdout. Nothing leaves your machine.

## The loop

1. The agent edits and stages files.
2. You run `staging` and review the diff in the browser.
3. You comment on lines, tick files as reviewed, stage or revert hunks.
4. You hit **Send**. The agent reads the review and fixes. Repeat.

## Install

```bash
git clone https://github.com/barryyosi/staging
cd staging
npm install
npm link
```

There is no npm package. When `main` moves ahead, the app offers to update itself.

## What you get

- **Inline comments** on a line or a dragged range, with the file and line numbers the agent needs.
- **Git actions** without leaving the review: stage, unstage or revert per file or hunk, then commit and push.
- **Branch and PR review**: compare against a base branch, or the open pull request via `gh`, `glab` or `az`.
- **Rendered preview** for markdown and HTML, with comments on rendered blocks, and an in-place editor.
- **Review state that survives a reopen**: reviewed marks and comments are kept per repository. Each comment reaches the agent once. A comment whose file changed since is set aside as addressed.
- **Multi-repo**: switch between sibling repositories and worktrees from the header.
- **Standalone preview**: `staging README.md` renders a file with live reload. No git repo needed.
- **VS Code extension** in [`vscode-staging/`](vscode-staging) opens the review from the Source Control view.

## CLI

| Command | Does |
| :--- | :--- |
| `staging` | Review the staged changes of the current repository. |
| `staging --base main` | Review everything the branch adds on top of `main`, committed and staged. |
| `staging --pr` | Same, against the open pull request's target branch. |
| `staging path/to/file.md` | Render one markdown or HTML file, with comments. |
| `staging --no-open` | Start the server without opening a browser. |

## Agent integration

Tell your agent to run `staging` after it finishes a task. Example for `.claude/CLAUDE.md`:

```markdown
After completing a task:
1. `git add <changed files>`
2. Run `staging`
3. Wait for the review, then address every comment.
```

With `"sendMediums": ["cli"]`, `staging` prints the review to stdout and exits when you press Send, so an agent that runs it gets the feedback as command output.

## Configuration

Read from `~/.stagingrc.json`, then `./.stagingrc.json`.

| Option | Default | Description |
| :--- | :--- | :--- |
| `sendMediums` | `["clipboard", "file"]` | Where a send goes: `clipboard`, `file`, `cli`. |
| `reviewFileName` | `".staging-review.md"` | Review file written on send. |
| `agentCommand` | `"code -g {file}:1"` | Command run after the review file is written. |
| `baseBranch` | `null` | Compare against this branch on launch. |
| `detectPullRequest` | `true` | Look up the branch's open pull request through the platform CLI. |
| `basePullRequest` | `false` | Default the compare base to that request's target, like `--pr`. |
| `pullRequestProvider` | `null` | Force `"github"`, `"gitlab"` or `"azure"` for self-hosted remotes. |
| `diffContext` | `3` | Context lines around hunks. |
| `port` | `0` (random) | Local server port. |
| `autoOpen` | `true` | Open the browser on launch. |

Review state lives under `~/.staging-reviews/`. Set `STAGING_STATE_DIR` to move it.
