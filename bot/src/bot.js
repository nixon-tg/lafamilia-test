import { Bot, InlineKeyboard } from 'grammy';
import { createOrder, getProduct, initDb, listProducts, listRecentOrders, listUserOrders, setOrderStatus, upsertUser } from './db.js';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

export const bot = new Bot(token);
const adminIds = new Set((process.env.ADMIN_IDS || '').split(',').map(x => Number(x.trim())).filter(Boolean));
const webAppUrl = process.env.WEB_APP_URL || '';
const contact = process.env.CONTACT_USERNAME || 'elotonieja';
const carts = new Map();
const money = cents => `${(Number(cents) / 100).toFixed(2).replace('.', ',')} zł`;
const isAdmin = ctx => adminIds.has(ctx.from?.id);

function mainKeyboard() {
  const kb = new InlineKeyboard();
  if (webAppUrl) kb.webApp('🛍 Otwórz sklep', webAppUrl).row();
  return kb.text('📦 Katalog','catalog').text('🛒 Koszyk','cart').row().text('📋 Moje zamówienia','orders').text('💬 Kontakt','contact');
}
function catalogKeyboard(products) {
  const kb = new InlineKeyboard();
  for (const p of products) kb.text(`${p.name} • ${money(p.price_cents)}`,`product:${p.id}`).row();
  return kb.text('⬅️ Menu','home');
}
function cartFor(id) { if (!carts.has(id)) carts.set(id,new Map()); return carts.get(id); }

bot.use(async (ctx,next) => { if (ctx.from) await upsertUser(ctx.from); await next(); });

bot.command('start', ctx => ctx.reply('🖤 *La Familia*\n\nWitaj. Wybierz opcję poniżej.',{parse_mode:'Markdown',reply_markup:mainKeyboard()}));
bot.command('help', ctx => ctx.reply('/start – menu\n/catalog – katalog\n/cart – koszyk\n/orders – zamówienia\n\nAdministrator: /admin, /status ID STATUS'));
bot.command('catalog', async ctx => ctx.reply('📦 *Katalog*\n\nWybierz produkt:',{parse_mode:'Markdown',reply_markup:catalogKeyboard(await listProducts())}));
bot.command('cart', showCart);
bot.command('orders', showOrders);

async function showOrders(ctx) {
  const orders = await listUserOrders(ctx.from.id);
  if (!orders.length) return ctx.reply('📋 Nie masz jeszcze zamówień.',{reply_markup:mainKeyboard()});
  const labels={new:'nowe',processing:'w realizacji',ready:'gotowe',completed:'zakończone',cancelled:'anulowane'};
  const text=orders.map(o=>`#${o.id} • ${labels[o.status]||o.status} • ${money(o.total_cents)}`).join('\n');
  await ctx.reply(`📋 *Moje zamówienia*\n\n${text}`,{parse_mode:'Markdown',reply_markup:mainKeyboard()});
}
async function showCart(ctx) {
  const cart=cartFor(ctx.from.id);
  if(!cart.size) return ctx.reply('🛒 Koszyk jest pusty.',{reply_markup:mainKeyboard()});
  let total=0; const lines=[]; const kb=new InlineKeyboard();
  for(const [id,q] of cart){const p=await getProduct(id); if(!p) continue; total+=p.price_cents*q; lines.push(`• ${p.name} × ${q} = ${money(p.price_cents*q)}`); kb.text(`➖ ${p.name}`,`remove:${id}`).row();}
  kb.text('✅ Złóż zamówienie','checkout').row().text('🗑 Wyczyść','clearcart').row().text('⬅️ Menu','home');
  await ctx.reply(`🛒 *Koszyk*\n\n${lines.join('\n')}\n\n*Razem: ${money(total)}*`,{parse_mode:'Markdown',reply_markup:kb});
}

