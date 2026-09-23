import { db } from './db.js';

export async function initDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Other',
      price REAL NOT NULL,
      compare_price REAL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      reorder_level INTEGER DEFAULT 5,
      stock INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      voided_at DATETIME,
      sold_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      spent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT,
      reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS held_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      items_json TEXT NOT NULL,
      payment_method TEXT,
      total REAL DEFAULT 0,
      held_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const sql of tables) {
    await db.execute(sql);
  }

  // Safe column adds for existing tables (ignored if column already exists)
  const alters = [
    `ALTER TABLE products ADD COLUMN compare_price REAL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN reorder_level INTEGER DEFAULT 5`,
    `ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'completed'`,
    `ALTER TABLE sales ADD COLUMN voided_at DATETIME`,
  ];
  for (const sql of alters) {
    try { await db.execute(sql); } catch { /* exists */ }
  }

  const defaults = [
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('storeName', 'Counterpoint')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('taxRate', '8')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'USD')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('allowNegativeStock', 'false')`,
  ];
  for (const sql of defaults) {
    await db.execute(sql);
  }

  const result = await db.execute('SELECT COUNT(*) AS c FROM products');
  const count = Number(result.rows[0].c);

  if (count === 0) {
    const samples = [
      `INSERT INTO products (sku,name,category,price,compare_price,reorder_level,stock) VALUES ('ESP-001','Espresso','Coffee',2.50,3.00,20,100)`,
      `INSERT INTO products (sku,name,category,price,compare_price,reorder_level,stock) VALUES ('LAT-001','Latte','Coffee',3.75,4.25,20,100)`,
      `INSERT INTO products (sku,name,category,price,compare_price,reorder_level,stock) VALUES ('CAP-001','Cappuccino','Coffee',3.50,4.00,20,100)`,
      `INSERT INTO products (sku,name,category,price,compare_price,reorder_level,stock) VALUES ('AME-001','Americano','Coffee',3.00,0,20,100)`,
      `INSERT INTO products (sku,name,category,price,compare_price,reorder_level,stock) VALUES ('GRT-001','Green Tea','Tea',2.75,0,15,80)`,
      `INSERT INTO products (sku,name,category,price,compare_price,reorder_level,stock) VALUES ('CRS-001','Croissant','Bakery',2.25,0,10,40)`,
      `INSERT INTO products (sku,name,category,price,compare_price,reorder_level,stock) VALUES ('MUF-001','Blueberry Muffin','Bakery',2.95,3.50,10,30)`,
      `INSERT INTO products (sku,name,category,price,compare_price,reorder_level,stock) VALUES ('SAN-001','Club Sandwich','Food',6.50,0,5,20)`,
    ];
    for (const sql of samples) {
      await db.execute(sql);
    }
    console.log('✅ Seeded sample products');
  }

  console.log('✅ Schema initialized on Turso');
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('schema.js');
if (isDirectRun) {
  initDatabase()
    .then(() => { console.log('✅ Done'); process.exit(0); })
    .catch((e) => { console.error('❌ Failed:', e.message || e); process.exit(1); });
}