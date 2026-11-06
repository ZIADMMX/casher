const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const bcrypt = require('bcryptjs');
const usersRepo = require('../repositories/users.repository');
const sessionService = require('./session.service');
const { getMachineHardwareId } = require('./license.service');
const settingsRepo = require('../repositories/settings.repository');
const { verifyRecoveryResponse } = require('../security/licenseSigning');
const permissionContext = new AsyncLocalStorage();
const { personalProfileSchema } = require('../validators/schema');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 60 * 1000; // 1 minute lockout
const loginAttempts = new Map();
const requestSession = new AsyncLocalStorage();

function recordFailedLoginAttempt(usernameKey) {
  if (!usernameKey) return;
  const current = loginAttempts.get(usernameKey) || { count: 0, lockoutUntil: 0 };
  current.count += 1;
  if (current.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
    current.lockoutUntil = Date.now() + LOGIN_LOCKOUT_MS;
    current.count = 0;
    loginAttempts.set(usernameKey, current);
    throw new Error(`تم تجاوز الحد الأقصى للمحاولات الخاطئة (${MAX_FAILED_LOGIN_ATTEMPTS} محاولات). تم قفل الحساب مؤقتًا لمدة دقيقة.`);
  } else {
    loginAttempts.set(usernameKey, current);
  }
}

const activeSessions = new Map();
let fallbackToken = null;

/**
 * Short stamp of the current password hash, embedded in every token (pwv).
 * Changing or resetting a password changes the stamp, so all tokens issued
 * before it stop working on every device.
 */
function passwordStamp(user) {
  return crypto.createHash('sha256').update(String(user?.password_hash || '')).digest('hex').slice(0, 16);
}

function persistSessionToken(token) {
  try {
    const settingsRepo = require('../repositories/settings.repository');
    settingsRepo.set('last_active_session_token', token || '');
  } catch {
    // silently ignore if DB/repo not available in unit tests
  }
}

function getPersistedSessionToken() {
  try {
    const settingsRepo = require('../repositories/settings.repository');
    return settingsRepo.get('last_active_session_token') || null;
  } catch {
    return null;
  }
}

function setSessionForCaller(callerId, token) {
  if (callerId !== undefined && callerId !== null) {
    activeSessions.set(callerId, token);
  }
  if (callerId === undefined || callerId === null || callerId === 'default') {
    fallbackToken = token;
    persistSessionToken(token);
  }
}

function getSessionToken(callerId = 'default') {
  const callerToken = activeSessions.get(callerId);
  if (callerToken) return callerToken;
  return callerId === 'default' ? fallbackToken || getPersistedSessionToken() : null;
}

function clearAllSessions() {
  for (const token of activeSessions.values()) {
    if (token) sessionService.invalidateToken(token);
  }
  if (fallbackToken) {
    sessionService.invalidateToken(fallbackToken);
  }
  activeSessions.clear();
  fallbackToken = null;
  persistSessionToken('');
}

function _resetMemoryForTesting() {
  activeSessions.clear();
  fallbackToken = null;
}

function isSetupRequired() {
  return usersRepo.countAll() === 0;
}

function generateRecoveryKey() {
  const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `REC-${rand.substring(0, 4)}-${rand.substring(4, 8)}-${rand.substring(8, 12)}`;
}

function createInitialAdmin({ username, password, fullName, phone }, callerId = 'default') {
  if (!isSetupRequired()) {
    throw new Error('تم إنشاء حساب المدير بالفعل');
  }
  if (!username || !username.trim()) {
    throw new Error('اسم المستخدم مطلوب');
  }
  if (!password || password.length < 6) {
    throw new Error('كلمة المرور لازم تكون 6 أحرف على الأقل');
  }

  const recoveryKey = generateRecoveryKey();
  const recoveryKeyHash = bcrypt.hashSync(recoveryKey, 10);

  const passwordHash = bcrypt.hashSync(password, 10);
  usersRepo.create({
    username: username.trim(),
    passwordHash,
    role: 'admin',
    fullName: fullName ? fullName.trim() : null,
    phone: phone ? phone.trim() : null,
    forcePasswordChange: false,
    recoveryKeyHash,
  });

  const loginRes = login(username.trim(), password, callerId);
  return {
    ...loginRes,
    recoveryKey,
  };
}

