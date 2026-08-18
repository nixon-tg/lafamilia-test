import { webhookCallback } from 'grammy';
import { bot } from '../bot/src/bot.js';

export const config = { api: { bodyParser: false } };

export default webhookCallback(bot, 'http');
