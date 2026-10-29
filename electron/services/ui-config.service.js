const UIConfigRepository = require('../repositories/ui-config.repository');

/**
 * خدمة مصمم الشاشة (Screen Designer)
 * طبقة منطق الأعمال للتخصيص الديناميكي لواجهة المستخدم
 */

const UIConfigService = {
  /**
   * جلب إعدادات الشاشة لنطاق محدد مع fallback للإعدادات الافتراضية
   */
  getScreenConfig(scope, roleOrUserId = null) {
    return UIConfigRepository.getUIConfig(scope, roleOrUserId);
  },

  /**
   * حفظ إعدادات الشاشة بعد التحقق من صحة البيانات
   */
  saveScreenConfig(scope, config, roleOrUserId = null) {
    if (!config || (!Array.isArray(config) && typeof config !== 'object')) {
      throw new Error('بيانات الإعدادات غير صالحة');
    }

    // التحقق من أن كل عنصر يحتوي على id و visible على الأقل
    if (Array.isArray(config)) {
      for (const item of config) {
        if (!item.id) {
          throw new Error('كل عنصر يجب أن يحتوي على معرف (id)');
        }
      }
    }

    return UIConfigRepository.saveUIConfig(scope, config, roleOrUserId);
  },

  /**
   * إعادة ضبط الإعدادات للقيم الافتراضية
   */
  resetToDefaults(scope, roleOrUserId = null) {
    UIConfigRepository.deleteUIConfig(scope, roleOrUserId);
    return UIConfigRepository.getDefaultConfig(scope);
  },

  /**
   * تصدير جميع إعدادات واجهة المستخدم (للنسخ الاحتياطي والمشاركة)
   */
  exportConfig() {
    return {
      version: '1.0',
      exported_at: new Date().toISOString(),
      configs: UIConfigRepository.exportAllConfigs(),
    };
  },

  /**
   * استيراد إعدادات واجهة المستخدم من ملف JSON
   */
  importConfig(configData) {
    if (!configData || !configData.configs || typeof configData.configs !== 'object') {
      throw new Error('بيانات الاستيراد غير صالحة - يجب أن تحتوي على حقل configs');
    }
    UIConfigRepository.importAllConfigs(configData.configs);
    return { success: true, message: 'تم استيراد الإعدادات بنجاح' };
  },

  /**
   * جلب قائمة الأدوات/الحقول المتاحة لنطاق محدد
   */
  getAvailableWidgets(scope) {
    return UIConfigRepository.getDefaultConfig(scope);
  },

  /**
   * إعادة ترتيب العناصر حسب قائمة المعرفات
   */
  reorderItems(scope, itemIds, roleOrUserId = null) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      throw new Error('قائمة المعرفات فارغة أو غير صالحة');
    }

    const current = UIConfigRepository.getUIConfig(scope, roleOrUserId);
    if (!Array.isArray(current)) {
      throw new Error('الإعدادات الحالية ليست قائمة قابلة للترتيب');
    }

    // بناء map للعناصر الحالية
    const itemMap = {};
    for (const item of current) {
      itemMap[item.id] = item;
    }

    // بناء القائمة الجديدة حسب الترتيب المطلوب
    const reordered = [];
    for (const id of itemIds) {
      if (itemMap[id]) {
        reordered.push(itemMap[id]);
        delete itemMap[id];
      }
    }

    // إضافة أي عناصر لم تكن في القائمة الجديدة (في النهاية)
    for (const remaining of Object.values(itemMap)) {
      reordered.push(remaining);
    }

    return UIConfigRepository.saveUIConfig(scope, reordered, roleOrUserId);
  },

  /**
   * جلب كل النطاقات المتاحة
   */
  getAllScopes() {
    return UIConfigRepository.getAllScopes();
  },
};

module.exports = UIConfigService;