let dummyHash = null;
function getDummyHash() {
  if (!dummyHash) dummyHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
  return dummyHash;
}

/**
 * remember: false issues a token without binding it to a caller key. Remote
 * clients (LAN API) keep their token themselves and send it with each request.
 */
function login(username, password, callerId = 'default', { remember = true } = {}) {
  const normUser = String(username || '').trim().toLowerCase();

  // Check brute-force lockout
  const attemptInfo = loginAttempts.get(normUser);
  if (attemptInfo && attemptInfo.lockoutUntil && Date.now() < attemptInfo.lockoutUntil) {
    const remainingSeconds = Math.ceil((attemptInfo.lockoutUntil - Date.now()) / 1000);
    throw new Error(`تم قفل الحساب مؤقتًا بسبب كثرة المحاولات الخاطئة. يرجى المحاولة بعد ${remainingSeconds} ثانية.`);
  }

  const user = usersRepo.getByUsername(username);

  if (!user) {
    bcrypt.compareSync(String(password || ''), getDummyHash());
    recordFailedLoginAttempt(normUser);
    try {
      require('./audit.service').logAction({
        actionType: 'failed_login',
        title: 'محاولة تسجيل دخول فاشلة',
        details: `محاولة دخول فاشلة باسم: ${username}`,
        severity: 'danger',
      });
    } catch {}
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    recordFailedLoginAttempt(normUser);
    try {
      require('./audit.service').logAction({
        actionType: 'failed_login',
        title: 'كلمة مرور خاطئة',
        details: `كلمة مرور خاطئة للمستخدم (${user.username})`,
        userId: user.id,
        username: user.username,
        severity: 'danger',
      });
    } catch {}
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  if (user.is_active === 0) {
    try {
      require('./audit.service').logAction({
        actionType: 'failed_login',
        title: 'محاولة دخول بحساب معطل',
        details: `محاولة دخول بحساب معطل (${user.username})`,
        userId: user.id,
        username: user.username,
        severity: 'warning',
      });
    } catch {}
    throw new Error('هذا الحساب معطل حاليًا. تواصل مع المدير');
  }

  // Clear failed attempts upon successful login
  loginAttempts.delete(normUser);

  // Generate JWT token using session service
  const payload = {
    id: user.id,
    username: user.username,
    role: user.system_role_key || user.role,
    forcePasswordChange: user.force_password_change === 1,
    pwv: passwordStamp(user),
  };
  const token = sessionService.generateToken(payload);

  if (remember) setSessionForCaller(callerId, token);

  try {
    require('./audit.service').logAction({
      actionType: 'login',
      title: 'تسجيل دخول للنظام',
      details: `تسجيل دخول ناجح بصلاحية [${user.role === 'admin' ? 'مدير' : 'كاشير'}]`,
      userId: user.id,
      username: user.username,
      severity: 'success',
    });
  } catch {}

  // Return both the token and a clean user object so the renderer can
  // store the user immediately without a separate getSession round-trip.
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.system_role_key || user.role,
      systemRoleKey: user.system_role_key || null,
      permissions: getPermissionsForUser(user),
      forcePasswordChange: user.force_password_change === 1,
    },
  };
}

