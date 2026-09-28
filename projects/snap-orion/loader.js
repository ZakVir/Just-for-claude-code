// Snap (Orion port): loader.
// Upstream Snap runs its scripts with "world": "MAIN", which is Chrome-only.
// Orion doesn't document support for it, and without it the scripts land in
// the extension's isolated world, where patching getUserMedia has no effect
// on Meet. So this isolated-world script injects the real scripts into the
// page as <script src> tags pointing at the extension's own files.
(() => {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.runtime || document.documentElement.dataset.snapOrion) return;
  document.documentElement.dataset.snapOrion = '1';

  const parent = document.head || document.documentElement;
  ['page/effect.js', 'page/snapdetect.js', 'page/inject.js'].forEach((file) => {
    const s = document.createElement('script');
    s.src = api.runtime.getURL(file);
    s.async = false; // keep execution order: effect -> snapdetect -> inject
    s.onload = s.onerror = () => s.remove();
    parent.appendChild(s);
  });
})();
