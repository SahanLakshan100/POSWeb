import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { query, get, run } from './db.js';
import { initDatabase } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const ok = (res, data) => res.json(data);
const fail = (res, msg, code = 400) => res.status(code).json({ message: msg });

/* AUTH */
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) return ok(res, { success: true });
  return fail(res, 'Invalid username or password', 401);
});

/* PRODUCTS */
app.get('/api/products', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM products ORDER BY name')); }
  catch (e) { fail(res, e.message, 500); }
});
app.post('/api/products', async (req, res) => {
  try {
    const { sku, name, category, price, stock } = req.body;
    const r = await run('INSERT INTO products (sku, name, category, price, stock) VALUES (?,?,?,?,?)',
      [sku, name, category || 'Other', Number(price), Number(stock)]);
    ok(res, { id: r.lastInsertRowid, message: 'Product added' });
  } catch (e) { fail(res, e.message); }
});
app.put('/api/products/:id', async (req, res) => {
  try {
    const { sku, name, category, price, stock } = req.body;
    await run('UPDATE products SET sku=?, name=?, category=?, price=?, stock=? WHERE id=?',
      [sku, name, category, Number(price), Number(stock), req.params.id]);
    ok(res, { message: 'Product updated' });
  } catch (e) { fail(res, e.message); }
});
app.delete('/api/products/:id', async (req, res) => {
  try { await run('DELETE FROM products WHERE id=?', [req.params.id]); ok(res, { message: 'Product deleted' }); }
  catch (e) { fail(res, e.message); }
});

/* CHECKOUT */
app.post('/api/checkout', async (req, res) => {
  try {
    const { paymentMethod, items } = req.body;
    if (!items?.length) return fail(res, 'Cart is empty');

    let subtotal = 0;
    const lineItems = [];
    for (const item of items) {
      const p = await get('SELECT * FROM products WHERE id=?', [item.productId]);
      if (!p) return fail(res, `Product ${item.productId} not found`);
      if (p.stock < item.quantity) return fail(res, `Insufficient stock for ${p.name}`);
      subtotal += p.price * item.quantity;
      lineItems.push({ ...item, unitPrice: p.price });
    }
    const taxSetting = await get("SELECT value FROM settings WHERE key='taxRate'");
    const taxRate = parseFloat(taxSetting?.value || '8');
    const total = subtotal * (1 + taxRate / 100);

    const saleResult = await run('INSERT INTO sales (total, payment_method) VALUES (?,?)', [total, paymentMethod]);
    const saleId = saleResult.lastInsertRowid;

    for (const item of lineItems) {
      await run('INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES (?,?,?,?)',
        [saleId, item.productId, item.quantity, item.unitPrice]);
      await run('UPDATE products SET stock=stock-? WHERE id=?', [item.quantity, item.productId]);
    }
    ok(res, { saleId, total });
  } catch (e) { fail(res, e.message, 500); }
});

/* SALES */
app.get('/api/sales', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM sales ORDER BY sold_at DESC LIMIT 50')); }
  catch (e) { fail(res, e.message, 500); }
});
app.get('/api/admin/sales', async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM sales';
    const params = [];
    if (from && to) { sql += ' WHERE DATE(sold_at) BETWEEN ? AND ?'; params.push(from, to); }
    sql += ' ORDER BY sold_at DESC LIMIT 500';
    const sales = await query(sql, params);
    const total = sales.reduce((s, x) => s + Number(x.total), 0);
    ok(res, { sales, total, orders: sales.length });
  } catch (e) { fail(res, e.message, 500); }
});

/* DASHBOARD */
app.get('/api/dashboard', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [s, o, pc, ls] = await Promise.all([
      get('SELECT COALESCE(SUM(total),0) AS v FROM sales WHERE DATE(sold_at)=?', [today]),
      get('SELECT COUNT(*) AS v FROM sales WHERE DATE(sold_at)=?', [today]),
      get('SELECT COUNT(*) AS v FROM products'),
      get('SELECT COUNT(*) AS v FROM products WHERE stock<=5'),
    ]);
    ok(res, { todaySales: Number(s.v), todayOrders: Number(o.v), productCount: Number(pc.v), lowStockCount: Number(ls.v) });
  } catch (e) { fail(res, e.message, 500); }
});

/* CUSTOMERS */
app.get('/api/customers', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM customers ORDER BY name')); } catch (e) { fail(res, e.message, 500); }
});
app.post('/api/customers', async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    await run('INSERT INTO customers (name, phone, email, notes) VALUES (?,?,?,?)',
      [name, phone || null, email || null, notes || null]);
    ok(res, { message: 'Customer added' });
  } catch (e) { fail(res, e.message); }
});

/* SUPPLIERS */
app.get('/api/suppliers', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM suppliers ORDER BY name')); } catch (e) { fail(res, e.message, 500); }
});
app.post('/api/suppliers', async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    await run('INSERT INTO suppliers (name, phone, email, notes) VALUES (?,?,?,?)',
      [name, phone || null, email || null, notes || null]);
    ok(res, { message: 'Supplier added' });
  } catch (e) { fail(res, e.message); }
});

