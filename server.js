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

const ok = (res, data) => res.json(data);
const fail = (res, msg, code = 400) => res.status(code).json({ message: msg });

/* ============================================================
   AUTH — DB-backed
   ============================================================ */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return fail(res, 'Username and password required', 400);

    const user = await get(
      'SELECT * FROM users WHERE username = ? AND active = 1',
      [username]
    );
    if (!user) return fail(res, 'Invalid username or password', 401);
    if (user.password_hash !== password) return fail(res, 'Invalid username or password', 401);

    ok(res, {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

/* ============================================================
   USERS
   ============================================================ */
app.get('/api/users', async (_req, res) => {
  try {
    ok(res, await query('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id'));
  } catch (e) { fail(res, e.message, 500); }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;
    if (!username || !password) return fail(res, 'Username and password required');
    if (password.length < 4) return fail(res, 'Password must be at least 4 characters');

    const r = await run(
      'INSERT INTO users (username, password_hash, full_name, role, active) VALUES (?,?,?,?,1)',
      [username.trim(), password, full_name || null, role || 'cashier']
    );
    ok(res, { id: r.lastInsertRowid, message: 'User added' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return fail(res, 'Username already exists');
    fail(res, e.message);
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { username, password, full_name, role, active } = req.body;
    const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return fail(res, 'User not found');

    const willBeAdmin = role !== undefined ? role === 'admin' : user.role === 'admin';
    const willBeActive = active !== undefined ? Boolean(active) : Boolean(user.active);
    if (user.role === 'admin' && (!willBeAdmin || !willBeActive)) {
      const admins = await get(
        "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1 AND id != ?",
        [req.params.id]
      );
      if (Number(admins.c) === 0) return fail(res, 'Cannot remove the last active admin');
    }

    const newPassword = password ? password : user.password_hash;
    await run(
      'UPDATE users SET username=?, password_hash=?, full_name=?, role=?, active=? WHERE id=?',
      [
        username || user.username,
        newPassword,
        full_name !== undefined ? full_name : user.full_name,
        role || user.role,
        active !== undefined ? (active ? 1 : 0) : user.active,
        req.params.id,
      ]
    );
    ok(res, { message: 'User updated' });
  } catch (e) { fail(res, e.message); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return fail(res, 'User not found');

    if (user.role === 'admin') {
      const admins = await get(
        "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1 AND id != ?",
        [req.params.id]
      );
      if (Number(admins.c) === 0) return fail(res, 'Cannot delete the last active admin');
    }

    await run('DELETE FROM users WHERE id = ?', [req.params.id]);
    ok(res, { message: 'User deleted' });
  } catch (e) { fail(res, e.message); }
});

/* ============================================================
   PRODUCTS
   ============================================================ */
app.get('/api/products', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM products ORDER BY name')); }
  catch (e) { fail(res, e.message, 500); }
});
app.get('/api/products/low-stock', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM products WHERE stock <= reorder_level ORDER BY stock ASC')); }
  catch (e) { fail(res, e.message, 500); }
});
app.post('/api/products', async (req, res) => {
  try {
    const { sku, name, category, price, compare_price, cost_price, reorder_level, stock } = req.body;
    const r = await run(
      'INSERT INTO products (sku, name, category, price, compare_price, cost_price, reorder_level, stock) VALUES (?,?,?,?,?,?,?,?)',
      [sku, name, category || 'Other', Number(price), Number(compare_price) || 0, Number(cost_price) || 0, Number(reorder_level) || 5, Number(stock)]
    );
    ok(res, { id: r.lastInsertRowid, message: 'Product added' });
  } catch (e) { fail(res, e.message); }
});
app.put('/api/products/:id', async (req, res) => {
  try {
    const { sku, name, category, price, compare_price, cost_price, reorder_level, stock } = req.body;
    await run(
      'UPDATE products SET sku=?, name=?, category=?, price=?, compare_price=?, cost_price=?, reorder_level=?, stock=? WHERE id=?',
      [sku, name, category, Number(price), Number(compare_price) || 0, Number(cost_price) || 0, Number(reorder_level) || 5, Number(stock), req.params.id]
    );
    ok(res, { message: 'Product updated' });
  } catch (e) { fail(res, e.message); }
});
app.delete('/api/products/:id', async (req, res) => {
  try { await run('DELETE FROM products WHERE id=?', [req.params.id]); ok(res, { message: 'Product deleted' }); }
  catch (e) { fail(res, e.message); }
});

/* ============================================================
   CATEGORIES
   ============================================================ */
app.get('/api/categories', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM categories ORDER BY sort_order, name')); }
  catch (e) { fail(res, e.message, 500); }
});
app.post('/api/categories', async (req, res) => {
  try {
    const { name, icon, sort_order } = req.body;
    if (!name || !name.trim()) return fail(res, 'Category name required');
    const r = await run(
      'INSERT INTO categories (name, icon, sort_order) VALUES (?,?,?)',
      [name.trim(), icon || '📦', Number(sort_order) || 0]
    );
    ok(res, { id: r.lastInsertRowid, message: 'Category added' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return fail(res, 'Category already exists');
    fail(res, e.message);
  }
});
app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name, icon, sort_order } = req.body;
    await run(
      'UPDATE categories SET name=?, icon=?, sort_order=? WHERE id=?',
      [name, icon || '📦', Number(sort_order) || 0, req.params.id]
    );
    ok(res, { message: 'Category updated' });
  } catch (e) { fail(res, e.message); }
});
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const cat = await get('SELECT * FROM categories WHERE id=?', [req.params.id]);
    if (!cat) return fail(res, 'Category not found');
    const inUse = await get('SELECT COUNT(*) AS c FROM products WHERE category=?', [cat.name]);
    if (Number(inUse.c) > 0) return fail(res, `Cannot delete: ${inUse.c} product(s) use "${cat.name}"`);
    await run('DELETE FROM categories WHERE id=?', [req.params.id]);
    ok(res, { message: 'Category deleted' });
  } catch (e) { fail(res, e.message); }
});

