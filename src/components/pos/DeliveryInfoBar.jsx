/**
 * Who and where a delivery order goes. Shown under the order-mode toggle while
 * "delivery" is picked; the server requires a phone and an address.
 */
export default function DeliveryInfoBar({ value, onChange, deliveryFee = 0 }) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  return (
    <div className="pos-tables-add" role="group" aria-label="بيانات التوصيل" style={{ flexWrap: 'wrap' }}>
      <input
        className="pos-tables-add__input"
        value={value.name}
        maxLength={80}
        placeholder="اسم العميل"
        aria-label="اسم عميل التوصيل"
        onChange={set('name')}
      />
      <input
        className="pos-tables-add__input"
        value={value.phone}
        maxLength={20}
        inputMode="tel"
        placeholder="رقم الموبايل *"
        aria-label="موبايل عميل التوصيل"
        onChange={set('phone')}
      />
      <input
        className="pos-tables-add__input"
        style={{ flex: 2 }}
        value={value.address}
        maxLength={200}
        placeholder="العنوان بالتفصيل *"
        aria-label="عنوان التوصيل"
        onChange={set('address')}
      />
      {deliveryFee > 0 && <span>{`رسوم التوصيل ${deliveryFee.toFixed(2)} ج.م`}</span>}
    </div>
  );
}
