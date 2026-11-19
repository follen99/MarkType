// Smoke test of the built desktop app (Windows): launches target/release/marktype.exe with the WebView2
// remote-debugging port open and checks things only the real app can do. Usage, after a release build:
//   node scripts/smoke-desktop.mjs
// Today it covers user themes (M4): a theme in %APPDATA%\MarkType\themes is listed and applied, its relative
// url() assets load through the asset protocol, and editing it live-reloads. The user's saved theme choice is
// restored and the test files are removed at the end.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = 9333;
const root = resolve(import.meta.dirname, '..');
const exe = join(root, 'target', 'release', 'marktype.exe');
const themesDir = join(process.env.APPDATA ?? '', 'MarkType', 'themes');
const themeCss = join(themesDir, 'mt-smoke.css');
const assetDir = join(themesDir, 'mt-smoke');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

function writeTheme(bg) {
  writeFileSync(
    themeCss,
    `:root { --bg-color: ${bg}; }\n#write { background-image: url('./mt-smoke/dot.svg'); }\n`,
  );
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
  throw new Error('WebView2 debugging port did not open');
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
  return {
    ready,
    close: () => ws.close(),
    async eval(expression) {
      await ready;
      const msgId = ++id;
      ws.send(
        JSON.stringify({
          id: msgId,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
      const msg = await new Promise((r) => pending.set(msgId, r));
      if (msg.result?.exceptionDetails) throw new Error(JSON.stringify(msg.result.exceptionDetails));
      return msg.result?.result?.value;
    },
  };
}

mkdirSync(assetDir, { recursive: true });
writeFileSync(join(assetDir, 'dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
writeTheme('#102030');

const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  stdio: 'ignore',
});

let saved = null;
let cdp;
try {
  cdp = client(await connect());
  await cdp.ready;
  await sleep(1500);
  saved = await cdp.eval(`localStorage.getItem('marktype.theme')`);
  const listed = await cdp.eval(
    `(async () => { const t = await window.__TAURI_INTERNALS__.invoke('list_themes'); return t.themes.map(x => x.id); })()`,
  );
  check('user theme is listed', Array.isArray(listed) && listed.includes('mt-smoke'), JSON.stringify(listed));

  await cdp.eval(
    `localStorage.setItem('marktype.theme', JSON.stringify({ followSystem: false, fixed: 'user:mt-smoke', light: 'builtin:light', dark: 'builtin:dark' })); location.reload()`,
  );
  cdp.close();
  await sleep(2500);
  cdp = client(await connect());
  await cdp.ready;
  await sleep(2000);
  // The image is resolved like the theme's url('./mt-smoke/dot.svg'): relative to the stylesheet URL.
  const state = await cdp.eval(`(async () => {
    const link = document.getElementById('mt-theme');
    const asset = await new Promise((done) => {
      const img = new Image();
      img.onload = () => done('loaded');
      img.onerror = () => done('error');
      img.src = new URL('./mt-smoke/dot.svg', link.href).href;
    });
    return { href: link.getAttribute('href'), bg: getComputedStyle(document.body).backgroundColor, asset };
  })()`);
  check('user theme is applied', state.bg === 'rgb(16, 32, 48)', `${state.bg} from ${state.href}`);
  check('relative url() asset loads', state.asset === 'loaded', state.asset);

  writeTheme('#405060');
  await sleep(2000);
  const bg = await cdp.eval(`getComputedStyle(document.body).backgroundColor`);
  check('editing the theme live-reloads it', bg === 'rgb(64, 80, 96)', bg);
} catch (error) {
  check('smoke test ran', false, String(error));
} finally {
  try {
    await cdp?.eval(
      saved === null
        ? `localStorage.removeItem('marktype.theme')`
        : `localStorage.setItem('marktype.theme', ${JSON.stringify(saved)})`,
    );
  } catch {
    // app already gone
  }
  cdp?.close();
  app.kill();
  rmSync(themeCss, { force: true });
  rmSync(assetDir, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