/* ============================================================
   STOCK MOVEMENTS
   ============================================================ */
app.get('/api/stock/movements', async (req, res) => {
  try {
    const { productId, limit = 100 } = req.query;
    let sql = `SELECT sm.*, p.name AS product_name, p.sku
               FROM stock_movements sm
               JOIN products p ON p.id = sm.product_id`;
    const params = [];
    if (productId) { sql += ' WHERE sm.product_id = ?'; params.push(productId); }
    sql += ' ORDER BY sm.created_at DESC LIMIT ?';
    params.push(Number(limit));
    ok(res, await query(sql, params));
  } catch (e) { fail(res, e.message, 500); }
});
app.post('/api/stock/adjust', async (req, res) => {
  try {
    const { productId, movementType, quantity, reason } = req.body;
    const qty = Number(quantity);
    if (!productId || !qty || qty <= 0) return fail(res, 'Invalid product or quantity');
    if (!['in', 'out', 'adjustment'].includes(movementType)) return fail(res, 'Invalid movement type');
    const p = await get('SELECT * FROM products WHERE id=?', [productId]);
    if (!p) return fail(res, 'Product not found');

    let delta = 0;
    if (movementType === 'in') delta = qty;
    else if (movementType === 'out') delta = -qty;
    else delta = qty - p.stock;

    const newStock = p.stock + delta;
    if (newStock < 0) return fail(res, 'Stock cannot go below zero');

    await run('UPDATE products SET stock=? WHERE id=?', [newStock, productId]);
    await run(
      'INSERT INTO stock_movements (product_id, movement_type, quantity, reason) VALUES (?,?,?,?)',
      [productId, movementType, Math.abs(delta), reason || null]
    );

    ok(res, {
      message: 'Stock updated',
      product: { id: productId, name: p.name, previousStock: p.stock, newStock },
      movementType,
      delta,
    });
  } catch (e) { fail(res, e.message, 500); }
});

/* ============================================================
   HELD BILLS
   ============================================================ */
