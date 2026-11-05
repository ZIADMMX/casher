import { useCallback, useEffect, useMemo, useState } from 'react';
import * as inventoryApi from '../api/inventory.js';
import { useUser } from '../contexts/UserContext.jsx';
import { hasPermission } from '../utils/accessControl.js';
import {
  AlertIcon, BarsIcon, ChevronDownIcon, ChevronSideIcon, ClipboardCheckIcon, CloseIcon, InfoIcon,
  LockIcon, MinusIcon, PackageIcon, PlusIcon, PulseIcon, RefreshIcon, SearchIcon, SlidersIcon,
  StarIcon, StoreIcon, SwapIcon, WarehouseIcon,
} from '../components/icons/PosIcons.jsx';
import '../styles/inventory.css';

const TABS = [
  { key: 'branches', label: 'الفروع', Icon: StoreIcon },
  { key: 'warehouses', label: 'المخازن', Icon: WarehouseIcon },
  { key: 'stock', label: 'المخزون وحد الطلب', Icon: BarsIcon },
  { key: 'transfers', label: 'تحويل المخزون', Icon: SwapIcon },
  { key: 'counts', label: 'الجرد والتسويات', Icon: ClipboardCheckIcon },
  { key: 'movements', label: 'حركة الأصناف', Icon: PulseIcon },
];

const MOVEMENT_LABELS = {
  opening: 'رصيد افتتاحي',
  sale: 'بيع',
  purchase: 'شراء',
  return: 'مرتجع',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  adjustment: 'تسوية',
  count: 'جرد',
};

// Filter chips group related movement types; purchase/return chips appear only when present.
const MOVEMENT_FILTERS = [
  { key: 'all', label: 'الكل', types: null },
  { key: 'sale', label: 'بيع', types: ['sale'] },
  { key: 'opening', label: 'رصيد افتتاحي', types: ['opening'] },
  { key: 'transfer', label: 'تحويل', types: ['transfer_in', 'transfer_out'] },
  { key: 'adjustment', label: 'تسوية', types: ['adjustment', 'count'] },
  { key: 'purchase', label: 'شراء', types: ['purchase'], optional: true },
  { key: 'return', label: 'مرتجع', types: ['return'], optional: true },
];

const ADJUSTMENT_REASONS = [
  ['damaged', 'تالف'],
  ['expired', 'منتهي الصلاحية'],
  ['sample', 'هدية / عينة'],
  ['entry_error', 'خطأ إدخال'],
  ['other', 'أخرى'],
];

