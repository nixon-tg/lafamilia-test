import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error('DATABASE_URL or POSTGRES_URL is required');

const sql = neon(connectionString);
let initialized;

export async function initDb() {
  if (!initialized) {
    initialized = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (id BIGINT PRIMARY KEY, username TEXT, first_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE)`;
      await sql`CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'new', total_cents INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE TABLE IF NOT EXISTS order_items (id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, price_cents INTEGER NOT NULL)`;
      const rows = await sql`SELECT COUNT(*)::int AS count FROM products`;
      if (rows[0].count === 0) {
        await sql`INSERT INTO products (name, description, price_cents) VALUES ('Produkt przykładowy A','Zastąp legalnym produktem.',1999),('Produkt przykładowy B','Zastąp legalnym produktem.',2999),('Produkt przykładowy C','Zastąp legalnym produktem.',4999)`;
      }
    })();
  }
  return initialized;
}

export async function upsertUser(user) {
  await initDb();
  await sql`INSERT INTO users (id, username, first_name) VALUES (${user.id}, ${user.username || null}, ${user.first_name || null}) ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username, first_name=EXCLUDED.first_name`;
}

export async function listProducts() { await initDb(); return sql`SELECT * FROM products WHERE active = TRUE ORDER BY id`; }
export async function getProduct(id) { await initDb(); const rows = await sql`SELECT * FROM products WHERE id=${id} AND active=TRUE`; return rows[0] || null; }

export async function createOrder(userId, items) {
  await initDb();
  const total = items.reduce((sum, item) => sum + item.product.price_cents * item.quantity, 0);
  const order = await sql`INSERT INTO orders (user_id,total_cents) VALUES (${userId},${total}) RETURNING id`;
  const orderId = order[0].id;
  for (const item of items) await sql`INSERT INTO order_items (order_id,product_id,quantity,price_cents) VALUES (${orderId},${item.product.id},${item.quantity},${item.product.price_cents})`;
  return Number(orderId);
}

export async function listUserOrders(userId) { await initDb(); return sql`SELECT id,status,total_cents,created_at FROM orders WHERE user_id=${userId} ORDER BY id DESC LIMIT 20`; }
export async function listRecentOrders(limit=20) { await initDb(); return sql`SELECT o.*,u.username,u.first_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT ${limit}`; }
export async function setOrderStatus(id,status) { await initDb(); return sql`UPDATE orders SET status=${status} WHERE id=${id}`; }
