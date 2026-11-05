// Roles and the permissions a role may be granted.
const enterpriseRepo = require('../../repositories/enterprise.repository');
const { VALID_PERMISSIONS } = require('../../security/permissions');

function getRoles() {
  return enterpriseRepo.getRoles();
}

function createRole(roleKey, roleName, description) {
  const cleanKey = String(roleKey || '').trim().toLowerCase();
  const cleanName = String(roleName || '').trim();
  const cleanDescription = String(description || '').trim();
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(cleanKey) || cleanKey === 'admin') {
    throw new Error('مفتاح الدور غير صالح أو محجوز');
  }
  if (!cleanName || cleanName.length > 80 || cleanDescription.length > 300) {
    throw new Error('اسم الدور أو وصفه غير صالح');
  }
  return enterpriseRepo.createRole(cleanKey, cleanName, cleanDescription, 0);
}

function setRolePermissions(roleKey, permissions) {
  const role = enterpriseRepo.getRoles().find((item) => item.role_key === roleKey);
  if (!role) throw new Error('الدور المطلوب غير موجود');
  if (role.role_key === 'admin') throw new Error('لا يمكن تعديل صلاحيات مدير النظام الكاملة');
  if (!Array.isArray(permissions) || permissions.length > VALID_PERMISSIONS.size) {
    throw new Error('قائمة الصلاحيات غير صالحة');
  }
  const uniquePermissions = [...new Set(permissions)];
  if (uniquePermissions.some((permission) => !VALID_PERMISSIONS.has(permission))) {
    throw new Error('تحتوي قائمة الصلاحيات على صلاحية غير معروفة');
  }
  assertCanGrantRolePermissions(roleKey, uniquePermissions);
  return enterpriseRepo.setRolePermissions(roleKey, uniquePermissions);
}

/**
 * A delegated role manager (non-owner with roles.manage) must not escalate:
 * it cannot edit its own role, and cannot grant permissions it does not hold.
 */
function assertCanGrantRolePermissions(roleKey, permissions) {
  const authService = require('../auth.service');
  const usersRepo = require('../../repositories/users.repository');
  const session = authService.requireAuth();
  const actor = usersRepo.getById(session.id);
  if (!actor) throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
  if (actor.role === 'admin' && !actor.system_role_key) return;

  if (actor.system_role_key === roleKey) {
    throw new Error('لا يمكنك تعديل صلاحيات دورك الوظيفي');
  }
  const held = new Set(enterpriseRepo.getRolePermissions(actor.system_role_key));
  const current = new Set(enterpriseRepo.getRolePermissions(roleKey));
  const escalated = permissions.filter((permission) => !current.has(permission) && !held.has(permission));
  if (escalated.length) {
    throw new Error('لا يمكنك منح صلاحيات لا تملكها');
  }
}

module.exports = {
  getRoles,
  createRole,
  setRolePermissions,
};
