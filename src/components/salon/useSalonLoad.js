import { useCallback, useEffect, useState } from 'react';

/**
 * Loads a tab's data and runs its actions with one shared error/notice state.
 * `loader` must be memoized (useCallback) by the caller: a new loader means "load again".
 * `run(action, notice)` awaits the action, reloads, and shows the notice or the error.
 */
export function useSalonLoad(loader) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
      setError('');
    } catch (err) {
      setError(err?.message || 'تعذر تحميل البيانات.');
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => { reload(); }, [reload]);

  async function run(action, successNotice) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      setNotice(successNotice);
      await reload();
      return result ?? true;
    } catch (err) {
      setError(err?.message || 'تعذر تنفيذ العملية.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { data, loading, busy, error, notice, setError, reload, run };
}