function logout(callerOrToken = 'default') {
  let loggedOutUser = null;
  try {
    const session = getCurrentSession(callerOrToken);
    if (session) loggedOutUser = session;
  } catch {}
  // A manager's unlock belongs to the session that got it.
  if (loggedOutUser) {
    try { require('./productEditUnlock.service').clearForUser(loggedOutUser.id); } catch {}
  }

  if (!callerOrToken || callerOrToken === 'default') {
    const token = activeSessions.get('default') || fallbackToken || getPersistedSessionToken();
    if (token) {
      sessionService.invalidateToken(token);
    }
    activeSessions.delete('default');
    fallbackToken = null;
    persistSessionToken('');
    if (loggedOutUser) {
      try {
        require('./audit.service').logAction({
          actionType: 'logout',
          title: 'تسجيل خروج من النظام',
          details: `تسجيل خروج للمستخدم (${loggedOutUser.username})`,
          userId: loggedOutUser.id,
          username: loggedOutUser.username,
          severity: 'info',
        });
      } catch {}
    }
    return;
  }

  if (typeof callerOrToken === 'string' && (callerOrToken.startsWith('eyJ') || callerOrToken.includes('.') || callerOrToken.startsWith('token-'))) {
    sessionService.invalidateToken(callerOrToken);
    for (const [key, val] of activeSessions.entries()) {
      if (val === callerOrToken) activeSessions.delete(key);
    }
    if (fallbackToken === callerOrToken) fallbackToken = null;
    if (getPersistedSessionToken() === callerOrToken) persistSessionToken('');
    if (loggedOutUser) {
      try {
        require('./audit.service').logAction({
          actionType: 'logout',
          title: 'تسجيل خروج من النظام',
          details: `تسجيل خروج للمستخدم (${loggedOutUser.username})`,
          userId: loggedOutUser.id,
          username: loggedOutUser.username,
          severity: 'info',
        });
      } catch {}
    }
    return;
  }

  const token = activeSessions.get(callerOrToken);
  if (token) {
    sessionService.invalidateToken(token);
    activeSessions.delete(callerOrToken);
    if (fallbackToken === token) fallbackToken = null;
  }
  if (activeSessions.size === 0) {
    fallbackToken = null;
    persistSessionToken('');
  }
}

/** Verify a signed token and load its user. Throws when the token is invalid or stale. */
function sessionFromToken(token) {
  const decoded = sessionService.verifyToken(token);
  const user = usersRepo.getById(decoded.id);
  if (!user || user.is_active === 0) return null;
  if (decoded.pwv !== passwordStamp(user)) throw new Error('PasswordChanged');
  const sessionRole = user.system_role_key || user.role || decoded.role;
  return {
    id: decoded.id,
    username: decoded.username,
    role: sessionRole,
    systemRoleKey: user.system_role_key || null,
    permissions: getPermissionsForUser(user),
    forcePasswordChange: decoded.forcePasswordChange === true,
  };
}

/**
 * Session for a token sent by a remote client (LAN API). Only a signed token is
 * accepted: the value is never looked up as a window/caller key, so a client
 * cannot borrow someone else's session by sending 'lan-api' or 'default'.
 */
function getSessionByToken(token) {
  if (typeof token !== 'string' || !token) return null;
  try {
    return sessionFromToken(token);
  } catch {
    return null;
  }
}

function getCurrentSession(callerOrToken = 'default') {
  if (callerOrToken === 'default' && requestSession.getStore()) {
    return requestSession.getStore();
  }
  let token = null;

  if (typeof callerOrToken === 'string' && (callerOrToken.startsWith('eyJ') || callerOrToken.includes('.') || callerOrToken.startsWith('token-'))) {
    token = callerOrToken;
  } else {
    token = activeSessions.get(callerOrToken) || (callerOrToken === 'default' ? fallbackToken : null);
    if (!token && callerOrToken === 'default') {
      const persisted = getPersistedSessionToken();
      if (persisted) {
        token = persisted;
        activeSessions.set('default', token);
        fallbackToken = token;
      }
    }
  }

  if (!token) return null;

  try {
    return sessionFromToken(token);
  } catch {
    if (typeof callerOrToken !== 'string' || (!callerOrToken.startsWith('eyJ') && !callerOrToken.includes('.') && !callerOrToken.startsWith('token-'))) {
      activeSessions.delete(callerOrToken);
      if (fallbackToken === token) fallbackToken = null;
      if (callerOrToken === 'default') persistSessionToken('');
    }
    return null;
  }
}

function runWithSession(session, callback) {
  return requestSession.run(session, callback);
}

function runWithPermission(permission, callback) {
  return permissionContext.run(permission, callback);
}

function setPermissionContext(permission) {
  permissionContext.enterWith(permission);
}

/**
 * Refresh the current session token.
 * Returns the new token + user object, or null if no active session.
 */
