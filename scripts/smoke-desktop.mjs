// Smoke test of the built desktop app (Windows): launches target/release/marktype.exe with the WebView2
// remote-debugging port open and checks things only the real app can do. Usage, after a release build:
//   node scripts/smoke-desktop.mjs
// The app runs with MARKTYPE_CONFIG_DIR pointing to a temporary folder, so the user's settings.json,
// keybindings.json and themes are never touched. It covers:
// - user themes (M4): a theme in <config>/themes is listed and applied, its relative url() assets load
//   through the asset protocol, editing it live-reloads, and its CSS can be fetched (HTML export);
// - images (M5): saving never overwrites an existing file (`-1`, `-2` suffixes), and an image pasted in an
//   untitled document goes to the pending folder and is displayed through the asset protocol;
// - settings (M6): settings.json is read at startup and written when a setting changes, keybindings.json
//   overrides a shortcut;
// - launch (M6): `marktype file.md` opens the file; launching again with a file and a folder hands them to
//   the running window (single instance) and the second process exits;
// - session (M8): the open tabs and the folder come back after a restart (sidebar still open), a file
//   deleted meanwhile is skipped, reported once and dropped from the session and the recent files.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PORT = 9333;
const root = resolve(import.meta.dirname, '..');
const exe = join(root, 'target', 'release', 'marktype.exe');
const configDir = mkdtempSync(join(tmpdir(), 'mt smoke config '));
const themesDir = join(configDir, 'themes');
const themeCss = join(themesDir, 'mt-smoke.css');
const assetDir = join(themesDir, 'mt-smoke');
const settingsFile = join(configDir, 'settings.json');
const imageDir = mkdtempSync(join(tmpdir(), 'mt smoke images '));
const docsDir = mkdtempSync(join(tmpdir(), 'mt smoke docs '));
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let pendingId = null;

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

const env = {
  ...process.env,
  MARKTYPE_CONFIG_DIR: configDir,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
};

function launch(args = []) {
  return spawn(exe, args, { env, stdio: 'ignore' });
}

/** Waits until `expression` is truthy in the page; returns its last value. */
async function waitFor(cdp, expression, ms = 8000) {
  let value;
  for (let waited = 0; waited < ms; waited += 200) {
    value = await cdp.eval(expression);
    if (value) return value;
    await sleep(200);
  }
  return value;
}

const tabNames = `[...document.querySelectorAll('.mt-tab-name')].map((t) => t.textContent.trim()).join('|')`;

