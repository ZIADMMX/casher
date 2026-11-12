// بناء مستند الفاتورة الإلكترونية بصيغة مصلحة الضرائب (Document JSON v1.0)
// وتسلسله (Serialization) بالخوارزمية المعتمدة قبل التوقيع.
//
// افتراض أساسي: أسعار البيع في النظام **شاملة** ضريبة القيمة المضافة (سعر الرف
// المصري)، فبنفصل الصافي والضريبة من الإجمالي. لو المنشأة غير مسجلة بالقيمة
// المضافة تُضبط النسبة على 0 فيخرج المستند بغير ضرائب.

const VAT_TAX_TYPE = 'T1';
const VAT_SUB_TYPE = 'V009'; // النسبة العامة لضريبة القيمة المضافة
const SERVICE_CHARGE_CODE_SUFFIX = 'SERVICE';

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function toEtaDateTime(value) {
  if (!value) return `${new Date().toISOString().slice(0, 19)}Z`;

  // تواريخ SQLite بتيجي "YYYY-MM-DD HH:MM:SS" بتوقيت UTC من غير علامة منطقة،
  // فبنضيف Z. لكن لو التاريخ جاي ومعاه منطقة زمنية بالفعل (+02:00) إضافة Z
  // بتبوّظه، فبنفحص الأول.
  const raw = String(value).trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const date = new Date(raw.replace(' ', 'T') + (hasZone ? '' : 'Z'));

  // ما نخمّنش تاريخ: مستند ضريبي بتاريخ النهارده بدل تاريخ الفاتورة أسوأ بكتير
  // من مستند ما اتبعتش، والتسجيل بيتوقف ويظهر الخطأ بدل ما يعدّي بالغلط.
  if (Number.isNaN(date.getTime())) throw new Error(`تاريخ الفاتورة غير صالح: ${raw}`);

  return `${date.toISOString().slice(0, 19)}Z`;
}

/**
 * التسلسل المعتمد من المصلحة: اسم كل خاصية بحروف كبيرة بين علامتي تنصيص، يليه
 * القيمة. المصفوفة بتكرر اسم الخاصية قبل كل عنصر. القيم كلها نصوص مقتبسة.
 */
function serialize(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) throw new Error('المصفوفة تُسلسل من خلال اسم خاصيتها');
  if (typeof value !== 'object') return JSON.stringify(String(value));

  let out = '';
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) continue;
    const name = `"${key.toUpperCase()}"`;
    if (Array.isArray(item)) {
      for (const element of item) out += name + serialize(element);
    } else {
      out += name + serialize(item);
    }
  }
  return out;
}

function buildAddress(address) {
  return {
    country: address.country || 'EG',
    governate: address.governate,
    regionCity: address.regionCity,
    street: address.street,
    buildingNumber: address.buildingNumber,
  };
}

function lineDescription(item) {
  const parts = [item.productName || item.title || 'صنف', item.size, item.color].filter(Boolean);
  return parts.join(' ').trim() || 'صنف';
}

/**
 * يحوّل بنود الفاتورة (أسعار شاملة الضريبة) لبنود المستند.
 * @returns {{lines: object[], taxTotal: number}}
 */
function buildLines(grossLines, rate) {
  const factor = 1 + rate / 100;
  return grossLines.map((line) => {
    const quantity = Number(line.quantity) || 0;
    const salesTotal = round(line.gross / factor);
    const discountAmount = round(line.discountGross / factor);
    const netTotal = round(salesTotal - discountAmount);
    const tax = round(netTotal * rate / 100);
    const taxableItems = rate > 0
      ? [{ taxType: VAT_TAX_TYPE, amount: tax, subType: VAT_SUB_TYPE, rate }]
      : [];

    return {
      description: line.description,
      itemType: line.itemType,
      itemCode: line.itemCode,
      unitType: 'EA',
      quantity,
      internalCode: line.internalCode,
      salesTotal,
      total: round(netTotal + tax),
      valueDifference: 0,
      totalTaxableFees: 0,
      netTotal,
      itemsDiscount: 0,
      unitValue: {
        currencySold: 'EGP',
        amountEGP: quantity > 0 ? round(salesTotal / quantity, 5) : 0,
      },
      discount: { rate: 0, amount: discountAmount },
      taxableItems,
    };
  });
}

/**
 * يحضّر بنود المبيعة بأسعارها الشاملة بعد توزيع خصم الفاتورة وإضافة بند الخدمة.
 * مشترك بين الفاتورة الإلكترونية والإيصال الإلكتروني: الحساب واحد، والشكل مختلف.
 * @returns {{grossLines: object[], rate: number}}
 */