function refreshSession(callerOrToken = 'default') {
  let oldToken = null;
  let callerKey = callerOrToken;

  if (typeof callerOrToken === 'string' && (callerOrToken.startsWith('eyJ') || callerOrToken.includes('.') || callerOrToken.startsWith('token-'))) {
    oldToken = callerOrToken;
    callerKey = 'default';
  } else {
    oldToken = activeSessions.get(callerOrToken)
      || (callerOrToken === 'default' ? fallbackToken || getPersistedSessionToken() : null);
  }

  if (!oldToken) return null;

  try {
    // A token for a disabled account or a changed password must not be refreshed,
    // otherwise the renderer keeps showing a session that every call rejects.
    if (!getCurrentSession(oldToken)) throw new Error('SessionInvalid');
    const newToken = sessionService.refreshToken(oldToken);
    setSessionForCaller(callerKey, newToken);
    const decoded = sessionService.verifyToken(newToken);
    return {
      token: newToken,
      user: {
        id: decoded.id,
        username: decoded.username,
        role: usersRepo.getById(decoded.id)?.system_role_key || decoded.role,
        systemRoleKey: usersRepo.getById(decoded.id)?.system_role_key || null,
        permissions: getPermissionsForUser(usersRepo.getById(decoded.id) || {}),
        forcePasswordChange: decoded.forcePasswordChange === true,
      },
    };
  } catch {
    activeSessions.delete(callerKey);
    if (fallbackToken === oldToken) fallbackToken = null;
    persistSessionToken('');
    return null;
  }
}

/**
 * Get the remaining TTL (in seconds) of the current session token.
 */
function getSessionTTL(callerOrToken = 'default') {
  let token = null;
  if (typeof callerOrToken === 'string' && (callerOrToken.startsWith('eyJ') || callerOrToken.includes('.') || callerOrToken.startsWith('token-'))) {
    token = callerOrToken;
  } else {
    token = activeSessions.get(callerOrToken)
      || (callerOrToken === 'default' ? fallbackToken || getPersistedSessionToken() : null);
  }
  if (!token) return 0;
  return sessionService.getTokenTTL(token);
}

/** Guard: require any authenticated session */
function requireAuth(callerOrToken = 'default') {
  const session = getCurrentSession(callerOrToken);
  if (!session) {
    throw new Error('يجب تسجيل الدخول أولاً');
  }
  return session;
}

function getPermissionsForUser(user) {
  if (user.role === 'admin' && !user.system_role_key) return ['*'];
  if (!user.system_role_key) {
    if (user.role !== 'cashier') return [];
    // A cashier without a job role follows the "cashier" role, so the owner edits
    // cashier rights in one place (Roles screen). Defaults apply until it exists.
    try {
      const rolePermissions = require('../repositories/enterprise.repository').getRolePermissions('cashier');
      if (rolePermissions.length) return rolePermissions.filter((permission) => permission !== '*');
    } catch {
      // Roles table not ready yet (first start).
    }
    return [...require('./enterprise/defaults').CASHIER_PERMISSIONS];
  }
  return require('../repositories/enterprise.repository').getRolePermissions(user.system_role_key);
}

function requirePermission(permission, callerOrToken = 'default') {
  const session = requireAuth(callerOrToken);
  const user = usersRepo.getById(session.id);
  if (!user) throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
  if (user.role === 'admin' && !user.system_role_key) return session;
  if (!permission || permission !== permissionContext.getStore()) {
    throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
  }

  const permissions = getPermissionsForUser(user);
  const granted = permissions.includes('*')
    || permissions.includes(permission)
    || (permission.endsWith('.view') && permissions.some((item) => (
      item.startsWith(`${permission.slice(0, -'.view'.length)}.`)
      && item !== permission
    )));
  // A manager may have unlocked product editing on this device for a few minutes.
  if (!granted && !require('./productEditUnlock.service').isGranted(session, permission)) {
    if (/^products\.(create|edit|delete)$/.test(permission)) {
      // Refused product changes show up in the products history.
      try {
        require('../repositories/productChangeLog.repository').record({
          action: 'denied',
          field: permission,
          reason: 'بدون صلاحية',
          userId: session.id,
          username: session.username,
        });
      } catch {}
    }
    throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
  }
  return session;
}

/**
 * Secondary check inside an already-authorised action (e.g. a product edit that
 * also changes stock). Unlike requirePermission it does not rely on the IPC
 * permission context, so it can check a permission other than the channel's.
 */
