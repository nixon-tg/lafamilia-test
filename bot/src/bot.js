import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { createOrder, getProduct, listProducts, listRecentOrders, setOrderStatus, upsertUser } from './db.js';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const bot = new Bot(token);
const adminIds = new Set((process.env.ADMIN_IDS || '').split(',').map(x => Number(x.trim())).filter(Boolean));
const webAppUrl = process.env.WEB_APP_URL || '';
const contact = process.env.CONTACT_USERNAME || 'elotonieja';
const carts = new Map();

const money = cents => `${(cents / 100).toFixed(2).replace('.', ',')} zł`;
const isAdmin = ctx => adminIds.has(ctx.from?.id);

function mainKeyboard() {
  const kb = new InlineKeyboard();
  if (webAppUrl) kb.webApp('🛍 Otwórz sklep', webAppUrl).row();
  kb.text('📦 Katalog', 'catalog').text('🛒 Koszyk', 'cart').row();
  kb.text('📋 Moje zamówienia', 'orders').text('💬 Kontakt', 'contact');
  return kb;
}

function catalogKeyboard(products) {
  const kb = new InlineKeyboard();
  for (const p of products) kb.text(`${p.name} • ${money(p.price_cents)}`, `product:${p.id}`).row();
  kb.text('⬅️ Menu', 'home');
  return kb;
}

function cartFor(userId) {
  if (!carts.has(userId)) carts.set(userId, new Map());
  return carts.get(userId);
}

bot.use(async (ctx, next) => {
  if (ctx.from) upsertUser(ctx.from);
  await next();
});

bot.command('start', async ctx => {
  await ctx.reply('🖤 *La Familia*\n\nWitaj. Wybierz opcję poniżej.', { parse_mode: 'Markdown', reply_markup: mainKeyboard() });
});

bot.command('help', async ctx => {
  await ctx.reply('/start – menu\n/catalog – katalog\n/cart – koszyk\n/orders – zamówienia\n\nKomendy administratora: /admin, /status ID STATUS');
});

bot.command('catalog', async ctx => {
  const products = listProducts();
  await ctx.reply('📦 *Katalog*\n\nWybierz produkt:', { parse_mode: 'Markdown', reply_markup: catalogKeyboard(products) });
});

bot.command('cart', async ctx => showCart(ctx));
bot.command('orders', async ctx => {
  await ctx.reply('📋 Historia zamówień jest dostępna po utworzeniu pierwszego zamówienia.');
});

async function showCart(ctx) {
  const cart = cartFor(ctx.from.id);
  if (!cart.size) {
    await ctx.reply('🛒 Koszyk jest pusty.', { reply_markup: mainKeyboard() });
    return;
  }
  let total = 0;
  const lines = [];
  const kb = new InlineKeyboard();
  for (const [id, quantity] of cart) {
    const product = getProduct(id);
    if (!product) continue;
    total += product.price_cents * quantity;
    lines.push(`• ${product.name} × ${quantity} = ${money(product.price_cents * quantity)}`);
    kb.text(`➖ ${product.name}`, `remove:${id}`).row();
  }
  kb.text('✅ Złóż zamówienie', 'checkout').row().text('🗑 Wyczyść', 'clearcart').row().text('⬅️ Menu', 'home');
  await ctx.reply(`🛒 *Koszyk*\n\n${lines.join('\n')}\n\n*Razem: ${money(total)}*`, { parse_mode: 'Markdown', reply_markup: kb });
}

bot.callbackQuery('home', async ctx => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('🖤 *La Familia*\n\nMenu główne:', { parse_mode: 'Markdown', reply_markup: mainKeyboard() });
});

bot.callbackQuery('catalog', async ctx => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('📦 *Katalog*\n\nWybierz produkt:', { parse_mode: 'Markdown', reply_markup: catalogKeyboard(listProducts()) });
});

