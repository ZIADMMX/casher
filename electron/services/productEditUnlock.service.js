/**
 * "Unlock with manager code" for the products screen.
 *
 * A user without product-edit rights (e.g. a cashier) can ask the owner or a
 * branch manager to type their own username and password at the same machine.
 * When the credentials check out and that person really holds the product
 * permissions, this session gets them until someone presses "lock now", the
 * user logs out, or the app restarts. Every edit made meanwhile is recorded
 * with both names.
 *
 * - Grants live in memory only (a restart locks everything again).
 * - Grants are honoured for local IPC calls only, never for LAN/API requests.
 * - Only products.create / products.edit / products.delete can be lent, and only
 *   the ones the manager has. Stock (inventory.*) is never lent.
 * - Wrong codes are counted per user and lock the unlock form for a while.
 */
const bcrypt = require('bcryptjs');
const usersRepo = require('../repositories/users.repository');
const productLog = require('../repositories/productChangeLog.repository');

const LENDABLE = ['products.create', 'products.edit', 'products.delete'];
const MAX_FAILURES = 3;
const LOCKOUT_MS = 5 * 60 * 1000;

const grants = new Map(); // userId -> { managerId, managerName, permissions, grantedAt }
const failures = new Map(); // userId -> { count, lockedUntil }

let cachedDummyHash = null;
function dummyHash() {
  if (!cachedDummyHash) cachedDummyHash = bcrypt.hashSync(require('node:crypto').randomBytes(16).toString('hex'), 10);
  return cachedDummyHash;
}

// Lazy to avoid a require cycle (auth.service checks grants from requirePermission).
function auth() {
  return require('./auth.service');
}

function permissionsOf(user) {
  return auth().getPermissionsForUser(user);
}

function has(permissions, permission) {
  return permissions.includes('*') || permissions.includes(permission);
}

function activeGrant(userId) {
  const grant = grants.get(userId);
  if (!grant) return null;
  return grant;
}

/** Grant covering this permission for this session, or null. Local sessions only. */
function getGrant(session, permission) {
  if (!session || session.centralRequest) return null;
  if (!LENDABLE.includes(permission)) return null;
  const grant = activeGrant(session.id);
  return grant && grant.permissions.includes(permission) ? grant : null;
}

function isGranted(session, permission) {
  return Boolean(getGrant(session, permission));
}

function describe(session) {
  const grant = session ? activeGrant(session.id) : null;
  if (!grant) return null;
  return {
    managerName: grant.managerName,
    permissions: [...grant.permissions],
    grantedAt: new Date(grant.grantedAt).toISOString(),
  };
}

function recordFailure(userId) {
  const entry = failures.get(userId) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.count = 0;
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  failures.set(userId, entry);
  return entry;
}

function unlock({ username, password } = {}) {
  const session = auth().requireAuth();
  if (session.centralRequest) throw new Error('فتح التعديل متاح على الجهاز نفسه فقط');

  const lock = failures.get(session.id);
  if (lock?.lockedUntil && Date.now() < lock.lockedUntil) {
    const minutes = Math.ceil((lock.lockedUntil - Date.now()) / 60000);
    throw new Error(`محاولات خاطئة كثيرة. جرّب تاني بعد ${minutes} دقيقة`);
  }

  const name = typeof username === 'string' ? username.trim().slice(0, 100) : '';
  const code = typeof password === 'string' ? password.slice(0, 200) : '';
  if (!name || !code) throw new Error('اكتب اسم دخول المدير وكلمة السر');

  const manager = usersRepo.getByUsername(name);
  // Always run bcrypt so a missing username takes as long as a wrong code.
  const matches = bcrypt.compareSync(code, manager?.password_hash || dummyHash());
  const valid = Boolean(manager && manager.is_active !== 0 && matches);
  const lent = valid ? LENDABLE.filter((permission) => has(permissionsOf(manager), permission)) : [];

  if (!valid || !lent.includes('products.edit') || manager.id === session.id) {
    const entry = recordFailure(session.id);
    productLog.record({
      action: 'unlock_denied',
      reason: !valid ? 'كود غلط' : manager.id === session.id ? 'نفس المستخدم' : 'المستخدم ليس مدير ولا مدير فرع',
      userId: session.id,
      username: session.username,
    });
    if (entry.lockedUntil > Date.now()) {
      throw new Error('محاولات خاطئة كثيرة. تم قفل فتح التعديل لمدة 5 دقائق');
    }
    if (valid && manager.id === session.id) throw new Error('لازم مدير تاني يكتب كوده');
    throw new Error(valid ? 'الحساب ده مش مدير ولا مدير فرع، فمينفعش يفتح التعديل' : 'اسم المدير أو كلمة السر غير صحيحة');
  }

  failures.delete(session.id);
  const grant = {
    managerId: manager.id,
    managerName: manager.full_name || manager.username,
    permissions: lent,
    grantedAt: Date.now(),
  };
  grants.set(session.id, grant);
  productLog.record({
    action: 'unlock',
    reason: 'فتح التعديل لحد القفل أو الخروج',
    userId: session.id,
    username: session.username,
    approvedById: grant.managerId,
    approvedByName: grant.managerName,
  });
  return describe(session);
}

function lockNow() {
  const session = auth().getCurrentSession();
  if (session) grants.delete(session.id);
  return { success: true };
}

/** Logout ends that user's unlock. */
function clearForUser(userId) {
  grants.delete(userId);
}

function _resetForTesting() {
  grants.clear();
  failures.clear();
}

module.exports = {
  LENDABLE,
  getGrant,
  isGranted,
  describe,
  unlock,
  lockNow,
  clearForUser,
  _resetForTesting,
};
