/**
 * Kashiear POS — Declarative Schema Validation Engine
 * نظام تحقق تصريحي من صحة البيانات مستوحى من Zod
 * خفيف الوزن وبدون أي تبعيات خارجية (Zero-Dependency)
 */

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

class BaseSchema {
  constructor() {
    this._isOptional = false;
    this._isNullable = false;
    this._customValidators = [];
  }

  optional() {
    this._isOptional = true;
    return this;
  }

  nullable() {
    this._nullable = true;
    return this;
  }

  refine(fn, message) {
    this._customValidators.push({ fn, message });
    return this;
  }

  _checkNullOrUndefined(value) {
    if (value === undefined) {
      if (this._isOptional) return true;
      return false;
    }
    if (value === null) {
      if (this._nullable || this._isOptional) return true;
      return false;
    }
    return null;
  }
}

class AnySchema extends BaseSchema {
  validate(value) {
    for (const custom of this._customValidators) {
      if (!custom.fn(value)) {
        throw new ValidationError(custom.message);
      }
    }
    return value;
  }
}

class StringSchema extends BaseSchema {
  constructor(customMsg) {
    super();
    this.typeMsg = customMsg || 'يجب أن تكون القيمة نصاً صحيحاً';
    this._min = null;
    this._max = null;
  }

  min(length, message) {
    this._min = { length, message: message || `يجب ألا يقل النص عن ${length} أحرف` };
    return this;
  }

  max(length, message) {
    this._max = { length, message: message || `يجب ألا يزيد النص عن ${length} حرف` };
    return this;
  }