app.get('/api/held-bills', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM held_bills ORDER BY held_at DESC');
    ok(res, rows.map((r) => ({ ...r, items: JSON.parse(r.items_json) })));
  } catch (e) { fail(res, e.message, 500); }
});
app.post('/api/held-bills', async (req, res) => {
  try {
    const { label, items, paymentMethod, total } = req.body;
    if (!items?.length) return fail(res, 'No items to hold');
    const r = await run(
      'INSERT INTO held_bills (label, items_json, payment_method, total) VALUES (?,?,?,?)',
      [label || `Bill ${Date.now()}`, JSON.stringify(items), paymentMethod || 'Cash', Number(total) || 0]
    );
    ok(res, { id: r.lastInsertRowid, message: 'Bill held' });
  } catch (e) { fail(res, e.message, 500); }
});
app.delete('/api/held-bills/:id', async (req, res) => {
  try { await run('DELETE FROM held_bills WHERE id=?', [req.params.id]); ok(res, { message: 'Held bill removed' }); }
  catch (e) { fail(res, e.message, 500); }
});

/* ============================================================
   CHECKOUT
   ============================================================ */
app.post('/api/checkout', async (req, res) => {
  try {
    const { paymentMethod, items } = req.body;
    if (!items?.length) return fail(res, 'Cart is empty');

    const allowNegSetting = await get("SELECT value FROM settings WHERE key='allowNegativeStock'");
    const allowNeg = allowNegSetting?.value === 'true';

    let subtotal = 0;
    const lineItems = [];
    for (const item of items) {
      const p = await get('SELECT * FROM products WHERE id=?', [item.productId]);
      if (!p) return fail(res, `Product ${item.productId} not found`);
      if (!allowNeg && p.stock < item.quantity) return fail(res, `Insufficient stock for ${p.name} (only ${p.stock} left)`);
      subtotal += p.price * item.quantity;
      lineItems.push({ ...item, unitPrice: p.price });
    }
    const taxSetting = await get("SELECT value FROM settings WHERE key='taxRate'");
    const taxRate = parseFloat(taxSetting?.value || '8');
    const total = subtotal * (1 + taxRate / 100);

    const saleResult = await run('INSERT INTO sales (total, payment_method, status) VALUES (?,?,?)', [total, paymentMethod, 'completed']);
    const saleId = saleResult.lastInsertRowid;

    for (const item of lineItems) {
      const lineTotal = item.unitPrice * item.quantity;
      await run(
        'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, line_total) VALUES (?,?,?,?,?)',
        [saleId, item.productId, item.quantity, item.unitPrice, lineTotal]
      );
      await run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.productId]);
      await run(
        'INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference) VALUES (?,?,?,?,?)',
        [item.productId, 'out', item.quantity, 'Sale', `sale#${saleId}`]
      );
    }
    ok(res, { saleId, total });
  } catch (e) { fail(res, e.message, 500); }
});

/* ============================================================
   VOID SALE
   ============================================================ */
app.post('/api/sales/:id/void', async (req, res) => {
  try {
    const sale = await get('SELECT * FROM sales WHERE id=?', [req.params.id]);
    if (!sale) return fail(res, 'Sale not found');
    if (sale.status === 'voided') return fail(res, 'Sale already voided');
    const items = await query('SELECT * FROM sale_items WHERE sale_id=?', [req.params.id]);
    for (const item of items) {
      await run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      await run(
        'INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference) VALUES (?,?,?,?,?)',
        [item.product_id, 'in', item.quantity, 'Void bill', `sale#${req.params.id}`]
      );
    }
    await run("UPDATE sales SET status='voided', voided_at=CURRENT_TIMESTAMP WHERE id=?", [req.params.id]);
    ok(res, { message: 'Sale voided and stock restored', saleId: req.params.id });
  } catch (e) { fail(res, e.message, 500); }
});

/* ============================================================
   SALES
   ============================================================ */
app.get('/api/sales', async (_req, res) => {
  try { ok(res, await query("SELECT * FROM sales WHERE status != 'voided' ORDER BY sold_at DESC LIMIT 50")); }
  catch (e) { fail(res, e.message, 500); }
});
app.get('/api/admin/sales', async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = "SELECT * FROM sales WHERE status != 'voided'";
    const params = [];
    if (from && to) { sql += ' AND DATE(sold_at) BETWEEN ? AND ?'; params.push(from, to); }
    sql += ' ORDER BY sold_at DESC LIMIT 500';
    const sales = await query(sql, params);
    const total = sales.reduce((s, x) => s + Number(x.total), 0);
    ok(res, { sales, total, orders: sales.length });
  } catch (e) { fail(res, e.message, 500); }
});

/* ============================================================
   DASHBOARD
   ============================================================ */
