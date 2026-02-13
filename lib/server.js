import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getStagedDiff, getStagedDiffPage, getStagedDiffSummary, commitChanges, clearSummaryCache, getCurrentBranch, discoverSiblingProjects, listWorktrees } from './git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseIntQuery(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function startServer({ gitRoot: initialGitRoot, config }) {
  let gitRoot = initialGitRoot;
  const publicDir = path.join(__dirname, '..', 'dist');
  const app = new Hono();

  // --- API routes ---

  app.get('/api/diff', (c) => {
    try {
      const mode = c.req.query('mode');

      if (mode === 'summary') {
        const summary = getStagedDiffSummary(gitRoot, { refresh: true });
        return c.json({ gitRoot, ...summary });
      }

      if (mode === 'page') {
        const offset = parseIntQuery(c.req.query('offset'), 0);
        const limit = parseIntQuery(c.req.query('limit'), 40);
        const page = getStagedDiffPage(gitRoot, {
          contextLines: config.diffContext,
          offset,
          limit,
        });
        return c.json({ gitRoot, ...page });
      }

      const fullDiff = getStagedDiff(gitRoot, config.diffContext);
      return c.json({ gitRoot, ...fullDiff });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.get('/api/config', (c) => {
    return c.json({
      agentCommand: config.agentCommand,
      reviewFileName: config.reviewFileName,
    });
  });

  app.post('/api/send-comments', async (c) => {
    try {
      const { formatted } = await c.req.json();
      const reviewPath = path.join(gitRoot, config.reviewFileName);
      fs.writeFileSync(reviewPath, formatted, 'utf-8');

      const cmd = config.agentCommand
        .replace(/\{file\}/g, reviewPath)
        .replace(/\{comments\}/g, formatted);

      exec(cmd, { cwd: gitRoot }, (err) => {
        if (err) {
          console.warn(`Agent command warning: ${err.message}`);
        }
      });

      return c.json({ success: true, filePath: reviewPath });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  app.post('/api/commit', async (c) => {
    try {
      const { message } = await c.req.json();
      if (!message) {
        return c.json({ success: false, error: 'Commit message is required' }, 400);
      }
      const output = commitChanges(gitRoot, message);
      return c.json({ success: true, output });
    } catch (err) {
      return c.json({ success: false, error: err.stderr || err.message }, 500);
    }
  });

  app.get('/api/project-info', (c) => {
    try {
      const projectName = path.basename(gitRoot);
      const branch = getCurrentBranch(gitRoot);
      const projects = discoverSiblingProjects(gitRoot);
      const worktrees = listWorktrees(gitRoot);
      return c.json({ projectName, branch, gitRoot, projects, worktrees });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.post('/api/switch-project', async (c) => {
    try {
      const { path: targetPath } = await c.req.json();
      if (!targetPath) {
        return c.json({ error: 'path is required' }, 400);
      }

      const gitDir = path.join(targetPath, '.git');
      if (!fs.existsSync(gitDir) && !fs.existsSync(targetPath + '/.git')) {
        return c.json({ error: 'Not a git repository' }, 400);
      }

      clearSummaryCache();
      gitRoot = targetPath;

      const projectName = path.basename(gitRoot);
      const branch = getCurrentBranch(gitRoot);
      const projects = discoverSiblingProjects(gitRoot);
      const worktrees = listWorktrees(gitRoot);
      return c.json({ projectName, branch, gitRoot, projects, worktrees });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.post('/api/shutdown', (c) => {
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 100);
    return c.json({ success: true });
  });

  // --- Static file serving ---

  app.use(
    '/*',
    serveStatic({
      root: publicDir,
      rewriteRequestPath: (p) => p,
      index: 'index.html',
    })
  );

  // SPA fallback — serve index.html for unmatched routes
  app.notFound((c) => {
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf-8');
      return c.html(html);
    }
    return c.text('Not found', 404);
  });

  // Store server reference for shutdown route
  let server;

  return {
    listen(port, host, callback) {
      server = serve(
        { fetch: app.fetch, port, hostname: host },
        callback,
      );
      return server;
    },
  };
}
