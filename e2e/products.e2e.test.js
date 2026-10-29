// e2e/products.e2e.test.js
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

// Helper to launch the Electron app in the background
function launchElectron() {
  const electronPath = path.resolve('node_modules/.bin/electron');
  // Start Electron and keep the process alive; output is inherited for debugging
  const child = execSync(`${electronPath} .`, { stdio: 'inherit', cwd: process.cwd() });
  return () => child.kill('SIGTERM');
}

test.describe('Products page (e2e)', () => {
  let stopElectron;

  test.beforeAll(() => {
    // Build the app first (ensures latest code)
    execSync('npm run build', { stdio: 'inherit' });
    stopElectron = launchElectron();
  });

  test.afterAll(() => {
    if (stopElectron) stopElectron();
  });

  test('renders without crashing', async ({ page }) => {
    // Give Electron some time to start and render the window
    await page.waitForTimeout(3000);
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
