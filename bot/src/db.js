import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error('DATABASE_URL or POSTGRES_URL is required');

const sql = neon(connectionString);
let initialized;

export async function initDb() {
  if (!initialized) {
    initialized = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (id BIGINT PRIMARY KEY, username TEXT, first_name TEXT, balance_cents INTEGER NOT NULL DEFAULT 0, last_bot_message_id BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_cents INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bot_message_id BIGINT`;
      await sql`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE)`;
      await sql`CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'new', total_cents INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE TABLE IF NOT EXISTS order_items (id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, price_cents INTEGER NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS balance_transactions (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), amount_cents INTEGER NOT NULL, type TEXT NOT NULL, reference TEXT, idempotency_key TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE TABLE IF NOT EXISTS topup_requests (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ)`;
      await sql`CREATE TABLE IF NOT EXISTS order_status_history (id BIGSERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, old_status TEXT, new_status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
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
export async function getLastBotMessageId(userId) { await initDb(); const rows = await sql`SELECT last_bot_message_id FROM users WHERE id=${userId}`; return rows[0]?.last_bot_message_id ? Number(rows[0].last_bot_message_id) : null; }
export async function setLastBotMessageId(userId, messageId) { await initDb(); await sql`UPDATE users SET last_bot_message_id=${messageId} WHERE id=${userId}`; }
export async function listProducts() { await initDb(); return sql`SELECT * FROM products WHERE active = TRUE ORDER BY id`; }
export async function getProduct(id) { await initDb(); const rows = await sql`SELECT * FROM products WHERE id=${id} AND active=TRUE`; return rows[0] || null; }

export async function createOrder(userId, items) {
  await initDb();
  const total = items.reduce((sum, item) => sum + item.product.price_cents * item.quantity, 0);
  const order = await sql`INSERT INTO orders (user_id,total_cents) VALUES (${userId},${total}) RETURNING id`;
  const orderId = Number(order[0].id);
  for (const item of items) await sql`INSERT INTO order_items (order_id,product_id,quantity,price_cents) VALUES (${orderId},${item.product.id},${item.quantity},${item.product.price_cents})`;
  await sql`INSERT INTO order_status_history (order_id,new_status) VALUES (${orderId},'new')`;
  return orderId;
}

export async function listUserOrders(userId) { await initDb(); return sql`SELECT id,status,total_cents,created_at FROM orders WHERE user_id=${userId} ORDER BY id DESC LIMIT 20`; }
export async function getOrderDetails(orderId,userId=null) {
  await initDb();
  const orders = userId == null ? await sql`SELECT o.*,u.username,u.first_name FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=${orderId}` : await sql`SELECT o.*,u.username,u.first_name FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=${orderId} AND o.user_id=${userId}`;
  if (!orders[0]) return null;
  const items = await sql`SELECT oi.quantity,oi.price_cents,p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=${orderId} ORDER BY oi.id`;
  return { order: orders[0], items };
}
export async function listRecentOrders(limit=20) { await initDb(); return sql`SELECT o.*,u.username,u.first_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT ${limit}`; }

export async function setOrderStatus(id,status) {
  await initDb();
  const rows = await sql`UPDATE orders SET status=${status} WHERE id=${id} RETURNING id,user_id,status,total_cents`;
  if (!rows[0]) return null;
  await sql`INSERT INTO order_status_history (order_id,new_status) VALUES (${id},${status})`;
  return rows[0];
}

export async function getUserProfile(userId) {
  await initDb();
  const rows = await sql`SELECT u.id,u.username,u.first_name,u.balance_cents,(SELECT COUNT(*)::int FROM orders o WHERE o.user_id=u.id AND o.status='completed') AS successful_orders FROM users u WHERE u.id=${userId}`;
  return rows[0] || null;
}

export async function getBalanceTransactions(userId,limit=10) { await initDb(); return sql`SELECT id,amount_cents,type,reference,created_at FROM balance_transactions WHERE user_id=${userId} ORDER BY id DESC LIMIT ${limit}`; }
export async function createTopupRequest(userId,amountCents) { await initDb(); const rows=await sql`INSERT INTO topup_requests (user_id,amount_cents) VALUES (${userId},${amountCents}) RETURNING id`; return Number(rows[0].id); }
export async function listPendingTopups(limit=20) { await initDb(); return sql`SELECT t.*,u.username,u.first_name FROM topup_requests t JOIN users u ON u.id=t.user_id WHERE t.status='pending' ORDER BY t.id ASC LIMIT ${limit}`; }
export async function approveTopup(requestId) {
  await initDb();
  const rows=await sql`SELECT * FROM topup_requests WHERE id=${requestId} AND status='pending'`;
  if (!rows[0]) return null;
  const r=rows[0]; const key=`topup:${requestId}`;
  const tx=await sql`INSERT INTO balance_transactions (user_id,amount_cents,type,reference,idempotency_key) VALUES (${r.user_id},${r.amount_cents},'topup',${key},${key}) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`;
  if (tx[0]) await sql`UPDATE users SET balance_cents=balance_cents+${r.amount_cents} WHERE id=${r.user_id}`;
  await sql`UPDATE topup_requests SET status='approved',processed_at=NOW() WHERE id=${requestId} AND status='pending'`;
  return { ...r, transactionCreated: Boolean(tx[0]) };
}
export async function rejectTopup(requestId) { await initDb(); const rows=await sql`UPDATE topup_requests SET status='rejected',processed_at=NOW() WHERE id=${requestId} AND status='pending' RETURNING *`; return rows[0] || null; }

export async function adjustBalance(userId,amountCents,reference='admin') {
  await initDb();
  const key=`admin:${userId}:${Date.now()}:${Math.random()}`;
  await sql`UPDATE users SET balance_cents=balance_cents+${amountCents} WHERE id=${userId}`;
  await sql`INSERT INTO balance_transactions (user_id,amount_cents,type,reference,idempotency_key) VALUES (${userId},${amountCents},${amountCents>=0?'admin_credit':'admin_debit'},${reference},${key})`;
  return getUserProfile(userId);
}

export async function getBalanceHistory(userId,limit=10) { return getBalanceTransactions(userId,limit); }
export async function listUsers(limit=30) { await initDb(); return sql`SELECT u.id,u.username,u.first_name,u.balance_cents,(SELECT COUNT(*)::int FROM orders o WHERE o.user_id=u.id) AS orders_count FROM users u ORDER BY u.created_at DESC LIMIT ${limit}`; }
export async function getStats() { await initDb(); const [u,o,c,b]=await Promise.all([sql`SELECT COUNT(*)::int count FROM users`,sql`SELECT COUNT(*)::int count FROM orders`,sql`SELECT COUNT(*)::int count FROM orders WHERE status='completed'`,sql`SELECT COALESCE(SUM(total_cents),0)::int total FROM orders WHERE status='completed`]); return { users:u[0].count, orders:o[0].count, completed:c[0].count, revenue:b[0].total }; }
