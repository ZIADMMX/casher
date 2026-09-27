import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import CartPanel from '../components/CartPanel.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import ReceiptPrint from '../components/ReceiptPrint.jsx';
import useProducts from '../hooks/useProducts.js';
import useBarcodeScanner, { normalizeBarcodeText } from '../hooks/useBarcodeScanner.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { playSuccessBeep, playErrorBeep } from '../utils/beep.js';
import { normalizeErrorMessage } from '../utils/normalizeError.js';

// Modular POS Subcomponents
import HeldOrdersModal from '../components/pos/HeldOrdersModal.jsx';
import ShiftOpenModal from '../components/pos/ShiftOpenModal.jsx';
import ShiftExpenseModal from '../components/pos/ShiftExpenseModal.jsx';
import ShiftCloseModal from '../components/pos/ShiftCloseModal.jsx';
import ShiftReportModal from '../components/pos/ShiftReportModal.jsx';
import ShiftStatus from '../components/pos/ShiftStatus.jsx';
import SearchBar from '../components/pos/SearchBar.jsx';

function POSPage({ onNavigate }) {
  const { products, refresh: loadProducts, loading, error: productsError } = useProducts();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 150);
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [selectedVariant, setSelectedVariant] = useState({});
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
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

  // نظام الورديات (Shift Management)
  const [activeShift, setActiveShift] = useState(null);
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

  useEffect(() => {
    async function loadCustomers() {
      if (window.electronAPI?.getAllCustomersWithStats) {
        try {
          const list = await window.electronAPI.getAllCustomersWithStats();
          setPosCustomers(list || []);
        } catch (err) {
          console.error('Failed to load customers for POS:', err);
        }
      }
    }
    loadCustomers();
  }, []);

  useEffect(() => {
    async function checkSubscription() {
      if (!selectedCustomerId) {
        setActiveSubscription(null);
        setUseSubscriptionCredit(false);
        return;
      }
      try {
        if (window.electronAPI?.getActiveSubscriptionByCustomer) {
          const sub = await window.electronAPI.getActiveSubscriptionByCustomer(selectedCustomerId);
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
      if (window.electronAPI?.getCurrentShift) {
        const current = await window.electronAPI.getCurrentShift();
        setActiveShift(current);
      }
    } catch (err) {
      console.error('خطأ في جلب بيانات الوردية:', err);
    }
  }, []);

  useEffect(() => {
    refreshShift();
  }, [refreshShift]);

  const searchInputRef = useRef(null);

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
          (v.sku && v.sku.toLowerCase().includes(term))
        );
      const matchesCategory = activeCategory === 'الكل' || p.categoryName === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, debouncedSearch, activeCategory]);

  function pickVariant(productId, variantId) {
    setSelectedVariant((prev) => ({ ...prev, [productId]: variantId }));
  }

  function addToCart(product) {
    const variantId = selectedVariant[product.id] || product.variants[0]?.id;
    const variant = product.variants?.find((v) => v.id === variantId) || product.variants[0];
    if (!variant || variant.stock_quantity === 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.variantId === variant.id);
      if (existing) {
        if (existing.quantity >= variant.stock_quantity) return prev;
        return prev.map((item) =>
          item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item
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
          maxStock: variant.stock_quantity,
        },
      ];
    });
  }

  function addScannedVariantToCart(variant) {
    if (!variant || variant.stock_quantity === 0) {
      playErrorBeep();
      setMessage({ type: 'error', text: `الصنف "${variant?.productName || ''}" غير متوفر بالمخزون حالياً` });
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.variantId === variant.id);
      if (existing) {
        if (existing.quantity >= variant.stock_quantity) {
          playErrorBeep();
          setMessage({
            type: 'warning',
            text: `الكمية في السلة (${existing.quantity}) وصلت للحد الأقصى المتاح بالمخزون!`,
          });
          return prev;
        }
        playSuccessBeep();
        setMessage({
          type: 'success',
          text: `تمت زيادة كمية "${variant.productName || 'المنتج'}" إلى ${existing.quantity + 1}`,
        });
        return prev.map((item) =>
          item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      playSuccessBeep();
      setMessage({
        type: 'success',
        text: `تمت إضافة "${variant.productName || 'المنتج'}" إلى السلة`,
      });
      return [
        ...prev,
        {
          variantId: variant.id,
          productName: variant.productName,
          size: variant.size,
          color: variant.color,
          unitPrice: variant.selling_price,
          quantity: 1,
          maxStock: variant.stock_quantity,
        },
      ];
    });
  }

  async function handleBarcodeScan(code) {
    if (!code) return;
    const cleanCode = normalizeBarcodeText(code);
    try {
      const variant = await window.electronAPI.getProductByBarcode(cleanCode);
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
      setMessage({ type: 'error', text: normalizeErrorMessage(err, 'فشل حفظ الفاتورة. لم يتم خصم المخزون.') });
    }
  }

  useBarcodeScanner(handleBarcodeScan);

  function changeQuantity(variantId, delta) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variantId !== variantId) return item;
          const newQty = item.quantity + delta;
          if (newQty < 1 || newQty > item.maxStock) return item;
          return { ...item, quantity: newQty };
        })
        .filter(Boolean)
    );
  }

  function removeFromCart(variantId) {
    setCart((prev) => prev.filter((item) => item.variantId !== variantId));
  }

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
    if (cart.length === 0) return;
    const newHold = {
      id: Date.now(),
      createdAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      cart: [...cart],
      discount,
      couponCode,
      paymentMethod,
      creditCustomerName,
      creditCustomerPhone,
      creditDueDate,
    };
    setHeldOrders((prev) => [newHold, ...prev]);
    clearCart();
    setMessage({ type: 'success', text: 'تم تعليق الفاتورة الحالية بنجاح ⏸️' });
  }, [cart, discount, couponCode, paymentMethod, creditCustomerName, creditCustomerPhone, creditDueDate, clearCart]);

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

  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100;
  const total = Math.round(Math.max(subtotal - Number(discount || 0), 0) * 100) / 100;
  const changeDue =
    paymentMethod === 'cash' && cashReceived !== ''
      ? Math.round(Math.max(Number(cashReceived) - total, 0) * 100) / 100
      : null;

  const isCreditInvalid = paymentMethod === 'credit' && (!creditCustomerName.trim() || !creditDueDate);
  const isCashInvalid = paymentMethod === 'cash' && cashReceived !== '' && Number(cashReceived) < total;

  const handleCompleteSale = useCallback(async () => {
    if (cart.length === 0 || isCreditInvalid || isCashInvalid) return;
    setMessage(null);
    try {
      const selectedCustomerObj = posCustomers.find(c => String(c.id) === String(selectedCustomerId));
      const result = await window.electronAPI.createSale({
        items: cart.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        discount: Number(discount || 0),
        paymentMethod,
        customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
        customerName: selectedCustomerObj ? selectedCustomerObj.name : creditCustomerName,
        customerPhone: selectedCustomerObj ? selectedCustomerObj.phone : creditCustomerPhone,
        dueDate: creditDueDate,
        subscriptionId: useSubscriptionCredit && activeSubscription ? activeSubscription.id : null,
        creditsDeducted: useSubscriptionCredit ? 1 : 0,
      });

      const fullSale = await window.electronAPI.getSaleById(result.saleId);
      if (fullSale) {
        setPrintableSale({
          ...fullSale,
          cashReceived: paymentMethod === 'cash' ? cashReceived : null,
          changeDue: paymentMethod === 'cash' ? changeDue : null,
        });

        playSuccessBeep();

        setTimeout(() => {
          window.print();
        }, 150);
      }

      clearCart();
      await loadProducts();
      refreshShift();
      setMessage({ type: 'success', text: `تم إتمام البيع بنجاح — فاتورة #${result.saleId}` });

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
  }, [cart, isCreditInvalid, isCashInvalid, discount, paymentMethod, creditCustomerName, creditCustomerPhone, creditDueDate, cashReceived, changeDue, clearCart, loadProducts, refreshShift, onNavigate, activeSubscription, posCustomers, selectedCustomerId, useSubscriptionCredit]);

  // دوال إدارة الوردية من الـ POS
  const handleOpenStartShiftModal = async () => {
    try {
      if (window.electronAPI) {
        const [lastClosed, sess] = await Promise.all([
          window.electronAPI.getLastClosedShift?.(),
          window.electronAPI.getSession?.(),
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
    await window.electronAPI.openShift(shiftData);
    await refreshShift();
    setMessage({ type: 'success', text: 'تم استلام الدرج وبدء الوردية بنجاح 🟢' });
  }

  async function handlePOSAddExpense(expenseData) {
    await window.electronAPI.addShiftExpense(expenseData);
    await refreshShift();
    setMessage({ type: 'success', text: 'تم تسجيل المصروف وخصمه من الدرج 💸' });
  }

  async function handlePOSCloseShift(closeData) {
    const closed = await window.electronAPI.closeShift(closeData);
    await refreshShift();
    setShiftPreviewReport({ shift: closed, reportType: 'Z' });
    setMessage({ type: 'success', text: 'تم تقفيل الوردية وإصدار تقرير Z-Report 🔒' });
  }

  async function handlePOSShowXReport() {
    try {
      const rep = await window.electronAPI.getShiftXReport();
      if (rep) {
        setShiftPreviewReport({ shift: rep, reportType: 'X' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'فشل استخراج التقرير' });
    }
  }

  // Keyboard Shortcuts (F1 focus search, F2 hold, F3 show held, F4 discount, F9 cash checkout, F10 credit checkout, Esc confirms/close)
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
        case 'F9':
          e.preventDefault();
          setPaymentMethod('cash');
          handleCompleteSale();
          break;
        case 'F10':
          e.preventDefault();
          setPaymentMethod('credit');
          handleCompleteSale();
          break;
        case 'Escape':
          e.preventDefault();
          // Close any open modal first
          if (showHeldModal) setShowHeldModal(false);
          if (showShiftOpenModal) setShowShiftOpenModal(false);
          if (showShiftExpenseModal) setShowShiftExpenseModal(false);
          if (showShiftCloseModal) setShowShiftCloseModal(false);
          if (showDiscountModal) setShowDiscountModal(false);
          // Then confirm clear cart if it has items
          if (cart.length) {
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
  }, [cart, showHeldModal, showShiftOpenModal, showShiftExpenseModal, showShiftCloseModal, showDiscountModal, handleHoldCurrentOrder, handleCompleteSale, setPaymentMethod, clearCart]);

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
    <div className="pos-page-wrapper">
      {/* كومبوننت طباعة الفاتورة */}
      <ReceiptPrint sale={printableSale} />

      {/* Main Left: Cart & Payment */}
      <div className="pos-cart-container">
        <CartPanel
          cart={cart}
          changeQuantity={changeQuantity}
          removeFromCart={removeFromCart}
          clearCart={clearCart}
          onHoldOrder={handleHoldCurrentOrder}
          heldOrdersCount={heldOrders.length}
          onShowHeldOrders={() => setShowHeldModal(true)}
          discount={discount}
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          couponMessage={couponMessage}
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
        />
      </div>

      {/* Main Right: Catalog & Search */}
      <div className="pos-catalog-container">
        {/* Top Control Bar */}
        <div className="pos-top-control-bar">
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
          />

          <ShiftStatus
            activeShift={activeShift}
            posSessionUser={posSessionUser}
            onOpenShiftModal={() => setShowShiftExpenseModal(true)}
            onOpenExpenseModal={() => setShowShiftOpenModal(true)}
            onShowXReport={handlePOSShowXReport}
            onCloseShiftModal={() => setShowShiftCloseModal(true)}
            onOpenStartShiftModal={handleOpenStartShiftModal}
            playSuccessBeep={playSuccessBeep}
            setMessage={setMessage}
          />

            <div className="scanner-status-chip" title="الماسح الضوئي متصل وجاهز للاستخدام">
              <span className="scanner-dot"></span>
              <span>الماسح متصل</span>
            </div>
          </div>

        {/* Category Pills Navigation */}
        <div className="pos-category-nav">
          {categoriesWithCounts.map((cat) => (
            <button
              key={cat.name}
              type="button"
              className={`pos-category-chip ${activeCategory === cat.name ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.name)}
            >
              <span className="chip-name">{cat.name}</span>
              <span className="chip-count">{cat.count}</span>
            </button>
          ))}
        </div>

        {/* Products Grid Area */}
        <div className="pos-products-scroll-area">
          {productsError && (
            <div className="pos-products-error-card">
              <span>⚠️</span>
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
            />
          )}
        </div>
      </div>

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
    </div>
  );
}

export default POSPage;