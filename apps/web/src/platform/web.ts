import type { OsName, Platform } from '@marktype/platform';

declare const __APP_VERSION__: string;

function detectOs(): OsName {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Mac/i.test(ua)) return 'macos';
  if (/Win/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

/** Browser implementation of Platform (phase 2 adds single-file open/save and .zip packages). */
export function createWebPlatform(): Platform {
  return {
    kind: 'web',
    os: detectOs(),
    appVersion: __APP_VERSION__,
    capabilities: { windowControls: false, folders: false },
    window: {
      // The browser owns the window: these are no-ops except the title.
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
      isMaximized: async () => false,
      setTitle: async (title) => {
        document.title = title;
      },
      onResized: async (cb) => {
        window.addEventListener('resize', cb);
        return () => window.removeEventListener('resize', cb);
      },
    },
  };
}
