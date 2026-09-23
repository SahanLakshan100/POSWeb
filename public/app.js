const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const money = (v) => `$${Number(v).toFixed(2)}`;
const EMOJI = { Coffee:'☕', Tea:'🍵', Bakery:'🥐', Food:'🥪', Other:'📦' };

let allProducts = [];
let allCategories = [];
let activeCategory = 'All';
let cart = [];
let paymentMethod = 'Cash';
let taxRate = 8;
let currentStockMode = 'in';

function showToast(msg) {
  const t = $('#toast');
  if (!t) { alert(msg); return; }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ============================================================
   LOGIN GATE
   ============================================================ */
async function handlePosLogin(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.get('username'),
        password: form.get('password'),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Invalid credentials');
    sessionStorage.setItem('pos-cashier', 'true');
    document.getElementById('pos-login').classList.add('hidden');
    loadProducts();
  } catch (e) {
    showToast(e.message || 'Login failed');
  }
}

/* ============================================================
   LOAD FROM API
   ============================================================ */
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error('categories ' + res.status);
    allCategories = await res.json();
  } catch (e) {
    console.error('Category load failed:', e);
    allCategories = [];
  }
}

async function loadProducts() {
  try {
    const [productsRes, settingsRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/settings'),
      loadCategories(),
    ]);
    if (!productsRes.ok) throw new Error('API ' + productsRes.status);
    allProducts = await productsRes.json();
    const settings = await settingsRes.json();
    taxRate = settings.taxRate || 8;
    renderCategories();
    renderProducts();
  } catch (e) {
    console.error(e);
    $('#products').innerHTML = `<div class="no-products">Failed to load: ${e.message}</div>`;
  }
}

/* ============================================================
   CATEGORY FILTER ROW (from DB)
   ============================================================ */
function renderCategories() {
  const items = [
    { name: 'All', icon: '◈' },
    ...allCategories.map((c) => ({ name: c.name, icon: c.icon || '📦' })),
  ];

  $('#category-row').innerHTML = items.map((c) => `
    <button class="category${c.name === activeCategory ? ' active' : ''}" data-cat="${c.name}">
      ${c.name === 'All' ? 'All items' : `${c.icon} ${c.name}`}
    </button>`).join('');

  $$('.category').forEach((btn) => {
    btn.onclick = () => {
      activeCategory = btn.dataset.cat;
      renderCategories();
      renderProducts();
    };
  });
}

/* ============================================================
   PRODUCTS GRID
   ============================================================ */
function iconFor(categoryName) {
  const cat = allCategories.find((c) => c.name === categoryName);
  if (cat && cat.icon) return cat.icon;
  return EMOJI[categoryName] || '📦';
}

function renderProducts() {
  const q = $('#search').value.trim().toLowerCase();
  const list = allProducts.filter((p) => {
    const okCat = activeCategory === 'All' || p.category === activeCategory;
    const okQ = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    return okCat && okQ;
  });

  if (!list.length) {
    $('#products').innerHTML = `<div class="no-products">No products match your filter.</div>`;
    return;
  }

  $('#products').innerHTML = list.map((p) => {
    const low = p.stock > 0 && p.stock <= (p.reorder_level || 5);
    const out = p.stock <= 0;
    const stockClass = out ? 'out' : (low ? 'low' : '');
    const compare = Number(p.compare_price) > Number(p.price)
      ? `<span class="prod-compare">${money(p.compare_price)}</span>` : '';
    const badge = out ? '<div class="badge-out">Out</div>'
                  : low ? '<div class="badge-low">Low</div>' : '';

    return `
      <div class="product-card${out ? ' out-of-stock' : ''}" data-id="${p.id}">
        ${badge}
        <div class="product-image">${iconFor(p.category)}</div>
        <div class="prod-name">${p.name}</div>
        <div class="prod-meta">
          <span class="prod-price">${money(p.price)}${compare}</span>
          <span class="prod-stock ${stockClass}">${out ? 'Out' : p.stock + ' left'}</span>
        </div>
      </div>`;
  }).join('');

  $$('.product-card').forEach((card) => {
    card.onclick = () => {
      if (card.classList.contains('out-of-stock')) return showToast('Item is out of stock');
      addToCart(Number(card.dataset.id));
    };
  });
}

/* ============================================================
   CART
   ============================================================ */
function addToCart(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  const existing = cart.find((i) => i.id === id);
  if (existing) existing.qty++;
  else cart.push({ id: p.id, name: p.name, price: Number(p.price), qty: 1 });
  renderCart();
}