function hasGrantedPermission(permission, callerOrToken = 'default') {
  const session = getCurrentSession(callerOrToken);
  if (!session) return false;
  const user = usersRepo.getById(session.id);
  if (!user) return false;
  const permissions = getPermissionsForUser(user);
  return permissions.includes('*') || permissions.includes(permission);
}

/** Guard: require admin role */
function requireAdmin(callerOrToken = 'default') {
  const session = getCurrentSession(callerOrToken);
  if (!session) throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
  const user = usersRepo.getById(session.id);
  if (user?.role === 'admin' && !user.system_role_key) return session;
  const permission = permissionContext.getStore();
  if (user?.system_role_key && permission) return requirePermission(permission, callerOrToken);
  throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
}

function isSystemOwner(user) {
  return user?.role === 'admin' && !user.system_role_key;
}

/** Guard: only the main admin may reset, disable or remove an admin account */
function assertCanManageTarget(actorSession, targetUserId) {
  const target = usersRepo.getById(targetUserId);
  if (!target) throw new Error('المستخدم غير موجود');
  if (target.role === 'admin' && !isSystemOwner(usersRepo.getById(actorSession.id))) {
    throw new Error('لا يمكن تعديل حساب مدير النظام إلا بواسطة المدير');
  }
  return target;
}

function addCashier({
  username, password, role, firstName, lastName, fullName, phone, email, jobTitle,
  specialty, workingHours, profileImage, payType, payAmount, commissionRate, isActive, notes, systemRoleKey,
}) {
  const actor = requireAdmin();

  if (!username || !username.trim()) {
    throw new Error('اسم المستخدم مطلوب');
  }
  if (!password || password.length < 6) {
    throw new Error('كلمة المرور لازم تكون 6 أحرف على الأقل');
  }

  const existing = usersRepo.getByUsername(username.trim());
  if (existing) {
    throw new Error('اسم المستخدم مستخدم بالفعل');
  }

  if (role === 'admin' && actor.role !== 'admin') {
    throw new Error('لا يمكن منح صلاحية مدير النظام من هذا الدور');
  }
  if (systemRoleKey) {
    if (systemRoleKey === 'admin' || role === 'admin') {
      throw new Error('لا يمكن تعيين دور مدير النظام كدور وظيفي');
    }
    const roleExists = require('../repositories/enterprise.repository')
      .getRoles().some((systemRole) => systemRole.role_key === systemRoleKey);
    if (!roleExists) throw new Error('الدور الوظيفي المحدد غير موجود');
    if (systemRoleKey === 'admin') throw new Error('لا يمكن تعيين دور مدير النظام كدور وظيفي');
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  usersRepo.create({
    username: username.trim(),
    passwordHash,
    role: role || 'cashier',
    systemRoleKey,
    firstName: firstName?.trim() || null,
    lastName: lastName?.trim() || null,
    fullName: fullName?.trim() || [firstName, lastName].filter(Boolean).map((name) => name.trim()).join(' ') || null,
    phone: phone?.trim() || null,
    email: email?.trim() || null,
    jobTitle: jobTitle?.trim() || null,
    specialty: specialty?.trim() || null,
    workingHours: workingHours?.trim() || null,
    profileImage: profileImage?.trim() || null,
    payType: payType || null,
    payAmount: payAmount ?? null,
    commissionRate: commissionRate ?? null,
    isActive: isActive !== false,
    notes: notes?.trim() || null,
    forcePasswordChange: true,
  });
  return { success: true };
}

function getAllUsers() {
  requireAdmin();
  return usersRepo.getAll();
}

function getUserDetails(userId) {
  requireAdmin();
  const details = usersRepo.getDetails(userId);
  if (!details) throw new Error('المستخدم غير موجود');
  return details;
}

function getUserActivity({ userId, type, offset = 0 }) {
  requireAdmin();
  if (!['sales', 'shifts'].includes(type)) throw new Error('نوع سجل المستخدم غير صالح');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    throw new Error('بداية سجل المستخدم غير صالحة');
  }
  if (!usersRepo.getById(userId)) throw new Error('المستخدم غير موجود');

  const limit = 20;
  const rows = type === 'sales'
    ? usersRepo.getSalesActivity(userId, limit + 1, offset)
    : usersRepo.getShiftsActivity(userId, limit + 1, offset);
  const hasMore = rows.length > limit;

  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    nextOffset: offset + Math.min(rows.length, limit),
  };
}

