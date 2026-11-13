import { memo } from 'react';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import LegalIcon from './LegalIcon.jsx';

const n = (value) => Number(value || 0).toLocaleString('ar-EG');
const amount = (value) => n(Math.round(Number(value) || 0));
const DASH = '—';

export function longDay(value) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? DASH
    : date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
}

const dayMonth = (value) => new Date(`${String(value).slice(0, 10)}T12:00:00`)
  .toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });

// How a case movement reads in the report: label, pill tone, +1 money in / -1 money out, who paid.
export function movementKind(movement) {
  if (movement.type === 'fee_payment') return { label: 'أتعاب', tone: 'success', sign: 1, source: 'سداد من الموكل' };
  if (movement.type === 'retainer_deposit') return { label: 'أمانة', tone: 'accent', sign: 1, source: 'إيداع من الموكل' };
  if (movement.paid_by_client) return { label: 'مصروف من الأمانة', tone: 'primary', sign: -1, source: 'من أمانة الموكل' };
  if (movement.type === 'other_expense') return { label: 'مصروف مكتب', tone: 'primary', sign: -1, source: 'من حساب المكتب' };
  return { label: 'مصروف قضائي', tone: 'primary', sign: -1, source: 'من حساب المكتب' };
}

function followUps(office) {
  const notes = [];
  if (office.poa_expiring) notes.push(`${n(office.poa_expiring)} توكيلات تنتهي خلال ٣٠ يومًا — يلزم تجديدها قبل الجلسات القادمة.`);
  if (office.appeal_deadlines) notes.push(`${n(office.appeal_deadlines)} مواعيد طعن أو مدد قانونية خلال ٣٠ يومًا.`);
  if (office.overdue_fees > 0) notes.push(`أتعاب متأخرة بقيمة ${amount(office.overdue_fees)} ج.م على ${n(office.overdue_clients)} موكلين.`);
  if (office.missing_national_id) notes.push(`${n(office.missing_national_id)} ملف موكل بدون رقم قومي، مما يعطل تجهيز صحف الدعاوى.`);
  return notes.length ? notes : ['لا توجد ملاحظات أو متابعات مفتوحة لهذه الفترة.'];
}

