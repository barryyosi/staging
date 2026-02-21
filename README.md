<div align="center">
  <img src="src/logo.svg" height="120" alt="Staging Logo" />
  <h1>Staging</h1>
  <p>
    <strong>A complementary code review tool for AI coding agents.</strong><br>
    Review staged changes, visualize diffs, and provide inline feedback—right in your browser.
  </p>
</div>

---

**Staging** It's the first Human-In-The-Loop (HITL) layer for modern AI-assisted development—a review checkpoint that plugs into the agents you already use.

AI coding agents like Claude Code, Gemini CLI, Roo Code, and others are great at generating code—but reviewing their output is a different story. Diffs in a terminal are hard to parse, and IDE diff viewers lack persistent review states and inline commenting. You end up squinting at changes and hoping nothing slipped through.

Staging gives you a dedicated, browser-based review interface with GitHub-style diffs and inline comments. Your agent makes the changes, Staging lets you actually review them before you commit.

## Features

- **Private & Lightweight**: Runs 100% locally. No internet connection required. Zero telemetry.
- **Multi-Project Support**: Navigate between sibling repositories and git worktrees
- **Inline Comments**: Add threaded comments directly on changed lines to guide agent refinements
- **Markdown/HTML Preview**: Toggle per-file between diff and rendered preview for `.md` and `.html` files, with selection-based commenting on the rendered output

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite, Lucide, Vanilla CSS |
| **Backend** | Node.js, Hono, ESM |
| **CLI** | Native Node.js executable |


## Quick Start

```bash
git clone https://github.com/barryyosi/staging
cd staging
npm install
npm link
```

Usage:
1. Stage changes: `git add [CHANGED_FILES]`
2. Run `staging`
3. Review at `http://localhost:3456`

## Agent Integration

Instruct your agent to run `staging` after making changes. Example (`.claude/CLAUDE.md`):

```markdown
After completing tasks:
1. `git add [CHANGED_FILES]`
2. Run `staging`
3. Wait for user review
```

## Configuration

Settings are read from `~/.stagingrc.json`, then `./.stagingrc.json`.

| Option | Default | Description |
| :--- | :--- | :--- |
| `agentCommand` | `"code -g {file}:1"` | Command to run after writing the review file. |
| `reviewFileName` | `".staging-review.md"` | Output file for agent feedback. |
| `sendMediums` | `["clipboard", "file"]` | Feedback mediums (`clipboard`, `file`, `cli`). |
| `diffContext` | `3` | Context lines around diffs. |
| `port` | `0` (random) | Local server port. |
| `autoOpen` | `true` | Auto-open browser on launch. |
