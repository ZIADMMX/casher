function HeldOrdersModal({
  isOpen,
  onClose,
  heldOrders = [],
  onResumeOrder,
  onDeleteOrder,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="held-orders-modal" onClick={(e) => e.stopPropagation()}>
        <div className="held-modal-header">
          <div className="held-title-row">
            <span className="held-icon">⏸️</span>
            <h3>الفواتير المعلقة ({heldOrders.length})</h3>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="held-modal-body">
          {heldOrders.length === 0 ? (
            <div className="held-empty-state">
              <span className="held-empty-icon">📭</span>
              <p>لا توجد أي فواتير معلقة حالياً</p>
            </div>
          ) : (
            <div className="held-orders-list">
              {heldOrders.map((order) => {
                const orderTotal = order.cart.reduce(
                  (sum, item) => sum + item.unitPrice * item.quantity,
                  0
                );
                const itemsCount = order.cart.reduce(
                  (sum, item) => sum + item.quantity,
                  0
                );

                return (
                  <div key={order.id} className="held-order-card">
                    <div className="held-card-info">
                      <div className="held-card-top">
                        <span className="held-time">🕒 {order.createdAt}</span>
                        <span className="held-items-count">({itemsCount} قطع)</span>
                      </div>
                      <div className="held-card-summary">
                        <span className="held-total">
                          {(orderTotal - (order.discount || 0)).toFixed(2)} ج.م
                        </span>
                        {order.creditCustomerName && (
                          <span className="held-cust-name">
                            👤 {order.creditCustomerName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="held-card-actions">
                      <button
                        type="button"
                        className="held-resume-btn"
                        onClick={() => onResumeOrder(order)}
                      >
                        استرجاع الفاتورة ↵
                      </button>
                      <button
                        type="button"
                        className="held-delete-btn"
                        onClick={() => onDeleteOrder(order.id)}
                        title="حذف"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HeldOrdersModal;
