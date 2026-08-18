import { Bot, InlineKeyboard } from 'grammy';
import { getLastBotMessageId, getUserProfile, listRecentOrders, listUserOrders, setLastBotMessageId, setOrderStatus, upsertUser } from './db.js';

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

async function deletePreviousBotMessage(ctx) {
  if (!ctx.from || !ctx.chat) return;
  const previousId = await getLastBotMessageId(ctx.from.id);
  if (!previousId) return;
  try { await ctx.api.deleteMessage(ctx.chat.id, previousId); } catch (_) {}
}

async function sendFreshMenu(ctx) {
  if (!ctx.from || !ctx.chat) return;
  await deletePreviousBotMessage(ctx);
  const sent = await ctx.reply('🖤 *La Familia*\n\nWybierz opcję:', { parse_mode: 'Markdown', reply_markup: mainKeyboard() });
  await setLastBotMessageId(ctx.from.id, sent.message_id);
}

async function sendFresh(ctx, text, keyboard, parseMode = 'Markdown') {
  if (!ctx.from || !ctx.chat) return;
  await deletePreviousBotMessage(ctx);
  const sent = await ctx.reply(text, { parse_mode: parseMode, reply_markup: keyboard });
  await setLastBotMessageId(ctx.from.id, sent.message_id);
}

async function removeUserCommand(ctx) {
  if (!ctx.message || !ctx.chat) return;
  try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (_) {}
}

bot.use(async (ctx, next) => { if (ctx.from) await upsertUser(ctx.from); await next(); });

bot.command('start', async ctx => { await removeUserCommand(ctx); await sendFreshMenu(ctx); });
bot.command('help', async ctx => { await removeUserCommand(ctx); await sendFresh(ctx, '🖤 *La Familia*\n\n🛍 Sklep – otwiera Mini App.\n📦 Moje zamówienia – historia i statusy.\n👤 Profil – Twoje dane i saldo.\n💬 Kontakt – @' + contact, mainKeyboard()); });

async function showProfile(ctx) {
  const p = await getUserProfile(ctx.from.id);
  const username = p?.username ? `@${p.username}` : 'Brak nicku';
  const text = `👤 *Profil*\n\n🆔 ID użytkownika: \`${p?.id || ctx.from.id}\`\n🏷 Nick: ${username}\n💰 Saldo: *${money(p?.balance_cents || 0)}*\n✅ Udane zamówienia: *${p?.successful_orders || 0}*`;
  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: profileKeyboard() });
}

async function showOrders(ctx) {
  const orders = await listUserOrders(ctx.from.id);
  const labels = { new: 'nowe', processing: 'w realizacji', ready: 'gotowe', completed: 'zakończone', cancelled: 'anulowane' };
  const text = orders.length
    ? `📦 *Moje zamówienia*\n\n${orders.map(o => `#${o.id} • ${labels[o.status] || o.status} • ${money(o.total_cents)} • ${new Date(o.created_at).toLocaleDateString('pl-PL')}`).join('\n')}`
    : '📦 *Moje zamówienia*\n\nNie masz jeszcze żadnych zamówień.';
  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: ordersKeyboard() });
}

bot.command('profile', async ctx => { await removeUserCommand(ctx); await sendFresh(ctx, 'Ładowanie profilu…', profileKeyboard()); const id = await getLastBotMessageId(ctx.from.id); try { await ctx.api.editMessageText(ctx.chat.id, id, '👤 *Profil*', { parse_mode: 'Markdown', reply_markup: profileKeyboard() }); } catch (_) {} });
bot.command('orders', async ctx => { await removeUserCommand(ctx); await sendFresh(ctx, 'Ładowanie zamówień…', ordersKeyboard()); });

bot.callbackQuery('home', async ctx => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('🖤 *La Familia*\n\nWybierz opcję:', { parse_mode: 'Markdown', reply_markup: mainKeyboard() });
  if (ctx.from) await setLastBotMessageId(ctx.from.id, ctx.callbackQuery.message.message_id);
});

bot.callbackQuery('profile', async ctx => { await ctx.answerCallbackQuery(); await showProfile(ctx); if (ctx.from) await setLastBotMessageId(ctx.from.id, ctx.callbackQuery.message.message_id); });
bot.callbackQuery('orders', async ctx => { await ctx.answerCallbackQuery(); await showOrders(ctx); if (ctx.from) await setLastBotMessageId(ctx.from.id, ctx.callbackQuery.message.message_id); });
bot.callbackQuery('topup', async ctx => { await ctx.answerCallbackQuery(); await ctx.editMessageText('💳 *Doładuj saldo*\n\nFunkcja doładowania zostanie podłączona w kolejnym kroku.', { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('⬅️ Cofnij', 'profile') }); });
bot.callbackQuery('contact', async ctx => { await ctx.answerCallbackQuery(); await ctx.editMessageText(`💬 *Kontakt*\n\nTelegram: @${contact}`, { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('⬅️ Cofnij', 'home') }); });

bot.command('admin', async ctx => {
  await removeUserCommand(ctx);
  if (!isAdmin(ctx)) return sendFresh(ctx, 'Brak uprawnień.', mainKeyboard());
  const orders = await listRecentOrders(20);
  if (!orders.length) return sendFresh(ctx, 'Brak zamówień.', mainKeyboard());
  const text = orders.map(o => `#${o.id} | ${o.status} | ${money(o.total_cents)} | @${o.username || 'brak'}`).join('\n');
  await sendFresh(ctx, `🛠 *Ostatnie zamówienia*\n\n${text}\n\nZmiana: /status ID STATUS`, mainKeyboard());
});

bot.command('status', async ctx => {
  await removeUserCommand(ctx);
  if (!isAdmin(ctx)) return sendFresh(ctx, 'Brak uprawnień.', mainKeyboard());
  const parts = ctx.message.text.trim().split(/\s+/);
  const id = Number(parts[1]); const status = parts[2];
  const allowed = new Set(['new', 'processing', 'ready', 'completed', 'cancelled']);
  if (!id || !allowed.has(status)) return sendFresh(ctx, 'Użycie: /status ID new|processing|ready|completed|cancelled', mainKeyboard());
  const result = await setOrderStatus(id, status);
  if (!result?.count) return sendFresh(ctx, `Nie znaleziono zamówienia #${id}.`, mainKeyboard());
  await sendFresh(ctx, `✅ Zamówienie #${id}: ${status}`, mainKeyboard());
});

bot.catch(err => console.error('La Familia bot error:', err.error || err));
