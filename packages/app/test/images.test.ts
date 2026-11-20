import { describe, expect, it } from 'vitest';
import { decodePathComponent, resolvePath } from '@marktype/platform';
import {
  DEFAULT_IMAGE_SETTINGS,
  encodeImagePath,
  expandNamePattern,
  frontMatterCopyTo,
  imageExtension,
  imageFolder,
  imageMarkdownSrc,
  isImageName,
  loadImageSettings,
  removalAction,
  removedImageFiles,
  sanitizeFileName,
  shortHash,
  stem,
  type ImageSettings,
} from '../src/images.ts';

const date = new Date(2026, 10, 9, 8, 5, 3, 7);
const ctx = { filename: 'My Notes', original: 'image', date, hash: 'ab12cd34' };
const settings = (patch: Partial<ImageSettings> = {}): ImageSettings => ({
  ...DEFAULT_IMAGE_SETTINGS,
  ...patch,
});

describe('image name pattern', () => {
  it('defaults to ${filename}-${timestamp}', () => {
    expect(expandNamePattern(DEFAULT_IMAGE_SETTINGS.pattern, ctx)).toBe('My Notes-20261109080503007');
  });

  it('expands every token', () => {
    expect(expandNamePattern('${original}_${date}_${time}_${hash}', ctx)).toBe(
      'image_2026-11-09_08-05-03_ab12cd34',
    );
  });

  it('leaves unknown tokens alone', () => {
    expect(expandNamePattern('${nope}-${filename}', ctx)).toBe('${nope}-My Notes');
  });
});

describe('sanitizeFileName', () => {
  it('replaces characters that are invalid or unsafe in paths', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j#k%l')).toBe('a-b-c-d-e-f-g-h-i-j-k-l');
  });

  it('never returns an empty, hidden or reserved name', () => {
    expect(sanitizeFileName('   ')).toBe('image');
    expect(sanitizeFileName('...')).toBe('image');
    expect(sanitizeFileName('.hidden')).toBe('image.hidden');
    expect(sanitizeFileName('CON')).toBe('CON-');
    expect(sanitizeFileName('name. ')).toBe('name');
  });
});

describe('image types', () => {
  it('takes the extension from the name, else from the MIME type', () => {
    expect(imageExtension('Photo.JPEG', '')).toBe('jpeg');
    expect(imageExtension('image', 'image/png')).toBe('png');
    expect(imageExtension('clip.bin', 'image/svg+xml')).toBe('svg');
    expect(imageExtension('x', '')).toBe('png');
  });

  it('recognizes image files', () => {
    expect(isImageName('C:\\pics\\a.PNG')).toBe(true);
    expect(isImageName('notes.md')).toBe(false);
    expect(stem('C:\\pics\\a.b.png')).toBe('a.b');
  });
});

describe('image folder', () => {
  const doc = 'C:\\Users\\me\\Notes\\My Doc.md';

  it('uses ./assets by default', () => {
    expect(imageFolder(doc, settings(), null)).toBe('C:\\Users\\me\\Notes\\assets');
  });

  it('supports ./${filename}.assets, custom folders and no copy', () => {
    expect(imageFolder(doc, settings({ destination: 'filenameAssets' }), null)).toBe(
      'C:\\Users\\me\\Notes\\My Doc.assets',
    );
    expect(imageFolder(doc, settings({ destination: 'custom', customFolder: '../img' }), null)).toBe(
      'C:\\Users\\me\\img',
    );
    expect(imageFolder(doc, settings({ destination: 'custom', customFolder: 'D:\\pics' }), null)).toBe(
      'D:\\pics',
    );
    expect(imageFolder(doc, settings({ destination: 'none' }), null)).toBeNull();
  });

  it('lets the front matter override the settings', () => {
    const markdown = '---\ntitle: x\ntypora-copy-images-to: "./${filename}-img"\n---\n\n# Hi\n';
    const value = frontMatterCopyTo(markdown);
    expect(value).toBe('./${filename}-img');
    expect(imageFolder(doc, settings({ destination: 'none' }), value)).toBe(
      'C:\\Users\\me\\Notes\\My Doc-img',
    );
    expect(frontMatterCopyTo('# no front matter\ntypora-copy-images-to: x\n')).toBeNull();
  });

  it('works with POSIX paths', () => {
    expect(imageFolder('/home/me/a.md', settings(), null)).toBe('/home/me/assets');
  });
});

