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
    await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    sessionStorage.setItem('pos-admin', 'true');
    $('#login-screen').style.display = 'none';
    await loadAll();
  } catch (e) { showToast(e.message); }
}

async function saveForm(event, url, message) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());

  ['amount', 'price', 'compare_price', 'cost_price', 'reorder_level', 'stock', 'taxRate'].forEach((k) => {
    if (payload[k] !== undefined && payload[k] !== '') payload[k] = Number(payload[k]);
  });
  if (payload.allowNegativeStock !== undefined) {
    payload.allowNegativeStock = payload.allowNegativeStock === 'true';
  }

  try {
    await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    event.target.reset();
    await loadAll();
    showToast(message);
  } catch (e) { showToast(e.message); }
}

async function loadAll() {
  const [products, customers, suppliers, expenses, settings] = await Promise.all([
    request('/api/products'),
    request('/api/customers'),
    request('/api/suppliers'),
    request('/api/expenses'),
    request('/api/settings'),
  ]);

  $('#product-list').innerHTML = '<div class="admin-row"><b>Product</b><b>Price</b><b>Stock</b><b>Actions</b></div>' +
    products.map((p) => `<div class="admin-row"><span>${p.name}<br><small>${p.sku}</small></span><span>${money(p.price)}</span><span>${p.stock}</span><span><button data-edit="${p.id}">Edit</button><button data-delete="${p.id}">Delete</button></span></div>`).join('');

  $('#customer-list').innerHTML = customers.length
    ? customers.map((c) => `<div class="admin-row"><span>${c.name}</span><span>${c.phone || '-'}</span><span>${c.email || '-'}</span></div>`).join('')
    : '<p class="muted">No customers yet.</p>';

  $('#supplier-list').innerHTML = suppliers.length
    ? suppliers.map((c) => `<div class="admin-row"><span>${c.name}</span><span>${c.phone || '-'}</span><span>${c.email || '-'}</span></div>`).join('')
    : '<p class="muted">No suppliers yet.</p>';

  $('#expense-list').innerHTML = expenses.length
    ? expenses.map((c) => `<div class="admin-row"><span>${c.description}</span><span>${c.category}</span><span>${money(c.amount)}</span></div>`).join('')
    : '<p class="muted">No expenses yet.</p>';

  $('#settings-form [name="storeName"]').value = settings.storeName;
  $('#settings-form [name="taxRate"]').value = settings.taxRate;
  $('#settings-form [name="currency"]').value = settings.currency;
  if ($('#settings-form [name="allowNegativeStock"]')) {
    $('#settings-form [name="allowNegativeStock"]').value = settings.allowNegativeStock ? 'true' : 'false';
  }

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
    const compare_price = prompt('Was price (0 = none):', p.compare_price || 0);
    const reorder_level = prompt('Reorder level:', p.reorder_level || 5);
    const stock = prompt('Stock:', p.stock);
    try {
      await request(`/api/products/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: p.sku, name, category: p.category,
          price: Number(price),
          compare_price: Number(compare_price),
          reorder_level: Number(reorder_level),
          stock: Number(stock),
        }),
      });
      await loadAll();
      showToast('Product updated');
    } catch (e) { showToast(e.message); }
  }));
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const payload = {
      storeName: form.get('storeName'),
      taxRate: Number(form.get('taxRate')),
      currency: form.get('currency'),
    };
    if (form.get('allowNegativeStock') !== null) {
      payload.allowNegativeStock = form.get('allowNegativeStock') === 'true';
    }
    await request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('Settings saved');
  } catch (e) { showToast(e.message); }
}

async function runReport() {
  const from = $('#report-from').value;
  const to = $('#report-to').value;
  if (!from || !to) return showToast('Pick both dates');
  const query = new URLSearchParams({ from, to });
  try {
    const r = await request(`/api/reports?${query}`);
    $('#report-results').innerHTML =
      `<div class="metric"><span>Sales</span><strong>${money(r.sales)}</strong></div>
       <div class="metric"><span>Expenses</span><strong>${money(r.expenses)}</strong></div>
       <div class="metric"><span>Profit</span><strong>${money(r.profit)}</strong></div>
       <div class="metric"><span>Orders</span><strong>${r.orders}</strong></div>`;
  } catch (e) { showToast(e.message); }
}

/* ============================================================
   ADMIN TAB SWITCHING
   ============================================================ */
function setupTabs() {
  const navLinks = document.querySelectorAll('#admin-nav a');
  const sections = document.querySelectorAll('.admin-section');
  const grid = document.querySelector('.admin-grid');
  if (!navLinks.length) return;

  function activateTab(name) {
    navLinks.forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
    sections.forEach((sec) => sec.classList.toggle('active', sec.dataset.section === name));
    if (grid) grid.classList.add('single-mode');
  }

  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activateTab(link.dataset.tab);
    });
  });

  activateTab('inventory');
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
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
    const r = await request('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    showToast(r.message);
    await loadAll();
  } catch (e) { showToast(e.message); }
});

/* ============================================================
   BOOT — runs LAST, after everything is defined
   ============================================================ */
setupTabs();

if (sessionStorage.getItem('pos-admin') === 'true') {
  $('#login-screen').style.display = 'none';
  loadAll().catch((e) => showToast(e.message));
}