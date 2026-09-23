const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
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

/* ============================================================
   LOGIN
   ============================================================ */
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

/* ============================================================
   SAVE FORM (products / customers / suppliers / expenses)
   ============================================================ */
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

/* ============================================================
   LOAD EVERYTHING
   ============================================================ */
async function loadAll() {
  const [products, customers, suppliers, expenses, settings, categories] = await Promise.all([
    request('/api/products'),
    request('/api/customers'),
    request('/api/suppliers'),
    request('/api/expenses'),
    request('/api/settings'),
    request('/api/categories').catch(() => []),  // graceful fallback if table not ready
  ]);

  /* ---- Products ---- */
  const prodList = $('#product-list');
  if (prodList) {
    prodList.innerHTML = '<div class="admin-row"><b>Product</b><b>Price</b><b>Stock</b><b>Actions</b></div>' +
      products.map((p) => `<div class="admin-row"><span>${p.name}<br><small>${p.sku}</small></span><span>${money(p.price)}</span><span>${p.stock}</span><span><button data-edit="${p.id}">Edit</button><button data-delete="${p.id}">Delete</button></span></div>`).join('');
  }

  /* ---- Customers ---- */
  const custList = $('#customer-list');
  if (custList) {
    custList.innerHTML = customers.length
      ? '<div class="admin-row"><b>Name</b><b>Phone</b><b>Email</b><b></b></div>' +
        customers.map((c) => `<div class="admin-row"><span>${c.name}</span><span>${c.phone || '-'}</span><span>${c.email || '-'}</span><span></span></div>`).join('')
      : '<p class="muted">No customers yet.</p>';
  }

  /* ---- Suppliers ---- */
  const supList = $('#supplier-list');
  if (supList) {
    supList.innerHTML = suppliers.length
      ? '<div class="admin-row"><b>Name</b><b>Phone</b><b>Email</b><b></b></div>' +
        suppliers.map((c) => `<div class="admin-row"><span>${c.name}</span><span>${c.phone || '-'}</span><span>${c.email || '-'}</span><span></span></div>`).join('')
      : '<p class="muted">No suppliers yet.</p>';
  }

  /* ---- Expenses ---- */
  const expList = $('#expense-list');
  if (expList) {
    expList.innerHTML = expenses.length
      ? '<div class="admin-row"><b>Description</b><b>Category</b><b>Amount</b><b></b></div>' +
        expenses.map((c) => `<div class="admin-row"><span>${c.description}</span><span>${c.category}</span><span>${money(c.amount)}</span><span></span></div>`).join('')
      : '<p class="muted">No expenses yet.</p>';
  }

  /* ---- Settings ---- */
  const settingsForm = $('#settings-form');
  if (settingsForm) {
    settingsForm.elements.storeName.value = settings.storeName;
    settingsForm.elements.taxRate.value = settings.taxRate;
    settingsForm.elements.currency.value = settings.currency;
    if (settingsForm.elements.allowNegativeStock) {
      settingsForm.elements.allowNegativeStock.value = settings.allowNegativeStock ? 'true' : 'false';
    }
  }

  /* ---- Categories list ---- */
  const catList = $('#category-list');
  if (catList) {
    catList.innerHTML = categories.length
      ? '<div class="admin-row"><b>Icon</b><b>Name</b><b>Sort</b><b>Actions</b></div>' +
        categories.map((c) => `<div class="admin-row"><span style="font-size:1.4rem">${c.icon || '📦'}</span><span>${c.name}</span><span>${c.sort_order || 0}</span><span><button data-edit-cat="${c.id}">Edit</button><button data-delete-cat="${c.id}">Delete</button></span></div>`).join('')
      : '<p class="muted">No categories yet.</p>';
  }

  /* ---- Populate product form's category dropdown ---- */
  const catSelect = $('#product-category-select');
  if (catSelect) {
    const currentValue = catSelect.value;
    catSelect.innerHTML = '<option value="">— Select category —</option>' +
      categories.map((c) => `<option value="${c.name}">${c.icon || ''} ${c.name}</option>`).join('');
    if (currentValue) catSelect.value = currentValue;
  }

  /* ---- Product edit/delete ---- */
  $$('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this product?')) return;
    try { await request(`/api/products/${b.dataset.delete}`, { method: 'DELETE' }); await loadAll(); showToast('Product deleted'); }
    catch (e) { showToast(e.message); }
  }));

  $$('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
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

  /* ---- Category edit/delete ---- */
  $$('[data-delete-cat]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this category?')) return;
    try {
      await request(`/api/categories/${b.dataset.deleteCat}`, { method: 'DELETE' });
      await loadAll();
      showToast('Category deleted');
    } catch (e) { showToast(e.message); }
  }));

  $$('[data-edit-cat]').forEach((b) => b.addEventListener('click', async () => {
    const c = categories.find((x) => x.id === Number(b.dataset.editCat));
    const name = prompt('Category name:', c.name);
    if (name === null) return;
    const icon = prompt('Icon (emoji):', c.icon || '📦');
    const sort_order = prompt('Sort order:', c.sort_order || 0);
    try {
      await request(`/api/categories/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon, sort_order: Number(sort_order) }),
      });
      await loadAll();
      showToast('Category updated');
    } catch (e) { showToast(e.message); }
  }));
}

/* ============================================================
   SAVE SETTINGS
   ============================================================ */
async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = {
    storeName: form.get('storeName'),
    taxRate: Number(form.get('taxRate')),
    currency: form.get('currency'),
  };
  if (form.get('allowNegativeStock') !== null) {
    payload.allowNegativeStock = form.get('allowNegativeStock') === 'true';
  }
  try {
    await request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('Settings saved');
  } catch (e) { showToast(e.message); }
}

/* ============================================================
   REPORTS
   ============================================================ */
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
   ADD CATEGORY
   ============================================================ */
async function addCategory(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = {
    name: form.get('name'),
    icon: form.get('icon'),
    sort_order: Number(form.get('sort_order')) || 0,
  };
  try {
    await request('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    event.target.reset();
    event.target.elements.icon.value = '📦';
    event.target.elements.sort_order.value = 0;
    await loadAll();
    showToast('Category added');
  } catch (e) { showToast(e.message); }
}

/* ============================================================
   ADMIN TAB SWITCHING
   ============================================================ */
function setupTabs() {
  const navLinks = $$('#admin-nav a');
  const sections = $$('.admin-section');
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
$('#category-form').addEventListener('submit', addCategory);
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
   BOOT
   ============================================================ */
setupTabs();

if (sessionStorage.getItem('pos-admin') === 'true') {
  $('#login-screen').style.display = 'none';
  loadAll().catch((e) => showToast(e.message));
}