import { listProducts } from '../bot/src/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const products = await listProducts();
    return res.status(200).json({ products });
  } catch (error) {
    console.error('Products API error:', error);
    return res.status(500).json({ error: 'Unable to load products' });
  }
}