bot.callbackQuery('home',async ctx=>{await ctx.answerCallbackQuery();await ctx.editMessageText('🖤 *La Familia*\n\nMenu główne:',{parse_mode:'Markdown',reply_markup:mainKeyboard()});});
bot.callbackQuery('catalog',async ctx=>{await ctx.answerCallbackQuery();await ctx.editMessageText('📦 *Katalog*\n\nWybierz produkt:',{parse_mode:'Markdown',reply_markup:catalogKeyboard(await listProducts())});});
bot.callbackQuery(/^product:(\d+)$/,async ctx=>{await ctx.answerCallbackQuery();const p=await getProduct(Number(ctx.match[1]));if(!p)return ctx.editMessageText('Produkt jest niedostępny.',{reply_markup:mainKeyboard()});const kb=new InlineKeyboard().text('➕ Dodaj do koszyka',`add:${p.id}`).row().text('⬅️ Katalog','catalog');await ctx.editMessageText(`*${p.name}*\n\n${p.description}\n\nCena: *${money(p.price_cents)}*`,{parse_mode:'Markdown',reply_markup:kb});});
bot.callbackQuery(/^add:(\d+)$/,async ctx=>{await ctx.answerCallbackQuery({text:'Dodano do koszyka.'});const cart=cartFor(ctx.from.id);const id=Number(ctx.match[1]);cart.set(id,(cart.get(id)||0)+1);});
bot.callbackQuery('cart',async ctx=>{await ctx.answerCallbackQuery();await showCart(ctx);});
bot.callbackQuery(/^remove:(\d+)$/,async ctx=>{await ctx.answerCallbackQuery();const cart=cartFor(ctx.from.id);const id=Number(ctx.match[1]);const q=(cart.get(id)||0)-1;if(q<=0)cart.delete(id);else cart.set(id,q);await showCart(ctx);});
bot.callbackQuery('clearcart',async ctx=>{await ctx.answerCallbackQuery();carts.set(ctx.from.id,new Map());await ctx.editMessageText('🗑 Koszyk wyczyszczony.',{reply_markup:mainKeyboard()});});
bot.callbackQuery('checkout',async ctx=>{await ctx.answerCallbackQuery();const cart=cartFor(ctx.from.id);const entries=[];for(const [id,q] of cart){const p=await getProduct(id);if(p)entries.push({product:p,quantity:q});}if(!entries.length)return ctx.editMessageText('Koszyk jest pusty.',{reply_markup:mainKeyboard()});const id=await createOrder(ctx.from.id,entries);carts.set(ctx.from.id,new Map());await ctx.editMessageText(`✅ *Zamówienie #${id} utworzone.*\n\nStatus: nowe`,{parse_mode:'Markdown',reply_markup:mainKeyboard()});});
bot.callbackQuery('orders',async ctx=>{await ctx.answerCallbackQuery();await showOrders(ctx);});
bot.callbackQuery('contact',async ctx=>{await ctx.answerCallbackQuery();await ctx.editMessageText(`💬 *Kontakt*\n\nTelegram: @${contact}`,{parse_mode:'Markdown',reply_markup:mainKeyboard()});});

bot.command('admin',async ctx=>{if(!isAdmin(ctx))return ctx.reply('Brak uprawnień.');const orders=await listRecentOrders(20);if(!orders.length)return ctx.reply('Brak zamówień.');const text=orders.map(o=>`#${o.id} | ${o.status} | ${money(o.total_cents)} | @${o.username||'brak'}`).join('\n');await ctx.reply(`🛠 *Ostatnie zamówienia*\n\n${text}\n\nZmiana: /status ID STATUS`,{parse_mode:'Markdown'});});
bot.command('status',async ctx=>{if(!isAdmin(ctx))return ctx.reply('Brak uprawnień.');const parts=ctx.message.text.trim().split(/\s+/);const id=Number(parts[1]);const status=parts[2];const allowed=new Set(['new','processing','ready','completed','cancelled']);if(!id||!allowed.has(status))return ctx.reply('Użycie: /status ID new|processing|ready|completed|cancelled');await setOrderStatus(id,status);await ctx.reply(`✅ Zamówienie #${id}: ${status}`);});

bot.catch(err=>console.error('La Familia bot error:',err.error||err));
await initDb();
