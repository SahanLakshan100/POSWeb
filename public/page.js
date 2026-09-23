const page = document.body.dataset.page;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const money = (v) => `$${Number(v).toFixed(2)}`;

const toast = (msg) => {
  const n = $('#toast');
  if (!n) { alert(msg); return; }
  n.textContent = msg;
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 2500);
};

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function formPayload(form) {
  const p = Object.fromEntries(new FormData(form).entries());
  ['price','stock','amount','taxRate','reorder_level','compare_price','cost_price','sort_order'].forEach((k) => {
    if (p[k] !== undefined && p[k] !== '') p[k] = Number(p[k]);
  });
  if (p.allowNegativeStock !== undefined) {
    p.allowNegativeStock = p.allowNegativeStock === 'true';
  }
  return p;
}

/* ============================================================
   LOGIN
   ============================================================ */
async function login(event) {
  event.preventDefault();
  try {
    await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formPayload(event.target)),
    });
    sessionStorage.setItem('pos-admin', 'true');
    const loginScreen = document.getElementById('login');
    if (loginScreen) loginScreen.hidden = true;
    loadPage();
  } catch (e) {
    toast(e.message || 'Login failed');
  }
}

function form(url, message, reload = loadPage) {
  return async (event) => {
    event.preventDefault();
    try {
      await api(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formPayload(event.target)),
      });
      event.target.reset();
      await reload();
      toast(message);
    } catch (e) { toast(e.message); }
  };
}

/* ============================================================
   INVENTORY (tabbed)
   ============================================================ */
async function inventory() {
  // Tab switching
  const tabs = $$('.tab');
  tabs.forEach((tab) => {
    tab.onclick = () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      ['movements', 'adjust', 'low', 'products'].forEach((name) => {
        const section = document.getElementById('tab-' + name);
        if (section) section.classList.toggle('hidden', name !== tab.dataset.tab);
      });
    };
  });

  await refreshInventory();
}

