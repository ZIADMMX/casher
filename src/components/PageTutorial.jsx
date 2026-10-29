import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import '../styles/tutorial.css';

/* ---------- Icons (inline SVG, inherit currentColor) ---------- */
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const ICONS = {
  receipt: (
    <svg {...svgProps}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
  boxes: (
    <svg {...svgProps}>
      <path d="M12 3l4 2.3v4.4L12 12 8 9.7V5.3z" />
      <path d="M6 12l4 2.3v4.4L6 21l-4-2.3v-4.4z" />
      <path d="M18 12l4 2.3v4.4L18 21l-4-2.3v-4.4z" />
    </svg>
  ),
  payment: (
    <svg {...svgProps}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M14 8.5c-.4-.6-1.1-1-2-1-1.1 0-2 .6-2 1.5s.9 1.3 2 1.5 2 .6 2 1.5-.9 1.5-2 1.5c-.9 0-1.6-.4-2-1" />
      <path d="M12 6.5v1M12 14.5v1" />
    </svg>
  ),
  undo: (
    <svg {...svgProps}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </svg>
  ),
  printer: (
    <svg {...svgProps}>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </svg>
  ),
  info: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  compass: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  ),
  check: (
    <svg {...svgProps} strokeWidth={2.4}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  arrowLeft: (
    <svg {...svgProps}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  ),
  arrowRight: (
    <svg {...svgProps}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  close: (
    <svg {...svgProps} strokeWidth={2.2}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  shield: (
    <svg {...svgProps}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  sliders: (
    <svg {...svgProps}>
      <line x1="21" y1="4" x2="14" y2="4" />
      <line x1="10" y1="4" x2="3" y2="4" />
      <line x1="21" y1="12" x2="12" y2="12" />
      <line x1="8" y1="12" x2="3" y2="12" />
      <line x1="21" y1="20" x2="16" y2="20" />
      <line x1="12" y1="20" x2="3" y2="20" />
      <line x1="14" y1="1" x2="14" y2="7" />
      <line x1="8" y1="9" x2="8" y2="15" />
      <line x1="16" y1="17" x2="16" y2="23" />
    </svg>
  ),
  userCog: (
    <svg {...svgProps}>
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <circle cx="19" cy="11" r="2" />
      <path d="M19 8v1M19 13v1M21.6 9.5l-.8.5M17.2 12l-.8.5M21.6 12.5l-.8-.5M17.2 10l-.8-.5" />
    </svg>
  ),
  wallet: (
    <svg {...svgProps}>
      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path d="M16 14h4" />
      <circle cx="18" cy="14" r="1" />
      <path d="M4 7V5a2 2 0 012-2h12a2 2 0 012 2v2" />
    </svg>
  ),
};

/* ---------- Content ---------- */

/** عنوان الهيدر لكل شاشة (لو غير موجود يُستخدم عنوان الخطوة) */
const SCREEN_NAMES = {
  pos: 'نقطة البيع',
  roles: 'الأدوار والصلاحيات',
  salaries: 'الرواتب',
};

/**
 * خطوة "المنتجات" في شاشة نقطة البيع تختلف صياغتها حسب قطاع النشاط (profile key).
 * القطاعات: retail, electronics, maintenance, subscriptions_gym, grocery, spare_parts
 */
const POS_STEP_PRODUCTS_BY_SECTOR = {
  default: {
    title: 'أضف المنتجات أولاً',
    description:
      'المنتجات التي تبيعها هنا تأتي من المخزون — أضف منتجاتك وكمياتها هناك لتصبح جاهزة للبيع. واختر البائع في كل عملية لاحتساب عمولته. وإذا كانت البضاعة تصل إلى الرف قبل تسجيل استلامها، فمن الإعدادات ← الكاشير يمكنك السماح بالبيع بعد الصفر.',
    action: { label: 'إدارة المخزون', page: 'products' },
  },
  grocery: {
    title: 'أضف الأصناف أولاً',
    description:
      'الأصناف التي تبيعها تأتي من المخزون — أضف أصنافك وأسعارها وكمياتها هناك لتصبح جاهزة للبيع. واختر البائع في كل عملية لاحتساب عمولته.',
    action: { label: 'إدارة المخزون', page: 'products' },
  },
  maintenance: {
    title: 'أضف الخدمات وقطع الغيار أولاً',
    description:
      'الخدمات وقطع الغيار التي تبيعها تأتي من قائمة المنتجات — أضفها بأسعارها لتصبح جاهزة للإضافة على الفاتورة. واختر الفني في كل عملية لاحتساب عمولته.',
    action: { label: 'إدارة المنتجات', page: 'products' },
  },
  subscriptions_gym: {
    title: 'جهّز الباقات والاشتراكات أولاً',
    description:
      'الباقات والعضويات التي تبيعها هنا تُعرَّف من صفحة الاشتراكات — أضف باقاتك بأسعارها ومدتها لتصبح جاهزة للبيع، واختر المدرب أو الموظف في كل عملية لاحتساب عمولته.',
    action: { label: 'إدارة الاشتراكات', page: 'subscriptions' },
  },
};

/**
 * جولة شاشة نقطة البيع: ٥ خطوات.
 * - module: الخطوة تُخفى تلقائياً لو الموديول غير مفعل لهذا النشاط.
 * - action: زر ثانوي ينقل المستخدم لصفحة أخرى.
 */
function buildPosSteps(profileKey) {
  const products = POS_STEP_PRODUCTS_BY_SECTOR[profileKey] || POS_STEP_PRODUCTS_BY_SECTOR.default;
  return [
    {
      id: 'sell',
      icon: 'receipt',
      title: 'بع في ثوانٍ',
      description:
        'سجّل المنتجات، واستلم الدفع، واطبع الإيصال — كل ذلك من شاشة واحدة. المنتجات المُباعة بالوزن تطلب الوزن (أو امسح باركود الميزان فيُملأ تلقائياً).',
    },
    { id: 'products', icon: 'boxes', module: 'inventory', ...products },
    {
      id: 'payment',
      icon: 'payment',
      title: 'استلم الدفع',
      description: 'اقبل النقد أو البطاقة أو المحفظة، وتنتقل عملية البيع مباشرة إلى تقاريرك ودرج النقد.',
    },
    {
      id: 'returns',
      icon: 'undo',
      module: 'returns',
      title: 'الاسترداد كاملاً أو جزئياً',
      description:
        'افتح أي فاتورة سابقة لإرجاع المبلغ. استرد الفاتورة كاملة، أو اضغط بالزر الأيمن على سطر واحد (أو اضغط مطولاً على الجوال) لإرجاع هذا الصنف وحده — فيعود مخزونه وتظل الفاتورة مفتوحة لكل ما احتفظ به العميل. وإذا كانت لديك صلاحية رؤية المبالغ، تعرض الفاتورة أيضاً تكلفة البضاعة وما ربحته منها.',
    },
    {
      id: 'printing',
      icon: 'printer',
      title: 'الإيصالات تطبع نفسها',
      description:
        'على تطبيق الكاشير للكمبيوتر، يتعرف على طابعة الإيصالات الموصلة به ويطبع كل عملية بيع لحظة إتمامها — بدون نافذة طباعة — ويفتح درج النقود في المبيعات النقدية. لا يوجد ما تضبطه؛ وإعدادات الطابعة موجودة لو أردت تغيير عرض الورق أو اختيار طابعة أخرى.',
      action: { label: 'إعداد الطابعة', page: 'settings' },
    },
  ];
}

/**
 * جولة قسم الأدوار والصلاحيات.
 */
function buildRolesSteps() {
  return [
    {
      id: 'roles-1',
      icon: 'shield',
      title: 'تحكّم في الوصول',
      description: 'قرّر بالضبط ما يمكن لكل عضو رؤيته وفعله عبر الأدوار.',
    },
    {
      id: 'roles-2',
      icon: 'sliders',
      title: 'الأدوار المُدمجة تحت تصرّفك',
      description:
        'عدّل أي دور مُدمج — أضف أو احذف الصلاحيات بما يناسب طريقة عملك فعلاً. التغييرات تخص نشاطك وحده، ويمكنك استعادة الإعداد الأصلي في أي وقت.',
    },
    {
      id: 'roles-3',
      icon: 'userCog',
      title: 'عيّنها من صفحة الفريق',
      description: 'أنشئ أدوارًا جاهزة أو مخصصة، ثم عيّن دورًا لكل موظف من فريقك.',
      action: { label: 'اذهب إلى فريقك', page: 'users' },
    },
  ];
}

/** باقي الصفحات: خطوة واحدة (عنوان + وصف) */
const SINGLE_STEP_PAGES = {
  today: {
    title: 'لوحة اليوم (نبض النشاط)',
    description: 'شاشتك اليومية لمتابعة جدول اليوم، العمليات والمهام، المؤشرات المالية، وحالة العملاء المتوافقة مع نشاطك.',
  },
  products: {
    title: 'إدارة المنتجات',
    description: 'من هذه الصفحة يمكنك إضافة منتجات جديدة، تعديل الأسعار، ومتابعة الكميات المتوفرة في المخزن.',
  },
  branches: {
    title: 'إدارة المخزون والفروع',
    description: 'تحكم في مخزونك بدقة، تابع حركات الأصناف، وانقل المنتجات بين الفروع المختلفة.',
  },
  appointments: {
    title: 'الحجوزات والمواعيد',
    description: 'نظم مواعيد عملائك بدقة، تابع الحجوزات القادمة، وقم بإدارتها بكل سهولة.',
  },
  orders: {
    title: 'إدارة الطلبات',
    description: 'تابع طلبات العملاء من البداية حتى التسليم، وتعرف على حالة كل طلب.',
  },
  subscriptions: {
    title: 'الاشتراكات والباقات',
    description: 'أدر اشتراكات عملائك، الباقات الشهرية، ومتابعة التجديدات ومواعيد الانتهاء.',
  },
  commissions: {
    title: 'العمولات والمكافآت',
    description: 'نظم عمولات الموظفين بناءً على المبيعات والأداء بشكل آلي ودقيق.',
  },
  returns: {
    title: 'المرتجعات',
    description: 'قم بإدارة عمليات استرجاع المنتجات واسترداد الأموال للعملاء بخطوات بسيطة.',
  },
  shifts: {
    title: 'ورديات العمل',
    description: 'تابع فتح وإغلاق الورديات للموظفين، وراقب المبالغ النقدية في الدرج لكل وردية.',
  },
  reports: {
    title: 'التقارير والإحصائيات',
    description: 'احصل على نظرة شاملة لأداء نشاطك التجاري من خلال تقارير المبيعات، الأرباح، والمخزون.',
  },
  customers: {
    title: 'قاعدة العملاء',
    description: 'احتفظ ببيانات عملائك، تاريخ مشترياتهم، وتواصل معهم لبناء علاقة قوية.',
  },
  suppliers: {
    title: 'إدارة الموردين',
    description: 'تابع حسابات الموردين، المدفوعات المستحقة، وفواتير المشتريات.',
  },
  users: {
    title: 'المستخدمين والصلاحيات',
    description: 'أضف موظفيك وحدد صلاحية كل منهم للوصول إلى أقسام النظام المختلفة.',
  },
  settings: {
    title: 'إعدادات النظام',
    description: 'خصص النظام ليناسب احتياجات عملك: معلومات النشاط، الضرائب، خيارات الطباعة وغيرها.',
  },
  enterprise: {
    title: 'إدارة المؤسسة',
    description: 'تحكم في فروع مؤسستك المتعددة وإعدادات الربط المركزي.',
  },
  workflows: {
    title: 'مسارات العمل',
    description: 'أنشئ مسارات عمل آلية لتسهيل الإجراءات وتقليل التدخل اليدوي.',
  },
};

function buildSalariesSteps() {
  return [
    {
      id: 'salaries-1',
      icon: 'wallet',
      title: 'ادفع لفريقك',
      description: 'أنشئ وتتبع رواتب فريقك في مكان واحد.',
    },
    {
      id: 'salaries-2',
      icon: 'sliders',
      title: 'السلف والخصومات التلقائية',
      description: 'يتم احتساب الغياب والعمولات والسلف تلقائياً في صافي الراتب المستحق.',
    },
  ];
}

function getSteps(activePage, profileKey, isModuleEnabled) {
  if (activePage === 'pos') {
    return buildPosSteps(profileKey).filter((s) => !s.module || isModuleEnabled(s.module));
  }
  if (activePage === 'roles') {
    return buildRolesSteps();
  }
  if (activePage === 'salaries') {
    return buildSalariesSteps();
  }
  const single = SINGLE_STEP_PAGES[activePage];
  return single ? [{ id: activePage, icon: 'info', ...single }] : [];
}

/* ---------- Component ---------- */

export default function PageTutorial({ activePage, onNavigate }) {
  const { configuration, isModuleEnabled } = useBusinessProfile();
  const profileKey = configuration?.profile?.key;

  const steps = useMemo(
    () => getSteps(activePage, profileKey, isModuleEnabled),
    [activePage, profileKey, isModuleEnabled]
  );

  const [isVisible, setIsVisible] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // التحقق مما إذا كان المستخدم قد رأى الشرح لهذه الصفحة من قبل
    const seen = localStorage.getItem(`tutorial_seen_${activePage}`);
    setIndex(0);
    setIsVisible(!seen && steps.length > 0);
    // الشرح يظهر عند تغيير الصفحة فقط
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  const finish = useCallback(() => {
    localStorage.setItem(`tutorial_seen_${activePage}`, 'true');
    setIsVisible(false);
  }, [activePage]);

  const handleAction = (page) => {
    finish();
    if (typeof onNavigate === 'function') onNavigate(page);
  };

  useEffect(() => {
    if (!isVisible) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') finish();
      // RTL: السهم الأيسر = التالي، الأيمن = السابق
      if (e.key === 'ArrowLeft') setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isVisible, finish, steps.length]);

  if (!isVisible || steps.length === 0) return null;

  const total = steps.length;
  const step = steps[Math.min(index, total - 1)];
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const percent = Math.round(((index + 1) / total) * 100);
  const multi = total > 1;

  return (
    <div className="tutorial-overlay" onClick={finish} role="presentation">
      <div
        className="tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-label="جولة سريعة"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tutorial-header">
          <div className="tutorial-header-main">
            <span className="tutorial-header-compass">{ICONS.compass}</span>
            <div className="tutorial-header-text">
              <span className="tutorial-eyebrow">جولة سريعة</span>
              <h3>{SCREEN_NAMES[activePage] || step.title}</h3>
            </div>
          </div>
          <button type="button" className="tutorial-close-btn" onClick={finish} aria-label="إغلاق">
            {ICONS.close}
          </button>
        </div>

        <div className="tutorial-body">
          {multi && (
            <div className="tutorial-progress-block">
              <div
                className="tutorial-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="tutorial-progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="tutorial-progress-meta">
                <span>
                  خطوة {index + 1} من {total}
                </span>
                <span>{percent}% مكتمل</span>
              </div>
              <div className="tutorial-dots">
                {steps.map((s, i) => {
                  const state = i < index ? 'done' : i === index ? 'active' : 'todo';
                  return (
                    <button
                      type="button"
                      key={s.id}
                      className={`tutorial-dot ${state}`}
                      onClick={() => setIndex(i)}
                      aria-label={`الخطوة ${i + 1}`}
                      aria-current={state === 'active' ? 'step' : undefined}
                    >
                      {state === 'done' ? ICONS.check : i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="tutorial-step" key={step.id}>
            <div className="tutorial-icon-wrapper">
              <span className="tutorial-icon">{ICONS[step.icon] || ICONS.info}</span>
            </div>
            <h2 className="tutorial-title">{step.title}</h2>
            <p className="tutorial-desc">{step.description}</p>
            {step.action && (
              <button type="button" className="tutorial-action-btn" onClick={() => handleAction(step.action.page)}>
                {ICONS.arrowLeft}
                {step.action.label}
              </button>
            )}
          </div>
        </div>

        <div className="tutorial-footer">
          {multi && !isFirst ? (
            <button type="button" className="tutorial-link-btn" onClick={() => setIndex(index - 1)}>
              {ICONS.arrowRight}
              السابق
            </button>
          ) : (
            <span />
          )}
          <div className="tutorial-footer-end">
            {multi && !isLast && (
              <button type="button" className="tutorial-skip-btn" onClick={finish}>
                تخطي
              </button>
            )}
            <button
              type="button"
              className="btn-primary tutorial-primary-btn"
              onClick={isLast ? finish : () => setIndex(index + 1)}
              autoFocus
            >
              {isLast ? 'تمام!' : 'التالي'}
              {isLast ? ICONS.check : ICONS.arrowLeft}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