  validate(value, fieldName = 'الحقل') {
    const nullCheck = this._checkNullOrUndefined(value);
    if (nullCheck === true) return value;
    if (nullCheck === false) {
      throw new ValidationError(`${fieldName}: ${this.typeMsg}`, fieldName);
    }

    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName}: ${this.typeMsg}`, fieldName);
    }

    const trimmed = value.trim();
    if (this._min && trimmed.length < this._min.length) {
      throw new ValidationError(`${fieldName}: ${this._min.message}`, fieldName);
    }
    if (this._max && trimmed.length > this._max.length) {
      throw new ValidationError(`${fieldName}: ${this._max.message}`, fieldName);
    }

    for (const custom of this._customValidators) {
      if (!custom.fn(trimmed)) {
        throw new ValidationError(`${fieldName}: ${custom.message}`, fieldName);
      }
    }

    return trimmed;
  }
}

class NumberSchema extends BaseSchema {
  constructor(customMsg) {
    super();
    this.typeMsg = customMsg || 'يجب أن تكون القيمة رقماً صحيحاً';
    this._min = null;
    this._max = null;
    this._positive = false;
    this._nonnegative = false;
    this._int = false;
  }

  min(minVal, message) {
    this._min = { val: minVal, message: message || `يجب ألا يقل الرقم عن ${minVal}` };
    return this;
  }

  max(maxVal, message) {
    this._max = { val: maxVal, message: message || `يجب ألا يزيد الرقم عن ${maxVal}` };
    return this;
  }

  positive(message) {
    this._positive = { message: message || 'يجب أن يكون الرقم أكبر تماماً من الصفر' };
    return this;
  }

  nonnegative(message) {
    this._nonnegative = { message: message || 'لا يمكن أن يكون الرقم سالباً' };
    return this;
  }

  int(message) {
    this._int = { message: message || 'يجب أن يكون الرقم عدداً صحيحاً' };
    return this;
  }

  validate(value, fieldName = 'الحقل') {
    const nullCheck = this._checkNullOrUndefined(value);
    if (nullCheck === true) return value;
    if (nullCheck === false) {
      throw new ValidationError(`${fieldName}: ${this.typeMsg}`, fieldName);
    }

    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new ValidationError(`${fieldName}: ${this.typeMsg}`, fieldName);
    }

    if (this._int && !Number.isInteger(num)) {
      throw new ValidationError(`${fieldName}: ${this._int.message}`, fieldName);
    }
    if (this._positive && num <= 0) {
      throw new ValidationError(`${fieldName}: ${this._positive.message}`, fieldName);
    }
    if (this._nonnegative && num < 0) {
      throw new ValidationError(`${fieldName}: ${this._nonnegative.message}`, fieldName);
    }
    if (this._min && num < this._min.val) {
      throw new ValidationError(`${fieldName}: ${this._min.message}`, fieldName);
    }
    if (this._max && num > this._max.val) {
      throw new ValidationError(`${fieldName}: ${this._max.message}`, fieldName);
    }

    for (const custom of this._customValidators) {
      if (!custom.fn(num)) {
        throw new ValidationError(`${fieldName}: ${custom.message}`, fieldName);
      }
    }

    return num;
  }
}

class EnumSchema extends BaseSchema {
  constructor(allowedValues, customMsg) {
    super();
    this.allowedValues = allowedValues;
    this.customMsg = customMsg || `القيمة غير صالحة. القيم المسموحة: ${allowedValues.join(', ')}`;
  }

  validate(value, fieldName = 'الحقل') {
    const nullCheck = this._checkNullOrUndefined(value);
    if (nullCheck === true) return value;
    if (nullCheck === false || !this.allowedValues.includes(value)) {
      throw new ValidationError(`${fieldName}: ${this.customMsg}`, fieldName);
    }
    return value;
  }
}

class BooleanSchema extends BaseSchema {
  constructor(customMsg) {
    super();
    this.typeMsg = customMsg || 'يجب أن تكون القيمة منطقية';
  }

  validate(value, fieldName = 'الحقل') {
    const nullCheck = this._checkNullOrUndefined(value);
    if (nullCheck === true) return value;
    if (nullCheck === false || typeof value !== 'boolean') {
      throw new ValidationError(`${fieldName}: ${this.typeMsg}`, fieldName);
    }
    return value;
  }
}

class ArraySchema extends BaseSchema {
  constructor(itemSchema, customMsg) {
    super();
    this.itemSchema = itemSchema;
    this.typeMsg = customMsg || 'يجب أن تكون القيمة مصفوفة';
    this._min = null;
  }

  min(length, message) {
    this._min = { length, message: message || `يجب أن تحتوي القائمة على ${length} عناصر على الأقل` };
    return this;
  }

  validate(value, fieldName = 'القائمة') {
    const nullCheck = this._checkNullOrUndefined(value);
    if (nullCheck === true) return value;
    if (nullCheck === false || !Array.isArray(value)) {
      throw new ValidationError(`${fieldName}: ${this.typeMsg}`, fieldName);
    }

    if (this._min && value.length < this._min.length) {
      throw new ValidationError(`${fieldName}: ${this._min.message}`, fieldName);
    }

    return value.map((item, idx) => {
      if (this.itemSchema) {
        return this.itemSchema.validate(item, `${fieldName}[${idx + 1}]`);
      }
      return item;
    });
  }
}

class ObjectSchema extends BaseSchema {
  constructor(shape, customMsg) {
    super();
    this.shape = shape || {};
    this.typeMsg = customMsg || 'يجب أن تكون القيمة كائناً صحيحاً';
  }

  validate(value, fieldName = 'البيانات') {
    const nullCheck = this._checkNullOrUndefined(value);
    if (nullCheck === true) return value;
    if (nullCheck === false || typeof value !== 'object' || Array.isArray(value)) {
      throw new ValidationError(`${fieldName}: ${this.typeMsg}`, fieldName);
    }

    const validated = {};
    for (const [key, schema] of Object.entries(this.shape)) {
      validated[key] = schema.validate(value[key], key);
    }

    for (const custom of this._customValidators) {
      if (!custom.fn(value)) {
        throw new ValidationError(custom.message);
      }
    }

    return { ...value, ...validated };
  }
}

// Fluent Builder Namespace (v)
const v = {
  string: (msg) => new StringSchema(msg),
  number: (msg) => new NumberSchema(msg),
  enum: (values, msg) => new EnumSchema(values, msg),
  boolean: (msg) => new BooleanSchema(msg),
  array: (itemSchema, msg) => new ArraySchema(itemSchema, msg),
  object: (shape, msg) => new ObjectSchema(shape, msg),
  any: () => new AnySchema(),
};

// ==========================================
// Predefined POS Domain Schemas
// ==========================================

const saleItemSchema = v.object({
  variantId: v.any(),
  quantity: v.number('الكمية غير صحيحة').int('الكمية يجب أن تكون عدداً صحيحاً').positive('الكمية يجب أن تكون أكبر من الصفر'),
  unitPrice: v.number('سعر الوحدة غير صحيح').nonnegative('سعر الوحدة لا يمكن أن يكون سالباً'),
});

const createSaleSchema = v.object({
  items: v.array(saleItemSchema, 'يجب تمرير قائمة أصناف السلة').min(1, 'سلة المشتريات فارغة! أضف صنفاً واحداً على الأقل'),
  discount: v.number('الخصم يجب أن يكون رقماً').nonnegative('قيمة الخصم لا يمكن أن تكون سالبة').optional(),
  paymentMethod: v.enum(['cash', 'card', 'credit'], 'طريقة الدفع غير صالحة (كاش أو بطاقة أو آجل)'),
  orderMode: v.enum(['dine_in', 'takeaway', 'delivery'], 'طريقة استلام الطلب غير صالحة').optional().nullable(),
  customerName: v.string('اسم العميل غير صالح').optional().nullable(),
  customerPhone: v.string('رقم هاتف العميل غير صالح').optional().nullable(),
  dueDate: v.string('تاريخ الاستحقاق غير صالح').optional().nullable(),
  orderId: v.number('معرف أمر الشغل غير صالح').int('معرف أمر الشغل غير صالح').positive('معرف أمر الشغل غير صالح').optional().nullable(),
}).refine((data) => {
  if (data.paymentMethod === 'credit') {
    if (!data.customerName || !data.customerName.trim()) {
      return false;
    }
    if (!data.dueDate) {
      return false;
    }
  }
  return true;
}, 'في حالة البيع بالآجل: اسم العميل وتاريخ استحقاق الدين مطلوبان إجبارياً');

const shiftExpenseSchema = v.object({
  shiftId: v.number('معرف الوردية غير صحيح').positive('معرف الوردية غير صالح').optional().nullable(),
  amount: v.number('مبلغ المصروف غير صحيح').positive('مبلغ المصروف يجب أن يكون أكبر من الصفر'),
  category: v.string('تصنيف المصروف مطلوب').min(1, 'تصنيف المصروف مطلوب'),
  notes: v.string().optional().nullable(),
});

const shiftCloseSchema = v.object({
  shiftId: v.number('معرف الوردية غير صحيح').positive('معرف الوردية غير صالح').optional().nullable(),
  actualCash: v.number('المبلغ الفعلي غير صحيح').nonnegative('المبلغ الفعلي لا يمكن أن يكون سالباً'),
  cashBreakdown: v.any(),
  notes: v.string().optional().nullable(),
});

const shiftOpenSchema = v.object({
  openingCash: v.number('العهدة الابتدائية غير صحيحة').nonnegative('العهدة الابتدائية لا يمكن أن تكون سالبة'),
  shiftType: v.enum(['morning', 'evening']).optional(),
  posStation: v.string().optional(),
  notes: v.string().optional().nullable(),
  openingCashBreakdown: v.any(),
});

const addProductVariantSchema = v.object({
  productId: v.any(),
  variant: v.object({
    size: v.string().optional().nullable(),
    color: v.string().optional().nullable(),
    sellingPrice: v.number('سعر البيع غير صحيح').positive('سعر البيع يجب أن يكون أكبر من الصفر'),
    purchasePrice: v.number('سعر الشراء غير صحيح').nonnegative('سعر الشراء لا يمكن أن يكون سالباً').optional().nullable(),
    stockQuantity: v.number('كمية المخزون غير صحيحة').int('الكمية يجب أن تكون عدداً صحيحاً').nonnegative('المخزون لا يمكن أن يكون سالباً'),
    barcode: v.string().optional().nullable(),
    attributeValues: v.any().optional(),
  }),
});

const addProductWithVariantSchema = v.object({
  name: v.string('اسم المنتج مطلوب').min(1, 'اسم المنتج لا يمكن أن يكون فارغاً'),
  description: v.string().optional().nullable(),
  categoryName: v.string().optional().nullable(),
  imagePath: v.string().optional().nullable(),
  size: v.string().optional().nullable(),
  color: v.string().optional().nullable(),
  purchasePrice: v.number('سعر الشراء غير صحيح').nonnegative('سعر الشراء لا يمكن أن يكون سالباً').optional().nullable(),
  sellingPrice: v.number('سعر البيع غير صحيح').positive('سعر البيع يجب أن يكون أكبر من الصفر'),
  stockQuantity: v.number('الكمية غير صحيحة').int('الكمية يجب أن تكون عدداً صحيحاً').nonnegative('الكمية لا يمكن أن تكون سالبة'),
  attributeValues: v.any().optional(),
});

const updateProductSchema = v.object({
  productId: v.number('معرف المنتج غير صحيح').positive('معرف المنتج غير صالح'),
  data: v.object({
    name: v.string('اسم المنتج مطلوب').min(1, 'اسم المنتج لا يمكن أن يكون فارغاً'),
    description: v.string().optional().nullable(),
    categoryName: v.string().optional().nullable(),
    imagePath: v.string().optional().nullable(),
  }),
});

const updateVariantSchema = v.object({
  variantId: v.number('معرف المتغير غير صحيح').positive('معرف المتغير غير صالح'),
  data: v.object({
    size: v.string().optional().nullable(),
    color: v.string().optional().nullable(),
    purchasePrice: v.number('سعر الشراء غير صحيح').nonnegative('سعر الشراء لا يمكن أن يكون سالباً').optional().nullable(),
    sellingPrice: v.number('سعر البيع غير صحيح').positive('سعر البيع يجب أن يكون أكبر من الصفر'),
    stockQuantity: v.number('الكمية غير صحيحة').int('الكمية يجب أن تكون عدداً صحيحاً').nonnegative('الكمية لا يمكن أن تكون سالبة'),
    lowStockThreshold: v.number('حد التنبيه غير صحيح').int().nonnegative().optional().nullable(),
    barcode: v.string().optional().nullable(),
    attributeValues: v.any().optional(),
  }),
});

const addCustomerSchema = v.object({
  name: v.string('اسم العميل مطلوب').min(1, 'اسم العميل لا يمكن أن يكون فارغاً'),
  phone: v.string().optional().nullable(),
  email: v.string().optional().nullable(),
  initialDebt: v.number('الرصيد الافتتاحي غير صحيح').nonnegative('الرصيد الافتتاحي لا يمكن أن يكون سالباً').optional().nullable(),
  debtNotes: v.string().optional().nullable(),
  dueDate: v.string().optional().nullable(),
  company_id: v.number('معرف الشركة غير صحيح').positive('معرف الشركة غير صالح').optional().nullable(),
  lead_source: v.string().max(100).optional().nullable(),
  email_consent: v.boolean().optional(),
  sms_consent: v.boolean().optional(),
});

const addManualDebtSchema = v.object({
  customerId: v.number('معرف العميل مطلوب').positive('معرف العميل غير صالح'),
  amount: v.number('مبلغ المديونية غير صحيح').positive('مبلغ المديونية يجب أن يكون أكبر من الصفر'),
  notes: v.string().optional().nullable(),
  dueDate: v.string().optional().nullable(),
});

const customerPaymentSchema = v.object({
  customerId: v.number('معرف العميل مطلوب').positive('معرف العميل غير صالح'),
  amount: v.number('مبلغ السداد غير صحيح').positive('مبلغ السداد يجب أن يكون أكبر من الصفر'),
  paymentMethod: v.enum(['cash', 'card', 'bank_transfer'], 'طريقة السداد غير صالحة').optional(),
  notes: v.string().optional().nullable(),
});

const createCustomerPowerOfAttorneySchema = v.object({
  customerId: v.number('معرف الموكل مطلوب').int().positive(),
  data: v.object({
    number: v.string('رقم التوكيل مطلوب').min(1).max(100),
    issued_at: v.string('تاريخ إصدار التوكيل مطلوب').refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), 'صيغة التاريخ غير صالحة'),
    scope: v.string('نطاق التوكيل مطلوب').min(1).max(2000),
    expires_at: v.string().optional().nullable(),
    notes: v.string().max(1000).optional().nullable(),
  }),
});

const updateCustomerPowerOfAttorneySchema = v.object({
  id: v.number('معرف التوكيل مطلوب').int().positive(),
  data: v.object({
    number: v.string().min(1).max(100).optional(),
    issued_at: v.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), 'صيغة التاريخ غير صالحة').optional(),
    scope: v.string().min(1).max(2000).optional(),
    expires_at: v.string().optional().nullable(),
    notes: v.string().max(1000).optional().nullable(),
  }),
});

const addSupplierSchema = v.object({
  name: v.string('اسم المورد مطلوب').min(1, 'اسم المورد لا يمكن أن يكون فارغاً'),
  phone: v.string().optional().nullable(),
  company: v.string().optional().nullable(),
  address: v.string().optional().nullable(),
  notes: v.string().optional().nullable(),
});

const updateSupplierSchema = v.object({
  id: v.number('معرف المورد مطلوب').positive('معرف المورد غير صالح'),
  data: v.object({
    name: v.string('اسم المورد مطلوب').min(1, 'اسم المورد لا يمكن أن يكون فارغاً'),
    phone: v.string().optional().nullable(),
    company: v.string().optional().nullable(),
    address: v.string().optional().nullable(),
    notes: v.string().optional().nullable(),
  }),
});

const purchaseItemSchema = v.object({
  product_name: v.string('اسم الصنف في فاتورة الشراء مطلوب').min(1, 'اسم الصنف مطلوب'),
  size: v.string().optional().nullable(),
  color: v.string().optional().nullable(),
  quantity: v.number('الكمية غير صحيحة').int('الكمية يجب أن تكون عدداً صحيحاً').positive('الكمية يجب أن تكون أكبر من الصفر'),
  purchase_price: v.number('سعر الشراء غير صحيح').nonnegative('سعر الشراء لا يمكن أن يكون سالباً'),
  selling_price: v.number('سعر البيع غير صحيح').nonnegative('سعر البيع لا يمكن أن يكون سالباً').optional().nullable(),
  variant_id: v.any().optional().nullable(),
});

const createPurchaseSchema = v.object({
  supplierId: v.number('يجب اختيار المورد أو المصنع').positive('معرف المورد غير صالح'),
  invoiceNumber: v.string().optional().nullable(),
  items: v.array(purchaseItemSchema, 'يجب إضافة أصناف في فاتورة الشراء').min(1, 'فاتورة الشراء يجب أن تحتوي على صنف واحد على الأقل'),
  totalAmount: v.number('إجمالي الفاتورة غير صحيح').nonnegative('إجمالي الفاتورة لا يمكن أن يكون سالباً').optional().nullable(),
  paidAmount: v.number('المبلغ المدفوع غير صحيح').nonnegative('المبلغ المدفوع لا يمكن أن يكون سالباً').optional().nullable(),
  dueDate: v.string().optional().nullable(),
  notes: v.string().optional().nullable(),
});

const recordSupplierPaymentSchema = v.object({
  supplierId: v.number('معرف المورد مطلوب').positive('معرف المورد غير صالح'),
  purchaseId: v.number().positive().optional().nullable(),
  amount: v.number('مبلغ السداد غير صحيح').positive('مبلغ السداد يجب أن يكون أكبر من الصفر'),
  paymentMethod: v.enum(['cash', 'bank_transfer', 'cheque']).optional().nullable(),
  notes: v.string().optional().nullable(),
});

const purchaseFiltersSchema = v.object({
  supplierId: v.number('معرف المورد غير صحيح').positive('معرف المورد غير صالح').optional().nullable(),
  paymentStatus: v.enum(['all', 'paid', 'partial', 'unpaid'], 'حالة السداد غير صالحة').optional().nullable(),
}).optional();

const shiftFiltersSchema = v.object({
  limit: v.number('حد الورديات غير صحيح').int('حد الورديات يجب أن يكون عدداً صحيحاً').min(1).max(100).optional(),
  offset: v.number('بداية النتائج غير صحيحة').int('بداية النتائج يجب أن تكون عدداً صحيحاً').nonnegative().optional(),
  status: v.enum(['open', 'closed'], 'حالة الوردية غير صالحة').optional().nullable(),
  userId: v.number('معرف المستخدم غير صحيح').int('معرف المستخدم يجب أن يكون عدداً صحيحاً').positive().optional().nullable(),
  startDate: v.string('تاريخ البداية غير صالح').refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), 'صيغة تاريخ البداية يجب أن تكون YYYY-MM-DD').optional().nullable(),
  endDate: v.string('تاريخ النهاية غير صالح').refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), 'صيغة تاريخ النهاية يجب أن تكون YYYY-MM-DD').optional().nullable(),
}).optional();

const notificationOptionsSchema = v.object({
  limit: v.number('حد الإشعارات غير صحيح').int('حد الإشعارات يجب أن يكون عدداً صحيحاً').min(1).max(100).optional(),
  onlyUnread: v.boolean().optional(),
}).optional();

const reportPeriodSchema = v.any().refine((value) => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') {
    return ['today', 'yesterday', 'week', 'month'].includes(value);
  }
  return typeof value === 'object'
    && typeof value.startDate === 'string'
    && typeof value.endDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value.startDate)
    && /^\d{4}-\d{2}-\d{2}$/.test(value.endDate);
}, 'الفترة الزمنية للتقرير غير صالحة');

const positiveIdSchema = v.number('المعرف غير صحيح').int('المعرف يجب أن يكون عدداً صحيحاً').positive('المعرف غير صالح');
const positiveLimitSchema = v.number('الحد غير صحيح').int('الحد يجب أن يكون عدداً صحيحاً').min(1).max(100);

const processReturnSchema = v.object({
  saleId: v.number('رقم الفاتورة مطلوب').positive('رقم الفاتورة غير صالح'),
  variantId: v.number('معرف الصنف المرتجع مطلوب').positive('معرف الصنف المرتجع غير صالح'),
  quantity: v.number('الكمية المرتجعة غير صحيحة').int('الكمية المرتجعة يجب أن تكون عدداً صحيحاً').positive('الكمية المرتجعة يجب أن تكون 1 على الأقل'),
  reason: v.string().optional().nullable(),
  mode: v.enum(['return', 'exchange']).optional().nullable(),
  exchangeVariantId: v.number().positive().optional().nullable(),
  exchangePaymentMethod: v.enum(['cash', 'card', 'bank_transfer']).optional().nullable(),
});

const loginSchema = v.object({
  username: v.string('اسم المستخدم مطلوب').min(1, 'اسم المستخدم لا يمكن أن يكون فارغاً'),
  password: v.string('كلمة المرور مطلوبة').min(1, 'كلمة المرور لا يمكن أن تكون فارغة'),
});

const createAdminSchema = v.object({
  username: v.string('اسم المستخدم مطلوب').min(2, 'اسم المستخدم يجب ألا يقل عن حرفين'),
  password: v.string('كلمة المرور مطلوبة').min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  fullName: v.string('الاسم غير صالح').max(100).optional().nullable(),
  phone: v.string('رقم الهاتف غير صالح').max(30).optional().nullable(),
});

const addUserSchema = v.object({
  username: v.string('اسم المستخدم مطلوب').min(2, 'اسم المستخدم يجب ألا يقل عن حرفين'),
  password: v.string('كلمة المرور مطلوبة').min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  role: v.enum(['admin', 'cashier'], 'الدور الوظيفي غير صالح').optional(),
  systemRoleKey: v.string('مفتاح الدور الوظيفي غير صالح').max(32).optional().nullable()
    .refine((value) => value == null || /^[a-z][a-z0-9_-]{1,31}$/.test(value), 'مفتاح الدور الوظيفي غير صالح'),
  firstName: v.string('الاسم الأول غير صالح').max(60).optional().nullable(),
  lastName: v.string('اسم العائلة غير صالح').max(60).optional().nullable(),
  fullName: v.string('الاسم الكامل غير صالح').max(120).optional().nullable(),
  phone: v.string('رقم الهاتف غير صالح').max(30).optional().nullable(),
  email: v.string('البريد الإلكتروني غير صالح').max(254).optional().nullable()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'البريد الإلكتروني غير صالح'),
  jobTitle: v.string('المسمى الوظيفي غير صالح').max(100).optional().nullable(),
  specialty: v.string('التخصص غير صالح').max(100).optional().nullable(),
  workingHours: v.string('ساعات العمل غير صالحة').max(100).optional().nullable(),
  profileImage: v.string('مسار الصورة غير صالح').max(2048).optional().nullable(),
  payType: v.enum(['monthly', 'hourly'], 'نوع الأجر غير صالح').optional().nullable(),
  payAmount: v.number('قيمة الأجر غير صالحة').positive('قيمة الأجر يجب أن تكون أكبر من صفر').optional().nullable(),
  commissionRate: v.number('نسبة العمولة غير صالحة').nonnegative('نسبة العمولة لا يمكن أن تكون سالبة').max(100).optional().nullable(),
  isActive: v.boolean('حالة الحساب غير صالحة').optional(),
  notes: v.string('الملاحظات غير صالحة').max(500).optional().nullable(),
}).refine(
  (data) => (data.payType == null && data.payAmount == null)
    || (data.payType != null && Number(data.payAmount) > 0),
  'يجب تحديد نوع الأجر ومبلغ صحيح معًا',
);

const userActivitySchema = v.object({
  userId: positiveIdSchema,
  type: v.enum(['sales', 'shifts']),
  offset: v.number('بداية السجل غير صحيحة').int('بداية السجل يجب أن تكون عدداً صحيحاً').min(0).max(100000).optional(),
});

const attendanceDateSchema = v.string('تاريخ الحضور غير صالح')
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

const attendanceScheduleSchema = v.object({
  userId: positiveIdSchema,
  scheduledStart: v.string('وقت بداية الوردية غير صالح').refine((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'وقت البداية يجب أن يكون بصيغة HH:MM').optional().nullable(),
  scheduledEnd: v.string('وقت نهاية الوردية غير صالح').refine((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'وقت النهاية يجب أن يكون بصيغة HH:MM').optional().nullable(),
}).refine(
  (data) => (data.scheduledStart == null && data.scheduledEnd == null)
    || (data.scheduledStart != null && data.scheduledEnd != null && data.scheduledStart !== data.scheduledEnd),
  'يجب تحديد وقت البداية والنهاية معًا وأن يختلفا',
);

const attendanceActionSchema = v.object({
  userId: positiveIdSchema.optional(),
  date: attendanceDateSchema,
});

const createLeaveRequestSchema = v.object({
  userId: positiveIdSchema,
  startDate: attendanceDateSchema,
  endDate: attendanceDateSchema,
  reason: v.string('سبب الإجازة مطلوب').min(2, 'سبب الإجازة يجب ألا يقل عن حرفين').max(500),
  autoApprove: v.boolean('خيار الموافقة التلقائية غير صالح'),
}).refine(
  (data) => data.endDate >= data.startDate,
  'تاريخ نهاية الإجازة يجب أن يكون في نفس يوم البداية أو بعده',
);

const leaveRequestDecisionSchema = v.object({
  requestId: positiveIdSchema,
  decision: v.enum(['approved', 'rejected'], 'قرار الطلب غير صالح'),
});

const resetUserPasswordSchema = v.object({
  userId: positiveIdSchema,
  password: v.string('كلمة المرور مطلوبة').min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
});

const updateProfileSchema = v.object({
  currentPassword: v.string('كلمة المرور الحالية مطلوبة').min(1, 'كلمة المرور الحالية مطلوبة لتأكيد الهوية'),
  newUsername: v.string().optional().nullable(),
  newPassword: v.string().optional().nullable(),
});

const personalProfileSchema = v.object({
  firstName: v.string('الاسم الأول غير صالح').max(60).optional().nullable(),
  lastName: v.string('اسم العائلة غير صالح').max(60).optional().nullable(),
  email: v.string('البريد الإلكتروني غير صالح').max(254).optional().nullable()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'البريد الإلكتروني غير صالح'),
  phone: v.string('رقم الهاتف غير صالح').max(30).optional().nullable(),
  gender: v.enum(['male', 'female', 'prefer_not_to_say'], 'النوع غير صالح').optional().nullable(),
  dateOfBirth: v.string('تاريخ الميلاد غير صالح').optional().nullable()
    .refine((value) => !value || (
      /^\d{4}-\d{2}-\d{2}$/.test(value)
      && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
    ), 'تاريخ الميلاد يجب أن يكون تاريخاً صحيحاً بصيغة YYYY-MM-DD'),
  country: v.string('الدولة غير صالحة').max(100).optional().nullable(),
  city: v.string('المدينة غير صالحة').max(100).optional().nullable(),
  address: v.string('العنوان غير صالح').max(240).optional().nullable(),
}).refine((data) => (
  ['firstName', 'lastName', 'email', 'phone', 'gender', 'dateOfBirth', 'country', 'city', 'address']
    .some((field) => data[field] !== undefined)
), 'أدخل بيانات واحدة على الأقل لتحديث الملف الشخصي');

const reviewSchema = v.object({
  rating: v.number('اختر تقييمًا من النجوم').int().min(1).max(5),
  tags: v.array(v.string('اختيار التقييم غير صالح').max(60)).optional(),
  comment: v.string('الملاحظة غير صالحة').max(1000).optional().nullable()
    .refine((value) => !value || value.length >= 20, 'اكتب 20 حرفًا على الأقل أو اترك الملاحظة فارغة'),
  consent: v.boolean('حدد موافقتك على نشر اسم النشاط وشعاره').optional(),
})
  .refine((data) => data.rating < 4 || typeof data.consent === 'boolean', 'حدد ما إذا كنت توافق على نشر اسم النشاط وشعاره')
  .refine((data) => data.rating >= 4 || data.consent !== true, 'موافقة النشر متاحة للتقييمات الإيجابية فقط');

const resetWithKeySchema = v.object({
  recoveryKey: v.string('مفتاح الطوارئ مطلوب').min(6, 'مفتاح الطوارئ غير صالح'),
  newPassword: v.string('كلمة المرور الجديدة مطلوبة').min(6, 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف'),
});

const resetWithChallengeSchema = v.object({
  challengeCode: v.string('رمز التحدي مطلوب').min(6, 'رمز التحدي غير صالح'),
  responseOtp: v.string('كود الاستجابة مطلوب').min(4, 'كود الاستجابة غير صالح'),
  newPassword: v.string('كلمة المرور الجديدة مطلوبة').min(6, 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف'),
});

const changePasswordSchema = v.string('كلمة المرور الجديدة مطلوبة').min(6, 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف');

module.exports = {
  v,
  ValidationError,
  createSaleSchema,
  shiftExpenseSchema,
  shiftCloseSchema,
  shiftOpenSchema,
  addProductVariantSchema,
  addProductWithVariantSchema,
  updateProductSchema,
  updateVariantSchema,
  addCustomerSchema,
  addManualDebtSchema,
  customerPaymentSchema,
  createCustomerPowerOfAttorneySchema,
  updateCustomerPowerOfAttorneySchema,
  addSupplierSchema,
  updateSupplierSchema,
  createPurchaseSchema,
  recordSupplierPaymentSchema,
  purchaseFiltersSchema,
  shiftFiltersSchema,
  notificationOptionsSchema,
  reportPeriodSchema,
  positiveIdSchema,
  positiveLimitSchema,
  processReturnSchema,
  loginSchema,
  createAdminSchema,
  addUserSchema,
  userActivitySchema,
  attendanceDateSchema,
  attendanceScheduleSchema,
  attendanceActionSchema,
  createLeaveRequestSchema,
  leaveRequestDecisionSchema,
  resetUserPasswordSchema,
  updateProfileSchema,
  personalProfileSchema,
  reviewSchema,
  resetWithKeySchema,
  resetWithChallengeSchema,
  changePasswordSchema,
};
