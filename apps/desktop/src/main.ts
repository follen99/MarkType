import { getCurrentWindow } from '@tauri-apps/api/window';
import { startApp } from '@marktype/app';
import { createTauriPlatform } from './platform/tauri.ts';

// The window starts hidden (tauri.conf.json) to avoid a white flash; it is shown once the UI is mounted,
// or anyway if startup fails, so errors stay visible.
try {
  const platform = await createTauriPlatform();
  startApp(platform, document.getElementById('app')!);
} finally {
  await getCurrentWindow().show();
}
