import { webhookCallback } from 'grammy';
import { bot } from '../bot/src/bot.js';

export const config = { api: { bodyParser: false } };
const handleUpdate = webhookCallback(bot, 'http');

export default async function handler(req, res) {
  try {
    return await handleUpdate(req, res);
  } catch (error) {
    console.error('Telegram webhook error:', error);
    // Telegram only needs a successful HTTP response to stop retrying the same update.
    if (!res.headersSent) return res.status(200).json({ ok: true });
  }
}
