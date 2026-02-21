'use strict';
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function') {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, 'default', { value: mod, enumerable: true })
      : target,
    mod,
  )
);
var __toCommonJS = (mod) =>
  __copyProps(__defProp({}, '__esModule', { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate,
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require('vscode'));
var cp = __toESM(require('child_process'));
var path = __toESM(require('path'));
var http = __toESM(require('http'));
var serverProcess;
var serverPort;
var panel;
var outputChannel;
function activate(context) {
  outputChannel = vscode.window.createOutputChannel('Staging Server');
  context.subscriptions.push(
    vscode.commands.registerCommand('staging.openReview', () =>
      openStagingReview(context),
    ),
    vscode.commands.registerCommand('staging.restart', () =>
      restartServer(context),
    ),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      if (panel) {
        const isDark =
          theme.kind === vscode.ColorThemeKind.Dark ||
          theme.kind === vscode.ColorThemeKind.HighContrast;
        panel.webview.postMessage({
          type: 'setTheme',
          theme: isDark ? 'dark' : 'light',
        });
      }
    }),
  );
}
async function openStagingReview(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Staging: No workspace folder open.');
    return;
  }
  if (!serverProcess || serverPort === void 0) {
    try {
      await startServer(workspaceRoot, context);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Staging: Failed to start server \u2014 ${err.message}`,
      );
      return;
    }
  }
  createWebviewPanel(context);
}
function getWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  return folders?.[0]?.uri.fsPath;
}
function findStagingCli(context) {
  return path.resolve(context.extensionPath, '..', 'bin', 'staging.js');
}
function startServer(workspaceRoot, context) {
  return new Promise((resolve2, reject) => {
    const config = vscode.workspace.getConfiguration('staging');
    const port = config.get('port', 0);
    const cliPath = findStagingCli(context);
    const args = [cliPath, workspaceRoot, '--no-open'];
    if (port > 0) {
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
    }, 1e4);
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      outputChannel.appendLine(text.trimEnd());
      if (!resolved) {
        const match = text.match(
          /Staging review at http:\/\/127\.0\.0\.1:(\d+)/,
        );
        if (match) {
          serverPort = parseInt(match[1], 10);
          resolved = true;
          clearTimeout(timeout);
          outputChannel.appendLine(`Server running on port ${serverPort}`);
          resolve2();
        }
      }
    });
    proc.stderr.on('data', (data) => {
      outputChannel.appendLine(`[stderr] ${data.toString().trimEnd()}`);
    });
    proc.on('exit', (code) => {
      outputChannel.appendLine(`Server exited with code ${code}`);
      serverProcess = void 0;
      serverPort = void 0;
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
    proc.on('error', (err) => {
      outputChannel.appendLine(`Server error: ${err.message}`);
      serverProcess = void 0;
      serverPort = void 0;
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}
function createWebviewPanel(context) {
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
  panel.webview.html = getWebviewHtml(serverPort, theme);
  panel.onDidDispose(
    () => {
      panel = void 0;
    },
    null,
    context.subscriptions,
  );
}
function getWebviewHtml(port, theme) {
  const src = `http://127.0.0.1:${port}?vscode=1&theme=${theme}`;
  return (
    /* html */
    `<!DOCTYPE html>
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
</html>`
  );
}
async function restartServer(context) {
  await stopServer();
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Staging: No workspace folder open.');
    return;
  }
  try {
    await startServer(workspaceRoot, context);
    if (panel) {
      const isDark =
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
        vscode.window.activeColorTheme.kind ===
          vscode.ColorThemeKind.HighContrast;
      panel.webview.html = getWebviewHtml(
        serverPort,
        isDark ? 'dark' : 'light',
      );
    }
    vscode.window.showInformationMessage('Staging: Server restarted.');
  } catch (err) {
    vscode.window.showErrorMessage(
      `Staging: Failed to restart server \u2014 ${err.message}`,
    );
  }
}
async function stopServer() {
  if (serverProcess && serverPort) {
    try {
      await httpPost(`http://127.0.0.1:${serverPort}/api/shutdown`);
    } catch {}
  }
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = void 0;
  }
  serverPort = void 0;
}
function httpPost(url) {
  return new Promise((resolve2, reject) => {
    const req = http.request(url, { method: 'POST' }, (res) => {
      res.resume();
      res.on('end', resolve2);
    });
    req.on('error', reject);
    req.setTimeout(2e3, () => {
      req.destroy();
      resolve2();
    });
    req.end();
  });
}
function deactivate() {
  if (panel) {
    panel.dispose();
    panel = void 0;
  }
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = void 0;
  }
  serverPort = void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 &&
  (module.exports = {
    activate,
    deactivate,
  });
//# sourceMappingURL=extension.js.map