/** A4 "activity & finance" report: shown in the print preview window and printed from the page. */
function LegalReportDocument({ report }) {
  const { settings } = useSettings();
  const current = { ...report.periodStats, ...report.financialStats };
  const previous = { ...report.previous?.periodStats, ...report.previous?.financialStats };
  const office = report.office || {};
  const courtName = report.filters?.courtName;
  const clientName = report.filterOptions?.clients?.find((client) => client.id === report.filters?.clientId)?.name;
  const scope = `${courtName || 'كل المحاكم'} و${clientName ? `الموكل ${clientName}` : 'كل الموكلين'}`;
  const contact = [settings?.store_address, settings?.store_phone, settings?.store_email].filter(Boolean).join(' · ');
  const movements = report.financialMovements || [];
  const totalIn = movements.reduce((sum, item) => sum + (movementKind(item).sign > 0 ? Number(item.amount) || 0 : 0), 0);
  const totalOut = movements.reduce((sum, item) => sum + (movementKind(item).sign < 0 ? Number(item.amount) || 0 : 0), 0);

  const summary = [
    ['قضايا جديدة', 'new_cases'],
    ['جلسات المحاكم', 'total_sessions'],
    ['أحكام صدرت', 'judged_sessions'],
    ['أتعاب محصلة', 'fees_collected', true],
    ['أمانات موكلين (إيداعات)', 'client_deposits', true],
    ['مصروفات قضائية', 'court_expenses', true],
    ['مصروفات المكتب', 'expenses_paid_by_office', true],
  ];
  const fmt = (value, money) => (money ? amount(value) : n(value));

  return (
    <article className="lr-doc" dir="rtl">
      <header className="lr-doc-head">
        <div className="lr-doc-brand">
          {settings?.store_logo
            ? <img src={settings.store_logo} alt="" className="lr-doc-logo" />
            : <span className="lr-doc-logo"><LegalIcon name="scale" size={26} /></span>}
          <div>
            <strong>{settings?.store_name || 'مكتب المحاماة'}</strong>
            {contact && <small>{contact}</small>}
          </div>
        </div>
        <div className="lr-doc-issued">
          <small>تاريخ الإصدار</small>
          <strong>{new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
        </div>
      </header>

      <h1>تقرير النشاط القضائي والمالي</h1>
      <p className="lr-doc-lead">عن الفترة من {longDay(report.startDate)} إلى {longDay(report.endDate)} — {scope}.</p>
      <p className="lr-doc-note">أُنشئ هذا التقرير آليًا من نظام إدارة المكتب. الأرقام بالجنيه المصري.</p>

      <section>
        <h2>١. ملخص الفترة</h2>
        <p className="lr-doc-note">مؤشرات النشاط القضائي والحركة المالية مقارنة بالفترة السابقة ({longDay(report.previous?.startDate)} — {longDay(report.previous?.endDate)}).</p>
        <table>
          <thead><tr><th>البيان</th><th>الفترة الحالية</th><th>الفترة السابقة</th></tr></thead>
          <tbody>
            {summary.map(([label, key, money]) => (
              <tr key={key}><td>{label}</td><td><b>{fmt(current[key], money)}</b></td><td>{fmt(previous[key], money)}</td></tr>
            ))}
            <tr className="is-total"><td>صافي دخل المكتب</td><td>{amount(current.office_net)}</td><td>{amount(previous.office_net)}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>٢. الجلسات حسب المحكمة</h2>
        {report.courtBreakdown?.length ? (
          <table>
            <thead><tr><th>المحكمة</th><th>منعقدة</th><th>مؤجلة</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {report.courtBreakdown.map((court) => (
                <tr key={court.court_name}>
                  <td>{court.court_name}</td><td>{n(court.held_count)}</td><td>{n(court.postponed_count)}</td><td><b>{n(court.sessions_count)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="lr-doc-note">لا توجد جلسات في الفترة.</p>}
      </section>

      <section>
        <h2>٣. الحركات المالية للقضايا</h2>
        <p className="lr-doc-note">مرتبة من الأحدث للأقدم. الأمانات أموال مملوكة للموكل ولا تدخل ضمن إيراد المكتب.</p>
        {movements.length ? (
          <table>
            <thead><tr><th>التاريخ</th><th>البيان</th><th>القضية / الموكل</th><th>وارد</th><th>منصرف</th></tr></thead>
            <tbody>
              {movements.map((item) => {
                const kind = movementKind(item);
                return (
                  <tr key={item.id}>
                    <td>{dayMonth(item.date)}</td>
                    <td>{item.description || kind.label}</td>
                    <td className="is-muted">{[item.client_name, item.case_number].filter(Boolean).join(' · ') || DASH}</td>
                    <td>{kind.sign > 0 ? amount(item.amount) : DASH}</td>
                    <td>{kind.sign < 0 ? amount(item.amount) : DASH}</td>
                  </tr>
                );
              })}
              <tr className="is-total"><td colSpan={3}>الإجمالي</td><td>{amount(totalIn)}</td><td>{amount(totalOut)}</td></tr>
            </tbody>
          </table>
        ) : <p className="lr-doc-note">لا توجد حركات مالية في الفترة.</p>}
      </section>

      <section>
        <h2>٤. ملاحظات ومتابعات</h2>
        <ul>{followUps(office).map((note) => <li key={note}>{note}</li>)}</ul>
      </section>

      <footer className="lr-doc-foot">
        <div className="lr-doc-signs">
          <div><span>أعدّ التقرير</span><i /></div>
          <div><span>اعتماد المحامي المسؤول</span><i /></div>
        </div>
        <p>هذا التقرير للاستخدام الداخلي للمكتب ولا يُعد مستندًا رسميًا أمام جهات التقاضي.</p>
      </footer>
    </article>
  );
}

// Re-renders only when the report changes, not on every tab / page click of the screen around it.
export default memo(LegalReportDocument);
