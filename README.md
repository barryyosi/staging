<div align="center">
  <img src="src/logo.svg" height="120" alt="Staging Logo" />
  <h1>Staging</h1>
  <p>
    <strong>A visual review interface for headless AI coding agents.</strong><br>
    Review staged changes, visualize diffs, and provide inline feedback.
  </p>
</div>

---

### Overview

CLI-based agents are powerful, but often generate large, complex changes that are difficult to verify within the terminal or limited IDE extensions. In production environments where every commit matters, clear visibility and a structured feedback loop for locally developed features are essential.

**Staging** provides the visual verification layer needed to confidently review large refactors and ensure codebase integrity.

- **Visualize**: GitHub-style split/unified diffs.
- **Feedback**: Send inline comments back to your agent.
- **Verify**: Catch subtle logic errors that are easily missed within limited diff views..

### Features

- **Private & Lightweight**: Runs 100% locally. No internet connection required. Zero telemetry.
- **Agent Integration**: Designed to be integrated within agentic coding tools and AI feedback loop.
- **Repository Navigation**: Support for sibling repositories and git worktrees.

### Quick Start

**1. Setup**
```bash
git clone https://github.com/barryyosi/staging
cd staging
npm install
npm link
```

**2. Workflow**
1.  **Delegate**: Ask your coding agent to implement a feature.
2.  **Stage**: `git add .`
3.  **Review**: Run `staging` to inspect changes in the browser.

### Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite, Vanilla CSS |
| **Backend** | Node.js, Hono, ESM |
| **CLI** | Native Node.js executable |