async function refreshInventory() {
  try {
    const [products, movements, lowStock] = await Promise.all([
      api('/api/products'),
      api('/api/stock/movements?limit=100').catch(() => []),
      api('/api/products/low-stock').catch(() => []),
    ]);

    // Metrics
    const totalStock = products.reduce((s, p) => s + Number(p.stock), 0);
    const lowCount = lowStock.length;
    const totalSkus = products.length;
    const outCount = products.filter((p) => p.stock <= 0).length;

    $('#metrics').innerHTML = `
      <div class="metric"><span>Total SKUs</span><strong>${totalSkus}</strong></div>
      <div class="metric"><span>Total Stock Units</span><strong>${totalStock}</strong></div>
      <div class="metric"><span>Low Stock</span><strong style="color:#c56135">${lowCount}</strong></div>
      <div class="metric"><span>Out of Stock</span><strong style="color:#c53030">${outCount}</strong></div>
    `;

    // Dropdowns
    const options = products.map((p) => `<option value="${p.id}">${p.name} (${p.sku}) — ${p.stock} in stock</option>`).join('');
    $('#adj-product').innerHTML = options;
    $('#mov-product').innerHTML = '<option value="">All products</option>' + options;

    // Movement history
    renderMovements(movements);

    // Low stock
    if (!lowStock.length) {
      $('#low-list').innerHTML = '<p style="color:#1a7f4b;font-size:.85rem">✅ All items are well stocked.</p>';
    } else {
      $('#low-list').innerHTML =
        '<div class="row head"><span>Product</span><span>Stock</span><span>Reorder Level</span><span>Action</span></div>' +
        lowStock.map((p) => `
          <div class="row">
            <span>${p.name}<small>${p.sku}</small></span>
            <span><span class="pill out">${p.stock} left</span></span>
            <span>${p.reorder_level || 5} units</span>
            <span><button data-restock="${p.id}">+ Stock In</button></span>
          </div>`).join('');
      $$('[data-restock]').forEach((b) => b.onclick = () => {
        const tab = document.querySelector('.tab[data-tab="adjust"]');
        if (tab) tab.click();
        $('#adj-product').value = b.dataset.restock;
        $('#adj-type').value = 'in';
      });
    }

    // All products
    $('#products-list').innerHTML =
      '<div class="row head"><span>Product</span><span>Price</span><span>Stock</span><span>Actions</span></div>' +
      products.map((p) => `
        <div class="row">
          <span>${p.name}<small>${p.sku} · ${p.category}</small></span>
          <span>${money(p.price)}${Number(p.compare_price) > Number(p.price) ? ` <small style="text-decoration:line-through">${money(p.compare_price)}</small>` : ''}</span>
          <span><span class="pill ${p.stock <= 0 ? 'out' : p.stock <= (p.reorder_level || 5) ? 'adjustment' : 'in'}">${p.stock}</span></span>
          <span>
            <button data-restock="${p.id}">+</button>
            <button data-edit-product="${p.id}">Edit</button>
            <button data-delete="${p.id}">Delete</button>
          </span>
        </div>`).join('');

    $$('[data-restock]').forEach((b) => b.onclick = () => {
      const tab = document.querySelector('.tab[data-tab="adjust"]');
      if (tab) tab.click();
      $('#adj-product').value = b.dataset.restock;
      $('#adj-type').value = 'in';
    });
    $$('[data-edit-product]').forEach((b) => b.onclick = () => editProductPrompt(Number(b.dataset.editProduct)));
    $$('[data-delete]').forEach((b) => b.onclick = async () => {
      if (!confirm('Delete this product?')) return;
      try {
        await api(`/api/products/${b.dataset.delete}`, { method: 'DELETE' });
        await refreshInventory();
        toast('Product deleted');
      } catch (e) { toast(e.message); }
    });

    // Adjust form
    $('#adjust-form').onsubmit = async (event) => {
      event.preventDefault();
      const data = formPayload(event.target);
      data.productId = Number(data.productId);
      data.quantity = Number(data.quantity);
      try {
        const res = await api('/api/stock/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        toast(`✅ ${res.product.name}: ${res.product.previousStock} → ${res.product.newStock}`);
        event.target.reset();
        $('#adj-type').value = 'in';
        await refreshInventory();
      } catch (e) { toast(e.message); }
    };

    // Filter
    $('#mov-refresh').onclick = async () => {
      const pid = $('#mov-product').value;
      const limit = $('#mov-limit').value;
      const url = `/api/stock/movements?limit=${limit}${pid ? `&productId=${pid}` : ''}`;
      renderMovements(await api(url));
    };
  } catch (e) {
    console.error(e);
    toast('Load error: ' + e.message);
  }
}

function renderMovements(movements) {
  const el = $('#mov-list');
  if (!el) return;
  if (!movements.length) {
    el.innerHTML = '<p style="color:#75988a;font-size:.85rem">No stock movements yet.</p>';
    return;
  }

  const pills = {
    in: '<span class="pill in">Stock In</span>',
    out: '<span class="pill sale">Sale</span>',
    adjustment: '<span class="pill adjustment">Adjust</span>',
  };

  el.innerHTML =
    '<div class="row head"><span>Product</span><span>Movement</span><span>Quantity</span><span>When / Reason</span></div>' +
    movements.map((m) => {
      const typePill = m.reason === 'Sale' || (m.reference && m.reference.startsWith('sale#'))
        ? pills.sale
        : (pills[m.movement_type] || pills.adjustment);
      const delta = m.movement_type === 'out' ? `−${m.quantity}` : `+${m.quantity}`;
      return `
        <div class="row">
          <span>${m.product_name}<small>${m.sku}</small></span>
          <span>${typePill}</span>
          <span style="font-weight:600;color:${m.movement_type === 'out' ? '#c53030' : '#1a7f4b'}">${delta}</span>
          <span>${new Date(m.created_at).toLocaleString()}<small>${m.reason || ''} ${m.reference || ''}</small></span>
        </div>`;
    }).join('');
}

async function editProductPrompt(id) {
  const products = await api('/api/products');
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const name = prompt('Name:', p.name);
  if (name === null) return;
  const price = prompt('Price:', p.price);
  const compare_price = prompt('Was price (0 for none):', p.compare_price || 0);
  const reorder_level = prompt('Reorder level:', p.reorder_level || 5);
  const stock = prompt('Stock:', p.stock);
  try {
    await api(`/api/products/${id}`, {
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
    toast('Product updated');
    refreshInventory();
  } catch (e) { toast(e.message); }
}

/* ============================================================
   CONTACTS
   ============================================================ */
async function contacts(type) {
  const isCustomer = type === 'customers';
  const title = isCustomer ? 'Customer accounts' : 'Supplier management';
  const data = await api(`/api/${type}`);
  $('#content').innerHTML = `
    <section class="page-card">
      <h2>${title}</h2>
      <form class="form-grid" id="contact-form">
        <label class="full">Name<input name="name" required></label>
        <label>Phone<input name="phone"></label>
        <label>Email<input name="email" type="email"></label>
        <label class="full">Notes<input name="notes"></label>
        <button class="tool-btn primary">Add ${isCustomer ? 'customer' : 'supplier'}</button>
      </form>
      <div class="table">
        ${data.map((i) => `<div class="row"><span>${i.name}</span><span>${i.phone || '-'}</span><span>${i.email || '-'}</span><span>${i.notes || ''}</span></div>`).join('') || '<p class="muted">No records yet.</p>'}
      </div>
    </section>`;
  $('#contact-form').addEventListener('submit', form(`/api/${type}`, `${isCustomer ? 'Customer' : 'Supplier'} added`));
}

/* ============================================================
   EXPENSES
   ============================================================ */
async function expenses() {
  const data = await api('/api/expenses');
  $('#content').innerHTML = `
    <section class="page-card">
      <h2>Expense tracking</h2>
      <form class="form-grid">
        <label>Description<input name="description" required></label>
        <label>Amount<input name="amount" type="number" min="0" step="0.01" required></label>
        <label>Category<input name="category" required></label>
        <button class="tool-btn primary">Record expense</button>
      </form>
      <div class="table">
        ${data.map((i) => `<div class="row"><span>${i.description}</span><span>${i.category}</span><span>${money(i.amount)}</span><span>${new Date(i.spent_at).toLocaleDateString()}</span></div>`).join('') || '<p class="muted">No expenses yet.</p>'}
      </div>
    </section>`;
  $('#content form').addEventListener('submit', form('/api/expenses', 'Expense recorded'));
}

/* ============================================================
   REPORTS
   ============================================================ */
async function reports() {
  $('#content').innerHTML = `
    <section class="page-card">
      <h2>Daily and monthly reports</h2>
      <div class="filters">
        <label>From<input id="from" type="date"></label>
        <label>To<input id="to" type="date"></label>
        <button class="tool-btn primary" id="run">Run report</button>
      </div>
      <div id="metrics" class="metrics"></div>
    </section>`;
  $('#run').addEventListener('click', async () => {
    const r = await api(`/api/reports?from=${$('#from').value}&to=${$('#to').value}`);
    $('#metrics').innerHTML = `
      <div><span>Sales</span><strong>${money(r.sales)}</strong></div>
      <div><span>Expenses</span><strong>${money(r.expenses)}</strong></div>
      <div><span>Profit</span><strong>${money(r.profit)}</strong></div>
      <div><span>Orders</span><strong>${r.orders}</strong></div>`;
  });
}

/* ============================================================
   SETTINGS
   ============================================================ */
async function settings() {
  const data = await api('/api/settings');
  $('#content').innerHTML = `
    <section class="page-card">
      <h2>Tax and store settings</h2>
      <form class="form-grid">
        <label>Store name<input name="storeName" value="${data.storeName}" required></label>
        <label>Tax rate %<input name="taxRate" value="${data.taxRate}" type="number" min="0" step="0.01" required></label>
        <label>Currency<input name="currency" value="${data.currency}" required></label>
        <label>Allow negative stock
          <select name="allowNegativeStock">
            <option value="false" ${!data.allowNegativeStock ? 'selected' : ''}>No (block overselling)</option>
            <option value="true" ${data.allowNegativeStock ? 'selected' : ''}>Yes (allow overselling)</option>
          </select>
        </label>
        <button class="tool-btn primary">Save settings</button>
      </form>
      <hr>
      <button class="tool-btn primary" id="backup">Download backup</button>
      <label class="tool-btn">Restore backup<input id="restore" type="file" accept=".json" hidden></label>
    </section>`;
  $('#content form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formPayload(event.target);
    await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    toast('Settings saved');
  });
  $('#backup').addEventListener('click', () => { window.location.href = '/api/backup'; });
  $('#restore').addEventListener('change', async (event) => {
    const snapshot = JSON.parse(await event.target.files[0].text());
    const r = await api('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) });
    toast(r.message);
  });
}

/* ============================================================
   PRODUCTS
   ============================================================ */
async function products() {
  let allProducts = [];
  let allCategories = [];
  let activeCat = 'All';
  let searchTerm = '';

  const renderMetrics = () => {
    const total = allProducts.length;
    const lowCount = allProducts.filter((p) => p.stock > 0 && p.stock <= (p.reorder_level || 5)).length;
    const outCount = allProducts.filter((p) => p.stock <= 0).length;
    const totalValue = allProducts.reduce((s, p) => s + Number(p.price) * Number(p.stock), 0);
    $('#metrics').innerHTML = `
      <div class="metric"><span>Total SKUs</span><strong>${total}</strong></div>
      <div class="metric"><span>Stock Value</span><strong>${money(totalValue)}</strong></div>
      <div class="metric warn"><span>Low Stock</span><strong>${lowCount}</strong></div>
      <div class="metric danger"><span>Out of Stock</span><strong>${outCount}</strong></div>
    `;
  };

  const renderCategories = () => {
    const items = [{ name: 'All', icon: '' }, ...allCategories];
    $('#category-row').innerHTML = items.map((c) =>
      `<button class="chip${c.name === activeCat ? ' active' : ''}" data-cat="${c.name}">${c.name === 'All' ? 'All' : `${c.icon || ''} ${c.name}`.trim()}</button>`
    ).join('');
    $$('.chip').forEach((btn) => {
      btn.onclick = () => {
        activeCat = btn.dataset.cat;
        renderCategories();
        renderTable();
      };
    });
  };

  const renderTable = () => {
    const q = searchTerm.toLowerCase();
    const filtered = allProducts.filter((p) => {
      const okCat = activeCat === 'All' || p.category === activeCat;
      const okQ = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      return okCat && okQ;
    });

    $('#result-count').textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;

    if (!filtered.length) {
      $('#content').innerHTML = '<div class="empty-state">No products match your filter.</div>';
      return;
    }

    $('#content').innerHTML =
      '<div class="row head"><span>Product</span><span>Category</span><span>Price</span><span>Stock</span><span>Status</span></div>' +
      filtered.map((p) => {
        const low = p.stock > 0 && p.stock <= (p.reorder_level || 5);
        const out = p.stock <= 0;
        const stockPill = out ? '<span class="pill out">Out</span>'
          : low ? '<span class="pill low">Low</span>'
          : '<span class="pill ok">In Stock</span>';
        const compare = Number(p.compare_price) > Number(p.price)
          ? `<span class="compare">${money(p.compare_price)}</span>` : '';
        return `
          <div class="row">
            <span class="name">${p.name}<small>${p.sku}</small></span>
            <span><span class="pill cat">${p.category || 'Other'}</span></span>
            <span class="price">${money(p.price)}${compare}</span>
            <span>${p.stock} units<small>Reorder at ${p.reorder_level || 5}</small></span>
            <span>${stockPill}</span>
          </div>`;
      }).join('');
  };

  const [productsData, categoriesData] = await Promise.all([
    api('/api/products'),
    api('/api/categories').catch(() => []),
  ]);
  allProducts = productsData;
  allCategories = categoriesData;

  renderMetrics();
  renderCategories();
  renderTable();

  $('#search').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    renderTable();
  });
}

/* ============================================================
   SALES
   ============================================================ */
async function sales() {
  const render = (r) => {
    const avg = r.orders ? r.total / r.orders : 0;
    const cardCount = r.sales.filter((s) => s.payment_method === 'Card').length;
    const cashCount = r.sales.filter((s) => s.payment_method === 'Cash').length;
    $('#metrics').innerHTML = `
      <div class="metric"><span>Total Sales</span><strong>${money(r.total)}</strong></div>
      <div class="metric"><span>Orders</span><strong>${r.orders}</strong></div>
      <div class="metric"><span>Average Order</span><strong>${money(avg)}</strong></div>
      <div class="metric"><span>Payment Split</span><strong style="font-size:1rem">${cashCount} cash · ${cardCount} card</strong></div>
    `;

    const pillClass = (m) => {
      const x = (m || '').toLowerCase();
      if (x === 'cash') return 'cash';
      if (x === 'card') return 'card';
      if (x === 'mobile') return 'mobile';
      return '';
    };

    if (!r.sales.length) {
      $('#sales-table').innerHTML = '<div class="empty-state">No sales in this period.</div>';
      return;
    }

    $('#sales-table').innerHTML =
      '<div class="row head"><span>Receipt</span><span>Payment</span><span>Date & Time</span><span>Total</span></div>' +
      r.sales.map((i) => `
        <div class="row">
          <span class="receipt">#${String(i.id).padStart(4, '0')}${i.status === 'voided' ? ' <span class="pill voided">Voided</span>' : ''}</span>
          <span><span class="pill ${pillClass(i.payment_method)}">${i.payment_method}</span></span>
          <span>${new Date(i.sold_at).toLocaleString()}</span>
          <span class="total">${money(i.total)}</span>
        </div>`).join('');
  };

  const data = await api('/api/admin/sales');
  render(data);

  $('#run').addEventListener('click', async () => {
    const from = $('#from').value;
    const to = $('#to').value;
    const url = from && to ? `/api/admin/sales?from=${from}&to=${to}` : '/api/admin/sales';
    render(await api(url));
  });
}

/* ============================================================
   ROUTER
   ============================================================ */
async function loadPage() {
  const handlers = {
    inventory,
    customers: () => contacts('customers'),
    suppliers: () => contacts('suppliers'),
    expenses,
    reports,
    settings,
    products,
    sales,
  };
  const handler = handlers[page];
  if (!handler) {
    console.warn('No handler for page:', page);
    return;
  }
  await handler();
}

/* ============================================================
   BOOT
   ============================================================ */
const loginForm = document.getElementById('login-form');
const loginScreen = document.getElementById('login');

if (loginForm) {
  loginForm.addEventListener('submit', login);
}

if (!loginScreen || sessionStorage.getItem('pos-admin') === 'true') {
  if (loginScreen) loginScreen.hidden = true;
  loadPage().catch((e) => toast(e.message));
}