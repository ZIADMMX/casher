const { db } = require('../database/db');

/**
 * Subscriptions & Packages Repository
 * SQL Queries for Packages, Customer Subscriptions, Usage Logs, and Freeze Tracking
 */

// --- PACKAGES ---

function formatPackage(pkg) {
  if (!pkg) return null;
  let eligibleServices = [];
  let branchIds = [];
  try {
    eligibleServices = pkg.eligible_services ? (typeof pkg.eligible_services === 'string' ? JSON.parse(pkg.eligible_services) : pkg.eligible_services) : [];
  } catch {
    eligibleServices = [];
  }
  try {
    branchIds = pkg.branch_ids ? (typeof pkg.branch_ids === 'string' ? JSON.parse(pkg.branch_ids) : pkg.branch_ids) : [];
  } catch {
    branchIds = [];
  }

  return {
    ...pkg,
    original_price: pkg.original_price ?? 0,
    billing_cycle: pkg.billing_cycle || 'monthly',
    is_unlimited_sessions: Number(pkg.is_unlimited_sessions || 0),
    advance_booking_days: pkg.advance_booking_days ?? 0,
    grace_period_days: pkg.grace_period_days ?? 3,
    trial_days: pkg.trial_days ?? 1,
    is_active: pkg.is_active !== undefined ? Number(pkg.is_active) : 1,
    is_featured: Number(pkg.is_featured || 0),
    badge_text: pkg.badge_text || '',
    badge_color: pkg.badge_color || '#3b82f6',
    eligible_services: eligibleServices,
    branch_ids: branchIds
  };
}

function createPackage(data) {
  const {
    name,
    type = 'session_based',
    price = 0,
    original_price = 0,
    billing_cycle = 'monthly',
    duration_days = 30,
    total_credits = 0,
    is_unlimited_sessions = 0,
    advance_booking_days = 0,
    discount_percentage = 0,
    max_freeze_days = 0,
    grace_period_days = 3,
    trial_days = 1,
    is_active = 1,
    is_featured = 0,
    badge_text = '',
    badge_color = '#3b82f6',
    eligible_services = [],
    branch_ids = [],
    description
  } = data;

  const eligibleServicesStr = typeof eligible_services === 'string' ? eligible_services : JSON.stringify(eligible_services || []);
  const branchIdsStr = typeof branch_ids === 'string' ? branch_ids : JSON.stringify(branch_ids || []);

  const result = db.prepare(`
    INSERT INTO packages (
      name, type, price, original_price, billing_cycle, duration_days,
      total_credits, is_unlimited_sessions, advance_booking_days,
      discount_percentage, max_freeze_days, grace_period_days, trial_days,
      is_active, is_featured, badge_text, badge_color,
      eligible_services, branch_ids, description
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    type,
    Number(price) || 0,
    Number(original_price) || 0,
    billing_cycle || 'monthly',
    Number(duration_days) || 30,
    Number(total_credits) || 0,
    is_unlimited_sessions ? 1 : 0,
    Number(advance_booking_days) || 0,
    Number(discount_percentage) || 0,
    Number(max_freeze_days) || 0,
    Number(grace_period_days) || 3,
    Number(trial_days) || 1,
    is_active ? 1 : 0,
    is_featured ? 1 : 0,
    badge_text || null,
    badge_color || '#3b82f6',
    eligibleServicesStr,
    branchIdsStr,
    description || null
  );

  return result.lastInsertRowid;
}

function getAllPackages() {
  const rows = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM customer_subscriptions WHERE package_id = p.id AND status = 'active') as active_subscribers_count
    FROM packages p
    ORDER BY p.created_at DESC
  `).all();

  return rows.map(formatPackage);
}

function getPackageById(id) {
  const pkg = db.prepare("SELECT * FROM packages WHERE id = ?").get(id);
  return formatPackage(pkg);
}

function updatePackage(id, data) {
  const {
    name,
    type = 'session_based',
    price = 0,
    original_price = 0,
    billing_cycle = 'monthly',
    duration_days = 30,
    total_credits = 0,
    is_unlimited_sessions = 0,
    advance_booking_days = 0,
    discount_percentage = 0,
    max_freeze_days = 0,
    grace_period_days = 3,
    trial_days = 1,
    is_active = 1,
    is_featured = 0,
    badge_text = '',
    badge_color = '#3b82f6',
    eligible_services = [],
    branch_ids = [],
    description
  } = data;

  const eligibleServicesStr = typeof eligible_services === 'string' ? eligible_services : JSON.stringify(eligible_services || []);
  const branchIdsStr = typeof branch_ids === 'string' ? branch_ids : JSON.stringify(branch_ids || []);

  db.prepare(`
    UPDATE packages 
    SET name = ?, type = ?, price = ?, original_price = ?, billing_cycle = ?, duration_days = ?,
        total_credits = ?, is_unlimited_sessions = ?, advance_booking_days = ?,
        discount_percentage = ?, max_freeze_days = ?, grace_period_days = ?, trial_days = ?,
        is_active = ?, is_featured = ?, badge_text = ?, badge_color = ?,
        eligible_services = ?, branch_ids = ?, description = ?
    WHERE id = ?
  `).run(
    name,
    type,
    Number(price) || 0,
    Number(original_price) || 0,
    billing_cycle || 'monthly',
    Number(duration_days) || 30,
    Number(total_credits) || 0,
    is_unlimited_sessions ? 1 : 0,
    Number(advance_booking_days) || 0,
    Number(discount_percentage) || 0,
    Number(max_freeze_days) || 0,
    Number(grace_period_days) || 3,
    Number(trial_days) || 1,
    is_active ? 1 : 0,
    is_featured ? 1 : 0,
    badge_text || null,
    badge_color || '#3b82f6',
    eligibleServicesStr,
    branchIdsStr,
    description || null,
    id
  );

  return getPackageById(id);
}

