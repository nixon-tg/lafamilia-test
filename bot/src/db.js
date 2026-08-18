import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH || './data/lafamilia.sqlite';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

const seed = db.prepare('SELECT COUNT(*) AS count FROM products').get();
if (seed.count === 0) {
  const insert = db.prepare('INSERT INTO products (name, description, price_cents) VALUES (?, ?, ?)');
  const seedMany = db.transaction(() => {
    insert.run('Produkt przykładowy A', 'Zastąp opis legalnego produktu.', 1999);
    insert.run('Produkt przykładowy B', 'Zastąp opis legalnego produktu.', 2999);
    insert.run('Produkt przykładowy C', 'Zastąp opis legalnego produktu.', 4999);
  });
  seedMany();
}

export function upsertUser(user) {
  db.prepare(`INSERT INTO users (id, username, first_name) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name`)
    .run(user.id, user.username || null, user.first_name || null);
}

export function listProducts() {
  return db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY id').all();
}

export function getProduct(id) {
  return db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id);
}

export function createOrder(userId, items) {
  const create = db.transaction(() => {
    let total = 0;
    for (const item of items) total += item.product.price_cents * item.quantity;

    const order = db.prepare('INSERT INTO orders (user_id, total_cents) VALUES (?, ?)').run(userId, total);
    const addItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price_cents) VALUES (?, ?, ?, ?)');
    for (const item of items) addItem.run(order.lastInsertRowid, item.product.id, item.quantity, item.product.price_cents);
    return Number(order.lastInsertRowid);
  });
  return create();
}

export function listRecentOrders(limit = 20) {
  return db.prepare(`SELECT o.*, u.username, u.first_name
    FROM orders o JOIN users u ON u.id=o.user_id
    ORDER BY o.id DESC LIMIT ?`).all(limit);
}

export function setOrderStatus(id, status) {
  return db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
}

export default db;
