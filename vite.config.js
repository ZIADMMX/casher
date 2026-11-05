const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

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
