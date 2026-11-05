const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

// .env sets NODE_ENV=development for the Node servers (api-server, central-server).
// Vite reads the same file, and NODE_ENV=development there turns `vite build` into a
// development build (React dev mode, import.meta.env.DEV true, dev-only tools shipped).
// The renderer build must always be a production build.
// (Vite copies NODE_ENV from .env into VITE_USER_NODE_ENV unless it is already set.)
if (process.argv.includes('build')) {
  process.env.NODE_ENV = 'production';
  process.env.VITE_USER_NODE_ENV = '';
}

// index.html ships a strict CSP (no inline scripts). The dev server's React
// refresh preamble is an inline script, so allow it while serving only.
const allowInlineScriptsInDev = {
  name: 'allow-inline-scripts-in-dev',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
  },
};

module.exports = defineConfig({
  plugins: [react(), allowInlineScriptsInDev],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
  },
});
