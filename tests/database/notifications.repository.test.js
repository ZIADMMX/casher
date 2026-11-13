const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
const repo = require('../../electron/repositories/notifications.repository');
const NotificationsService = require('../../electron/services/notifications.service');

describe('notifications repository', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
  });
  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });
  beforeEach(() => db.exec('DELETE FROM notification_reads; DELETE FROM notifications;'));

  it('keeps read state per user for shared notifications', () => {
    const shared = repo.create({ type: 'info', title: 't', message: 'm' });
    repo.markAsRead(shared.id, 1);

    expect(repo.getUnreadCount(1)).toBe(0);
    expect(repo.getUnreadCount(2)).toBe(1);
    expect(repo.getAll({ userId: 2 })[0].is_read).toBe(0);
    expect(repo.getAll({ userId: 1 })[0].is_read).toBe(1);

    expect(repo.markAllAsRead(2)).toEqual({ affected: 1 });
    expect(repo.getUnreadCount(2)).toBe(0);
  });

  it('hides another user\'s personal notification and refuses to mark it', () => {
    const owner = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('n_owner', 'x', 'cashier')").run().lastInsertRowid;
    const mine = repo.create({ userId: owner, type: 'info', title: 't', message: 'm' });
    expect(repo.getAll({ userId: owner })).toHaveLength(1);
    expect(repo.getAll({ userId: 2 })).toHaveLength(0);
    expect(repo.markAsRead(mine.id, 2)).toBeNull();
  });

  it('raises the same low-stock alert once per day', () => {
    const alert = { type: 'low_stock', title: 'low', message: 'left 3', dedupeKey: 'low_stock:7' };
    expect(NotificationsService.notify(alert)).not.toBeNull();
    expect(NotificationsService.notify({ ...alert, message: 'left 2' })).toBeNull();
    expect(NotificationsService.notify({ ...alert, dedupeKey: 'low_stock:8' })).not.toBeNull();
  });

  it('shows per-action activity notes to admins only', () => {
    require('../../electron/services/activityNotifications').recordActivity('products:delete', { username: 'ali' });
    repo.create({ type: 'info', title: 't', message: 'm' });

    const note = repo.getAll({ userId: 1, withActivity: true }).find((n) => n.type === 'activity');
    expect(repo.getAll({ userId: 1, withActivity: true })).toHaveLength(2);
    expect(note).toMatchObject({ type: 'activity', title: 'حذف / إلغاء في المنتجات' });
    expect(note.message).toContain('ali');
    expect(repo.getAll({ userId: 2 })).toHaveLength(1);
    expect(repo.getUnreadCount(2)).toBe(1);
    expect(repo.markAsRead(note.id, 2)).toBeNull();
  });

  it('skips activity notes for the notifications screen itself', () => {
    require('../../electron/services/activityNotifications').recordActivity('notifications:markAsRead', {});
    expect(repo.getAll({ userId: 1, withActivity: true })).toHaveLength(0);
  });

  it('deletes notifications older than the cutoff with their read rows', () => {
    const old = repo.create({ type: 'info', title: 't', message: 'm' });
    repo.markAsRead(old.id, 1);
    db.prepare("UPDATE notifications SET created_at = datetime('now', '-100 days') WHERE id = ?").run(old.id);
    repo.create({ type: 'info', title: 'new', message: 'm' });

    repo.deleteOlderThan(90);
    expect(db.prepare('SELECT COUNT(*) c FROM notifications').get().c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM notification_reads').get().c).toBe(0);
  });
});
