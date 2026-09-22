<div align="center">
  <img src="src/logo.svg" height="120" alt="Staging Logo" />
  <h1>Staging</h1>
  <p><strong>Pull-request style review of your AI agent's work, with the agent in the loop.</strong></p>
</div>

---

Coding agents produce diffs faster than a terminal lets you read them. Staging opens them in a local, GitHub-style review: the staged changes, a whole branch, or the open pull request. Read, comment on the lines that need work, hit **Send**. The agent picks up the review and fixes. It also renders a standalone markdown or HTML file with the same inline comments.

Runs on your machine. Nothing leaves it.

## Install

```bash
git clone https://github.com/barryyosi/staging && cd staging
npm install && npm link
```

## Use

```bash
staging                 # review what is staged
staging --base main     # review the whole branch against main
staging --pr            # review the open pull request
staging notes.md        # preview one markdown / html file
```

## Features

- Inline comments on lines and ranges. Each one reaches the agent once.
- Stage, unstage, revert per hunk. Commit and push.
- Markdown and HTML preview, with comments on the rendered page.
- Review state survives a reopen.
- Switch between sibling repos and worktrees.
- VS Code extension in [`vscode-staging/`](vscode-staging).

## Agent setup

Add to your agent's instructions (e.g. `CLAUDE.md`):

```markdown
After a task: `git add` the changes, run `staging`, address the review.
```

## Config

`~/.stagingrc.json`, overridden by `./.stagingrc.json`.

| Option | Default | |
| :--- | :--- | :--- |
| `sendMediums` | `["clipboard", "file"]` | `cli` prints the review to stdout and exits |
| `reviewFileName` | `.staging-review.md` | |
| `agentCommand` | `code -g {file}:1` | runs after the review file is written |
| `baseBranch` | `null` | |
| `detectPullRequest` | `true` | via `gh`, `glab` or `az` |
| `basePullRequest` | `false` | same as `--pr` |
| `pullRequestProvider` | `null` | `github`, `gitlab`, `azure` |
| `diffContext` | `3` | |
| `port` | `0` | random |
| `autoOpen` | `true` | |
