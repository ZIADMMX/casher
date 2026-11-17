import { useState, useEffect, useMemo, useCallback } from 'react';
import ImportExcelModal from '../components/ImportExcelModal.jsx';
import * as productsApi from '../api/products.js';
import * as purchasesApi from '../api/purchases.js';
import * as inventoryApi from '../api/inventory.js';
import LineIcon from '../components/icons/LineIcons.jsx';
import '../styles/suppliers.css';

const PAGE_SIZE = 8;
const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

function SuppliersPage({ onNavigate }) {
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
  const [page, setPage] = useState(1);
  const [supplierFilter, setSupplierFilter] = useState('all'); // 'all' | 'due'
  const [lowStock, setLowStock] = useState(null); // null = not available (no inventory permission)

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
        purchasesApi.getAllSuppliersWithStats(),
        purchasesApi.getAllPurchases(),
        purchasesApi.getAllSupplierPayments(100),
        purchasesApi.getPurchasesSummaryKPIs(),
        productsApi.getAllProductsWithVariants(),
      ]);
      setSuppliers(sups || []);
      setPurchases(purs || []);
      setPayments(pays || []);
      setKpis(summary || {});
      setProductsList(prods || []);
    } catch (err) {
      console.error('Failed to load suppliers data:', err);
    }
    // The stock aside is optional: a user without the stock permission simply does not see it.
    try {
      const rows = await inventoryApi.getInventoryStock({ lowStockOnly: true });
      setLowStock(Array.isArray(rows) ? rows : []);
    } catch {
      setLowStock(null);
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

  const visibleSuppliers = useMemo(
    () => (supplierFilter === 'due' ? filteredSuppliers.filter((x) => x.total_remaining > 0) : filteredSuppliers),
    [filteredSuppliers, supplierFilter]
  );
  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => (p.supplier_name || '').toLowerCase().includes(q) || String(p.invoice_number || '').toLowerCase().includes(q));
  }, [payments, search]);
  const activeList = activeTab === 'suppliers' ? visibleSuppliers : activeTab === 'invoices' ? filteredInvoices : filteredPayments;
  const pageCount = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const pageItems = (list) => list.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const paidShare = kpis.totalPurchased > 0 ? Math.round((kpis.totalPaid / kpis.totalPurchased) * 100) : 0;

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
        await purchasesApi.updateSupplier(editingSupplier.id, supplierForm);
      } else {
        await purchasesApi.addSupplier(supplierForm);
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
        await purchasesApi.deleteSupplier(id);
        await loadData();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  // Open Ledger Modal
  const openSupplierLedger = async (supplierId) => {
    try {
      const ledger = await purchasesApi.getSupplierLedger(supplierId);
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
      await purchasesApi.recordSupplierPayment({
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

  const purchaseUnits = useMemo(
    () => purchaseForm.items.reduce((sum, it) => sum + Number(it.quantity || 0), 0),
    [purchaseForm.items]
  );

  // "Create a supply order" from the low-stock list: one line per short item, suggested quantity = up to twice its reorder level.
  const openRestockPurchase = () => {
    const seen = new Set();
    const items = [];
    for (const row of lowStock || []) {
      if (seen.has(row.variant_id)) continue;
      seen.add(row.variant_id);
      let variant = null;
      for (const prod of productsList) {
        variant = prod.variants?.find((v) => v.id === row.variant_id) || null;
        if (variant) break;
      }
      items.push({
        _id: crypto.randomUUID(),
        variant_id: String(row.variant_id),
        product_name: row.product_name,
        size: row.size || '',
        color: row.color || '',
        quantity: Math.max(Math.ceil(row.reorder_level * 2 - row.quantity), 1),
        purchase_price: variant?.purchase_price ? String(variant.purchase_price) : '',
        selling_price: variant?.selling_price ? String(variant.selling_price) : '',
      });
    }
    setPurchaseForm({ supplierId: suppliers[0]?.id || '', invoiceNumber: '', dueDate: '', notes: '', paidAmount: '0', items });
    setShowNewPurchaseModal(true);
  };

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

      await purchasesApi.createPurchase({
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
      const inv = await purchasesApi.getPurchaseById(invoiceId);
      setSelectedInvoicePreview(inv);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="sp" dir="rtl">
      {/* Header */}
      <header className="sp-head">
        <div>
          <h1>الموردين والمشتريات</h1>
          <p>فواتير التوريد من المصانع والتجار، متابعة المدفوعات والديون، وتحديث المخزون تلقائيًا عند الاستلام.</p>
        </div>
        <div className="sp-head__actions">
          <button type="button" className="sp-btn is-primary" onClick={openNewPurchase}>
            <LineIcon name="plus" size={18} strokeWidth={2.2} /> تسجيل فاتورة توريد
          </button>
          <button type="button" className="sp-btn" onClick={() => openAddSupplier()}>
            <LineIcon name="userPlus" size={18} /> مورد جديد
          </button>
          <button type="button" className="sp-btn" onClick={() => setShowImportModal(true)} title="استيراد موردين من ملف Excel">
            <LineIcon name="upload" size={18} /> استيراد من Excel
          </button>
        </div>
      </header>

      {/* KPIs */}
      <section className="sp-kpis" aria-label="مؤشرات الموردين">
        <article className="sp-card sp-kpi">
          <span className="sp-kpi__label">إجمالي الموردين</span>
          <span className="sp-kpi__tile is-brand"><LineIcon name="store" size={24} /></span>
          <strong>{money(kpis.suppliersCount)} <small>مورد</small></strong>
          <em>{suppliers.filter((s) => s.company).length} منهم مصانع وشركات</em>
        </article>
        <article className="sp-card sp-kpi">
          <span className="sp-kpi__label">إجمالي فواتير الشراء</span>
          <span className="sp-kpi__tile is-violet"><LineIcon name="file" size={24} /></span>
          <strong>{money(kpis.totalPurchased)} <small>ج.م</small></strong>
          <em>{money(kpis.totalInvoices)} فاتورة مسجلة</em>
        </article>
        <article className="sp-card sp-kpi">
          <span className="sp-kpi__label">إجمالي المبالغ المسدَّدة</span>
          <span className="sp-kpi__tile is-green"><LineIcon name="banknote" size={24} /></span>
          <strong>{money(kpis.totalPaid)} <small>ج.م</small></strong>
          <em className="is-ok">{paidShare}% من إجمالي الفواتير</em>
        </article>
        <article className={`sp-card sp-kpi${kpis.totalRemaining > 0 ? ' is-due' : ''}`}>
          <span className="sp-kpi__label">المستحق للموردين</span>
          <span className="sp-kpi__tile is-red"><LineIcon name="alert" size={24} /></span>
          <strong className={kpis.totalRemaining > 0 ? 'is-bad' : ''}>{money(kpis.totalRemaining)} <small>ج.م</small></strong>
          <em className={kpis.unpaidCount > 0 ? 'is-bad' : ''}>{kpis.unpaidCount > 0 ? `${kpis.unpaidCount} فاتورة غير مكتملة` : 'لا توجد مستحقات'}</em>
        </article>
      </section>

      {/* Tabs */}
      <nav className="sp-tabs" role="tablist" aria-label="أقسام الموردين">
        {[
          ['suppliers', 'دليل الموردين', suppliers.length],
          ['invoices', 'فواتير الشراء والتوريد', purchases.length],
          ['payments', 'سجل دفعات السداد', payments.length],
        ].map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={activeTab === key} className={activeTab === key ? 'is-on' : ''} onClick={() => { setActiveTab(key); setPage(1); }}>
            {label} <small>{count}</small>
          </button>
        ))}
      </nav>

      <div className="sp-layout">
        <section className="sp-card sp-panel" aria-label={activeTab === 'suppliers' ? 'دليل الموردين' : activeTab === 'invoices' ? 'فواتير الشراء' : 'دفعات السداد'}>
          {/* toolbar */}
          <div className="sp-tools">
            <label className="sp-search">
              <LineIcon name="search" size={18} />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                aria-label="بحث"
                placeholder={activeTab === 'suppliers' ? 'ابحث باسم المورد أو المصنع أو رقم الهاتف' : activeTab === 'invoices' ? 'ابحث برقم الفاتورة أو اسم المورد' : 'ابحث باسم المورد أو رقم الفاتورة'}
              />
            </label>
            {activeTab === 'suppliers' && (
              <div className="sp-chips" role="group" aria-label="تصفية الموردين">
                <button type="button" className={supplierFilter === 'all' ? 'is-on' : ''} aria-pressed={supplierFilter === 'all'} onClick={() => { setSupplierFilter('all'); setPage(1); }}>الكل <small>{suppliers.length}</small></button>
                <button type="button" className={supplierFilter === 'due' ? 'is-on' : ''} aria-pressed={supplierFilter === 'due'} onClick={() => { setSupplierFilter('due'); setPage(1); }}><i className="sp-dot" aria-hidden="true" />عليهم مستحقات <small>{suppliers.filter((s) => s.total_remaining > 0).length}</small></button>
              </div>
            )}
            {activeTab === 'invoices' && (
              <div className="sp-chips" role="group" aria-label="حالة الفاتورة">
                {[['all', 'الكل', purchases.length], ['unpaid', 'آجلة / غير مسددة', purchases.filter((p) => p.payment_status === 'unpaid').length], ['partial', 'مدفوعة جزئيًا', purchases.filter((p) => p.payment_status === 'partial').length], ['paid', 'مسددة بالكامل', purchases.filter((p) => p.payment_status === 'paid').length]].map(([key, label, count]) => (
                  <button key={key} type="button" className={invoiceStatusFilter === key ? 'is-on' : ''} aria-pressed={invoiceStatusFilter === key} onClick={() => { setInvoiceStatusFilter(key); setPage(1); }}>{label} <small>{count}</small></button>
                ))}
              </div>
            )}
          </div>

          {/* TAB 1: suppliers */}
          {activeTab === 'suppliers' && (<>
            <div className="sp-row is-head sp-cols-sup" role="row">
              <span>المورد</span><span>الهاتف</span><span>إجمالي المسحوبات</span><span>المسدَّد</span><span>المستحق</span><span />
            </div>
            {pageItems(visibleSuppliers).map((sup) => {
              const due = sup.total_remaining > 0;
              return (
                <div key={sup.id} className="sp-row sp-cols-sup" role="row">
                  <div className="sp-who">
                    <span className={`sp-avatar tone-${sup.id % 3}`} aria-hidden="true">{(sup.name || '؟').trim().charAt(0)}</span>
                    <div><b>{sup.name}</b><small>{sup.company || 'مورد'}{sup.address ? ` · ${sup.address}` : ''}</small></div>
                  </div>
                  {sup.phone ? (
                    <button type="button" className={`sp-phone${copiedId === sup.id ? ' is-copied' : ''}`} dir="ltr" onClick={() => handleCopyPhone(sup.phone, sup.id)} title="انقر لنسخ رقم الهاتف">
                      {copiedId === sup.id ? 'تم النسخ' : sup.phone}
                    </button>
                  ) : <span className="sp-muted">بدون هاتف</span>}
                  <b className="sp-num">{money(sup.total_purchased)} ج.م</b>
                  <span className="sp-num is-ok">{money(sup.total_paid)} ج.م</span>
                  <span className={`sp-pill ${due ? 'is-bad' : 'is-ok'}`}><b aria-hidden="true" />{due ? `${money(sup.total_remaining)} ج.م` : 'مسدَّد'}</span>
                  <div className="sp-acts">
                    {due && <button type="button" className="sp-mini is-primary" onClick={() => openPaymentModal(sup)}>سداد</button>}
                    <button type="button" className="sp-mini" onClick={() => openSupplierLedger(sup.id)}>كشف حساب</button>
                    <button type="button" className="sp-icon" onClick={() => openAddSupplier(sup)} aria-label={`تعديل ${sup.name}`} title="تعديل"><LineIcon name="edit" size={16} /></button>
                    <button type="button" className="sp-icon is-danger" onClick={() => handleDeleteSupplier(sup.id, sup.name)} aria-label={`حذف ${sup.name}`} title="حذف"><LineIcon name="trash" size={16} /></button>
                  </div>
                </div>
              );
            })}
            {visibleSuppliers.length === 0 && (
              <div className="sp-empty">
                <span><LineIcon name="store" size={30} /></span>
                <h2>{search || supplierFilter !== 'all' ? 'لا يوجد موردون مطابقون' : 'لا يوجد موردون مسجلون'}</h2>
                <p>{search || supplierFilter !== 'all' ? 'غيّر البحث أو التصفية.' : 'سجّل أول مورد لتتابع فواتيره ومستحقاته وتحدّث المخزون من فواتير التوريد.'}</p>
                {!search && supplierFilter === 'all' && <button type="button" className="sp-btn is-primary" onClick={() => openAddSupplier()}><LineIcon name="plus" size={16} /> مورد جديد</button>}
              </div>
            )}
          </>)}

          {/* TAB 2: invoices */}
          {activeTab === 'invoices' && (<>
            <div className="sp-row is-head sp-cols-inv" role="row">
              <span>رقم الفاتورة</span><span>المورد</span><span>الإجمالي</span><span>المدفوع</span><span>الحالة</span><span>الاستحقاق</span><span />
            </div>
            {pageItems(filteredInvoices).map((inv) => {
              const status = inv.payment_status === 'paid' ? ['is-ok', 'مسدَّدة'] : inv.payment_status === 'partial' ? ['is-warn', `باقي ${money(inv.remaining_amount)}`] : ['is-bad', `باقي ${money(inv.remaining_amount)}`];
              return (
                <div key={inv.id} className="sp-row sp-cols-inv" role="row">
                  <b className="sp-code" dir="ltr">{inv.invoice_number ? `#${inv.invoice_number}` : `INV-${inv.id}`}</b>
                  <div className="sp-who"><div><b>{inv.supplier_name}</b><small>{inv.items_count} أصناف · {inv.total_units || 0} قطعة · {new Date(inv.created_at).toLocaleDateString('ar-EG-u-nu-latn')}</small></div></div>
                  <b className="sp-num">{money(inv.total_amount)}</b>
                  <span className="sp-num is-ok">{money(inv.paid_amount)}</span>
                  <span className={`sp-pill ${status[0]}`}><b aria-hidden="true" />{status[1]}</span>
                  <span className={inv.due_date && inv.remaining_amount > 0 ? 'sp-due' : 'sp-muted'}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('ar-EG-u-nu-latn') : '—'}</span>
                  <div className="sp-acts">
                    {inv.remaining_amount > 0 && <button type="button" className="sp-mini is-primary" onClick={() => openPaymentModal(null, inv)}>سداد</button>}
                    <button type="button" className="sp-mini" onClick={() => handlePreviewInvoice(inv.id)}>تفاصيل</button>
                  </div>
                </div>
              );
            })}
            {filteredInvoices.length === 0 && (
              <div className="sp-empty">
                <span><LineIcon name="file" size={30} /></span>
                <h2>لا توجد فواتير شراء</h2>
                <p>سجّل فاتورة توريد لتدخل الأصناف المستلمة في رصيد المخزن.</p>
              </div>
            )}
          </>)}

          {/* TAB 3: payments */}
          {activeTab === 'payments' && (<>
            <div className="sp-row is-head sp-cols-pay" role="row">
              <span>رقم الحركة</span><span>المورد</span><span>المبلغ</span><span>الفاتورة المرتبطة</span><span>الطريقة</span><span>التاريخ</span>
            </div>
            {pageItems(filteredPayments).map((p) => (
              <div key={p.id} className="sp-row sp-cols-pay" role="row">
                <b className="sp-code" dir="ltr">PAY-{p.id}</b>
                <div className="sp-who"><div><b>{p.supplier_name}</b>{p.notes && <small>{p.notes}</small>}</div></div>
                <b className="sp-num is-ok">{money(p.amount)} ج.م</b>
                <span>{p.invoice_number ? `#${p.invoice_number}` : <em className="sp-muted">سداد عام لحساب المورد</em>}</span>
                <span className="sp-pill is-soft">{p.payment_method === 'cash' ? 'نقدي' : p.payment_method === 'bank_transfer' ? 'تحويل بنكي / محفظة' : 'شيك'}</span>
                <span className="sp-muted">{new Date(p.payment_date).toLocaleDateString('ar-EG-u-nu-latn')}</span>
              </div>
            ))}
            {filteredPayments.length === 0 && (
              <div className="sp-empty">
                <span><LineIcon name="banknote" size={30} /></span>
                <h2>لا توجد دفعات سداد</h2>
                <p>دفعات السداد للموردين هتظهر هنا.</p>
              </div>
            )}
          </>)}

          {/* pager */}
          {activeList.length > PAGE_SIZE && (
            <footer className="sp-pager">
              <span>عرض {Math.min(page * PAGE_SIZE, activeList.length) - (page - 1) * PAGE_SIZE} من {activeList.length}</span>
              <nav aria-label="الصفحات">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="السابقة"><LineIcon name="chevronRight" size={16} /></button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={n === page ? 'is-on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
                ))}
                <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="التالية"><LineIcon name="chevronLeft" size={16} /></button>
              </nav>
            </footer>
          )}
        </section>

        {/* stock-linked aside */}
        {lowStock && lowStock.length > 0 && (
          <aside className="sp-card sp-aside" aria-label="قطع تحت حد الطلب">
            <div className="sp-aside__head"><h2>تحت حد الطلب</h2><span className="sp-pill is-warn">{lowStock.length} صنف</span></div>
            <p>من أرصدة المخزن مباشرة. أنشئ أمر توريد بالكميات المقترحة.</p>
            <ul>
              {lowStock.slice(0, 5).map((row) => (
                <li key={`${row.warehouse_id}-${row.variant_id}`}>
                  <div><b>{row.product_name}</b><small><bdi>{[row.size, row.color].filter(Boolean).join(' · ') || row.sku || row.warehouse_name}</bdi></small></div>
                  <span className={`sp-pill ${row.quantity <= 0 ? 'is-bad' : 'is-warn'}`}>{row.quantity <= 0 ? 'نفدت' : `${row.quantity} متبقي`}</span>
                </li>
              ))}
            </ul>
            <div className="sp-aside__acts">
              <button type="button" className="sp-btn is-primary" onClick={openRestockPurchase}>إنشاء أمر توريد</button>
              {onNavigate && <button type="button" className="sp-btn" onClick={() => onNavigate('branches', { tab: 'counts' })}>فتح الجرد</button>}
            </div>
          </aside>
        )}
      </div>

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
          MODAL 2: New Purchase Invoice (stock is updated on save)
          ========================================= */}
      {showNewPurchaseModal && (
        <div className="sp-overlay" onClick={() => setShowNewPurchaseModal(false)}>
          <div className="sp-dialog" role="dialog" aria-modal="true" aria-label="تسجيل فاتورة توريد" onClick={(e) => e.stopPropagation()}>
            <header className="sp-dialog__head">
              <span className="sp-dialog__tile"><LineIcon name="file" size={24} /></span>
              <div><h2>تسجيل فاتورة توريد</h2><p>الأصناف المستلمة بتتضاف لرصيد المخزن، والمتبقي بيتسجّل دين على المورد.</p></div>
              <button type="button" className="sp-dialog__x" onClick={() => setShowNewPurchaseModal(false)} aria-label="إغلاق"><LineIcon name="x" size={20} /></button>
            </header>

            <form onSubmit={handleSavePurchase} className="sp-dialog__body">
              <div className="sp-grid3">
                <label className="sp-field"><span>المورد <i className="sp-req">*</i></span>
                  <select required value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}>
                    <option value="">اختر المورد</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.company ? ` (${s.company})` : ''}</option>)}
                  </select>
                </label>
                <label className="sp-field"><span>رقم فاتورة المورد</span>
                  <input type="text" dir="ltr" placeholder="اختياري، مثل A-77310" value={purchaseForm.invoiceNumber} onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })} />
                </label>
                <label className="sp-field"><span>تاريخ استحقاق الآجل</span>
                  <input type="date" dir="ltr" value={purchaseForm.dueDate} onChange={(e) => setPurchaseForm({ ...purchaseForm, dueDate: e.target.value })} />
                </label>
              </div>

              <section className="sp-lines" aria-label="أصناف الفاتورة">
                <div className="sp-lines__head"><span>القطعة</span><span>الكمية</span><span>تكلفة الوحدة</span><span>سعر البيع</span><span>الإجمالي</span><span /></div>
                {purchaseForm.items.map((item, idx) => (
                  <div key={item._id || idx} className="sp-line">
                    <div className="sp-line__item">
                      <input type="text" required placeholder="اسم القطعة" aria-label="اسم القطعة" value={item.product_name} onChange={(e) => updatePurchaseItem(idx, 'product_name', e.target.value)} />
                      <select aria-label="ربط بصنف موجود" value={item.variant_id} onChange={(e) => updatePurchaseItem(idx, 'variant_id', e.target.value)}>
                        <option value="">أو اختر من أصناف المخزن</option>
                        {productsList.map((p) => p.variants?.map((v) => (
                          <option key={v.id} value={v.id}>{p.name}{v.size ? ` - ${v.size}` : ''}{v.color ? ` ${v.color}` : ''} (مخزون: {v.stock_quantity})</option>
                        )))}
                      </select>
                    </div>
                    <input type="number" min="1" required aria-label="الكمية" value={item.quantity} onChange={(e) => updatePurchaseItem(idx, 'quantity', e.target.value)} />
                    <input type="number" min="0" step="any" required placeholder="0.00" aria-label="تكلفة الوحدة" value={item.purchase_price} onChange={(e) => updatePurchaseItem(idx, 'purchase_price', e.target.value)} />
                    <input type="number" min="0" step="any" placeholder="0.00" aria-label="سعر البيع المقترح" value={item.selling_price} onChange={(e) => updatePurchaseItem(idx, 'selling_price', e.target.value)} />
                    <b className="sp-num">{money(Number(item.quantity || 0) * Number(item.purchase_price || 0))}</b>
                    <button type="button" className="sp-icon" disabled={purchaseForm.items.length <= 1} onClick={() => removePurchaseItemLine(idx)} aria-label="حذف الصنف"><LineIcon name="x" size={16} /></button>
                  </div>
                ))}
                <button type="button" className="sp-addline" onClick={addPurchaseItemLine}><LineIcon name="plus" size={18} /> أضف صنفًا آخر</button>
              </section>

              <div className="sp-grid2">
                <label className="sp-field"><span>المبلغ المدفوع الآن</span>
                  <div className="sp-money"><input type="number" min="0" step="any" placeholder="0.00" value={purchaseForm.paidAmount} onChange={(e) => setPurchaseForm({ ...purchaseForm, paidAmount: e.target.value })} /><em>ج.م</em></div>
                </label>
                <div className="sp-sum">
                  <div><span>إجمالي الأصناف</span><b>{money(purchaseCalculatedTotal)}</b></div>
                  <div><span>المدفوع الآن</span><b>{money(Number(purchaseForm.paidAmount || 0))}</b></div>
                  <div className="is-total"><span>المتبقي دين على المورد</span><strong>{money(Math.max(purchaseCalculatedTotal - Number(purchaseForm.paidAmount || 0), 0))} <small>ج.م</small></strong></div>
                </div>
              </div>

              <p className="sp-stocknote"><LineIcon name="check" size={16} strokeWidth={3} />{purchaseUnits} قطعة هتتضاف لرصيد المخزن عند الحفظ</p>

              <footer className="sp-dialog__foot">
                <button type="submit" className="sp-btn is-primary">حفظ الفاتورة <LineIcon name="check" size={16} /></button>
                <button type="button" className="sp-btn" onClick={() => setShowNewPurchaseModal(false)}>إلغاء</button>
                <span>{purchaseForm.items.length} أصناف · {purchaseUnits} قطعة</span>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL 3: Record Supplier Payment Modal
          ========================================= */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal-card supplier-payment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💵 سداد دفع المورد</h3>
              <button className="modal-close" onClick={() => setShowPaymentModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="profile-edit-form supplier-payment-form">
              <div className="profile-field-group">
                <label className="profile-label">المورد / المصنع *</label>
                <select
                  required
                  className="custom-date-input supplier-payment-select"
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
                    style={{ fontSize: '20px', fontWeight: 800, color: '#15803D' }}
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="profile-field-group">
                <label className="profile-label">طريقة السداد</label>
                <select
                  className="custom-date-input supplier-payment-select"
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
          <div className="modal-card invoice-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                تفاصيل فاتورة شراء {selectedInvoicePreview.invoice_number ? `#${selectedInvoicePreview.invoice_number}` : `INV-${selectedInvoicePreview.id}`}
              </h3>
              <button className="modal-close" onClick={() => setSelectedInvoicePreview(null)}>
                ×
              </button>
            </div>

            <div className="invoice-preview-meta">
              <div>
                <span>المورد</span>
                <strong>{selectedInvoicePreview.supplier_name}</strong>
              </div>
              <div>
                <span>تاريخ الفاتورة</span>
                <strong>{new Date(selectedInvoicePreview.created_at).toLocaleDateString('ar-EG')}</strong>
              </div>
            </div>

            <div className="invoice-preview-table-wrap">
              <table className="modal-items-table invoice-preview-table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>المقاس / اللون</th>
                    <th>الكمية</th>
                    <th>سعر الشراء</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoicePreview.items?.length ? selectedInvoicePreview.items.map((it) => (
                    <tr key={it.id}>
                      <td className="invoice-preview-product">{it.product_name}</td>
                      <td>{[it.size, it.color].filter(Boolean).join(' · ') || '—'}</td>
                      <td>{it.quantity}</td>
                      <td>{it.purchase_price.toFixed(2)} ج.م</td>
                      <td><strong>{(it.quantity * it.purchase_price).toFixed(2)} ج.م</strong></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5" className="invoice-preview-empty">لا توجد أصناف مسجلة في هذه الفاتورة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="invoice-preview-summary">
              <div className="invoice-preview-total">
                <span>إجمالي الفاتورة</span>
                <strong>{selectedInvoicePreview.total_amount.toFixed(2)} <small>ج.م</small></strong>
              </div>
              <div className="invoice-preview-balance">
                <div className="invoice-preview-paid">
                  <span>المبلغ المدفوع</span>
                  <strong>{selectedInvoicePreview.paid_amount.toFixed(2)} <small>ج.م</small></strong>
                </div>
                <div className="invoice-preview-remaining">
                  <span>المتبقي (الآجل)</span>
                  <strong>{selectedInvoicePreview.remaining_amount.toFixed(2)} <small>ج.م</small></strong>
                </div>
              </div>
            </div>

            <div className="profile-modal-actions invoice-preview-actions">
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