function resetUserPassword({ userId, password }) {
  const session = requireAdmin();
  if (session.id === userId) {
    throw new Error('لا يمكنك إعادة تعيين كلمة مرور حسابك من هذه الصفحة');
  }

  assertCanManageTarget(session, userId);
  if (!password || password.length < 6) {
    throw new Error('كلمة المرور لازم تكون 6 أحرف على الأقل');
  }

  usersRepo.updatePassword(userId, bcrypt.hashSync(password, 10));
  usersRepo.setForcePasswordChange(userId, true);
  return { success: true };
}

function toggleUserActive(userId) {
  const session = requireAdmin();

  if (session.id === userId) {
    throw new Error('لا يمكنك تعطيل حسابك الخاص وأنت مسجل دخول به');
  }

  assertCanManageTarget(session, userId);
  const users = usersRepo.getAll();
  const target = users.find((u) => u.id === userId);
  if (!target) throw new Error('المستخدم غير موجود');

  usersRepo.setActive(userId, target.is_active === 0);
  return { success: true };
}

function removeUser(userId) {
  const session = requireAdmin();

  if (session.id === userId) {
    throw new Error('لا يمكنك حذف حسابك الخاص وأنت مسجل دخول به');
  }

  assertCanManageTarget(session, userId);
  const target = usersRepo.getDetails(userId);
  if (!target) throw new Error('المستخدم غير موجود');
  usersRepo.setActive(userId, false);
  return { success: true };
}

