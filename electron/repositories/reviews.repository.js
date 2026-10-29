const { db } = require('../database/db');

function getPromptData(tenantId, userId) {
  db.prepare(`
    INSERT OR IGNORE INTO review_prompt_state (tenant_id, user_id)
    VALUES (?, ?)
  `).run(tenantId, userId);

  const state = db.prepare(`
    SELECT first_seen_at, last_prompted_at,
      julianday('now') - julianday(first_seen_at) >= 14 AS has_used_14_days,
      last_prompted_at IS NULL
        OR julianday('now') - julianday(last_prompted_at) >= 90 AS cooldown_complete
    FROM review_prompt_state
    WHERE tenant_id = ? AND user_id = ?
  `).get(tenantId, userId);

  const activity = tenantId === 'local'
    ? db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM sales WHERE user_id = ?) +
        (SELECT COUNT(*) FROM appointments
          WHERE created_by_user_id = ? AND status = 'completed') +
        (SELECT COUNT(*) FROM orders
          WHERE created_by_user_id = ? AND status = 'delivered' AND appointment_id IS NULL)
        AS successful_transactions
    `).get(userId, userId, userId)
    : db.prepare(`
      SELECT COUNT(*) AS successful_transactions
      FROM review_activity
      WHERE tenant_id = ? AND user_id = ?
    `).get(tenantId, userId);

  return {
    firstSeenAt: state.first_seen_at,
    lastPromptedAt: state.last_prompted_at,
    hasUsed14Days: Boolean(state.has_used_14_days),
    cooldownComplete: Boolean(state.cooldown_complete),
    successfulTransactions: activity.successful_transactions,
    hasEnoughTransactions: activity.successful_transactions >= 30,
  };
}

function recordRemoteActivity(tenantId, userId, activityType, activityId) {
  if (!['sale', 'appointment'].includes(activityType) || !activityId) return false;
  return db.prepare(`
    INSERT OR IGNORE INTO review_activity (tenant_id, user_id, activity_type, activity_id)
    VALUES (?, ?, ?, ?)
  `).run(tenantId, userId, activityType, String(activityId)).changes > 0;
}

function markPrompted(tenantId, userId) {
  return db.prepare(`
    UPDATE review_prompt_state
    SET last_prompted_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND user_id = ?
  `).run(tenantId, userId);
}

function getReview(tenantId, userId) {
  const review = db.prepare(`
    SELECT rating, tags, comment, consent, status, created_at, updated_at
    FROM reviews
    WHERE tenant_id = ? AND user_id = ?
  `).get(tenantId, userId);
  if (!review) return null;
  return {
    ...review,
    tags: JSON.parse(review.tags || '[]'),
    consent: Boolean(review.consent),
  };
}

function getSector() {
  return db.prepare('SELECT selected_sector FROM onboarding_state WHERE id = 1').get()?.selected_sector || null;
}

function saveReview(tenantId, userId, review) {
  const saveTransaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO reviews (
        tenant_id, user_id, rating, tags, comment, status, sector, app_version, consent
      )
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      ON CONFLICT(tenant_id, user_id) DO UPDATE SET
        rating = excluded.rating,
        tags = excluded.tags,
        comment = excluded.comment,
        status = 'pending',
        sector = excluded.sector,
        app_version = excluded.app_version,
        consent = excluded.consent,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      tenantId,
      userId,
      review.rating,
      JSON.stringify(review.tags),
      review.comment || null,
      review.sector,
      review.appVersion,
      review.consent ? 1 : 0,
    );

    db.prepare(`
      INSERT INTO review_sync_queue (tenant_id, user_id, payload_json)
      VALUES (?, ?, ?)
      ON CONFLICT(tenant_id, user_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(tenantId, userId, JSON.stringify(review));
  });
  saveTransaction();
  return getReview(tenantId, userId);
}

function getPendingSync(tenantId, userId) {
  const entries = tenantId !== undefined && userId !== undefined
    ? db.prepare(`
      SELECT id, tenant_id, user_id, payload_json
      FROM review_sync_queue
      WHERE tenant_id = ? AND user_id = ?
      ORDER BY id ASC
    `).all(tenantId, userId)
    : db.prepare(`
      SELECT id, tenant_id, user_id, payload_json
      FROM review_sync_queue
      ORDER BY id ASC
    `).all();
  return entries.map((entry) => ({
    id: entry.id,
    tenantId: entry.tenant_id,
    userId: entry.user_id,
    payload: JSON.parse(entry.payload_json),
  }));
}

function removePendingSync(id) {
  return db.prepare('DELETE FROM review_sync_queue WHERE id = ?').run(id);
}

function getPendingSyncCount(tenantId, userId) {
  if (tenantId !== undefined && userId !== undefined) {
    return db.prepare(`
      SELECT COUNT(*) AS count FROM review_sync_queue
      WHERE tenant_id = ? AND user_id = ?
    `).get(tenantId, userId).count;
  }
  return db.prepare('SELECT COUNT(*) AS count FROM review_sync_queue').get().count;
}

module.exports = {
  getPromptData,
  recordRemoteActivity,
  markPrompted,
  getReview,
  getSector,
  saveReview,
  getPendingSync,
  removePendingSync,
  getPendingSyncCount,
};
