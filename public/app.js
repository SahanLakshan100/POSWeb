const state = { products: [], cart: new Map(), category: 'All', payment: 'Cash', taxRate: 8, admin: false };
const money = (v) => `$${Number(v).toFixed(2)}`;
const $ = (s) => document.querySelector(s);
const showToast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
};

async function load() {
  const [products, dashboard, sales, settings] = await Promise.all([
    fetch('/api/products').then((r) => r.json()),
    fetch('/api/dashboard').then((r) => r.json()),
    fetch('/api/sales').then((r) => r.json()),
    fetch('/api/settings').then((r) => r.json()),
  ]);
  state.products = products;
  state.taxRate = settings.taxRate;
  renderDashboard(dashboard);
  renderProducts();
  renderSales(sales);
  loadManagement();
}

async function loadManagement() {
  const [customers, suppliers, expenses, settings] = await Promise.all([
    fetch('/api/customers').then((r) => r.json()),
    fetch('/api/suppliers').then((r) => r.json()),
    fetch('/api/expenses').then((r) => r.json()),
    fetch('/api/settings').then((r) => r.json()),
  ]);
  $('#customer-list').innerHTML = customers.length
    ? customers.map((c) => `<div class="management-line"><span>${c.name}</span><span>${c.phone || c.email || ''}</span></div>`).join('')
    : '<p class="muted">No customers yet.</p>';
  $('#supplier-list').innerHTML = suppliers.length
    ? suppliers.map((c) => `<div class="management-line"><span>${c.name}</span><span>${c.phone || c.email || ''}</span></div>`).join('')
    : '<p class="muted">No suppliers yet.</p>';
  $('#expense-list').innerHTML = expenses.length
    ? expenses.map((c) => `<div class="management-line"><span>${c.description}</span><span>${money(c.amount)}</span></div>`).join('')
    : '<p class="muted">No expenses yet.</p>';
  $('#settings-form [name="storeName"]').value = settings.storeName;
  $('#settings-form [name="taxRate"]').value = settings.taxRate;
  $('#settings-form [name="currency"]').value = settings.currency;
}

async function submitJson(event, url, successMessage) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  if (payload.amount) payload.amount = Number(payload.amount);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) return showToast('Could not save record');
  event.target.reset();
  await loadManagement();
  showToast(successMessage);
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = { storeName: form.get('storeName'), taxRate: Number(form.get('taxRate')), currency: form.get('currency') };
  const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) return showToast('Could not save settings');
  state.taxRate = payload.taxRate;
  renderCart();
  showToast('Settings saved');
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form.entries())) });
  if (!res.ok) return showToast('Invalid username or password');
  state.admin = true;
  closeModal('login-modal');
  $('#management').scrollIntoView({ behavior: 'smooth' });
  showToast('Admin access enabled');
}

async function runReport() {
  const query = new URLSearchParams({ from: $('#report-from').value, to: $('#report-to').value });
  const report = await fetch(`/api/reports?${query}`).then((r) => r.json());
  $('#report-sales').textContent = money(report.sales);
  $('#report-expenses').textContent = money(report.expenses);
  $('#report-profit').textContent = money(report.profit);
}

async function addProduct(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: form.get('sku'), name: form.get('name'), category: form.get('category'), price: Number(form.get('price')), stock: Number(form.get('stock')) }),
  });
  const result = await res.json();
  if (!res.ok) return showToast(result.message || 'Could not add item');
  closeModal('product-modal');
  event.target.reset();
  await load();
  showToast('New item added');
}

function renderDashboard(data) {
  $('#dashboard').innerHTML = `
    <div class="stat"><span class="stat-label">Today's sales</span><strong class="stat-value">${money(data.todaySales)}</strong><span class="stat-change">Across ${data.todayOrders} orders</span></div>
    <div class="stat"><span class="stat-label">Orders today</span><strong class="stat-value">${data.todayOrders}</strong><span class="stat-change">Ready to grow</span></div>
    <div class="stat"><span class="stat-label">Catalog items</span><strong class="stat-value">${data.productCount}</strong><span class="stat-change">All locations</span></div>
    <div class="stat"><span class="stat-label">Low stock</span><strong class="stat-value">${data.lowStockCount}</strong><span class="stat-change">Needs attention</span></div>`;
}

function renderProducts() {
  const search = $('#search').value.toLowerCase();
  const filtered = state.products.filter((p) => (state.category === 'All' || p.category === state.category) && `${p.name} ${p.sku}`.toLowerCase().includes(search));
  $('#products').innerHTML = filtered.map((p) => `<button class="product" data-product="${p.id}"><div class="product-top"><span class="product-icon">${p.category === 'Coffee' ? '☕' : p.category === 'Bakery' ? '✦' : p.category === 'Food' ? '◈' : '◇'}</span><span class="stock ${p.stock <= 5 ? 'low' : ''}">${p.stock} left</span></div><div><div class="product-name">${p.name}</div><div class="product-category">${p.category} · ${p.sku}</div><div class="product-price">${money(p.price)}</div></div></button>`).join('') || '<p class="muted">No products found.</p>';
  document.querySelectorAll('[data-product]').forEach((b) => b.addEventListener('click', () => addToCart(Number(b.dataset.product))));
}

function addToCart(productId) {
  const p = state.products.find((x) => x.id === productId);
  const q = state.cart.get(productId) || 0;
  if (q >= p.stock) return showToast('No more stock available');
  state.cart.set(productId, q + 1);
  renderCart();
}

