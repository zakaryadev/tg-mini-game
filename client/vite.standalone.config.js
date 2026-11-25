import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Offlayn yig'ma: net.js -> net-local.js, node:crypto -> brauzer variantiga almashtiriladi
const swap = {
  name: 'standalone-swap',
  enforce: 'pre',
  resolveId(src, importer) {
    if (src === 'node:crypto') return path.join(here, 'src/crypto-shim.js');
    if (src === './net.js' && importer?.endsWith('main.js')) return path.join(here, 'src/net-local.js');
  }
};

// JS va CSS ni index.html ichiga joylaydi, Telegram skriptini olib tashlaydi
const inline = {
  name: 'standalone-inline',
  enforce: 'post',
  generateBundle(_, bundle) {
    const html = bundle['index.html'];
    let src = html.source.toString();
    for (const [name, f] of Object.entries(bundle)) {
      if (name.endsWith('.js')) {
        const code = f.code.replace(/<\/script/gi, '<\\/script');
        src = src.replace(new RegExp(`<script[^>]*src="[^"]*${name.split('/').pop()}"[^>]*></script>`), () => '');
        src = src.replace('</body>', () => `<script type="module">${code}</script>\n</body>`);
        delete bundle[name];
      } else if (name.endsWith('.css')) {
        src = src.replace(new RegExp(`<link[^>]*href="[^"]*${name.split('/').pop()}"[^>]*>`), () => `<style>${f.source}</style>`);
        delete bundle[name];
      }
    }
    src = src.replace(/<script src="https:\/\/telegram[^>]*><\/script>\n?/, '');
    html.source = src;
  }
};

export default defineConfig({
  base: './',
  plugins: [swap, inline],
  build: { target: 'es2020', outDir: 'dist-standalone', emptyOutDir: true, modulePreload: false, cssCodeSplit: false },
  server: { fs: { allow: ['..'] } }
});
