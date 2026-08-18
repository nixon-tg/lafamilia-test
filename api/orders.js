import { createOrder, getProduct, listUserOrders, upsertUser } from '../bot/src/db.js';
import { getTelegramUser } from './telegram-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = getTelegramUser(req.headers['x-telegram-init-data']);
    await upsertUser(user);

    if (req.method === 'GET') {
      return res.status(200).json({ orders: await listUserOrders(user.id) });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Cart is empty' });

    const entries = [];
    for (const item of items) {
      const id = Number(item.id);
      const quantity = Math.max(1, Math.min(99, Number(item.quantity)));
      if (!Number.isInteger(id) || !Number.isInteger(quantity)) continue;
      const product = await getProduct(id);
      if (product) entries.push({ product, quantity });
    }

    if (!entries.length) return res.status(400).json({ error: 'No valid products' });
    const orderId = await createOrder(user.id, entries);
    return res.status(201).json({ ok: true, orderId });
  } catch (error) {
    console.error('Orders API error:', error);
    return res.status(401).json({ error: error.message || 'Unauthorized' });
  }
}
