const page = document.body.dataset.page;
const $ = (s) => document.querySelector(s);
const money = (v) => `$${Number(v).toFixed(2)}`;
const toast = (msg) => {
  const n = $('#toast');
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
  if (p.price) p.price = Number(p.price);
  if (p.stock) p.stock = Number(p.stock);
  if (p.amount) p.amount = Number(p.amount);
  if (p.taxRate) p.taxRate = Number(p.taxRate);
  return p;
}
async function login(event) {
  event.preventDefault();
  try {
    await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formPayload(event.target)) });
    sessionStorage.setItem('pos-admin', 'true');
    $('#login').hidden = true;
    loadPage();
  } catch (e) { toast(e.message); }
}
function form(url, message, reload = loadPage) {
  return async (event) => {
    event.preventDefault();
    try {
      await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formPayload(event.target)) });
      event.target.reset();
      await reload();
      toast(message);
    } catch (e) { toast(e.message); }
  };
}
async function inventory() {
  const products = await api('/api/products');
  $('#content').innerHTML = `<section class="page-card"><h2>Inventory</h2><form class="form-grid" id="product-form"><label>SKU / barcode<input name="sku" required></label><label>Name<input name="name" required></label><label>Category<select name="category"><option>Coffee</option><option>Tea</option><option>Bakery</option><option>Food</option><option>Other</option></select></label><label>Price<input name="price" type="number" min="0" step="0.01" required></label><label>Stock<input name="stock" type="number" min="0" required></label><button class="tool-btn primary">Add product</button></form><div class="table">${products.map((i) => `<div class="row"><span>${i.name}<small>${i.sku}</small></span><span>${money(i.price)}</span><span>${i.stock} stock</span><span><button data-edit="${i.id}">Edit</button><button data-delete="${i.id}">Delete</button></span></div>`).join('')}</div></section>`;
  $('#product-form').addEventListener('submit', form('/api/products', 'Product added'));
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const item = products.find((p) => p.id === Number(b.dataset.edit));
    const name = prompt('Name:', item.name);
    if (name === null) return;
    const price = prompt('Price:', item.price);
    const stock = prompt('Stock:', item.stock);
    await api(`/api/products/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: item.sku, name, category: item.category, price: Number(price), stock: Number(stock) }) });
    loadPage();
  }));
  document.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (confirm('Delete this product?')) { await api(`/api/products/${b.dataset.delete}`, { method: 'DELETE' }); loadPage(); }
  }));
}
async function contacts(type) {
  const isCustomer = type === 'customers';
  const title = isCustomer ? 'Customer accounts' : 'Supplier management';
  const data = await api(`/api/${type}`);
  $('#content').innerHTML = `<section class="page-card"><h2>${title}</h2><form class="form-grid" id="contact-form"><label class="full">Name<input name="name" required></label><label>Phone<input name="phone"></label><label>Email<input name="email" type="email"></label><label class="full">Notes<input name="notes"></label><button class="tool-btn primary">Add ${isCustomer ? 'customer' : 'supplier'}</button></form><div class="table">${data.map((i) => `<div class="row"><span>${i.name}</span><span>${i.phone || '-'}</span><span>${i.email || '-'}</span><span>${i.notes || ''}</span></div>`).join('') || '<p class="muted">No records yet.</p>'}</div></section>`;
  $('#contact-form').addEventListener('submit', form(`/api/${type}`, `${isCustomer ? 'Customer' : 'Supplier'} added`));
}
async function expenses() {
  const data = await api('/api/expenses');
  $('#content').innerHTML = `<section class="page-card"><h2>Expense tracking</h2><form class="form-grid"><label>Description<input name="description" required></label><label>Amount<input name="amount" type="number" min="0" step="0.01" required></label><label>Category<input name="category" required></label><button class="tool-btn primary">Record expense</button></form><div class="table">${data.map((i) => `<div class="row"><span>${i.description}</span><span>${i.category}</span><span>${money(i.amount)}</span><span>${new Date(i.spent_at).toLocaleDateString()}</span></div>`).join('') || '<p class="muted">No expenses yet.</p>'}</div></section>`;
  $('#content form').addEventListener('submit', form('/api/expenses', 'Expense recorded'));
}
async function reports() {
  $('#content').innerHTML = `<section class="page-card"><h2>Daily and monthly reports</h2><div class="filters"><label>From<input id="from" type="date"></label><label>To<input id="to" type="date"></label><button class="tool-btn primary" id="run">Run report</button></div><div id="metrics" class="metrics"></div></section>`;
  $('#run').addEventListener('click', async () => {
    const r = await api(`/api/reports?from=${$('#from').value}&to=${$('#to').value}`);
    $('#metrics').innerHTML = `<div><span>Sales</span><strong>${money(r.sales)}</strong></div><div><span>Expenses</span><strong>${money(r.expenses)}</strong></div><div><span>Profit</span><strong>${money(r.profit)}</strong></div><div><span>Orders</span><strong>${r.orders}</strong></div>`;
  });
}
async function settings() {
  const data = await api('/api/settings');
  $('#content').innerHTML = `<section class="page-card"><h2>Tax and store settings</h2><form class="form-grid"><label>Store name<input name="storeName" value="${data.storeName}" required></label><label>Tax rate %<input name="taxRate" value="${data.taxRate}" type="number" min="0" step="0.01" required></label><label>Currency<input name="currency" value="${data.currency}" required></label><button class="tool-btn primary">Save settings</button></form><hr><button class="tool-btn primary" id="backup">Download backup</button><label class="tool-btn">Restore backup<input id="restore" type="file" accept=".json" hidden></label></section>`;
  $('#content form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formPayload(event.target)) });
    toast('Settings saved');
  });
  $('#backup').addEventListener('click', () => { window.location.href = '/api/backup'; });
  $('#restore').addEventListener('change', async (event) => {
    const snapshot = JSON.parse(await event.target.files[0].text());
    const r = await api('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) });
    toast(r.message);
  });
}
async function products() {
  const data = await api('/api/products');
  $('#content').innerHTML = `<section class="page-card"><h2>Products</h2><div class="table">${data.map((i) => `<div class="row"><span>${i.name}<small>${i.sku}</small></span><span>${i.category}</span><span>${money(i.price)}</span><span>${i.stock} in stock</span></div>`).join('')}</div></section>`;
}
async function sales() {
  const data = await api('/api/admin/sales');
  $('#content').innerHTML = `<section class="page-card"><h2>Sales history</h2><div class="filters"><label>From<input id="from" type="date"></label><label>To<input id="to" type="date"></label><button class="tool-btn primary" id="run">Filter</button></div><div id="sales-table"></div></section>`;
  const render = (r) => {
    $('#sales-table').innerHTML = `<div class="summary">${r.orders} orders · ${money(r.total)}</div>` +
      r.sales.map((i) => `<div class="row"><span>Receipt #${i.id}</span><span>${i.payment_method}</span><span>${new Date(i.sold_at).toLocaleString()}</span><span>${money(i.total)}</span></div>`).join('');
  };
  render(data);
  $('#run').addEventListener('click', async () => render(await api(`/api/admin/sales?from=${$('#from').value}&to=${$('#to').value}`)));
}
async function loadPage() {
  const handlers = { inventory, customers: () => contacts('customers'), suppliers: () => contacts('suppliers'), expenses, reports, settings, products, sales };
  await handlers[page]();
}
$('#login-form').addEventListener('submit', login);
if (sessionStorage.getItem('pos-admin') === 'true') $('#login').hidden = true;
loadPage().catch((e) => toast(e.message));