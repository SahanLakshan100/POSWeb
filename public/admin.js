const $ = (s) => document.querySelector(s);
const money = (v) => `$${Number(v).toFixed(2)}`;
const showToast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
};

async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

async function login(event) {
  event.preventDefault();
  try {
    const form = new FormData(event.target);
    await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form.entries())) });
    $('#login-screen').style.display = 'none';
    await loadAll();
  } catch (e) { showToast(e.message); }
}

async function saveForm(event, url, message) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  if (payload.amount) payload.amount = Number(payload.amount);
  try {
    await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    event.target.reset();
    await loadAll();
    showToast(message);
  } catch (e) { showToast(e.message); }
}

async function loadAll() {
  const [products, customers, suppliers, expenses, settings] = await Promise.all([
    request('/api/products'), request('/api/customers'), request('/api/suppliers'), request('/api/expenses'), request('/api/settings'),
  ]);
  $('#product-list').innerHTML = '<div class="admin-row"><b>Product</b><b>Price</b><b>Stock</b><b>Actions</b></div>' +
    products.map((p) => `<div class="admin-row"><span>${p.name}<br><small>${p.sku}</small></span><span>${money(p.price)}</span><span>${p.stock}</span><span><button data-edit="${p.id}">Edit</button><button data-delete="${p.id}">Delete</button></span></div>`).join('');
  $('#customer-list').innerHTML = customers.map((c) => `<div class="admin-row"><span>${c.name}</span><span>${c.phone || '-'}</span><span>${c.email || '-'}</span></div>`).join('');
  $('#supplier-list').innerHTML = suppliers.map((c) => `<div class="admin-row"><span>${c.name}</span><span>${c.phone || '-'}</span><span>${c.email || '-'}</span></div>`).join('');
  $('#expense-list').innerHTML = expenses.map((c) => `<div class="admin-row"><span>${c.description}</span><span>${c.category}</span><span>${money(c.amount)}</span></div>`).join('');
  $('#settings-form [name="storeName"]').value = settings.storeName;
  $('#settings-form [name="taxRate"]').value = settings.taxRate;
  $('#settings-form [name="currency"]').value = settings.currency;

  document.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this product?')) return;
    try { await request(`/api/products/${b.dataset.delete}`, { method: 'DELETE' }); await loadAll(); showToast('Product deleted'); }
    catch (e) { showToast(e.message); }
  }));
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const p = products.find((x) => x.id === Number(b.dataset.edit));
    const name = prompt('Product name:', p.name);
    if (name === null) return;
    const price = prompt('Price:', p.price);
    const stock = prompt('Stock:', p.stock);
    try {
      await request(`/api/products/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: p.sku, name, category: p.category, price: Number(price), stock: Number(stock) }) });
      await loadAll(); showToast('Product updated');
    } catch (e) { showToast(e.message); }
  }));
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await request('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeName: form.get('storeName'), taxRate: Number(form.get('taxRate')), currency: form.get('currency') }) });
    showToast('Settings saved');
  } catch (e) { showToast(e.message); }
}

async function runReport() {
  const query = new URLSearchParams({ from: $('#report-from').value, to: $('#report-to').value });
  try {
    const r = await request(`/api/reports?${query}`);
    $('#report-results').innerHTML = `<div class="metric"><span>Sales</span><strong>${money(r.sales)}</strong></div><div class="metric"><span>Expenses</span><strong>${money(r.expenses)}</strong></div><div class="metric"><span>Profit</span><strong>${money(r.profit)}</strong></div><div class="metric"><span>Orders</span><strong>${r.orders}</strong></div>`;
  } catch (e) { showToast(e.message); }
}

$('#admin-login').addEventListener('submit', login);
$('#product-form').addEventListener('submit', (e) => saveForm(e, '/api/products', 'Product added'));
$('#customer-form').addEventListener('submit', (e) => saveForm(e, '/api/customers', 'Customer added'));
$('#supplier-form').addEventListener('submit', (e) => saveForm(e, '/api/suppliers', 'Supplier added'));
$('#expense-form').addEventListener('submit', (e) => saveForm(e, '/api/expenses', 'Expense recorded'));
$('#settings-form').addEventListener('submit', saveSettings);
$('#report-btn').addEventListener('click', runReport);
$('#backup-btn').addEventListener('click', () => { window.location.href = '/api/backup'; });
$('#restore-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const snapshot = JSON.parse(await file.text());
  try {
    const r = await request('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) });
    showToast(r.message);
  } catch (e) { showToast(e.message); }
});