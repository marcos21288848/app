
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// --- Initial Data & Constants ---
const initialBranches = [
  { id: 'main', name: 'الفرع الرئيسي' },
  { id: 'jeddah', name: 'مخزن جدة' },
  { id: 'dammam', name: 'فرع الدمام' },
];

const initialFormState = {
  name: '',
  sku: '',
  price: 0,
  description: '',
  stock: {},
};

const CURRENCIES = {
    'SAR': 'ريال سعودي',
    'USD': 'دولار أمريكي',
    'EUR': 'يورو',
    'EGP': 'جنيه مصري'
};

// --- Helper Functions ---
const formatCurrency = (amount, currency) => {
    try {
        return new Intl.NumberFormat('ar', { style: 'currency', currency }).format(amount);
    } catch (e) {
        // Fallback for invalid currency codes
        return `${amount} ${currency}`;
    }
};

// --- Toast Notification Components ---
const Toast = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000); // Auto-close after 4 seconds
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`toast toast-${type}`}>
            <span>{message}</span>
            <button onClick={onClose} className="toast-close-btn">&times;</button>
        </div>
    );
};

const ToastContainer = ({ toasts, removeToast }) => (
    <div className="toast-container">
        {toasts.map(toast => (
            <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
        ))}
    </div>
);


// --- Barcode Scanner Component ---
const BarcodeScanner = ({ onScan, onClose }) => {
    const videoRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let stream = null;
        let animationFrameId = null;

        const startScan = async () => {
            if (!('BarcodeDetector' in window)) {
                setError("متصفحك لا يدعم قارئ الباركود.");
                return;
            }

            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                const barcodeDetector = new window.BarcodeDetector({ formats: ['ean_13', 'code_128', 'qr_code'] });

                const detect = async () => {
                    if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
                        try {
                            const barcodes = await barcodeDetector.detect(videoRef.current);
                            if (barcodes.length > 0) {
                                onScan(barcodes[0].rawValue);
                                onClose();
                            }
                        } catch (err) {
                            console.error("Barcode detection failed:", err);
                        }
                    }
                    animationFrameId = requestAnimationFrame(detect);
                };
                detect();

            } catch (err) {
                console.error("Error accessing camera:", err);
                setError("لا يمكن الوصول إلى الكاميرا. الرجاء التحقق من الأذونات.");
            }
        };

        startScan();

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [onScan, onClose]);

    return (
        <div className="scanner-overlay" onClick={onClose}>
            <div className="scanner-modal" onClick={e => e.stopPropagation()}>
                <h3>وجه الكاميرا نحو الباركود</h3>
                {error && <p className="scanner-error">{error}</p>}
                <video ref={videoRef} playsInline style={{ width: '100%', maxHeight: '70vh' }}></video>
                <button onClick={onClose} className="btn btn-secondary">إغلاق</button>
            </div>
        </div>
    );
};


