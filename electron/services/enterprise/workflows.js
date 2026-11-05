// Ticket workflows: statuses, transitions and tickets, plus the preset workflows.
const enterpriseRepo = require('../../repositories/enterprise.repository');
const NotificationsService = require('../notifications.service');

function seedDefaultWorkflows(forceReset = false) {
  try {
    const existingWorkflows = enterpriseRepo.getWorkflows();
    if (!forceReset && existingWorkflows && existingWorkflows.length > 0) {
      return existingWorkflows;
    }

    if (forceReset) {
      for (const wf of existingWorkflows) {
        enterpriseRepo.deleteWorkflow(wf.id);
      }
    }

    // 1. Maintenance Workflow (الصيانة والورشة)
    const wfMaintId = enterpriseRepo.createWorkflow({
      module_key: 'orders',
      entity_type: 'maintenance_ticket',
      name: 'سير عمل صيانة الأجهزة والخدمات',
      description: 'مسار تذاكر ورشة الصيانة: استلام ← فحص ← انتظار قطعة ← جاهز ← تم التسليم',
      business_profile_key: 'maintenance',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'received', status_label: 'استلام الجهاز', badge_color: '#3b82f6', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'inspection', status_label: 'فحص وتشخيص', badge_color: '#8b5cf6', step_order: 2, sla_hours: 24 });
    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'waiting_part', status_label: 'انتظار قطعة غيار', badge_color: '#f59e0b', step_order: 3, sla_hours: 72 });
    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'ready', status_label: 'جاهز للتسليم', badge_color: '#10b981', step_order: 4 });
    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'delivered', status_label: 'تم التسليم للمشتري', badge_color: '#059669', step_order: 5, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfMaintId, [
      { from_status_key: 'received', to_status_key: 'inspection', allowed_roles_json: ['admin', 'manager', 'cashier', 'technician'], auto_action_type: 'none' },
      { from_status_key: 'inspection', to_status_key: 'waiting_part', allowed_roles_json: ['admin', 'manager', 'technician'], auto_action_type: 'send_notification', sla_limit_hours: 72, sla_alert_message: 'لو التذكرة واقفة 3 أيام نبّه بخصوص قطعة الغيار' },
      { from_status_key: 'inspection', to_status_key: 'ready', allowed_roles_json: ['admin', 'manager', 'technician'], auto_action_type: 'send_notification' },
      { from_status_key: 'waiting_part', to_status_key: 'ready', allowed_roles_json: ['admin', 'manager', 'technician'], auto_action_type: 'stock_deduct' },
      { from_status_key: 'ready', to_status_key: 'delivered', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'print_receipt' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'TK-701',
      workflow_id: wfMaintId,
      entity_type: 'maintenance_ticket',
      title: 'تغيير شاشة آيفون 13 برو أصلية',
      customer_name: 'أحمد محمود',
      customer_phone: '01012345678',
      current_status_key: 'waiting_part',
      assigned_role: 'technician',
      notes: 'تم فحص الجهاز والشاشة غير متوفرة حالياً، تم طلب القطعة من المورد'
    });

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'TK-702',
      workflow_id: wfMaintId,
      entity_type: 'maintenance_ticket',
      title: 'فحص عطل باور ولاب توب ديل',
      customer_name: 'محمد الشريف',
      customer_phone: '01122334455',
      current_status_key: 'inspection',
      assigned_role: 'technician',
      notes: 'الجهاز لا يعمل إطلاقاً عند الضغط على زر التشغيل'
    });

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'TK-703',
      workflow_id: wfMaintId,
      entity_type: 'maintenance_ticket',
      title: 'صيانة بوردة وبلايستيشن 5',
      customer_name: 'سارة فاروق',
      customer_phone: '01233445566',
      current_status_key: 'ready',
      assigned_role: 'cashier',
      notes: 'تم الإصلاح وتجربة الجهاز بنجاح، بانتظار استلام العميل'
    });

    // 2. Gym Subscriptions Workflow (الجيم والاشتراكات)
    const wfGymId = enterpriseRepo.createWorkflow({
      module_key: 'subscriptions',
      entity_type: 'subscription',
      name: 'سير عمل تجديد وتجميد الاشتراك',
      description: 'مسار اشتراكات الجيم والرياضة: طلب جديد ← نشط ← تجميد مؤقت ← طلب تجديد ← منتهي',
      business_profile_key: 'subscriptions_gym',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'new_req', status_label: 'طلب جديد', badge_color: '#3b82f6', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'active', status_label: 'اشتراك نشط', badge_color: '#10b981', step_order: 2 });
    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'frozen', status_label: 'تجميد مؤقت', badge_color: '#06b6d4', step_order: 3, sla_hours: 336 });
    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'renewal_pending', status_label: 'طلب تجديد', badge_color: '#f59e0b', step_order: 4, sla_hours: 72 });
    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'expired', status_label: 'اشتراك منتهي', badge_color: '#6b7280', step_order: 5, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfGymId, [
      { from_status_key: 'new_req', to_status_key: 'active', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'print_receipt' },
      { from_status_key: 'active', to_status_key: 'frozen', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'send_notification' },
      { from_status_key: 'frozen', to_status_key: 'active', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'none' },
      { from_status_key: 'active', to_status_key: 'renewal_pending', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'send_notification', sla_limit_hours: 72 },
      { from_status_key: 'renewal_pending', to_status_key: 'active', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'print_receipt' },
      { from_status_key: 'renewal_pending', to_status_key: 'expired', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'none' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'SUB-101',
      workflow_id: wfGymId,
      entity_type: 'subscription',
      title: 'اشتراك جيم سنوي VIP مع مدرب شخصي',
      customer_name: 'حازم الإمام',
      customer_phone: '01000112233',
      current_status_key: 'active',
      assigned_role: 'manager',
      notes: 'اشتراك شامل السونا والحديد والسباحة'
    });

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'SUB-102',
      workflow_id: wfGymId,
      entity_type: 'subscription',
      title: 'طلب تجميد اشتراك لمدة 14 يوم بسبب السفر',
      customer_name: 'علي حسن',
      customer_phone: '01111223344',
      current_status_key: 'frozen',
      assigned_role: 'manager',
      notes: 'طلب العضو إيقاف الاشتراك مؤقتاً لحين العودة'
    });

    // 3. Delivery Request Workflow (طلبات التوصيل)
    const wfDelivId = enterpriseRepo.createWorkflow({
      module_key: 'orders',
      entity_type: 'delivery_request',
      name: 'سير عمل طلبات التوصيل والدليفري',
      description: 'مسار طلبات التوصيل: طلب جديد ← قيد التجهيز ← جاري التوصيل ← تم التسليم',
      business_profile_key: 'retail',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'new', status_label: 'طلب جديد', badge_color: '#3b82f6', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'preparing', status_label: 'قيد التجهيز بالمخزن', badge_color: '#8b5cf6', step_order: 2 });
    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'shipping', status_label: 'جاري التوصيل مع الطيار', badge_color: '#f59e0b', step_order: 3, sla_hours: 24 });
    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'delivered', status_label: 'تم التسليم بنجاح', badge_color: '#10b981', step_order: 4, is_final: 1 });
    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'returned', status_label: 'مرتجع / لم يتم التسليم', badge_color: '#ef4444', step_order: 5, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfDelivId, [
      { from_status_key: 'new', to_status_key: 'preparing', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'stock_deduct' },
      { from_status_key: 'preparing', to_status_key: 'shipping', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'send_notification' },
      { from_status_key: 'shipping', to_status_key: 'delivered', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'print_receipt' },
      { from_status_key: 'shipping', to_status_key: 'returned', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'none' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'DEL-201',
      workflow_id: wfDelivId,
      entity_type: 'delivery_request',
      title: 'توصيل شحنة ملابس وأقمشة أونلاين',
      customer_name: 'منى عبد العزيز',
      customer_phone: '01288776655',
      current_status_key: 'shipping',
      assigned_role: 'cashier',
      notes: 'تم التسليم لمندوب التوصيل والطلب في الطريق للعميل'
    });

    // 4. Purchase Order Workflow (أمر شراء)
    const wfPOId = enterpriseRepo.createWorkflow({
      module_key: 'purchases',
      entity_type: 'purchase_order',
      name: 'سير عمل أوامر الشراء والتوريد',
      description: 'مسار المشتريات: مسودة ← موافقة الإدارة ← طلب صادر ← استلام المخزن',
      business_profile_key: 'spare_parts',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfPOId, { status_key: 'draft', status_label: 'مسودة طلب', badge_color: '#6b7280', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfPOId, { status_key: 'pending_approval', status_label: 'بانتظار الموافقة', badge_color: '#f59e0b', step_order: 2, sla_hours: 48 });
    enterpriseRepo.addWorkflowStatus(wfPOId, { status_key: 'ordered', status_label: 'طلب توريد صادر', badge_color: '#3b82f6', step_order: 3 });
    enterpriseRepo.addWorkflowStatus(wfPOId, { status_key: 'received', status_label: 'تم الاستلام وإضافة المخزون', badge_color: '#10b981', step_order: 4, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfPOId, [
      { from_status_key: 'draft', to_status_key: 'pending_approval', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'send_notification' },
      { from_status_key: 'pending_approval', to_status_key: 'ordered', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'send_notification' },
      { from_status_key: 'ordered', to_status_key: 'received', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'stock_deduct' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'PO-501',
      workflow_id: wfPOId,
      entity_type: 'purchase_order',
      title: 'طلب توريد شاشات وقطع غيار أصلية من المورد',
      customer_name: 'شركة التكنولوجيا المتقدمة',
      customer_phone: '0223456789',
      current_status_key: 'pending_approval',
      assigned_role: 'manager',
      notes: 'طلب توريد عدد 50 شاشة آيفون و20 بوردة صيانة'
    });

    // 5. Return Order Workflow (مرتجع)
    const wfRetId = enterpriseRepo.createWorkflow({
      module_key: 'returns',
      entity_type: 'return_order',
      name: 'سير عمل المرتجعات والاستبدال',
      description: 'مسار المرتجعات: طلب مرتجع ← فحص المرتجع ← تم الاسترداد/الاستبدال',
      business_profile_key: 'returns',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfRetId, { status_key: 'requested', status_label: 'طلب مرتجع جديد', badge_color: '#3b82f6', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfRetId, { status_key: 'inspecting', status_label: 'فحص حالة المرتجع', badge_color: '#8b5cf6', step_order: 2, sla_hours: 24 });
    enterpriseRepo.addWorkflowStatus(wfRetId, { status_key: 'completed', status_label: 'تم الاسترداد / الاستبدال', badge_color: '#10b981', step_order: 3, is_final: 1 });
    enterpriseRepo.addWorkflowStatus(wfRetId, { status_key: 'rejected', status_label: 'طلب مرتجع مرفوض', badge_color: '#ef4444', step_order: 4, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfRetId, [
      { from_status_key: 'requested', to_status_key: 'inspecting', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'none' },
      { from_status_key: 'inspecting', to_status_key: 'completed', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'stock_deduct' },
      { from_status_key: 'inspecting', to_status_key: 'rejected', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'none' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'RET-801',
      workflow_id: wfRetId,
      entity_type: 'return_order',
      title: 'طلب استبدال قميص رجالي بسبب المقاس',
      customer_name: 'خالد سعيد',
      customer_phone: '01099887766',
      current_status_key: 'inspecting',
      assigned_role: 'cashier',
      notes: 'العميل يرغب باستبدال القميص بمقاس أكبر XL'
    });

    return enterpriseRepo.getWorkflows();
  } catch (err) {
    console.error('Error seeding default workflows:', err.message);
    return [];
  }
}

function getWorkflows() {
  const workflows = enterpriseRepo.getWorkflows();
  if (!workflows || workflows.length === 0) {
    return seedDefaultWorkflows();
  }
  return workflows;
}

function createWorkflow(data) {
  if (!data.name) {
    throw new Error('اسم سير العمل مطلوب');
  }
  const id = enterpriseRepo.createWorkflow(data);
  return enterpriseRepo.getWorkflows().find(w => w.id === id);
}

function updateWorkflow(id, data) {
  if (!id) throw new Error('معرف سير العمل مطلوب');
  return enterpriseRepo.updateWorkflow(id, data);
}

function deleteWorkflow(id) {
  if (!id) throw new Error('معرف سير العمل مطلوب');
  return enterpriseRepo.deleteWorkflow(id);
}

function addWorkflowStatus(workflowId, statusData) {
  if (!workflowId || !statusData.status_key || !statusData.status_label) {
    throw new Error('معرف سير العمل، ومفتاح وعنوان الحالة مطلوبان');
  }
  return enterpriseRepo.addWorkflowStatus(workflowId, statusData);
}

function updateWorkflowStatus(statusId, statusData) {
  if (!statusId) throw new Error('معرف الحالة مطلوب');
  return enterpriseRepo.updateWorkflowStatus(statusId, statusData);
}

function deleteWorkflowStatus(statusId) {
  if (!statusId) throw new Error('معرف الحالة مطلوب');
  return enterpriseRepo.deleteWorkflowStatus(statusId);
}

function saveWorkflowTransitions(workflowId, transitionsArray) {
  if (!workflowId) throw new Error('معرف سير العمل مطلوب');
  const workflow = enterpriseRepo.getWorkflowById(workflowId);
  if (!workflow) throw new Error('مسار العمل غير موجود');

  const statusKeys = new Set((workflow.statuses || []).map((status) => status.status_key));
  const transitionKeys = new Set();
  for (const transition of transitionsArray || []) {
    if (!statusKeys.has(transition.from_status_key) || !statusKeys.has(transition.to_status_key)) {
      throw new Error('حالة البداية أو الحالة الهدف غير موجودة في هذا المسار');
    }
    if (transition.from_status_key === transition.to_status_key) {
      throw new Error('لا يمكن أن تكون حالة البداية هي نفسها الحالة الهدف');
    }

    const transitionKey = `${transition.from_status_key}\u0000${transition.to_status_key}`;
    if (transitionKeys.has(transitionKey)) {
      throw new Error('لا يمكن تكرار الانتقال نفسه في المسار');
    }
    transitionKeys.add(transitionKey);

    let allowedRoles = transition.allowed_roles_json;
    if (typeof allowedRoles === 'string') {
      try {
        allowedRoles = JSON.parse(allowedRoles);
      } catch {
        throw new Error('قائمة الأدوار المسموح بها غير صالحة');
      }
    }
    if (!Array.isArray(allowedRoles)) {
      throw new Error('يجب تحديد الأدوار المسموح لها كقائمة');
    }
  }

  return enterpriseRepo.saveWorkflowTransitions(workflowId, transitionsArray);
}

function getWorkflowTickets(workflowId, statusKey = null) {
  if (!workflowId) return [];
  return enterpriseRepo.getWorkflowTickets(workflowId, statusKey);
}

function createWorkflowTicket(ticketData) {
  if (!ticketData.workflow_id || !ticketData.title || !ticketData.current_status_key) {
    throw new Error('بيانات التذكرة غير مكتملة (معرف سير العمل، العنوان والحالة الحالية)');
  }
  return enterpriseRepo.createWorkflowTicket(ticketData);
}

function updateTicketStatus(ticketId, workflowId, newStatusKey, currentUserRole = 'admin') {
  if (!ticketId || !workflowId || !newStatusKey) {
    throw new Error('معرف التذكرة ومسار العمل والحالة الجديدة مطلوبة');
  }

  const ticket = enterpriseRepo.getWorkflowTicketById(ticketId, workflowId);
  if (!ticket) {
    throw new Error('التذكرة غير موجودة في مسار العمل المحدد');
  }

  const workflow = enterpriseRepo.getWorkflowById(workflowId);
  if (!workflow) {
    throw new Error('مسار العمل غير موجود');
  }

  const currentStatusExists = workflow.statuses?.some((status) => status.status_key === ticket.current_status_key);
  const targetStatusExists = workflow.statuses?.some((status) => status.status_key === newStatusKey);

  if (!currentStatusExists) {
    throw new Error(`حالة التذكرة الحالية "${ticket.current_status_key}" غير موجودة في المسار الحالي`);
  }

  if (!targetStatusExists) {
    throw new Error(`الحالة الهدف "${newStatusKey}" غير موجودة في هذا المسار`);
  }

  const transition = workflow.transitions?.find((t) => t.from_status_key === ticket.current_status_key && t.to_status_key === newStatusKey);
  if (transition) {
    let allowedRoles;
    try {
      allowedRoles = typeof transition.allowed_roles_json === 'string'
        ? JSON.parse(transition.allowed_roles_json)
        : transition.allowed_roles_json;
    } catch {
      throw new Error('تعذر قراءة أدوار الانتقال؛ لم يتم تغيير حالة التذكرة');
    }

    if (!Array.isArray(allowedRoles)) {
      throw new Error('قائمة الأدوار المسموح بها لهذا الانتقال غير صالحة');
    }

    if (currentUserRole !== 'admin' && allowedRoles.length > 0 && !allowedRoles.includes(currentUserRole)) {
      throw new Error(`دور المستخدم (${currentUserRole}) غير مصرح له بتنفيذ هذا الانتقال (${ticket.current_status_key} ➔ ${newStatusKey})`);
    }
  } else if (workflow.transitions && workflow.transitions.length > 0) {
    throw new Error(`لا توجد صلاحية انتقال من "${ticket.current_status_key}" إلى "${newStatusKey}" في هذا المسار`);
  }

  const updatedTicket = enterpriseRepo.updateTicketStatus(ticketId, workflowId, newStatusKey);
  if (!updatedTicket) {
    throw new Error('تعذر تحديث التذكرة في مسار العمل المحدد');
  }

  if (transition?.auto_action_type === 'send_notification') {
    try {
      NotificationsService.addNotification({
        type: 'workflow_alert',
        title: `🔄 تحديث مرحلة سير العمل: ${ticket.ticket_number}`,
        message: `انتقلت التذكرة "${ticket.title}" إلى حالة ${newStatusKey}`,
        severity: 'info'
      });
    } catch {}
  }

  return updatedTicket;
}

function deleteWorkflowTicket(ticketId) {
  if (!ticketId) throw new Error('معرف التذكرة مطلوب');
  return enterpriseRepo.deleteWorkflowTicket(ticketId);
}

function resetPresetWorkflows() {
  return seedDefaultWorkflows(true);
}

module.exports = {
  seedDefaultWorkflows,
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  addWorkflowStatus,
  updateWorkflowStatus,
  deleteWorkflowStatus,
  saveWorkflowTransitions,
  getWorkflowTickets,
  createWorkflowTicket,
  updateTicketStatus,
  deleteWorkflowTicket,
  resetPresetWorkflows,
};
