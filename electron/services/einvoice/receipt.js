// الإيصال الإلكتروني (e-Receipt) — منظومة منفصلة عن الفاتورة الإلكترونية،
// وهي اللي بتخص الكاشير ومحلات التجزئة (بيع للمستهلك النهائي).
//
// الفروق الجوهرية عن الفاتورة، وكلها متعملة هنا:
//  1. شكل المستند مختلف (header / seller / buyer / itemData بدل issuer / invoiceLines).
//  2. كل إيصال له `uuid` = SHA-256 لنصه المسلسل، و`previousUUID` بيربطه بالإيصال
//     اللي قبله من نفس نقطة البيع — سلسلة ما ينفعش يحصل فيها قطع ولا ترتيب غلط.
//  3. الإيصالات بتتبعت **دفعات** مش واحد واحد.
//
// shortcut: نقطة بيع واحدة لكل تثبيت (سلسلة UUID واحدة). لما يبقى فيه أكتر من
// كاشير على نفس القاعدة، السلسلة لازم تتقسم بـ deviceSerialNumber لكل جهاز.
const { createHash } = require('node:crypto');
const { prepareGrossLines, serialize, toEtaDateTime, round, VAT_TAX_TYPE, VAT_SUB_TYPE } = require('./document');

const RECEIPT_TYPE_VERSION = '1.2';


// أكواد طرق الدفع في منظومة الإيصال: نقدي / بطاقة / غير ذلك (الآجل بيتسجل «أخرى»).
const PAYMENT_METHODS = { cash: 'C', card: 'V', credit: 'O' };

function buildSeller(config) {
  return {
    rin: config.taxNumber,
    companyTradeName: config.issuerName,
    branchCode: config.branchId,
    branchAddress: {
      country: config.address.country || 'EG',
      governate: config.address.governate,
      regionCity: config.address.regionCity,
      street: config.address.street,
      buildingNumber: config.address.buildingNumber,
    },
    deviceSerialNumber: config.deviceSerial,
    activityCode: config.activityCode,
  };
}

function buildItems(grossLines, rate) {
  const factor = 1 + rate / 100;
  return grossLines.map((line) => {
    const quantity = Number(line.quantity) || 0;
    const totalSale = round(line.gross / factor);
    const discount = round(line.discountGross / factor);
    const netSale = round(totalSale - discount);
    const tax = round(netSale * rate / 100);

    return {
      internalCode: line.internalCode,
      description: line.description,
      itemType: line.itemType,
      itemCode: line.itemCode,
      unitType: 'EA',
      quantity,
      unitPrice: quantity > 0 ? round(totalSale / quantity, 5) : 0,
      netSale,
      totalSale,
      total: round(netSale + tax),
      commercialDiscountData: [],
      itemDiscountData: discount > 0
        ? [{ amount: discount, description: 'خصم الفاتورة', rate: 0 }]
        : [],
      valueDifference: 0,
      taxableItems: rate > 0
        ? [{ taxType: VAT_TAX_TYPE, amount: tax, subType: VAT_SUB_TYPE, rate }]
        : [],
    };
  });
}

/**
 * يبني إيصالًا إلكترونيًا من مبيعة، ويحسب uuid الخاص به بعد ما يربطه بالسابق.
 * @param {object} sale المبيعة ومعاها items
 * @param {object} config إعدادات المنظومة
 * @param {string|null} previousUuid uuid آخر إيصال من نفس الجهاز (null لأول إيصال)
 */
function buildReceiptDocument(sale, config, previousUuid = null) {
  const { grossLines, rate } = prepareGrossLines(sale, config);
  const items = buildItems(grossLines, rate);

  const totalSales = round(items.reduce((sum, item) => sum + item.totalSale, 0));
  const totalItemsDiscount = round(items.reduce(
    (sum, item) => sum + (item.itemDiscountData[0]?.amount || 0), 0
  ));
  const netAmount = round(totalSales - totalItemsDiscount);
  let taxTotal = round(items.reduce((sum, item) => sum + (item.taxableItems[0]?.amount || 0), 0));

  // الإجمالي لازم يساوي اللي العميل دفعه بالقرش، فأي فرق تقريب يترحّل على آخر بند.
  const drift = round((round(Number(sale.total_amount) || 0)) - round(netAmount + taxTotal));
  if (drift !== 0 && items.length > 0) {
    const last = items[items.length - 1];
    if (last.taxableItems.length > 0) {
      last.taxableItems[0].amount = round(last.taxableItems[0].amount + drift);
      last.total = round(last.total + drift);
      taxTotal = round(taxTotal + drift);
    }
  }

  const buyerName = (sale.customer_name || '').trim();

  const receipt = {
    header: {
      dateTimeIssued: toEtaDateTime(sale.created_at),
      receiptNumber: sale.invoice_number || `RCP-${sale.id}`,
      uuid: '',
      previousUUID: previousUuid || '',
      referenceOldUUID: '',
      currency: 'EGP',
      exchangeRate: 0,
      grossWeight: 0,
      netWeight: 0,
    },
    documentType: { receiptType: 'S', typeVersion: RECEIPT_TYPE_VERSION },
    seller: buildSeller(config),
    buyer: {
      type: 'P',
      name: buyerName || 'مستهلك نهائي',
      mobileNumber: (sale.customer_phone || '').trim() || undefined,
    },
    itemData: items,
    totalSales,
    totalCommercialDiscount: 0,
    totalItemsDiscount,
    extraReceiptDiscountData: [],
    netAmount,
    feesAmount: 0,
    totalAmount: round(netAmount + taxTotal),
    taxTotals: rate > 0 ? [{ taxType: VAT_TAX_TYPE, amount: taxTotal }] : [],
    paymentMethod: PAYMENT_METHODS[sale.payment_method] || PAYMENT_METHODS.cash,
    adjustment: 0,
  };

  receipt.header.uuid = computeReceiptUuid(receipt);
  return receipt;
}

/** بصمة الإيصال: SHA-256 لنصه المسلسل وهو لسه بغير uuid. */
function computeReceiptUuid(receipt) {
  const withoutUuid = { ...receipt, header: { ...receipt.header, uuid: '' } };
  return createHash('sha256').update(serialize(withoutUuid), 'utf8').digest('hex');
}

module.exports = { buildReceiptDocument, computeReceiptUuid, PAYMENT_METHODS, RECEIPT_TYPE_VERSION };
