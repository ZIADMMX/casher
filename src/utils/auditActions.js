// Label + icon for a cashier_audit_logs.action_type (shared by UsersPage and ProfilePage).
export function getActionMeta(actionType) {
  switch (actionType) {
    case 'sale_created':
      return { icon: '🛒', label: 'فاتورة بيع' };
    case 'discount_applied':
      return { icon: '🏷️', label: 'خصم' };
    case 'item_removed':
      return { icon: '🗑️', label: 'حذف صنف' };
    case 'cart_cleared':
      return { icon: '⚠️', label: 'إفراغ السلة' };
    case 'expense_added':
      return { icon: '💸', label: 'سحب مصروف' };
    case 'shift_open':
      return { icon: '🟢', label: 'فتح وردية' };
    case 'shift_close':
      return { icon: '🔒', label: 'إغلاق وردية' };
    case 'return_processed':
      return { icon: '↩️', label: 'مرتجع' };
    case 'held_order_saved':
      return { icon: '⏸️', label: 'تعليق فاتورة' };
    case 'login':
      return { icon: '🔑', label: 'دخول' };
    case 'logout':
      return { icon: '🚪', label: 'خروج' };
    case 'failed_login':
      return { icon: '🚫', label: 'دخول خاطئ' };
    default:
      return { icon: '⚡', label: 'حركة مسجلة' };
  }
}
