import React, { useState } from 'react';
import { playSuccessBeep, playErrorBeep } from '../utils/beep';
import { normalizeErrorMessage } from '../utils/normalizeError';
import * as importExportApi from '../api/importExport.js';

export default function ImportExcelModal({ isOpen, onClose, type, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  // الحصول على مسار الملف
  const handleSelectFile = async () => {
    try {
      const selected = await importExportApi.selectImportFile();
      if (selected) setFilePath(selected);
    } catch (err) {
      console.error(err);
      setError('فشل اختيار الملف');
    }
  };

  // تحميل القالب الفارغ
  const handleDownloadTemplate = async () => {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      const res = await importExportApi.downloadImportTemplate(type);
      if (res.success) {
        setMessage(res.message);
        playSuccessBeep();
      }
    } catch (err) {
      setError(normalizeErrorMessage(err) || 'فشل تحميل القالب');
      playErrorBeep();
    } finally {
      setLoading(false);
    }
  };

  // رفع البيانات
  const handleImport = async () => {
    if (!filePath) {
      setError('الرجاء اختيار ملف إكسل أولاً');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      
      const res = await importExportApi.importExcel({ filePath, type });
      
      if (res.success) {
        setMessage(res.message);
        playSuccessBeep();
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      setError(normalizeErrorMessage(err) || 'فشل استيراد البيانات. تأكد من تطابق الأعمدة مع القالب.');
      playErrorBeep();
    } finally {
      setLoading(false);
    }
  };

  // ترجمة النوع للعرض
  const getTypeName = () => {
    if (type === 'products') return 'المنتجات';
    if (type === 'customers') return 'العملاء';
    if (type === 'suppliers') return 'الموردين';
    return '';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>استيراد {getTypeName()} من إكسل 📊</h2>
          <button className="modal-close-btn" onClick={onClose} disabled={loading}>&times;</button>
        </div>
        
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: '16px', color: '#64748b' }}>
            يمكنك رفع آلاف البيانات بضغطة زر. يرجى استخدام القالب الخاص بالبرنامج لضمان نجاح العملية.
          </p>

          <button 
            className="btn btn-secondary" 
            onClick={handleDownloadTemplate} 
            disabled={loading}
            style={{ width: '100%', marginBottom: '20px' }}
          >
            📥 تحميل قالب الإكسل الفارغ
          </button>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
            <input 
              type="text" 
              className="form-input" 
              readOnly 
              value={filePath} 
              placeholder="لم يتم اختيار ملف..." 
              style={{ flex: 1, direction: 'ltr' }}
            />
            <button className="btn btn-primary" onClick={handleSelectFile} disabled={loading}>
              📂 اختيار ملف
            </button>
          </div>

          {loading && <div className="form-info-banner">⏳ جاري المعالجة... قد يستغرق ذلك بضع ثوانٍ</div>}
          
          {message && (
            <div className="form-success-banner">
              {message.split('\n').map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}

          {error && (
            <div className="form-error-banner">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            إغلاق
          </button>
          <button className="btn btn-primary" onClick={handleImport} disabled={loading || !filePath}>
            🚀 بدء الاستيراد
          </button>
        </div>
      </div>
    </div>
  );
}
