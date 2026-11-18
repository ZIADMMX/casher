const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mockStore = {};
jest.mock('../../electron/repositories/settings.repository', () => ({
  get: jest.fn((key) => (key in mockStore ? mockStore[key] : null)),
  set: jest.fn((key, value) => { mockStore[key] = String(value ?? ''); }),
}));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn(() => ({ id: 1 })) }));
jest.mock('../../electron/services/logger.service', () => ({ logError: jest.fn() }));
jest.mock('electron', () => ({ dialog: { showOpenDialog: jest.fn() } }));

const { dialog } = require('electron');
const notifications = require('../../electron/services/notifications.service');
const externalBackup = require('../../electron/services/externalBackup.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
let root;
let source;

beforeEach(() => {
  for (const key of Object.keys(mockStore)) delete mockStore[key];
  jest.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-external-'));
  source = path.join(root, 'daily.db');
  fs.writeFileSync(source, 'database bytes');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function usb() {
  const dir = path.join(root, 'usb');
  fs.mkdirSync(dir);
  return dir;
}

describe('externalBackup.service', () => {
  test('does nothing until a folder is chosen', () => {
    expect(externalBackup.copyToExternal(source, NOW)).toMatchObject({ success: false, skipped: true, reason: 'not_configured' });
    expect(externalBackup.getStatus(NOW)).toMatchObject({ configured: false, stale: true });
  });

  test('copies the backup into <folder>/foxcloud-backups with the day in the name', () => {
    const dir = usb();
    externalBackup.setFolder(dir);

    const result = externalBackup.copyToExternal(source, NOW);

    expect(result.success).toBe(true);
    const copy = path.join(dir, externalBackup.SUBFOLDER, 'foxcloud-2026-11-18.db');
    expect(result.filePath).toBe(copy);
    expect(fs.readFileSync(copy, 'utf8')).toBe('database bytes');
    expect(mockStore[externalBackup.LAST_KEY]).toBe(String(NOW));
    expect(externalBackup.getStatus(NOW)).toMatchObject({ configured: true, available: true, stale: false, daysSinceLast: 0 });
  });

  test('copies once a day, not on every run', () => {
    externalBackup.setFolder(usb());
    externalBackup.copyToExternal(source, NOW);
    expect(externalBackup.copyToExternal(source, NOW + 60_000)).toMatchObject({ success: true, skipped: true });
  });

  test('keeps only the newest copies', () => {
    const dir = usb();
    externalBackup.setFolder(dir);
    for (let day = 0; day < externalBackup.KEEP_COPIES + 3; day++) {
      externalBackup.copyToExternal(source, NOW + day * DAY_MS);
    }
    const copies = fs.readdirSync(path.join(dir, externalBackup.SUBFOLDER)).filter((f) => f.endsWith('.db'));
    expect(copies).toHaveLength(externalBackup.KEEP_COPIES);
    expect(copies.sort()[0]).toBe('foxcloud-2026-11-21.db');
  });

  test('a missing USB stick is reported, not thrown', () => {
    const dir = usb();
    externalBackup.setFolder(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.writeFileSync(dir, 'not a folder'); // the drive letter now points somewhere unwritable

    expect(externalBackup.copyToExternal(source, NOW)).toMatchObject({ success: false, reason: 'unavailable' });
    expect(externalBackup.getStatus(NOW).available).toBe(false);
  });

  test('refuses a relative or unwritable folder', () => {
    expect(() => externalBackup.setFolder('relative/path')).toThrow('مسار المجلد غير صالح');
    const file = path.join(root, 'a-file');
    fs.writeFileSync(file, 'x');
    expect(() => externalBackup.setFolder(file)).toThrow('لا يمكن الكتابة');
    expect(mockStore[externalBackup.DIR_KEY]).toBeUndefined();
  });

  test('reminds when nothing left the PC in more than 3 days', () => {
    externalBackup.setFolder(usb());
    externalBackup.copyToExternal(source, NOW);

    expect(externalBackup.remindIfStale(NOW + 2 * DAY_MS)).toBeNull();
    externalBackup.remindIfStale(NOW + 4 * DAY_MS);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning',
      dedupeKey: 'external-backup-stale',
      message: expect.stringContaining('4 يوم'),
    }));
  });

  test('reminds an owner who never chose a folder', () => {
    externalBackup.remindIfStale(NOW);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('نفس الجهاز') }));
  });

  test('clearFolder stops the copies', () => {
    externalBackup.setFolder(usb());
    externalBackup.clearFolder();
    expect(externalBackup.getStatus(NOW).configured).toBe(false);
  });

  test('chooseFolder saves the picked folder and reports a cancel', async () => {
    const dir = usb();
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await externalBackup.chooseFolder()).toEqual({ success: false, canceled: true });

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [dir] });
    expect(await externalBackup.chooseFolder()).toEqual({ success: true });
    expect(mockStore[externalBackup.DIR_KEY]).toBe(dir);
  });
});
