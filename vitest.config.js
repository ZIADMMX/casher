// Frontend (renderer) tests: React + ESM in a browser-like DOM.
// Backend tests under tests/ (except tests/frontend) run on Jest; `npm test` runs both.
const { defineConfig } = require('vitest/config');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/frontend/**/*.test.{js,jsx}', 'license-server/test/**/*.test.js'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/frontend/setup/jest-dom.js'],
    // Forked workers time out while starting on Windows ("Failed to start forks worker"); threads start reliably.
    pool: 'threads',
    // One jsdom per worker; too many at once crash Node or starve the slower tests.
    maxWorkers: 4,
    testTimeout: 20000,
  },
});