function changeQty(id, delta) {
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((i) => i.id !== id);
  renderCart();
}

function voidLineItem(id) {
  cart = cart.filter((i) => i.id !== id);
  renderCart();
  showToast('Item removed');
}

function renderCart() {
  if (!cart.length) {
    $('#cart-items').innerHTML = `
      <div class="empty-cart"><span>+</span><p>Your order is empty</p><small>Select an item to get started</small></div>`;
  } else {
    $('#cart-items').innerHTML = cart.map((i) => `
      <div class="cart-item">
        <div style="flex:1">
          <div class="cart-item-name">${i.name}</div>
          <div class="cart-item-price">${money(i.price)}</div>
        </div>
        <div class="cart-item-actions">
          <button data-dec="${i.id}">−</button>
          <span class="cart-item-qty">${i.qty}</span>
          <button data-inc="${i.id}">+</button>
          <button class="cart-item-void" data-void="${i.id}" title="Remove">×</button>
        </div>
      </div>`).join('');
    $$('[data-dec]').forEach((b) => b.onclick = () => changeQty(+b.dataset.dec, -1));
    $$('[data-inc]').forEach((b) => b.onclick = () => changeQty(+b.dataset.inc, +1));
    $$('[data-void]').forEach((b) => b.onclick = () => voidLineItem(+b.dataset.void));
  }
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = subtotal * (taxRate / 100);
  $('#subtotal').textContent = money(subtotal);
  $('#tax').textContent = money(tax);
  $('#total').textContent = money(subtotal + tax);
}

/* ============================================================
   CHECKOUT
   ============================================================ */