/* EXPENSES */
app.get('/api/expenses', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM expenses ORDER BY spent_at DESC')); } catch (e) { fail(res, e.message, 500); }
});
app.post('/api/expenses', async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    await run('INSERT INTO expenses (description, amount, category) VALUES (?,?,?)',
      [description, Number(amount), category]);
    ok(res, { message: 'Expense recorded' });
  } catch (e) { fail(res, e.message); }
});

/* SETTINGS */
app.get('/api/settings', async (_req, res) => {
  try {
    const rows = await query('SELECT key, value FROM settings');
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    ok(res, { storeName: m.storeName || 'Counterpoint', taxRate: parseFloat(m.taxRate || '8'), currency: m.currency || 'USD' });
  } catch (e) { fail(res, e.message, 500); }
});
app.put('/api/settings', async (req, res) => {
  try {
    const { storeName, taxRate, currency } = req.body;
    await run("INSERT OR REPLACE INTO settings (key,value) VALUES ('storeName',?)", [storeName]);
    await run("INSERT OR REPLACE INTO settings (key,value) VALUES ('taxRate',?)", [String(taxRate)]);
    await run("INSERT OR REPLACE INTO settings (key,value) VALUES ('currency',?)", [currency]);
    ok(res, { message: 'Settings saved' });
  } catch (e) { fail(res, e.message); }
});

/* REPORTS */
app.get('/api/reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return fail(res, 'from and to required');
    const s = await get('SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS orders FROM sales WHERE DATE(sold_at) BETWEEN ? AND ?', [from, to]);
    const e = await get('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE DATE(spent_at) BETWEEN ? AND ?', [from, to]);
    ok(res, { sales: Number(s.total), orders: Number(s.orders), expenses: Number(e.total), profit: Number(s.total) - Number(e.total) });
  } catch (e) { fail(res, e.message, 500); }
});

/* BACKUP / RESTORE */
app.get('/api/backup', async (_req, res) => {
  try {
    const [products, sales, saleItems, customers, suppliers, expenses, settings] = await Promise.all([
      query('SELECT * FROM products'), query('SELECT * FROM sales'), query('SELECT * FROM sale_items'),
      query('SELECT * FROM customers'), query('SELECT * FROM suppliers'), query('SELECT * FROM expenses'),
      query('SELECT * FROM settings'),
    ]);
    const snapshot = { exportedAt: new Date().toISOString(), version: 1, data: { products, sales, saleItems, customers, suppliers, expenses, settings } };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="counterpoint-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (e) { fail(res, e.message, 500); }
});
app.post('/api/restore', async (req, res) => {
  try {
    const { snapshot } = req.body;
    if (!snapshot?.data) return fail(res, 'Invalid backup');
    const d = snapshot.data;
    await run('DELETE FROM sale_items'); await run('DELETE FROM sales'); await run('DELETE FROM products');
    await run('DELETE FROM customers'); await run('DELETE FROM suppliers'); await run('DELETE FROM expenses');
    await run('DELETE FROM settings');
    for (const p of d.products || []) await run('INSERT INTO products (id,sku,name,category,price,stock,created_at) VALUES (?,?,?,?,?,?,?)', [p.id,p.sku,p.name,p.category,p.price,p.stock,p.created_at]);
    for (const s of d.sales || []) await run('INSERT INTO sales (id,total,payment_method,sold_at) VALUES (?,?,?,?)', [s.id,s.total,s.payment_method,s.sold_at]);
    for (const si of d.saleItems || []) await run('INSERT INTO sale_items (id,sale_id,product_id,quantity,unit_price) VALUES (?,?,?,?,?)', [si.id,si.sale_id,si.product_id,si.quantity,si.unit_price]);
    for (const c of d.customers || []) await run('INSERT INTO customers (id,name,phone,email,notes,created_at) VALUES (?,?,?,?,?,?)', [c.id,c.name,c.phone,c.email,c.notes,c.created_at]);
    for (const s of d.suppliers || []) await run('INSERT INTO suppliers (id,name,phone,email,notes,created_at) VALUES (?,?,?,?,?,?)', [s.id,s.name,s.phone,s.email,s.notes,s.created_at]);
    for (const e of d.expenses || []) await run('INSERT INTO expenses (id,description,amount,category,spent_at) VALUES (?,?,?,?,?)', [e.id,e.description,e.amount,e.category,e.spent_at]);
    for (const s of d.settings || []) await run('INSERT INTO settings (key,value) VALUES (?,?)', [s.key,s.value]);
    ok(res, { message: 'Database restored' });
  } catch (e) { fail(res, e.message, 500); }
});

/* START */
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

initDatabase()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`\n🚀 Counterpoint POS running on ${HOST}:${PORT}`);
      console.log(`   DB: ${process.env.TURSO_DATABASE_URL ? '✅ connected' : '❌ missing .env'}`);
      console.log(`   Login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}\n`);
    });
  })
  .catch((e) => { console.error('❌ Failed:', e.message); process.exit(1); });