function deletePackage(id) {
  const activeSubs = db.prepare("SELECT COUNT(*) as count FROM customer_subscriptions WHERE package_id = ? AND status = 'active'").get(id);
  if (activeSubs.count > 0) {
    throw new Error('لا يمكن حذف باقة تحتوي على مشتركون نشطون حالياً');
  }
  db.prepare("DELETE FROM packages WHERE id = ?").run(id);
  return true;
}

// --- CUSTOMER SUBSCRIPTIONS ---

function subscribeCustomer(subscriptionData) {
  const { customer_id, package_id, start_date, end_date, total_credits, notes, auto_renew = 0 } = subscriptionData;

  const result = db.prepare(`
    INSERT INTO customer_subscriptions (customer_id, package_id, status, start_date, end_date, total_credits, remaining_credits, auto_renew, notes)
    VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)
  `).run(
    customer_id,
    package_id,
    start_date || new Date().toISOString(),
    end_date,
    total_credits || 0,
    total_credits || 0,
    auto_renew ? 1 : 0,
    notes || null
  );

  return result.lastInsertRowid;
}

function getCustomerSubscriptions(customerId) {
  return db.prepare(`
    SELECT 
      cs.*,
      p.name as package_name,
      p.type as package_type,
      p.price as package_price,
      p.discount_percentage,
      p.max_freeze_days,
      c.name as customer_name,
      c.phone as customer_phone
    FROM customer_subscriptions cs
    JOIN packages p ON cs.package_id = p.id
    JOIN customers c ON cs.customer_id = c.id
    WHERE cs.customer_id = ?
    ORDER BY cs.created_at DESC
  `).all(customerId);
}

