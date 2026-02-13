const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getStagedDiff, getStagedDiffPage, getStagedDiffSummary, commitChanges } = require('./git');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseIntQuery(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function startServer({ gitRoot, config }) {
  const publicDir = path.join(__dirname, '..', 'dist');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // API routes
    if (pathname === '/api/diff' && req.method === 'GET') {
      try {
        const mode = url.searchParams.get('mode');

        if (mode === 'summary') {
          const summary = getStagedDiffSummary(gitRoot, { refresh: true });
          jsonResponse(res, 200, { gitRoot, ...summary });
          return;
        }

        if (mode === 'page') {
          const offset = parseIntQuery(url.searchParams.get('offset'), 0);
          const limit = parseIntQuery(url.searchParams.get('limit'), 40);
          const page = getStagedDiffPage(gitRoot, {
            contextLines: config.diffContext,
            offset,
            limit,
          });
          jsonResponse(res, 200, { gitRoot, ...page });
          return;
        }

        const fullDiff = getStagedDiff(gitRoot, config.diffContext);
        jsonResponse(res, 200, { gitRoot, ...fullDiff });
      } catch (err) {
        jsonResponse(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === '/api/config' && req.method === 'GET') {
      jsonResponse(res, 200, {
        agentCommand: config.agentCommand,
        reviewFileName: config.reviewFileName,
      });
      return;
    }

    if (pathname === '/api/send-comments' && req.method === 'POST') {
      try {
        const { formatted } = await parseBody(req);
        const reviewPath = path.join(gitRoot, config.reviewFileName);
        fs.writeFileSync(reviewPath, formatted, 'utf-8');

        // Execute configured agent command
        const cmd = config.agentCommand
          .replace(/\{file\}/g, reviewPath)
          .replace(/\{comments\}/g, formatted);

        exec(cmd, { cwd: gitRoot }, (err) => {
          if (err) {
            console.warn(`Agent command warning: ${err.message}`);
          }
        });

        jsonResponse(res, 200, { success: true, filePath: reviewPath });
      } catch (err) {
        jsonResponse(res, 500, { success: false, error: err.message });
      }
      return;
    }

    if (pathname === '/api/commit' && req.method === 'POST') {
      try {
        const { message } = await parseBody(req);
        if (!message) {
          jsonResponse(res, 400, { success: false, error: 'Commit message is required' });
          return;
        }
        const output = commitChanges(gitRoot, message);
        jsonResponse(res, 200, { success: true, output });
      } catch (err) {
        jsonResponse(res, 500, { success: false, error: err.stderr || err.message });
      }
      return;
    }

    if (pathname === '/api/shutdown' && req.method === 'POST') {
      jsonResponse(res, 200, { success: true });
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 100);
      return;
    }

    // Static file serving
    let filePath;
    if (pathname === '/') {
      filePath = path.join(publicDir, 'index.html');
    } else {
      filePath = path.join(publicDir, path.normalize(pathname));
    }

    // Path traversal protection
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });

  return server;
}

module.exports = { startServer };