app.get('/api/dashboard', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [s, o, pc, ls] = await Promise.all([
      get("SELECT COALESCE(SUM(total),0) AS v FROM sales WHERE DATE(sold_at)=? AND status!='voided'", [today]),
      get("SELECT COUNT(*) AS v FROM sales WHERE DATE(sold_at)=? AND status!='voided'", [today]),
      get('SELECT COUNT(*) AS v FROM products'),
      get('SELECT COUNT(*) AS v FROM products WHERE stock <= reorder_level'),
    ]);
    ok(res, { todaySales: Number(s.v), todayOrders: Number(o.v), productCount: Number(pc.v), lowStockCount: Number(ls.v) });
  } catch (e) { fail(res, e.message, 500); }
});

/* ============================================================
   CUSTOMERS
   ============================================================ */
app.get('/api/customers', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM customers ORDER BY name')); }
  catch (e) { fail(res, e.message, 500); }
});
app.post('/api/customers', async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    await run('INSERT INTO customers (name, phone, email, notes) VALUES (?,?,?,?)',
      [name, phone || null, email || null, notes || null]);
    ok(res, { message: 'Customer added' });
  } catch (e) { fail(res, e.message); }
});

/* ============================================================
   SUPPLIERS
   ============================================================ */
app.get('/api/suppliers', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM suppliers ORDER BY name')); }
  catch (e) { fail(res, e.message, 500); }
});
app.post('/api/suppliers', async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    await run('INSERT INTO suppliers (name, phone, email, notes) VALUES (?,?,?,?)',
      [name, phone || null, email || null, notes || null]);
    ok(res, { message: 'Supplier added' });
  } catch (e) { fail(res, e.message); }
});

/* ============================================================
   EXPENSES
   ============================================================ */
app.get('/api/expenses', async (_req, res) => {
  try { ok(res, await query('SELECT * FROM expenses ORDER BY spent_at DESC')); }
  catch (e) { fail(res, e.message, 500); }
});
app.post('/api/expenses', async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    await run('INSERT INTO expenses (description, amount, category) VALUES (?,?,?)',
      [description, Number(amount), category]);
    ok(res, { message: 'Expense recorded' });
  } catch (e) { fail(res, e.message); }
});

/* ============================================================
   SETTINGS
   ============================================================ */
app.get('/api/settings', async (_req, res) => {
  try {
    const rows = await query('SELECT key, value FROM settings');
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    ok(res, {
      storeName: m.storeName || 'Counterpoint',
      taxRate: parseFloat(m.taxRate || '8'),
      currency: m.currency || 'USD',
      allowNegativeStock: m.allowNegativeStock === 'true',
    });
  } catch (e) { fail(res, e.message, 500); }
});
app.put('/api/settings', async (req, res) => {
  try {
    const { storeName, taxRate, currency, allowNegativeStock } = req.body;
    if (storeName !== undefined) await run("INSERT OR REPLACE INTO settings (key,value) VALUES ('storeName',?)", [storeName]);
    if (taxRate !== undefined) await run("INSERT OR REPLACE INTO settings (key,value) VALUES ('taxRate',?)", [String(taxRate)]);
    if (currency !== undefined) await run("INSERT OR REPLACE INTO settings (key,value) VALUES ('currency',?)", [currency]);
    if (allowNegativeStock !== undefined) await run("INSERT OR REPLACE INTO settings (key,value) VALUES ('allowNegativeStock',?)", [String(allowNegativeStock)]);
    ok(res, { message: 'Settings saved' });
  } catch (e) { fail(res, e.message); }
});

/* ============================================================
   REPORTS
   ============================================================ */
app.get('/api/reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return fail(res, 'from and to required');
    const s = await get("SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS orders FROM sales WHERE DATE(sold_at) BETWEEN ? AND ? AND status!='voided'", [from, to]);
    const e = await get('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE DATE(spent_at) BETWEEN ? AND ?', [from, to]);
    ok(res, { sales: Number(s.total), orders: Number(s.orders), expenses: Number(e.total), profit: Number(s.total) - Number(e.total) });
  } catch (e) { fail(res, e.message, 500); }
});

/* ============================================================
   BACKUP / RESTORE
   ============================================================ */
