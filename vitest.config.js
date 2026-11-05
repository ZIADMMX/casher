// Frontend (renderer) tests: React + ESM in a browser-like DOM.
// Backend tests under tests/ (except tests/frontend) run on Jest; `npm test` runs both.
const { defineConfig } = require('vitest/config');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/frontend/**/*.test.{js,jsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/frontend/setup/jest-dom.js'],
  },
});
