import { useEffect, useRef } from 'react';

// إعدادات وقت المسح
const MAX_AVG_INTERVAL_MS = 65; // أقصى متوسط وقت بين الأحرف لتمييز القارئ عن الكيبورد العادي
const SCAN_RESET_TIMEOUT_MS = 200; // مسح الذاكرة المؤقتة لو توقف الإدخال
const MAX_TOTAL_SCAN_TIME_MS = 1500; // أقصى مدة إجمالية لمسح كود كامل

/**
 * دالة مساعدة لتحويل الأرقام العربية الهندية والشرقية إلى أرقام إنجليزية قياسية
 */
export function normalizeBarcodeText(raw) {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

/**
 * هوك مخصص للتكامل مع قارئ الباركود (HID Keyboard Emulation)
 * @param {Function} onScan دالة الاستدعاء عند مسح باركود صحيح
 * @param {Object} options خيارات التخصيص
 */
function useBarcodeScanner(onScan, options = {}) {
  const {
    enabled = true,
    minChars = 2,
    clearActiveInputOnScan = true,
  } = options;

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const bufferRef = useRef([]); // مصفوفة لتخزين { key, time }
  const resetTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled || typeof onScanRef.current !== 'function') return;

    function handleKeyDown(e) {
      // تجاهل أزرار التعديل المستقلة
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      const now = Date.now();
      const activeEl = document.activeElement;
      const isSearchInput = activeEl && (activeEl.id === 'barcode-search-input' || activeEl.classList?.contains('pos-search-input'));
      const isInputField = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      // عند وصول زر إنهاء القراءة (Enter أو Tab)
      if (e.key === 'Enter' || e.key === 'Tab') {
        const buffer = bufferRef.current;
        if (buffer.length >= minChars) {
          const firstTime = buffer[0].time;
          const lastTime = buffer[buffer.length - 1].time;
          const totalDuration = lastTime - firstTime;
          const avgInterval = buffer.length > 1 ? totalDuration / (buffer.length - 1) : 0;

          // هل الإدخال بالسرعة النموذجية لقارئ الباركود؟
          // أو هل هو كود تم إدخاله في حقل البحث وضغط Enter؟
          const isFastScanner = (avgInterval <= MAX_AVG_INTERVAL_MS && totalDuration <= MAX_TOTAL_SCAN_TIME_MS);
          const isScannerOrSearch = isFastScanner || isSearchInput;

          if (isScannerOrSearch) {
            e.preventDefault();
            e.stopPropagation();

            const code = buffer.map((item) => item.key).join('');
            const cleanCode = normalizeBarcodeText(code);

            // تفريغ حقل الإدخال إذا كان التركيز فيه لمنع بقاء الأرقام فيه
            if (isInputField && clearActiveInputOnScan) {
              activeEl.value = '';
              activeEl.dispatchEvent(new Event('input', { bubbles: true }));
              activeEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (cleanCode) {
              onScanRef.current(cleanCode);
            }

            bufferRef.current = [];
            clearTimeout(resetTimerRef.current);
            return;
          }
        }

        // لو لم يكن باركود
        bufferRef.current = [];
        return;
      }

      // تسجيل الأحرف العادية
      if (e.key.length === 1) {
        // تصفير البافر لو مر وقت طويل منذ آخر حرف (كتابة يدوية بطيئة)
        const lastItem = bufferRef.current[bufferRef.current.length - 1];
        if (lastItem && (now - lastItem.time > SCAN_RESET_TIMEOUT_MS)) {
          bufferRef.current = [];
        }

        bufferRef.current.push({ key: e.key, time: now });

        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          bufferRef.current = [];
        }, SCAN_RESET_TIMEOUT_MS);
      }
    }

    // الاستماع في مرحلة Capture لضمان التقاط المفاتيح قبل أي معالجات فرعية
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      clearTimeout(resetTimerRef.current);
    };
  }, [enabled, minChars, clearActiveInputOnScan]);
}

export default useBarcodeScanner;