app.get('/api/backup', async (_req, res) => {
  try {
    const [products, sales, saleItems, customers, suppliers, expenses, settings, stockMovements, heldBills, users, categories] = await Promise.all([
      query('SELECT * FROM products'), query('SELECT * FROM sales'), query('SELECT * FROM sale_items'),
      query('SELECT * FROM customers'), query('SELECT * FROM suppliers'), query('SELECT * FROM expenses'),
      query('SELECT * FROM settings'), query('SELECT * FROM stock_movements'), query('SELECT * FROM held_bills'),
      query('SELECT id, username, password_hash, full_name, role, active, created_at FROM users'),
      query('SELECT * FROM categories'),
    ]);
    const snapshot = {
      exportedAt: new Date().toISOString(),
      version: 3,
      data: { products, sales, saleItems, customers, suppliers, expenses, settings, stockMovements, heldBills, users, categories },
    };
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
    await run('DELETE FROM settings'); await run('DELETE FROM stock_movements'); await run('DELETE FROM held_bills');
    await run('DELETE FROM categories'); await run('DELETE FROM users');

    for (const c of d.categories || []) await run('INSERT INTO categories (id,name,icon,sort_order,created_at) VALUES (?,?,?,?,?)', [c.id,c.name,c.icon,c.sort_order,c.created_at]);
    for (const u of d.users || []) await run('INSERT INTO users (id,username,password_hash,full_name,role,active,created_at) VALUES (?,?,?,?,?,?,?)', [u.id,u.username,u.password_hash,u.full_name,u.role,u.active,u.created_at]);
    for (const p of d.products || []) await run('INSERT INTO products (id,sku,name,category,price,compare_price,cost_price,reorder_level,stock,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [p.id,p.sku,p.name,p.category,p.price,p.compare_price||0,p.cost_price||0,p.reorder_level||5,p.stock,p.created_at]);
    for (const s of d.sales || []) await run('INSERT INTO sales (id,total,payment_method,status,voided_at,sold_at) VALUES (?,?,?,?,?,?)', [s.id,s.total,s.payment_method,s.status||'completed',s.voided_at||null,s.sold_at]);
    for (const si of d.saleItems || []) await run('INSERT INTO sale_items (id,sale_id,product_id,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?)', [si.id,si.sale_id,si.product_id,si.quantity,si.unit_price,si.line_total||si.unit_price*si.quantity]);
    for (const c of d.customers || []) await run('INSERT INTO customers (id,name,phone,email,notes,created_at) VALUES (?,?,?,?,?,?)', [c.id,c.name,c.phone,c.email,c.notes,c.created_at]);
    for (const s of d.suppliers || []) await run('INSERT INTO suppliers (id,name,phone,email,notes,created_at) VALUES (?,?,?,?,?,?)', [s.id,s.name,s.phone,s.email,s.notes,s.created_at]);
    for (const e of d.expenses || []) await run('INSERT INTO expenses (id,description,amount,category,spent_at) VALUES (?,?,?,?,?)', [e.id,e.description,e.amount,e.category,e.spent_at]);
    for (const s of d.settings || []) await run('INSERT INTO settings (key,value) VALUES (?,?)', [s.key,s.value]);
    for (const sm of d.stockMovements || []) await run('INSERT INTO stock_movements (id,product_id,movement_type,quantity,reason,reference,created_at) VALUES (?,?,?,?,?,?,?)', [sm.id,sm.product_id,sm.movement_type,sm.quantity,sm.reason,sm.reference,sm.created_at]);
    for (const hb of d.heldBills || []) await run('INSERT INTO held_bills (id,label,items_json,payment_method,total,held_at) VALUES (?,?,?,?,?,?)', [hb.id,hb.label,hb.items_json,hb.payment_method,hb.total,hb.held_at]);

    ok(res, { message: 'Database restored' });
  } catch (e) { fail(res, e.message, 500); }
});

/* ============================================================
   START
   ============================================================ */
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Counterpoint POS running on ${HOST}:${PORT}`);
  console.log(`   DB: ${process.env.TURSO_DATABASE_URL ? '✅ connected' : '❌ missing .env'}`);
  initDatabase()
    .then(() => console.log('✅ Database ready'))
    .catch((e) => console.error('⚠️ DB init warning (server still running):', e.message));
});