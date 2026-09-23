import { db } from './db.js';

export async function initDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Other',
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      sold_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL
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
  ];

  for (const sql of tables) {
    await db.execute(sql);
  }

  const defaults = [
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('storeName', 'Counterpoint')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('taxRate', '8')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'USD')`,
  ];
  for (const sql of defaults) {
    await db.execute(sql);
  }

  const result = await db.execute('SELECT COUNT(*) AS c FROM products');
  const count = Number(result.rows[0].c);

  if (count === 0) {
    const samples = [
      `INSERT INTO products (sku,name,category,price,stock) VALUES ('ESP-001','Espresso','Coffee',2.50,100)`,
      `INSERT INTO products (sku,name,category,price,stock) VALUES ('LAT-001','Latte','Coffee',3.75,100)`,
      `INSERT INTO products (sku,name,category,price,stock) VALUES ('CAP-001','Cappuccino','Coffee',3.50,100)`,
      `INSERT INTO products (sku,name,category,price,stock) VALUES ('AME-001','Americano','Coffee',3.00,100)`,
      `INSERT INTO products (sku,name,category,price,stock) VALUES ('GRT-001','Green Tea','Tea',2.75,80)`,
      `INSERT INTO products (sku,name,category,price,stock) VALUES ('CRS-001','Croissant','Bakery',2.25,40)`,
      `INSERT INTO products (sku,name,category,price,stock) VALUES ('MUF-001','Blueberry Muffin','Bakery',2.95,30)`,
      `INSERT INTO products (sku,name,category,price,stock) VALUES ('SAN-001','Club Sandwich','Food',6.50,20)`,
    ];
    for (const sql of samples) {
      await db.execute(sql);
    }
    console.log('✅ Seeded sample products');
  }

  console.log('✅ Schema initialized on Turso');
}

// Only run automatically when this file is executed directly
// (e.g. `node schema.js` or `npm run init-db`), not when imported by server.js
const isDirectRun = process.argv[1] && process.argv[1].endsWith('schema.js');
if (isDirectRun) {
  initDatabase()
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((e) => {
      console.error('❌ Failed:', e.message || e);
      process.exit(1);
    });
}