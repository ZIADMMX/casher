// عرض نص قانوني مقسّم بنود (سياسة الخصوصية، عقد الاستخدام). النصوص نفسها في
// shared/*.json، والقيم بين {{ }} بتتملى من بيانات المحل أو المورّد.

export function fillPlaceholders(text, values) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  ));
}

/** HTML صفحة مستقلة للطباعة (نافذة الطباعة مالهاش ستايلات التطبيق). */
export function legalDocumentHtml({ title, subtitle, sections, values, footer = '' }) {
  const body = sections
    .map((section) => `<h2>${section.heading}</h2>${section.body
      .map((line) => `<p>${fillPlaceholders(line, values)}</p>`).join('')}`)
    .join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <title>${title}</title>
    <style>body{font-family:'Segoe UI',Tahoma,sans-serif;line-height:1.9;padding:32px;max-width:760px;margin:auto}
    h1{font-size:22px}h2{font-size:16px;margin-top:22px}p{margin:6px 0}
    .box{border:1px solid #888;padding:12px;margin-top:24px}</style></head>
    <body><h1>${title}</h1><p><small>${subtitle}</small></p>${body}${footer}</body></html>`;
}

export function printLegalDocument(document_) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(legalDocumentHtml(document_));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export default function LegalDocumentText({ sections, values, style }) {
  return (
    <div style={{ fontSize: '13px', lineHeight: 1.9, color: '#334155', ...style }}>
      {sections.map((section) => (
        <section key={section.heading} style={{ marginBottom: '14px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B', margin: '0 0 4px 0' }}>
            {section.heading}
          </h4>
          {section.body.map((line) => (
            <p key={line} style={{ margin: '4px 0' }}>{fillPlaceholders(line, values)}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