function renderCart() {
  const entries = [...state.cart.entries()];
  $('#cart-items').innerHTML = entries.length
    ? entries.map(([id, q]) => {
        const p = state.products.find((x) => x.id === id);
        return `<div class="cart-line"><div><div class="cart-line-name">${p.name}</div><div class="qty"><button data-minus="${id}">−</button>${q}<button data-plus="${id}">+</button></div></div><span class="cart-line-price">${money(p.price * q)}</span></div>`;
      }).join('')
    : '<div class="empty-cart"><span>+</span><p>Your order is empty</p><small>Select an item to get started</small></div>';
  const subtotal = entries.reduce((s, [id, q]) => s + state.products.find((p) => p.id === id).price * q, 0);
  $('#subtotal').textContent = money(subtotal);
  $('#tax').textContent = money(subtotal * state.taxRate / 100);
  $('#total').textContent = money(subtotal * (1 + state.taxRate / 100));
  document.querySelectorAll('[data-minus]').forEach((b) => b.addEventListener('click', () => updateQuantity(Number(b.dataset.minus), -1)));
  document.querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', () => updateQuantity(Number(b.dataset.plus), 1)));
}

function updateQuantity(id, delta) {
  const next = (state.cart.get(id) || 0) + delta;
  if (next > 0) state.cart.set(id, next); else state.cart.delete(id);
  renderCart();
}

function renderSales(sales) {
  $('#sales-table').innerHTML = '<div class="sale-row head"><span>Receipt</span><span>Payment</span><span>Time</span><span>Total</span></div>' +
    (sales.length
      ? sales.map((s) => `<div class="sale-row"><span>#${String(s.id).padStart(3, '0')}</span><span>${s.payment_method}</span><span>${new Date(s.sold_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>${money(s.total)}</span></div>`).join('')
      : '<div class="sale-row"><span>No sales yet</span></div>');
}

async function checkout() {
  if (!state.cart.size) return showToast('Add an item before checking out');
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethod: state.payment, items: [...state.cart].map(([productId, quantity]) => ({ productId, quantity })) }),
  });
  const result = await res.json();
  if (!res.ok) return showToast(result.message || 'Checkout failed');
  state.cart.clear();
  await load();
  renderCart();
  printReceipt(result);
  showToast(`Sale #${result.saleId} completed`);
}

function printReceipt(sale) {
  const receipt = window.open('', '_blank', 'width=380,height=650');
  if (!receipt) return showToast('Allow pop-ups to print the receipt');
  receipt.document.write(`<html><head><title>Receipt #${sale.saleId}</title><style>body{font:14px monospace;width:300px;margin:24px auto}h1{text-align:center;font:700 22px Arial}p{text-align:center}.total{font-weight:bold;font-size:18px;text-align:right;padding-top:15px}</style></head><body><h1>COUNTERPOINT</h1><p>Receipt #${sale.saleId}<br>${new Date().toLocaleString()}</p><div class="total">TOTAL ${money(sale.total)}</div><p>Thank you</p><script>window.print();window.close();</script></body></html>`);
  receipt.document.close();
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

async function addScannedCode(code) {
  const p = state.products.find((x) => x.sku.toLowerCase() === code.trim().toLowerCase());
  if (!p) return showToast(`No product found for ${code}`);
  addToCart(p.id);
  closeModal('scanner-modal');
}

let scannerStream;
async function startScanner() {
  openModal('scanner-modal');
  const video = $('#scanner-video');
  if (!('BarcodeDetector' in window)) { $('#scanner-status').textContent = 'Camera scanning unavailable. Enter SKU below.'; return; }
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    video.srcObject = scannerStream;
    await video.play();
    const detector = new BarcodeDetector();
    const scan = async () => {
      if (!scannerStream) return;
      try { const codes = await detector.detect(video); if (codes.length) return addScannedCode(codes[0].rawValue); } catch {}
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  } catch { $('#scanner-status').textContent = 'Camera permission denied. Enter SKU below.'; }
}
function stopScanner() { if (scannerStream) scannerStream.getTracks().forEach((t) => t.stop()); scannerStream = null; }

/* Event listeners */
$('#search').addEventListener('input', renderProducts);
$('#clear-cart').addEventListener('click', () => { state.cart.clear(); renderCart(); });
$('#checkout-btn').addEventListener('click', checkout);
$('#add-item-btn').addEventListener('click', () => openModal('product-modal'));
$('#scan-btn').addEventListener('click', startScanner);
$('#product-form').addEventListener('submit', addProduct);
$('#manual-scan-btn').addEventListener('click', () => addScannedCode($('#manual-code').value));
$('#login-btn').addEventListener('click', () => openModal('login-modal'));
$('#login-form').addEventListener('submit', login);
$('#customer-form').addEventListener('submit', (e) => submitJson(e, '/api/customers', 'Customer added'));
$('#supplier-form').addEventListener('submit', (e) => submitJson(e, '/api/suppliers', 'Supplier added'));
$('#expense-form').addEventListener('submit', (e) => submitJson(e, '/api/expenses', 'Expense recorded'));
$('#settings-form').addEventListener('submit', saveSettings);
$('#report-btn').addEventListener('click', runReport);
$('#backup-btn').addEventListener('click', () => { window.location.href = '/api/backup'; });
$('#restore-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const snapshot = JSON.parse(await file.text());
  const res = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) });
  const result = await res.json();
  showToast(result.message || 'Restore finished');
  await load();
});
document.querySelectorAll('.category').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.category').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  state.category = b.dataset.category;
  renderProducts();
}));
document.querySelectorAll('.payment').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.payment').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  state.payment = b.dataset.payment;
}));
document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => {
  const id = b.dataset.closeModal;
  closeModal(id);
  if (id === 'scanner-modal') stopScanner();
}));

load().catch(() => showToast('Could not connect to POS server'));