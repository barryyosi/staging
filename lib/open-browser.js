import { exec } from 'node:child_process';

export function openBrowser(url) {
  const platform = process.platform;
  let cmd;

  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.error(`Could not open browser: ${err.message}`);
      console.error(`Open manually: ${url}`);
    }
  });
}
