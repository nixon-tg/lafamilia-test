import { Bot, InlineKeyboard } from 'grammy';
import { listRecentOrders, setOrderStatus, upsertUser } from './db.js';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

export const bot = new Bot(token);
const adminIds = new Set((process.env.ADMIN_IDS || '').split(',').map(x => Number(x.trim())).filter(Boolean));
const webAppUrl = process.env.WEB_APP_URL || '';
const contact = process.env.CONTACT_USERNAME || 'elotonieja';
const isAdmin = ctx => adminIds.has(ctx.from?.id);

function mainKeyboard() {
  const kb = new InlineKeyboard();
  if (webAppUrl) kb.webApp('🛍 Otwórz sklep', webAppUrl).row();
  return kb.url('💬 Kontakt', `https://t.me/${contact}`);
}

bot.use(async (ctx, next) => { if (ctx.from) await upsertUser(ctx.from); await next(); });

bot.command('start', ctx => ctx.reply('🖤 *La Familia*\n\nWitaj. Sklep, katalog, koszyk i Twoje zamówienia są dostępne w Mini App.', { parse_mode: 'Markdown', reply_markup: mainKeyboard() }));
bot.command('help', ctx => ctx.reply('🖤 *La Familia*\n\n🛍 Sklep – otwiera Mini App z katalogiem, koszykiem i zamówieniami.\n💬 Kontakt – @' + contact + '\n\nAdministrator: /admin, /status ID STATUS', { parse_mode: 'Markdown', reply_markup: mainKeyboard() }));

bot.command('admin', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Brak uprawnień.');
  const orders = await listRecentOrders(20);
  if (!orders.length) return ctx.reply('Brak zamówień.');
  const text = orders.map(o => `#${o.id} | ${o.status} | ${(Number(o.total_cents) / 100).toFixed(2)} zł | @${o.username || 'brak'}`).join('\n');
  await ctx.reply(`🛠 *Ostatnie zamówienia*\n\n${text}\n\nZmiana: /status ID STATUS`, { parse_mode: 'Markdown' });
});

bot.command('status', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Brak uprawnień.');
  const parts = ctx.message.text.trim().split(/\s+/);
  const id = Number(parts[1]);
  const status = parts[2];
  const allowed = new Set(['new', 'processing', 'ready', 'completed', 'cancelled']);
  if (!id || !allowed.has(status)) return ctx.reply('Użycie: /status ID new|processing|ready|completed|cancelled');
  const result = await setOrderStatus(id, status);
  if (!result?.count) return ctx.reply(`Nie znaleziono zamówienia #${id}.`);
  await ctx.reply(`✅ Zamówienie #${id}: ${status}`);
});

bot.catch(err => console.error('La Familia bot error:', err.error || err));
