import { TagIcon } from './icons/PosIcons.jsx';

function CouponInput({ value, onChange, onApply, message }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onApply();
    }
  };

  return (
    <div className="pos-coupon-box">
      <div className="pos-coupon-input-group">
        <span className="pos-coupon-icon"><TagIcon size={16} /></span>
        <input
          type="text"
          className="pos-coupon-input"
          placeholder="قيمة الخصم (مثال: 50)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="pos-coupon-btn" onClick={onApply} type="button">
          تطبيق
        </button>
      </div>
      {message && (
        <p className={`pos-coupon-message ${message.includes('تم') ? 'success' : 'info'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

export default CouponInput;