async function checkout() {
  if (!cart.length) return showToast('Cart is empty');
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethod,
        items: cart.map((i) => ({ productId: i.id, quantity: i.qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Checkout failed');
    showToast(`✅ Sale #${data.saleId} — ${money(data.total)}`);
    cart = [];
    renderCart();
    loadProducts();
  } catch (e) { showToast('❌ ' + e.message); }
}

/* ============================================================
   HOLD BILL
   ============================================================ */
async function holdBill() {
  if (!cart.length) return showToast('Cart is empty');
  const label = prompt('Label for this bill:', `Bill ${new Date().toLocaleTimeString()}`);
  if (label === null) return;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal * (1 + taxRate / 100);
  try {
    const res = await fetch('/api/held-bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, items: cart, paymentMethod, total }),
    });
    if (!res.ok) throw new Error('Hold failed');
    cart = [];
    renderCart();
    showToast('Bill held');
  } catch (e) { showToast(e.message); }
}

/* ============================================================
   RESUME HELD BILLS
   ============================================================ */
async function showHeldBills() {
  const list = $('#held-list');
  list.innerHTML = '<p style="color:#75988a;font-size:.82rem">Loading…</p>';
  openModal('resume-modal');
  try {
    const res = await fetch('/api/held-bills');
    const bills = await res.json();
    if (!bills.length) {
      list.innerHTML = '<p style="color:#75988a;font-size:.82rem">No held bills.</p>';
      return;
    }
    list.innerHTML = bills.map((b) => `
      <div class="held-row">
        <div>
          <strong>${b.label}</strong>
          <small>${b.items.length} item(s) · ${money(b.total)} · ${new Date(b.held_at).toLocaleString()}</small>
        </div>
        <div>
          <button class="resume" data-resume="${b.id}">Resume</button>
          <button class="delete" data-delete-held="${b.id}">Delete</button>
        </div>
      </div>`).join('');

    $$('[data-resume]').forEach((btn) => btn.onclick = () => resumeBill(bills.find((b) => b.id === +btn.dataset.resume)));
    $$('[data-delete-held]').forEach((btn) => btn.onclick = async () => {
      await fetch(`/api/held-bills/${btn.dataset.deleteHeld}`, { method: 'DELETE' });
      showHeldBills();
    });
  } catch (e) {
    list.innerHTML = `<p style="color:#c53030;font-size:.82rem">${e.message}</p>`;
  }
}

async function resumeBill(bill) {
  if (cart.length && !confirm('Current cart will be replaced. Continue?')) return;
  cart = bill.items || [];
  paymentMethod = bill.payment_method || 'Cash';
  $$('.payment').forEach((b) => b.classList.toggle('active', b.dataset.payment === paymentMethod));
  renderCart();
  await fetch(`/api/held-bills/${bill.id}`, { method: 'DELETE' });
  closeModal('resume-modal');
  showToast('Bill resumed');
}

/* ============================================================
   STOCK ADJUST
   ============================================================ */
function openStockModal(mode) {
  currentStockMode = mode;
  const titles = { in: 'Stock In (Receive)', out: 'Stock Out (Remove)', adjustment: 'Stock Adjustment (Set Count)' };
  $('#stock-modal-title').textContent = titles[mode] || 'Stock Adjustment';
  $('#stock-product').innerHTML = allProducts.map((p) =>
    `<option value="${p.id}">${p.name} (${p.sku}) — ${p.stock} in stock</option>`).join('');
  $('#stock-qty').value = 1;
  $('#stock-reason').value = '';
  openModal('stock-modal');
}

async function submitStockAdjust() {
  const productId = Number($('#stock-product').value);
  const quantity = Number($('#stock-qty').value);
  const reason = $('#stock-reason').value.trim();
  if (!productId || !quantity || quantity <= 0) return showToast('Enter a valid quantity');
  try {
    const res = await fetch('/api/stock/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, movementType: currentStockMode, quantity, reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showToast(`✅ ${data.product.name}: ${data.product.previousStock} → ${data.product.newStock}`);
    closeModal('stock-modal');
    loadProducts();
  } catch (e) { showToast('❌ ' + e.message); }
}

/* ============================================================
   LOW STOCK
   ============================================================ */
async function showLowStock() {
  const list = $('#low-stock-list');
  list.innerHTML = '<p style="color:#75988a;font-size:.82rem">Loading…</p>';
  openModal('low-stock-modal');
  try {
    const res = await fetch('/api/products/low-stock');
    const items = await res.json();
    if (!items.length) {
      list.innerHTML = '<p style="color:#75988a;font-size:.82rem">All items are well stocked. ✅</p>';
      return;
    }
    list.innerHTML = items.map((p) => `
      <div class="held-row">
        <div>
          <strong>${p.name}</strong>
          <small>${p.sku} · Stock: ${p.stock} · Reorder at: ${p.reorder_level}</small>
        </div>
        <div><button class="resume" data-restock="${p.id}">+ Stock</button></div>
      </div>`).join('');
    $$('[data-restock]').forEach((btn) => btn.onclick = () => {
      closeModal('low-stock-modal');
      openStockModal('in');
      setTimeout(() => { $('#stock-product').value = btn.dataset.restock; }, 50);
    });
  } catch (e) {
    list.innerHTML = `<p style="color:#c53030;font-size:.82rem">${e.message}</p>`;
  }
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
$('#search').addEventListener('input', renderProducts);
$('#clear-cart').onclick = () => { cart = []; renderCart(); };
$('#checkout-btn').onclick = checkout;
$('#hold-btn').onclick = holdBill;
$('#void-btn').onclick = () => {
  if (!cart.length) return showToast('Cart is empty');
  if (confirm('Void all items in cart?')) { cart = []; renderCart(); showToast('Cart cleared'); }
};
$('#login-btn').onclick = () => { window.location.href = './admin.html'; };
$('#stock-submit').onclick = submitStockAdjust;

$$('.payment').forEach((b) => {
  b.onclick = () => {
    $$('.payment').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    paymentMethod = b.dataset.payment;
  };
});

$$('.quick-btn').forEach((btn) => {
  btn.onclick = () => {
    const action = btn.dataset.action;
    if (action === 'stock-in') openStockModal('in');
    else if (action === 'stock-out') openStockModal('out');
    else if (action === 'adjust') openStockModal('adjustment');
    else if (action === 'hold') holdBill();
    else if (action === 'resume') showHeldBills();
    else if (action === 'void') $('#void-btn').click();
    else if (action === 'low-stock') showLowStock();
    else if (action === 'sales') window.location.href = './sales.html';
    else if (action === 'admin') window.location.href = './admin.html';
  };
});

$$('[data-close-modal]').forEach((btn) => btn.onclick = () => {
  const modal = btn.closest('.modal-bg');
  if (modal) modal.classList.remove('open');
});

$$('.modal-bg').forEach((bg) => {
  bg.onclick = (e) => { if (e.target === bg) bg.classList.remove('open'); };
});

/* ============================================================
   BOOT — gate the POS behind login
   ============================================================ */
const posLoginForm = document.getElementById('pos-login-form');
const posLoginScreen = document.getElementById('pos-login');

if (posLoginForm) {
  posLoginForm.addEventListener('submit', handlePosLogin);
}

if (posLoginScreen && sessionStorage.getItem('pos-cashier') === 'true') {
  posLoginScreen.classList.add('hidden');
  loadProducts();
} else if (!posLoginScreen) {
  loadProducts();
}