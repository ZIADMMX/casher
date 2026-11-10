const permissionGroups = require('../../shared/permissions.json');

const VALID_PERMISSIONS = new Set(permissionGroups.flatMap((group) => group.permissions));

const RESOURCE_PERMISSIONS = {
  'users': 'team',
  'attendance': 'attendance',
  'leaves': 'leaves',
  'products': 'products',
  'variants': 'products',
  'categories': 'products',
  'inventory': 'inventory',
  'branches': 'inventory',
  'sales': 'pos',
  'tables': 'pos',
  'returns': 'pos',
  'customers': 'customers',
  'crm': 'customers',
  'suppliers': 'suppliers',
  'purchases': 'purchases',
  'subscriptions': 'subscriptions',
  'packages': 'subscriptions',
  'commissions': 'commissions',
  'reports': 'reports',
  'settings': 'settings',
  'enterprise': 'enterprise',
  'shifts': 'shifts',
  'appointments': 'appointments',
  'cases': 'cases',
  'courts': 'cases',
  'salon': 'pos',
  'grocery': 'pos',
  'promotions': 'promotions',
  'channels': 'channels',
  'ai': 'ai',
  'license': 'settings',
  'lan': 'settings',
  'audit': 'team',
  'import': 'team',
  'export': 'sales',
  'backup': 'settings',
  'notifications': 'settings',
  'print': 'pos',
  'ui-config': 'settings',
  'uiConfig': 'settings',
  'onboarding': 'settings',
  'system': 'settings',
};

function isReadAction(action) {
  return /^(get|list|find|search|check|preview|current|status|diagnostics|history|summary|stats|kpis|by|select|analyze|predict|suggest|detect|ask|generate)/i.test(action);
}

/**
 * Stock is money: viewing, moving, adjusting/counting and configuring stock each
 * need their own permission, separate from editing product details (products.edit).
 */
function getInventoryPermission(action, isRead) {
  if (isRead) return 'inventory.view';
  if (/^transfer/i.test(action)) return 'inventory.transfer';
  if (/^(adjust|count)/i.test(action)) return 'inventory.adjust';
  return 'inventory.manage';
}