const numberFormat = new Intl.NumberFormat('en-US');
const timeFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker. */
function parseDbDate(value) {
  if (!value) return null;
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDay(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function variantLabel(row) {
  return [row.size, row.color].filter(Boolean).join(' / ');
}

function itemOptionLabel(row, suffix) {
  const variant = variantLabel(row);
  return `${row.product_name}${variant ? ` — ${variant}` : ''}${suffix ? ` (${suffix})` : ''}`;
}

function warehouseLabel(warehouse) {
  return `${warehouse.branch_name} — ${warehouse.name}`;
}

function Field({ label, children, hint }) {
  return (
    <label className="inv-field">
      <span className="inv-field__label">{label}</span>
      {children}
      {hint && <span className="inv-field__hint">{hint}</span>}
    </label>
  );
}

function SelectControl({ children, ...props }) {
  return (
    <span className="inv-select">
      <select {...props}>{children}</select>
      <ChevronDownIcon size={16} className="inv-select__chevron" />
    </span>
  );
}

function StatCard({ label, value, Icon, tone }) {
  return (
    <div className="inv-stat">
      <span className={`inv-icon-tile inv-icon-tile--${tone}`}><Icon size={22} /></span>
      <div className="inv-stat__text">
        <span className="inv-stat__label">{label}</span>
        <strong className="inv-stat__value">{numberFormat.format(value)}</strong>
      </div>
    </div>
  );
}

function CardTitle({ children, Icon, tone = 'primary', dot, meta }) {
  return (
    <div className="inv-card__head">
      <h2 className="inv-card__title">
        {Icon && <span className={`inv-icon-tile inv-icon-tile--sm inv-icon-tile--${tone}`}><Icon size={18} /></span>}
        {dot && <span className="inv-dot" aria-hidden="true" />}
        {children}
      </h2>
      {meta && <span className="inv-card__meta">{meta}</span>}
    </div>
  );
}

function NoAccess({ action }) {
  return (
    <div className="inv-no-access" role="note">
      <LockIcon size={18} />
      <span>لا تملك صلاحية {action}. اطلبها من مدير النظام.</span>
    </div>
  );
}

function InventoryManagementPage() {
  const { currentUser } = useUser();
  const can = {
    manage: hasPermission(currentUser, 'inventory.manage'),
    transfer: hasPermission(currentUser, 'inventory.transfer'),
    adjust: hasPermission(currentUser, 'inventory.adjust'),
  };

  const [tab, setTab] = useState('branches');
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stock, setStock] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [centralConfig, setCentralConfig] = useState({ baseUrl: '', warehouseId: null });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [movementFilter, setMovementFilter] = useState('all');
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '' });
  const [warehouseForm, setWarehouseForm] = useState({ name: '' });
  const [transferForm, setTransferForm] = useState({
    sourceWarehouseId: '', destinationWarehouseId: '', variantId: '', quantity: 1, notes: '',
  });
  const [adjustment, setAdjustment] = useState({
    variantId: '', quantity: '', direction: 1, reason: 'damaged', notes: '',
  });
  const [confirmAdjustment, setConfirmAdjustment] = useState(false);
  const [countType, setCountType] = useState('partial');
  const [countVariantId, setCountVariantId] = useState('');
  const [countedQuantity, setCountedQuantity] = useState('');
  const [fullCounts, setFullCounts] = useState({});
  const [reorderLevels, setReorderLevels] = useState({});

  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === String(warehouseId));
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.is_active && warehouse.branch_active);
  const activeBranches = branches.filter((branch) => branch.is_active);
  const warehouseStock = useMemo(
    () => stock.filter((row) => String(row.warehouse_id) === String(warehouseId)),
    [stock, warehouseId],
  );
  const lowStockCount = warehouseStock.filter((row) => row.quantity <= row.reorder_level).length;
  const totalUnits = activeWarehouses.reduce((sum, warehouse) => sum + Number(warehouse.total_quantity || 0), 0);

  const filteredStock = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return warehouseStock.filter((row) => (!lowStockOnly || row.quantity <= row.reorder_level)
      && (!query || [row.product_name, row.sku, row.barcode, row.size, row.color]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query))));
  }, [lowStockOnly, search, warehouseStock]);

  const loadData = useCallback(async (preferredWarehouseId = warehouseId) => {
    setLoading(true);
    setError('');
    try {
      const [branchList, warehouseList, transferList] = await Promise.all([
        inventoryApi.getInventoryBranches(),
        inventoryApi.getInventoryWarehouses(),
        inventoryApi.getInventoryTransfers(),
      ]);
      setBranches(branchList);
      setWarehouses(warehouseList);
      setTransfers(transferList);

      const usable = (warehouse) => warehouse.is_active && warehouse.branch_active;
      const nextWarehouse = warehouseList.some((warehouse) => String(warehouse.id) === String(preferredWarehouseId)
        && usable(warehouse))
        ? String(preferredWarehouseId)
        : String(warehouseList.find((warehouse) => warehouse.is_default && usable(warehouse))?.id
          || warehouseList.find(usable)?.id
          || '');
      setWarehouseId(nextWarehouse);
      const activeWarehouse = warehouseList.find((warehouse) => String(warehouse.id) === nextWarehouse);
      setSelectedBranchId((current) => current
        || String(activeWarehouse?.branch_id || branchList.find((branch) => branch.is_active)?.id || ''));
      setTransferForm((current) => ({
        ...current,
        sourceWarehouseId: current.sourceWarehouseId || nextWarehouse,
      }));

      if (nextWarehouse) {
        const [stockRows, movementRows] = await Promise.all([
          inventoryApi.getInventoryStock(),
          inventoryApi.getInventoryMovements({ warehouseId: Number(nextWarehouse), limit: 100 }),
        ]);
        setStock(stockRows);
        setMovements(movementRows);
      } else {
        setStock([]);
        setMovements([]);
      }
    } catch (loadError) {
      console.error('تعذر تحميل بيانات الفروع والمخزون:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات المخزون');
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    inventoryApi.getCentralServerConfig()
      .then((config) => setCentralConfig(config))
      .catch((configError) => {
        console.error('تعذر قراءة إعداد الخادم المركزي:', configError);
      });
  }, []);

  useEffect(() => {
    if (!confirmAdjustment) return undefined;
    const timer = setTimeout(() => setConfirmAdjustment(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmAdjustment]);

  async function submitAction(action, successMessage) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await loadData(warehouseId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'تعذر تنفيذ العملية');
    } finally {
      setBusy(false);
    }
  }

  function handleCreateBranch(event) {
    event.preventDefault();
    submitAction(async () => {
      await inventoryApi.createInventoryBranch(branchForm);
      setBranchForm({ name: '', address: '', phone: '' });
    }, 'تم إنشاء الفرع ومخزنه الرئيسي');
  }

  function handleCreateWarehouse(event) {
    event.preventDefault();
    submitAction(async () => {
      await inventoryApi.createInventoryWarehouse({
        branchId: Number(selectedBranchId),
        name: warehouseForm.name,
      });
      setWarehouseForm({ name: '' });
    }, 'تم إنشاء المخزن');
  }

  function handleTransfer(event) {
    event.preventDefault();
    submitAction(async () => {
      await inventoryApi.transferInventoryStock({
        sourceWarehouseId: Number(transferForm.sourceWarehouseId),
        destinationWarehouseId: Number(transferForm.destinationWarehouseId),
        items: [{ variantId: Number(transferForm.variantId), quantity: Number(transferForm.quantity) }],
        notes: transferForm.notes,
      });
      setTransferForm((current) => ({ ...current, variantId: '', quantity: 1, notes: '' }));
    }, 'تم تحويل المخزون وتسجيل حركته');
  }

  function handleAdjustment(event) {
    event.preventDefault();
    if (!warehouseId) return;
    // Two-step confirm: stock adjustments are permanent ledger entries.
    if (!confirmAdjustment) {
      setConfirmAdjustment(true);
      return;
    }
    setConfirmAdjustment(false);
    submitAction(async () => {
      await inventoryApi.adjustInventoryStock({
        warehouseId: Number(warehouseId),
        variantId: Number(adjustment.variantId),
        delta: adjustment.direction * Number(adjustment.quantity),
        reason: adjustment.reason,
        notes: adjustment.notes,
      });
      setAdjustment({ variantId: '', quantity: '', direction: 1, reason: 'damaged', notes: '' });
    }, 'تم تسجيل تسوية المخزون');
  }

  function handleCount(event) {
    event.preventDefault();
    if (!warehouseId) return;
    const countItems = countType === 'full'
      ? warehouseStock.map((row) => ({
          variantId: row.variant_id,
          countedQuantity: Number(fullCounts[row.variant_id] ?? row.quantity),
        }))
      : [{ variantId: Number(countVariantId), countedQuantity: Number(countedQuantity) }];
    submitAction(async () => {
      await inventoryApi.countInventoryStock({
        warehouseId: Number(warehouseId),
        countType,
        items: countItems,
      });
      setCountVariantId('');
      setCountedQuantity('');
      setFullCounts({});
    }, countType === 'full' ? 'اكتمل الجرد الشامل وتمت تسوية الفروقات' : 'اكتمل الجرد الجزئي وتمت التسوية');
  }

  function handleSaveReorderLevel(row) {
    submitAction(async () => {
      await inventoryApi.setInventoryReorderLevel({
        warehouseId: row.warehouse_id,
        variantId: row.variant_id,
        reorderLevel: Number(reorderLevels[row.variant_id] ?? row.reorder_level),
      });
      setReorderLevels((current) => {
        const next = { ...current };
        delete next[row.variant_id];
        return next;
      });
    }, 'تم تحديث حد إعادة الطلب');
  }

  /* ---------- Derived values for the forms ---------- */
  const sourceWarehouseStock = stock.filter(
    (row) => String(row.warehouse_id) === String(transferForm.sourceWarehouseId) && row.quantity > 0,
  );
  const transferItem = sourceWarehouseStock.find((row) => String(row.variant_id) === String(transferForm.variantId));
  const transferQty = Number(transferForm.quantity) || 0;
  const transferAfter = transferItem ? transferItem.quantity - transferQty : null;
  const transferReady = transferForm.sourceWarehouseId && transferForm.destinationWarehouseId
    && transferItem && transferQty > 0 && transferAfter >= 0;

  const countItem = warehouseStock.find((row) => String(row.variant_id) === String(countVariantId));
  const countDiff = countItem && countedQuantity !== '' ? Number(countedQuantity) - countItem.quantity : null;
  const fullCountChanges = warehouseStock.filter(
    (row) => fullCounts[row.variant_id] !== undefined && Number(fullCounts[row.variant_id]) !== row.quantity,
  ).length;

  const adjustmentItem = warehouseStock.find((row) => String(row.variant_id) === String(adjustment.variantId));
  const adjustmentQty = Number(adjustment.quantity) || 0;
  const adjustmentReady = adjustmentItem && adjustmentQty > 0
    && (adjustment.direction > 0 || adjustmentQty <= adjustmentItem.quantity)
    && (adjustment.reason !== 'other' || adjustment.notes.trim());

  const movementCounts = useMemo(() => Object.fromEntries(MOVEMENT_FILTERS.map((filter) => [
    filter.key,
    filter.types ? movements.filter((movement) => filter.types.includes(movement.movement_type)).length : movements.length,
  ])), [movements]);
  const visibleMovements = useMemo(() => {
    const filter = MOVEMENT_FILTERS.find((item) => item.key === movementFilter);
    return filter?.types ? movements.filter((movement) => filter.types.includes(movement.movement_type)) : movements;
  }, [movementFilter, movements]);

  const warehouseOptions = activeWarehouses.map((warehouse) => (
    <option key={warehouse.id} value={warehouse.id}>{warehouseLabel(warehouse)}</option>
  ));

  return (
    <section className="inv-page" dir="rtl">
      {/* ---------- Header ---------- */}
      <header className="inv-header">
        <div className="inv-header__titles">
          <nav className="inv-breadcrumb" aria-label="مسار التنقل">
            <span>المخزون</span>
            <ChevronSideIcon size={14} />
            <span className="inv-breadcrumb__current">الفروع والمخازن</span>
          </nav>
          <h1 className="inv-title">إدارة الفروع والمخازن</h1>
          <p className="inv-subtitle">مواقع التخزين، التحويلات، الجرد، التسويات وحدود إعادة الطلب — في مكان واحد.</p>
        </div>
        <div className="inv-header__actions">
          <div className="inv-picker">
            <span className="inv-icon-tile inv-icon-tile--sm inv-icon-tile--accent"><WarehouseIcon size={18} /></span>
            <label className="inv-picker__body">
              <span className="inv-picker__label">المخزن الحالي</span>
              <span className="inv-picker__select">
                <select
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                  disabled={!activeWarehouses.length}
                >
                  {!activeWarehouses.length && <option value="">لا توجد مخازن نشطة</option>}
                  {warehouseOptions}
                </select>
                <ChevronDownIcon size={14} />
              </span>
            </label>
          </div>
          <button type="button" className="inv-btn inv-btn--ghost" onClick={() => loadData()} disabled={loading}>
            <RefreshIcon size={18} className={loading ? 'inv-spin' : ''} />
            تحديث البيانات
          </button>
        </div>
      </header>

      {(error || notice) && (
        <div className={`inv-alert ${error ? 'inv-alert--error' : 'inv-alert--success'}`} role={error ? 'alert' : 'status'}>
          <span>{error || notice}</span>
          <button type="button" className="inv-icon-btn" aria-label="إغلاق" onClick={() => { setError(''); setNotice(''); }}>
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {centralConfig.baseUrl && !centralConfig.warehouseId && (
        <div className="inv-alert inv-alert--warning" role="status">
          <span>لم يتم تخصيص مخزن لهذا الجهاز. من تبويب «المخازن» اختر «استخدامه لهذا الجهاز» قبل بدء البيع.</span>
        </div>
      )}

      {/* ---------- KPIs ---------- */}
      <div className="inv-stats">
        <StatCard label="عدد الفروع" value={activeBranches.length} Icon={StoreIcon} tone="primary" />
        <StatCard label="المخازن" value={activeWarehouses.length} Icon={WarehouseIcon} tone="accent" />
        <StatCard label="إجمالي القطع" value={totalUnits} Icon={PackageIcon} tone="accent" />
        <StatCard label="أصناف تحت حد الطلب" value={lowStockCount} Icon={AlertIcon} tone="danger" />
      </div>

      {/* ---------- Tabs ---------- */}
      <nav className="inv-tabs" role="tablist" aria-label="إدارة المخزون">
        {TABS.map(({ key, label, Icon }) => (
          <button
            type="button"
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`inv-tab ${tab === key ? 'is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={18} />
            {label}
            {key === 'stock' && lowStockCount > 0 && <span className="inv-tab__badge">{lowStockCount}</span>}
          </button>
        ))}
      </nav>

      {loading && !warehouses.length ? <p className="inv-empty">جاري تحميل بيانات المخزون...</p> : (
        <div className="inv-tab-panel" role="tabpanel">
          {/* ---------- Branches ---------- */}
          {tab === 'branches' && (
            <div className="inv-layout inv-layout--list-form">
              <div className="inv-card">
                <CardTitle meta={`${branches.length} فرع`}>الفروع المسجلة</CardTitle>
                <div className="inv-rows">
                  {branches.map((branch) => (
                    <div className="inv-row" key={branch.id}>
                      <span className="inv-icon-tile inv-icon-tile--primary"><StoreIcon size={22} /></span>
                      <div className="inv-row__main">
                        <strong>{branch.name}</strong>
                        <span className="inv-row__sub">
                          {branch.address || 'بدون عنوان'} · {branch.phone || 'بدون هاتف'}
                        </span>
                      </div>
                      <div className="inv-row__aside">
                        <span className="inv-chip">{branch.warehouse_count} مخزن</span>
                        <span className={`inv-chip ${branch.is_active ? 'inv-chip--success' : 'inv-chip--muted'}`}>
                          {branch.is_active ? 'نشط' : 'متوقف'}
                        </span>
                        {can.manage && (
                          <button
                            type="button"
                            className="inv-btn inv-btn--ghost inv-btn--sm"
                            disabled={busy}
                            onClick={() => submitAction(
                              () => inventoryApi.updateInventoryBranch(branch.id, { ...branch, isActive: !branch.is_active }),
                              branch.is_active ? 'تم إيقاف الفرع' : 'تم تفعيل الفرع',
                            )}
                          >
                            {branch.is_active ? 'إيقاف' : 'تفعيل'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!branches.length && <p className="inv-empty">لا توجد فروع بعد</p>}
                </div>
              </div>

              <form className="inv-card inv-form" onSubmit={handleCreateBranch}>
                <CardTitle dot>إضافة فرع جديد</CardTitle>
                {can.manage ? (
                  <>
                    <Field label="اسم الفرع">
                      <input className="inv-input" placeholder="مثال: فرع سموحة" value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} required />
                    </Field>
                    <Field label="العنوان">
                      <input className="inv-input" placeholder="الشارع، المنطقة، المدينة" value={branchForm.address} onChange={(event) => setBranchForm({ ...branchForm, address: event.target.value })} />
                    </Field>
                    <Field label="الهاتف">
                      <input className="inv-input" inputMode="tel" placeholder="01xxxxxxxxx" value={branchForm.phone} onChange={(event) => setBranchForm({ ...branchForm, phone: event.target.value })} />
                    </Field>
                    <button className="inv-btn inv-btn--primary inv-btn--block" type="submit" disabled={busy || !branchForm.name.trim()}>
                      <PlusIcon size={18} /> إضافة الفرع
                    </button>
                  </>
                ) : <NoAccess action="إدارة الفروع والمخازن" />}
              </form>
            </div>
          )}

          {/* ---------- Warehouses ---------- */}
          {tab === 'warehouses' && (
            <div className="inv-layout inv-layout--list-form">
              <div className="inv-card">
                <CardTitle meta={`${warehouses.length} مخزن`}>المخازن</CardTitle>
                <div className="inv-rows">
                  {warehouses.map((warehouse) => {
                    const isDeviceWarehouse = String(centralConfig.warehouseId) === String(warehouse.id);
                    return (
                      <div className="inv-row" key={warehouse.id}>
                        <span className="inv-icon-tile inv-icon-tile--accent"><WarehouseIcon size={22} /></span>
                        <div className="inv-row__main">
                          <strong>{warehouse.name}</strong>
                          <span className="inv-row__sub">{warehouse.branch_name}</span>
                        </div>
                        <div className="inv-row__qty">
                          <strong>{numberFormat.format(warehouse.total_quantity)}</strong>
                          <span>قطعة</span>
                        </div>
                        <div className="inv-row__aside">
                          {warehouse.is_default ? <span className="inv-chip inv-chip--accent"><StarIcon size={13} /> افتراضي</span> : null}
                          {isDeviceWarehouse && <span className="inv-chip inv-chip--info">مخزن هذا الجهاز</span>}
                          <span className={`inv-chip ${warehouse.is_active ? 'inv-chip--success' : 'inv-chip--muted'}`}>
                            {warehouse.is_active ? 'نشط' : 'متوقف'}
                          </span>
                          {centralConfig.baseUrl && warehouse.is_active && !isDeviceWarehouse && (
                            <button
                              type="button"
                              className="inv-btn inv-btn--ghost inv-btn--sm"
                              disabled={busy}
                              onClick={() => submitAction(async () => {
                                const config = await inventoryApi.setCentralWarehouse(warehouse.id);
                                setCentralConfig(config);
                              }, 'تم تخصيص المخزن لجهاز هذا الفرع. ستُرفض المبيعات إذا انقطع الاتصال بالخادم المركزي.')}
                            >
                              استخدامه لهذا الجهاز
                            </button>
                          )}
                          {can.manage && warehouse.is_active && !warehouse.is_default && (
                            <button
                              type="button"
                              className="inv-btn inv-btn--ghost inv-btn--sm"
                              disabled={busy}
                              onClick={() => submitAction(
                                () => inventoryApi.updateInventoryWarehouse(warehouse.id, {
                                  name: warehouse.name, isActive: true, isDefault: true,
                                }),
                                'تم تعيين المخزن الافتراضي للفرع',
                              )}
                            >
                              تعيين كافتراضي
                            </button>
                          )}
                          {can.manage && (
                            <button
                              type="button"
                              className="inv-btn inv-btn--ghost inv-btn--sm"
                              disabled={busy}
                              onClick={() => submitAction(
                                () => inventoryApi.updateInventoryWarehouse(warehouse.id, {
                                  name: warehouse.name,
                                  isActive: !warehouse.is_active,
                                  isDefault: Boolean(warehouse.is_default),
                                }),
                                warehouse.is_active ? 'تم إيقاف المخزن' : 'تم تفعيل المخزن',
                              )}
                            >
                              {warehouse.is_active ? 'إيقاف' : 'تفعيل'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!warehouses.length && <p className="inv-empty">لا توجد مخازن بعد</p>}
                </div>
              </div>

              <form className="inv-card inv-form" onSubmit={handleCreateWarehouse}>
                <CardTitle dot>إضافة مخزن</CardTitle>
                {can.manage ? (
                  <>
                    <Field label="الفرع">
                      <SelectControl value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} required>
                        {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                      </SelectControl>
                    </Field>
                    <Field label="اسم المخزن">
                      <input className="inv-input" placeholder="مثال: مخزن المشروبات" value={warehouseForm.name} onChange={(event) => setWarehouseForm({ name: event.target.value })} required />
                    </Field>
                    <button className="inv-btn inv-btn--primary inv-btn--block" type="submit" disabled={busy || !warehouseForm.name.trim() || !selectedBranchId}>
                      <PlusIcon size={18} /> إضافة المخزن
                    </button>
                  </>
                ) : <NoAccess action="إدارة الفروع والمخازن" />}
              </form>
            </div>
          )}

          {/* ---------- Stock & reorder levels ---------- */}
          {tab === 'stock' && (
            <div className="inv-card">
              <div className="inv-card__head inv-card__head--wrap">
                <h2 className="inv-card__title">
                  أرصدة المخزن وحد إعادة الطلب
                  <span className="inv-card__title-muted">— {selectedWarehouse?.name || ''}</span>
                </h2>
                <div className="inv-toolbar">
                  <span className="inv-search">
                    <SearchIcon size={18} />
                    <input placeholder="ابحث باسم الصنف أو SKU أو الباركود" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </span>
                  <button
                    type="button"
                    className={`inv-filter ${lowStockOnly ? 'is-active' : ''}`}
                    aria-pressed={lowStockOnly}
                    onClick={() => setLowStockOnly((value) => !value)}
                  >
                    النواقص فقط · {lowStockCount}
                  </button>
                </div>
              </div>
              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead>
                    <tr><th>الصنف</th><th>المتغير</th><th>الكمية</th><th>حد إعادة الطلب</th><th>الحالة</th>{can.manage && <th>تعديل الحد</th>}</tr>
                  </thead>
                  <tbody>
                    {filteredStock.map((row) => {
                      const low = row.quantity <= row.reorder_level;
                      const draft = reorderLevels[row.variant_id];
                      return (
                        <tr key={`${row.warehouse_id}-${row.variant_id}`}>
                          <td><div className="inv-cell-item"><strong>{row.product_name}</strong><span>{row.sku || '—'}</span></div></td>
                          <td>{variantLabel(row) || '—'}</td>
                          <td className="inv-num">{numberFormat.format(row.quantity)}</td>
                          <td className="inv-num">{row.reorder_level}</td>
                          <td><span className={`inv-chip ${low ? 'inv-chip--danger' : 'inv-chip--success'}`}>{low ? 'إعادة طلب' : 'متوفر'}</span></td>
                          {can.manage && (
                            <td>
                              <div className="inv-inline">
                                <input
                                  className="inv-input inv-input--sm"
                                  type="number"
                                  min="0"
                                  aria-label={`حد إعادة الطلب لـ ${row.product_name}`}
                                  value={draft ?? row.reorder_level}
                                  onChange={(event) => setReorderLevels({ ...reorderLevels, [row.variant_id]: event.target.value })}
                                />
                                <button
                                  className="inv-btn inv-btn--ghost inv-btn--sm"
                                  type="button"
                                  disabled={busy || draft === undefined || Number(draft) === row.reorder_level}
                                  onClick={() => handleSaveReorderLevel(row)}
                                >
                                  حفظ
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {!filteredStock.length && (
                      <tr><td colSpan={can.manage ? 6 : 5} className="inv-empty">لا توجد أصناف مطابقة في هذا المخزن</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------- Transfers ---------- */}
          {tab === 'transfers' && (
            <div className="inv-layout inv-layout--main-side">
              <form className="inv-card inv-form" onSubmit={handleTransfer}>
                <CardTitle>تحويل أصناف بين المخازن</CardTitle>
                {activeWarehouses.length < 2 && (
                  <div className="inv-banner">
                    <InfoIcon size={20} />
                    <span>التحويل محتاج مخزنين على الأقل. عندك {activeWarehouses.length === 1 ? 'مخزن واحد بس' : 'مخازن أقل من المطلوب'} دلوقتي.</span>
                    {can.manage && (
                      <button type="button" className="inv-btn inv-btn--accent inv-btn--sm" onClick={() => setTab('warehouses')}>
                        إضافة مخزن
                      </button>
                    )}
                  </div>
                )}
                {!can.transfer ? <NoAccess action="تحويل المخزون" /> : (
                  <>
                    <div className="inv-route">
                      <Field label="من مخزن">
                        <SelectControl
                          value={transferForm.sourceWarehouseId}
                          onChange={(event) => setTransferForm({ ...transferForm, sourceWarehouseId: event.target.value, variantId: '' })}
                          required
                        >
                          <option value="">اختر المخزن المصدر</option>
                          {warehouseOptions}
                        </SelectControl>
                      </Field>
                      <button
                        type="button"
                        className="inv-swap"
                        aria-label="تبديل المصدر والمستلم"
                        onClick={() => setTransferForm((current) => ({
                          ...current,
                          sourceWarehouseId: current.destinationWarehouseId,
                          destinationWarehouseId: current.sourceWarehouseId,
                          variantId: '',
                        }))}
                      >
                        <ChevronSideIcon size={18} />
                      </button>
                      <Field label="إلى مخزن">
                        <SelectControl
                          value={transferForm.destinationWarehouseId}
                          onChange={(event) => setTransferForm({ ...transferForm, destinationWarehouseId: event.target.value })}
                          required
                        >
                          <option value="">اختر المخزن المستلم</option>
                          {activeWarehouses
                            .filter((warehouse) => String(warehouse.id) !== String(transferForm.sourceWarehouseId))
                            .map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouseLabel(warehouse)}</option>)}
                        </SelectControl>
                      </Field>
                    </div>
                    <div className="inv-grid-2">
                      <Field label="الصنف">
                        <SelectControl value={transferForm.variantId} onChange={(event) => setTransferForm({ ...transferForm, variantId: event.target.value })} required>
                          <option value="">اختر صنفًا</option>
                          {sourceWarehouseStock.map((row) => (
                            <option key={row.variant_id} value={row.variant_id}>{itemOptionLabel(row, `متاح ${row.quantity}`)}</option>
                          ))}
                        </SelectControl>
                      </Field>
                      <Field label="الكمية">
                        <span className="inv-stepper">
                          <button
                            type="button"
                            aria-label="زيادة"
                            onClick={() => setTransferForm((current) => ({ ...current, quantity: (Number(current.quantity) || 0) + 1 }))}
                          >
                            <PlusIcon size={16} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={transferForm.quantity}
                            onChange={(event) => setTransferForm({ ...transferForm, quantity: event.target.value })}
                            required
                          />
                          <button
                            type="button"
                            aria-label="نقص"
                            onClick={() => setTransferForm((current) => ({ ...current, quantity: Math.max(1, (Number(current.quantity) || 1) - 1) }))}
                          >
                            <MinusIcon size={16} />
                          </button>
                        </span>
                      </Field>
                    </div>
                    <Field label="ملاحظات">
                      <textarea
                        className="inv-input inv-textarea"
                        rows={3}
                        placeholder="اختياري — سبب التحويل أو رقم إذن الصرف"
                        value={transferForm.notes}
                        onChange={(event) => setTransferForm({ ...transferForm, notes: event.target.value })}
                      />
                    </Field>
                    <button className="inv-btn inv-btn--primary inv-btn--block inv-btn--lg" type="submit" disabled={busy || !transferReady}>
                      <SwapIcon size={18} /> تنفيذ التحويل
                    </button>
                  </>
                )}
              </form>

              <aside className="inv-side">
                <div className="inv-card inv-card--accent">
                  <h3 className="inv-side__title">ملخص التحويل</h3>
                  <dl className="inv-summary">
                    <div><dt>الصنف</dt><dd>{transferItem ? itemOptionLabel(transferItem) : '—'}</dd></div>
                    <div><dt>الرصيد في المصدر</dt><dd>{transferItem ? numberFormat.format(transferItem.quantity) : '—'}</dd></div>
                    <div>
                      <dt>بعد التحويل</dt>
                      <dd className={transferAfter !== null && transferAfter < 0 ? 'is-negative' : 'is-highlight'}>
                        {transferAfter === null ? '—' : numberFormat.format(transferAfter)}
                      </dd>
                    </div>
                  </dl>
                  {transferAfter !== null && transferAfter < 0 && (
                    <p className="inv-field__error">الكمية أكبر من المتاح في المخزن المصدر</p>
                  )}
                </div>
                <div className="inv-card">
                  <h3 className="inv-side__title inv-side__title--plain">سجل التحويلات</h3>
                  {transfers.length ? (
                    <ul className="inv-history">
                      {transfers.slice(0, 8).map((transfer) => {
                        const date = parseDbDate(transfer.created_at);
                        return (
                          <li key={transfer.id}>
                            <div>
                              <strong>#{transfer.id}</strong>
                              <span>{transfer.source_warehouse_name} ← {transfer.destination_warehouse_name}</span>
                            </div>
                            <div className="inv-history__meta">
                              <span>{transfer.total_units} قطعة</span>
                              <span>{date ? formatDay(date) : ''}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="inv-empty-state">
                      <SwapIcon size={32} />
                      <span>لسه مفيش تحويلات</span>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}

          {/* ---------- Counts & adjustments ---------- */}
          {tab === 'counts' && (
            <div className="inv-layout inv-layout--halves">
              <form className="inv-card inv-form" onSubmit={handleCount}>
                <CardTitle Icon={ClipboardCheckIcon}>جرد المخزن</CardTitle>
                {!can.adjust ? <NoAccess action="الجرد وتسوية المخزون" /> : (
                  <>
                    <div className="inv-segmented" role="radiogroup" aria-label="نوع الجرد">
                      {[['partial', 'جرد جزئي'], ['full', 'جرد شامل']].map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          role="radio"
                          aria-checked={countType === value}
                          className={countType === value ? 'is-active' : ''}
                          onClick={() => setCountType(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {countType === 'partial' ? (
                      <>
                        <Field label="الصنف">
                          <SelectControl value={countVariantId} onChange={(event) => setCountVariantId(event.target.value)} required>
                            <option value="">اختر صنفًا</option>
                            {warehouseStock.map((row) => <option key={row.variant_id} value={row.variant_id}>{itemOptionLabel(row)}</option>)}
                          </SelectControl>
                        </Field>
                        <Field label="الكمية الفعلية (بعد العدّ)">
                          <input className="inv-input" type="number" min="0" placeholder="0" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} required />
                        </Field>
                        <div className="inv-metrics">
                          <div><span>رصيد النظام</span><strong>{countItem ? numberFormat.format(countItem.quantity) : '—'}</strong></div>
                          <div><span>الفعلي</span><strong>{countedQuantity !== '' && countItem ? numberFormat.format(Number(countedQuantity)) : '—'}</strong></div>
                          <div>
                            <span>الفرق</span>
                            <strong className={countDiff > 0 ? 'is-positive' : countDiff < 0 ? 'is-negative' : ''}>
                              {countDiff === null ? '—' : <bdi dir="ltr">{`${countDiff > 0 ? '+' : ''}${countDiff}`}</bdi>}
                            </strong>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="inv-count-list">
                        <div className="inv-count-list__head"><span>الصنف</span><span>النظام</span><span>الفعلي</span></div>
                        {warehouseStock.map((row) => {
                          const value = fullCounts[row.variant_id] ?? row.quantity;
                          const changed = Number(value) !== row.quantity;
                          return (
                            <label key={row.variant_id} className={`inv-count-row ${changed ? 'is-changed' : ''}`}>
                              <span className="inv-count-row__name">{itemOptionLabel(row)}</span>
                              <span className="inv-num">{row.quantity}</span>
                              <input
                                className="inv-input inv-input--sm"
                                type="number"
                                min="0"
                                value={value}
                                onChange={(event) => setFullCounts({ ...fullCounts, [row.variant_id]: event.target.value })}
                              />
                            </label>
                          );
                        })}
                        {!warehouseStock.length && <p className="inv-empty">لا توجد أصناف في المخزن</p>}
                        <p className="inv-field__hint">{fullCountChanges} صنف فيه فرق عن رصيد النظام</p>
                      </div>
                    )}

                    <button
                      className="inv-btn inv-btn--primary inv-btn--block inv-btn--lg"
                      type="submit"
                      disabled={busy || !warehouseId || (countType === 'partial' ? (!countItem || countedQuantity === '') : !warehouseStock.length)}
                    >
                      حفظ الجرد وتسوية الفروقات
                    </button>
                  </>
                )}
              </form>

              <form className="inv-card inv-form" onSubmit={handleAdjustment}>
                <CardTitle Icon={SlidersIcon} tone="accent">تسوية يدوية</CardTitle>
                {!can.adjust ? <NoAccess action="تسوية المخزون" /> : (
                  <>
                    <Field label="الصنف">
                      <SelectControl
                        value={adjustment.variantId}
                        onChange={(event) => { setConfirmAdjustment(false); setAdjustment({ ...adjustment, variantId: event.target.value }); }}
                        required
                      >
                        <option value="">اختر صنفًا</option>
                        {warehouseStock.map((row) => <option key={row.variant_id} value={row.variant_id}>{itemOptionLabel(row, `الرصيد ${row.quantity}`)}</option>)}
                      </SelectControl>
                    </Field>
                    <Field label="الكمية">
                      <div className="inv-qty-dir">
                        <div className="inv-segmented inv-segmented--compact" role="radiogroup" aria-label="اتجاه التسوية">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={adjustment.direction === 1}
                            className={adjustment.direction === 1 ? 'is-active' : ''}
                            onClick={() => { setConfirmAdjustment(false); setAdjustment({ ...adjustment, direction: 1 }); }}
                          >
                            + إضافة
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={adjustment.direction === -1}
                            className={adjustment.direction === -1 ? 'is-active is-danger' : ''}
                            onClick={() => { setConfirmAdjustment(false); setAdjustment({ ...adjustment, direction: -1 }); }}
                          >
                            − خصم
                          </button>
                        </div>
                        <input
                          className="inv-input"
                          type="number"
                          min="1"
                          step="1"
                          placeholder="0"
                          value={adjustment.quantity}
                          onChange={(event) => { setConfirmAdjustment(false); setAdjustment({ ...adjustment, quantity: event.target.value }); }}
                          required
                        />
                      </div>
                    </Field>
                    {adjustmentItem && adjustment.direction < 0 && adjustmentQty > adjustmentItem.quantity && (
                      <p className="inv-field__error">الخصم أكبر من الرصيد الحالي ({adjustmentItem.quantity})</p>
                    )}
                    <div className="inv-field">
                      <span className="inv-field__label">سبب التسوية</span>
                      <div className="inv-reasons" role="radiogroup" aria-label="سبب التسوية">
                        {ADJUSTMENT_REASONS.map(([value, label]) => (
                          <button
                            type="button"
                            key={value}
                            role="radio"
                            aria-checked={adjustment.reason === value}
                            className={`inv-reason ${adjustment.reason === value ? 'is-active' : ''}`}
                            onClick={() => { setConfirmAdjustment(false); setAdjustment({ ...adjustment, reason: value }); }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Field label={adjustment.reason === 'other' ? 'اكتب السبب' : 'تفاصيل (اختياري)'}>
                      <input
                        className="inv-input"
                        placeholder={adjustment.reason === 'other' ? 'السبب مطلوب' : 'مثال: كرتونة اتكسرت في التفريغ'}
                        value={adjustment.notes}
                        maxLength={500}
                        onChange={(event) => setAdjustment({ ...adjustment, notes: event.target.value })}
                        required={adjustment.reason === 'other'}
                      />
                    </Field>
                    <button
                      className={`inv-btn inv-btn--block inv-btn--lg ${confirmAdjustment ? 'inv-btn--danger' : 'inv-btn--outline'}`}
                      type="submit"
                      disabled={busy || !adjustmentReady}
                    >
                      {confirmAdjustment && adjustmentItem
                        ? `تأكيد: ${adjustment.direction > 0 ? 'إضافة' : 'خصم'} ${adjustmentQty} — ${adjustmentItem.product_name}`
                        : 'تسجيل التسوية'}
                    </button>
                    <p className="inv-field__hint">كل تسوية تتسجل في حركة الأصناف باسمك وسببها، ولا يمكن تعديلها أو حذفها.</p>
                  </>
                )}
              </form>
            </div>
          )}

          {/* ---------- Movements ---------- */}
          {tab === 'movements' && (
            <div className="inv-card">
              <div className="inv-card__head inv-card__head--wrap">
                <h2 className="inv-card__title">
                  سجل حركة المخزون
                  <span className="inv-card__title-muted">— {selectedWarehouse?.name || ''}</span>
                </h2>
                <div className="inv-filters" role="group" aria-label="تصفية حسب نوع الحركة">
                  {MOVEMENT_FILTERS
                    .filter((filter) => !filter.optional || movementCounts[filter.key] > 0)
                    .map((filter) => (
                      <button
                        type="button"
                        key={filter.key}
                        aria-pressed={movementFilter === filter.key}
                        className={`inv-filter ${movementFilter === filter.key ? 'is-active' : ''}`}
                        onClick={() => setMovementFilter(filter.key)}
                      >
                        {filter.label} · {movementCounts[filter.key]}
                      </button>
                    ))}
                </div>
              </div>
              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead>
                    <tr><th>التاريخ</th><th>الصنف</th><th>نوع الحركة</th><th>التغيير</th><th>الرصيد بعدها</th><th>ملاحظات</th><th>المستخدم</th></tr>
                  </thead>
                  <tbody>
                    {visibleMovements.map((movement) => {
                      const date = parseDbDate(movement.created_at);
                      const change = Number(movement.quantity_change);
                      return (
                        <tr key={movement.id}>
                          <td>
                            <div className="inv-cell-date">
                              <strong>{date ? timeFormat.format(date) : '—'}</strong>
                              <span>{date ? formatDay(date) : ''}</span>
                            </div>
                          </td>
                          <td>
                            <div className="inv-cell-item">
                              <strong>{movement.product_name}{variantLabel(movement) ? ` — ${variantLabel(movement)}` : ''}</strong>
                              <span>{movement.sku || '—'}</span>
                            </div>
                          </td>
                          <td><span className={`inv-type inv-type--${movement.movement_type}`}>{MOVEMENT_LABELS[movement.movement_type] || movement.movement_type}</span></td>
                          <td className={`inv-num ${change < 0 ? 'is-negative' : 'is-positive'}`}>
                            <bdi dir="ltr">{change > 0 ? '+' : change < 0 ? '−' : ''}{Math.abs(change)}</bdi>
                          </td>
                          <td className="inv-num">{movement.quantity_after}</td>
                          <td className="inv-cell-notes">{movement.notes || '—'}</td>
                          <td>{movement.username || 'النظام'}</td>
                        </tr>
                      );
                    })}
                    {!visibleMovements.length && <tr><td colSpan="7" className="inv-empty">لا توجد حركات</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default InventoryManagementPage;
