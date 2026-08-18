import { Bot, InlineKeyboard } from 'grammy';
import { getUserProfile, listRecentOrders, listUserOrders, setOrderStatus, upsertUser } from './db.js';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

export const bot = new Bot(token);
const adminIds = new Set((process.env.ADMIN_IDS || '').split(',').map(x => Number(x.trim())).filter(Boolean));
const webAppUrl = process.env.WEB_APP_URL || '';
const contact = process.env.CONTACT_USERNAME || 'elotonieja';
const money = cents => `${(Number(cents) / 100).toFixed(2).replace('.', ',')} zł`;
const isAdmin = ctx => adminIds.has(ctx.from?.id);

function mainKeyboard() {
  const kb = new InlineKeyboard();
  if (webAppUrl) kb.webApp('🛍 Otwórz sklep', webAppUrl).row();
  return kb.text('📦 Moje zamówienia', 'orders').row()
    .text('👤 Profil', 'profile').text('💬 Kontakt', 'contact');
}

function profileKeyboard() {
  return new InlineKeyboard().text('💳 Doładuj saldo', 'topup').row().text('⬅️ Cofnij', 'home');
}

function ordersKeyboard() {
  return new InlineKeyboard().text('🔄 Odśwież', 'orders').row().text('⬅️ Cofnij', 'home');
}

bot.use(async (ctx, next) => { if (ctx.from) await upsertUser(ctx.from); await next(); });

bot.command('start', ctx => ctx.reply('🖤 *La Familia*\n\nWybierz opcję:', { parse_mode: 'Markdown', reply_markup: mainKeyboard() }));
bot.command('help', ctx => ctx.reply('/start – menu\n/orders – moje zamówienia\n/profile – profil\n\nAdministrator: /admin, /status ID STATUS'));

async function showProfile(ctx, edit = false) {
  const p = await getUserProfile(ctx.from.id);
  const username = p?.username ? `@${p.username}` : 'Brak nicku';
  const text = `👤 *Profil*\n\n🆔 ID użytkownika: \`${p?.id || ctx.from.id}\`\n🏷 Nick: ${username}\n💰 Saldo: *${money(p?.balance_cents || 0)}*\n✅ Udane zamówienia: *${p?.successful_orders || 0}*`;
  const options = { parse_mode: 'Markdown', reply_markup: profileKeyboard() };
  if (edit) await ctx.editMessageText(text, options); else await ctx.reply(text, options);
}

async function showOrders(ctx, edit = false) {
  const orders = await listUserOrders(ctx.from.id);
  const labels = { new: 'nowe', processing: 'w realizacji', ready: 'gotowe', completed: 'zakończone', cancelled: 'anulowane' };
  const text = orders.length
    ? `📦 *Moje zamówienia*\n\n${orders.map(o => `#${o.id} • ${labels[o.status] || o.status} • ${money(o.total_cents)} • ${new Date(o.created_at).toLocaleDateString('pl-PL')}`).join('\n')}`
    : '📦 *Moje zamówienia*\n\nNie masz jeszcze żadnych zamówień.';
  const options = { parse_mode: 'Markdown', reply_markup: ordersKeyboard() };
  if (edit) await ctx.editMessageText(text, options); else await ctx.reply(text, options);
}

bot.command('profile', ctx => showProfile(ctx));
bot.command('orders', ctx => showOrders(ctx));

bot.callbackQuery('home', async ctx => { await ctx.answerCallbackQuery(); await ctx.editMessageText('🖤 *La Familia*\n\nWybierz opcję:', { parse_mode: 'Markdown', reply_markup: mainKeyboard() }); });
bot.callbackQuery('profile', async ctx => { await ctx.answerCallbackQuery(); await showProfile(ctx, true); });
bot.callbackQuery('orders', async ctx => { await ctx.answerCallbackQuery(); await showOrders(ctx, true); });
bot.callbackQuery('topup', async ctx => { await ctx.answerCallbackQuery(); await ctx.editMessageText('💳 *Doładuj saldo*\n\nFunkcja doładowania zostanie podłączona w kolejnym kroku.', { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('⬅️ Cofnij', 'profile') }); });
bot.callbackQuery('contact', async ctx => { await ctx.answerCallbackQuery(); await ctx.editMessageText(`💬 *Kontakt*\n\nTelegram: @${contact}`, { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('⬅️ Cofnij', 'home') }); });

bot.command('admin', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Brak uprawnień.');
  const orders = await listRecentOrders(20);
  if (!orders.length) return ctx.reply('Brak zamówień.');
  const text = orders.map(o => `#${o.id} | ${o.status} | ${money(o.total_cents)} | @${o.username || 'brak'}`).join('\n');
  await ctx.reply(`🛠 *Ostatnie zamówienia*\n\n${text}\n\nZmiana: /status ID STATUS`, { parse_mode: 'Markdown' });
});

bot.command('status', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Brak uprawnień.');
  const parts = ctx.message.text.trim().split(/\s+/);
  const id = Number(parts[1]); const status = parts[2];
  const allowed = new Set(['new', 'processing', 'ready', 'completed', 'cancelled']);
  if (!id || !allowed.has(status)) return ctx.reply('Użycie: /status ID new|processing|ready|completed|cancelled');
  const result = await setOrderStatus(id, status);
  if (!result?.count) return ctx.reply(`Nie znaleziono zamówienia #${id}.`);
  await ctx.reply(`✅ Zamówienie #${id}: ${status}`);
});

bot.catch(err => console.error('La Familia bot error:', err.error || err));