function getAllSubscriptions(filters = {}) {
  const { status, package_id, customer_id, search, limit = 100, offset = 0 } = filters;

  let query = `
    SELECT 
      cs.*,
      p.name as package_name,
      p.type as package_type,
      p.price as package_price,
      p.discount_percentage,
      p.max_freeze_days,
      c.name as customer_name,
      c.phone as customer_phone
    FROM customer_subscriptions cs
    JOIN packages p ON cs.package_id = p.id
    JOIN customers c ON cs.customer_id = c.id
    WHERE 1=1
  `;

  const params = [];

  if (status) {
    query += ` AND cs.status = ?`;
    params.push(status);
  }
  if (package_id) {
    query += ` AND cs.package_id = ?`;
    params.push(package_id);
  }
  if (customer_id) {
    query += ` AND cs.customer_id = ?`;
    params.push(customer_id);
  }
  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR p.name LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY cs.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function getSubscriptionById(id) {
  return db.prepare(`
    SELECT 
      cs.*,
      p.name as package_name,
      p.type as package_type,
      p.price as package_price,
      p.discount_percentage,
      p.max_freeze_days,
      c.name as customer_name,
      c.phone as customer_phone
    FROM customer_subscriptions cs
    JOIN packages p ON cs.package_id = p.id
    JOIN customers c ON cs.customer_id = c.id
    WHERE cs.id = ?
  `).get(id);
}

function getActiveSubscriptionByCustomer(customerId) {
  return db.prepare(`
    SELECT 
      cs.*,
      p.name as package_name,
      p.type as package_type,
      p.price as package_price,
      p.discount_percentage,
      p.max_freeze_days
    FROM customer_subscriptions cs
    JOIN packages p ON cs.package_id = p.id
    WHERE cs.customer_id = ? AND cs.status = 'active' AND cs.end_date >= CURRENT_TIMESTAMP
    ORDER BY cs.id DESC
    LIMIT 1
  `).get(customerId);
}

function consumeCredit(subscriptionId, creditsDeducted = 1, userId = null, saleId = null, notes = null) {
  const sub = getSubscriptionById(subscriptionId);
  if (!sub) throw new Error('الاشتراك غير موجود');
  if (sub.status !== 'active') throw new Error(`الاشتراك ليس نشطاً (الحالة الحالية: ${sub.status})`);
  if (sub.package_type === 'session_based' && sub.remaining_credits < creditsDeducted) {
    throw new Error(`رصيد الجلسات غير كافٍ. المتبقي: ${sub.remaining_credits}`);
  }

  const consumeTx = db.transaction(() => {
    const newRemaining = Math.max(0, sub.remaining_credits - creditsDeducted);
    const newStatus = (sub.package_type === 'session_based' && newRemaining === 0) ? 'depleted' : 'active';

    db.prepare(`
      UPDATE customer_subscriptions 
      SET remaining_credits = ?, status = ?
      WHERE id = ?
    `).run(newRemaining, newStatus, subscriptionId);

    db.prepare(`
      INSERT INTO subscription_usage_logs (subscription_id, customer_id, user_id, sale_id, credits_deducted, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(subscriptionId, sub.customer_id, userId || null, saleId || null, creditsDeducted, notes || null);
  });

  consumeTx();
  return getSubscriptionById(subscriptionId);
}

function freezeSubscription(subscriptionId, reason = null, userId = null) {
  const sub = getSubscriptionById(subscriptionId);
  if (!sub) throw new Error('الاشتراك غير موجود');
  if (sub.status !== 'active') throw new Error('يمكن تجميد الاشتراكات النشطة فقط');

  const freezeTx = db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE customer_subscriptions 
      SET status = 'frozen', last_freeze_date = ?
      WHERE id = ?
    `).run(now, subscriptionId);

    db.prepare(`
      INSERT INTO subscription_freeze_logs (subscription_id, freeze_date, reason, user_id)
      VALUES (?, ?, ?, ?)
    `).run(subscriptionId, now, reason || null, userId || null);
  });

  freezeTx();
  return getSubscriptionById(subscriptionId);
}

function unfreezeSubscription(subscriptionId) {
  const sub = getSubscriptionById(subscriptionId);
  if (!sub) throw new Error('الاشتراك غير موجود');
  if (sub.status !== 'frozen') throw new Error('الاشتراك ليس مجتمداً');

  const unfreezeTx = db.transaction(() => {
    const freezeLog = db.prepare(`
      SELECT * FROM subscription_freeze_logs 
      WHERE subscription_id = ? AND unfreeze_date IS NULL 
      ORDER BY id DESC LIMIT 1
    `).get(subscriptionId);

    let daysFrozen = 0;
    const now = new Date();
    const nowIso = now.toISOString();

    if (freezeLog && freezeLog.freeze_date) {
      const freezeStart = new Date(freezeLog.freeze_date);
      const diffTime = Math.abs(now - freezeStart);
      daysFrozen = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      db.prepare(`
        UPDATE subscription_freeze_logs 
        SET unfreeze_date = ?, days_frozen = ? 
        WHERE id = ?
      `).run(nowIso, daysFrozen, freezeLog.id);
    }

    // Extend end_date by daysFrozen
    const oldEndDate = new Date(sub.end_date);
    oldEndDate.setDate(oldEndDate.getDate() + daysFrozen);
    const newEndDateIso = oldEndDate.toISOString();
    const totalFrozenUsed = (sub.frozen_days_used || 0) + daysFrozen;

    db.prepare(`
      UPDATE customer_subscriptions 
      SET status = 'active', end_date = ?, frozen_days_used = ?
      WHERE id = ?
    `).run(newEndDateIso, totalFrozenUsed, subscriptionId);
  });

  unfreezeTx();
  return getSubscriptionById(subscriptionId);
}

function renewSubscription(subscriptionId, additionalDays, additionalCredits = 0) {
  const sub = getSubscriptionById(subscriptionId);
  if (!sub) throw new Error('الاشتراك غير موجود');

  const renewTx = db.transaction(() => {
    const baseDate = (new Date(sub.end_date) > new Date()) ? new Date(sub.end_date) : new Date();
    baseDate.setDate(baseDate.getDate() + additionalDays);
    const newEndDateIso = baseDate.toISOString();
    const newTotalCredits = sub.total_credits + additionalCredits;
    const newRemainingCredits = sub.remaining_credits + additionalCredits;

    db.prepare(`
      UPDATE customer_subscriptions 
      SET status = 'active', end_date = ?, total_credits = ?, remaining_credits = ?
      WHERE id = ?
    `).run(newEndDateIso, newTotalCredits, newRemainingCredits, subscriptionId);
  });

  renewTx();
  return getSubscriptionById(subscriptionId);
}

function updateAutoExpirationStatus() {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE customer_subscriptions 
    SET status = 'expired' 
    WHERE status = 'active' AND end_date < ?
  `).run(now);
}

function getSubscriptionStats() {
  updateAutoExpirationStatus();

  return db.prepare(`
    SELECT 
      COUNT(*) as total_subscriptions,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
      SUM(CASE WHEN status = 'frozen' THEN 1 ELSE 0 END) as frozen_count,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_count,
      SUM(CASE WHEN status = 'depleted' THEN 1 ELSE 0 END) as depleted_count,
      (SELECT COUNT(*) FROM packages) as packages_count
    FROM customer_subscriptions
  `).get();
}

module.exports = {
  createPackage,
  getAllPackages,
  getPackageById,
  updatePackage,
  deletePackage,
  subscribeCustomer,
  getCustomerSubscriptions,
  getAllSubscriptions,
  getSubscriptionById,
  getActiveSubscriptionByCustomer,
  consumeCredit,
  freezeSubscription,
  unfreezeSubscription,
  renewSubscription,
  updateAutoExpirationStatus,
  getSubscriptionStats
};