function prepareGrossLines(sale, config) {
  if (!sale || !Array.isArray(sale.items) || sale.items.length === 0) {
    throw new Error('لا يمكن إصدار مستند إلكتروني بغير أصناف');
  }

  const rate = Number(config.vatRate) || 0;
  const serviceCharge = Number(sale.service_charge) || 0;
  const invoiceDiscount = Number(sale.discount) || 0;
  const itemsGross = sale.items.map((item) => round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)));
  const itemsGrossTotal = round(itemsGross.reduce((sum, value) => sum + value, 0));

  // الخصم على مستوى الفاتورة يتوزع على البنود بالتناسب (المصلحة بتحاسب على
  // صافي كل بند، فما ينفعش يتسجل خصم عائم).
  const grossLines = sale.items.map((item, index) => {
    const gross = itemsGross[index];
    const share = itemsGrossTotal > 0 ? gross / itemsGrossTotal : 0;
    return {
      description: lineDescription(item),
      itemType: config.itemCodeType,
      itemCode: item.eta_item_code || config.defaultItemCode,
      internalCode: String(item.sku || item.variant_id || item.variantId || index + 1),
      quantity: Number(item.quantity) || 0,
      gross,
      discountGross: round(invoiceDiscount * share),
    };
  });

  // فروق التقريب في توزيع الخصم تتحمّلها آخر بند.
  const distributed = round(grossLines.reduce((sum, line) => sum + line.discountGross, 0));
  if (grossLines.length > 0 && distributed !== round(invoiceDiscount)) {
    const last = grossLines[grossLines.length - 1];
    last.discountGross = round(last.discountGross + (round(invoiceDiscount) - distributed));
  }

  if (serviceCharge > 0) {
    grossLines.push({
      description: sale.order_mode === 'delivery' ? 'رسوم التوصيل' : 'خدمة الصالة',
      itemType: config.itemCodeType,
      itemCode: config.defaultItemCode,
      internalCode: `${sale.id}-${SERVICE_CHARGE_CODE_SUFFIX}`,
      quantity: 1,
      gross: round(serviceCharge),
      discountGross: 0,
    });
  }

  return { grossLines, rate };
}

/**
 * يبني مستند فاتورة من عملية بيع.
 * @param {object} sale صف المبيعة ومعاه items (من sales.repository.getById)
 * @param {object} config إعدادات المنظومة (einvoice/config.js)
 * @param {object} [options]
 * @param {'I'|'C'} [options.documentType] I فاتورة · C إشعار خصم (مرتجع)
 * @param {string[]|null} [options.references] uuid الفاتورة الأصلية عند المصلحة (لإشعار الخصم)
 */
function buildInvoiceDocument(sale, config, { documentType = 'I', references = null } = {}) {
  const { grossLines, rate } = prepareGrossLines(sale, config);
  const lines = buildLines(grossLines, rate);

  const totalSalesAmount = round(lines.reduce((sum, line) => sum + line.salesTotal, 0));
  const totalDiscountAmount = round(lines.reduce((sum, line) => sum + line.discount.amount, 0));
  const netAmount = round(totalSalesAmount - totalDiscountAmount);
  let taxTotal = round(lines.reduce(
    (sum, line) => sum + (line.taxableItems[0]?.amount || 0), 0
  ));

  // الإجمالي لازم يطابق الفاتورة الورقية بالقرش، فأي فرق تقريب يترحّل على ضريبة آخر بند.
  const expectedTotal = round(Number(sale.total_amount) || 0);
  const drift = round(expectedTotal - round(netAmount + taxTotal));
  if (drift !== 0 && lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last.taxableItems.length > 0) {
      last.taxableItems[0].amount = round(last.taxableItems[0].amount + drift);
      last.total = round(last.total + drift);
      taxTotal = round(taxTotal + drift);
    }
  }

  const receiverName = (sale.customer_name || '').trim() || 'مستهلك نهائي';

  const document = {
    issuer: {
      address: { ...buildAddress(config.address), branchID: config.branchId },
      type: 'B',
      id: config.taxNumber,
      name: config.issuerName,
    },
    // shortcut: المشتري بياخد عنوان المحل لأن الكاشير ما بيسألش المستهلك على
    // عنوانه. لما يتعمل بيع للشركات (receiver.type = 'B') لازم عنوان المشتري
    // ورقمه الضريبي الحقيقيين، وساعتها ده بيتاخد من بيانات العميل مش من الإعدادات.
    receiver: {
      address: buildAddress(config.address),
      type: 'P',
      name: receiverName,
    },
    documentType,
    documentTypeVersion: '1.0',
    dateTimeIssued: toEtaDateTime(sale.created_at),
    taxpayerActivityCode: config.activityCode,
    internalID: sale.invoice_number || `INV-${sale.id}`,
    invoiceLines: lines,
    totalDiscountAmount,
    totalSalesAmount,
    netAmount,
    taxTotals: rate > 0 ? [{ taxType: VAT_TAX_TYPE, amount: taxTotal }] : [],
    totalAmount: round(netAmount + taxTotal),
    extraDiscountAmount: 0,
    totalItemsDiscountAmount: 0,
  };

  // إشعار الخصم لازم يشاور على الفاتورة الأصلية، وإلا المصلحة بترفضه.
  if (references && references.length > 0) document.references = references;

  return document;
}

module.exports = {
  buildInvoiceDocument,
  prepareGrossLines,
  serialize,
  toEtaDateTime,
  round,
  VAT_TAX_TYPE,
  VAT_SUB_TYPE,
};