// --- Main Application Component ---
const InventoryManager = () => {
  // --- State Management ---
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [currentView, setCurrentView] = useState('inventory');
  const [isLoading, setIsLoading] = useState(true);
  const [currency, setCurrency] = useState('SAR');
  const [toasts, setToasts] = useState([]);
  const [scannerTarget, setScannerTarget] = useState(null);

  // Inventory Management State
  const [formData, setFormData] = useState(() => {
    const stock = {};
    initialBranches.forEach(b => stock[b.id] = 0);
    return { ...initialFormState, stock };
  });
  const [isEditing, setIsEditing] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('name-asc');


  // POS State
  const [cart, setCart] = useState([]);
  const [posSearchTerm, setPosSearchTerm] = useState('');

  // Branch Management State
  const [newBranchName, setNewBranchName] = useState('');

  // --- Toast Notification Logic ---
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };


  // --- Effects for Data Persistence ---
  useEffect(() => {
    try {
        const savedProducts = localStorage.getItem('inventory_products');
        if (savedProducts) setProducts(JSON.parse(savedProducts));
        
        const savedBranches = localStorage.getItem('inventory_branches');
        setBranches(savedBranches ? JSON.parse(savedBranches) : initialBranches);

        const savedCurrency = localStorage.getItem('inventory_currency');
        if (savedCurrency) setCurrency(savedCurrency);

    } catch (error) {
      console.error("Failed to load data from local storage:", error);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if(!isLoading) {
        try {
            localStorage.setItem('inventory_products', JSON.stringify(products));
            localStorage.setItem('inventory_branches', JSON.stringify(branches));
            localStorage.setItem('inventory_currency', currency);
        } catch (error) {
            console.error("Failed to save data to local storage:", error);
        }
    }
  }, [products, branches, currency, isLoading]);

  useEffect(() => {
    // Update form data when branches change
    const stock = {};
    branches.forEach(b => {
        stock[b.id] = formData.stock[b.id] || 0;
    });
    setFormData(prev => ({ ...prev, stock }));
  }, [branches]);


  // --- Event Handlers (Inventory) ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('stock-')) {
        const branchId = name.split('-')[1];
        setFormData(prev => ({ ...prev, stock: { ...prev.stock, [branchId]: parseFloat(value) || 0 } }));
    } else {
        setFormData(prev => ({ ...prev, [name]: name === 'price' ? parseFloat(value) || 0 : value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.sku) {
        showToast("الرجاء إدخال اسم المنتج و SKU.", 'error');
        return;
    }
    const productStock = branches.map(branch => ({ branchId: branch.id, quantity: formData.stock[branch.id] || 0 }));

    if (isEditing) {
      setProducts(products.map(p => p.id === isEditing ? { ...p, ...formData, stock: productStock } : p));
      showToast('تم تحديث المنتج بنجاح!', 'success');
    } else {
      const newProduct = { id: Date.now().toString(), ...formData, stock: productStock };
      setProducts([...products, newProduct]);
      showToast('تم إضافة المنتج بنجاح!', 'success');
    }
    resetForm();
  };
  
  const handleEdit = (product) => {
    setCurrentView('inventory');
    setIsEditing(product.id);
    const stockForForm = product.stock.reduce((acc, item) => {
        acc[item.branchId] = item.quantity;
        return acc;
    }, {});
    setFormData({ name: product.name, sku: product.sku, price: product.price, description: product.description || '', stock: stockForForm });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (productId) => {
    if (window.confirm("هل أنت متأكد من رغبتك في حذف هذا المنتج؟")) {
      setProducts(products.filter(p => p.id !== productId));
      if (isEditing === productId) resetForm();
      showToast('تم حذف المنتج بنجاح.', 'info');
    }
  };
  
  const resetForm = () => {
    setIsEditing(null);
    const stock = {};
    branches.forEach(b => stock[b.id] = 0);
    setFormData({ ...initialFormState, stock });
  };
  
  const getTotalQuantity = (stock) => stock.reduce((total, item) => total + item.quantity, 0);

  const filteredAndSortedProducts = products
    .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
        const [key, direction] = sortOption.split('-');
        const dir = direction === 'asc' ? 1 : -1;
        if (key === 'name') return a.name.localeCompare(b.name) * dir;
        if (key === 'sku') return a.sku.localeCompare(b.sku) * dir;
        if (key === 'quantity') return (getTotalQuantity(a.stock) - getTotalQuantity(b.stock)) * dir;
        return 0;
    });

  const totalFilteredQuantity = filteredAndSortedProducts.reduce((total, p) => total + getTotalQuantity(p.stock), 0);


  // --- Event Handlers (POS) ---
  const handlePosSearch = (e) => {
    e.preventDefault();
    if (!posSearchTerm) return;
    const foundProduct = products.find(p => p.sku.toLowerCase() === posSearchTerm.toLowerCase());
    if (foundProduct) {
        addToCart(foundProduct.id);
        showToast(`تمت إضافة "${foundProduct.name}" إلى السلة.`, 'success');
        setPosSearchTerm('');
    } else {
        showToast('المنتج غير موجود.', 'error');
    }
  };

  const addToCart = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingCartItemIndex = cart.findIndex(item => item.productId === productId);
    const firstAvailableBranch = product.stock.find(s => s.quantity > 0)?.branchId;
    
    if (existingCartItemIndex > -1) {
        const updatedCart = [...cart];
        updatedCart[existingCartItemIndex].quantity += 1;
        setCart(updatedCart);
    } else if (firstAvailableBranch) {
        setCart([...cart, { productId, quantity: 1, branchId: firstAvailableBranch }]);
    } else {
        showToast("هذا المنتج غير متوفر في أي فرع.", 'error');
    }
  };

  const updateCartItem = (productId, newQuantity, newBranchId) => {
      setCart(cart.map(item => {
          if (item.productId === productId) {
              return {
                  ...item,
                  quantity: newQuantity !== undefined ? Math.max(0, newQuantity) : item.quantity,
                  branchId: newBranchId || item.branchId
              };
          }
          return item;
      }).filter(item => item.quantity > 0)); // Remove item if quantity is 0
  };
  
  const handleCompleteSale = () => {
    // Validation
    for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        const branchStock = product?.stock.find(s => s.branchId === item.branchId)?.quantity || 0;
        if (item.quantity > branchStock) {
            showToast(`الكمية غير كافية لمنتج "${product?.name}" في الفرع المحدد.`, 'error');
            return;
        }
    }

    // Update stock
    let updatedProducts = [...products];
    cart.forEach(item => {
        updatedProducts = updatedProducts.map(p => {
            if (p.id === item.productId) {
                const newStock = p.stock.map(s => {
                    if (s.branchId === item.branchId) {
                        return { ...s, quantity: s.quantity - item.quantity };
                    }
                    return s;
                });
                return { ...p, stock: newStock };
            }
            return p;
        });
    });

    setProducts(updatedProducts);
    setCart([]);
    showToast('تمت عملية البيع بنجاح!', 'success');
  };

  const cartTotal = cart.reduce((total, item) => {
      const product = products.find(p => p.id === item.productId);
      return total + (product?.price || 0) * item.quantity;
  }, 0);

   // --- Event Handlers (Scanner) ---
  const handleScan = (value) => {
    switch (scannerTarget) {
        case 'form':
            setFormData(prev => ({ ...prev, sku: value }));
            showToast('تم التقاط SKU بنجاح.', 'success');
            break;
        case 'search':
            setSearchTerm(value);
            break;
        case 'pos':
            const foundProduct = products.find(p => p.sku.toLowerCase() === value.toLowerCase());
            if (foundProduct) {
                addToCart(foundProduct.id);
                showToast(`تمت إضافة "${foundProduct.name}" إلى السلة.`, 'success');
            } else {
                showToast('المنتج غير موجود.', 'error');
            }
            break;
    }
    setScannerTarget(null); // Close scanner after scan
  };

  // --- Event Handlers (Branch Management) ---
  const handleAddBranch = (e) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    const newBranch = { id: Date.now().toString(), name: newBranchName.trim() };
    setBranches([...branches, newBranch]);
    // Add new branch with 0 stock to all existing products
    setProducts(products.map(p => ({
        ...p,
        stock: [...p.stock, { branchId: newBranch.id, quantity: 0 }]
    })));
    setNewBranchName('');
    showToast(`تم إضافة فرع "${newBranch.name}" بنجاح.`, 'success');
  };

  const handleDeleteBranch = (branchId) => {
      if (branches.length <= 1) {
          showToast("يجب أن يكون هناك فرع واحد على الأقل.", 'error');
          return;
      }
      if (window.confirm("سيتم حذف الفرع وكل المخزون المرتبط به. هل أنت متأكد؟")) {
          setBranches(branches.filter(b => b.id !== branchId));
          // Remove stock data for the deleted branch from all products
          setProducts(products.map(p => ({
              ...p,
              stock: p.stock.filter(s => s.branchId !== branchId)
          })));
          showToast('تم حذف الفرع.', 'info');
      }
  };
  
  // --- Icons ---
  const cameraIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM10.22 3.22 11.25 2H13.5l1.03 1.22H17.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h2.72Z"/>
    </svg>
  );

  // --- Render Logic ---
  if (isLoading) {
      return <div className="loading-spinner" aria-label="جاري التحميل"><div></div><div></div><div></div></div>;
  }

  const renderInventoryManagement = () => (
    <main>
      <aside>
        <div className="form-card">
          <h2 id="form-heading">{isEditing ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2>
          <form onSubmit={handleSubmit} aria-labelledby="form-heading">
            <div className="form-group"><label htmlFor="name">اسم المنتج</label><input type="text" id="name" name="name" value={formData.name} onChange={handleInputChange} required /></div>
            <div className="form-group"><label htmlFor="sku">SKU (رمز المنتج)</label><div className="input-with-icon"><input type="text" id="sku" name="sku" value={formData.sku} onChange={handleInputChange} required /><button type="button" className="icon-btn" onClick={() => setScannerTarget('form')} aria-label="مسح الباركود لـ SKU">{cameraIcon}</button></div></div>
            <div className="form-group"><label>كميات الفروع</label><div className="branch-quantities">{branches.map(branch => (<div className="branch-quantity-input" key={branch.id}><label htmlFor={`stock-${branch.id}`}>{branch.name}</label><input type="number" id={`stock-${branch.id}`} name={`stock-${branch.id}`} value={formData.stock[branch.id] || ''} onChange={handleInputChange} min="0" required /></div>))}</div></div>
            <div className="form-group"><label htmlFor="price">السعر</label><input type="number" id="price" name="price" value={formData.price} onChange={handleInputChange} min="0" step="0.01" required /></div>
            <div className="form-group"><label htmlFor="description">الوصف (اختياري)</label><textarea id="description" name="description" value={formData.description || ''} onChange={handleInputChange} rows={3}></textarea></div>
            <div className="form-actions"><button type="submit" className="btn btn-primary">{isEditing ? 'تحديث المنتج' : 'إضافة المنتج'}</button>{isEditing && (<button type="button" className="btn btn-secondary" onClick={resetForm}>إلغاء</button>)}</div>
          </form>
        </div>
      </aside>
      <section>
        <div className="inventory-card">
            <div className="inventory-header">
                <h2>قائمة المنتجات</h2>
                 <div className="controls-wrapper">
                    <select className="sort-dropdown" value={sortOption} onChange={e => setSortOption(e.target.value)} aria-label="فرز المنتجات">
                        <option value="name-asc">الاسم (أ - ي)</option>
                        <option value="name-desc">الاسم (ي - أ)</option>
                        <option value="sku-asc">SKU (تصاعدي)</option>
                        <option value="sku-desc">SKU (تنازلي)</option>
                        <option value="quantity-desc">الكمية (الأعلى أولاً)</option>
                        <option value="quantity-asc">الكمية (الأقل أولاً)</option>
                    </select>
                    <div className="input-with-icon search-bar-wrapper">
                        <input type="search" placeholder="ابحث بالاسم أو SKU..." className="search-bar" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="البحث في المنتجات"/>
                        <button type="button" className="icon-btn" onClick={() => setScannerTarget('search')} aria-label="بحث بالباركود">{cameraIcon}</button>
                    </div>
                </div>
            </div>
            <div className="inventory-summary"><div className="summary-item"><span>إجمالي المنتجات</span><strong>{filteredAndSortedProducts.length}</strong></div><div className="summary-item"><span>إجمالي الكمية</span><strong>{totalFilteredQuantity.toLocaleString('ar-EG')}</strong></div></div>
            {filteredAndSortedProducts.length > 0 ? (<ul className="product-list">{filteredAndSortedProducts.map(p => (<li key={p.id} className="product-item"><header><h3>{p.name}</h3><p className="sku">SKU: {p.sku}</p></header><p className="product-description">{p.description||'لا يوجد وصف.'}</p><div className="product-details"><div>الكمية: <span>{getTotalQuantity(p.stock)}</span></div><div>السعر: <span>{formatCurrency(p.price, currency)}</span></div></div><div className="product-stock-breakdown">{p.stock.filter(s=>s.quantity>0).map(s => { const b = branches.find(br=>br.id===s.branchId); return b ? <p key={s.branchId}>{b.name}: <span>{s.quantity}</span></p>:null; })}</div><div className="product-actions"><button className="btn btn-sm btn-edit" onClick={()=>handleEdit(p)}>تعديل</button><button className="btn btn-sm btn-delete" onClick={()=>handleDelete(p.id)}>حذف</button></div></li>))}</ul>) : (<div className="no-products"><p>{products.length > 0 ? "لم يتم العثور على منتجات." : "المخزون فارغ."}</p></div>)}
        </div>
      </section>
    </main>
  );

  const renderPointOfSale = () => (
    <main className="pos-view">
        <section className="pos-main">
            <div className="inventory-card">
                 <form onSubmit={handlePosSearch} className="pos-search-form">
                    <label htmlFor="pos-search" className="sr-only">امسح الباركود أو أدخل SKU</label>
                    <div className="input-with-icon search-bar-wrapper">
                         <input
                            type="text"
                            id="pos-search"
                            placeholder="امسح أو أدخل SKU..."
                            className="search-bar"
                            value={posSearchTerm}
                            onChange={(e) => setPosSearchTerm(e.target.value)}
                            autoFocus
                        />
                        <button type="button" className="icon-btn" onClick={() => setScannerTarget('pos')} aria-label="مسح باركود المنتج">{cameraIcon}</button>
                    </div>
                    <button type="submit" className="btn btn-primary">إضافة</button>
                 </form>
                 <div className="product-grid-pos">
                    {products.filter(p => getTotalQuantity(p.stock) > 0).map(product => (
                        <button key={product.id} className="product-grid-item" onClick={() => addToCart(product.id)}>
                            <strong>{product.name}</strong>
                            <span>{formatCurrency(product.price, currency)}</span>
                            <small>الكمية: {getTotalQuantity(product.stock)}</small>
                        </button>
                    ))}
                 </div>
            </div>
        </section>
        <aside className="pos-sidebar">
            <div className="form-card">
                <h2>سلة المبيعات</h2>
                {cart.length === 0 ? (
                    <p className="empty-cart-message">السلة فارغة.</p>
                ) : (
                    <>
                    <ul className="cart-items-list">
                        {cart.map(item => {
                            const product = products.find(p => p.id === item.productId);
                            if (!product) return null;
                            const availableBranches = product.stock.filter(s => s.quantity > 0 || s.branchId === item.branchId);
                            return (
                                <li key={item.productId} className="cart-item">
                                    <div className="cart-item-info">
                                        <strong>{product.name}</strong>
                                        <span>{formatCurrency(product.price * item.quantity, currency)}</span>
                                    </div>
                                    <div className="cart-item-controls">
                                        <select 
                                            value={item.branchId} 
                                            onChange={(e) => updateCartItem(item.productId, undefined, e.target.value)}
                                            aria-label={`فرع ${product.name}`}
                                        >
                                            {availableBranches.map(s => {
                                                const branch = branches.find(b => b.id === s.branchId);
                                                return <option key={s.branchId} value={s.branchId}>{branch?.name} ({s.quantity})</option>
                                            })}
                                        </select>
                                        <input 
                                            type="number" 
                                            value={item.quantity}
                                            onChange={(e) => updateCartItem(item.productId, parseInt(e.target.value, 10))}
                                            min="1"
                                            aria-label={`كمية ${product.name}`}
                                        />
                                        <button onClick={() => updateCartItem(item.productId, 0)} className="btn-delete-sm" aria-label={`حذف ${product.name}`}>&times;</button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="cart-total">
                        <strong>الإجمالي:</strong>
                        <span>{formatCurrency(cartTotal, currency)}</span>
                    </div>
                    <button 
                        className="btn btn-primary btn-block" 
                        onClick={handleCompleteSale}
                        disabled={cart.length === 0}
                    >
                        إتمام البيع
                    </button>
                    </>
                )}
            </div>
        </aside>
    </main>
  );

  const renderBranchManagement = () => (
    <div className="settings-view">
        <div className="inventory-card">
            <h2>إدارة الفروع</h2>
            <form onSubmit={handleAddBranch} className="add-branch-form">
                <input 
                    type="text" 
                    value={newBranchName} 
                    onChange={(e) => setNewBranchName(e.target.value)} 
                    placeholder="اسم الفرع الجديد"
                    aria-label="اسم الفرع الجديد"
                    required
                />
                <button type="submit" className="btn btn-primary">إضافة فرع</button>
            </form>
            <ul className="branch-list">
                {branches.map(branch => (
                    <li key={branch.id} className="branch-list-item">
                        <span>{branch.name}</span>
                        <button 
                            className="btn btn-sm btn-delete" 
                            onClick={() => handleDeleteBranch(branch.id)}
                            disabled={branches.length <= 1}
                            aria-label={`حذف فرع ${branch.name}`}
                        >
                            حذف
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    </div>
  );

  return (
    <>
      <style>{`
        /* --- General & Layout Styles --- */
        .container { max-width: 1600px; margin: 0 auto; padding: 2rem; }
        header { background-color: var(--dark-color); color: var(--light-color); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        header h1 { margin: 0; font-size: 1.75rem; }
        .header-controls { display: flex; align-items: center; gap: 1.5rem; }
        .main-nav button { background: none; border: none; color: #f0f0f0; font-size: 1rem; cursor: pointer; padding: 0.5rem 1rem; border-radius: var(--border-radius); transition: background-color 0.2s; }
        .main-nav button.active, .main-nav button:hover { background-color: rgba(255,255,255,0.15); }
        .currency-selector select { background: #555; color: white; border: 1px solid #777; border-radius: var(--border-radius); padding: 0.5rem; }
        main { display: grid; grid-template-columns: 400px 1fr; gap: 2rem; margin-top: 2rem; align-items: start; }
        @media (max-width: 992px) { main { grid-template-columns: 1fr; } }

        /* --- Form Styles --- */
        .form-card, .inventory-card { background-color: var(--background-color); border-radius: var(--border-radius); box-shadow: var(--box-shadow); padding: 2rem; }
        .form-card { position: sticky; top: 2rem; }
        .form-card h2 { margin-top: 0; border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-size: 1.5rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 600; }
        .form-group input, .form-group textarea { width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: var(--border-radius); box-sizing: border-box; transition: border-color 0.2s; }
        .form-group input:focus, .form-group textarea:focus { outline: none; border-color: var(--primary-color); box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25); }
        .input-with-icon { position: relative; }
        .input-with-icon input { padding-left: 2.8rem; }
        .icon-btn { position: absolute; left: 1px; top: 1px; bottom: 1px; width: 2.7rem; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--secondary-color); padding: 0; transition: color 0.2s; }
        .icon-btn:hover { color: var(--primary-color); }
        .icon-btn svg { width: 20px; height: 20px; }
        .branch-quantities { border: 1px solid #eee; border-radius: var(--border-radius); padding: 1rem; margin-top: 0.5rem; }
        .branch-quantity-input { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .branch-quantity-input:last-child { margin-bottom: 0; }
        .branch-quantity-input label { margin-bottom: 0; font-weight: normal; }
        .branch-quantity-input input { width: 80px; text-align: center; }
        .form-actions { display: flex; gap: 1rem; margin-top: 1.5rem; }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: var(--border-radius); cursor: pointer; font-weight: bold; font-size: 1rem; transition: background-color 0.2s, opacity 0.2s; text-align: center; }
        .btn:hover:not(:disabled) { opacity: 0.85; }
        .btn-primary { background-color: var(--primary-color); color: white; }
        .btn-secondary { background-color: var(--secondary-color); color: white; }
        .btn-block { display: block; width: 100%; }

        /* --- Inventory List Styles --- */
        .inventory-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .inventory-header h2 { margin: 0; font-size: 1.5rem; }
        .controls-wrapper { display: flex; gap: 1rem; align-items: center; }
        .sort-dropdown { padding: 0.75rem; border-radius: var(--border-radius); border: 1px solid #ccc; background-color: white; }
        .search-bar-wrapper { position: relative; min-width: 250px; flex-grow: 1; }
        .search-bar { width: 100%; box-sizing: border-box; padding: 0.75rem; padding-left: 2.8rem; border: 1px solid #ccc; border-radius: var(--border-radius); }
        .inventory-summary { display: flex; gap: 1.5rem; background-color: var(--light-color); padding: 1rem; border-radius: var(--border-radius); margin-bottom: 1.5rem; border: 1px solid #e0e0e0; }
        .summary-item { flex: 1; text-align: center; background: white; padding: 1rem; border-radius: var(--border-radius); box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
        .summary-item span { display: block; font-size: 0.9rem; color: var(--secondary-color); margin-bottom: 0.25rem; }
        .summary-item strong { font-size: 1.75rem; color: var(--primary-color); }
        .product-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
        .product-item { background: #fdfdfd; border: 1px solid #eee; border-radius: var(--border-radius); padding: 1.5rem; box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; }
        .product-item:hover { transform: translateY(-5px); box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        .product-item h3 { margin: 0 0 0.5rem 0; color: var(--primary-color); }
        .product-item .sku { font-size: 0.9rem; color: var(--secondary-color); margin-bottom: 1rem; }
        .product-details, .product-stock-breakdown { margin-bottom: 1rem; font-size: 1rem; border-top: 1px solid #eee; padding-top: 1rem; }
        .product-details { display: flex; justify-content: space-between; }
        .product-details span, .product-stock-breakdown span { font-weight: bold; }
        .product-stock-breakdown { padding-top: 0.5rem; margin-bottom: 0; border-top: none; }
        .product-stock-breakdown p { font-size: 0.9rem; color: #333; margin: 0 0 0.25rem; display: flex; justify-content: space-between; }
        .product-description { color: #555; margin-bottom: 1.5rem; flex-grow: 1; font-size: 0.95rem; line-height: 1.5; }
        .product-actions { display: flex; gap: 0.5rem; margin-top: auto; }
        .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.875rem; flex-grow: 1; }
        .btn-edit { background-color: var(--success-color); color: white; }
        .btn-delete { background-color: var(--danger-color); color: white; }
        .no-products { text-align: center; padding: 3rem; color: var(--secondary-color); background: #fdfdfd; border: 2px dashed #ddd; border-radius: var(--border-radius); }
        
        /* --- Point of Sale (POS) Styles --- */
        .pos-view { grid-template-columns: 1fr 420px; }
        @media (max-width: 1200px) { .pos-view { grid-template-columns: 1fr; } .pos-sidebar { margin-top: 2rem; } }
        .pos-search-form { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
        .pos-search-form .search-bar-wrapper { flex-grow: 1; }
        .product-grid-pos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; max-height: 65vh; overflow-y: auto; padding: 0.5rem; }
        .product-grid-item { background-color: #fff; border: 1px solid #ddd; border-radius: var(--border-radius); padding: 1rem; text-align: center; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; justify-content: space-between; }
        .product-grid-item:hover { border-color: var(--primary-color); box-shadow: 0 2px 8px rgba(0,123,255,0.2); transform: translateY(-3px); }
        .product-grid-item strong { display: block; margin-bottom: 0.5rem; }
        .product-grid-item span { font-weight: bold; color: var(--success-color); }
        .product-grid-item small { color: var(--secondary-color); font-size: 0.8rem; margin-top: 0.5rem; }
        .empty-cart-message { color: var(--secondary-color); text-align: center; padding: 2rem 0; }
        .cart-items-list { list-style: none; padding: 0; margin: 0 0 1.5rem 0; }
        .cart-item { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 0; border-bottom: 1px solid #eee; }
        .cart-item-info { display: flex; justify-content: space-between; align-items: center; }
        .cart-item-controls { display: flex; gap: 0.5rem; align-items: center; }
        .cart-item-controls select, .cart-item-controls input { padding: 0.5rem; border: 1px solid #ccc; border-radius: var(--border-radius); }
        .cart-item-controls input { width: 60px; text-align: center; }
        .cart-item-controls select { flex-grow: 1; }
        .btn-delete-sm { background: var(--danger-color); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-weight: bold; cursor: pointer; line-height: 24px; padding: 0; }
        .cart-total { display: flex; justify-content: space-between; font-size: 1.5rem; font-weight: bold; margin-bottom: 1.5rem; padding-top: 1rem; border-top: 2px solid var(--primary-color); }
        
        /* --- Branch Management Styles --- */
        .settings-view { max-width: 800px; margin: 2rem auto; }
        .add-branch-form { display: flex; gap: 1rem; margin-bottom: 2rem; }
        .add-branch-form input { flex-grow: 1; padding: 0.75rem; border: 1px solid #ccc; border-radius: var(--border-radius); }
        .branch-list { list-style: none; padding: 0; }
        .branch-list-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: #f9f9f9; border-radius: var(--border-radius); margin-bottom: 0.5rem; }
        .branch-list-item button:disabled { opacity: 0.5; cursor: not-allowed; }

        /* --- Barcode Scanner Styles --- */
        .scanner-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .scanner-modal { background: white; padding: 2rem; border-radius: var(--border-radius); max-width: 90%; width: 500px; text-align: center; }
        .scanner-error { color: var(--danger-color); font-weight: bold; }
        
        /* --- Toast Notifications --- */
        .toast-container { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 2000; display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-end; }
        .toast { background-color: var(--dark-color); color: white; padding: 1rem 1.5rem; border-radius: var(--border-radius); box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 1rem; animation: slideIn 0.3s ease-out; min-width: 300px; max-width: 400px; }
        .toast-success { background-color: var(--success-color); }
        .toast-error { background-color: var(--danger-color); }
        .toast-info { background-color: #0d6efd; }
        .toast-close-btn { background: none; border: none; color: inherit; opacity: 0.7; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1; margin-right: -0.5rem; margin-left: auto; }
        .toast-close-btn:hover { opacity: 1; }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        /* --- Utility & Loading --- */
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
        .loading-spinner { display: flex; justify-content: center; align-items: center; height: 100vh; }
        .loading-spinner div { box-sizing: border-box; display: block; position: absolute; width: 64px; height: 64px; margin: 8px; border: 8px solid var(--primary-color); border-radius: 50%; animation: lds-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite; border-color: var(--primary-color) transparent transparent transparent; }
        .loading-spinner div:nth-child(1) { animation-delay: -0.45s; }
        .loading-spinner div:nth-child(2) { animation-delay: -0.3s; }
        .loading-spinner div:nth-child(3) { animation-delay: -0.15s; }
        @keyframes lds-ring { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
      <header>
        <h1>نظام إدارة المخازن</h1>
        <div className="header-controls">
            <nav className="main-nav">
                <button onClick={() => setCurrentView('inventory')} className={currentView === 'inventory' ? 'active' : ''}>إدارة المخزون</button>
                <button onClick={() => setCurrentView('pos')} className={currentView === 'pos' ? 'active' : ''}>نقطة البيع</button>
                <button onClick={() => setCurrentView('branches')} className={currentView === 'branches' ? 'active' : ''}>إدارة الفروع</button>
            </nav>
            <div className="currency-selector">
                <label htmlFor="currency" className="sr-only">اختر العملة</label>
                <select id="currency" value={currency} onChange={e => setCurrency(e.target.value)}>
                    {Object.entries(CURRENCIES).map(([code, name]) => (
                        <option key={code} value={code}>{name} ({code})</option>
                    ))}
                </select>
            </div>
        </div>
      </header>
      <div className="container">
        {currentView === 'inventory' && renderInventoryManagement()}
        {currentView === 'pos' && renderPointOfSale()}
        {currentView === 'branches' && renderBranchManagement()}
      </div>
      {scannerTarget && <BarcodeScanner onScan={handleScan} onClose={() => setScannerTarget(null)} />}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
};

// --- Render the Application ---
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<React.StrictMode><InventoryManager /></React.StrictMode>);
}

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.log('ServiceWorker registration failed: ', error);
    });
  });
}