function getPermissionForChannel(channel, args = []) {
  if (channel.startsWith('auth:')) return null;
  if (channel === 'central:isConfigured') return null;
  if (channel.startsWith('central:login') || channel.startsWith('central:getSession')
    || channel.startsWith('central:refreshSession') || channel.startsWith('central:updateProfile')
    || channel.startsWith('central:getMyProfile') || channel.startsWith('central:saveMyProfile')
    || channel.startsWith('central:changePassword') || channel.startsWith('central:logout')) return null;
  if (channel === 'central:request') {
    const request = args[0];
    return request?.route ? getPermissionForApi(request.route, request.method) : null;
  }
  if (channel.startsWith('central:')) return 'settings.manage';
  if (channel.startsWith('cloudSync:')) return 'settings.manage';

  const separator = channel.indexOf(':');
  if (separator < 0) return null;
  const resource = channel.slice(0, separator);
  const action = channel.slice(separator + 1);
  const domain = RESOURCE_PERMISSIONS[resource];
  if (!domain) return null;

  if (resource === 'enterprise') {
    if (action === 'getRoles' || action === 'createRole' || action === 'setRolePermissions') return 'roles.manage';
    return isReadAction(action) ? 'enterprise.view' : 'enterprise.manage';
  }
  if (resource === 'promotions') {
    return `promotions.${isReadAction(action) ? 'view' : 'manage'}`;
  }
  if (resource === 'channels') {
    return `channels.${isReadAction(action) ? 'view' : 'manage'}`;
  }
  if (resource === 'ai') {
    if (action === 'saveSettings') return 'settings.manage';
    if (action === 'getSettings') return 'settings.view';
    if (action === 'createPurchaseDraft') return 'purchases.manage';
    return `ai.${isReadAction(action) ? 'view' : 'manage'}`;
  }
  if (resource === 'crm') {
    if (/^(get|check|list|export|openAttachment)/i.test(action)) return 'customers.view';
    return /^(create|add|import)/i.test(action) ? 'customers.create' : 'customers.edit';
  }
  if (resource === 'export') {
    if (action === 'employees') return 'team.export';
    if (action === 'invoices') return 'sales.export';
    if (action === 'customers') return 'customers.view';
  }
  if (resource === 'import' && action === 'excel') {
    const type = args[0]?.type;
    if (type === 'employees') return 'team.import';
    if (type === 'products') return 'products.create';
    if (type === 'customers') return 'customers.create';
    if (type === 'suppliers') return 'suppliers.manage';
    return null;
  }
  if (resource === 'import') return 'team.import';

  if (resource === 'users') {
    if (action === 'getRoleOptions') return 'team.manage';
    return isReadAction(action) ? 'team.view' : 'team.manage';
  }
  if (resource === 'attendance' && ['checkIn', 'checkOut', 'getMyTodayStatus'].includes(action)) {
    return 'pos.sell';
  }
  if (resource === 'attendance' || resource === 'leaves') {
    return `${domain}.${isReadAction(action) ? 'view' : 'manage'}`;
  }
  if (resource === 'grocery') {
    if (action.startsWith('resolve') || action.startsWith('parse') || action === 'getSpeedKeys' || action === 'getScaleConfig') {
      return 'pos.view';
    }
    if (isReadAction(action)) return 'products.view';
    if (action === 'saveScaleConfig') return 'settings.manage';
    if (/delete|remove/i.test(action)) return 'products.delete';
    return 'products.edit';
  }
  if (resource === 'salon') {
    if (isReadAction(action)) return 'pos.view';
    // The service list, packages and chairs are the salon's price list: same rule as products.
    if (/^delete(Service|Chair)$/.test(action)) return 'products.delete';
    if (/^(create|update)(Service|Package|Chair)$/.test(action)) return 'products.edit';
    // Making or removing a coupon is a discount decision; applying one stays a sale.
    if (/^(create|delete)Coupon$/.test(action)) return 'promotions.manage';
    return 'pos.sell';
  }
  if (resource === 'cases') {
    if (isReadAction(action)) return 'cases.view';
    if (/delete|remove/i.test(action)) return 'cases.delete';
    return 'cases.manage';
  }
  if (resource === 'courts') {
    if (isReadAction(action)) return 'cases.view';
    if (/delete|remove|deactivate/i.test(action)) return 'cases.delete';
    return 'cases.manage';
  }
  if (resource === 'products' || resource === 'variants') {
    // Opens a file picker and copies the file into app storage: not a read.
    if (action === 'selectImage') return 'products.create';
    if (isReadAction(action)) return 'products.view';
    if (/delete|remove/i.test(action)) return 'products.delete';
    if (/add|create/i.test(action)) return 'products.create';
    return 'products.edit';
  }
  if (resource === 'sales') {
    if (action === 'getKitchenOrders') return 'pos.view';
    // The POS asks for this on every cart change; it only reads promotion rules.
    if (action === 'previewBundlePromotion') return 'pos.view';
    if (action === 'updateKitchenOrderStatus') return 'pos.sell';
    if (isReadAction(action)) return 'sales.view';
    if (/refund|return/i.test(action)) return 'pos.refund';
    return 'pos.sell';
  }
  if (resource === 'tables') {
    if (action === 'addTable' || action === 'removeTable') return 'settings.manage';
    return isReadAction(action) ? 'pos.view' : 'pos.sell';
  }
  if (resource === 'returns') return 'pos.refund';
  if (resource === 'customers') {
    if (isReadAction(action)) return 'customers.view';
    if (/delete|remove/i.test(action)) return 'customers.delete';
    if (/add|create/i.test(action)) return 'customers.create';
    return 'customers.edit';
  }
  if (resource === 'subscriptions') {
    if (isReadAction(action)) return 'subscriptions.view';
    if (/freeze/i.test(action)) return 'subscriptions.freeze';
    return 'subscriptions.manage';
  }
  if (resource === 'commissions') return `commissions.${isReadAction(action) ? 'view' : 'manage'}`;
  if (resource === 'reports') return action.toLowerCase().includes('export') ? 'reports.export' : 'reports.view';
  if (resource === 'suppliers' || resource === 'purchases') {
    return `${resource}.${isReadAction(action) ? 'view' : 'manage'}`;
  }
  if (resource === 'shifts') return `shifts.${isReadAction(action) ? 'view' : 'manage'}`;
  if (resource === 'appointments') return `appointments.${isReadAction(action) ? 'view' : 'manage'}`;
  if (resource === 'inventory' || resource === 'branches') {
    return getInventoryPermission(action, isReadAction(action));
  }
  if (resource === 'settings' || resource === 'backup' || resource === 'notifications' || resource === 'ui-config' || resource === 'uiConfig' || resource === 'onboarding' || resource === 'license' || resource === 'lan') {
    return `settings.${isReadAction(action) ? 'view' : 'manage'}`;
  }
  if (resource === 'audit') return 'team.view';
  if (resource === 'print') return 'pos.sell';
  if (resource === 'export') return 'sales.export';
  return VALID_PERMISSIONS.has(`${domain}.${isReadAction(action) ? 'view' : 'manage'}`)
    ? `${domain}.${isReadAction(action) ? 'view' : 'manage'}`
    : null;
}

function getPermissionForApi(pathname, method) {
  if (pathname.startsWith('/api/auth/')) return null;
  const resource = pathname.split('/')[2];
  const domain = RESOURCE_PERMISSIONS[resource];
  if (!domain) return null;
  const action = method === 'GET' ? 'view' : 'manage';
  if (pathname === '/api/attendance/me/today' || pathname === '/api/attendance/check-in'
    || pathname === '/api/attendance/check-out') return 'pos.sell';
  if (resource === 'inventory' || resource === 'branches') {
    return getInventoryPermission(pathname.split('/')[3] || '', method === 'GET');
  }
  if (resource === 'sales' && action === 'manage') return 'pos.sell';
  if (resource === 'returns') return 'pos.refund';
  if (resource === 'users') return 'team.view';
  if (resource === 'categories') return method === 'GET' ? 'products.view' : 'products.create';
  if (resource === 'products' && action === 'manage') {
    if (pathname === '/api/products') return 'products.create';
    return /\/(add|create)(\/|$)/.test(pathname) ? 'products.create'
      : /\/(delete|remove)(\/|$)/.test(pathname) ? 'products.delete'
        : 'products.edit';
  }
  if (resource === 'customers' && action === 'manage') {
    return (pathname === '/api/customers' || /\/(add|create)(\/|$)/.test(pathname))
      ? 'customers.create'
      : 'customers.edit';
  }
  if (resource === 'courts' && method === 'DELETE') return 'cases.delete';
  if (resource === 'subscriptions' && action === 'manage') return 'subscriptions.manage';
  if (resource === 'purchases' && action === 'manage') return 'purchases.manage';
  if (resource === 'suppliers' && action === 'manage') return 'suppliers.manage';
  return VALID_PERMISSIONS.has(`${domain}.${action}`) ? `${domain}.${action}` : null;
}

module.exports = {
  VALID_PERMISSIONS,
  getPermissionForChannel,
  getPermissionForApi,
};
