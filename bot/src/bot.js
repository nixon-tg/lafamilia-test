import { Bot, InlineKeyboard } from 'grammy';
import { adjustBalance, approveTopup, createTopupRequest, getBalanceHistory, getOrderDetails, getStats, getUserProfile, listPendingTopups, listRecentOrders, listUserOrders, listUsers, rejectTopup, setOrderStatus, upsertUser } from './db.js';

const token=process.env.BOT_TOKEN;
if(!token) throw new Error('BOT_TOKEN is required');
export const bot=new Bot(token);
const adminIds=new Set((process.env.ADMIN_IDS||'').split(',').map(x=>Number(x.trim())).filter(Boolean));
const webAppUrl=process.env.WEB_APP_URL||'';
const contact=process.env.CONTACT_USERNAME||'elotonieja';
const money=c=>`${(Number(c||0)/100).toFixed(2).replace('.',',')} zł`;
const isAdmin=ctx=>adminIds.has(ctx.from?.id);
const labels={new:'nowe',processing:'w realizacji',ready:'gotowe',completed:'zakończone',cancelled:'anulowane'};

function mainKeyboard(){const k=new InlineKeyboard();if(webAppUrl)k.webApp('🛍 Otwórz sklep',webAppUrl).row();return k.text('📦 Moje zamówienia','orders').row().text('👤 Profil','profile').text('💬 Kontakt','contact');}
function profileKeyboard(){return new InlineKeyboard().text('💳 Doładuj saldo','topup').row().text('💰 Historia salda','balance_history').row().text('⬅️ Cofnij','home');}
function ordersKeyboard(){return new InlineKeyboard().text('🔄 Odśwież','orders').row().text('⬅️ Cofnij','home');}
function adminKeyboard(){return new InlineKeyboard().text('📦 Zamówienia','admin_orders').row().text('👥 Użytkownicy','admin_users').text('💳 Salda','admin_balances').row().text('📊 Statystyki','admin_stats').row().text('⬅️ Cofnij','home');}
function topupKeyboard(){return new InlineKeyboard().text('20 zł','topup:2000').text('50 zł','topup:5000').text('100 zł','topup:10000').row().text('200 zł','topup:20000').row().text('⬅️ Cofnij','profile');}

async function safeEdit(ctx,text,reply_markup){try{await ctx.editMessageText(text,{parse_mode:'Markdown',reply_markup});}catch(e){if(!String(e?.description||e).includes('message is not modified'))throw e;}}
async function notifyStatus(userId,orderId,status,total){try{await bot.api.sendMessage(Number(userId),`📦 *Zamówienie #${orderId}*\n\nStatus: *${labels[status]||status}*\nKwota: ${money(total)}`,{parse_mode:'Markdown'});}catch(e){console.error('Status notification error:',e);}}

bot.use(async(ctx,next)=>{if(ctx.from)await upsertUser(ctx.from);await next();});

bot.command('start',async ctx=>{try{await ctx.deleteMessage();}catch{}await ctx.reply('🖤 *La Familia*\n\nWybierz opcję:',{parse_mode:'Markdown',reply_markup:mainKeyboard()});});
bot.command('help',ctx=>ctx.reply('/start – menu\n/orders – moje zamówienia\n/profile – profil\n\nAdministrator: /admin, /status ID STATUS, /balance ID KWOTA'));

