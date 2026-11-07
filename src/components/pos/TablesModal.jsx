import { useCallback, useEffect, useState } from 'react';
import * as tablesApi from '../../api/tables.js';
import { CloseIcon, PlusIcon, TrashIcon } from '../icons/PosIcons.jsx';

/**
 * Floor view: every table, free or busy with its running total. Picking a
 * table opens (or resumes) its check. Owners can add and remove free tables.
 */
export default function TablesModal({ isOpen, onClose, onSelectTable, canManage }) {
  const [tables, setTables] = useState([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action) => {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (Array.isArray(result)) setTables(result);
      return result;
    } catch (actionError) {
      setError(actionError?.message || 'تعذر تنفيذ العملية');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) run(() => tablesApi.getTables());
  }, [isOpen, run]);

  if (!isOpen) return null;

  async function handleAdd(event) {
    event.preventDefault();
    const result = await run(() => tablesApi.addTable(newName));
    if (result) setNewName('');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="held-orders-modal pos-tables-modal" role="dialog" aria-label="الطاولات" onClick={(e) => e.stopPropagation()}>
        <div className="held-modal-header">
          <div className="held-title-row">
            <h3>الطاولات</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="إغلاق">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="held-modal-body">
          {error && <p className="pos-tables-error" role="alert">{error}</p>}

          {tables.length === 0 ? (
            <div className="held-empty-state">
              <p>{canManage ? 'مفيش طاولات لسه. أضف أول طاولة من تحت.' : 'مفيش طاولات لسه. اطلب من المدير يضيفها.'}</p>
            </div>
          ) : (
            <div className="pos-tables-grid">
              {tables.map((table) => {
                const isBusy = Boolean(table.tab_id);
                return (
                  <div key={table.id} className={`pos-table-card${isBusy ? ' is-busy' : ''}`}>
                    <button
                      type="button"
                      className="pos-table-card__open"
                      disabled={busy}
                      onClick={() => onSelectTable(table)}
                    >
                      <span className="pos-table-card__name">{table.name}</span>
                      <span className="pos-table-card__state">
                        {isBusy ? `${Number(table.tab_total).toFixed(2)} ج.م` : 'فاضية'}
                      </span>
                    </button>
                    {canManage && !isBusy && (
                      <button
                        type="button"
                        className="pos-table-card__remove"
                        disabled={busy}
                        aria-label={`حذف ${table.name}`}
                        onClick={() => run(() => tablesApi.removeTable(table.id))}
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canManage && (
            <form className="pos-tables-add" onSubmit={handleAdd}>
              <input
                className="pos-tables-add__input"
                value={newName}
                maxLength={40}
                placeholder="اسم الطاولة (اختياري)"
                aria-label="اسم الطاولة"
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" className="pos-topbar-btn" disabled={busy}>
                <PlusIcon size={18} />
                <span>إضافة طاولة</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
