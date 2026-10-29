const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// We mock electron before requiring mediaProtocol
let mockUserDataPath;

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name) => {
      if (name === 'userData') return mockUserDataPath;
      return require('node:os').tmpdir();
    }),
  },
  protocol: {
    handle: jest.fn(),
  },
  net: {
    fetch: jest.fn(async (url) => ({
      status: 200,
      url,
      ok: true,
    })),
  },
}));

const {
  validateAndResolveMediaPath,
  handleMediaProtocolRequest,
  ensureMediaDirectoriesExist,
} = require('../../electron/security/mediaProtocol');

describe('Security: kashiear-media Protocol Handler', () => {
  let tempRoot;
  let imagesDir;
  let employeeImagesDir;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kashiear-media-sec-test-'));
    mockUserDataPath = tempRoot;
    imagesDir = path.join(tempRoot, 'images');
    employeeImagesDir = path.join(tempRoot, 'employee-images');
    ensureMediaDirectoriesExist();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('allows legitimate product images inside images directory', () => {
    const validImage = path.join(imagesDir, 'product123.jpg');
    fs.writeFileSync(validImage, 'fake-jpg-content');

    const formattedUrl = `kashiear-media://${validImage.replace(/\\/g, '/')}`;
    const result = validateAndResolveMediaPath(formattedUrl);

    expect(result.error).toBeUndefined();
    expect(result.filePath).toBe(fs.realpathSync(validImage));
  });

  test('allows legitimate employee images inside employee-images directory', () => {
    const validImage = path.join(employeeImagesDir, 'avatar456.png');
    fs.writeFileSync(validImage, 'fake-png-content');

    const formattedUrl = `kashiear-media://${validImage.replace(/\\/g, '/')}`;
    const result = validateAndResolveMediaPath(formattedUrl);

    expect(result.error).toBeUndefined();
    expect(result.filePath).toBe(fs.realpathSync(validImage));
  });

  test('blocks arbitrary files on the machine outside allowed media directories', () => {
    // Arbitrary file outside userData (e.g. sensitive document or system file)
    const sensitiveFile = path.join(os.tmpdir(), 'sensitive_document.png');
    fs.writeFileSync(sensitiveFile, 'secret-data');

    try {
      const targetUrl = `kashiear-media://${sensitiveFile.replace(/\\/g, '/')}`;
      const result = validateAndResolveMediaPath(targetUrl);

      expect(result.error).toBe('Forbidden');
      expect(result.status).toBe(403);
    } finally {
      try {
        fs.unlinkSync(sensitiveFile);
      } catch {
        /* ignore */
      }
    }
  });

  test('blocks root userData files like database and backup files', () => {
    // Attempting to read SQLite db or sensitive json in userData root
    const dbFile = path.join(tempRoot, 'shop.db');
    fs.writeFileSync(dbFile, 'sqlite-database-data');

    const targetUrl = `kashiear-media://${dbFile.replace(/\\/g, '/')}`;
    const result = validateAndResolveMediaPath(targetUrl);

    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  test('blocks path traversal attacks attempting to break out of images folder', () => {
    const secretFile = path.join(tempRoot, 'secret.png');
    fs.writeFileSync(secretFile, 'secret');

    // Attempt traversal ../secret.png
    const traversalPath = path.join(imagesDir, '..', 'secret.png');
    const targetUrl = `kashiear-media://${traversalPath.replace(/\\/g, '/')}`;
    const result = validateAndResolveMediaPath(targetUrl);

    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  test('blocks unauthorized file extensions even if inside images directory', () => {
    const executableFile = path.join(imagesDir, 'malicious.exe');
    fs.writeFileSync(executableFile, 'binary');

    const targetUrl = `kashiear-media://${executableFile.replace(/\\/g, '/')}`;
    const result = validateAndResolveMediaPath(targetUrl);

    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  test('blocks null byte (%00) injection attempts', () => {
    const targetUrl = `kashiear-media://${imagesDir.replace(/\\/g, '/')}/file.jpg%00.png`;
    const result = validateAndResolveMediaPath(targetUrl);

    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  test('returns 404 for non-existent files inside allowed directories', () => {
    const nonExistent = path.join(imagesDir, 'does-not-exist.jpg');
    const targetUrl = `kashiear-media://${nonExistent.replace(/\\/g, '/')}`;
    const result = validateAndResolveMediaPath(targetUrl);

    expect(result.error).toBe('Not Found');
    expect(result.status).toBe(404);
  });

  test('blocks directory traversal via symlinks pointing outside allowed folders', () => {
    const externalSecret = path.join(os.tmpdir(), 'external_secret.png');
    fs.writeFileSync(externalSecret, 'top-secret');

    const symlinkPath = path.join(imagesDir, 'symlink.png');
    try {
      fs.symlinkSync(externalSecret, symlinkPath);
      const targetUrl = `kashiear-media://${symlinkPath.replace(/\\/g, '/')}`;
      const result = validateAndResolveMediaPath(targetUrl);

      expect(result.error).toBe('Forbidden');
      expect(result.status).toBe(403);
    } catch (e) {
      // On Windows non-admin symlink creation might fail with EPERM, skip if so
      if (e.code !== 'EPERM') throw e;
    } finally {
      try {
        fs.unlinkSync(externalSecret);
      } catch {
        /* ignore */
      }
    }
  });

  test('blocks accessing a directory as if it were a file', () => {
    const subDir = path.join(imagesDir, 'subfolder.png');
    fs.mkdirSync(subDir);

    const targetUrl = `kashiear-media://${subDir.replace(/\\/g, '/')}`;
    const result = validateAndResolveMediaPath(targetUrl);

    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  test('handleMediaProtocolRequest returns proper Response object', async () => {
    const validImage = path.join(imagesDir, 'banner.webp');
    fs.writeFileSync(validImage, 'banner-content');

    const req = { url: `kashiear-media://${validImage.replace(/\\/g, '/')}` };
    const res = await handleMediaProtocolRequest(req);

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  });

  test('handleMediaProtocolRequest returns 403 Response for forbidden requests', async () => {
    const req = { url: 'kashiear-media:///C:/Windows/win.ini' };
    const res = await handleMediaProtocolRequest(req);

    expect(res.status).toBe(403);
  });
});
