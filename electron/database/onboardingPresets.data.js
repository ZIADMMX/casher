/**
 * Onboarding Sector Presets Data
 * قوالب البداية الجاهزة لمعالج التهيئة الأولى
 * تتضمن:
 * 1. مواعيد العمل الافتراضية
 * 2. الأقسام ومحطات التحضير المرتبطة
 * 3. الإضافات والخيارات بأسعار محلية
 * 4. المنتجات النموذجية بأسعار محلية حقيقية وتكاليف ومخزون
 */

const RAW_SECTOR_PRESETS = [
  {
    sector_key: 'retail',
    sector_name: 'تجزئة وملابس (Retail & Apparel)',
    sector_tagline: 'محلات الملابس، الأحذية، الإكسسوارات والموضة',
    icon: 'shirt',
    primary_action_title: 'استقبل أول طلب مبيعات',
    primary_action_route: 'pos',
    terminology: {
      order: 'فاتورة بيع',
      customer: 'زبون / عميل',
      product: 'صنف / موديل',
      unit: 'قطعة',
    },
    enabled_modules: ['pos', 'inventory', 'orders', 'commissions', 'crm', 'purchases', 'reports', 'settings', 'returns', 'shifts', 'users'],
    default_units: ['قطعة', 'دستة', 'طقم'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      open_time: '11:00',
      close_time: '23:30',
      closed_days: ['الجمعة صباحاً'],
      formatted_text: 'السبت - الخميس: 11:00 ص - 11:30 م | الجمعة: بعد صلاة الظهر',
    },
    starter_categories: [
      { name: 'رجالي', station: 'قسم الملابس الرجالية' },
      { name: 'حريمي', station: 'قسم الملابس الحريمية' },
      { name: 'أطفال', station: 'قسم ملابس الأطفال' },
      { name: 'أحذية وإكسسوارات', station: 'قسم الإكسسوار والأحذية' },
    ],
    starter_addons: [
      { name: 'تغليف هدايا فاخر', price: 30, currency: 'EGP' },
      { name: 'كارت إهداء مخصص', price: 15, currency: 'EGP' },
      { name: 'تعديل وتقصير فوري', price: 25, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'تيشيرت قطن كاجوال فاخر',
        category_name: 'رجالي',
        selling_price: 350,
        purchase_price: 200,
        stock_quantity: 25,
        low_stock_threshold: 4,
        size: 'L',
        color: 'أسود',
      },
      {
        name: 'بنطلون جينز كلاسيك سليم',
        category_name: 'رجالي',
        selling_price: 550,
        purchase_price: 320,
        stock_quantity: 18,
        low_stock_threshold: 3,
        size: '34',
        color: 'أزرق داكن',
      },
      {
        name: 'قميص كتان صيفي مريح',
        category_name: 'رجالي',
        selling_price: 420,
        purchase_price: 240,
        stock_quantity: 15,
        low_stock_threshold: 3,
        size: 'XL',
        color: 'أبيض',
      },
      {
        name: 'فستان صيفي مشجر ناعم',
        category_name: 'حريمي',
        selling_price: 680,
        purchase_price: 390,
        stock_quantity: 12,
        low_stock_threshold: 2,
        size: 'M',
        color: 'زهري',
      },
      {
        name: 'حذاء سنيكرز كاجوال خفيف',
        category_name: 'أحذية وإكسسوارات',
        selling_price: 720,
        purchase_price: 440,
        stock_quantity: 10,
        low_stock_threshold: 2,
        size: '42',
        color: 'أبيض / رمادي',
      },
      {
        name: 'حزام جلد طبيعي بإبزيم معدني',
        category_name: 'أحذية وإكسسوارات',
        selling_price: 180,
        purchase_price: 90,
        stock_quantity: 20,
        low_stock_threshold: 5,
        size: 'Standard',
        color: 'بني داكن',
      },
    ],
  },
  {
    sector_key: 'grocery',
    sector_name: 'سوبر ماركت وبقالة (Grocery & Market)',
    sector_tagline: 'مواد غذائية، ألبان، منظفات ومبيعات سريعة مع ميزان باركود',
    icon: 'shopping-cart',
    primary_action_title: 'افتح شاشة الكاشير السريع',
    primary_action_route: 'pos',
    terminology: {
      order: 'فاتورة كاشير',
      customer: 'زبون المتجر',
      product: 'سلعة / منتج',
      unit: 'قطعة / كجم',
    },
    enabled_modules: ['pos', 'inventory', 'purchases', 'reports', 'settings', 'returns', 'shifts', 'users'],
    default_units: ['قطعة', 'كيلوجرام', 'كرتونة', 'عبوة'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
      open_time: '08:00',
      close_time: '01:00',
      closed_days: [],
      formatted_text: 'طوال أيام الأسبوع: 08:00 ص - 01:00 ص (خدمة متواصلة)',
    },
    starter_categories: [
      { name: 'ألبان وأجبان', station: 'ثلاجة الألبان' },
      { name: 'مشروبات ومياه', station: 'ثلاجة المشروبات' },
      { name: 'معلبات وبقوليات', station: 'الأرفف الجافة' },
      { name: 'منظفات ومنزليات', station: 'قسم المنظفات' },
      { name: 'سناكس وحلويات', station: 'كاشير السناكس' },
    ],
    starter_addons: [
      { name: 'كيس تسوق بيئي كبير', price: 3, currency: 'EGP' },
      { name: 'خدمة توصيل منزلي سريعة', price: 15, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'حليب كامل الدسم 1 لتر',
        category_name: 'ألبان وأجبان',
        selling_price: 42,
        purchase_price: 36,
        stock_quantity: 50,
        low_stock_threshold: 10,
      },
      {
        name: 'جبنة بيضاء فيتا 500 جم',
        category_name: 'ألبان وأجبان',
        selling_price: 38,
        purchase_price: 31,
        stock_quantity: 40,
        low_stock_threshold: 8,
      },
      {
        name: 'أرز مصري فاخر 1 كجم',
        category_name: 'معلبات وبقوليات',
        selling_price: 35,
        purchase_price: 28,
        stock_quantity: 60,
        low_stock_threshold: 15,
      },
      {
        name: 'زيت عباد الشمس نقي 800 مل',
        category_name: 'معلبات وبقوليات',
        selling_price: 68,
        purchase_price: 58,
        stock_quantity: 30,
        low_stock_threshold: 6,
      },
      {
        name: 'مياه معدنية طبيعية 1.5 لتر',
        category_name: 'مشروبات ومياه',
        selling_price: 8,
        purchase_price: 5.5,
        stock_quantity: 120,
        low_stock_threshold: 24,
      },
      {
        name: 'مسحوق غسيل أوتوماتيك 2.5 كجم',
        category_name: 'منظفات ومنزليات',
        selling_price: 165,
        purchase_price: 135,
        stock_quantity: 15,
        low_stock_threshold: 3,
      },
    ],
  },
  {
    sector_key: 'cafe_restaurant',
    sector_name: 'مطاعم وكافيهات (Cafe & Food)',
    sector_tagline: 'مشروبات، وجبات سريعة، طاولة وتيك أواي ومحطات تحضير',
    icon: 'coffee',
    primary_action_title: 'استقبل أول طلب طاولة أو تيك أواي',
    primary_action_route: 'pos',
    terminology: {
      order: 'طلب / شيك',
      customer: 'ضيف / عميل',
      product: 'صنف / وجبة',
      unit: 'طلب',
    },
    enabled_modules: ['pos', 'inventory', 'orders', 'reports', 'settings', 'shifts', 'users'],
    default_units: ['طلب', 'كوب', 'وجبة'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      open_time: '12:00',
      close_time: '23:00',
      closed_days: ['الجمعة'],
      formatted_text: 'السبت، الأحد، الإثنين، الثلاثاء، الأربعاء، الخميس: 12:00 م - 11:00 م | مغلق: الجمعة',
    },
    starter_stations: [
      { name: 'Hot line (المطبخ الساخن)' },
      { name: 'Cold & salads (السلطات والمقبلات)' },
      { name: 'Bar & drinks (بار المشروبات)' },
    ],
    starter_categories: [
      { name: 'المشويات', station: 'Hot line' },
      { name: 'أكلات مصرية', station: 'Hot line' },
      { name: 'السلطات والإضافات', station: 'Cold & salads' },
      { name: 'الحلويات', station: 'Cold & salads' },
      { name: 'المشروبات', station: 'Bar & drinks' },
    ],
    starter_addons: [
      { name: 'جبنة زيادة (Extra Cheese)', price: 10, currency: 'EGP' },
      { name: 'صوص زيادة (Extra Sauce)', price: 5, currency: 'EGP' },
      { name: 'بطاطس مقلية إضافية', price: 20, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'كشري مصري مميز بالصلصة والدقة',
        category_name: 'أكلات مصرية',
        selling_price: 60,
        purchase_price: 24,
        stock_quantity: 100,
        low_stock_threshold: 15,
      },
      {
        name: 'ملوخية بالفراخ المحمرة مع الأرز',
        category_name: 'أكلات مصرية',
        selling_price: 140,
        purchase_price: 75,
        stock_quantity: 30,
        low_stock_threshold: 5,
      },
      {
        name: 'شيش طاووق مشوي على الفحم',
        category_name: 'المشويات',
        selling_price: 155,
        purchase_price: 85,
        stock_quantity: 25,
        low_stock_threshold: 5,
      },
      {
        name: 'كفتة مشوية بلدي ربع كيلو',
        category_name: 'المشويات',
        selling_price: 165,
        purchase_price: 95,
        stock_quantity: 25,
        low_stock_threshold: 5,
      },
      {
        name: 'سلطة طحينة خضراء بلدي',
        category_name: 'السلطات والإضافات',
        selling_price: 20,
        purchase_price: 6,
        stock_quantity: 80,
        low_stock_threshold: 15,
      },
      {
        name: 'إسبريسو دبل إيطالي',
        category_name: 'المشروبات',
        selling_price: 45,
        purchase_price: 18,
        stock_quantity: 150,
        low_stock_threshold: 20,
      },
      {
        name: 'أم علي بالمكسرات والقشطة',
        category_name: 'الحلويات',
        selling_price: 55,
        purchase_price: 22,
        stock_quantity: 30,
        low_stock_threshold: 5,
      },
    ],
  },
  {
    sector_key: 'electronics',
    sector_name: 'إلكترونيات وتكنولوجيا (Tech & Phones)',
    sector_tagline: 'هواتف، أجهزة، إكسسوارات، فواتير وضمان بالسيريال',
    icon: 'smartphone',
    primary_action_title: 'إصدار أول فاتورة بضمان',
    primary_action_route: 'pos',
    terminology: {
      order: 'فاتورة مبيعات',
      customer: 'عميل شركات / فرد',
      product: 'جهاز / ملحق',
      unit: 'قطعة',
    },
    enabled_modules: ['pos', 'inventory', 'orders', 'commissions', 'crm', 'purchases', 'reports', 'settings', 'returns', 'shifts', 'users'],
    default_units: ['قطعة', 'طقم'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      open_time: '10:30',
      close_time: '23:00',
      closed_days: ['الجمعة صباحاً'],
      formatted_text: 'السبت - الخميس: 10:30 ص - 11:00 م | الجمعة: 02:00 م - 11:00 م',
    },
    starter_categories: [
      { name: 'كابلات وشواحن', station: 'قسم الشواحن' },
      { name: 'سماعات وصوتيات', station: 'قسم الصوتيات' },
      { name: 'باور بانك وطاقة', station: 'قسم الطاقة' },
      { name: 'حماية وجرابات', station: 'منطقة الإكسسوار' },
    ],
    starter_addons: [
      { name: 'تركيب إسكرينة احترافي مجاني', price: 0, currency: 'EGP' },
      { name: 'تمديد ضمان 6 أشهر إضافية', price: 60, currency: 'EGP' },
      { name: 'علبة هدايا أنيقة', price: 20, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'رأس شاحن سريع 33W معتمد أصلي',
        category_name: 'كابلات وشواحن',
        selling_price: 320,
        purchase_price: 190,
        stock_quantity: 25,
        low_stock_threshold: 5,
      },
      {
        name: 'كابل شحن سريع Type-C معتمد 1 متر',
        category_name: 'كابلات وشواحن',
        selling_price: 140,
        purchase_price: 70,
        stock_quantity: 40,
        low_stock_threshold: 8,
      },
      {
        name: 'سماعة بلوتوث لاسلكية TWS عازلة للضوضاء',
        category_name: 'سماعات وصوتيات',
        selling_price: 550,
        purchase_price: 340,
        stock_quantity: 15,
        low_stock_threshold: 3,
      },
      {
        name: 'باور بانك 10,000 مللي أمبير شحن سريع',
        category_name: 'باور بانك وطاقة',
        selling_price: 680,
        purchase_price: 430,
        stock_quantity: 12,
        low_stock_threshold: 3,
      },
      {
        name: 'إسكرينة حماية زجاجية 9D مقاومة للصدمات',
        category_name: 'حماية وجرابات',
        selling_price: 80,
        purchase_price: 25,
        stock_quantity: 60,
        low_stock_threshold: 10,
      },
      {
        name: 'جراب حماية سليكون ضد الصدمات شفاف',
        category_name: 'حماية وجرابات',
        selling_price: 120,
        purchase_price: 45,
        stock_quantity: 30,
        low_stock_threshold: 6,
      },
    ],
  },
  {
    sector_key: 'maintenance',
    sector_name: 'ورش صيانة ومراكز خدمة (Repair & Service)',
    sector_tagline: 'تذاكر صيانة، دورات عمل فنيين، متابعة حالات وأجور صيانة',
    icon: 'tool',
    primary_action_title: 'سجل أول أمر شغل صيانة',
    primary_action_route: 'orders',
    terminology: {
      order: 'أمر صيانة / تذكرة',
      customer: 'صاحب الجهاز',
      product: 'خدمة / قطعة غيار',
      unit: 'خدمة',
    },
    enabled_modules: ['orders', 'crm', 'inventory', 'pos', 'commissions', 'reports', 'settings', 'shifts', 'users'],
    default_units: ['خدمة', 'قطعة'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      open_time: '10:00',
      close_time: '22:00',
      closed_days: ['الجمعة'],
      formatted_text: 'السبت - الخميس: 10:00 ص - 10:00 م | الجمعة: إجازة أسبوعية',
    },
    starter_stations: [
      { name: 'طاولة الفحص والتشخيص' },
      { name: 'مكتب الهاردوير واللحام' },
      { name: 'منطقة التسليم والكاشير' },
    ],
    starter_categories: [
      { name: 'خدمات فحص وبرمجة', station: 'طاولة الفحص والتشخيص' },
      { name: 'صيانة شاشات', station: 'مكتب الهاردوير واللحام' },
      { name: 'بطاريات ومنافذ شحن', station: 'مكتب الهاردوير واللحام' },
      { name: 'قطع غيار واستهلاكيات', station: 'منطقة التسليم والكاشير' },
    ],
    starter_addons: [
      { name: 'فحص فوري مستعجل VIP', price: 50, currency: 'EGP' },
      { name: 'تنظيف شامل لجهاز العميل مع الخدمة', price: 20, currency: 'EGP' },
      { name: 'نسخ احتياطي للبيانات قبل الصيانة', price: 40, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'فحص شامل وكشف أعطال دقيق',
        category_name: 'خدمات فحص وبرمجة',
        selling_price: 100,
        purchase_price: 20,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'استبدال شاشة أصلية مع التركيب والضمان',
        category_name: 'صيانة شاشات',
        selling_price: 650,
        purchase_price: 420,
        stock_quantity: 8,
        low_stock_threshold: 2,
      },
      {
        name: 'استبدال بطارية عالية الكفاءة مع المعايرة',
        category_name: 'بطاريات ومنافذ شحن',
        selling_price: 380,
        purchase_price: 220,
        stock_quantity: 12,
        low_stock_threshold: 3,
      },
      {
        name: 'تنظيف مدخل شحن وسماعات ومكبرات الصوت',
        category_name: 'خدمات فحص وبرمجة',
        selling_price: 70,
        purchase_price: 15,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'سوفت وير وتحديث وضبط نظام التشغيل',
        category_name: 'خدمات فحص وبرمجة',
        selling_price: 150,
        purchase_price: 30,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
    ],
  },
  {
    sector_key: 'auto_workshop',
    sector_name: 'ورش إصلاح السيارات',
    sector_tagline: 'أوامر شغل للسيارات مع قطع غيار ومصنعية وفاتورة عند التسليم',
    icon: 'tool',
    primary_action_title: 'استلام سيارة وفتح أمر إصلاح',
    primary_action_route: 'orders',
    terminology: {
      order: 'أمر إصلاح سيارة',
      customer: 'مالك السيارة',
      product: 'قطعة غيار / مصنعية',
      unit: 'قطعة / خدمة',
    },
    enabled_modules: ['orders', 'crm', 'inventory', 'pos', 'commissions', 'reports', 'settings', 'shifts', 'users'],
    default_units: ['قطعة', 'لتر', 'خدمة'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      open_time: '09:00',
      close_time: '21:00',
      closed_days: ['الجمعة'],
      formatted_text: 'السبت - الخميس: 09:00 ص - 09:00 م | الجمعة: إجازة أسبوعية',
    },
    starter_stations: [
      { name: 'استقبال وفحص السيارات' },
      { name: 'منطقة الإصلاح' },
      { name: 'مخزن قطع الغيار' },
    ],
    starter_categories: [
      { name: 'فحص وتشخيص', station: 'استقبال وفحص السيارات' },
      { name: 'زيوت وفلاتر', station: 'مخزن قطع الغيار' },
      { name: 'فرامل وتعليق', station: 'مخزن قطع الغيار' },
      { name: 'كهرباء سيارات', station: 'منطقة الإصلاح' },
      { name: 'مصنعية وإصلاح', station: 'منطقة الإصلاح' },
    ],
    starter_addons: [],
    starter_products: [
      {
        name: 'فحص كمبيوتر شامل للأعطال والحساسات',
        category_name: 'فحص وتشخيص',
        selling_price: 350,
        purchase_price: 50,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'تغيير زيت محرك تخليقي 10,000 كم مع الفلتر',
        category_name: 'زيوت وفلاتر',
        selling_price: 1200,
        purchase_price: 900,
        stock_quantity: 20,
        low_stock_threshold: 4,
      },
      {
        name: 'خرط وتغيير طقم تيل فرامل أمامي',
        category_name: 'فرامل وتعليق',
        selling_price: 450,
        purchase_price: 250,
        stock_quantity: 12,
        low_stock_threshold: 3,
      },
      {
        name: 'صيانة وفحص دورة التبريد والردياتير',
        category_name: 'مصنعية وإصلاح',
        selling_price: 300,
        purchase_price: 80,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'فحص وضبط كهرباء ودينامو وبطارية',
        category_name: 'كهرباء سيارات',
        selling_price: 250,
        purchase_price: 40,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
    ],
  },
  {
    sector_key: 'spare_parts',
    sector_name: 'قطع غيار وسيارات (Auto Spare Parts)',
    sector_tagline: 'بيع قطع غيار السيارات مع أكواد OEM والتوافق حسب الموديل وسنة الصنع',
    icon: 'tool',
    primary_action_title: 'إصدار فاتورة بيع قطعة غيار',
    primary_action_route: 'pos',
    terminology: {
      order: 'طلب قطع غيار',
      customer: 'مركز خدمة / عميل',
      product: 'قطعة غيار',
      unit: 'قطعة',
    },
    enabled_modules: ['inventory', 'pos', 'purchases', 'orders', 'reports', 'settings', 'shifts', 'users', 'returns'],
    default_units: ['قطعة', 'طقم', 'لتر'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      open_time: '09:00',
      close_time: '21:00',
      closed_days: ['الجمعة'],
      formatted_text: 'السبت - الخميس: 09:00 ص - 09:00 م | الجمعة: إجازة أسبوعية',
    },
    starter_stations: [
      { name: 'مكتب المبيعات والكاشير' },
      { name: 'مستودع قطع الغيار' },
    ],
    starter_categories: [
      { name: 'محركات وسيور', station: 'مستودع قطع الغيار' },
      { name: 'فرامل وتيل', station: 'مستودع قطع الغيار' },
      { name: 'عفشة ومساعدين', station: 'مستودع قطع الغيار' },
      { name: 'زيوت وفلاتر', station: 'مستودع قطع الغيار' },
      { name: 'كهرباء وإنارة', station: 'مستودع قطع الغيار' },
    ],
    starter_addons: [],
    starter_products: [
      {
        name: 'تيل فرامل أمامي سيراميك أصلي',
        category_name: 'فرامل وتيل',
        selling_price: 650,
        purchase_price: 420,
        stock_quantity: 15,
        low_stock_threshold: 3,
      },
      {
        name: 'فلتر زيت محرك أصلي معتمد',
        category_name: 'زيوت وفلاتر',
        selling_price: 180,
        purchase_price: 110,
        stock_quantity: 30,
        low_stock_threshold: 5,
      },
      {
        name: 'سير كاتينة ياباني أصلي مقوى',
        category_name: 'محركات وسيور',
        selling_price: 520,
        purchase_price: 330,
        stock_quantity: 10,
        low_stock_threshold: 2,
      },
    ],
  },
  {
    sector_key: 'subscriptions_gym',
    sector_name: 'صالات رياضية ولياقة (Gym & Wellness)',
    sector_tagline: 'عضويات، باقات حصص تدريب، تجميد اشتراكات وخدمات صحية',
    icon: 'activity',
    primary_action_title: 'تسجيل أول مشترك / عضوية',
    primary_action_route: 'subscriptions',
    terminology: {
      order: 'اشتراك / باقة',
      customer: 'عضو / مشترك',
      product: 'باقة / مكمل غذائي',
      unit: 'اشتراك / جلسة',
    },
    enabled_modules: ['subscriptions', 'pos', 'crm', 'reports', 'settings', 'shifts', 'users'],
    default_units: ['اشتراك', 'جلسة', 'شهر'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
      open_time: '06:00',
      close_time: '00:00',
      closed_days: [],
      formatted_text: 'طوال الأسبوع: 06:00 ص - 12:00 منتصف الليل (فترات مخصصة)',
    },
    starter_categories: [
      { name: 'عضويات شهرية', station: 'مكتب الاستقبال' },
      { name: 'باقات حصص PT', station: 'صالة التدريب' },
      { name: 'مكملات وسناكس صحي', station: 'البار الصحي' },
      { name: 'جلسات استشفاء', station: 'منطقة الساونا والجاكوزي' },
    ],
    starter_addons: [
      { name: 'تأجير خزانة خاصة شهرية', price: 100, currency: 'EGP' },
      { name: 'جلسة قياس InBody مع أخصائي', price: 40, currency: 'EGP' },
      { name: 'منشفة خاصة مع زجاجة مياه', price: 15, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'اشتراك شهري صالة لياقة مفتوح',
        category_name: 'عضويات شهرية',
        selling_price: 450,
        purchase_price: 50,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'اشتراك 3 شهور VIP شامل الساونا والجاكوزي',
        category_name: 'عضويات شهرية',
        selling_price: 1100,
        purchase_price: 120,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'باقة 12 جلسة تدريب شخصي PT مع كابتن خاص',
        category_name: 'باقات حصص PT',
        selling_price: 1500,
        purchase_price: 300,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'تذكرة دخول يوم واحد Day Pass',
        category_name: 'عضويات شهرية',
        selling_price: 60,
        purchase_price: 10,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'عبوة بروتين شيك شوكولاتة 330 مل جاهزة',
        category_name: 'مكملات وسناكس صحي',
        selling_price: 75,
        purchase_price: 48,
        stock_quantity: 40,
        low_stock_threshold: 8,
      },
    ],
  },
  {
    sector_key: 'law_firm',
    sector_name: 'مكاتب محاماة واستشارات قانونية (Law Firm)',
    sector_tagline: 'إدارة ملفات القضايا، الجلسات، التوكيلات، وأمانات الموكلين',
    icon: 'scale',
    primary_action_title: 'سجّل أول ملف قضية',
    primary_action_route: 'cases',
    terminology: {
      order: 'ملف قضية',
      customer: 'موكّل',
      product: 'خدمة قانونية / أتعاب',
      unit: 'جلسة / ساعة',
    },
    enabled_modules: ['cases', 'appointments', 'crm', 'orders', 'reports', 'settings', 'users', 'salaries'],
    default_units: ['قضية', 'جلسة', 'ساعة استشارة'],
    starter_working_hours: {
      days: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      open_time: '09:00',
      close_time: '20:00',
      closed_days: ['الجمعة', 'السبت'],
      formatted_text: 'الأحد - الخميس: 09:00 ص - 08:00 م | الجمعة والسبت: عطلة',
    },
    starter_categories: [
      { name: 'قضايا مدنية وتعويضات', station: 'الدائرة المدنية' },
      { name: 'قضايا تجارية وشركات', station: 'المحاكم الاقتصادية' },
      { name: 'قضايا جنائية وجنح', station: 'محاكم الجنايات والجنح' },
      { name: 'قضايا عمالية ومنازعات عمل', station: 'الدوائر العمالية' },
      { name: 'أحوال شخصية وأسرة', station: 'محاكم الأسرة' },
      { name: 'عقود واستشارات سنوية', station: 'الاستشارات والتوثيق' },
    ],
    starter_addons: [
      { name: 'استخراج صورة رسمية من الحكم', price: 200, currency: 'EGP' },
      { name: 'إعلان صحيفة الدعوى على يد محضر', price: 150, currency: 'EGP' },
      { name: 'صياغة إنذار رسمي على يد محضر', price: 300, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'أتعاب دراسة ملف وقيد دعوى مدنية',
        category_name: 'قضايا مدنية وتعويضات',
        selling_price: 5000,
        purchase_price: 1000,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'حضور جلسة محكمة وجنايات / جنح',
        category_name: 'قضايا جنائية وجنح',
        selling_price: 3000,
        purchase_price: 500,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'صياغة ومراجعة عقد شركة تجاري',
        category_name: 'قضايا تجارية وشركات',
        selling_price: 2500,
        purchase_price: 0,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'استشارة قانونية شفوية / كتابية (ساعة)',
        category_name: 'عقود واستشارات سنوية',
        selling_price: 1000,
        purchase_price: 0,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'قيد وتداول دعوى أسرة ونفقة / حضانة',
        category_name: 'أحوال شخصية وأسرة',
        selling_price: 3500,
        purchase_price: 500,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'تسوية ومنازعة عمالية أمام مكتب العمل والمحكمة',
        category_name: 'قضايا عمالية ومنازعات عمل',
        selling_price: 4000,
        purchase_price: 600,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
    ],
  },
  {
    sector_key: 'salon_barbershop',
    sector_name: 'صالونات وتجميل وحلاقة (Salon & Beauty)',
    sector_tagline: 'كراسي حلاقة وتصفيف، خدمات، باقات، وعمولات الفنيين والمصففين',
    icon: 'scissors',
    primary_action_title: 'افتح شاشة الكراسي والخدمات',
    primary_action_route: 'salon',
    terminology: {
      order: 'فاتورة خدمة وتصفيف',
      customer: 'عميل / زبون',
      product: 'خدمة / باقة تصفيف',
      unit: 'خدمة',
    },
    enabled_modules: ['salon', 'pos', 'commissions', 'appointments', 'crm', 'reports', 'settings', 'shifts', 'users'],
    default_units: ['خدمة', 'جلسة', 'باقة'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
      open_time: '10:00',
      close_time: '23:00',
      closed_days: [],
      formatted_text: 'طوال أيام الأسبوع: 10:00 ص - 11:00 م',
    },
    starter_stations: [
      { name: 'كراسي التصفيف' },
      { name: 'كراسي الحلاقة' },
      { name: 'قسم العناية والبشرة' },
    ],
    starter_categories: [
      { name: 'قص وتصفيف الشعر', station: 'كراسي التصفيف' },
      { name: 'حلاقة وذقن', station: 'كراسي الحلاقة' },
      { name: 'عناية بالبشرة وتنظيف', station: 'قسم العناية والبشرة' },
      { name: 'صبغات ومواد معالجة', station: 'كراسي التصفيف' },
      { name: 'باقات وبكجات العرسان', station: 'كراسي التصفيف' },
    ],
    starter_addons: [
      { name: 'ماسك طمي مغربي للبشرة', price: 50, currency: 'EGP' },
      { name: 'حمام بخار وسيروم شعر', price: 70, currency: 'EGP' },
      { name: 'مساج استرخائي للرأس 15 دقيقة', price: 60, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'قص شعر وتصفيف سشوار احترافي',
        category_name: 'قص وتصفيف الشعر',
        selling_price: 150,
        purchase_price: 20,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'حلاقة ذقن VIP وتحديد بالبخار',
        category_name: 'حلاقة وذقن',
        selling_price: 100,
        purchase_price: 15,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'جلسة هيدرافيشل لتنظيف البشرة عميق',
        category_name: 'عناية بالبشرة وتنظيف',
        selling_price: 450,
        purchase_price: 90,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'جلسة بروتين معالج وترميم للشعر',
        category_name: 'صبغات ومواد معالجة',
        selling_price: 800,
        purchase_price: 250,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
      {
        name: 'بكج عريس ملكي متكامل VIP',
        category_name: 'باقات وبكجات العرسان',
        selling_price: 1500,
        purchase_price: 300,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
    ],
  },
  {
    sector_key: 'crm',
    sector_name: 'إدارة علاقات العملاء (Customer Relationship Management)',
    sector_tagline: 'قطاع مستقل لإدارة العملاء والشركات والفرص البيعية والتواصل',
    icon: 'users',
    primary_action_title: 'ابدأ بإضافة أول عميل',
    primary_action_route: 'crm',
    terminology: {
      order: 'صفقة / فرصة بيع',
      customer: 'عميل / جهة اتصال',
      product: 'خدمة / عرض سعر',
      unit: 'جهة اتصال',
    },
    enabled_modules: ['crm', 'reports', 'settings', 'users'],
    default_units: ['جهة اتصال', 'شركة', 'صفقة'],
    starter_working_hours: null,
    starter_categories: [],
    starter_addons: [],
    starter_products: [],
    starter_stations: [],
  },
  {
    sector_key: 'custom',
    sector_name: 'نشاط تجاري عام (أخرى - Custom)',
    sector_tagline: 'قالب مرن وشامل يتكيف مع أي نشاط تجاري أو خدمي',
    icon: 'grid',
    primary_action_title: 'ابدأ أول عملية في النظام',
    primary_action_route: 'pos',
    terminology: {
      order: 'طلب / فاتورة',
      customer: 'عميل',
      product: 'صنف / منتج',
      unit: 'قطعة',
    },
    enabled_modules: ['pos', 'inventory', 'orders', 'purchases', 'reports', 'settings', 'shifts', 'users'],
    default_units: ['قطعة', 'خدمة', 'ساعة'],
    starter_working_hours: {
      days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      open_time: '09:00',
      close_time: '21:00',
      closed_days: ['الجمعة'],
      formatted_text: 'السبت - الخميس: 09:00 ص - 09:00 م | الجمعة: عطلة',
    },
    starter_categories: [
      { name: 'أصناف عامة', station: 'المستودع الرئيسي' },
      { name: 'خدمات واستشارات', station: 'مكتب العمليات' },
    ],
    starter_addons: [
      { name: 'خدمة سريعة مميزة', price: 30, currency: 'EGP' },
    ],
    starter_products: [
      {
        name: 'منتج تجاري قياسي 1',
        category_name: 'أصناف عامة',
        selling_price: 150,
        purchase_price: 90,
        stock_quantity: 25,
        low_stock_threshold: 5,
      },
      {
        name: 'منتج تجاري متميز 2',
        category_name: 'أصناف عامة',
        selling_price: 320,
        purchase_price: 190,
        stock_quantity: 15,
        low_stock_threshold: 3,
      },
      {
        name: 'خدمة تجارية واستشارية',
        category_name: 'خدمات واستشارات',
        selling_price: 200,
        purchase_price: 40,
        stock_quantity: 999,
        low_stock_threshold: 0,
      },
    ],
  },
];

// أسماء الموديولات المسموحة (لازم تطابق system_modules)
const VALID_MODULES = new Set([
  'pos', 'inventory', 'orders', 'commissions', 'crm', 'purchases',
  'reports', 'settings', 'returns', 'shifts', 'users',
  'subscriptions', 'cases', 'appointments', 'salaries', 'salon',
]);

// القيمة القديمة اللي كانت بتمثل "خدمة" (مخزون وهمي)
const LEGACY_SERVICE_STOCK = 999;

function normalizePreset(preset) {
  const products = (preset.starter_products ?? []).map((product) => {
    const isService = product.stock_quantity >= LEGACY_SERVICE_STOCK;
    return {
      ...product,
      seed_key: `${preset.sector_key}:${product.name}`,
      is_service: isService,
      stock_quantity: isService ? 0 : product.stock_quantity,
      low_stock_threshold: isService ? 0 : product.low_stock_threshold,
    };
  });

  return {
    ...preset,
    starter_stations: preset.starter_stations ?? [],
    starter_addons: preset.starter_addons ?? [],
    starter_products: products,
  };
}

function validatePresets(presets) {
  const errors = [];
  const keys = new Set();

  for (const preset of presets) {
    const key = preset.sector_key;
    if (keys.has(key)) errors.push(`${key}: sector_key مكرر`);
    keys.add(key);

    for (const moduleName of preset.enabled_modules) {
      if (!VALID_MODULES.has(moduleName)) errors.push(`${key}: موديول غير معروف "${moduleName}"`);
    }

    const categoryNames = new Set(preset.starter_categories.map((category) => category.name));
    const seedKeys = new Set();

    for (const product of preset.starter_products) {
      if (!categoryNames.has(product.category_name)) {
        errors.push(`${key}: المنتج "${product.name}" بيشير لفئة مش موجودة "${product.category_name}"`);
      }
      if (seedKeys.has(product.seed_key)) errors.push(`${key}: منتج مكرر "${product.name}"`);
      seedKeys.add(product.seed_key);

      for (const field of ['selling_price', 'purchase_price', 'stock_quantity']) {
        if (typeof product[field] !== 'number' || product[field] < 0) {
          errors.push(`${key}: "${product.name}" قيمة غير صحيحة في ${field}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('SECTOR_PRESETS غير صالح:\n- ' + errors.join('\n- '));
  }
}

const SECTOR_PRESETS = RAW_SECTOR_PRESETS.map(normalizePreset);
validatePresets(SECTOR_PRESETS);

module.exports = {
  SECTOR_PRESETS,
};