mkdirSync(assetDir, { recursive: true });
writeFileSync(join(assetDir, 'dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
writeTheme('#102030');
// The theme choice comes from settings.json; F8 toggles the sidebar through keybindings.json.
writeFileSync(
  settingsFile,
  JSON.stringify({
    theme: { followSystem: false, fixed: 'user:mt-smoke', light: 'builtin:light', dark: 'builtin:dark' },
  }),
);
writeFileSync(join(configDir, 'keybindings.json'), JSON.stringify({ toggleSidebar: 'F8' }));
const cliFile = join(docsDir, 'smoke cli.md');
const secondFile = join(docsDir, 'smoke second.md');
const folder = join(docsDir, 'notes folder');
writeFileSync(cliFile, '# From the command line\n');
writeFileSync(secondFile, '# From a second launch\n');
mkdirSync(folder);
writeFileSync(join(folder, 'inside-the-folder.md'), '# Inside\n');

let app = launch();
let cdp;
try {
  cdp = client(await connect());
  await cdp.ready;
  await sleep(2500);
  const listed = await cdp.eval(
    `(async () => { const t = await window.__TAURI_INTERNALS__.invoke('list_themes'); return t.themes.map(x => x.id); })()`,
  );
  check('user theme is listed', Array.isArray(listed) && listed.includes('mt-smoke'), JSON.stringify(listed));

  // The image is resolved like the theme's url('./mt-smoke/dot.svg'): relative to the stylesheet URL.
  const state = await cdp.eval(`(async () => {
    const link = document.getElementById('mt-theme');
    const asset = await new Promise((done) => {
      const img = new Image();
      img.onload = () => done('loaded');
      img.onerror = () => done('error');
      img.src = new URL('./mt-smoke/dot.svg', link.href).href;
    });
    const css = await fetch(link.href).then((r) => r.text()).catch((e) => 'fetch failed: ' + e);
    return { href: link.getAttribute('href'), bg: getComputedStyle(document.body).backgroundColor, asset, css };
  })()`);
  check(
    'theme from settings.json is applied',
    state.bg === 'rgb(16, 32, 48)',
    `${state.bg} from ${state.href}`,
  );
  check('relative url() asset loads', state.asset === 'loaded', state.asset);
  check('theme CSS can be read for HTML export', state.css.includes('--bg-color'), state.css.slice(0, 60));

  writeTheme('#405060');
  await sleep(2000);
  const bg = await cdp.eval(`getComputedStyle(document.body).backgroundColor`);
  check('editing the theme live-reloads it', bg === 'rgb(64, 80, 96)', bg);

  // M6 keybindings.json: F8 now toggles the sidebar.
  const sidebar = await cdp.eval(`(async () => {
    const hidden = () => document.querySelector('.mt-body').classList.contains('sidebar-hidden');
    const before = hidden();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', code: 'F8', bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const after = hidden();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', code: 'F8', bubbles: true }));
    return before !== after;
  })()`);
  check('keybindings.json overrides a shortcut', sidebar === true);

  // M6 settings.json: a change in the settings panel is written to the file.
  await cdp.eval(`(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const select = document.querySelectorAll('.mt-settings select')[1];
    select.value = '18';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('.mt-settings .mt-button.primary').click();
  })()`);
  await sleep(800);
  const written = JSON.parse(readFileSync(settingsFile, 'utf8'));
  check(
    'settings panel writes settings.json',
    written.editor?.fontSize === 18 && written.theme?.fixed === 'user:mt-smoke',
    JSON.stringify(written.editor),
  );

  // M5 images: saving never overwrites, suffixes -1, -2…
  writeFileSync(join(imageDir, 'shot.png'), 'original');
  const saves = await cdp.eval(`(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const headers = { 'x-dir': encodeURIComponent(${JSON.stringify(imageDir)}), 'x-name': encodeURIComponent('shot.png') };
    const a = await invoke('save_image', new TextEncoder().encode('one'), { headers });
    const b = await invoke('save_image', new TextEncoder().encode('two'), { headers });
    return [a, b];
  })()`);
  const names = (saves ?? []).map((p) => p.split(/[\\/]/).pop());
  check('image save picks free names', names.join() === 'shot-1.png,shot-2.png', names.join());
  check(
    'existing image is never overwritten',
    readFileSync(join(imageDir, 'shot.png'), 'utf8') === 'original' &&
      readFileSync(join(imageDir, 'shot-2.png'), 'utf8') === 'two',
  );

  // Pasting an image in the untitled document stores it in the pending folder and shows it.
  const pasted = await cdp.eval(`(async () => {
    const write = document.querySelector('#write');
    write.focus();
    const png = Uint8Array.from(atob('${PNG}'), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([png], 'image.png', { type: 'image/png' }));
    write.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    for (let i = 0; i < 40 && !write.querySelector('.md-image.md-img-loaded, .md-image.md-img-error'); i++)
      await new Promise((r) => setTimeout(r, 100));
    const img = write.querySelector('.md-image img');
    const result = { src: img?.dataset.src ?? '', loaded: !!write.querySelector('.md-image.md-img-loaded') };
    // Undo, so no crash-recovery draft is left behind.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true }));
    return result;
  })()`);
  pendingId = /pending-images\/([\w-]+)\//.exec(pasted?.src ?? '')?.[1] ?? null;
  check('pasted image goes to the pending folder', pendingId !== null, pasted?.src);
  check('pasted image is displayed', pasted?.loaded === true);
  if (pendingId)
    await cdp.eval(`window.__TAURI_INTERNALS__.invoke('discard_pending_images', { id: '${pendingId}' })`);
  pendingId = null;

  // M6 command line: restart with a file argument.
  cdp.close();
  app.kill();
  await sleep(2000);
  app = launch([cliFile]);
  cdp = client(await connect());
  await cdp.ready;
  const opened = await waitFor(cdp, `(${tabNames}).includes('smoke cli.md') && ${tabNames}`);
  check('marktype <file> opens the file', String(opened).includes('smoke cli.md'), String(opened));

  // Second launch: the running window gets the paths, the new process exits.
  const second = spawn(exe, [secondFile, folder], {
    env: { ...process.env, MARKTYPE_CONFIG_DIR: configDir },
  });
  const exited = await Promise.race([
    new Promise((r) => second.on('exit', () => r(true))),
    sleep(10000).then(() => false),
  ]);
  if (!exited) second.kill();
  const handed = await waitFor(
    cdp,
    `(${tabNames}).includes('smoke second.md') && document.body.innerText.includes('inside-the-folder') && ${tabNames}`,
  );
  check('second launch exits (single instance)', exited === true);
  check('second launch opens its file and folder here', !!handed, String(handed));

  // M8 session: the open tabs, the folder and the recent folders are saved in settings.json.
  await sleep(1000);
  const saved = JSON.parse(readFileSync(settingsFile, 'utf8'));
  const savedFiles = (saved.session?.files ?? []).map((p) => p.split(/[\\/]/).pop()).join('|');
  check(
    'session saves the open tabs',
    savedFiles === 'smoke cli.md|smoke second.md' && /smoke second\.md$/.test(saved.session?.active ?? ''),
    JSON.stringify(saved.session),
  );
  check(
    'opened folder goes to the recent folders',
    (saved.recentFolders ?? [])[0]?.endsWith('notes folder') === true,
    JSON.stringify(saved.recentFolders),
  );
  const kinds = await cdp.eval(`(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    return [${JSON.stringify(folder)}, ${JSON.stringify(cliFile)}, ${JSON.stringify(join(docsDir, 'nope.md'))}]
      .map((path) => invoke('path_kind', { path }));
  })().then((all) => Promise.all(all))`);
  check('path_kind tells folders, files and missing paths', JSON.stringify(kinds) === '["dir","file",null]');

  // Restart without arguments, after deleting one of the files: the session comes back without it.
  cdp.close();
  app.kill();
  await sleep(2000);
  rmSync(secondFile);
  app = launch();
  cdp = client(await connect());
  await cdp.ready;
  const missingAlert = await waitFor(
    cdp,
    `document.querySelector('.mt-dialog-message')?.textContent.includes('smoke second.md') && document.querySelector('.mt-dialog-message').textContent`,
  );
  const restored = await cdp.eval(`({
    tabs: ${tabNames},
    active: document.querySelector('.mt-tab.active .mt-tab-name')?.textContent.trim(),
    sidebar: !document.querySelector('.mt-body').classList.contains('sidebar-hidden') && !!document.querySelector('#typora-sidebar'),
    tree: document.querySelector('#typora-sidebar')?.innerText.includes('inside-the-folder') ?? false,
  })`);
  check(
    'session restores the tabs after a restart',
    restored?.tabs === 'smoke cli.md',
    JSON.stringify(restored),
  );
  check('a deleted file in the session is skipped and reported once', !!missingAlert, String(missingAlert));
  check('sidebar stays open with the restored folder', restored?.sidebar === true && restored?.tree === true);
  await cdp.eval(`document.querySelector('.mt-dialog .mt-button.primary')?.click()`);
  await sleep(1000);
  const after = JSON.parse(readFileSync(settingsFile, 'utf8'));
  // M9 PDF: WebView2 PrintToPdf writes the file without the print dialog (with and without header/footer).
  const pdfs = [join(docsDir, 'export plain.pdf'), join(docsDir, 'export header.pdf')];
  const pdfResult = await cdp.eval(`(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Smoke PDF</title></head><body><h1>PDF àè</h1><p>' + 'Lorem ipsum. '.repeat(400) + '</p></body></html>';
    const out = [];
    for (const [output, headerFooter] of [[${JSON.stringify(pdfs[0])}, false], [${JSON.stringify(pdfs[1])}, true]]) {
      const start = performance.now();
      try {
        await invoke('print_pdf', { job: { html, output, headerFooter, title: '' } });
        out.push(Math.round(performance.now() - start));
      } catch (e) {
        out.push('error: ' + e);
      }
    }
    return out;
  })()`);
  const pdfOk = pdfs.map((p) => existsSync(p) && readFileSync(p).subarray(0, 5).toString() === '%PDF-');
  check(
    'PDF export writes the file without the print dialog',
    pdfOk.every(Boolean),
    JSON.stringify(pdfResult),
  );
  const pdfSizes = pdfs.map((p) => (existsSync(p) ? readFileSync(p).length : 0));
  check(
    'PDF header/footer changes the output',
    pdfSizes[0] > 0 && pdfSizes[0] !== pdfSizes[1],
    pdfSizes.join(' vs '),
  );

  // M8 images: deleting an image from the text asks about its file; "Keep" leaves it on disk.
  const picDir = join(docsDir, 'assets');
  mkdirSync(picDir);
  writeFileSync(join(picDir, 'pic.png'), Buffer.from(PNG, 'base64'));
  const imageDoc = join(docsDir, 'with image.md');
  writeFileSync(imageDoc, 'Before ![p](assets/pic.png) after\n');
  spawn(exe, [imageDoc], { env: { ...process.env, MARKTYPE_CONFIG_DIR: configDir } });
  await waitFor(cdp, `document.querySelector('.mt-doc:not([hidden]) #write .md-image img') !== null`);
  const asked = await cdp.eval(`(async () => {
    const write = document.querySelector('.mt-doc:not([hidden]) #write');
    const span = write.querySelector('.md-image');
    const range = document.createRange();
    range.setStartBefore(span);
    range.setEndAfter(span);
    write.focus();
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    await new Promise((r) => setTimeout(r, 300));
    write.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true }));
    let dialog = null;
    for (let i = 0; i < 30 && !dialog; i++) {
      await new Promise((r) => setTimeout(r, 100));
      dialog = document.querySelector('.mt-dialog');
    }
    const result = {
      gone: !write.querySelector('.md-image'),
      message: dialog?.querySelector('.mt-dialog-message')?.textContent ?? '',
      checkbox: !!dialog?.querySelector('.mt-dialog-check input'),
    };
    dialog?.querySelector('.mt-dialog-buttons .mt-button:not(.primary)')?.click();
    await new Promise((r) => setTimeout(r, 300));
    // Undo, so the document is clean and no crash-recovery draft is left behind.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    result.back = !!write.querySelector('.md-image');
    result.extra = !!document.querySelector('.mt-dialog');
    return result;
  })()`);
  check(
    'deleting an image asks about its file (with "remember")',
    asked?.gone === true && asked.message.includes('pic.png') && asked.checkbox === true,
    JSON.stringify(asked),
  );
  check(
    '"Keep" leaves the file, undo asks nothing',
    existsSync(join(picDir, 'pic.png')) && asked?.back === true && asked?.extra === false,
  );

  check(
    'the deleted file is dropped from the session',
    (after.session?.files ?? []).length === 1 &&
      !(after.recentFiles ?? []).some((p) => p.endsWith('smoke second.md')),
    JSON.stringify(after.session),
  );
} catch (error) {
  check('smoke test ran', false, String(error));
} finally {
  try {
    if (pendingId)
      await cdp?.eval(`window.__TAURI_INTERNALS__.invoke('discard_pending_images', { id: '${pendingId}' })`);
  } catch {
    // app already gone
  }
  cdp?.close();
  app.kill();
  await sleep(1000);
  for (const dir of [configDir, imageDir, docsDir]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
