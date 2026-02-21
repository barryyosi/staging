import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as http from 'http';

let serverProcess: cp.ChildProcess | undefined;
let serverPort: number | undefined;
let panel: vscode.WebviewPanel | undefined;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Staging Server');

  context.subscriptions.push(
    vscode.commands.registerCommand('staging.openReview', () =>
      openStagingReview(context),
    ),
    vscode.commands.registerCommand('staging.restart', () =>
      restartServer(context),
    ),
  );

  // Sync theme when VS Code theme changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      if (panel) {
        const isDark = theme.kind === vscode.ColorThemeKind.Dark ||
          theme.kind === vscode.ColorThemeKind.HighContrast;
        panel.webview.postMessage({
          type: 'setTheme',
          theme: isDark ? 'dark' : 'light',
        });
      }
    }),
  );
}

async function openStagingReview(context: vscode.ExtensionContext) {
  // If panel already exists, reveal it
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage(
      'Staging: No workspace folder open.',
    );
    return;
  }

  // Start server if not already running
  if (!serverProcess || serverPort === undefined) {
    try {
      await startServer(workspaceRoot, context);
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Staging: Failed to start server — ${err.message}`,
      );
      return;
    }
  }

  createWebviewPanel(context);
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.uri.fsPath;
}

function findStagingCli(context: vscode.ExtensionContext): string {
  // The extension lives in vscode-staging/ inside the staging repo.
  // bin/staging.js is at ../bin/staging.js relative to the extension root.
  return path.resolve(context.extensionPath, '..', 'bin', 'staging.js');
}

function startServer(
  workspaceRoot: string,
  context: vscode.ExtensionContext,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const config = vscode.workspace.getConfiguration('staging');
    const port = config.get<number>('port', 0);
    const cliPath = findStagingCli(context);

    const args = [cliPath, workspaceRoot, '--no-open'];
    if (port > 0) {
      // The CLI uses config.port from its own config, but we pass port
      // via env or let the server auto-assign. For now, auto-assign.
    }

    outputChannel.appendLine(`Starting: node ${args.join(' ')}`);

    const proc = cp.spawn('node', args, {
      cwd: workspaceRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    serverProcess = proc;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Server did not start within 10 seconds'));
      }
    }, 10_000);

    proc.stdout!.on('data', (data: Buffer) => {
      const text = data.toString();
      outputChannel.appendLine(text.trimEnd());

      if (!resolved) {
        // Parse port from: "Staging review at http://127.0.0.1:<port>"
        const match = text.match(
          /Staging review at http:\/\/127\.0\.0\.1:(\d+)/,
        );
        if (match) {
          serverPort = parseInt(match[1], 10);
          resolved = true;
          clearTimeout(timeout);
          outputChannel.appendLine(`Server running on port ${serverPort}`);
          resolve();
        }
      }
    });

    proc.stderr!.on('data', (data: Buffer) => {
      outputChannel.appendLine(`[stderr] ${data.toString().trimEnd()}`);
    });

    proc.on('exit', (code) => {
      outputChannel.appendLine(`Server exited with code ${code}`);
      serverProcess = undefined;
      serverPort = undefined;
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      outputChannel.appendLine(`Server error: ${err.message}`);
      serverProcess = undefined;
      serverPort = undefined;
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

function createWebviewPanel(context: vscode.ExtensionContext) {
  const isDark =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
  const theme = isDark ? 'dark' : 'light';

  panel = vscode.window.createWebviewPanel(
    'stagingReview',
    'Staging Review',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  panel.webview.html = getWebviewHtml(serverPort!, theme);

  panel.onDidDispose(() => {
    panel = undefined;
  }, null, context.subscriptions);
}

function getWebviewHtml(port: number, theme: string): string {
  const src = `http://127.0.0.1:${port}?vscode=1&theme=${theme}`;

  return /* html */ `<!DOCTYPE html>
<html lang="en" style="margin:0;padding:0;height:100%;overflow:hidden;">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             frame-src http://127.0.0.1:*;
             script-src 'unsafe-inline';
             style-src 'unsafe-inline';">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    iframe { display: block; border: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <iframe id="staging-frame" src="${src}"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('staging-frame');

    // Forward theme messages from VS Code extension to the iframe
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'setTheme' && iframe.contentWindow) {
        iframe.contentWindow.postMessage(e.data, '*');
      }
    });
  </script>
</body>
</html>`;
}

async function restartServer(context: vscode.ExtensionContext) {
  await stopServer();

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Staging: No workspace folder open.');
    return;
  }

  try {
    await startServer(workspaceRoot, context);
    // Reload webview if open
    if (panel) {
      const isDark =
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
        vscode.window.activeColorTheme.kind ===
          vscode.ColorThemeKind.HighContrast;
      panel.webview.html = getWebviewHtml(
        serverPort!,
        isDark ? 'dark' : 'light',
      );
    }
    vscode.window.showInformationMessage('Staging: Server restarted.');
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Staging: Failed to restart server — ${err.message}`,
    );
  }
}

async function stopServer(): Promise<void> {
  if (serverProcess && serverPort) {
    // Try graceful shutdown via API first
    try {
      await httpPost(`http://127.0.0.1:${serverPort}/api/shutdown`);
    } catch {
      // Ignore — we'll kill the process below
    }
  }

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = undefined;
  }
  serverPort = undefined;
}

function httpPost(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST' }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
}

export function deactivate() {
  if (panel) {
    panel.dispose();
    panel = undefined;
  }

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = undefined;
  }
  serverPort = undefined;
}
