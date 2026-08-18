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

async function safeEdit(ctx, text, reply_markup) {
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup });
  } catch (err) {
    const description = String(err?.description || err?.message || err);
    if (!description.includes('message is not modified')) throw err;
  }
}

async function ensureUser(ctx) {
  if (ctx.from) await upsertUser(ctx.from);
}

async function showHome(ctx) {
  await safeEdit(ctx, '🖤 *La Familia*\n\nWybierz opcję:', mainKeyboard());
}

async function showProfile(ctx) {
  await ensureUser(ctx);
  const p = await getUserProfile(ctx.from.id);
  const username = p?.username ? `@${p.username}` : 'Brak nicku';
  const text = `👤 *Profil*\n\n🆔 ID użytkownika: \`${p?.id || ctx.from.id}\`\n🏷 Nick: ${username}\n💰 Saldo: *${money(p?.balance_cents || 0)}*\n✅ Udane zamówienia: *${p?.successful_orders || 0}*`;
  await safeEdit(ctx, text, profileKeyboard());
}

async function showOrders(ctx) {
  await ensureUser(ctx);
  const orders = await listUserOrders(ctx.from.id);
  const labels = { new: 'nowe', processing: 'w realizacji', ready: 'gotowe', completed: 'zakończone', cancelled: 'anulowane' };
  const text = orders.length
    ? `📦 *Moje zamówienia*\n\n${orders.map(o => `#${o.id} • ${labels[o.status] || o.status} • ${money(o.total_cents)} • ${new Date(o.created_at).toLocaleDateString('pl-PL')}`).join('\n')}`
    : '📦 *Moje zamówienia*\n\nNie masz jeszcze żadnych zamówień.';
  await safeEdit(ctx, text, ordersKeyboard());
}

bot.command('start', async ctx => {
  try { await ctx.deleteMessage(); } catch {}
  try { await ensureUser(ctx); } catch (err) { console.error('start user sync:', err); }
  await ctx.reply('🖤 *La Familia*\n\nWybierz opcję:', { parse_mode: 'Markdown', reply_markup: mainKeyboard() });
});

bot.command('help', async ctx => {
  try { await ctx.deleteMessage(); } catch {}
  await ctx.reply('/start – menu\n/orders – moje zamówienia\n/profile – profil\n\nAdministrator: /admin, /status ID STATUS');
});

bot.command('profile', async ctx => {
  try { await ctx.deleteMessage(); } catch {}
  await ctx.reply('👤 Otwórz Profil z menu głównego.');
});

bot.command('orders', async ctx => {
  try { await ctx.deleteMessage(); } catch {}
  await ctx.reply('📦 Otwórz Moje zamówienia z menu głównego.');
});

bot.callbackQuery('home', async ctx => {
  try {
    await ctx.answerCallbackQuery();
    await showHome(ctx);
  } catch (err) {
    console.error('home callback:', err);
  }
});

bot.callbackQuery('profile', async ctx => {
  try {
    await showProfile(ctx);
    await ctx.answerCallbackQuery();
  } catch (err) {
    console.error('profile callback:', err);
    try { await ctx.answerCallbackQuery({ text: 'Nie udało się wczytać profilu.', show_alert: true }); } catch {}
  }
});

bot.callbackQuery('orders', async ctx => {
  try {
    await showOrders(ctx);
    await ctx.answerCallbackQuery();
  } catch (err) {
    console.error('orders callback:', err);
    try { await ctx.answerCallbackQuery({ text: 'Nie udało się wczytać zamówień.', show_alert: true }); } catch {}
  }
});

bot.callbackQuery('topup', async ctx => {
  try {
    await safeEdit(ctx, '💳 *Doładuj saldo*\n\nFunkcja doładowania zostanie podłączona w kolejnym kroku.', new InlineKeyboard().text('⬅️ Cofnij', 'profile'));
    await ctx.answerCallbackQuery();
  } catch (err) {
    console.error('topup callback:', err);
  }
});

bot.callbackQuery('contact', async ctx => {
  try {
    await safeEdit(ctx, `💬 *Kontakt*\n\nTelegram: @${contact}`, new InlineKeyboard().text('⬅️ Cofnij', 'home'));
    await ctx.answerCallbackQuery();
  } catch (err) {
    console.error('contact callback:', err);
  }
});

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
