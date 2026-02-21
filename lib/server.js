import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { loadPreferences, savePreferences } from './config.js';
import {
  getStagedDiff,
  getStagedDiffPage,
  getStagedDiffSummary,
  commitChanges,
  clearSummaryCache,
  getCurrentBranch,
  discoverSiblingProjects,
  listWorktrees,
  getTrackedFiles,
  getUnstagedFiles,
  unstageHunk,
  revertHunk,
  stageFile,
  unstageFile,
  revertFile,
  unstageAll,
  getStagedFileContent,
  getStagedFileBuffer,
  getRemoteUrl,
  pushChanges,
} from './git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseIntQuery(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function startServer({
  gitRoot: initialGitRoot,
  config,
  onCliSend = null,
}) {
  let gitRoot = initialGitRoot;
  const publicDir = path.join(__dirname, '..', 'dist');
  const app = new Hono();

  // --- Middleware ---

  // CSRF Protection: Only allow requests from localhost
  app.use('*', async (c, next) => {
    const origin = c.req.header('Origin');
    const referer = c.req.header('Referer');

    const isLocal = (url) => {
      if (!url) return false;
      try {
        const u = new URL(url);
        return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
      } catch {
        return false;
      }
    };

    if (origin && !isLocal(origin)) {
      return c.text('Forbidden: Invalid Origin', 403);
    }
    if (!origin && referer && !isLocal(referer)) {
      // Some browsers don't send Origin for some requests, check Referer as fallback
      return c.text('Forbidden: Invalid Referer', 403);
    }

    await next();
  });

  const validatePath = (p) => {
    if (!p) return false;
    try {
      const absoluteGitRoot = path.resolve(gitRoot);
      const absolutePath = path.resolve(gitRoot, p);
      return absolutePath.startsWith(absoluteGitRoot);
    } catch {
      return false;
    }
  };

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
    const prefs = loadPreferences();
    return c.json({
      agentCommand: config.agentCommand,
      reviewFileName: config.reviewFileName,
      sendMediums: config.sendMediums,
      preferences: prefs,
    });
  });

  app.post('/api/preferences', async (c) => {
    try {
      const prefs = await c.req.json();
      const saved = savePreferences(prefs);
      return c.json({ success: true, preferences: saved });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  app.post('/api/send-comments', async (c) => {
    try {
      const { formatted, mediums = ['clipboard', 'file'] } = await c.req.json();
      let filePath = null;

      if (mediums.includes('file')) {
        const reviewPath = path.join(gitRoot, config.reviewFileName);
        fs.writeFileSync(reviewPath, formatted, 'utf-8');
        filePath = reviewPath;

        // Safer command execution: split command into arguments and replace placeholders
        // Note: Simple splitting on spaces, but handles placeholders as single arguments where possible
        const parts = config.agentCommand.split(/\s+/);
        const args = parts.map((part) =>
          part
            .replace(/\{file\}/g, reviewPath)
            .replace(/\{comments\}/g, formatted),
        );

        const command = args.shift();
        const proc = exec(
          [command, ...args].join(' '),
          { cwd: gitRoot },
          (err) => {
            if (err) {
              console.warn(`Agent command warning: ${err.message}`);
            }
          },
        );
      }

      if (mediums.includes('cli') && onCliSend) {
        onCliSend(formatted);
      }

      return c.json({ success: true, filePath });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  app.post('/api/commit', async (c) => {
    try {
      const { message, push } = await c.req.json();
      if (!message) {
        return c.json(
          { success: false, error: 'Commit message is required' },
          400,
        );
      }
      const output = commitChanges(gitRoot, message);
      let pushOutput = null;
      if (push) {
        pushOutput = pushChanges(gitRoot);
      }
      return c.json({ success: true, output, pushOutput });
    } catch (err) {
      return c.json({ success: false, error: err.stderr || err.message }, 500);
    }
  });

  app.post('/api/push', async (c) => {
    try {
      const output = pushChanges(gitRoot);
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
      const remoteUrl = getRemoteUrl(gitRoot);
      return c.json({
        projectName,
        branch,
        gitRoot,
        projects,
        worktrees,
        remoteUrl,
      });
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
      const remoteUrl = getRemoteUrl(gitRoot);
      return c.json({
        projectName,
        branch,
        gitRoot,
        projects,
        worktrees,
        remoteUrl,
      });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.get('/api/tracked-files', (c) => {
    try {
      const files = getTrackedFiles(gitRoot);
      return c.json({ files });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.get('/api/unstaged-files', (c) => {
    try {
      const files = getUnstagedFiles(gitRoot);
      return c.json({ files });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.get('/api/file-content', (c) => {
    try {
      const filePath = c.req.query('filePath');
      if (!filePath) {
        return c.json({ error: 'filePath query parameter is required' }, 400);
      }
      if (!validatePath(filePath)) {
        return c.json({ error: 'Invalid file path' }, 403);
      }
      const content = getStagedFileContent(gitRoot, filePath);
      return c.json({ content });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.get('/api/raw-file', (c) => {
    try {
      const filePath = c.req.query('filePath');
      if (!filePath) {
        return c.json({ error: 'filePath query parameter is required' }, 400);
      }
      if (!validatePath(filePath)) {
        return c.json({ error: 'Invalid file path' }, 403);
      }
      const buffer = getStagedFileBuffer(gitRoot, filePath);
      const ext = path.extname(filePath).toLowerCase();

      let contentType = 'application/octet-stream';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      else if (ext === '.webp') contentType = 'image/webp';

      return c.body(buffer, 200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.post('/api/file-unstage', async (c) => {
    try {
      const { filePath } = await c.req.json();
      unstageFile(gitRoot, filePath);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  app.post('/api/file-stage', async (c) => {
    try {
      const { filePath, fromPath = null } = await c.req.json();
      if (!filePath) {
        return c.json({ success: false, error: 'filePath is required' }, 400);
      }
      stageFile(gitRoot, filePath, fromPath);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  app.post('/api/file-revert', async (c) => {
    try {
      const { filePath } = await c.req.json();
      revertFile(gitRoot, filePath);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  app.post('/api/hunk-unstage', async (c) => {
    try {
      const { filePath, chunkIndex, oldStart } = await c.req.json();
      unstageHunk(gitRoot, filePath, chunkIndex, oldStart);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  app.post('/api/hunk-revert', async (c) => {
    try {
      const { filePath, chunkIndex, oldStart } = await c.req.json();
      revertHunk(gitRoot, filePath, chunkIndex, oldStart);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  app.post('/api/unstage-all', (c) => {
    try {
      unstageAll(gitRoot);
      return c.json({ success: true });
    } catch (err) {
      return c.json({ success: false, error: err.message }, 500);
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
    }),
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
      server = serve({ fetch: app.fetch, port, hostname: host }, callback);
      return server;
    },
  };
}
