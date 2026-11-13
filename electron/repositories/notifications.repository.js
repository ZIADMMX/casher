const { db } = require('../database/db');

// Read state is per user (notification_reads); the legacy is_read column still counts for old rows.
const IS_READ = `(n.is_read = 1 OR EXISTS (
  SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = @userId
))`;
// Activity notes (every save/edit/delete) are for admins only.
const VISIBLE = "(n.user_id IS NULL OR n.user_id = @userId) AND (@withActivity = 1 OR n.type != 'activity')";

const NotificationsRepository = {
  create({ userId = null, type, title, message, linkPage = null, dedupeKey = null }) {
    const res = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link_page, dedupe_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, type, title, message, linkPage, dedupeKey);
    return this.getById(res.lastInsertRowid);
  },

  // Same alert (same key, same target user) already raised within the last N hours.
  existsRecent(dedupeKey, userId = null, hours = 24) {
    return Boolean(db.prepare(`
      SELECT 1 FROM notifications
      WHERE dedupe_key = ? AND user_id IS ?
        AND created_at >= datetime('now', '-' || ? || ' hours')
      LIMIT 1
    `).get(dedupeKey, userId, hours));
  },

  getById(id) {
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) || null;
  },

  getAll({ limit = 50, onlyUnread = false, userId = null, withActivity = false } = {}) {
    return db.prepare(`
      SELECT n.*, CASE WHEN ${IS_READ} THEN 1 ELSE 0 END AS is_read
      FROM notifications n
      WHERE ${VISIBLE} ${onlyUnread ? `AND NOT ${IS_READ}` : ''}
      ORDER BY n.id DESC LIMIT @limit
    `).all({ userId, limit, withActivity: withActivity ? 1 : 0 });
  },

  getUnreadCount(userId = null, withActivity = false) {
    const row = db.prepare(`
      SELECT COUNT(*) AS count FROM notifications n WHERE ${VISIBLE} AND NOT ${IS_READ}
    `).get({ userId, withActivity: withActivity ? 1 : 0 });
    return row ? row.count : 0;
  },

  markAsRead(id, userId = null, withActivity = false) {
    const visible = db.prepare(`SELECT 1 FROM notifications n WHERE n.id = @id AND ${VISIBLE}`).get({ id, userId, withActivity: withActivity ? 1 : 0 });
    if (!visible) return null;
    if (userId != null) {
      db.prepare('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)').run(id, userId);
    }
    return db.prepare(`
      SELECT n.*, CASE WHEN ${IS_READ} THEN 1 ELSE 0 END AS is_read FROM notifications n WHERE n.id = @id
    `).get({ id, userId }) || null;
  },

  markAllAsRead(userId = null, withActivity = false) {
    if (userId == null) return { affected: 0 };
    const res = db.prepare(`
      INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
      SELECT n.id, @userId FROM notifications n WHERE ${VISIBLE} AND NOT ${IS_READ}
    `).run({ userId, withActivity: withActivity ? 1 : 0 });
    return { affected: res.changes };
  },

  clearAll() {
    return db.transaction(() => {
      db.prepare('DELETE FROM notification_reads').run();
      return { affected: db.prepare('DELETE FROM notifications').run().changes };
    })();
  },

  deleteOlderThan(days = 90) {
    return db.transaction(() => {
      db.prepare(`
        DELETE FROM notification_reads WHERE notification_id IN (
          SELECT id FROM notifications WHERE created_at < datetime('now', '-' || ? || ' days')
        )
      `).run(days);
      return db.prepare("DELETE FROM notifications WHERE created_at < datetime('now', '-' || ? || ' days')").run(days);
    })();
  },
};

module.exports = NotificationsRepository;
