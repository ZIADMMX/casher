const { db } = require('../database/db');

const NotificationsRepository = {
  create({ userId = null, type, title, message, linkPage = null }) {
    const stmt = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link_page)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(userId, type, title, message, linkPage);
    return this.getById(res.lastInsertRowid);
  },

  getById(id) {
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) || null;
  },

  getAll({ limit = 50, onlyUnread = false, userId = null } = {}) {
    const clauses = ['(user_id IS NULL OR user_id = ?)'];
    const params = [userId];
    if (onlyUnread) {
      clauses.push('is_read = 0');
    }
    const query = [
      'SELECT * FROM notifications',
      clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      'ORDER BY id DESC LIMIT ?',
    ].filter(Boolean).join(' ');
    return db.prepare(query).all(...params, limit);
  },

  getUnreadCount(userId = null) {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE is_read = 0 AND (user_id IS NULL OR user_id = ?)
    `).get(userId);
    return row ? row.count : 0;
  },

  markAsRead(id, userId = null) {
    const stmt = db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE id = ? AND (user_id IS NULL OR user_id = ?)
    `);
    stmt.run(id, userId);
    return db.prepare(`
      SELECT * FROM notifications
      WHERE id = ? AND (user_id IS NULL OR user_id = ?)
    `).get(id, userId) || null;
  },

  markAllAsRead(userId = null) {
    const stmt = db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE is_read = 0 AND (user_id IS NULL OR user_id = ?)
    `);
    const res = stmt.run(userId);
    return { affected: res.changes };
  },

  clearAll() {
    const stmt = db.prepare('DELETE FROM notifications');
    const res = stmt.run();
    return { affected: res.changes };
  },

  deleteOlderThan(days = 30) {
    const stmt = db.prepare("DELETE FROM notifications WHERE created_at < datetime('now', '-' || ? || ' days')");
    return stmt.run(days);
  }
};

module.exports = NotificationsRepository;
