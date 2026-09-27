const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const usersRepo = require('../repositories/users.repository');
const sessionService = require('./session.service');
const { getMachineHardwareId, DEVELOPER_MASTER_SECRET } = require('./license.service');

let currentToken = null;

function isSetupRequired() {
  return usersRepo.countAll() === 0;
}

function generateRecoveryKey() {
  const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `REC-${rand.substring(0, 4)}-${rand.substring(4, 8)}-${rand.substring(8, 12)}`;
}

function createInitialAdmin({ username, password }) {
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
    forcePasswordChange: false,
    recoveryKeyHash,
  });

  const loginRes = login(username.trim(), password);
  return {
    ...loginRes,
    recoveryKey,
  };
}

function login(username, password) {
  const user = usersRepo.getByUsername(username);

  if (!user) {
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  if (user.is_active === 0) {
    throw new Error('هذا الحساب معطل حاليًا. تواصل مع المدير');
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  // Generate JWT token using session service
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    forcePasswordChange: user.force_password_change === 1,
  };
  const token = sessionService.generateToken(payload);
  currentToken = token;

  // Return both the token and a clean user object so the renderer can
  // store the user immediately without a separate getSession round-trip.
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      forcePasswordChange: user.force_password_change === 1,
    },
  };
}

function logout() {
  if (currentToken) {
    sessionService.invalidateToken(currentToken);
  }
  currentToken = null;
}

function getCurrentSession() {
  if (!currentToken) return null;
  try {
    const decoded = sessionService.verifyToken(currentToken);
    return {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      forcePasswordChange: decoded.forcePasswordChange === true,
    };
  } catch {
    currentToken = null;
    return null;
  }
}

/**
 * Refresh the current session token.
 * Returns the new token + user object, or null if no active session.
 */
function refreshSession() {
  if (!currentToken) return null;
  try {
    const newToken = sessionService.refreshToken(currentToken);
    currentToken = newToken;
    const decoded = sessionService.verifyToken(newToken);
    return {
      token: newToken,
      user: {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
        forcePasswordChange: decoded.forcePasswordChange === true,
      },
    };
  } catch {
    currentToken = null;
    return null;
  }
}

/**
 * Get the remaining TTL (in seconds) of the current session token.
 */
function getSessionTTL() {
  if (!currentToken) return 0;
  return sessionService.getTokenTTL(currentToken);
}

/** Guard: require any authenticated session */
function requireAuth() {
  const session = getCurrentSession();
  if (!session) {
    throw new Error('يجب تسجيل الدخول أولاً');
  }
  return session;
}

/** Guard: require admin role */
function requireAdmin() {
  const session = getCurrentSession();
  if (!session || session.role !== 'admin') {
    throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
  }
  return session;
}

function addCashier({ username, password }) {
  requireAdmin();

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

  const passwordHash = bcrypt.hashSync(password, 10);
  usersRepo.create({ username: username.trim(), passwordHash, role: 'cashier' });
  return { success: true };
}

function getAllUsers() {
  requireAdmin();
  return usersRepo.getAll();
}

function toggleUserActive(userId) {
  const session = requireAdmin();

  if (session.id === userId) {
    throw new Error('لا يمكنك تعطيل حسابك الخاص وأنت مسجل دخول به');
  }

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

  usersRepo.remove(userId);
  return { success: true };
}

function updateProfile({ currentPassword, newUsername, newPassword }) {
  const session = requireAuth();

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
  if (newPassword && newPassword.trim()) {
    if (newPassword.length < 6) {
      throw new Error('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    }
    const newHash = bcrypt.hashSync(newPassword, 10);
    usersRepo.updatePassword(user.id, newHash);
    usersRepo.clearForcePasswordChange(user.id);
  }

  // Re-issue a new token with updated payload so the session stays fresh
  const newPayload = {
    id: session.id,
    username: updatedUsername,
    role: session.role,
    forcePasswordChange: false,
  };
  const newToken = sessionService.generateToken(newPayload);
  // Invalidate old token
  if (currentToken) sessionService.invalidateToken(currentToken);
  currentToken = newToken;

  return {
    success: true,
    user: {
      id: session.id,
      username: updatedUsername,
      role: session.role,
      forcePasswordChange: false,
    },
  };
}

function changePassword(newPassword) {
  const session = requireAuth();

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
  });
  if (currentToken) sessionService.invalidateToken(currentToken);
  currentToken = newToken;

  return {
    success: true,
    token: newToken,
    user: {
      id: session.id,
      username: session.username,
      role: session.role,
      forcePasswordChange: false,
    },
  };
}

function getRecoveryChallenge() {
  const hwid = getMachineHardwareId();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const nonce = crypto
    .createHmac('sha256', DEVELOPER_MASTER_SECRET)
    .update(`CHAL:${hwid}:${dateStr}`)
    .digest('hex')
    .substring(0, 4)
    .toUpperCase();
  return `CHAL-${hwid}-${dateStr}-${nonce}`;
}

function generateDeveloperRecoveryOtp(challengeCode) {
  if (!challengeCode || typeof challengeCode !== 'string') return null;
  const cleanCode = challengeCode.trim().toUpperCase();
  const hash = crypto
    .createHmac('sha256', DEVELOPER_MASTER_SECRET)
    .update(`RESP:${cleanCode}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();
  return `${hash.substring(0, 4)}-${hash.substring(4, 8)}`;
}

function verifyRecoveryChallengeResponse(challengeCode, responseOtp) {
  if (!challengeCode || !responseOtp) return false;
  const expected = generateDeveloperRecoveryOtp(challengeCode);
  if (!expected) return false;
  const cleanExpected = expected.replace(/-/g, '').toUpperCase();
  const cleanInput = responseOtp.trim().replace(/[-\s]/g, '').toUpperCase();
  return cleanExpected === cleanInput;
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

  const isValid = verifyRecoveryChallengeResponse(challengeCode, responseOtp);
  if (!isValid) {
    throw new Error('كود الاستجابة غير صحيح أو منتهي الصلاحية. تواصل مع الدعم الفني');
  }

  const admin = usersRepo.getAdmin();
  if (!admin) {
    throw new Error('لم يتم العثور على حساب المدير في النظام');
  }

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

module.exports = {
  login,
  logout,
  isSetupRequired,
  createInitialAdmin,
  generateRecoveryKey,
  getRecoveryChallenge,
  generateDeveloperRecoveryOtp,
  verifyRecoveryChallengeResponse,
  resetAdminPasswordWithRecoveryKey,
  resetAdminPasswordWithChallenge,
  getCurrentSession,
  refreshSession,
  getSessionTTL,
  requireAuth,
  requireAdmin,
  addCashier,
  getAllUsers,
  toggleUserActive,
  removeUser,
  updateProfile,
  changePassword,
};
