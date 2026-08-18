const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor('#000000'); tg.setBackgroundColor('#000000'); }

const state = { products: [], cart: new Map(), view: 'home' };
const views = ['homeView','shopView','cartView','ordersView','contactView'];
const $ = id => document.getElementById(id);
const money = cents => `${(Number(cents) / 100).toFixed(2).replace('.', ',')} zł`;
const initData = tg?.initData || '';

function showView(name) {
  state.view = name;
  views.forEach(id => $(id).classList.toggle('hidden', id !== `${name}View`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'shop') renderProducts();
  if (name === 'cart') renderCart();
  if (name === 'orders') loadOrders();
}
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2200); }
function cartQty() { return [...state.cart.values()].reduce((a,b) => a + b, 0); }
function updateCartCount() { $('cartCount').textContent = cartQty(); }

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error();
    state.products = (await res.json()).products || [];
    renderProducts();
  } catch { $('products').innerHTML = '<div class="empty">Nie udało się załadować katalogu.</div>'; }
}
function renderProducts() {
  const query = $('searchInput')?.value.trim().toLowerCase() || '';
  const products = state.products.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(query));
  if (!products.length) { $('products').innerHTML = '<div class="empty">Brak produktów.</div>'; return; }
  $('products').innerHTML = products.map(p => `<article class="product-card"><div class="product-art"><img src="assets/icons/cart.svg" alt=""></div><div class="product-info"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p><div class="product-bottom"><strong>${money(p.price_cents)}</strong><button class="add-btn" data-add="${p.id}">DODAJ</button></div></div></article>`).join('');
  document.querySelectorAll('[data-add]').forEach(btn => btn.onclick = () => addToCart(Number(btn.dataset.add)));
}
function addToCart(id) { state.cart.set(id, (state.cart.get(id) || 0) + 1); updateCartCount(); toast('Dodano do koszyka'); }
function renderCart() {
  const entries = [...state.cart.entries()].map(([id, quantity]) => ({ product: state.products.find(p => p.id === id), quantity })).filter(x => x.product);
  if (!entries.length) { $('cartItems').innerHTML = '<div class="empty"><div class="empty-icon">🛒</div><h3>Koszyk jest pusty</h3><p>Dodaj produkty ze sklepu.</p><button class="primary-btn" id="emptyShop">PRZEJDŹ DO SKLEPU</button></div>'; $('cartSummary').classList.add('hidden'); $('emptyShop').onclick = () => showView('shop'); return; }
  let total = 0;
  $('cartItems').innerHTML = entries.map(({product, quantity}) => { total += product.price_cents * quantity; return `<div class="cart-item"><div><h3>${escapeHtml(product.name)}</h3><span>${money(product.price_cents)} / szt.</span></div><div class="qty"><button data-minus="${product.id}">−</button><b>${quantity}</b><button data-plus="${product.id}">+</button></div></div>`; }).join('');
  $('cartTotal').textContent = money(total); $('cartSummary').classList.remove('hidden');
  document.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => addToCart(Number(b.dataset.plus)));
  document.querySelectorAll('[data-minus]').forEach(b => b.onclick = () => { const id = Number(b.dataset.minus); const q = (state.cart.get(id) || 1) - 1; if (q <= 0) state.cart.delete(id); else state.cart.set(id, q); updateCartCount(); renderCart(); });
}
async function checkout() {
  if (!initData) return toast('Otwórz sklep bezpośrednio w Telegramie');
  const items = [...state.cart.entries()].map(([id, quantity]) => ({ id, quantity }));
  if (!items.length) return;
  $('checkoutBtn').disabled = true;
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData }, body: JSON.stringify({ items }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Nie udało się utworzyć zamówienia');
    state.cart.clear(); updateCartCount(); toast(`Zamówienie #${data.orderId} utworzone`); showView('orders');
  } catch (e) { toast(e.message); } finally { $('checkoutBtn').disabled = false; }
}
async function loadOrders() {
  if (!initData) { $('ordersList').innerHTML = '<div class="empty">Historia zamówień jest dostępna po otwarciu Mini App w Telegramie.</div>'; return; }
  $('ordersList').innerHTML = '<div class="loading">Ładowanie...</div>';
  try {
    const res = await fetch('/api/orders', { headers: { 'X-Telegram-Init-Data': initData } });
    const data = await res.json(); if (!res.ok) throw new Error();
    const labels = { new:'NOWE', processing:'W REALIZACJI', ready:'GOTOWE', completed:'ZAKOŃCZONE', cancelled:'ANULOWANE' };
    $('ordersList').innerHTML = data.orders?.length ? data.orders.map(o => `<div class="order-card"><div><strong>#${o.id}</strong><span>${new Date(o.created_at).toLocaleDateString('pl-PL')}</span></div><div><b class="status status-${o.status}">${labels[o.status] || o.status}</b><strong>${money(o.total_cents)}</strong></div></div>`).join('') : '<div class="empty"><div class="empty-icon">📦</div><h3>Brak zamówień</h3><p>Twoje zamówienia pojawią się tutaj.</p></div>';
  } catch { $('ordersList').innerHTML = '<div class="empty">Nie udało się pobrać zamówień.</div>'; }
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

$('menuBtn').onclick = () => showView('shop');
$('ordersBtn').onclick = () => showView('orders');
$('contactBtn').onclick = () => showView('contact');
$('cartTop').onclick = () => showView('cart');
$('checkoutBtn').onclick = checkout;
$('searchInput').oninput = renderProducts;
$('contactLink').onclick = () => { if (tg?.openTelegramLink) tg.openTelegramLink('https://t.me/elotonieja'); else window.open('https://t.me/elotonieja', '_blank'); };
document.querySelectorAll('[data-back]').forEach(btn => btn.onclick = () => showView(btn.dataset.back));

updateCartCount();
loadProducts();
