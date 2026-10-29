export function hasPermission(user, permission) {
  if (user?.role === 'admin' || user?.permissions?.includes('*')) return true;
  const permissions = user?.permissions || [];
  if (permissions.includes(permission)) return true;
  if (!permission?.endsWith('.view')) return false;
  const permissionPrefix = `${permission.slice(0, -'.view'.length)}.`;
  return permissions.some((granted) => granted.startsWith(permissionPrefix));
}