async function showProfile(ctx){const p=await getUserProfile(ctx.from.id);const username=p?.username?`@${p.username}`:'Brak nicku';await safeEdit(ctx,`👤 *Profil*\n\n🆔 ID użytkownika: \`${p?.id||ctx.from.id}\`\n🏷 Nick: ${username}\n💰 Saldo: *${money(p?.balance_cents)}*\n✅ Udane zamówienia: *${p?.successful_orders||0}*`,profileKeyboard());}
async function showOrders(ctx){const orders=await listUserOrders(ctx.from.id);const text=orders.length?`📦 *Moje zamówienia*\n\n${orders.map(o=>`#${o.id} • ${labels[o.status]||o.status} • ${money(o.total_cents)} • ${new Date(o.created_at).toLocaleDateString('pl-PL')}`).join('\n')}`:'📦 *Moje zamówienia*\n\nNie masz jeszcze żadnych zamówień.';await safeEdit(ctx,text,ordersKeyboard());}
async function showBalanceHistory(ctx){const rows=await getBalanceHistory(ctx.from.id);const text=rows.length?`💰 *Historia salda*\n\n${rows.map(r=>`${Number(r.amount_cents)>=0?'🟢':'🔴'} ${Number(r.amount_cents)>=0?'+':''}${money(r.amount_cents)} • ${r.type} • ${new Date(r.created_at).toLocaleDateString('pl-PL')}`).join('\n')}`:'💰 *Historia salda*\n\nBrak operacji.';await safeEdit(ctx,text,new InlineKeyboard().text('⬅️ Cofnij','profile'));}

bot.command('profile',async ctx=>{try{await ctx.deleteMessage();}catch{}await ctx.reply('Otwórz Profil z menu.');});
bot.command('orders',async ctx=>{try{await ctx.deleteMessage();}catch{}await ctx.reply('Otwórz Moje zamówienia z menu.');});

bot.callbackQuery('home',async ctx=>{await ctx.answerCallbackQuery();await safeEdit(ctx,'🖤 *La Familia*\n\nWybierz opcję:',mainKeyboard());});
bot.callbackQuery('profile',async ctx=>{try{await showProfile(ctx);await ctx.answerCallbackQuery();}catch(e){console.error('Profile error:',e);await ctx.answerCallbackQuery({text:'Nie udało się wczytać profilu.',show_alert:true});}});
bot.callbackQuery('orders',async ctx=>{try{await showOrders(ctx);await ctx.answerCallbackQuery();}catch(e){console.error('Orders error:',e);await ctx.answerCallbackQuery({text:'Nie udało się wczytać zamówień.',show_alert:true});}});
bot.callbackQuery('balance_history',async ctx=>{try{await showBalanceHistory(ctx);await ctx.answerCallbackQuery();}catch(e){console.error(e);await ctx.answerCallbackQuery({text:'Nie udało się pobrać historii.',show_alert:true});}});
bot.callbackQuery('topup',async ctx=>{await ctx.answerCallbackQuery();await safeEdit(ctx,'💳 *Doładuj saldo*\n\nWybierz kwotę. Zostanie utworzona prośba o doładowanie do zatwierdzenia przez administratora.',topupKeyboard());});
bot.callbackQuery(/^topup:(\d+)$/,async ctx=>{const amount=Number(ctx.match[1]);try{const id=await createTopupRequest(ctx.from.id,amount);await ctx.answerCallbackQuery({text:`Prośba #${id} utworzona`});await safeEdit(ctx,`💳 *Doładowanie #${id}*\n\nKwota: *${money(amount)}*\nStatus: ⏳ oczekuje na potwierdzenie administratora.`,new InlineKeyboard().text('⬅️ Cofnij','profile'));}catch(e){console.error(e);await ctx.answerCallbackQuery({text:'Nie udało się utworzyć prośby.',show_alert:true});}});
bot.callbackQuery('contact',async ctx=>{await ctx.answerCallbackQuery();await safeEdit(ctx,`💬 *Kontakt*\n\nTelegram: @${contact}`,new InlineKeyboard().text('⬅️ Cofnij','home'));});

async function showAdmin(ctx){if(!isAdmin(ctx))return ctx.answerCallbackQuery({text:'Brak uprawnień.',show_alert:true});await ctx.answerCallbackQuery();await safeEdit(ctx,'🛠 *Panel administratora*\n\nWybierz sekcję:',adminKeyboard());}
bot.command('admin',showAdmin);
bot.callbackQuery('admin',showAdmin);

bot.callbackQuery('admin_orders',async ctx=>{if(!isAdmin(ctx))return ctx.answerCallbackQuery({text:'Brak uprawnień.',show_alert:true});const rows=await listRecentOrders(10);const text=rows.length?`📦 *Ostatnie zamówienia*\n\n${rows.map(o=>`#${o.id} • ${labels[o.status]||o.status} • ${money(o.total_cents)} • @${o.username||'brak'}`).join('\n')}`:'Brak zamówień.';await ctx.answerCallbackQuery();await safeEdit(ctx,text,new InlineKeyboard().text('⬅️ Panel admina','admin'));});
bot.callbackQuery('admin_users',async ctx=>{if(!isAdmin(ctx))return ctx.answerCallbackQuery({text:'Brak uprawnień.',show_alert:true});const rows=await listUsers(15);const text=rows.length?`👥 *Użytkownicy*\n\n${rows.map(u=>`🆔 ${u.id} • @${u.username||'brak'} • ${money(u.balance_cents)} • zamówienia: ${u.orders_count}`).join('\n')}`:'Brak użytkowników.';await ctx.answerCallbackQuery();await safeEdit(ctx,text,new InlineKeyboard().text('⬅️ Panel admina','admin'));});
bot.callbackQuery('admin_balances',async ctx=>{if(!isAdmin(ctx))return ctx.answerCallbackQuery({text:'Brak uprawnień.',show_alert:true});const rows=await listPendingTopups(15);const text=rows.length?`💳 *Oczekujące doładowania*\n\n${rows.map(r=>`#${r.id} • ${money(r.amount_cents)} • @${r.username||'brak'}`).join('\n')}\n\nZatwierdzanie: /topupapprove ID\nOdrzucanie: /topupreject ID`:'💳 *Salda*\n\nBrak oczekujących doładowań.';await ctx.answerCallbackQuery();await safeEdit(ctx,text,new InlineKeyboard().text('⬅️ Panel admina','admin'));});
bot.callbackQuery('admin_stats',async ctx=>{if(!isAdmin(ctx))return ctx.answerCallbackQuery({text:'Brak uprawnień.',show_alert:true});const s=await getStats();await ctx.answerCallbackQuery();await safeEdit(ctx,`📊 *Statystyki*\n\n👥 Użytkownicy: *${s.users}*\n📦 Zamówienia: *${s.orders}*\n✅ Zakończone: *${s.completed}*\n💰 Obrót zakończonych: *${money(s.revenue)}*`,new InlineKeyboard().text('⬅️ Panel admina','admin'));});

bot.command('status',async ctx=>{if(!isAdmin(ctx))return ctx.reply('Brak uprawnień.');const p=ctx.message.text.trim().split(/\s+/);const id=Number(p[1]),status=p[2];if(!id||!['new','processing','ready','completed','cancelled'].includes(status))return ctx.reply('Użycie: /status ID new|processing|ready|completed|cancelled');const r=await setOrderStatus(id,status);if(!r)return ctx.reply(`Nie znaleziono #${id}.`);await notifyStatus(r.user_id,r.id,r.status,r.total_cents);await ctx.reply(`✅ Zamówienie #${id}: ${labels[status]||status}`);});
bot.command('topupapprove',async ctx=>{if(!isAdmin(ctx))return ctx.reply('Brak uprawnień.');const id=Number(ctx.message.text.trim().split(/\s+/)[1]);const r=await approveTopup(id);if(!r)return ctx.reply('Nie znaleziono oczekującej prośby.');await ctx.reply(`✅ Doładowanie #${id} zatwierdzone: ${money(r.amount_cents)}`);try{await bot.api.sendMessage(Number(r.user_id),`💳 *Doładowanie potwierdzone*\n\n+${money(r.amount_cents)}\nSaldo zostało zaktualizowane.`,{parse_mode:'Markdown'});}catch{}});
bot.command('topupreject',async ctx=>{if(!isAdmin(ctx))return ctx.reply('Brak uprawnień.');const id=Number(ctx.message.text.trim().split(/\s+/)[1]);const r=await rejectTopup(id);if(!r)return ctx.reply('Nie znaleziono oczekującej prośby.');await ctx.reply(`❌ Doładowanie #${id} odrzucone.`);});
bot.command('balance',async ctx=>{if(!isAdmin(ctx))return ctx.reply('Brak uprawnień.');const p=ctx.message.text.trim().split(/\s+/);const userId=Number(p[1]);const amount=Number(String(p[2]||'').replace(',','.'));if(!userId||!Number.isFinite(amount)||amount===0)return ctx.reply('Użycie: /balance ID +50 lub /balance ID -20');const r=await adjustBalance(userId,Math.round(amount*100),'admin command');if(!r)return ctx.reply('Nie znaleziono użytkownika.');await ctx.reply(`✅ Saldo użytkownika ${userId}: ${money(r.balance_cents)}`);try{await bot.api.sendMessage(userId,`💰 *Zmiana salda*\n\n${amount>0?'+':''}${amount.toFixed(2).replace('.',',')} zł\nNowe saldo: *${money(r.balance_cents)}*`,{parse_mode:'Markdown'});}catch{}});

bot.catch(err=>console.error('La Familia bot error:',err.error||err));
