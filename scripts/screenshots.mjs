// README screenshots of the built desktop app (Windows). Usage, after a release build and with MarkType closed:
//   node scripts/screenshots.mjs
// Launches target/release/marktype.exe with a temporary config folder (the user's settings are never
// touched) on a small demo folder, and saves PNGs (1280×800) to docs/screenshots/.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PORT = 9334;
const WIDTH = 1280;
const HEIGHT = 800;
const root = resolve(import.meta.dirname, '..');
const exe = join(root, 'target', 'release', 'marktype.exe');
const outDir = join(root, 'docs', 'screenshots');
const work = mkdtempSync(join(tmpdir(), 'mt shots '));
const configDir = join(work, 'config');
const notes = join(work, 'Notes');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEMO = `# Project notes

MarkType shows **formatting** as you type: *emphasis*, \`inline code\`, ==highlights== and
[links](https://github.com/follen99/MarkType). The Markdown syntax appears only where the cursor is.

## This week

- [x] Draft the release notes
- [x] Review the new themes
- [ ] Record a short demo

| Task | Owner | Status |
|:-----|:-----:|-------:|
| Export to PDF | Anna | Done |
| Recent folders | Marco | Done |
| Screenshots | Giulia | In progress |

## Code

\`\`\`js
function greet(name) {
  // Syntax highlighting for 100+ languages
  return \`Hello, \${name}!\`;
}
\`\`\`

## Diagrams

\`\`\`mermaid
flowchart LR
  A[Write] --> B{Ready?}
  B -- yes --> C[Export PDF]
  B -- no --> A
\`\`\`

## Math

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

> [!TIP]
> Drop a Typora theme into the themes folder and it just works.
`;

function writeDemo() {
  mkdirSync(join(notes, 'Journal'), { recursive: true });
  mkdirSync(join(notes, 'Ideas'), { recursive: true });
  writeFileSync(join(notes, 'Project notes.md'), DEMO);
  writeFileSync(join(notes, 'Reading list.md'), '# Reading list\n\n- *The Pragmatic Programmer*\n');
  writeFileSync(join(notes, 'Meeting 2026-11-18.md'), '# Meeting\n\nNotes.\n');
  writeFileSync(join(notes, 'Journal', 'Monday.md'), '# Monday\n');
  writeFileSync(join(notes, 'Ideas', 'App ideas.md'), '# App ideas\n');
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error('WebView2 debugging port did not open (is MarkType already running?)');
}

function client(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = async (method, params = {}) => {
    await ready;
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    const msg = await new Promise((r) => pending.set(msgId, r));
    if (msg.error) throw new Error(JSON.stringify(msg.error));
    return msg.result;
  };
  return {
    send,
    close: () => ws.close(),
    async eval(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result?.value;
    },
  };
}

/** Starts the app with `settings`, opening the demo folder and file; returns the CDP client. */
async function start(settings) {
  rmSync(configDir, { recursive: true, force: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify(settings));
  const app = spawn(exe, [notes, join(notes, 'Project notes.md')], {
    env: {
      ...process.env,
      MARKTYPE_CONFIG_DIR: configDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
    stdio: 'ignore',
  });
  const cdp = client(await connect());
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Wait for the document, Mermaid and KaTeX.
  for (let i = 0; i < 40; i++) {
    const ready = await cdp.eval(
      `!!document.querySelector('#write h1') && !!document.querySelector('#write svg') && !!document.querySelector('#write .katex')`,
    );
    if (ready) break;
    await sleep(250);
  }
  await sleep(800);
  return { app, cdp };
}

async function shot(cdp, name) {
  // No caret or selection highlight in the picture.
  await cdp.eval(`(document.activeElement?.blur(), getSelection().removeAllRanges(), true)`);
  await sleep(300);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name), Buffer.from(data, 'base64'));
  console.log('saved', name);
}

const key = (k, code, mods = {}) =>
  `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', code: '${code}', bubbles: true, ctrlKey: ${!!mods.ctrl}, shiftKey: ${!!mods.shift}, altKey: ${!!mods.alt} }))`;

const theme = (fixed) => ({
  theme: { followSystem: false, fixed, light: 'builtin:light', dark: 'builtin:dark' },
  'sidebar.visible': true,
  'sidebar.tab': 'files',
  'sidebar.width': 250,
});

mkdirSync(outDir, { recursive: true });
writeDemo();
try {
  // 1. Light theme, file tree.
  let { app, cdp } = await start(theme('builtin:light'));
  await shot(cdp, 'light.png');
  cdp.close();
  app.kill();
  await sleep(1500);

  // 2. Dark theme, outline, scrolled to the diagram and the formula.
  ({ app, cdp } = await start(theme('builtin:dark')));
  // Opening the folder showed the Files panel: switch to the outline.
  await cdp.eval(`(document.querySelectorAll('.sidebar-tab')[1].click(), true)`);
  await cdp.eval(`(document.querySelectorAll('#write h2')[2].scrollIntoView({ block: 'start' }), true)`);
  await sleep(500);
  await shot(cdp, 'dark.png');
  cdp.close();
  app.kill();
  await sleep(1500);

  // 3. Split view (source + preview), Paper theme.
  ({ app, cdp } = await start(theme('builtin:paper')));
  await cdp.eval(key('/', 'Slash', { ctrl: true, alt: true }));
  await sleep(1500);
  await shot(cdp, 'split.png');
  cdp.close();
  app.kill();
} finally {
  await sleep(1000);
  rmSync(work, { recursive: true, force: true });
}
