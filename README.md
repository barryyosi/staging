<div align="center">
  <img src="src/logo.svg" height="120" alt="Staging Logo" />
  <h1>Staging</h1>
  <p>
    <strong>A visual review interface for headless AI coding agents.</strong><br>
    Review staged changes, visualize diffs, and provide inline feedback.
  </p>
</div>

---

**Staging** is a complementary tool designed to enhance agentic coding workflows by providing visual diff review capabilities that terminal-based and IDE-constrained AI coding tools currently lack.

Modern AI coding agents (Claude Code, Gemini CLI, Cursor, and similar tools) excel at generating code changes, but reviewing those changes often happens in limited environments:
- **CLI agents** display diffs in the terminal, making it difficult to review multi-file refactors
- **VSCode extensions** are constrained by the IDE's diff viewer, which lacks persistent review states and inline commenting

Staging fills this gap by launching a dedicated browser-based review interface with GitHub-style diffs, inline comments, and comprehensive change visualization—bridging the final step between AI-generated code and confident commits.

## Features

- **Private & Lightweight**: Runs 100% locally. No internet connection required. Zero telemetry.
- **Multi-Project Support**: Navigate between sibling repositories and git worktrees
- **Inline Comments**: Add threaded comments directly on changed lines to guide agent refinements
- **Markdown/HTML Preview**: Toggle per-file between diff and rendered preview for `.md` and `.html` files, with selection-based commenting on the rendered output



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
