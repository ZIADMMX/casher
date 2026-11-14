import { useEffect, useState } from 'react';
import MembershipPlanModal from '../MembershipPlanModal.jsx';
import LineIcon from '../icons/LineIcons.jsx';
import * as subscriptionsApi from '../../api/subscriptions.js';

const CYCLES = { yearly: 'سنوي', quarterly: 'ربع سنوي' };
const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Package catalog: add, edit and delete the packages members can buy. */
export default function GymPackagesPanel({ packages, loading, products, branches, onChanged, onError, addRequest = 0 }) {
  const [editing, setEditing] = useState(null); // null = closed, {} = new, package = edit
  const open = editing !== null;

  // The page header's "add package" button bumps this counter to open the form.
  useEffect(() => { if (addRequest > 0) setEditing({}); }, [addRequest]);

  async function save(payload) {
    try {
      if (editing?.id) await subscriptionsApi.updatePackage(editing.id, payload);
      else await subscriptionsApi.createPackage(payload);
      setEditing(null);
      onChanged();
    } catch (err) {
      onError(`فشل حفظ الباقة: ${err.message}`);
    }
  }

  async function remove(pkg) {
    if (!window.confirm(`هل أنت متأكد من حذف باقة «${pkg.name}»؟`)) return;
    try {
      await subscriptionsApi.deletePackage(pkg.id);
      onChanged();
    } catch (err) {
      onError(`تعذر حذف الباقة: ${err.message}`);
    }
  }

  return (
    <>
      <div className="gco-tools">
        <p className="gco-hint">الباقات اللي تظهر للعضو عند الاشتراك. الباقة المعطّلة لا تظهر في التفعيل والتحصيل.</p>
        <button type="button" className="gco-btn is-primary" onClick={() => setEditing({})}>
          <LineIcon name="cardPlus" size={18} /> إضافة باقة جديدة
        </button>
      </div>

      {loading ? <p className="gco-state">جاري التحميل...</p> : packages.length === 0 ? (
        <p className="gco-state">لا توجد باقات بعد. أضف أول باقة ليتمكن العضو من الاشتراك.</p>
      ) : (
        <div className="gco-pkgs">
          {packages.map((pkg) => {
            const hasSaving = pkg.original_price > pkg.price;
            const discount = pkg.discount_percentage || (hasSaving ? Math.round(((pkg.original_price - pkg.price) / pkg.original_price) * 100) : 0);
            return (
              <article key={pkg.id} className={`gco-card gco-pkg${pkg.is_active ? '' : ' is-off'}${pkg.is_featured ? ' is-featured' : ''}`}>
                <div className="gco-tags">
                  {pkg.badge_text && <span className="gco-tag" style={pkg.badge_color ? { background: pkg.badge_color } : undefined}>{pkg.badge_text}</span>}
                  {pkg.is_featured ? <span className="gco-tag is-star"><LineIcon name="star" size={12} /> مميزة</span> : null}
                  <span className="gco-tag is-soft">{CYCLES[pkg.billing_cycle] || 'شهري'}</span>
                  {!pkg.is_active && <span className="gco-tag is-bad">معطلة</span>}
                </div>
                <h3>{pkg.name}</h3>
                <div className="gco-price">
                  <strong>{money(pkg.price)}<small>ج.م</small></strong>
                  <span>/ {pkg.duration_days} يوم</span>
                  {hasSaving && <s>{money(pkg.original_price)} ج.م</s>}
                  {hasSaving && discount > 0 && <em>وفر {discount}%</em>}
                </div>
                <ul className="gco-feats">
                  <li><LineIcon name={pkg.is_unlimited_sessions ? 'infinity' : 'ticket'} size={16} />{pkg.is_unlimited_sessions ? 'جلسات غير محدودة' : `عدد الجلسات: ${pkg.total_credits || 0}`}</li>
                  <li><LineIcon name="calendar" size={16} />الحجز المسبق: {pkg.advance_booking_days > 0 ? `${pkg.advance_booking_days} يوم` : 'غير محدود'}</li>
                  <li><LineIcon name="sparkles" size={16} />{Array.isArray(pkg.eligible_services) && pkg.eligible_services.length > 0 ? `${pkg.eligible_services.length} خدمات مؤهلة` : 'جميع الخدمات مؤهلة'}</li>
                  {pkg.discount_percentage > 0 && <li><LineIcon name="tag" size={16} />خصم POS للعضو: {pkg.discount_percentage}%</li>}
                  {pkg.grace_period_days > 0 && <li><LineIcon name="clock" size={16} />فترة السماح: {pkg.grace_period_days} أيام</li>}
                </ul>
                {pkg.description && <p className="gco-desc">{pkg.description}</p>}
                <footer>
                  <span>مشتركون حاليًا: <b>{pkg.active_subscribers_count || 0}</b></span>
                  <div className="gco-row-actions">
                    <button type="button" className="gco-btn is-brand" onClick={() => setEditing(pkg)}><LineIcon name="edit" size={15} /> تعديل</button>
                    <button type="button" className="gco-btn is-danger" onClick={() => remove(pkg)} aria-label={`حذف ${pkg.name}`}><LineIcon name="trash" size={15} /> حذف</button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <MembershipPlanModal
        isOpen={open}
        onClose={() => setEditing(null)}
        onSubmit={save}
        initialData={editing?.id ? editing : null}
        availableProducts={products}
        availableBranches={branches}
      />
    </>
  );
}