describe('markdown src', () => {
  it('is relative to the document, with / and encoded spaces', () => {
    expect(imageMarkdownSrc('C:\\Notes\\doc.md', 'C:\\Notes\\assets\\my image.png')).toBe(
      'assets/my%20image.png',
    );
    expect(imageMarkdownSrc('C:\\Notes\\sub\\doc.md', 'c:\\notes\\img\\a.png')).toBe('../img/a.png');
    expect(imageMarkdownSrc('/home/me/doc.md', '/home/me/My Doc.assets/a.png')).toBe('My%20Doc.assets/a.png');
  });

  it('stays absolute for unsaved documents and other drives', () => {
    expect(imageMarkdownSrc(null, 'C:\\Users\\me\\AppData\\pending\\x 1.png')).toBe(
      'C:/Users/me/AppData/pending/x%201.png',
    );
    expect(imageMarkdownSrc('C:\\Notes\\doc.md', 'D:\\pics\\a.png')).toBe('D:/pics/a.png');
  });

  it('round-trips through the decoder used to load images', () => {
    const path = 'assets/a (1) #2 100%.png';
    expect(decodePathComponent(encodeImagePath(path))).toBe(path);
    expect(resolvePath('C:\\Notes', decodePathComponent(encodeImagePath(path)))).toBe(
      'C:\\Notes\\assets\\a (1) #2 100%.png',
    );
  });
});

describe('settings', () => {
  it('falls back to the defaults for missing or invalid values', () => {
    const prefs = {
      get: <T>(_key: string, _fallback: T) => ({ destination: 'bogus', pattern: '  ', askName: 'yes' }) as T,
      set: () => {},
    };
    expect(loadImageSettings(prefs)).toEqual(DEFAULT_IMAGE_SETTINGS);
  });

  it('reads what to do with removed images (ask by default)', () => {
    const prefs = (removeFile: unknown) => ({
      get: <T>(_key: string, _fallback: T) => ({ removeFile }) as T,
      set: () => {},
    });
    expect(DEFAULT_IMAGE_SETTINGS.removeFile).toBe('ask');
    expect(loadImageSettings(prefs('trash')).removeFile).toBe('trash');
    expect(loadImageSettings(prefs('keep')).removeFile).toBe('keep');
    expect(loadImageSettings(prefs('delete')).removeFile).toBe('ask');
  });
});

describe('removed images', () => {
  // Like platform.resolveLocalLink for a document in C:/Notes.
  const resolve = (src: string) =>
    /^[a-z]+:\/\//i.test(src) ? null : src.includes(':') ? src : resolvePath('C:\\Notes', decodePathComponent(src));
  const roots = ['C:\\Notes'];

  it('keeps only local images inside the document folder', () => {
    const files = removedImageFiles(
      ['assets/a.png', 'https://x.org/b.png', 'D:/pics/c.png', '../d.png', 'notes.md', 'assets/sub/e%201.jpg'],
      [],
      resolve,
      roots,
    );
    expect(files.map((f) => f.path)).toEqual(['C:\\Notes\\assets\\a.png', 'C:\\Notes\\assets\\sub\\e 1.jpg']);
    expect(files.every((f) => !f.stillUsed)).toBe(true);
  });

  it('notices another image of the document pointing to the same file', () => {
    const [file] = removedImageFiles(['assets/a.png'], ['./assets/A.png', 'assets/b.png'], resolve, roots);
    expect(file?.stillUsed).toBe(true);
  });

  it('accepts the pending folder of an unsaved document', () => {
    const pending = 'C:\\App\\pending-images\\doc1';
    const files = removedImageFiles(['C:/App/pending-images/doc1/x.png'], [], (s) => s, [pending]);
    expect(files).toHaveLength(1);
  });

  it('lists each file once', () => {
    expect(removedImageFiles(['assets/a.png', './assets/a.png'], [], resolve, roots)).toHaveLength(1);
  });

  it('always asks for a file still in use, otherwise follows the setting', () => {
    const image = { src: 'a.png', path: 'C:\\Notes\\a.png', stillUsed: false };
    expect(removalAction(image, 'ask')).toBe('ask');
    expect(removalAction(image, 'trash')).toBe('trash');
    expect(removalAction(image, 'keep')).toBe('keep');
    expect(removalAction({ ...image, stillUsed: true }, 'trash')).toBe('askShared');
    expect(removalAction({ ...image, stillUsed: true }, 'keep')).toBe('askShared');
  });
});

describe('shortHash', () => {
  it('is the first 8 hex digits of SHA-256', async () => {
    expect(await shortHash(new TextEncoder().encode('abc'))).toBe('ba7816bf');
  });
});
