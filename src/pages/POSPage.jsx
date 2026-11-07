import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import CartPanel from '../components/CartPanel.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import ReceiptPrint from '../components/ReceiptPrint.jsx';
import useProducts from '../hooks/useProducts.js';
import useBarcodeScanner, { normalizeBarcodeText } from '../hooks/useBarcodeScanner.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { playSuccessBeep, playErrorBeep } from '../utils/beep.js';
import { normalizeErrorMessage } from '../utils/normalizeError.js';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import { getSectorConfig } from '../utils/sectorConfig.js';

// Modular POS Subcomponents
import HeldOrdersModal from '../components/pos/HeldOrdersModal.jsx';
import TablesModal from '../components/pos/TablesModal.jsx';
import ShiftOpenModal from '../components/pos/ShiftOpenModal.jsx';
import ShiftExpenseModal from '../components/pos/ShiftExpenseModal.jsx';
import ShiftCloseModal from '../components/pos/ShiftCloseModal.jsx';
import ShiftReportModal from '../components/pos/ShiftReportModal.jsx';
import PosTopBar from '../components/pos/PosTopBar.jsx';
import OrderModeToggle, { getOrderModeLabel } from '../components/pos/OrderModeToggle.jsx';
import { BarcodeIcon } from '../components/icons/PosIcons.jsx';
import SearchBar from '../components/pos/SearchBar.jsx';
import SpeedKeysBar from '../components/pos/SpeedKeysBar.jsx';
import ScaleWeightModal from '../components/pos/ScaleWeightModal.jsx';
import ShiftGateBanner from '../components/pos/ShiftGateBanner.jsx';
import usePosAttendance from '../hooks/usePosAttendance.js';
import { isBridgeAvailable } from '../api/bridge.js';
import * as authApi from '../api/auth.js';
import * as customersApi from '../api/customers.js';
import * as groceryApi from '../api/grocery.js';
import * as printingApi from '../api/printing.js';
import * as productsApi from '../api/products.js';
import * as salesApi from '../api/sales.js';
import * as shiftsApi from '../api/shifts.js';
import * as subscriptionsApi from '../api/subscriptions.js';
import * as tablesApi from '../api/tables.js';
import { hasPermission } from '../utils/accessControl.js';
import { computeCartTotals } from '../utils/cartTotals.js';
import { applyModifiers, lineKey, parseAddonCatalog } from '../utils/cartModifiers.js';
import ModifiersModal from '../components/pos/ModifiersModal.jsx';