bot.callbackQuery(/^product:(\d+)$/, async ctx => {
  await ctx.answerCallbackQuery();
  const product = getProduct(Number(ctx.match[1]));
  if (!product) return ctx.editMessageText('Produkt jest niedostępny.', { reply_markup: mainKeyboard() });
  const kb = new InlineKeyboard().text('➕ Dodaj do koszyka', `add:${product.id}`).row().text('⬅️ Katalog', 'catalog');
  await ctx.editMessageText(`*${product.name}*\n\n${product.description}\n\nCena: *${money(product.price_cents)}*`, { parse_mode: 'Markdown', reply_markup: kb });
});

bot.callbackQuery(/^add:(\d+)$/, async ctx => {
  await ctx.answerCallbackQuery({ text: 'Dodano do koszyka.' });
  const cart = cartFor(ctx.from.id);
  const id = Number(ctx.match[1]);
  cart.set(id, (cart.get(id) || 0) + 1);
});

bot.callbackQuery('cart', async ctx => { await ctx.answerCallbackQuery(); await showCart(ctx); });
bot.callbackQuery(/^remove:(\d+)$/, async ctx => {
  await ctx.answerCallbackQuery();
  const cart = cartFor(ctx.from.id);
  const id = Number(ctx.match[1]);
  const qty = (cart.get(id) || 0) - 1;
  if (qty <= 0) cart.delete(id); else cart.set(id, qty);
  await showCart(ctx);
});

bot.callbackQuery('clearcart', async ctx => {
  await ctx.answerCallbackQuery();
  carts.set(ctx.from.id, new Map());
  await ctx.editMessageText('🗑 Koszyk wyczyszczony.', { reply_markup: mainKeyboard() });
});

bot.callbackQuery('checkout', async ctx => {
  await ctx.answerCallbackQuery();
  const cart = cartFor(ctx.from.id);
  const items = [...cart.entries()].map(([id, quantity]) => ({ product: getProduct(id), quantity })).filter(x => x.product);
  if (!items.length) return ctx.editMessageText('Koszyk jest pusty.', { reply_markup: mainKeyboard() });
  const orderId = createOrder(ctx.from.id, items);
  carts.set(ctx.from.id, new Map());
  await ctx.editMessageText(`✅ *Zamówienie #${orderId} utworzone.*\n\nStatus: nowe\n\nObsługa skontaktuje się z Tobą w sprawie dalszej realizacji.`, { parse_mode: 'Markdown', reply_markup: mainKeyboard() });
});

bot.callbackQuery('contact', async ctx => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`💬 Kontakt\n\nTelegram: @${contact}`, { reply_markup: mainKeyboard() });
});

bot.command('admin', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Brak uprawnień.');
  const orders = listRecentOrders(20);
  if (!orders.length) return ctx.reply('Brak zamówień.');
  const text = orders.map(o => `#${o.id} | ${o.status} | ${money(o.total_cents)} | @${o.username || 'brak'}`).join('\n');
  await ctx.reply(`🛠 *Ostatnie zamówienia*\n\n${text}\n\nZmiana: /status ID STATUS`, { parse_mode: 'Markdown' });
});

bot.command('status', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Brak uprawnień.');
  const parts = ctx.message.text.trim().split(/\s+/);
  const id = Number(parts[1]);
  const status = parts[2];
  const allowed = new Set(['new', 'processing', 'ready', 'completed', 'cancelled']);
  if (!id || !allowed.has(status)) return ctx.reply('Użycie: /status ID new|processing|ready|completed|cancelled');
  setOrderStatus(id, status);
  await ctx.reply(`✅ Zamówienie #${id}: ${status}`);
});

bot.catch(err => console.error('Bot error:', err));

await bot.api.setMyCommands([
  { command: 'start', description: 'Otwórz menu' },
  { command: 'catalog', description: 'Katalog produktów' },
  { command: 'cart', description: 'Koszyk' },
  { command: 'help', description: 'Pomoc' }
]);

console.log('La Familia bot started.');
await bot.start();
