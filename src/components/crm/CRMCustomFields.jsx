import {
  ArrowDownIcon, ArrowUpIcon, BriefcaseIcon, BuildingIcon, PencilIcon, PlusIcon, SlidersIcon, TrashIcon, UserIcon, UserPlusIcon,
} from '../icons/PosIcons.jsx';
import { num } from './crmFormat.js';

export const FIELD_ENTITIES = [
  { id: 'customer', label: 'جهات الاتصال', Icon: UserIcon, form: 'نموذج العميل' },
  { id: 'company', label: 'الشركات', Icon: BuildingIcon, form: 'نموذج الشركة' },
  { id: 'opportunity', label: 'الصفقات', Icon: BriefcaseIcon, form: 'نموذج الصفقة' },
  { id: 'lead', label: 'العملاء المحتملون', Icon: UserPlusIcon, form: 'نموذج العميل المحتمل' },
];

// The types the service lets you create; each keeps one color everywhere.
export const FIELD_TYPES = {
  text: { label: 'نص', tone: 'muted' },
  number: { label: 'رقم', tone: 'info' },
  select: { label: 'قائمة اختيار', tone: 'success' },
  date: { label: 'تاريخ', tone: 'warning' },
  boolean: { label: 'نعم / لا', tone: 'primary' },
};

function CRMCustomFields({ entity, onEntity, fieldsByEntity, loading, onAdd, onEdit, onDelete, onMove }) {
  const current = FIELD_ENTITIES.find((item) => item.id === entity) || FIELD_ENTITIES[0];
  const fields = fieldsByEntity[current.id] || [];

  return (
    <div className="crm-ds crm-cf">
      <nav className="crm-ov-card crm-cf-entities" aria-label="نوع السجل المستهدف">
        <h2>نوع السجل المستهدف</h2>
        {FIELD_ENTITIES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`crm-cf-entity ${id === current.id ? 'is-active' : ''}`}
            aria-current={id === current.id ? 'true' : undefined}
            onClick={() => onEntity(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
            <span className="crm-cf-entity-count">{loading ? '—' : num((fieldsByEntity[id] || []).length)}</span>
          </button>
        ))}
      </nav>

      <section className="crm-ov-card crm-cf-main" aria-labelledby="crm-cf-title">
        <header className="crm-cf-head">
          <h2 id="crm-cf-title">حقول {current.label}</h2>
          <p>الحقول دي بتظهر في {current.form} بالترتيب ده. غيّر الترتيب بالأسهم.</p>
        </header>

        {loading ? (
          <p className="crm-pl-note">جارٍ تحميل الحقول...</p>
        ) : fields.length === 0 ? (
          <div className="crm-cf-empty">
            <div className="crm-ov-empty crm-ct-empty">
              <span className="crm-ov-chip crm-ov-chip--lg"><SlidersIcon size={22} /></span>
              <strong>لا توجد حقول مخصصة لهذا النوع</strong>
              <p>الحقول الأساسية شغالة من غير أي إعداد. ضيف حقل بس لما تحتاج بيانات مش موجودة افتراضياً.</p>
              <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={onAdd}>
                <PlusIcon size={18} />
                حقل مخصص جديد
              </button>
            </div>
          </div>
        ) : (
          <>
            <ul className="crm-cf-list">
              {fields.map((field, index) => {
                const type = FIELD_TYPES[field.field_type] || FIELD_TYPES.text;
                return (
                  <li key={field.id} className="crm-cf-row">
                    <div className="crm-cf-order">
                      <button type="button" className="crm-cf-arrow" disabled={index === 0} onClick={() => onMove(field, -1)} aria-label={`تحريك ${field.label} لأعلى`}>
                        <ArrowUpIcon size={14} />
                      </button>
                      <button type="button" className="crm-cf-arrow" disabled={index === fields.length - 1} onClick={() => onMove(field, 1)} aria-label={`تحريك ${field.label} لأسفل`}>
                        <ArrowDownIcon size={14} />
                      </button>
                    </div>
                    <div className="crm-cf-name">
                      <strong>{field.label}</strong>
                      <code dir="ltr">{field.field_key}</code>
                      {field.field_type === 'select' && field.options?.length > 0 && (
                        <span className="crm-cf-options">{field.options.join(' · ')}</span>
                      )}
                    </div>
                    <span className={`crm-ct-badge crm-ct-badge--${type.tone}`}>{type.label}</span>
                    <span className={`crm-ct-badge crm-ct-badge--${field.is_required ? 'primary' : 'muted'}`}>
                      {field.is_required ? 'مطلوب' : 'اختياري'}
                    </span>
                    <div className="crm-ct-actions">
                      <button type="button" className="crm-ct-icon-btn" onClick={() => onEdit(field)} title="تعديل الحقل" aria-label={`تعديل ${field.label}`}>
                        <PencilIcon size={16} />
                      </button>
                      <button type="button" className="crm-ct-icon-btn crm-cf-delete" onClick={() => onDelete(field)} title="حذف الحقل" aria-label={`حذف ${field.label}`}>
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="crm-cf-add-wrap">
              <button type="button" className="crm-pl-add crm-cf-add" onClick={onAdd}>
                <PlusIcon size={16} />
                أضف حقل مخصص لـ{current.label}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default CRMCustomFields;