function POSPage({ onNavigate }) {
  const { settings } = useSettings();
  const { configuration } = useBusinessProfile();
  const sectorKey = configuration?.profile?.key || 'retail';
  const sectorConfig = useMemo(() => getSectorConfig(sectorKey), [sectorKey]);
  const [activeOrderMode, setActiveOrderMode] = useState('takeaway');

  const { products, refresh: loadProducts, loading, error: productsError } = useProducts();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 150);
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [selectedVariant, setSelectedVariant] = useState({});
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [bundlePromotion, setBundlePromotion] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponMessage, setCouponMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [creditCustomerName, setCreditCustomerName] = useState('');
  const [creditCustomerPhone, setCreditCustomerPhone] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [message, setMessage] = useState(null);
  const [printableSale, setPrintableSale] = useState(null);

  // نظام الفواتير المعلقة (Held Orders)
  const [heldOrders, setHeldOrders] = useState([]);
  const [showHeldModal, setShowHeldModal] = useState(false);

  // Restaurant tables: the open check being served, and whether it is being paid.
  const [activeTab, setActiveTab] = useState(null);
  const [payingTab, setPayingTab] = useState(false);
  const [showTablesModal, setShowTablesModal] = useState(false);
  // While a table check is being paid the cart mirrors the check, so it can't be edited.
  const cartLocked = Boolean(activeTab && payingTab);
  const warnCartLocked = () => setMessage({ type: 'warning', text: 'الحساب في وضع الدفع. ألغِ الدفع الأول لو عايز تعدل.' });

  // Item add-ons (extra cheese, no onion...) from settings, and the cart line being edited.
  const addonCatalog = useMemo(() => parseAddonCatalog(settings.sector_addons), [settings.sector_addons]);
  const [modifiersLine, setModifiersLine] = useState(null);

  // نظام الورديات (Shift Management)
  const [activeShift, setActiveShift] = useState(null);
  const [shiftLoaded, setShiftLoaded] = useState(false);
  const [showShiftOpenModal, setShowShiftOpenModal] = useState(false);
  const [showShiftExpenseModal, setShowShiftExpenseModal] = useState(false);
  const [showShiftCloseModal, setShowShiftCloseModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [shiftPreviewReport, setShiftPreviewReport] = useState(null);
  
  // Shift Context Information
  const [posSessionUser, setPosSessionUser] = useState(null);
  const [posLastClosedShift, setPosLastClosedShift] = useState(null);

  // Subscriptions & Customer Selection State
  const [posCustomers, setPosCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [useSubscriptionCredit, setUseSubscriptionCredit] = useState(false);
  const [scaleModalItem, setScaleModalItem] = useState(null);

  useEffect(() => {
    async function loadCustomers() {
      if (customersApi.getAllCustomersWithStats.isAvailable()) {
        try {
          const list = await customersApi.getAllCustomersWithStats();
          setPosCustomers(list || []);
        } catch (err) {
          console.error('Failed to load customers for POS:', err);
        }
      }
    }
    loadCustomers();
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!authApi.getSession.isAvailable()) return undefined;
    authApi.getSession()
      .then((session) => { if (mounted) setPosSessionUser(session || null); })
      .catch((error) => console.error('تعذر تحميل جلسة مستخدم نقطة البيع:', error));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    async function checkSubscription() {
      if (!selectedCustomerId) {
        setActiveSubscription(null);
        setUseSubscriptionCredit(false);
        return;
      }
      try {
        if (subscriptionsApi.getActiveSubscriptionByCustomer.isAvailable()) {
          const sub = await subscriptionsApi.getActiveSubscriptionByCustomer(selectedCustomerId);
          setActiveSubscription(sub || null);
          if (sub && sub.discount_percentage > 0) {
            const subtotalVal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
            const calculatedDiscount = Math.round(subtotalVal * (sub.discount_percentage / 100));
            setDiscount(calculatedDiscount);
            setCouponMessage(`خصم عضوية تلقائي (${sub.discount_percentage}%)`);
          }
        }
      } catch (err) {
        console.error('Failed to load customer subscription:', err);
      }
    }
    checkSubscription();
  }, [selectedCustomerId, cart]);

  const refreshShift = useCallback(async () => {
    try {
      if (shiftsApi.getCurrentShift.isAvailable()) {
        const current = await shiftsApi.getCurrentShift();
        setActiveShift(current);
      }
    } catch (err) {
      console.error('خطأ في جلب بيانات الوردية:', err);
    } finally {
      setShiftLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshShift();
  }, [refreshShift]);

  const attendance = usePosAttendance({ sessionUser: posSessionUser, activeShift, setMessage });

  const searchInputRef = useRef(null);
  const paymentSectionRef = useRef(null);
  const promotionPreviewSequence = useRef(0);

  useEffect(() => {
    const sequence = ++promotionPreviewSequence.current;
    if (cart.length === 0) {
      setBundlePromotion(null);
      return undefined;
    }

    salesApi.previewBundlePromotions(cart.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })))
      .then((promotion) => {
        if (sequence === promotionPreviewSequence.current) setBundlePromotion(promotion);
      })
      .catch((error) => {
        if (sequence === promotionPreviewSequence.current) {
          setBundlePromotion(null);
          console.error('تعذر احتساب العروض المركبة:', error);
        }
      });
    return () => {
      promotionPreviewSequence.current += 1;
    };
  }, [cart]);

  // حساب التصنيفات مع عدد المنتجات لكل تصنيف
  const categoriesWithCounts = useMemo(() => {
    const counts = { 'الكل': products.length };
    products.forEach((p) => {
      if (p.categoryName) {
        counts[p.categoryName] = (counts[p.categoryName] || 0) + 1;
      }
    });
    const uniqueCats = ['الكل', ...new Set(products.map((p) => p.categoryName).filter(Boolean))];
    return uniqueCats.map((cat) => ({
      name: cat,
      count: counts[cat] || 0,
    }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.variants?.some((v) =>
          (v.barcode && v.barcode.toLowerCase().includes(term)) ||
          (v.sku && v.sku.toLowerCase().includes(term)) ||
          (sectorConfig.features?.serialNumber && v.serial_number && v.serial_number.toLowerCase().includes(term)) ||
          (sectorConfig.features?.oemCode && v.oem_number && v.oem_number.toLowerCase().includes(term))
        );
      const matchesCategory = activeCategory === 'الكل' || p.categoryName === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, debouncedSearch, activeCategory, sectorConfig.features]);

  function pickVariant(productId, variantId) {
    setSelectedVariant((prev) => ({ ...prev, [productId]: variantId }));
  }

  function addToCart(product) {
    if (cartLocked) return warnCartLocked();
    const variantId = selectedVariant[product.id] || product.variants[0]?.id;
    const variant = product.variants?.find((v) => v.id === variantId) || product.variants[0];
    const isService = Boolean(product.is_service);
    if (!variant || (!isService && variant.stock_quantity === 0)) return;

    setCart((prev) => {
      const inCart = prev.filter((item) => item.variantId === variant.id).reduce((sum, item) => sum + item.quantity, 0);
      if (!isService && inCart >= variant.stock_quantity) return prev;
      // A tap adds a plain one; lines with add-ons stay as the cashier set them.
      const existing = prev.find((item) => item.variantId === variant.id && !item.modifiers?.length && !item.note);
      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          color: variant.color,
          unitPrice: variant.selling_price,
          quantity: 1,
          maxStock: isService ? null : variant.stock_quantity,
          isService,
        },
      ];
    });
  }

  function addScannedVariantToCart(variant, extraOptions = {}) {
    if (cartLocked) return warnCartLocked();
    if (!variant || (variant.stock_quantity !== undefined && variant.stock_quantity <= 0)) {
      playErrorBeep();
      setMessage({ type: 'error', text: `الصنف "${variant?.productName || ''}" غير متوفر بالمخزون حالياً` });
      return;
    }

    const qtyToAdd = extraOptions.quantity !== undefined ? extraOptions.quantity : 1;
    const unitPrice = extraOptions.unitPrice !== undefined ? extraOptions.unitPrice : variant.selling_price;
    const unitName = extraOptions.unitName || (extraOptions.isScale ? 'كجم' : 'قطعة');
    const isScaleItem = Boolean(extraOptions.isScale);
    const unitId = extraOptions.unitId || null;
    // A price-printed scale label is sent with the sale so the server prices it from the label.
    const scaleBarcode = extraOptions.scaleBarcode || null;

    setCart((prev) => {
      const existing = prev.find((item) => item.variantId === variant.id && item.unitId === unitId
        && (item.scaleBarcode || null) === scaleBarcode && !item.modifiers?.length && !item.note);
      if (existing) {
        const nextQty = Math.round((existing.quantity + qtyToAdd) * 1000) / 1000;
        if (variant.stock_quantity && nextQty > variant.stock_quantity) {
          playErrorBeep();
          setMessage({
            type: 'warning',
            text: `الكمية في السلة (${nextQty}) وصلت للحد الأقصى المتاح بالمخزون!`,
          });
          return prev;
        }
        playSuccessBeep();
        setMessage({
          type: 'success',
          text: `تمت زيادة كمية "${variant.productName || 'المنتج'}" إلى ${nextQty} ${unitName}`,
        });
        return prev.map((item) =>
          item === existing
            ? { ...item, quantity: nextQty }
            : item
        );
      }

      playSuccessBeep();
      setMessage({
        type: 'success',
        text: `تمت إضافة "${variant.productName || 'المنتج'}" (${qtyToAdd} ${unitName}) إلى السلة`,
      });
      return [
        ...prev,
        {
          variantId: variant.id,
          productName: variant.productName,
          size: variant.size,
          color: variant.color,
          unitPrice: Number(unitPrice),
          quantity: qtyToAdd,
          maxStock: variant.stock_quantity ?? 9999,
          unitName,
          isScaleItem,
          unitId,
          scaleBarcode,
        },
      ];
    });
  }

  async function handleBarcodeScan(code) {
    if (!code) return;
    const cleanCode = normalizeBarcodeText(code);
    const allowGroceryBarcode = Boolean(
      sectorConfig.features?.scaleBarcode ||
      sectorConfig.features?.batchExpiry ||
      sectorConfig.features?.speedKeys
    );
    try {
      if (allowGroceryBarcode && groceryApi.resolveGroceryBarcode.isAvailable()) {
        const resolved = await groceryApi.resolveGroceryBarcode(cleanCode);
        if (resolved && !resolved.resolved && resolved.error) {
          playErrorBeep();
          setMessage({
            type: 'error',
            text: resolved.error,
          });
          return;
        }
        if (resolved && resolved.resolved && resolved.variantId) {
          setSearch('');
          addScannedVariantToCart(
            {
              id: resolved.variantId,
              productName: resolved.productName,
              selling_price: resolved.unitPrice,
              stock_quantity: resolved.variant?.stock_quantity ?? 9999,
              sku: resolved.variant?.sku,
              barcode: resolved.rawCode,
            },
            {
              quantity: resolved.quantity,
              unitPrice: resolved.unitPrice,
              unitName: resolved.unitName,
              isScale: resolved.type === 'scale_item',
              unitId: resolved.unit?.id,
              scaleBarcode: resolved.type === 'scale_item' && resolved.scaleData?.encodingType === 'total_price'
                ? resolved.rawCode
                : null,
            }
          );
          if (resolved.batchWarning) {
            setMessage({
              type: 'warning',
              text: resolved.batchWarning.warning,
            });
          }
          return;
        }
      }

      const variant = await productsApi.getProductByBarcode(cleanCode);
      if (!variant) {
        playErrorBeep();
        setMessage({
          type: 'error',
          text: `الباركود (${cleanCode}) غير مسجل في النظام`,
        });
        return;
      }

      if (variant.stock_quantity === 0) {
        playErrorBeep();
        setMessage({
          type: 'error',
          text: `المنتج "${variant.productName}" غير متوفر بالمخزون`,
        });
        return;
      }

      setSearch('');
      addScannedVariantToCart(variant);
    } catch (err) {
      playErrorBeep();
      setMessage({ type: 'error', text: normalizeErrorMessage(err, 'فشل مسح الباركود.') });
    }
  }

  useBarcodeScanner(handleBarcodeScan);

  function changeQuantity(line, delta) {
    if (cartLocked) return warnCartLocked();
    const key = lineKey(line);
    setCart((prev) =>
      prev
        .map((item) => {
          if (lineKey(item) !== key) return item;
          const step = item.isScaleItem ? (delta > 0 ? 0.250 : -0.250) : delta;
          const newQty = Math.round((item.quantity + step) * 1000) / 1000;
          if (newQty <= 0 || (item.maxStock && newQty > item.maxStock)) return item;
          return { ...item, quantity: newQty };
        })
        .filter(Boolean)
    );
  }

  function removeFromCart(line) {
    if (cartLocked) return warnCartLocked();
    const key = lineKey(line);
    setCart((prev) => prev.filter((item) => lineKey(item) !== key));
  }

  function handleApplyModifiers(names, quantity, note) {
    if (cartLocked) return warnCartLocked();
    const line = modifiersLine;
    setModifiersLine(null);
    if (line) setCart((prev) => applyModifiers(prev, line, names, quantity, addonCatalog, note));
  }

  const handleSelectSpeedKey = (key) => {
    if (key.label?.includes('كيلو') || key.label?.includes('كجم') || key.label?.includes('جبن') || key.label?.includes('رومي')) {
      setScaleModalItem({
        id: key.variant_id,
        productName: key.label,
        selling_price: key.selling_price,
        stock_quantity: key.stock_quantity,
        sku: key.sku,
        barcode: key.barcode,
      });
    } else {
      addScannedVariantToCart(
        {
          id: key.variant_id,
          productName: key.label,
          selling_price: key.selling_price,
          stock_quantity: key.stock_quantity ?? 9999,
          sku: key.sku,
          barcode: key.barcode,
        },
        {
          quantity: 1,
          unitPrice: key.selling_price,
          unitName: 'قطعة',
          isScale: false,
        }
      );
    }
  };

  const handleConfirmScaleWeight = ({ weightKg, productVariant }) => {
    addScannedVariantToCart(
      {
        id: productVariant.id || productVariant.variantId,
        productName: productVariant.productName || productVariant.name,
        selling_price: productVariant.selling_price || productVariant.unitPrice,
        stock_quantity: productVariant.stock_quantity ?? 9999,
      },
      {
        quantity: weightKg,
        unitPrice: productVariant.selling_price || productVariant.unitPrice,
        unitName: 'كجم',
        isScale: true,
      }
    );
  };

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscount(0);
    setCouponCode('');
    setCouponMessage('');
    setCashReceived('');
    setCreditCustomerName('');
    setCreditCustomerPhone('');
    setCreditDueDate('');
    setSelectedCustomerId('');
    setActiveSubscription(null);
    setUseSubscriptionCredit(false);
  }, []);

  // تعليق الفاتورة الحالية
  const handleHoldCurrentOrder = useCallback(() => {
    if (cart.length === 0 || activeTab) return;
    const newHold = {
      id: Date.now(),
      createdAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      cart: [...cart],
      discount,
      couponCode,
      paymentMethod,
      orderMode: activeOrderMode,
      creditCustomerName,
      creditCustomerPhone,
      creditDueDate,
    };
    setHeldOrders((prev) => [newHold, ...prev]);
    clearCart();
    setMessage({ type: 'success', text: 'تم تعليق الفاتورة الحالية بنجاح ⏸️' });
  }, [cart, discount, couponCode, paymentMethod, activeOrderMode, creditCustomerName, creditCustomerPhone, creditDueDate, clearCart, activeTab]);

  // استرجاع فاتورة معلقة
  function handleResumeHeldOrder(order) {
    if (cart.length > 0) {
      // تعليق الحالية تلقائياً قبل الاسترجاع
      handleHoldCurrentOrder();
    }
    setCart(order.cart);
    setDiscount(order.discount || 0);
    setCouponCode(order.couponCode || '');
    setPaymentMethod(order.paymentMethod || 'cash');
    setActiveOrderMode(order.orderMode || 'takeaway');
    setCreditCustomerName(order.creditCustomerName || '');
    setCreditCustomerPhone(order.creditCustomerPhone || '');
    setCreditDueDate(order.creditDueDate || '');
    setHeldOrders((prev) => prev.filter((o) => o.id !== order.id));
    setShowHeldModal(false);
    setMessage({ type: 'success', text: 'تم استرجاع الفاتورة المعلقة بنجاح' });
  }

  function handleDeleteHeldOrder(orderId) {
    setHeldOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  function applyCoupon() {
    const code = couponCode.trim();
    if (!code) {
      setDiscount(0);
      setCouponMessage('');
      return;
    }
    if (!isNaN(Number(code)) && Number(code) > 0) {
      setDiscount(Number(code));
      setCouponMessage(`تم تطبيق خصم بقيمة ${code} ج.م`);
    } else {
      setCouponMessage('أدخل قيمة الخصم كرقم صحيح');
    }
  }

  const { subtotal, effectiveDiscount, total, changeDue, isCreditInvalid, isCashInvalid } = computeCartTotals({
    cart,
    discount,
    bundlePromotion,
    paymentMethod,
    cashReceived,
    creditCustomerName,
    creditDueDate,
  });
  const displayedCouponMessage = bundlePromotion?.discount > Number(discount || 0)
    ? `تم تطبيق عرض ${bundlePromotion.name} تلقائيًا (خصم ${bundlePromotion.discount.toFixed(2)} ج.م)`
    : couponMessage;

  // Prints the order's kitchen ticket(s) in the background; the order itself is already saved.
  function printKitchenTicket(ref) {
    if (!printingApi.printKitchenTicket.isAvailable()) return;
    const warn = (text) => setMessage({ type: 'warning', text: `الطلب اتسجل لكن تذكرة المطبخ ما اتطبعتش: ${text}` });
    printingApi.printKitchenTicket(ref)
      .then((result) => {
        if (result?.failed?.length) warn(result.failed.map((f) => `${f.station} (${f.error})`).join('، '));
      })
      .catch((err) => warn(normalizeErrorMessage(err)));
  }

  function requireShiftForTables() {
    if (activeShift) return true;
    playErrorBeep();
    setMessage({ type: 'warning', text: 'افتح الوردية أولاً لاستقبال طلبات الطاولات.' });
    return false;
  }

  async function handleSelectTable(table) {
    if (!requireShiftForTables()) {
      setShowTablesModal(false);
      return;
    }
    if (activeTab && cart.length > 0) {
      setMessage({ type: 'warning', text: `ابعت أصناف ${activeTab.table_name} للمطبخ أو امسحها الأول` });
      return;
    }
    try {
      const tab = await tablesApi.openTableTab(table.id);
      setActiveTab(tab);
      setPayingTab(false);
      setShowTablesModal(false);
      setMessage(null);
    } catch (err) {
      setMessage({ type: 'error', text: normalizeErrorMessage(err) });
    }
  }

  async function handleSendRound() {
    if (!activeTab || cart.length === 0) return;
    if (!requireShiftForTables()) return;
    try {
      const tab = await tablesApi.sendTableRound(
        activeTab.id,
        cart.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          modifiers: item.modifiers?.map((m) => m.name),
          note: item.note || null,
        })),
      );
      setActiveTab(tab);
      clearCart();
      playSuccessBeep();
      printKitchenTicket({ roundId: tab.roundId });
      setMessage({ type: 'success', text: `اتبعت للمطبخ — ${tab.table_name}` });
    } catch (err) {
      playErrorBeep();
      setMessage({ type: 'error', text: normalizeErrorMessage(err) });
    }
  }

  async function handleStartPayTab() {
    try {
      const tab = await tablesApi.getOpenTableTab(activeTab.id);
      setActiveTab(tab);
      setCart(tab.items.map((item) => ({
        variantId: item.variant_id,
        productName: item.product_name || 'صنف محذوف',
        size: item.size,
        color: item.color,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        modifiers: item.modifiers,
        note: item.note || undefined,
        maxStock: null,
        isService: true,
      })));
      setPayingTab(true);
      setMessage({ type: 'success', text: `حساب ${tab.table_name}: اختار طريقة الدفع وكمّل البيع` });
    } catch (err) {
      setMessage({ type: 'error', text: normalizeErrorMessage(err) });
    }
  }

  function handleCancelPayTab() {
    setCart([]);
    setPayingTab(false);
    setMessage(null);
  }

  async function handleLeaveTable() {
    if (cart.length > 0 && !window.confirm('فيه أصناف لسه ما اتبعتتش للمطبخ. تمسحها وتخرج من الطاولة؟')) return;
    try {
      // An empty check is cancelled so the table shows free again.
      if (activeTab.items.length === 0) await tablesApi.cancelTableTab(activeTab.id);
    } catch (err) {
      console.error('تعذر إلغاء حساب الطاولة الفاضي:', err);
    }
    clearCart();
    setActiveTab(null);
    setPayingTab(false);
    setMessage(null);
  }

  const handleCompleteSale = useCallback(async () => {
    if (cart.length === 0 || isCreditInvalid || isCashInvalid) return;
    if (activeTab && !payingTab) {
      setMessage({ type: 'warning', text: 'ابعت الأصناف للمطبخ، أو اضغط "دفع الحساب" لما الطاولة تخلص.' });
      return;
    }
    if (!activeShift) {
      playErrorBeep();
      setMessage({ type: 'warning', text: 'افتح الوردية أولاً لإتمام البيع.' });
      return;
    }
    const printStatus = { error: null };
    setMessage(null);
    try {
      const selectedCustomerObj = posCustomers.find(c => String(c.id) === String(selectedCustomerId));
      const result = await salesApi.createSale({
        items: cart.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          // Shown price only; the server prices every line (and its add-ons) itself.
          unitPrice: item.basePrice ?? item.unitPrice,
          unitId: item.unitId || null,
          scaleBarcode: item.scaleBarcode || null,
          modifiers: item.modifiers?.map((m) => m.name),
          note: item.note || null,
        })),
        discount: Number(discount || 0),
        paymentMethod,
        orderMode: sectorConfig.key === 'cafe_restaurant' ? (activeTab ? 'dine_in' : activeOrderMode) : null,
        tableTabId: activeTab?.id || null,
        customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
        customerName: selectedCustomerObj ? selectedCustomerObj.name : creditCustomerName,
        customerPhone: selectedCustomerObj ? selectedCustomerObj.phone : creditCustomerPhone,
        dueDate: creditDueDate,
        subscriptionId: useSubscriptionCredit && activeSubscription ? activeSubscription.id : null,
        creditsDeducted: useSubscriptionCredit ? 1 : 0,
      });

      // A table's rounds already went to the kitchen when they were sent.
      if (sectorConfig.key === 'cafe_restaurant' && !activeTab) printKitchenTicket({ saleId: result.saleId });

      const fullSale = await salesApi.getSaleById(result.saleId);
      if (fullSale) {
        const receiptSale = activeTab ? { ...fullSale, tableName: activeTab.table_name } : fullSale;
        setPrintableSale({
          ...receiptSale,
          cashReceived: paymentMethod === 'cash' ? cashReceived : null,
          changeDue: paymentMethod === 'cash' ? changeDue : null,
        });

        playSuccessBeep();

        if (printingApi.printReceipt.isAvailable()) {
          const printerOptions = settings.thermal_printer_name
            ? {
                printerName: settings.thermal_printer_name,
                paperSize: settings.receipt_paper_size,
                cashDrawerPin: Number(settings.cash_drawer_pin) === 5 ? 5 : 2,
                openCashDrawer: paymentMethod === 'cash',
                cutPaper: true,
              }
            : { openCashDrawer: paymentMethod === 'cash', cutPaper: true };
          printingApi.printReceipt(receiptSale, printerOptions).catch((err) => {
            console.error('فشل إرسال الفاتورة للطباعة:', err);
            if (settings.thermal_printer_name) {
              printStatus.error = err;
              const receiptWasPrinted = err.message?.startsWith('تمت طباعة الفاتورة لكن تعذر قص الورق:');
              if (receiptWasPrinted) {
                setMessage({ type: 'error', text: err.message });
              } else {
                setMessage({ type: 'error', text: `تم البيع لكن تعذرت الطباعة المباشرة: ${err.message}. ستُفتح نافذة الطباعة البديلة.` });
                window.print();
              }
            } else {
              window.print();
            }
          });
        } else {
          setTimeout(() => {
            window.print();
          }, 150);
        }
      }

      clearCart();
      if (activeTab) {
        setActiveTab(null);
        setPayingTab(false);
      }
      await loadProducts();
      refreshShift();
      setMessage((current) => printStatus.error
        ? current
        : { type: 'success', text: `تم إتمام البيع بنجاح — فاتورة #${result.saleId}` });

      if (paymentMethod === 'credit' && onNavigate) {
        const customerPayload = {
          name: creditCustomerName?.trim() || '',
          phone: creditCustomerPhone?.trim() || '',
          email: '',
        };

        try {
          if (customerPayload.name) {
            localStorage.setItem('kashiear_pending_customer', JSON.stringify(customerPayload));
          }
        } catch (e) {
          console.error('Failed to store pending customer:', e);
        }

        setTimeout(() => {
          onNavigate('customers');
        }, 250);
      }
    } catch (err) {
      playErrorBeep();
      setMessage({ type: 'error', text: err.message });
    }
  }, [cart, isCreditInvalid, isCashInvalid, activeShift, discount, paymentMethod, activeOrderMode, sectorConfig.key, creditCustomerName, creditCustomerPhone, creditDueDate, cashReceived, changeDue, clearCart, loadProducts, refreshShift, onNavigate, activeSubscription, posCustomers, selectedCustomerId, useSubscriptionCredit, settings.thermal_printer_name, settings.receipt_paper_size, settings.cash_drawer_pin, activeTab, payingTab]);

  // دوال إدارة الوردية من الـ POS
  const handleOpenStartShiftModal = async () => {
    try {
      if (isBridgeAvailable()) {
        const [lastClosed, sess] = await Promise.all([
          shiftsApi.getLastClosedShift.ifAvailable(),
          authApi.getSession.ifAvailable(),
        ]);
        setPosLastClosedShift(lastClosed || null);
        setPosSessionUser(sess || null);
      }
    } catch (e) {
      console.error('خطأ في جلب بيانات مستخدم الوردية:', e);
    }
    setShowShiftOpenModal(true);
  };

  async function handlePOSOpenShift(shiftData) {
    await shiftsApi.openShift(shiftData);
    await refreshShift();
    setMessage({ type: 'success', text: 'تم استلام الدرج وبدء الوردية بنجاح 🟢' });
  }

  async function handlePOSAddExpense(expenseData) {
    await shiftsApi.addShiftExpense(expenseData);
    await refreshShift();
    setMessage({ type: 'success', text: 'تم تسجيل المصروف وخصمه من الدرج 💸' });
  }

  async function handlePOSCloseShift(closeData) {
    const closed = await shiftsApi.closeShift(closeData);
    await refreshShift();
    setShiftPreviewReport({ shift: closed, reportType: 'Z' });
    setMessage({ type: 'success', text: 'تم تقفيل الوردية وإصدار تقرير Z-Report 🔒' });
  }

  async function handlePOSShowXReport() {
    try {
      const rep = await shiftsApi.getShiftXReport();
      if (rep) {
        setShiftPreviewReport({ shift: rep, reportType: 'X' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'فشل استخراج التقرير' });
    }
  }

  const handleManualOpenCashDrawer = useCallback(async () => {
    try {
      if (printingApi.openCashDrawer.isAvailable()) {
        await printingApi.openCashDrawer({
          printerName: settings.thermal_printer_name || undefined,
          cashDrawerPin: Number(settings.cash_drawer_pin) === 5 ? 5 : 2,
        });
        setMessage({ type: 'success', text: 'تم إرسال إشارة فتح درج النقود 💵' });
      } else {
        setMessage({ type: 'warning', text: 'خاصية فتح الدرج غير متوفرة في بيئة الويب' });
      }
    } catch (err) {
      console.error('فشل فتح درج النقود:', err);
      setMessage({ type: 'error', text: `تعذر فتح الدرج: ${err.message || 'تأكد من توصيل الطابعة'}` });
    }
  }, [settings.thermal_printer_name, settings.cash_drawer_pin]);

  // Keyboard Shortcuts (F1 search, F2 hold, F3 held orders, F4 discount, F7 cash drawer, F9/F10 payment method, F12 payment section)
  useEffect(() => {
    function handleKeyDown(e) {
      switch (e.key) {
        case 'F1':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'F2':
          e.preventDefault();
          handleHoldCurrentOrder();
          break;
        case 'F3':
          e.preventDefault();
          setShowHeldModal(true);
          break;
        case 'F4':
          e.preventDefault();
          setShowDiscountModal(true);
          break;
        case 'F7':
          e.preventDefault();
          handleManualOpenCashDrawer();
          break;
        case 'F9':
          e.preventDefault();
          setPaymentMethod('cash');
          break;
        case 'F10':
          e.preventDefault();
          setPaymentMethod('credit');
          setCashReceived('');
          break;
        case 'F12':
          e.preventDefault();
          paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          paymentSectionRef.current?.querySelector('button:not(:disabled), input:not(:disabled)')?.focus();
          break;
        case 'Escape':
          e.preventDefault();
          if (scaleModalItem) {
            setScaleModalItem(null);
          } else if (shiftPreviewReport) {
            setShiftPreviewReport(null);
          } else if (showHeldModal) {
            setShowHeldModal(false);
          } else if (showShiftCloseModal) {
            setShowShiftCloseModal(false);
          } else if (showShiftExpenseModal) {
            setShowShiftExpenseModal(false);
          } else if (showShiftOpenModal) {
            setShowShiftOpenModal(false);
          } else if (showDiscountModal) {
            setShowDiscountModal(false);
          } else if (cart.length) {
            if (window.confirm('هل تريد إفراغ السلة؟')) {
              clearCart();
            }
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, showHeldModal, showShiftOpenModal, showShiftExpenseModal, showShiftCloseModal, showDiscountModal, shiftPreviewReport, scaleModalItem, handleHoldCurrentOrder, setPaymentMethod, clearCart, handleManualOpenCashDrawer]);

  function getStockBadge(product) {
    const totalStock = product.variants?.reduce((sum, v) => sum + v.stock_quantity, 0) || 0;
    const minStock = Math.min(...(product.variants?.map((v) => v.stock_quantity) || [0]));
    if (totalStock === 0) return { text: 'نفذ من المخزون', type: 'danger' };
    if (minStock > 0 && minStock <= (product.variants[0]?.low_stock_threshold ?? 5)) {
      return { text: `باقي ${minStock} فقط`, type: 'warning' };
    }
    return null;
  }

  return (
    <div
      className="pos-page-wrapper"
      data-sector={sectorConfig.key}
      style={{ '--pos-sector-accent': sectorConfig.color }}
    >
      {/* كومبوننت طباعة الفاتورة */}
      <ReceiptPrint sale={printableSale} />

      <PosTopBar
        storeName={settings.store_name}
        sectorConfig={sectorConfig}
        activeShift={activeShift}
        shiftLoaded={shiftLoaded}
        posSessionUser={posSessionUser}
        attendance={attendance}
        onOpenExpenseModal={() => setShowShiftExpenseModal(true)}
        onShowXReport={handlePOSShowXReport}
        onCloseShiftModal={() => setShowShiftCloseModal(true)}
        onOpenCashDrawer={handleManualOpenCashDrawer}
        onOpenKitchen={() => onNavigate?.('kitchen')}
        onOpenTables={() => setShowTablesModal(true)}
      />

      {/* Catalog (start side in RTL): search, categories, products */}
      <section className="pos-catalog-container" aria-label="قائمة الأصناف">
        {activeTab && (
          <div className="pos-table-banner" role="status">
            <div className="pos-table-banner__info">
              <strong>{activeTab.table_name}</strong>
              <span>
                {activeTab.items.length
                  ? `اتبعت للمطبخ: ${activeTab.items.length} صنف · ${Number(activeTab.total).toFixed(2)} ج.م`
                  : 'حساب جديد — ضيف الأصناف وابعتها للمطبخ'}
              </span>
            </div>
            <div className="pos-table-banner__actions">
              {payingTab ? (
                <button type="button" onClick={handleCancelPayTab}>إلغاء الدفع</button>
              ) : (
                <>
                  <button type="button" className="is-primary" disabled={cart.length === 0} onClick={handleSendRound}>
                    إرسال للمطبخ{cart.length ? ` (${cart.length})` : ''}
                  </button>
                  <button
                    type="button"
                    disabled={cart.length > 0 || activeTab.items.length === 0}
                    onClick={handleStartPayTab}
                  >
                    دفع الحساب
                  </button>
                  <button type="button" onClick={handleLeaveTable}>خروج</button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="pos-search-row">
          <SearchBar
            search={search}
            setSearch={setSearch}
            searchInputRef={searchInputRef}
            filteredProducts={filteredProducts}
            selectedVariant={selectedVariant}
            addScannedVariantToCart={addScannedVariantToCart}
            playErrorBeep={playErrorBeep}
            setMessage={setMessage}
            normalizeBarcodeText={normalizeBarcodeText}
            sectorConfig={sectorConfig}
          />
          <button
            type="button"
            className="pos-barcode-btn"
            title="قارئ الباركود متصل وجاهز — اضغط ثم امسح"
            onClick={() => {
              searchInputRef.current?.focus();
              playSuccessBeep();
              setMessage({ type: 'success', text: 'قارئ الباركود جاهز! وجّه القارئ لأي باركود لمسحه فوراً إلى السلة.' });
            }}
          >
            <BarcodeIcon size={20} />
            <span>باركود</span>
          </button>
          <OrderModeToggle
            sectorConfig={sectorConfig}
            activeOrderMode={activeOrderMode}
            onSelectOrderMode={setActiveOrderMode}
          />
        </div>

        {/* Speed Keys Bar (Supermarket Fast PLU Buttons) */}
        {sectorConfig.features?.speedKeys && (
          <SpeedKeysBar
            onSelectSpeedKey={handleSelectSpeedKey}
            onOpenScaleModal={(v) => setScaleModalItem(v)}
            products={products}
          />
        )}

        {/* Category Pills Navigation */}
        <nav className="pos-category-nav" aria-label="التصنيفات">
          {categoriesWithCounts.map((cat) => (
            <button
              key={cat.name}
              type="button"
              className={`pos-category-chip ${activeCategory === cat.name ? 'active' : ''}`}
              aria-pressed={activeCategory === cat.name}
              onClick={() => setActiveCategory(cat.name)}
            >
              <span className="chip-name">{cat.name}</span>
              <span className="chip-count">{cat.count}</span>
            </button>
          ))}
        </nav>

        {/* Products Grid Area */}
        <div className="pos-products-scroll-area">
          {productsError && (
            <div className="pos-products-error-card" role="alert">
              <span aria-hidden="true">⚠️</span>
              <span>{productsError}</span>
            </div>
          )}

          {loading ? (
            <div className="pos-catalog-loading">
              <div className="catalog-spinner"></div>
              <span>جاري تحميل قائمة المنتجات...</span>
            </div>
          ) : (
            <ProductGrid
              products={filteredProducts}
              selectedVariant={selectedVariant}
              pickVariant={pickVariant}
              addToCart={addToCart}
              getStockBadge={getStockBadge}
              cart={cart}
              sectorConfig={sectorConfig}
            />
          )}
        </div>
      </section>

      {/* Cart & Payment (end side in RTL) */}
      <aside className="pos-cart-container" aria-label={sectorConfig.orderTerm || 'السلة'}>
        <CartPanel
          canDiscount={hasPermission(posSessionUser, 'pos.discount')}
          cart={cart}
          changeQuantity={changeQuantity}
          removeFromCart={removeFromCart}
          onEditModifiers={(addonCatalog.length > 0 || sectorConfig.key === 'cafe_restaurant') && !cartLocked ? setModifiersLine : null}
          onOpenScaleEdit={(item) => setScaleModalItem(item)}
          clearCart={cartLocked ? handleCancelPayTab : clearCart}
          onHoldOrder={handleHoldCurrentOrder}
          heldOrdersCount={heldOrders.length}
          onShowHeldOrders={() => setShowHeldModal(true)}
          discount={effectiveDiscount}
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          couponMessage={displayedCouponMessage}
          applyCoupon={applyCoupon}
          subtotal={subtotal}
          total={total}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashReceived={cashReceived}
          setCashReceived={setCashReceived}
          changeDue={changeDue}
          creditCustomerName={creditCustomerName}
          setCreditCustomerName={setCreditCustomerName}
          creditCustomerPhone={creditCustomerPhone}
          setCreditCustomerPhone={setCreditCustomerPhone}
          creditDueDate={creditDueDate}
          setCreditDueDate={setCreditDueDate}
          isCreditInvalid={isCreditInvalid}
          isCashInvalid={isCashInvalid}
          handleCompleteSale={handleCompleteSale}
          message={message}
          onNavigate={onNavigate}
          customers={posCustomers}
          selectedCustomerId={selectedCustomerId}
          setSelectedCustomerId={setSelectedCustomerId}
          activeSubscription={activeSubscription}
          useSubscriptionCredit={useSubscriptionCredit}
          setUseSubscriptionCredit={setUseSubscriptionCredit}
          sectorConfig={sectorConfig}
          paymentSectionRef={paymentSectionRef}
          isShiftOpen={Boolean(activeShift)}
          shiftLoaded={shiftLoaded}
          orderModeLabel={getOrderModeLabel(sectorConfig, activeOrderMode)}
          discountOpen={showDiscountModal}
          setDiscountOpen={setShowDiscountModal}
          shiftGate={shiftLoaded && !activeShift ? (
            <ShiftGateBanner attendance={attendance} onOpenStartShift={handleOpenStartShiftModal} />
          ) : null}
        />
      </aside>

      <ModifiersModal
        line={modifiersLine}
        catalog={addonCatalog}
        onApply={handleApplyModifiers}
        onClose={() => setModifiersLine(null)}
      />

      <TablesModal
        isOpen={showTablesModal}
        onClose={() => setShowTablesModal(false)}
        onSelectTable={handleSelectTable}
        canManage={hasPermission(posSessionUser, 'settings.manage')}
      />

      {/* Held Orders Modal */}
      <HeldOrdersModal
        isOpen={showHeldModal}
        onClose={() => setShowHeldModal(false)}
        heldOrders={heldOrders}
        onResumeOrder={handleResumeHeldOrder}
        onDeleteOrder={handleDeleteHeldOrder}
      />

      {/* Start Shift Modal */}
      <ShiftOpenModal
        isOpen={showShiftOpenModal}
        onClose={() => setShowShiftOpenModal(false)}
        onOpenShift={handlePOSOpenShift}
        sessionUser={posSessionUser}
        lastClosedShift={posLastClosedShift}
      />

      {/* Shift Expense Modal */}
      <ShiftExpenseModal
        isOpen={showShiftExpenseModal}
        onClose={() => setShowShiftExpenseModal(false)}
        onAddExpense={handlePOSAddExpense}
      />

      {/* Shift Close Modal (Z-Report & Blind Count) */}
      <ShiftCloseModal
        isOpen={showShiftCloseModal}
        onClose={() => setShowShiftCloseModal(false)}
        onCloseShift={handlePOSCloseShift}
      />

      {/* Shift Preview Report Modal (Z / X) */}
      <ShiftReportModal
        previewReport={shiftPreviewReport}
        onClose={() => setShiftPreviewReport(null)}
      />

      {/* Scale Live Weight Modal (Supermarket Live Scale) */}
      {sectorConfig.features?.scaleBarcode && (
        <ScaleWeightModal
          isOpen={Boolean(scaleModalItem)}
          onClose={() => setScaleModalItem(null)}
          productVariant={scaleModalItem}
          onConfirmWeight={handleConfirmScaleWeight}
        />
      )}
    </div>
  );
}

export default POSPage;