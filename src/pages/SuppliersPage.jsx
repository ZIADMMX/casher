import { useState, useEffect, useMemo, useCallback } from 'react';
import ImportExcelModal from '../components/ImportExcelModal.jsx';

function SuppliersPage() {
  const [activeTab, setActiveTab] = useState('suppliers'); // 'suppliers' | 'invoices' | 'payments'
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [kpis, setKpis] = useState({
    suppliersCount: 0,
    totalInvoices: 0,
    totalPurchased: 0,
    totalPaid: 0,
    totalRemaining: 0,
    unpaidCount: 0,
  });

  const [productsList, setProductsList] = useState([]);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // Reserved for upcoming payment modal – values are set but the modal is not yet implemented.
  // eslint-disable-next-line no-unused-vars
  const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [selectedPurchaseForPayment, setSelectedPurchaseForPayment] = useState(null);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);
  const [selectedInvoicePreview, setSelectedInvoicePreview] = useState(null);

  // Forms
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    phone: '',
    company: '',
    address: '',
    notes: '',
  });

  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    invoiceNumber: '',
    dueDate: '',
    notes: '',
    paidAmount: '',
    items: [
      {
        _id: crypto.randomUUID(),
        variant_id: '',
        product_name: '',
        size: '',
        color: '',
        quantity: 1,
        purchase_price: '',
        selling_price: '',
      },
    ],
  });

  const [paymentForm, setPaymentForm] = useState({
    supplierId: '',
    purchaseId: '',
    amount: '',
    paymentMethod: 'cash',
    notes: '',
  });

  // Load all initial data
  const loadData = useCallback(async () => {
    try {
      const [sups, purs, pays, summary, prods] = await Promise.all([
        window.electronAPI.getAllSuppliersWithStats(),
        window.electronAPI.getAllPurchases(),
        window.electronAPI.getAllSupplierPayments(100),
        window.electronAPI.getPurchasesSummaryKPIs(),
        window.electronAPI.getAllProductsWithVariants(),
      ]);
      setSuppliers(sups || []);
      setPurchases(purs || []);
      setPayments(pays || []);
      setKpis(summary || {});
      setProductsList(prods || []);
    } catch (err) {
      console.error('Failed to load suppliers data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.includes(q)) ||
        (s.company && s.company.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  // Filtered Invoices
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const filteredInvoices = useMemo(() => {
    return purchases.filter((p) => {
      const matchesStatus =
        invoiceStatusFilter === 'all' || p.payment_status === invoiceStatusFilter;
      const matchesSearch =
        !search.trim() ||
        (p.invoice_number && p.invoice_number.toLowerCase().includes(search.toLowerCase())) ||
        p.supplier_name.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [purchases, invoiceStatusFilter, search]);

  // Click to Copy Phone
  const handleCopyPhone = (phone, id) => {
    if (!phone) return;
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Open Supplier Modal (Add / Edit)
  const openAddSupplier = (sup = null) => {
    if (sup) {
      setEditingSupplier(sup);
      setSupplierForm({
        name: sup.name || '',
        phone: sup.phone || '',
        company: sup.company || '',
        address: sup.address || '',
        notes: sup.notes || '',
      });
    } else {
      setEditingSupplier(null);
      setSupplierForm({ name: '', phone: '', company: '', address: '', notes: '' });
    }
    setShowAddSupplierModal(true);
  };

  // Submit Supplier
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await window.electronAPI.updateSupplier(editingSupplier.id, supplierForm);
      } else {
        await window.electronAPI.addSupplier(supplierForm);
      }
      setShowAddSupplierModal(false);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete Supplier
  const handleDeleteSupplier = async (id, name) => {
    if (window.confirm(`هل أنت متأكد من حذف المورد (${name}) وجميع فواتيره ودفعاته المسجلة؟`)) {
      try {
        await window.electronAPI.deleteSupplier(id);
        await loadData();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  // Open Ledger Modal
  const openSupplierLedger = async (supplierId) => {
    try {
      const ledger = await window.electronAPI.getSupplierLedger(supplierId);
      setLedgerData(ledger);
      setShowLedgerModal(true);
    } catch (err) {
      alert(err.message);
    }
  };

  // Open Payment Modal
  const openPaymentModal = (supplier = null, purchase = null) => {
    setSelectedSupplierForPayment(supplier);
    setSelectedPurchaseForPayment(purchase);
    setPaymentForm({
      supplierId: supplier ? supplier.id : purchase ? purchase.supplier_id : '',
      purchaseId: purchase ? purchase.id : '',
      amount: purchase ? purchase.remaining_amount.toString() : '',
      paymentMethod: 'cash',
      notes: '',
    });
    setShowPaymentModal(true);
  };

  // Submit Payment
  const handleSavePayment = async (e) => {
    e.preventDefault();
    try {
      await window.electronAPI.recordSupplierPayment({
        supplierId: paymentForm.supplierId,
        purchaseId: paymentForm.purchaseId || null,
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.paymentMethod,
        notes: paymentForm.notes,
      });
      setShowPaymentModal(false);
      await loadData();
      alert('تم تسجيل دفعة السداد للمورد بنجاح ✓');
    } catch (err) {
      alert(err.message);
    }
  };

  // Open New Purchase Modal
  const openNewPurchase = () => {
    setPurchaseForm({
      supplierId: suppliers[0]?.id || '',
      invoiceNumber: '',
      dueDate: '',
      notes: '',
      paidAmount: '0',
      items: [
        {
          _id: crypto.randomUUID(),
          variant_id: '',
          product_name: '',
          size: '',
          color: '',
          quantity: 1,
          purchase_price: '',
          selling_price: '',
        },
      ],
    });
    setShowNewPurchaseModal(true);
  };

  // Add Item Line to Purchase
  const addPurchaseItemLine = () => {
    setPurchaseForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          _id: crypto.randomUUID(),
          variant_id: '',
          product_name: '',
          size: '',
          color: '',
          quantity: 1,
          purchase_price: '',
          selling_price: '',
        },
      ],
    }));
  };

  // Remove Item Line
  const removePurchaseItemLine = (idx) => {
    if (purchaseForm.items.length <= 1) return;
    setPurchaseForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  // Update Item Line
  const updatePurchaseItem = (idx, field, val) => {
    setPurchaseForm((prev) => {
      const newItems = [...prev.items];
      newItems[idx] = { ...newItems[idx], [field]: val };

      // إذا اختار منتج موجود من القائمة
      if (field === 'variant_id' && val) {
        // نحدد بيانات الـ variant
        for (const p of productsList) {
          const v = p.variants?.find((item) => item.id === Number(val));
          if (v) {
            newItems[idx].product_name = p.name;
            newItems[idx].size = v.size || '';
            newItems[idx].color = v.color || '';
            newItems[idx].purchase_price = v.purchase_price ? v.purchase_price.toString() : '';
            newItems[idx].selling_price = v.selling_price ? v.selling_price.toString() : '';
            break;
          }
        }
      }
      return { ...prev, items: newItems };
    });
  };

  // Calculate Total for Purchase Form
  const purchaseCalculatedTotal = useMemo(() => {
    return purchaseForm.items.reduce((sum, it) => {
      const q = Number(it.quantity || 0);
      const p = Number(it.purchase_price || 0);
      return sum + q * p;
    }, 0);
  }, [purchaseForm.items]);

  // Submit Purchase Invoice
  const handleSavePurchase = async (e) => {
    e.preventDefault();
    try {
      if (!purchaseForm.supplierId) {
        alert('يجب اختيار المورد أو المصنع');
        return;
      }
      if (purchaseForm.items.length === 0) {
        alert('يجب إضافة صنف واحد على الأقل');
        return;
      }

      await window.electronAPI.createPurchase({
        supplierId: purchaseForm.supplierId,
        invoiceNumber: purchaseForm.invoiceNumber,
        items: purchaseForm.items,
        totalAmount: purchaseCalculatedTotal,
        paidAmount: Number(purchaseForm.paidAmount || 0),
        dueDate: purchaseForm.dueDate || null,
        notes: purchaseForm.notes,
      });

      setShowNewPurchaseModal(false);
      await loadData();
      alert('تم تسجيل فاتورة الشراء وتحديث كميات المخزون آلياً بنجاح ✓');
    } catch (err) {
      alert(err.message);
    }
  };

  // Preview Invoice Details
  const handlePreviewInvoice = async (invoiceId) => {
    try {
      const inv = await window.electronAPI.getPurchaseById(invoiceId);
      setSelectedInvoicePreview(inv);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="suppliers-page-container">
      {/* Header Row */}
      <div className="page-header-row">
        <div>
          <h1>الموردين والمشتريات والآجل</h1>
          <p className="page-subtitle">
            إدارة فواتير التوريد من المصانع وتتبع المدفوعات والديون المتبقية وتحديث المخزون
          </p>
        </div>

        <div className="header-action-group" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            type="button" 
            className="secondary-btn" 
            onClick={() => setShowImportModal(true)} 
            title="استيراد موردين من ملف Excel"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>📊</span>
            <span>استيراد من Excel</span>
          </button>
          <button className="secondary-btn" onClick={() => openAddSupplier()}>
            <span>+</span> مورد / مصنع جديد
          </button>
          <button className="primary-btn" onClick={openNewPurchase}>
            <span>📦</span> تسجيل فاتورة توريد جديدة
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="onyx-stats-row">
        <div className="onyx-stat-card onyx-stat-blue onyx-hover-lift">
          <div className="onyx-stat-icon">🏭</div>
          <span className="onyx-stat-label">إجمالي الموردين والمصانع</span>
          <span className="onyx-stat-value">{kpis.suppliersCount} مورد</span>
        </div>

        <div className="onyx-stat-card onyx-stat-purple onyx-hover-lift">
          <div className="onyx-stat-icon">📦</div>
          <span className="onyx-stat-label">إجمالي فواتير الشراء</span>
          <span className="onyx-stat-value">{kpis.totalPurchased?.toLocaleString('ar-EG')} ج.م</span>
          <span className="onyx-stat-growth growth-neutral">{kpis.totalInvoices} فاتورة مسجلة</span>
        </div>

        <div className="onyx-stat-card onyx-stat-green onyx-hover-lift">
          <div className="onyx-stat-icon">💵</div>
          <span className="onyx-stat-label">إجمالي المبالغ المسددة</span>
          <span className="onyx-stat-value">{kpis.totalPaid?.toLocaleString('ar-EG')} ج.م</span>
        </div>

        <div className="onyx-stat-card onyx-stat-amber onyx-hover-lift">
          <div className="onyx-stat-icon">⚠️</div>
          <span className="onyx-stat-label">المستحقات والديون المتبقية للموردين</span>
          <span className="onyx-stat-value" style={{ color: '#DC2626' }}>
            {kpis.totalRemaining?.toLocaleString('ar-EG')} ج.م
          </span>
          {kpis.unpaidCount > 0 && (
            <span className="onyx-stat-growth growth-down">{kpis.unpaidCount} فاتورة غير مكتملة</span>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="suppliers-tabs-nav">
        <button
          className={`sup-tab-btn ${activeTab === 'suppliers' ? 'active' : ''}`}
          onClick={() => setActiveTab('suppliers')}
        >
          <span>🏭 دليل الموردين والمصانع</span>
          <span className="sup-tab-badge">{suppliers.length}</span>
        </button>

        <button
          className={`sup-tab-btn ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          <span>📦 فواتير الشراء والتوريد</span>
          <span className="sup-tab-badge">{purchases.length}</span>
        </button>

        <button
          className={`sup-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <span>💵 سجل دفعات السداد</span>
          <span className="sup-tab-badge">{payments.length}</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="suppliers-filter-bar">
        <div className="search-bar-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder={
              activeTab === 'suppliers'
                ? 'ابحث باسم المورد، اسم المصنع، أو رقم الهاتف...'
                : activeTab === 'invoices'
                ? 'ابحث برقم الفاتورة أو اسم المورد...'
                : 'ابحث في الدفعات...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search-btn" onClick={() => setSearch('')}>
              ✕
            </button>
          )}
        </div>

        {activeTab === 'invoices' && (
          <div className="period-toggle">
            <button
              className={invoiceStatusFilter === 'all' ? 'active' : ''}
              onClick={() => setInvoiceStatusFilter('all')}
            >
              الكل ({purchases.length})
            </button>
            <button
              className={invoiceStatusFilter === 'unpaid' ? 'active' : ''}
              onClick={() => setInvoiceStatusFilter('unpaid')}
            >
              آجلة / غير مسددة
            </button>
            <button
              className={invoiceStatusFilter === 'partial' ? 'active' : ''}
              onClick={() => setInvoiceStatusFilter('partial')}
            >
              مدفوعة جزئياً
            </button>
            <button
              className={invoiceStatusFilter === 'paid' ? 'active' : ''}
              onClick={() => setInvoiceStatusFilter('paid')}
            >
              مسددة بالكامل
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: Suppliers Directory */}
      {activeTab === 'suppliers' && (
        <div className="suppliers-grid">
          {filteredSuppliers.length === 0 ? (
            <div className="products-empty">
              <strong>لا يوجد موردين مسجلين</strong>
              <p>اضغط على زر &quot;مورد جديد&quot; بالأعلى لإضافة الموردين والمصانع ومتابعة حساباتهم</p>
            </div>
          ) : (
            filteredSuppliers.map((sup) => {
              const hasRemaining = sup.total_remaining > 0;
              return (
                <div key={sup.id} className="supplier-card onyx-hover-lift">
                  <div className="supplier-card-header">
                    <div className="supplier-avatar-badge">
                      {sup.company ? '🏭' : '👤'}
                    </div>
                    <div className="supplier-title-wrap">
                      <h3 className="supplier-name">{sup.name}</h3>
                      {sup.company && <span className="supplier-company">{sup.company}</span>}
                    </div>

                    <div className="supplier-card-actions">
                      <button
                        className="icon-btn"
                        onClick={() => openAddSupplier(sup)}
                        title="تعديل بيانات المورد"
                      >
                        ✏️
                      </button>
                      <button
                        className="icon-btn icon-btn-danger"
                        onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                        title="حذف المورد"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="supplier-contact-row">
                    {sup.phone ? (
                      <span
                        className={`phone-badge ${copiedId === sup.id ? 'copied' : ''}`}
                        onClick={() => handleCopyPhone(sup.phone, sup.id)}
                        title="انقر لنسخ رقم الهاتف"
                      >
                        <span>{sup.phone}</span>
                        <span className="phone-copy-icon">
                          {copiedId === sup.id ? '✓ تم النسخ' : '📋'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '11.5px' }}>بدون رقم هاتف</span>
                    )}

                    {sup.address && (
                      <span className="supplier-address-tag">📍 {sup.address}</span>
                    )}
                  </div>

                  {/* Balances Summary */}
                  <div className="supplier-balance-box">
                    <div className="balance-col">
                      <span className="bal-label">إجمالي المسحوبات</span>
                      <span className="bal-val">{sup.total_purchased.toLocaleString('ar-EG')} ج.م</span>
                    </div>
                    <div className="balance-col">
                      <span className="bal-label">إجمالي المسدد</span>
                      <span className="bal-val text-success">{sup.total_paid.toLocaleString('ar-EG')} ج.م</span>
                    </div>
                    <div className="balance-col bal-highlight">
                      <span className="bal-label">المستحق المتبقي</span>
                      <span className={`bal-val ${hasRemaining ? 'text-danger' : 'text-neutral'}`}>
                        {sup.total_remaining.toLocaleString('ar-EG')} ج.م
                      </span>
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="supplier-card-footer">
                    <button
                      className="sup-action-btn sup-ledger-btn"
                      onClick={() => openSupplierLedger(sup.id)}
                    >
                      📄 كشف حساب
                    </button>

                    <button
                      className="sup-action-btn sup-pay-btn"
                      onClick={() => openPaymentModal(sup)}
                    >
                      💵 سداد دفعة
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: Purchase Invoices */}
      {activeTab === 'invoices' && (
        <div className="customers-table-card">
          <table className="customers-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>المورد / المصنع</th>
                <th>إجمالي الفاتورة</th>
                <th>المدفوع</th>
                <th>المتبقي (الآجل)</th>
                <th>حالة السداد</th>
                <th>تاريخ الاستحقاق</th>
                <th>تاريخ الفاتورة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty-table-cell">
                    لا توجد فواتير شراء مسجلة
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const statusClass =
                    inv.payment_status === 'paid'
                      ? 'pay-cash'
                      : inv.payment_status === 'partial'
                      ? 'pay-card'
                      : 'pay-credit';
                  const statusText =
                    inv.payment_status === 'paid'
                      ? 'مسددة بالكامل'
                      : inv.payment_status === 'partial'
                      ? 'مدفوعة جزئياً'
                      : 'آجلة / غير مسددة';

                  return (
                    <tr key={inv.id}>
                      <td>
                        <span className="invoice-id-badge">
                          {inv.invoice_number ? `#${inv.invoice_number}` : `INV-${inv.id}`}
                        </span>
                      </td>
                      <td>
                        <div className="customer-name-cell">
                          <span className="customer-name-text">{inv.supplier_name}</span>
                          {inv.supplier_company && (
                            <span className="badge-neutral">{inv.supplier_company}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>{inv.total_amount.toLocaleString('ar-EG')} ج.م</strong>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {inv.items_count} أصناف ({inv.total_units || 0} قطعة)
                        </div>
                      </td>
                      <td style={{ color: '#16A34A', fontWeight: 600 }}>
                        {inv.paid_amount.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td style={{ color: inv.remaining_amount > 0 ? '#DC2626' : '#64748B', fontWeight: 700 }}>
                        {inv.remaining_amount.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td>
                        <span className={`pay-badge ${statusClass}`}>{statusText}</span>
                      </td>
                      <td>
                        {inv.due_date ? (
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#D97706' }}>
                            📅 {new Date(inv.due_date).toLocaleDateString('ar-EG')}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748B' }}>
                        {new Date(inv.created_at).toLocaleDateString('ar-EG')}
                      </td>
                      <td>
                        <div className="product-card-actions">
                          <button
                            className="small-btn-outline"
                            onClick={() => handlePreviewInvoice(inv.id)}
                            title="معاينة تفاصيل الفاتورة"
                          >
                            👁️ تفاصيل
                          </button>
                          {inv.remaining_amount > 0 && (
                            <button
                              className="apply-date-btn"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => openPaymentModal(null, inv)}
                              title="سداد دفعة لهذه الفاتورة"
                            >
                              سداد
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: Payments History */}
      {activeTab === 'payments' && (
        <div className="customers-table-card">
          <table className="customers-table">
            <thead>
              <tr>
                <th>رقم الحركة</th>
                <th>المورد / المصنع</th>
                <th>المبلغ المسدد</th>
                <th>رقم الفاتورة المرتبطة</th>
                <th>طريقة السداد</th>
                <th>ملاحظات / رقم الحوالة</th>
                <th>تاريخ السداد</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-table-cell">
                    لا توجد دفعات سداد مسجلة
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="invoice-id-badge">PAY-{p.id}</span>
                    </td>
                    <td>
                      <strong>{p.supplier_name}</strong>
                    </td>
                    <td style={{ color: '#16A34A', fontSize: '15px', fontWeight: 800 }}>
                      {p.amount.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td>
                      {p.invoice_number ? `#${p.invoice_number}` : <span className="text-muted">سداد عام لحساب المورد</span>}
                    </td>
                    <td>
                      <span className="badge-neutral">
                        {p.payment_method === 'cash'
                          ? '💵 نقدي (كاش)'
                          : p.payment_method === 'bank_transfer'
                          ? '🏦 تحويل بنكي / فودافون كاش'
                          : '📜 شيك'}
                      </span>
                    </td>
                    <td>{p.notes || <span className="text-muted">—</span>}</td>
                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                      {new Date(p.payment_date).toLocaleString('ar-EG')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================
          MODAL 1: Add / Edit Supplier Modal
          ========================================= */}
      {showAddSupplierModal && (
        <div className="modal-overlay" onClick={() => setShowAddSupplierModal(false)}>
          <div className="modal-card" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد / مصنع جديد'}</h3>
              <button className="modal-close" onClick={() => setShowAddSupplierModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="profile-edit-form">
              <div className="profile-field-group">
                <label className="profile-label">اسم المورد / المسؤول *</label>
                <div className="profile-input-wrap">
                  <input
                    type="text"
                    required
                    className="profile-input"
                    placeholder="مثال: الحاج أحمد عبد الله"
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="profile-password-grid">
                <div className="profile-field-group">
                  <label className="profile-label">اسم المصنع / الشركة</label>
                  <div className="profile-input-wrap">
                    <input
                      type="text"
                      className="profile-input"
                      placeholder="مثال: مصنع النصر للملابس"
                      value={supplierForm.company}
                      onChange={(e) => setSupplierForm({ ...supplierForm, company: e.target.value })}
                    />
                  </div>
                </div>

                <div className="profile-field-group">
                  <label className="profile-label">رقم الهاتف / الواتساب</label>
                  <div className="profile-input-wrap">
                    <input
                      type="text"
                      className="profile-input"
                      placeholder="01XXXXXXXXX"
                      value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="profile-field-group">
                <label className="profile-label">العنوان / المحافظة</label>
                <div className="profile-input-wrap">
                  <input
                    type="text"
                    className="profile-input"
                    placeholder="مثال: المحلة الكبرى - شارع الإنتاج"
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  />
                </div>
              </div>

              <div className="profile-field-group">
                <label className="profile-label">ملاحظات إضافية</label>
                <div className="profile-input-wrap">
                  <input
                    type="text"
                    className="profile-input"
                    placeholder="شروط التوريد، مواعيد السداد..."
                    value={supplierForm.notes}
                    onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={() => setShowAddSupplierModal(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="profile-save-btn">
                  {editingSupplier ? 'حفظ التعديلات' : 'إضافة المورد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL 2: New Purchase Invoice Modal (With Auto Stock)
          ========================================= */}
      {showNewPurchaseModal && (
        <div className="modal-overlay" onClick={() => setShowNewPurchaseModal(false)}>
          <div className="product-modal-dialog" style={{ width: '840px' }} onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-header">
              <h3>📦 تسجيل فاتورة شراء / توريد بضاعة جديدة</h3>
              <button className="modal-close" onClick={() => setShowNewPurchaseModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSavePurchase}>
              {/* Header Info Grid */}
              <div className="add-variant-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div className="profile-field-group">
                  <label className="profile-label">المورد / المصنع *</label>
                  <select
                    required
                    className="custom-date-input"
                    style={{ width: '100%', height: '38px', background: '#fff' }}
                    value={purchaseForm.supplierId}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}
                  >
                    <option value="">-- اختر المورد --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.company ? `(${s.company})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="profile-field-group">
                  <label className="profile-label">رقم فاتورة المورد (اختياري)</label>
                  <input
                    type="text"
                    className="custom-date-input"
                    style={{ height: '38px' }}
                    placeholder="مثال: 1042"
                    value={purchaseForm.invoiceNumber}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })}
                  />
                </div>

                <div className="profile-field-group">
                  <label className="profile-label">تاريخ استحقاق الآجل</label>
                  <input
                    type="date"
                    className="custom-date-input"
                    style={{ height: '38px' }}
                    value={purchaseForm.dueDate}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, dueDate: e.target.value })}
                  />
                </div>

                <div className="profile-field-group">
                  <label className="profile-label">المبلغ المدفوع كاش (مقدماً)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="custom-date-input"
                    style={{ height: '38px', fontWeight: 700, color: '#16A34A' }}
                    placeholder="0.00"
                    value={purchaseForm.paidAmount}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, paidAmount: e.target.value })}
                  />
                </div>
              </div>

              {/* Items Section */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: '#0F172A' }}>
                    الأصناف والكميات المستلمة (تضاف تلقائياً لرصيد المخزن):
                  </h4>
                  <button
                    type="button"
                    className="apply-date-btn"
                    onClick={addPurchaseItemLine}
                  >
                    + إضافة صنف آخر
                  </button>
                </div>

                <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                  <table className="variants-details-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '28%' }}>ربط بمنتج موجود أو اسم الصنف *</th>
                        <th style={{ width: '12%' }}>المقاس</th>
                        <th style={{ width: '12%' }}>اللون</th>
                        <th style={{ width: '12%' }}>الكمية *</th>
                        <th style={{ width: '15%' }}>سعر الشراء (التكلفة) *</th>
                        <th style={{ width: '15%' }}>سعر البيع المقترح</th>
                        <th style={{ width: '6%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseForm.items.map((item, idx) => (
                        <tr key={item._id || idx}>
                          <td>
                            <input
                              type="text"
                              required
                              placeholder="اسم المنتج..."
                              style={{ width: '100%', padding: '5px', border: '1px solid #CBD5E1', borderRadius: '5px' }}
                              value={item.product_name}
                              onChange={(e) => updatePurchaseItem(idx, 'product_name', e.target.value)}
                            />
                            {/* Option to select from existing variants */}
                            <select
                              style={{ width: '100%', marginTop: '3px', fontSize: '11px', color: '#64748B' }}
                              value={item.variant_id}
                              onChange={(e) => updatePurchaseItem(idx, 'variant_id', e.target.value)}
                            >
                              <option value="">-- أو اختر من منتجات المحل --</option>
                              {productsList.map((p) =>
                                p.variants?.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {p.name} - مقاس: {v.size || '—'} {v.color || ''} (مخزون: {v.stock_quantity})
                                  </option>
                                ))
                              )}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              placeholder="L, XL..."
                              style={{ width: '100%', padding: '5px', border: '1px solid #CBD5E1', borderRadius: '5px' }}
                              value={item.size}
                              onChange={(e) => updatePurchaseItem(idx, 'size', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              placeholder="أزرق، أسود..."
                              style={{ width: '100%', padding: '5px', border: '1px solid #CBD5E1', borderRadius: '5px' }}
                              value={item.color}
                              onChange={(e) => updatePurchaseItem(idx, 'color', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              required
                              style={{ width: '100%', padding: '5px', border: '1px solid #CBD5E1', borderRadius: '5px', fontWeight: 700 }}
                              value={item.quantity}
                              onChange={(e) => updatePurchaseItem(idx, 'quantity', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              required
                              placeholder="0.00"
                              style={{ width: '100%', padding: '5px', border: '1px solid #CBD5E1', borderRadius: '5px', fontWeight: 700 }}
                              value={item.purchase_price}
                              onChange={(e) => updatePurchaseItem(idx, 'purchase_price', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0.00"
                              style={{ width: '100%', padding: '5px', border: '1px solid #CBD5E1', borderRadius: '5px' }}
                              value={item.selling_price}
                              onChange={(e) => updatePurchaseItem(idx, 'selling_price', e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="pos-item-remove-btn"
                              disabled={purchaseForm.items.length <= 1}
                              onClick={() => removePurchaseItemLine(idx)}
                              title="حذف هذا السطر"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary Bar */}
              <div className="product-modal-quick-stats" style={{ marginTop: '16px' }}>
                <div className="quick-stat-box">
                  <span>إجمالي قيمة الفاتورة:</span>
                  <span style={{ color: '#2E5BFF', fontSize: '18px' }}>
                    {purchaseCalculatedTotal.toFixed(2)} ج.م
                  </span>
                </div>
                <div className="quick-stat-box">
                  <span>المدفوع مقدماً:</span>
                  <span style={{ color: '#16A34A', fontSize: '18px' }}>
                    {Number(purchaseForm.paidAmount || 0).toFixed(2)} ج.م
                  </span>
                </div>
                <div className="quick-stat-box">
                  <span>المتبقي ديون عليك للمورد (آجل):</span>
                  <span style={{ color: '#DC2626', fontSize: '18px' }}>
                    {Math.max(purchaseCalculatedTotal - Number(purchaseForm.paidAmount || 0), 0).toFixed(2)} ج.م
                  </span>
                </div>
              </div>

              <div className="profile-modal-actions" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={() => setShowNewPurchaseModal(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="profile-save-btn">
                  حفظ الفاتورة وتحديث المخزون 📦
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL 3: Record Supplier Payment Modal
          ========================================= */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal-card" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💵 سداد دفعة للمورد</h3>
              <button className="modal-close" onClick={() => setShowPaymentModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="profile-edit-form">
              <div className="profile-field-group">
                <label className="profile-label">المورد / المصنع *</label>
                <select
                  required
                  className="custom-date-input"
                  style={{ width: '100%', height: '38px', background: '#fff' }}
                  value={paymentForm.supplierId}
                  onChange={(e) => setPaymentForm({ ...paymentForm, supplierId: e.target.value })}
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (المتبقي: {s.total_remaining.toFixed(2)} ج.م)
                    </option>
                  ))}
                </select>
              </div>

              <div className="profile-field-group">
                <label className="profile-label">المبلغ المسدد (ج.م) *</label>
                <div className="profile-input-wrap">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    className="profile-input"
                    style={{ fontSize: '18px', fontWeight: 800, color: '#16A34A' }}
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="profile-field-group">
                <label className="profile-label">طريقة السداد</label>
                <select
                  className="custom-date-input"
                  style={{ width: '100%', height: '38px', background: '#fff' }}
                  value={paymentForm.paymentMethod}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                >
                  <option value="cash">💵 نقدي (كاش من الدرج)</option>
                  <option value="bank_transfer">🏦 تحويل بنكي / فودافون كاش / إنستاباي</option>
                  <option value="cheque">📜 شيك بنكي</option>
                </select>
              </div>

              <div className="profile-field-group">
                <label className="profile-label">ملاحظات أو رقم إيصال التحويل</label>
                <div className="profile-input-wrap">
                  <input
                    type="text"
                    className="profile-input"
                    placeholder="رقم الحوالة، المستلم..."
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={() => setShowPaymentModal(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="profile-save-btn">
                  تأكيد تسجيل السداد ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL 4: Supplier Ledger Statement
          ========================================= */}
      {showLedgerModal && ledgerData && (
        <div className="modal-overlay" onClick={() => setShowLedgerModal(false)}>
          <div className="product-modal-dialog" style={{ width: '780px' }} onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-header">
              <div>
                <h3>📄 كشف حساب المورد: {ledgerData.supplier.name}</h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {ledgerData.supplier.company ? `مصنع/شركة: ${ledgerData.supplier.company} · ` : ''}
                  هاتف: {ledgerData.supplier.phone || 'بدون'}
                </span>
              </div>
              <button className="modal-close" onClick={() => setShowLedgerModal(false)}>
                ×
              </button>
            </div>

            {/* Quick Balances */}
            <div className="product-modal-quick-stats">
              <div className="quick-stat-box">
                <span>إجمالي الفواتير المشتراة:</span>
                <span style={{ color: '#0F172A' }}>{ledgerData.stats.totalPurchased.toFixed(2)} ج.م</span>
              </div>
              <div className="quick-stat-box">
                <span>إجمالي ما تم سداده:</span>
                <span style={{ color: '#16A34A' }}>{ledgerData.stats.totalPaid.toFixed(2)} ج.م</span>
              </div>
              <div className="quick-stat-box">
                <span>الرصيد المتبقي المستحق:</span>
                <span style={{ color: '#DC2626', fontSize: '18px' }}>
                  {ledgerData.stats.totalRemaining.toFixed(2)} ج.م
                </span>
              </div>
            </div>

            <h4 style={{ margin: '14px 0 6px', fontSize: '14px' }}>سجل فواتير التوريد:</h4>
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <table className="variants-details-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>رقم الفاتورة</th>
                    <th>التاريخ</th>
                    <th>الإجمالي</th>
                    <th>المدفوع</th>
                    <th>المتبقي</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.purchases.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-muted" style={{ textAlign: 'center' }}>لا توجد فواتير</td>
                    </tr>
                  ) : (
                    ledgerData.purchases.map((p) => (
                      <tr key={p.id}>
                        <td>{p.invoice_number ? `#${p.invoice_number}` : `INV-${p.id}`}</td>
                        <td>{new Date(p.created_at).toLocaleDateString('ar-EG')}</td>
                        <td>{p.total_amount.toFixed(2)} ج.م</td>
                        <td style={{ color: '#16A34A' }}>{p.paid_amount.toFixed(2)} ج.م</td>
                        <td style={{ color: p.remaining_amount > 0 ? '#DC2626' : '#64748B' }}>
                          {p.remaining_amount.toFixed(2)} ج.م
                        </td>
                        <td>
                          <span className={`pay-badge ${p.payment_status === 'paid' ? 'pay-cash' : 'pay-credit'}`}>
                            {p.payment_status === 'paid' ? 'مسددة' : 'آجلة'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h4 style={{ margin: '14px 0 6px', fontSize: '14px' }}>سجل الدفعات المسددة للمورد:</h4>
            <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <table className="variants-details-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>رقم الدفعة</th>
                    <th>التاريخ</th>
                    <th>المبلغ</th>
                    <th>طريقة الدفع</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.payments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-muted" style={{ textAlign: 'center' }}>لا توجد دفعات</td>
                    </tr>
                  ) : (
                    ledgerData.payments.map((py) => (
                      <tr key={py.id}>
                        <td>PAY-{py.id}</td>
                        <td>{new Date(py.payment_date).toLocaleDateString('ar-EG')}</td>
                        <td style={{ color: '#16A34A', fontWeight: 700 }}>{py.amount.toFixed(2)} ج.م</td>
                        <td>{py.payment_method === 'cash' ? 'نقدي' : 'تحويل'}</td>
                        <td>{py.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="profile-modal-actions">
              <button className="profile-cancel-btn" onClick={() => setShowLedgerModal(false)}>
                إغلاق
              </button>
              <button
                className="profile-save-btn"
                onClick={() => {
                  setShowLedgerModal(false);
                  openPaymentModal(ledgerData.supplier);
                }}
              >
                💵 سداد دفعة لهذا المورد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL 5: Invoice Preview Modal
          ========================================= */}
      {selectedInvoicePreview && (
        <div className="modal-overlay" onClick={() => setSelectedInvoicePreview(null)}>
          <div className="modal-card" style={{ width: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                تفاصيل فاتورة شراء {selectedInvoicePreview.invoice_number ? `#${selectedInvoicePreview.invoice_number}` : `INV-${selectedInvoicePreview.id}`}
              </h3>
              <button className="modal-close" onClick={() => setSelectedInvoicePreview(null)}>
                ×
              </button>
            </div>

            <div className="modal-meta">
              <span><strong>المورد:</strong> {selectedInvoicePreview.supplier_name}</span>
              <span><strong>التاريخ:</strong> {new Date(selectedInvoicePreview.created_at).toLocaleDateString('ar-EG')}</span>
            </div>

            <table className="modal-items-table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>المقاس/اللون</th>
                  <th>الكمية</th>
                  <th>سعر الشراء</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoicePreview.items?.map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.product_name}</td>
                    <td>{it.size || ''} {it.color ? `· ${it.color}` : ''}</td>
                    <td>{it.quantity}</td>
                    <td>{it.purchase_price.toFixed(2)} ج.م</td>
                    <td><strong>{(it.quantity * it.purchase_price).toFixed(2)} ج.م</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="modal-total-row">
              <span>إجمالي الفاتورة:</span>
              <span>{selectedInvoicePreview.total_amount.toFixed(2)} ج.م</span>
            </div>
            <div className="modal-meta" style={{ marginTop: '6px' }}>
              <span style={{ color: '#16A34A' }}><strong>المدفوع:</strong> {selectedInvoicePreview.paid_amount.toFixed(2)} ج.م</span>
              <span style={{ color: '#DC2626' }}><strong>المتبقي (الآجل):</strong> {selectedInvoicePreview.remaining_amount.toFixed(2)} ج.م</span>
            </div>

            <div className="profile-modal-actions">
              <button className="profile-cancel-btn" onClick={() => setSelectedInvoicePreview(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Modal */}
      <ImportExcelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        type="suppliers"
        onSuccess={() => loadData()}
      />
    </div>
  );
}

export default SuppliersPage;