function updateProfile({ currentPassword, newUsername, newPassword }, callerOrToken = 'default') {
  const session = requireAuth(callerOrToken);

  const user = usersRepo.getById(session.id);
  if (!user) {
    throw new Error('المستخدم غير موجود');
  }

  if (!currentPassword) {
    throw new Error('كلمة المرور الحالية مطلوبة لتأكيد التعديلات');
  }

  if (session.forcePasswordChange && (!newPassword || !newPassword.trim())) {
    throw new Error('يجب تغيير كلمة المرور قبل متابعة استخدام النظام');
  }

  const isCurrentValid = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!isCurrentValid) {
    throw new Error('كلمة المرور الحالية غير صحيحة');
  }

  let updatedUsername = session.username;

  // تغيير اسم المستخدم
  if (newUsername && newUsername.trim() && newUsername.trim() !== user.username) {
    const existing = usersRepo.getByUsername(newUsername.trim());
    if (existing && existing.id !== user.id) {
      throw new Error('اسم المستخدم الجديد مستخدم بالفعل');
    }
    usersRepo.updateUsername(user.id, newUsername.trim());
    updatedUsername = newUsername.trim();
  }

  // تغيير كلمة المرور
  let currentHash = user.password_hash;
  if (newPassword && newPassword.trim()) {
    if (newPassword.length < 6) {
      throw new Error('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    }
    currentHash = bcrypt.hashSync(newPassword, 10);
    usersRepo.updatePassword(user.id, currentHash);
    usersRepo.clearForcePasswordChange(user.id);
  }

  // Re-issue a new token with updated payload so the session stays fresh
  const newPayload = {
    id: session.id,
    username: updatedUsername,
    role: session.role,
    forcePasswordChange: false,
    pwv: passwordStamp({ password_hash: currentHash }),
  };
  const newToken = sessionService.generateToken(newPayload);

  // Invalidate old token
  const oldToken = activeSessions.get(callerOrToken) || (callerOrToken === 'default' ? fallbackToken : null);
  if (oldToken) sessionService.invalidateToken(oldToken);

  setSessionForCaller(callerOrToken, newToken);

  return {
    success: true,
    token: newToken,
    user: {
      id: session.id,
      username: updatedUsername,
      role: session.role,
      systemRoleKey: user.system_role_key || null,
      permissions: getPermissionsForUser(user),
      forcePasswordChange: false,
    },
  };
}

function getMyProfile(callerOrToken = 'default') {
  const session = requireAuth(callerOrToken);
  const profile = usersRepo.getProfileById(session.id);
  if (!profile) throw new Error('المستخدم غير موجود');
  return {
    id: profile.id,
    username: profile.username,
    role: profile.system_role_key || profile.role,
    systemRoleKey: profile.system_role_key || null,
    fullName: profile.full_name,
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: profile.email,
    phone: profile.phone,
    gender: profile.gender,
    dateOfBirth: profile.date_of_birth,
    country: profile.country,
    city: profile.city,
    address: profile.address,
    profileImage: profile.profile_image,
    createdAt: profile.created_at,
  };
}

function saveMyProfile(profile, callerOrToken = 'default') {
  const session = requireAuth(callerOrToken);
  const validatedProfile = personalProfileSchema.validate(profile);
  const result = usersRepo.updatePersonalProfile(session.id, validatedProfile);
  if (!result.changes) throw new Error('تعذر تحديث الملف الشخصي');
  return getMyProfile(callerOrToken);
}

/**
 * Forced password change (first login / after an admin reset) only.
 * Voluntary changes go through updateProfile, which verifies the current password.
 */
function changePassword(newPassword, callerOrToken = 'default') {
  const session = requireAuth(callerOrToken);
  const user = usersRepo.getById(session.id);
  if (!user || user.force_password_change !== 1) {
    throw new Error('لتغيير كلمة المرور أدخل كلمة المرور الحالية من الملف الشخصي');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('كلمة المرور لازم تكون 6 أحرف على الأقل');
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  usersRepo.updatePassword(session.id, newHash);
  usersRepo.clearForcePasswordChange(session.id);

  const newToken = sessionService.generateToken({
    id: session.id,
    username: session.username,
    role: session.role,
    forcePasswordChange: false,
    pwv: passwordStamp({ password_hash: newHash }),
  });

  const oldToken = activeSessions.get(callerOrToken) || (callerOrToken === 'default' ? fallbackToken : null);
  if (oldToken) sessionService.invalidateToken(oldToken);

  setSessionForCaller(callerOrToken, newToken);

  return {
    success: true,
    token: newToken,
    user: {
      id: session.id,
      username: session.username,
      role: session.role,
      systemRoleKey: usersRepo.getById(session.id)?.system_role_key || null,
      permissions: getPermissionsForUser(usersRepo.getById(session.id) || {}),
      forcePasswordChange: false,
    },
  };
}

const RECOVERY_CHALLENGE_KEY = 'recovery_challenge';

function utcDateStamp(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
}

function readStoredChallenge() {
  try {
    const stored = JSON.parse(settingsRepo.get(RECOVERY_CHALLENGE_KEY) || 'null');
    return stored && typeof stored.code === 'string' ? stored : null;
  } catch {
    return null;
  }
}

// One challenge per machine per UTC day, with a random nonce. Support answers it
// with an Ed25519 signature (scripts/generate-key.js recovery <challenge>), and
// it is discarded once used, so a response works once, on this machine only.
function getRecoveryChallenge(date = new Date()) {
  const dateStr = utcDateStamp(date);
  const stored = readStoredChallenge();
  if (stored && stored.date === dateStr) return stored.code;

  const nonce = crypto.randomBytes(4).toString('hex').toUpperCase();
  const code = `CHAL-${getMachineHardwareId()}-${dateStr}-${nonce}`;
  settingsRepo.set(RECOVERY_CHALLENGE_KEY, JSON.stringify({ date: dateStr, code }));
  return code;
}

function verifyRecoveryChallengeResponse(challengeCode, responseOtp) {
  if (!challengeCode || !responseOtp) return false;
  return verifyRecoveryResponse(challengeCode, responseOtp);
}

function isOpenRecoveryChallenge(challengeCode, now = Date.now()) {
  const stored = readStoredChallenge();
  if (!stored || stored.code.toUpperCase() !== challengeCode) return false;
  // Issued today or yesterday (UTC), so a response cannot be held and used later.
  return [0, 1].some((daysAgo) => utcDateStamp(new Date(now - daysAgo * 24 * 60 * 60 * 1000)) === stored.date);
}

function resetAdminPasswordWithRecoveryKey({ recoveryKey, newPassword }) {
  if (!recoveryKey || !recoveryKey.trim()) {
    throw new Error('مفتاح الطوارئ مطلوب');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف');
  }

  const admin = usersRepo.getAdmin();
  if (!admin) {
    throw new Error('لم يتم العثور على حساب المدير في النظام');
  }

  const cleanKey = recoveryKey.trim().toUpperCase().replace(/\s/g, '');
  
  if (!admin.recovery_key_hash) {
    throw new Error('لم يتم تفعيل مفتاح الطوارئ لهذا الحساب. استخدم خيار الاسترداد عبر الدعم الفني');
  }

  const isValid = bcrypt.compareSync(cleanKey, admin.recovery_key_hash);
  if (!isValid) {
    throw new Error('مفتاح الاسترداد غير صحيح. تأكد من إدخال الرمز المطبوع بدقة');
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  usersRepo.updatePassword(admin.id, newHash);
  usersRepo.clearForcePasswordChange(admin.id);

  // Generate a fresh new recovery key for future emergency
  const nextRecoveryKey = generateRecoveryKey();
  const nextRecoveryKeyHash = bcrypt.hashSync(nextRecoveryKey, 10);
  usersRepo.updateRecoveryKeyHash(admin.id, nextRecoveryKeyHash);

  return {
    success: true,
    message: 'تم إعادة تعيين كلمة مرور المدير بنجاح',
    newRecoveryKey: nextRecoveryKey,
  };
}

function resetAdminPasswordWithChallenge({ challengeCode, responseOtp, newPassword }) {
  if (!challengeCode || !challengeCode.trim()) {
    throw new Error('رمز التحدي غير صحيح');
  }
  if (!responseOtp || !responseOtp.trim()) {
    throw new Error('كود استجابة الدعم الفني مطلوب');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف');
  }

  // The challenge must be the open one this machine issued, so a response from
  // support cannot be replayed later or on another installation.
  const cleanChallenge = challengeCode.trim().toUpperCase();
  const isValid = isOpenRecoveryChallenge(cleanChallenge) && verifyRecoveryChallengeResponse(cleanChallenge, responseOtp);
  if (!isValid) {
    throw new Error('كود الاستجابة غير صحيح أو منتهي الصلاحية. تواصل مع الدعم الفني');
  }

  const admin = usersRepo.getAdmin();
  if (!admin) {
    throw new Error('لم يتم العثور على حساب المدير في النظام');
  }

  // Used up: the next request gets a new nonce, so this response is dead.
  settingsRepo.set(RECOVERY_CHALLENGE_KEY, '');

  const newHash = bcrypt.hashSync(newPassword, 10);
  usersRepo.updatePassword(admin.id, newHash);
  usersRepo.clearForcePasswordChange(admin.id);

  // Generate a fresh recovery key and save it
  const nextRecoveryKey = generateRecoveryKey();
  const nextRecoveryKeyHash = bcrypt.hashSync(nextRecoveryKey, 10);
  usersRepo.updateRecoveryKeyHash(admin.id, nextRecoveryKeyHash);

  return {
    success: true,
    message: 'تم التحقق من المطور وإعادة تعيين كلمة مرور المدير بنجاح',
    newRecoveryKey: nextRecoveryKey,
  };
}

function resetLoginAttempts() {
  loginAttempts.clear();
}

module.exports = {
  login,
  logout,
  isSetupRequired,
  createInitialAdmin,
  generateRecoveryKey,
  getRecoveryChallenge,
  verifyRecoveryChallengeResponse,
  resetAdminPasswordWithRecoveryKey,
  resetAdminPasswordWithChallenge,
  getCurrentSession,
  getSessionByToken,
  runWithSession,
  runWithPermission,
  setPermissionContext,
  refreshSession,
  getSessionTTL,
  requireAuth,
  requirePermission,
  hasGrantedPermission,
  getPermissionsForUser,
  requireAdmin,
  addCashier,
  getAllUsers,
  getUserDetails,
  getUserActivity,
  resetUserPassword,
  toggleUserActive,
  removeUser,
  updateProfile,
  getMyProfile,
  saveMyProfile,
  changePassword,
  resetLoginAttempts,
  setSessionForCaller,
  getSessionToken,
  clearAllSessions,
  _resetMemoryForTesting,
};
