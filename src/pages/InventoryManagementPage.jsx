import { useCallback, useEffect, useMemo, useState } from 'react';
import '../styles/inventory.css';

const TABS = [
  ['branches', 'الفروع'],
  ['warehouses', 'المخازن'],
  ['stock', 'المخزون وحد إعادة الطلب'],
  ['transfers', 'تحويل المخزون'],
  ['counts', 'الجرد والتسويات'],
  ['movements', 'حركة الأصناف'],
];

function InventoryManagementPage() {
  const [tab, setTab] = useState('branches');
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stock, setStock] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [centralConfig, setCentralConfig] = useState({ baseUrl: '', warehouseId: null });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '' });
  const [warehouseForm, setWarehouseForm] = useState({ name: '' });
  const [transferForm, setTransferForm] = useState({
    sourceWarehouseId: '', destinationWarehouseId: '', variantId: '', quantity: '1', notes: '',
  });
  const [adjustment, setAdjustment] = useState({ variantId: '', delta: '', notes: '' });
  const [countType, setCountType] = useState('partial');
  const [countVariantId, setCountVariantId] = useState('');
  const [countedQuantity, setCountedQuantity] = useState('');
  const [reorderLevels, setReorderLevels] = useState({});

  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === String(warehouseId));
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.is_active && warehouse.branch_active);
  const warehouseStock = stock.filter((row) => String(row.warehouse_id) === String(warehouseId));
  const filteredStock = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return warehouseStock.filter((row) => (!lowStockOnly || row.quantity <= row.reorder_level)
      && (!query || [
      row.product_name, row.sku, row.barcode, row.size, row.color,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(query))));
  }, [lowStockOnly, search, warehouseStock]);

  const loadData = useCallback(async (preferredWarehouseId = warehouseId) => {
    setLoading(true);
    setError('');
    try {
      const [branchList, warehouseList, transferList] = await Promise.all([
        window.electronAPI.getInventoryBranches(),
        window.electronAPI.getInventoryWarehouses(),
        window.electronAPI.getInventoryTransfers(),
      ]);
      setBranches(branchList);
      setWarehouses(warehouseList);
      setTransfers(transferList);

      const nextWarehouse = warehouseList.some((warehouse) => String(warehouse.id) === String(preferredWarehouseId)
        && warehouse.is_active && warehouse.branch_active)
        ? String(preferredWarehouseId)
        : String(warehouseList.find((warehouse) => warehouse.is_default && warehouse.is_active && warehouse.branch_active)?.id
          || warehouseList.find((warehouse) => warehouse.is_active && warehouse.branch_active)?.id
          || '');
      setWarehouseId(nextWarehouse);
      const activeWarehouse = warehouseList.find((warehouse) => String(warehouse.id) === nextWarehouse);
      setSelectedBranchId(String(activeWarehouse?.branch_id || branchList.find((branch) => branch.is_active)?.id || ''));

      if (nextWarehouse) {
        const [stockRows, movementRows] = await Promise.all([
          window.electronAPI.getInventoryStock(),
          window.electronAPI.getInventoryMovements({ warehouseId: Number(nextWarehouse), limit: 100 }),
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
    window.electronAPI.getCentralServerConfig()
      .then((config) => setCentralConfig(config))
      .catch((configError) => {
        console.error('تعذر قراءة إعداد الخادم المركزي:', configError);
      });
  }, []);

  async function submitAction(action, successMessage) {
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await loadData(warehouseId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'تعذر تنفيذ العملية');
    }
  }

  async function handleCreateBranch(event) {
    event.preventDefault();
    await submitAction(
      async () => {
        await window.electronAPI.createInventoryBranch(branchForm);
        setBranchForm({ name: '', address: '', phone: '' });
      },
      'تم إنشاء الفرع ومخزنه الرئيسي',
    );
  }

  async function handleCreateWarehouse(event) {
    event.preventDefault();
    await submitAction(async () => {
      await window.electronAPI.createInventoryWarehouse({
        branchId: Number(selectedBranchId),
        name: warehouseForm.name,
      });
      setWarehouseForm({ name: '' });
    }, 'تم إنشاء المخزن');
  }

  async function handleTransfer(event) {
    event.preventDefault();
    await submitAction(async () => {
      await window.electronAPI.transferInventoryStock({
        sourceWarehouseId: Number(transferForm.sourceWarehouseId),
        destinationWarehouseId: Number(transferForm.destinationWarehouseId),
        items: [{ variantId: Number(transferForm.variantId), quantity: Number(transferForm.quantity) }],
        notes: transferForm.notes,
      });
      setTransferForm((current) => ({ ...current, quantity: '1', notes: '' }));
    }, 'تم تحويل المخزون وتسجيل حركته');
  }

  async function handleAdjustment(event) {
    event.preventDefault();
    if (!warehouseId) return;
    await submitAction(async () => {
      await window.electronAPI.adjustInventoryStock({
        warehouseId: Number(warehouseId),
        variantId: Number(adjustment.variantId),
        delta: Number(adjustment.delta),
        notes: adjustment.notes,
      });
      setAdjustment({ variantId: '', delta: '', notes: '' });
    }, 'تم تسجيل تسوية المخزون');
  }

  async function handleCount(event) {
    event.preventDefault();
    if (!warehouseId) return;
    const countItems = countType === 'full'
      ? warehouseStock.map((row) => ({
          variantId: row.variant_id,
          countedQuantity: Number(reorderLevels[`count-${row.variant_id}`] ?? row.quantity),
        }))
      : [{ variantId: Number(countVariantId), countedQuantity: Number(countedQuantity) }];
    await submitAction(async () => {
      await window.electronAPI.countInventoryStock({
        warehouseId: Number(warehouseId),
        countType,
        items: countItems,
      });
      setCountVariantId('');
      setCountedQuantity('');
      setReorderLevels({});
    }, countType === 'full' ? 'اكتمل الجرد الكلي وتمت تسوية الفروقات' : 'اكتمل الجرد الجزئي وتمت التسوية');
  }

  async function handleSaveReorderLevel(row) {
    await submitAction(async () => {
      await window.electronAPI.setInventoryReorderLevel({
        warehouseId: row.warehouse_id,
        variantId: row.variant_id,
        reorderLevel: Number(reorderLevels[row.variant_id] ?? row.reorder_level),
      });
    }, 'تم تحديث حد إعادة الطلب');
  }

  const sourceWarehouseStock = stock.filter(
    (row) => String(row.warehouse_id) === String(transferForm.sourceWarehouseId),
  );

  return (
    <section className="inventory-admin-page" dir="rtl">
      <header className="inventory-admin-header">
        <div>
          <h1>إدارة الفروع والمخازن</h1>
          <p>إدارة مواقع التخزين، التحويلات، الجرد، التسويات وحدود إعادة الطلب.</p>
        </div>
        <button type="button" className="inventory-btn inventory-btn-secondary" onClick={() => loadData()}>
          تحديث البيانات
        </button>
      </header>

      {error && <p className="inventory-alert inventory-alert-error" role="alert">{error}</p>}
      {notice && <p className="inventory-alert inventory-alert-success" role="status">{notice}</p>}

      <div className="inventory-toolbar">
        <label>
          المخزن الحالي
          <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            {activeWarehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.branch_name} — {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <span className="inventory-location-summary">
          {selectedWarehouse ? `${selectedWarehouse.branch_name} / ${selectedWarehouse.name}` : 'لا توجد مخازن نشطة'}
        </span>
        {centralConfig.baseUrl && selectedWarehouse && (
          <button
            type="button"
            className="inventory-btn inventory-btn-primary"
            onClick={() => submitAction(
              async () => {
                const config = await window.electronAPI.setCentralWarehouse(selectedWarehouse.id);
                setCentralConfig(config);
              },
              'تم تخصيص المخزن لجهاز هذا الفرع. ستُرفض المبيعات إذا انقطع الاتصال بالخادم المركزي.',
            )}
          >
            استخدامه كمخزن لجهاز الفرع
          </button>
        )}
      </div>
      {centralConfig.baseUrl && !centralConfig.warehouseId && (
        <p className="inventory-alert inventory-alert-error" role="status">
          لم يتم تخصيص مخزن لهذا الجهاز. اختر المخزن ثم اضغط «استخدامه كمخزن لجهاز الفرع» قبل بدء البيع.
        </p>
      )}

      <nav className="inventory-tabs" aria-label="إدارة المخزون">
        {TABS.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={tab === key ? 'active' : ''}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? <p className="inventory-empty">جاري تحميل بيانات المخزون...</p> : (
        <>
          {tab === 'branches' && (
            <div className="inventory-panel-grid">
              <form className="inventory-panel" onSubmit={handleCreateBranch}>
                <h2>إضافة فرع</h2>
                <label>اسم الفرع<input value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} required /></label>
                <label>العنوان<input value={branchForm.address} onChange={(event) => setBranchForm({ ...branchForm, address: event.target.value })} /></label>
                <label>الهاتف<input value={branchForm.phone} onChange={(event) => setBranchForm({ ...branchForm, phone: event.target.value })} /></label>
                <button className="inventory-btn inventory-btn-primary" type="submit">إضافة الفرع</button>
              </form>
              <div className="inventory-panel">
                <h2>الفروع المسجلة</h2>
                {branches.map((branch) => (
                  <div className="inventory-list-row" key={branch.id}>
                    <strong>{branch.name}</strong>
                    <span>{branch.warehouse_count} مخزن</span>
                    <span className={branch.is_active ? 'inventory-status-active' : 'inventory-status-inactive'}>
                      {branch.is_active ? 'نشط' : 'متوقف'}
                    </span>
                    <button
                      type="button"
                      className="inventory-btn inventory-btn-secondary"
                      onClick={() => submitAction(
                        () => window.electronAPI.updateInventoryBranch(branch.id, { ...branch, isActive: !branch.is_active }),
                        branch.is_active ? 'تم إيقاف الفرع' : 'تم تفعيل الفرع',
                      )}
                    >
                      {branch.is_active ? 'إيقاف' : 'تفعيل'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'warehouses' && (
            <div className="inventory-panel-grid">
              <form className="inventory-panel" onSubmit={handleCreateWarehouse}>
                <h2>إضافة مخزن</h2>
                <label>الفرع
                  <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} required>
                    {branches.filter((branch) => branch.is_active).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </label>
                <label>اسم المخزن<input value={warehouseForm.name} onChange={(event) => setWarehouseForm({ name: event.target.value })} required /></label>
                <button className="inventory-btn inventory-btn-primary" type="submit">إضافة المخزن</button>
              </form>
              <div className="inventory-panel">
                <h2>المخازن</h2>
                {warehouses.map((warehouse) => (
                  <div className="inventory-list-row" key={warehouse.id}>
                    <strong>{warehouse.branch_name} — {warehouse.name}</strong>
                    <span>{warehouse.total_quantity} قطعة</span>
                    {warehouse.is_default ? <span className="inventory-tag">افتراضي</span> : null}
                    {!warehouse.is_active && <span className="inventory-status-inactive">متوقف</span>}
                    <button
                      type="button"
                      className="inventory-btn inventory-btn-secondary"
                      onClick={() => submitAction(
                        () => window.electronAPI.updateInventoryWarehouse(warehouse.id, {
                          name: warehouse.name,
                          isActive: !warehouse.is_active,
                          isDefault: Boolean(warehouse.is_default),
                        }),
                        warehouse.is_active ? 'تم إيقاف المخزن' : 'تم تفعيل المخزن',
                      )}
                    >
                      {warehouse.is_active ? 'إيقاف' : 'تفعيل'}
                    </button>
                    {warehouse.is_active && !warehouse.is_default && (
                      <button
                        type="button"
                        className="inventory-btn inventory-btn-secondary"
                        onClick={() => submitAction(
                          () => window.electronAPI.updateInventoryWarehouse(warehouse.id, {
                            name: warehouse.name,
                            isActive: true,
                            isDefault: true,
                          }),
                          'تم تعيين المخزن الافتراضي للفرع',
                        )}
                      >
                        تعيين كافتراضي
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'stock' && (
            <div className="inventory-panel">
              <div className="inventory-panel-heading">
                <h2>أرصدة المخزن وحد إعادة الطلب</h2>
                <label className="inventory-checkbox"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} /> النواقص فقط</label>
              </div>
              <input className="inventory-search" placeholder="ابحث عن صنف أو SKU أو باركود" value={search} onChange={(event) => setSearch(event.target.value)} />
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead><tr><th>الصنف</th><th>المتغير / SKU</th><th>الكمية</th><th>حد إعادة الطلب</th><th>الحالة</th><th>تحديث الحد</th></tr></thead>
                  <tbody>
                    {filteredStock.map((row) => (
                      <tr key={`${row.warehouse_id}-${row.variant_id}`}>
                        <td>{row.product_name}</td>
                        <td>{[row.size, row.color, row.sku].filter(Boolean).join(' / ') || '—'}</td>
                        <td>{row.quantity}</td>
                        <td>{row.reorder_level}</td>
                        <td>{row.quantity <= row.reorder_level ? <span className="inventory-status-low">إعادة طلب</span> : 'متوفر'}</td>
                        <td className="inventory-inline-control">
                          <input
                            type="number" min="0"
                            aria-label={`حد إعادة الطلب لـ ${row.product_name}`}
                            value={reorderLevels[row.variant_id] ?? row.reorder_level}
                            onChange={(event) => setReorderLevels({ ...reorderLevels, [row.variant_id]: event.target.value })}
                          />
                          <button className="inventory-btn inventory-btn-secondary" type="button" onClick={() => handleSaveReorderLevel(row)}>حفظ</button>
                        </td>
                      </tr>
                    ))}
                    {!filteredStock.length && <tr><td colSpan="6" className="inventory-empty">لا توجد أصناف في المخزن</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'transfers' && (
            <div className="inventory-panel">
              <h2>تحويل أصناف بين المخازن</h2>
              <form className="inventory-form-grid" onSubmit={handleTransfer}>
                <label>من مخزن<select value={transferForm.sourceWarehouseId} onChange={(event) => setTransferForm({ ...transferForm, sourceWarehouseId: event.target.value, variantId: '' })} required>
                  <option value="">اختر المصدر</option>
                  {activeWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.branch_name} — {warehouse.name}</option>)}
                </select></label>
                <label>إلى مخزن<select value={transferForm.destinationWarehouseId} onChange={(event) => setTransferForm({ ...transferForm, destinationWarehouseId: event.target.value })} required>
                  <option value="">اختر المستلم</option>
                  {activeWarehouses.filter((warehouse) => String(warehouse.id) !== String(transferForm.sourceWarehouseId)).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.branch_name} — {warehouse.name}</option>)}
                </select></label>
                <label>الصنف<select value={transferForm.variantId} onChange={(event) => setTransferForm({ ...transferForm, variantId: event.target.value })} required>
                  <option value="">اختر صنفًا</option>
                  {sourceWarehouseStock.filter((row) => row.quantity > 0).map((row) => <option key={row.variant_id} value={row.variant_id}>{row.product_name} — {row.size || row.color || row.sku} (متاح {row.quantity})</option>)}
                </select></label>
                <label>الكمية<input type="number" min="1" value={transferForm.quantity} onChange={(event) => setTransferForm({ ...transferForm, quantity: event.target.value })} required /></label>
                <label className="inventory-wide">ملاحظات<input value={transferForm.notes} onChange={(event) => setTransferForm({ ...transferForm, notes: event.target.value })} /></label>
                <button className="inventory-btn inventory-btn-primary" type="submit">تنفيذ التحويل</button>
              </form>
              <h3>سجل التحويلات</h3>
              <div className="inventory-table-wrap"><table className="inventory-table">
                <thead><tr><th>رقم</th><th>من</th><th>إلى</th><th>أصناف</th><th>قطع</th><th>التاريخ</th></tr></thead>
                <tbody>{transfers.map((transfer) => <tr key={transfer.id}><td>#{transfer.id}</td><td>{transfer.source_branch_name} / {transfer.source_warehouse_name}</td><td>{transfer.destination_branch_name} / {transfer.destination_warehouse_name}</td><td>{transfer.item_count}</td><td>{transfer.total_units}</td><td>{transfer.created_at}</td></tr>)}</tbody>
              </table></div>
            </div>
          )}

          {tab === 'counts' && (
            <div className="inventory-panel">
              <h2>الجرد والتسويات</h2>
              <form onSubmit={handleCount} className="inventory-form-grid">
                <label>نوع الجرد<select value={countType} onChange={(event) => setCountType(event.target.value)}>
                  <option value="partial">جرد جزئي</option>
                  <option value="full">جرد كلي</option>
                </select></label>
                {countType === 'partial' && <>
                  <label>الصنف<select value={countVariantId} onChange={(event) => setCountVariantId(event.target.value)} required>
                    <option value="">اختر صنفًا</option>
                    {warehouseStock.map((row) => <option key={row.variant_id} value={row.variant_id}>{row.product_name} — {row.size || row.color || row.sku} (دفتر: {row.quantity})</option>)}
                  </select></label>
                  <label>الكمية الفعلية<input type="number" min="0" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} required /></label>
                </>}
                {countType === 'full' && (
                  <div className="inventory-wide inventory-count-list">
                    {warehouseStock.map((row) => <label key={row.variant_id}>{row.product_name} — {row.size || row.color || row.sku} (دفتر: {row.quantity})
                      <input type="number" min="0" value={reorderLevels[`count-${row.variant_id}`] ?? row.quantity} onChange={(event) => setReorderLevels({ ...reorderLevels, [`count-${row.variant_id}`]: event.target.value })} />
                    </label>)}
                  </div>
                )}
                <button className="inventory-btn inventory-btn-primary" type="submit">حفظ الجرد وتسوية الفروقات</button>
              </form>
              <hr />
              <h3>تسوية يدوية</h3>
              <form className="inventory-form-grid" onSubmit={handleAdjustment}>
                <label>الصنف<select value={adjustment.variantId} onChange={(event) => setAdjustment({ ...adjustment, variantId: event.target.value })} required>
                  <option value="">اختر صنفًا</option>
                  {warehouseStock.map((row) => <option key={row.variant_id} value={row.variant_id}>{row.product_name} — {row.size || row.color || row.sku} (الرصيد {row.quantity})</option>)}
                </select></label>
                <label>التغيير (+ إضافة / − خصم)<input type="number" step="1" value={adjustment.delta} onChange={(event) => setAdjustment({ ...adjustment, delta: event.target.value })} required /></label>
                <label className="inventory-wide">سبب التسوية<input value={adjustment.notes} onChange={(event) => setAdjustment({ ...adjustment, notes: event.target.value })} required /></label>
                <button className="inventory-btn inventory-btn-secondary" type="submit">تسجيل التسوية</button>
              </form>
            </div>
          )}

          {tab === 'movements' && (
            <div className="inventory-panel">
              <h2>سجل حركة المخزون — {selectedWarehouse?.name || ''}</h2>
              <div className="inventory-table-wrap"><table className="inventory-table">
                <thead><tr><th>التاريخ</th><th>الصنف</th><th>نوع الحركة</th><th>التغيير</th><th>الرصيد بعدها</th><th>ملاحظات</th><th>المستخدم</th></tr></thead>
                <tbody>{movements.map((movement) => <tr key={movement.id}>
                  <td>{movement.created_at}</td>
                  <td>{movement.product_name} — {movement.size || movement.color || movement.sku}</td>
                  <td>{movement.movement_type}</td>
                  <td className={movement.quantity_change < 0 ? 'inventory-negative' : 'inventory-positive'}>{movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change}</td>
                  <td>{movement.quantity_after}</td><td>{movement.notes || '—'}</td><td>{movement.username || 'النظام'}</td>
                </tr>)}</tbody>
              </table></div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default InventoryManagementPage;
