/* app.js — talks to the real backend at /api/* (Node.js + SQLite) */

const CATEGORIES = [
  {id:'stone', label:'سنگ ساختمانی', ic:'🪨'},
  {id:'cement', label:'سیمان', ic:'🧱'},
  {id:'gypsum', label:'گچ', ic:'⬜'},
  {id:'rebar', label:'آهن‌آلات', ic:'🔩'},
  {id:'tile', label:'کاشی و سرامیک', ic:'🀄'},
  {id:'tools', label:'ابزار', ic:'🛠️'},
];

// Per-category example text for the "listing title" field (supplier) and the
// "request title" field (buyer), used as dynamic placeholders.
const CATEGORY_LISTING_TITLE_EXAMPLES = {
  stone: 'مثلاً سنگ گرانیت نطنز برای نما',
  cement: 'مثلاً سیمان تیپ ۲ ممتاز',
  gypsum: 'مثلاً گچ کاری سفید ممتاز',
  rebar: 'مثلاً میلگرد آجدار سایز ۱۴ ذوب‌آهن',
  tile: 'مثلاً کاشی سرامیک کف ۶۰×۶۰',
  tools: 'مثلاً بتونیر ۳۵۰ لیتری',
};
const CATEGORY_REQUEST_TITLE_EXAMPLES = {
  stone: 'مثلاً: نیاز به ۲۰۰ متر سنگ گرانیت نطنز',
  cement: 'مثلاً: نیاز به ۵۰ تن سیمان تیپ ۲',
  gypsum: 'مثلاً: نیاز به ۱۰۰ کیسه گچ ممتاز',
  rebar: 'مثلاً: نیاز به ۱۰ تن میلگرد آجدار سایز ۱۴',
  tile: 'مثلاً: نیاز به ۳۰۰ متر کاشی کف',
  tools: 'مثلاً: نیاز به ۲ دستگاه بتونیر',
};

let products = [];
let currentUser = JSON.parse(localStorage.getItem('sm_user') || 'null');
let cart = [];
let activeProduct = null;
let selectedQty = 1;

/* ---------- API helpers ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: {'Content-Type': 'application/json'},
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطای ناشناخته سرور');
  return data;
}

function toFaNum(n){ return Number(n).toLocaleString('fa-IR'); }
function catLabel(id){ const c = CATEGORIES.find(c=>c.id===id); return c ? c.label : id; }
function catIcon(id){ const c = CATEGORIES.find(c=>c.id===id); return c ? c.ic : '📦'; }
const KNOWN_CATEGORIES = ['stone','cement','gypsum','rebar','tile','tools'];
function catSquareImage(id){
  return '/images/categories/square/' + (KNOWN_CATEGORIES.includes(id) ? id : 'stone') + '.jpg';
}
function catImage(id){
  return '/images/categories/rect/' + (KNOWN_CATEGORIES.includes(id) ? id : 'stone') + '.jpg';
}
function productImage(p){
  return p.imageUrl || catImage(p.category);
}

/* ---------- ROUTER ---------- */
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const navBtns = document.querySelectorAll(`.nav-btn[data-page="${name}"]`);
  const visibleBtn = Array.from(navBtns).find(b => b.style.display !== 'none') || navBtns[0];
  if(visibleBtn) visibleBtn.classList.add('active');

  if(name==='home') renderHome();
  if(name==='browse') renderBrowse();
  if(name==='sell') renderSellPage();
  if(name==='cart') renderCart();
  if(name==='dashboard') renderDashboard();
  if(name==='orders') renderOrders();
  if(name==='rfq-new'){ resetRfqForm(); renderRfqList(); }
  if(name==='rfq-browse') renderRfqBrowse();
  if(name==='ai-mockup') initMockupPage();
  if(name==='account') renderAccountPage();
  if(name==='addresses'){ resetAddressForm(); renderAddressList(); }
  if(name==='stone-guide') renderStoneGuide();
  if(name==='supplier-orders') renderSupplierOrders();
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ---------- INIT ---------- */
function toggleTheme(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if(isLight){
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('sm_theme', 'dark');
  }else{
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('sm_theme', 'light');
  }
  applyThemeAssets();
}

function applyThemeAssets(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const btn = document.getElementById('sidebarThemeBtn');
  if(btn) btn.textContent = isLight ? '☀️ حالت روشن (تغییر به تیره)' : '🌙 حالت تیره (تغییر به روشن)';
  // Header background is fixed dark chrome in both themes, so the logo
  // always uses the light-colored variant made for a dark background.
  const logo = document.getElementById('logoImg');
  if(logo) logo.src = '/images/logo-header.png';
}

async function init(){
  applyThemeAssets();
  populateCategoryUI();
  renderAuthArea();
  updateNavVisibility();
  await refreshProducts();
  renderHome();
  renderBrowse();
  if(currentUser) await refreshCart();
}

async function refreshProducts(query = {}){
  const qs = new URLSearchParams(query).toString();
  products = await api('/api/products' + (qs ? '?'+qs : ''));
}

/* ---------- CATEGORY / HOME / BROWSE ---------- */
function populateCategoryUI(){
  document.getElementById('catGrid').innerHTML = CATEGORIES.map(c=>`
    <div class="cat-card" onclick="filterCategory('${c.id}')">
      <div class="cat-photo-wrap"><img src="${catSquareImage(c.id)}" alt="${c.label}" loading="lazy"></div>
      <b>${c.label}</b>
    </div>`).join('');
  const sel = document.getElementById('catFilter');
  const rfqSel = document.getElementById('rfqCat');
  const rfqFilterSel = document.getElementById('rfqCatFilter');
  CATEGORIES.forEach(c=>{
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.label;
    sel.appendChild(opt);
    rfqSel.appendChild(opt.cloneNode(true));
    rfqFilterSel.appendChild(opt.cloneNode(true));
  });
  updateRequestTitlePlaceholder();
}

function updateRequestTitlePlaceholder(){
  const cat = document.getElementById('rfqCat').value || CATEGORIES[0].id;
  const titleInput = document.getElementById('rfqTitle');
  if(titleInput) titleInput.placeholder = CATEGORY_REQUEST_TITLE_EXAMPLES[cat] || 'مثلاً: نیاز به ۵۰ تن سیمان تیپ ۲';
}

function filterCategory(catId){
  document.getElementById('catFilter').value = catId;
  showPage('browse');
}

function productCardHTML(p){
  return `
    <div class="prod-card" onclick="openProduct('${p.id}')">
      <div class="prod-thumb"><img src="${productImage(p)}" alt="${p.title}" loading="lazy"></div>
      <div class="prod-body">
        <span class="prod-cat">${catLabel(p.category)}</span>
        <div class="prod-title">${p.title}</div>
        <div class="prod-meta">${p.sellerName} · ${p.city}</div>
        <div class="prod-price">${toFaNum(p.price)} <small>تومان / ${p.unit}</small></div>
      </div>
    </div>`;
}

async function renderHome(){
  const latest = await api('/api/products');
  const top = [...latest].sort((a,b)=>b.createdAt-a.createdAt).slice(0,4);
  document.getElementById('homeGrid').innerHTML = top.map(productCardHTML).join('') || `<div class="empty-state">هنوز آگهی‌ای ثبت نشده است.</div>`;
}

async function renderBrowse(){
  const q = document.getElementById('searchInput').value.trim();
  const cat = document.getElementById('catFilter').value;
  await refreshProducts({q, category: cat});
  document.getElementById('browseGrid').innerHTML = products.map(productCardHTML).join('') || `<div class="empty-state">آگهی‌ای مطابق جستجوی شما پیدا نشد.</div>`;
}

/* ---------- PRODUCT DETAIL ---------- */
async function openProduct(id){
  activeProduct = await api('/api/products/' + id);
  selectedQty = activeProduct.qty > 0 ? 1 : 0;
  const outOfStock = activeProduct.qty <= 0;
  const isSupplierViewer = currentUser && currentUser.role === 'supplier';
  document.getElementById('productDetail').innerHTML = `
    <div class="detail-thumb"><img src="${productImage(activeProduct)}" alt="${activeProduct.title}"></div>
    <div class="detail-info">
      <span class="prod-cat">${catLabel(activeProduct.category)}</span>
      <h2>${activeProduct.title}</h2>
      <div class="detail-row"><span>تأمین‌کننده</span><span>${activeProduct.sellerName}</span></div>
      <div class="detail-row"><span>شهر</span><span>${activeProduct.city}</span></div>
      <div class="detail-row"><span>موجودی</span><span>${outOfStock ? 'ناموجود' : toFaNum(activeProduct.qty) + ' ' + activeProduct.unit}</span></div>
      <div class="detail-row"><span>توضیحات</span><span style="max-width:60%; text-align:left">${activeProduct.desc || '—'}</span></div>
      <div class="price">${toFaNum(activeProduct.price)} <small style="font-size:.9rem">تومان / ${activeProduct.unit}</small></div>
      <div id="productMsg"></div>
      ${isSupplierViewer ? `
      <div class="form-msg" style="margin-top:6px;">این بخش فقط برای مشاهده‌ی قیمت و اطلاعات آگهی‌های سایر تأمین‌کنندگان است؛ حساب‌های تأمین‌کننده امکان خرید ندارند.</div>
      ` : outOfStock ? `
      <button class="btn btn-ghost btn-block" disabled>ناموجود</button>
      ` : `
      <div class="qty-row">
        <button onclick="changeQty(-1)">−</button>
        <span id="qtyValue">${selectedQty}</span>
        <button onclick="changeQty(1)">+</button>
        <span style="font-size:.8rem; color:rgba(var(--text-rgb),.5)">از ${toFaNum(activeProduct.qty)} ${activeProduct.unit} موجود</span>
      </div>
      <button class="btn btn-primary btn-block" onclick="addToCart()">افزودن به سبد خرید</button>
      `}
    </div>`;
  showPage('product');
}

function changeQty(delta){
  const max = activeProduct ? activeProduct.qty : 1;
  selectedQty = Math.min(max, Math.max(1, selectedQty+delta));
  document.getElementById('qtyValue').textContent = selectedQty;
}

/* ---------- AUTH ---------- */
function renderAuthArea(){
  const el = document.getElementById('authArea');
  if(currentUser){
    const roleLabel = currentUser.role === 'supplier' ? (currentUser.company_name || 'تأمین‌کننده') : currentUser.name;
    el.innerHTML = `<div class="user-chip">👤 <span>${roleLabel}</span></div>`;
  }else{
    el.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="showPage('auth')">ورود / ثبت‌نام</button>`;
  }
  renderSidebarLinks();
}

/* ---------- SIDEBAR (hamburger drawer) ---------- */
function openSidebar(){
  renderSidebarLinks();
  document.getElementById('sidebarDrawer').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}
function closeSidebar(){
  document.getElementById('sidebarDrawer').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
function sidebarGo(page){
  closeSidebar();
  showPage(page);
}
function renderSidebarLinks(){
  const el = document.getElementById('sidebarLinks');
  if(!el) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const themeLabel = isLight ? '☀️ حالت روشن (تغییر به تیره)' : '🌙 حالت تیره (تغییر به روشن)';
  if(!currentUser){
    el.innerHTML = `
      <button class="sidebar-link" onclick="sidebarGo('auth')">🔑 ورود / ثبت‌نام</button>
      <button class="sidebar-link" id="sidebarThemeBtn" onclick="toggleTheme()">${themeLabel}</button>`;
    return;
  }
  const isSupplier = currentUser.role === 'supplier';
  const nameLabel = isSupplier ? (currentUser.company_name || 'تأمین‌کننده') : currentUser.name;
  const buyerLinks = `
      <button class="sidebar-link" onclick="sidebarGo('orders')">📦 سفارش‌های من</button>
      <button class="sidebar-link" onclick="sidebarGo('addresses')">📍 آدرس‌های من</button>`;
  el.innerHTML = `
    <div class="sidebar-user">👤 ${nameLabel}</div>
    <button class="sidebar-link" onclick="sidebarGo('account')">🧾 اطلاعات حساب</button>
    ${!isSupplier ? buyerLinks : ''}
    <button class="sidebar-link" id="sidebarThemeBtn" onclick="toggleTheme()">${themeLabel}</button>
    <button class="sidebar-link danger" onclick="closeSidebar(); logout()">🚪 خروج از حساب</button>`;
}

function updateNavVisibility(){
  const roleBtns = document.querySelectorAll('[data-role]');
  const guestAllowedPages = ['browse', 'cart'];
  if(!currentUser){
    // logged out: only show Home (no data-role), and the buyer-flavored Browse/Cart entries
    roleBtns.forEach(b=>{
      b.style.display = (b.dataset.role === 'buyer' && guestAllowedPages.includes(b.dataset.page)) ? '' : 'none';
    });
    return;
  }
  roleBtns.forEach(btn=>{
    btn.style.display = (btn.dataset.role === currentUser.role) ? '' : 'none';
  });
}

function setAuthTab(tab){
  document.getElementById('tabLogin').classList.toggle('active', tab==='login');
  document.getElementById('tabRegister').classList.toggle('active', tab==='register');
  document.getElementById('loginForm').style.display = tab==='login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab==='register' ? 'block' : 'none';
  document.getElementById('authMsg').innerHTML = '';
  resetOtpStep('login');
  resetOtpStep('register');
}

function showAuthMsg(text, type){
  document.getElementById('authMsg').innerHTML = `<div class="form-msg ${type}">${text}</div>`;
}

function toggleCompanyField(){
  const role = document.getElementById('regRole').value;
  document.getElementById('companyField').style.display = role === 'supplier' ? 'block' : 'none';
}

const PHONE_RE = /^09\d{9}$/;
let otpResendTimers = { login: null, register: null };

// برگرداندن فرم ورود/ثبت‌نام به حالت اولیه (قبل از ارسال کد)
function resetOtpStep(which){
  const isLogin = which === 'login';
  document.getElementById(isLogin ? 'loginOtpField' : 'regOtpField').style.display = 'none';
  document.getElementById(isLogin ? 'loginVerifyBtn' : 'regSubmitBtn').style.display = 'none';
  document.getElementById(isLogin ? 'loginResendBtn' : 'regResendBtn').style.display = 'none';
  document.getElementById(isLogin ? 'loginSendBtn' : 'regSendBtn').style.display = 'block';
  document.getElementById(isLogin ? 'loginSendBtn' : 'regSendBtn').disabled = false;
  document.getElementById(isLogin ? 'loginOtp' : 'regOtp').value = '';
  if(otpResendTimers[which]){ clearInterval(otpResendTimers[which]); otpResendTimers[which] = null; }
}

// بعد از ارسال موفق کد، دکمه ارسال مجدد را به مدت ۶۰ ثانیه غیرفعال می‌کند
function startResendCountdown(which, seconds = 60){
  const isLogin = which === 'login';
  const resendBtn = document.getElementById(isLogin ? 'loginResendBtn' : 'regResendBtn');
  resendBtn.style.display = 'block';
  let remaining = seconds;
  resendBtn.disabled = true;
  resendBtn.textContent = `ارسال مجدد کد (${remaining})`;
  if(otpResendTimers[which]) clearInterval(otpResendTimers[which]);
  otpResendTimers[which] = setInterval(()=>{
    remaining--;
    if(remaining <= 0){
      clearInterval(otpResendTimers[which]);
      otpResendTimers[which] = null;
      resendBtn.disabled = false;
      resendBtn.textContent = 'ارسال مجدد کد';
    } else {
      resendBtn.textContent = `ارسال مجدد کد (${remaining})`;
    }
  }, 1000);
}

async function sendLoginOtp(isResend = false){
  const phone = document.getElementById('loginPhone').value.trim();
  if(!PHONE_RE.test(phone)){ showAuthMsg('شماره موبایل معتبر نیست (مثال: 09123456789).','error'); return; }
  const sendBtn = document.getElementById('loginSendBtn');
  sendBtn.disabled = true;
  try{
    await api('/api/auth/otp/send', {method:'POST', body: JSON.stringify({phone, purpose:'login'})});
    document.getElementById('loginOtpField').style.display = 'block';
    document.getElementById('loginVerifyBtn').style.display = 'block';
    if(!isResend) sendBtn.style.display = 'none';
    startResendCountdown('login');
    showAuthMsg('کد تایید برای شماره شما پیامک شد.','ok');
  }catch(e){
    sendBtn.disabled = false;
    showAuthMsg(e.message, 'error');
  }
}

async function doLogin(){
  const phone = document.getElementById('loginPhone').value.trim();
  const otpCode = document.getElementById('loginOtp').value.trim();
  if(!otpCode){ showAuthMsg('کد تایید پیامکی را وارد کنید.','error'); return; }
  try{
    const user = await api('/api/auth/login', {method:'POST', body: JSON.stringify({phone, otpCode})});
    currentUser = user;
    localStorage.setItem('sm_user', JSON.stringify(user));
    await refreshCart();
    renderAuthArea();
    updateNavVisibility();
    resetOtpStep('login');
    showAuthMsg('ورود موفق بود.','ok');
    setTimeout(()=>showPage('home'), 500);
  }catch(e){ showAuthMsg(e.message, 'error'); }
}

async function sendRegisterOtp(isResend = false){
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const role = document.getElementById('regRole').value;
  const companyName = document.getElementById('regCompany').value.trim();
  if(!name || !phone){ showAuthMsg('لطفاً نام و شماره موبایل را وارد کنید.','error'); return; }
  if(!PHONE_RE.test(phone)){ showAuthMsg('شماره موبایل معتبر نیست (مثال: 09123456789).','error'); return; }
  if(role === 'supplier' && !companyName){ showAuthMsg('برای تأمین‌کننده، نام کارخانه یا شرکت الزامی است.','error'); return; }
  const sendBtn = document.getElementById('regSendBtn');
  sendBtn.disabled = true;
  try{
    await api('/api/auth/otp/send', {method:'POST', body: JSON.stringify({phone, purpose:'register'})});
    document.getElementById('regOtpField').style.display = 'block';
    document.getElementById('regSubmitBtn').style.display = 'block';
    if(!isResend) sendBtn.style.display = 'none';
    startResendCountdown('register');
    showAuthMsg('کد تایید برای شماره شما پیامک شد.','ok');
  }catch(e){
    sendBtn.disabled = false;
    showAuthMsg(e.message, 'error');
  }
}

async function doRegister(){
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const city = document.getElementById('regCity').value.trim();
  const role = document.getElementById('regRole').value;
  const companyName = document.getElementById('regCompany').value.trim();
  const otpCode = document.getElementById('regOtp').value.trim();
  if(!name || !phone){ showAuthMsg('لطفاً نام و شماره موبایل را وارد کنید.','error'); return; }
  if(role === 'supplier' && !companyName){ showAuthMsg('برای تأمین‌کننده، نام کارخانه یا شرکت الزامی است.','error'); return; }
  if(!otpCode){ showAuthMsg('کد تایید پیامکی را وارد کنید.','error'); return; }
  try{
    const user = await api('/api/auth/register', {method:'POST', body: JSON.stringify({name, phone, city, role, companyName, otpCode})});
    currentUser = user;
    localStorage.setItem('sm_user', JSON.stringify(user));
    await refreshCart();
    renderAuthArea();
    updateNavVisibility();
    resetOtpStep('register');
    showAuthMsg('حساب کاربری با موفقیت ساخته شد. خوش آمدید!','ok');
    setTimeout(()=>showPage('home'), 700);
  }catch(e){ showAuthMsg(e.message, 'error'); }
}

function logout(){
  currentUser = null;
  cart = [];
  localStorage.removeItem('sm_user');
  updateCartCount();
  renderAuthArea();
  updateNavVisibility();
  showPage('home');
}

/* ---------- CART ---------- */
async function refreshCart(){
  if(!currentUser) return;
  cart = await api('/api/cart/' + currentUser.id);
  updateCartCount();
}

function updateCartCount(){
  const count = cart.reduce((s,i)=>s+i.qty,0);
  document.getElementById('cartCount').textContent = toFaNum(count);
}

async function addToCart(){
  if(!currentUser){ showPage('auth'); return; }
  const msg = document.getElementById('productMsg');
  try{
    await api('/api/cart/' + currentUser.id, {method:'POST', body: JSON.stringify({productId: activeProduct.id, qty: selectedQty})});
    await refreshCart();
    selectedQty = 1;
    showPage('cart');
  }catch(e){
    if(msg) msg.innerHTML = `<div class="form-msg error">${e.message}</div>`;
  }
}

async function renderCart(){
  const wrap = document.getElementById('cartItems');
  const summary = document.getElementById('cartSummary');
  if(!currentUser){
    wrap.innerHTML = `<div class="empty-state">برای مشاهده سبد خرید ابتدا وارد حساب کاربری شوید.</div>`;
    summary.style.display = 'none';
    return;
  }
  if(currentUser.role !== 'buyer'){
    wrap.innerHTML = `<div class="empty-state">سبد خرید فقط برای حساب‌های خریدار در دسترس است.</div>`;
    summary.style.display = 'none';
    return;
  }
  await refreshCart();
  if(cart.length===0){
    wrap.innerHTML = `<div class="empty-state">سبد خرید شما خالی است.</div>`;
    summary.style.display = 'none';
    return;
  }
  let total = 0;
  wrap.innerHTML = cart.map(item=>{
    const lineTotal = item.price * item.qty;
    total += lineTotal;
    return `
      <div class="cart-item">
        <div class="ci-info"><b>${item.title}</b><span>${item.qty} ${item.unit} × ${toFaNum(item.price)} تومان</span></div>
        <div style="display:flex; align-items:center; gap:14px;">
          <b style="font-family:var(--font-tag); color:var(--safety-yellow)">${toFaNum(lineTotal)}</b>
          <button class="btn btn-danger btn-sm" onclick="removeFromCart('${item.productId}')">حذف</button>
        </div>
      </div>`;
  }).join('');
  document.getElementById('cartTotal').textContent = toFaNum(total) + ' تومان';
  summary.style.display = 'block';
}

async function removeFromCart(productId){
  await api(`/api/cart/${currentUser.id}/${productId}`, {method:'DELETE'});
  await renderCart();
}

let paymentContext = null; // {type:'cart', subtotal, commission, total} | {type:'request', requestId, offerId, subtotal, commission, total}
let commissionRatesCache = null;

async function getCommissionRates(){
  if(!commissionRatesCache) commissionRatesCache = await api('/api/commission-rates');
  return commissionRatesCache;
}

async function goToPayment(){
  if(!currentUser || cart.length===0) return;
  await refreshCart();
  const rates = await getCommissionRates();
  const lineItems = cart.map(i=>{
    const rate = rates.rates[i.category] ?? rates.default;
    const lineSubtotal = i.price * i.qty;
    const lineCommission = Math.round(lineSubtotal * rate);
    return {title:i.title, qty:i.qty, unit:i.unit, subtotal:lineSubtotal, commission:lineCommission, ratePct: Math.round(rate*100)};
  });
  const subtotal = lineItems.reduce((s,i)=>s+i.subtotal,0);
  const commission = lineItems.reduce((s,i)=>s+i.commission,0);
  paymentContext = {type:'cart', subtotal, commission, total: subtotal+commission};
  openCheckoutReview(lineItems, subtotal, commission);
}

async function goToPaymentForOffer(requestId, offerId){
  if(!currentUser) return;
  try{
    const offer = await api('/api/offers/' + offerId); // refetch to get the current price
    const rates = await getCommissionRates();
    const rate = rates.rates[activeRequest.category] ?? rates.default;
    const subtotal = offer.totalPrice;
    const commission = Math.round(subtotal * rate);
    paymentContext = {type:'request', requestId, offerId, subtotal, commission, total: subtotal+commission};
    const lineItems = [{title: activeRequest.title, qty: offer.qty, unit: offer.unit, subtotal, commission, ratePct: Math.round(rate*100)}];
    openCheckoutReview(lineItems, subtotal, commission);
  }catch(e){
    alert(e.message);
  }
}

/* ---------- CHECKOUT REVIEW: address + commission breakdown, shown before the card number ---------- */
async function openCheckoutReview(lineItems, subtotal, commission){
  const area = document.getElementById('checkoutReviewArea');
  const rows = lineItems.map(i=>`
    <div class="detail-row">
      <span>${i.title}${i.unit ? ' × ' + toFaNum(i.qty) + ' ' + i.unit : ''}</span>
      <span>${toFaNum(i.subtotal)} + ${toFaNum(i.commission)} (کارمزد ${toFaNum(i.ratePct)}٪) تومان</span>
    </div>`).join('');

  let savedAddresses = [];
  try{ savedAddresses = await api('/api/addresses?userId=' + currentUser.id); }catch(e){ /* ignore */ }

  const addressPicker = savedAddresses.length > 0 ? `
    <div class="field" style="margin-top:18px;">
      <label>آدرس تحویل</label>
      <select class="input" id="savedAddressSelect" style="width:100%" onchange="onSavedAddressChange()">
        ${savedAddresses.map(a=>`<option value="${a.id}">${a.label} — ${a.fullAddress}</option>`).join('')}
        <option value="__new__">+ وارد کردن آدرس جدید</option>
      </select>
    </div>
    <div class="field" id="newAddressWrap" style="display:none;">
      <label>آدرس دقیق تحویل بار</label>
      <textarea class="input" id="deliveryAddress" placeholder="استان، شهر، خیابان، پلاک، کد پستی و توضیحات دسترسی"></textarea>
      <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:.85rem; cursor:pointer;">
        <input type="checkbox" id="saveNewAddressChk" onchange="onSaveAddressChkChange()" style="width:16px; height:16px;">
        این آدرس را برای دفعات بعد ذخیره کن
      </label>
      <div class="field" id="newAddressLabelWrap" style="display:none; margin-top:10px;">
        <label>برچسب آدرس</label>
        <input class="input" id="newAddressLabelInput" placeholder="مثلاً خانه، محل کار، کارگاه">
      </div>
    </div>` : `
    <div class="field" style="margin-top:18px;">
      <label>آدرس دقیق تحویل بار</label>
      <textarea class="input" id="deliveryAddress" placeholder="استان، شهر، خیابان، پلاک، کد پستی و توضیحات دسترسی"></textarea>
      <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:.85rem; cursor:pointer;">
        <input type="checkbox" id="saveNewAddressChk" onchange="onSaveAddressChkChange()" style="width:16px; height:16px;">
        این آدرس را برای دفعات بعد ذخیره کن
      </label>
      <div class="field" id="newAddressLabelWrap" style="display:none; margin-top:10px;">
        <label>برچسب آدرس</label>
        <input class="input" id="newAddressLabelInput" placeholder="مثلاً خانه، محل کار، کارگاه">
      </div>
    </div>`;

  area.innerHTML = `
    <div class="form-card wide">
      <h3 style="margin-bottom:16px; font-size:1rem;">اقلام سفارش و کارمزد پلتفرم</h3>
      ${rows}
      <div class="detail-row"><span>جمع قیمت کالا</span><span>${toFaNum(subtotal)} تومان</span></div>
      <div class="detail-row"><span>جمع کارمزد پلتفرم</span><span>${toFaNum(commission)} تومان</span></div>
      <div class="cart-total"><span>مبلغ نهایی قابل پرداخت</span><span>${toFaNum(subtotal+commission)} تومان</span></div>
      <div id="reviewMsg"></div>
      ${addressPicker}
      <button class="btn btn-primary btn-block" style="margin-top:10px" onclick="confirmCheckoutReview()">تأیید آدرس و مشاهده شماره کارت</button>
    </div>`;
  window._savedAddresses = savedAddresses;
  showPage('checkout-review');
}

function onSavedAddressChange(){
  const sel = document.getElementById('savedAddressSelect');
  const wrap = document.getElementById('newAddressWrap');
  wrap.style.display = sel.value === '__new__' ? 'block' : 'none';
}

function onSaveAddressChkChange(){
  const chk = document.getElementById('saveNewAddressChk');
  const wrap = document.getElementById('newAddressLabelWrap');
  wrap.style.display = chk.checked ? 'block' : 'none';
}

async function confirmCheckoutReview(){
  const msg = document.getElementById('reviewMsg');
  let address = '';
  const sel = document.getElementById('savedAddressSelect');
  let usingNewAddress = !sel; // no saved addresses at all -> textarea is the only option
  if(sel && sel.value !== '__new__'){
    const match = (window._savedAddresses || []).find(a=>a.id === sel.value);
    address = match ? match.fullAddress : '';
  }else{
    usingNewAddress = true;
    const ta = document.getElementById('deliveryAddress');
    address = ta ? ta.value.trim() : '';
  }
  if(!address){ msg.innerHTML = `<div class="form-msg error">لطفاً آدرس تحویل را وارد کنید.</div>`; return; }

  if(usingNewAddress){
    const chk = document.getElementById('saveNewAddressChk');
    if(chk && chk.checked){
      const labelInput = document.getElementById('newAddressLabelInput');
      const label = labelInput ? labelInput.value.trim() : '';
      if(!label){
        msg.innerHTML = `<div class="form-msg error">برای ذخیره آدرس، یک برچسب (مثلاً خانه، محل کار) وارد کنید.</div>`;
        return;
      }
      try{
        await api('/api/addresses', {method:'POST', body: JSON.stringify({userId: currentUser.id, label, fullAddress: address})});
      }catch(e){ /* ignore save failure, checkout should still proceed */ }
    }
  }

  paymentContext.address = address;
  openPaymentPage(paymentContext.total);
}

function openPaymentPage(total){
  document.getElementById('paymentTotal').textContent = toFaNum(total) + ' تومان';
  document.getElementById('trackingCodeInput').value = '';
  document.getElementById('paymentMsg').innerHTML = '';
  document.getElementById('cardDisplay').innerHTML = 'در حال بارگذاری اطلاعات کارت...';
  showPage('payment');
  api('/api/payment-info').then(info=>{
    document.getElementById('cardDisplay').innerHTML = `
      <div class="cd-row"><div class="cd-label">شماره کارت</div><div class="cd-number">${info.cardNumber} <button class="copy-btn" onclick="copyCard('${info.cardNumber}')">کپی</button></div></div>
      <div class="cd-row"><div class="cd-label">به نام</div><div class="cd-holder">${info.cardHolder}</div></div>
      <div class="cd-row" style="margin-bottom:0;"><div class="cd-label">بانک</div><div class="cd-holder">${info.bankName}</div></div>
    `;
  }).catch(()=>{ document.getElementById('cardDisplay').innerHTML = 'خطا در دریافت اطلاعات کارت.'; });
}

function copyCard(number){
  navigator.clipboard.writeText(number.replace(/-/g,'')).then(()=>{
    document.getElementById('paymentMsg').innerHTML = `<div class="form-msg ok">شماره کارت کپی شد.</div>`;
  });
}

async function submitPayment(){
  const trackingCode = document.getElementById('trackingCodeInput').value.trim();
  const msg = document.getElementById('paymentMsg');
  if(!trackingCode){ msg.innerHTML = `<div class="form-msg error">لطفاً شماره پیگیری تراکنش را وارد کنید.</div>`; return; }
  try{
    if(paymentContext.type === 'request'){
      await api(`/api/requests/${paymentContext.requestId}/checkout`, {method:'POST', body: JSON.stringify({buyerId: currentUser.id, offerId: paymentContext.offerId, address: paymentContext.address, trackingCode})});
    }else{
      await api('/api/checkout', {method:'POST', body: JSON.stringify({userId: currentUser.id, address: paymentContext.address, trackingCode})});
      await refreshCart();
    }
    msg.innerHTML = `<div class="form-msg ok">سفارش ثبت شد و برای بررسی ادمین ارسال گردید.</div>`;
    setTimeout(()=>showPage('orders'), 700);
  }catch(e){
    msg.innerHTML = `<div class="form-msg error">${e.message}</div>`;
  }
}

/* ---------- SELL ---------- */
function renderSellPage(){
  const gate = document.getElementById('sellGate');
  if(!currentUser){
    gate.innerHTML = `<div class="form-msg">برای ثبت آگهی ابتدا باید <a style="color:var(--safety-yellow); cursor:pointer" onclick="showPage('auth')">وارد حساب کاربری</a> شوید.</div>`;
    return;
  }
  if(currentUser.role !== 'supplier'){
    gate.innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های تأمین‌کننده در دسترس است.</div>`;
    return;
  }
  gate.innerHTML = `
    <div class="form-card wide">
      <div id="sellMsg"></div>
      <div class="field-row">
        <div class="field"><label>عنوان آگهی</label><input class="input" id="pTitle" placeholder="${CATEGORY_LISTING_TITLE_EXAMPLES[CATEGORIES[0].id]}"></div>
        <div class="field"><label>دسته‌بندی</label>
          <select id="pCat" style="width:100%" onchange="updateSellTitlePlaceholder()">${CATEGORIES.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>قیمت (تومان)</label><input class="input" id="pPrice" type="number" placeholder="۳۲۰۰۰۰۰"></div>
        <div class="field"><label>واحد</label><input class="input" id="pUnit" placeholder="تن / متر مربع / عدد"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>موجودی</label><input class="input" id="pQty" type="number" placeholder="مثلاً ۵۰"></div>
        <div class="field"><label>شهر</label><input class="input" id="pCity" placeholder="مثلاً اصفهان"></div>
      </div>
      <div class="field"><label>توضیحات</label><textarea class="input" id="pDesc" placeholder="سورت، ضخامت، نحوه تحویل و ..."></textarea></div>
      <div class="field">
        <label>عکس کالا (اختیاری — در صورت عدم انتخاب، تصویر پیش‌فرض دسته نمایش داده می‌شود)</label>
        <input class="input" id="pImage" type="file" accept="image/*" onchange="handleProductImageSelect(event)">
        <img id="pImagePreview" class="image-upload-preview" alt="پیش‌نمایش">
      </div>
      <button class="btn btn-primary btn-block" onclick="submitProduct()">ثبت آگهی</button>
    </div>`;
}

function updateSellTitlePlaceholder(){
  const cat = document.getElementById('pCat').value || CATEGORIES[0].id;
  const titleInput = document.getElementById('pTitle');
  if(titleInput) titleInput.placeholder = CATEGORY_LISTING_TITLE_EXAMPLES[cat] || 'مثلاً سیمان تیپ ۲ ممتاز';
}

let selectedProductImage = null;
function handleProductImageSelect(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 800;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      selectedProductImage = canvas.toDataURL('image/jpeg', 0.8);
      const preview = document.getElementById('pImagePreview');
      preview.src = selectedProductImage;
      preview.style.display = 'block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitProduct(){
  const title = document.getElementById('pTitle').value.trim();
  const category = document.getElementById('pCat').value;
  const price = parseInt(document.getElementById('pPrice').value);
  const unit = document.getElementById('pUnit').value.trim();
  const qty = parseInt(document.getElementById('pQty').value);
  const city = document.getElementById('pCity').value.trim();
  const desc = document.getElementById('pDesc').value.trim();
  const msg = document.getElementById('sellMsg');

  if(!title || !unit || !city || !price || !qty){
    msg.innerHTML = `<div class="form-msg error">لطفاً همه فیلدهای ضروری را پر کنید.</div>`;
    return;
  }
  try{
    await api('/api/products', {method:'POST', body: JSON.stringify({
      sellerId: currentUser.id, sellerName: currentUser.name, category, title, price, unit, qty, city, desc,
      imageUrl: selectedProductImage || null,
    })});
    await refreshProducts();
    renderHome();
    msg.innerHTML = `<div class="form-msg ok">آگهی با موفقیت ثبت شد.</div>`;
    document.querySelectorAll('#sellGate input, #sellGate textarea').forEach(i=>i.value='');
    selectedProductImage = null;
    const preview = document.getElementById('pImagePreview');
    if(preview){ preview.style.display = 'none'; preview.src = ''; }
  }catch(e){
    msg.innerHTML = `<div class="form-msg error">${e.message}</div>`;
  }
}

/* ---------- DASHBOARD ---------- */
async function renderDashboard(){
  const area = document.getElementById('dashboardArea');
  if(!currentUser){
    area.innerHTML = `<div class="form-msg">برای دیدن آگهی‌های خود ابتدا <a style="color:var(--safety-yellow); cursor:pointer" onclick="showPage('auth')">وارد شوید</a>.</div>`;
    return;
  }
  if(currentUser.role !== 'supplier'){
    area.innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های تأمین‌کننده در دسترس است.</div>`;
    return;
  }
  const mine = await api('/api/products?sellerId=' + currentUser.id);
  if(mine.length===0){
    area.innerHTML = `<div class="empty-state">هنوز آگهی‌ای ثبت نکرده‌اید. <br><button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="showPage('sell')">ثبت آگهی جدید</button></div>`;
    return;
  }
  area.innerHTML = `<table><thead><tr><th>عنوان</th><th>دسته</th><th>قیمت</th><th>موجودی</th><th>بازدید</th><th>فروش</th><th>عملیات</th></tr></thead><tbody>
    ${mine.map(p=>`
      <tr>
        <td>${p.title}</td>
        <td>${catLabel(p.category)}</td>
        <td>${toFaNum(p.price)} / ${p.unit}</td>
        <td>${toFaNum(p.qty)}</td>
        <td>${toFaNum(p.views || 0)}</td>
        <td>${toFaNum(p.salesCount || 0)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">حذف آگهی</button></td>
      </tr>`).join('')}
  </tbody></table>`;
}

async function deleteProduct(id){
  await api(`/api/products/${id}?sellerId=${currentUser.id}`, {method:'DELETE'});
  await renderDashboard();
  await refreshProducts();
  renderHome();
}

/* ---------- ORDERS ---------- */
async function renderOrders(){
  const area = document.getElementById('ordersArea');
  if(!currentUser){
    area.innerHTML = `<div class="form-msg">برای دیدن سفارش‌های خود ابتدا <a style="color:var(--safety-yellow); cursor:pointer" onclick="showPage('auth')">وارد شوید</a>.</div>`;
    return;
  }
  if(currentUser.role !== 'buyer'){
    area.innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های خریدار در دسترس است.</div>`;
    return;
  }
  const mine = await api('/api/orders/' + currentUser.id);
  if(mine.length===0){
    area.innerHTML = `<div class="empty-state">هنوز سفارشی ثبت نکرده‌اید.</div>`;
    return;
  }
  const statusMap = {
    awaiting_confirmation: {label:'در انتظار تأیید ادمین', cls:'status-awaiting'},
    confirmed: {label:'تأیید شده', cls:'status-confirmed'},
    rejected: {label:'رد شده', cls:'status-rejected'},
  };
  const fulfillmentMap = {
    preparing: 'در حال آماده‌سازی',
    packaging: 'در حال بسته‌بندی',
    shipping: 'در حال ارسال',
    delivered: 'تحویل داده شده',
  };
  area.innerHTML = mine.map(o=>{
    const st = statusMap[o.status] || {label:o.status, cls:'status-awaiting'};
    const itemsHTML = o.items.map(i=>`
      <div class="detail-row">
        <span>${i.title} × ${toFaNum(i.qty)}</span>
        <span>${o.status==='confirmed' ? `<span class="status-pill status-confirmed">${fulfillmentMap[i.fulfillmentStatus] || i.fulfillmentStatus}</span>` : toFaNum(i.price*i.qty) + ' تومان'}</span>
      </div>`).join('');
    return `
    <div class="form-card wide" style="margin-bottom:16px;">
      <div class="detail-row"><span>شماره سفارش</span><span>${o.id}</span></div>
      ${itemsHTML}
      <div class="detail-row"><span>آدرس تحویل</span><span style="max-width:60%; text-align:left">${o.address || '—'}</span></div>
      <div class="detail-row"><span>جمع قیمت کالا</span><span>${toFaNum(o.subtotal ?? o.total)} تومان</span></div>
      <div class="detail-row"><span>کارمزد پلتفرم</span><span>${toFaNum(o.commission ?? 0)} تومان</span></div>
      <div class="detail-row"><span>مبلغ کل پرداختی</span><span>${toFaNum(o.total)} تومان</span></div>
      <div class="detail-row"><span>شماره پیگیری واریز</span><span>${o.trackingCode || '—'}</span></div>
      <div class="detail-row"><span>وضعیت پرداخت</span><span class="status-pill ${st.cls}">${st.label}</span></div>
    </div>`;
  }).join('');
}

/* ---------- RFQ: BUYER — create request ---------- */
function resetRfqForm(){
  document.getElementById('rfqMsg').innerHTML = '';
  document.getElementById('rfqFormCard').style.display = 'none';
  const toggleBtn = document.getElementById('newRfqToggleBtn');
  if(!currentUser || currentUser.role !== 'buyer'){
    toggleBtn.style.display = 'none';
  }else{
    toggleBtn.style.display = 'inline-block';
  }
}

function toggleNewRfqForm(){
  if(!currentUser || currentUser.role !== 'buyer'){
    showPage('auth');
    return;
  }
  const card = document.getElementById('rfqFormCard');
  const isHidden = card.style.display === 'none';
  card.style.display = isHidden ? 'block' : 'none';
  if(isHidden) card.scrollIntoView({behavior:'smooth', block:'start'});
}

async function submitRequest(){
  const title = document.getElementById('rfqTitle').value.trim();
  const category = document.getElementById('rfqCat').value;
  const qty = parseInt(document.getElementById('rfqQty').value);
  const unit = document.getElementById('rfqUnit').value.trim();
  const city = document.getElementById('rfqCity').value.trim();
  const description = document.getElementById('rfqDesc').value.trim();
  const msg = document.getElementById('rfqMsg');
  if(!title || !qty || !unit || !city){
    msg.innerHTML = `<div class="form-msg error">لطفاً همه فیلدهای ضروری را پر کنید.</div>`;
    return;
  }
  try{
    await api('/api/requests', {method:'POST', body: JSON.stringify({
      buyerId: currentUser.id, buyerName: currentUser.name, category, title, description, qty, unit, city,
    })});
    msg.innerHTML = `<div class="form-msg ok">درخواست شما ثبت شد و برای تأمین‌کنندگان این دسته ارسال گردید.</div>`;
    document.querySelectorAll('#page-rfq-new input, #page-rfq-new textarea').forEach(i=>i.value='');
    await renderRfqList();
    setTimeout(()=>{ document.getElementById('rfqFormCard').style.display = 'none'; }, 900);
  }catch(e){
    msg.innerHTML = `<div class="form-msg error">${e.message}</div>`;
  }
}

/* ---------- RFQ: BUYER — my requests + offers received ---------- */
async function renderRfqList(){
  const area = document.getElementById('rfqListArea');
  if(!currentUser || currentUser.role !== 'buyer'){
    area.innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های خریدار در دسترس است.</div>`;
    return;
  }
  const list = await api('/api/requests?buyerId=' + currentUser.id);
  if(list.length===0){
    area.innerHTML = `<div class="empty-state">هنوز درخواستی ثبت نکرده‌اید. <br><button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="toggleNewRfqForm()">ثبت درخواست جدید</button></div>`;
    return;
  }
  const statusMap = {open:{label:'در انتظار پیشنهاد', cls:'status-awaiting'}, closed:{label:'نهایی‌شده', cls:'status-confirmed'}};
  area.innerHTML = list.map(r=>{
    const st = statusMap[r.status];
    return `
    <div class="rfq-card" onclick="openRequestDetail('${r.id}')">
      <div class="rfq-head"><b>${r.title}</b><span class="status-pill ${st.cls}">${st.label}</span></div>
      <div class="prod-meta">${catLabel(r.category)} · ${toFaNum(r.qty)} ${r.unit} · ${r.city}</div>
      <div class="prod-meta" style="margin-top:6px;">${toFaNum(r.offerCount)} پیشنهاد دریافت‌شده</div>
      ${r.status === 'open' ? `<button class="btn btn-danger btn-sm" style="margin-top:10px" onclick="event.stopPropagation(); deleteRequest('${r.id}')">حذف درخواست</button>` : ''}
    </div>`;
  }).join('');
}

async function deleteRequest(id){
  if(!confirm('درخواست خرید حذف شود؟ این عملیات قابل بازگشت نیست.')) return;
  try{
    await api(`/api/requests/${id}?buyerId=${currentUser.id}`, {method:'DELETE'});
    await renderRfqList();
  }catch(e){
    alert(e.message);
  }
}

let activeRequest = null;
async function openRequestDetail(id){
  activeRequest = await api('/api/requests/' + id);
  const area = document.getElementById('rfqDetailArea');
  const offersHTML = activeRequest.offers.length === 0
    ? `<div class="empty-state">هنوز پیشنهادی از تأمین‌کنندگان دریافت نشده است.</div>`
    : activeRequest.offers.map(o=>`
        <div class="offer-row">
          <label>
            <input type="radio" name="offerPick" value="${o.id}">
            <span>
              <span class="offer-price">${toFaNum(o.unitPrice)} تومان / ${activeRequest.unit} <span style="color:rgba(var(--text-rgb),0.5); font-weight:400;">(قیمت کل: ${toFaNum(o.totalPrice)} تومان)</span></span><br>
              <span class="offer-meta">${o.supplierName}${o.message ? ' — ' + o.message : ''}</span>
            </span>
          </label>
        </div>`).join('');

  area.innerHTML = `
    <div class="page-head"><span class="eyebrow">${catLabel(activeRequest.category)}</span><h1>${activeRequest.title}</h1>
      <p>${toFaNum(activeRequest.qty)} ${activeRequest.unit} · ${activeRequest.city}${activeRequest.description ? ' — ' + activeRequest.description : ''}</p>
    </div>
    <div class="form-card wide">
      <h3 style="margin-bottom:16px; font-size:1rem;">پیشنهادهای تأمین‌کنندگان</h3>
      ${offersHTML}
      ${activeRequest.status === 'open' && activeRequest.offers.length > 0 ? `
        <div id="rfqDetailMsg"></div>
        <button class="btn btn-primary btn-block" style="margin-top:10px" onclick="confirmSelectedOffer()">ثبت سفارش با پیشنهاد انتخاب‌شده</button>
      ` : ''}
      ${activeRequest.status === 'closed' ? `<div class="form-msg ok">این درخواست نهایی شده و سفارش ثبت گردیده است.</div>` : ''}
    </div>`;
  showPage('rfq-detail');
}

function confirmSelectedOffer(){
  const picked = document.querySelector('input[name="offerPick"]:checked');
  const msg = document.getElementById('rfqDetailMsg');
  if(!picked){ msg.innerHTML = `<div class="form-msg error">لطفاً یکی از پیشنهادها را انتخاب کنید.</div>`; return; }
  goToPaymentForOffer(activeRequest.id, picked.value);
}

/* ---------- RFQ: SUPPLIER — browse open requests and bid ---------- */
async function renderRfqBrowse(){
  const area = document.getElementById('rfqBrowseArea');
  if(!currentUser || currentUser.role !== 'supplier'){
    area.innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های تأمین‌کننده در دسترس است.</div>`;
    return;
  }
  const cat = document.getElementById('rfqCatFilter').value;
  const qs = new URLSearchParams({supplierId: currentUser.id});
  if(cat) qs.set('category', cat);
  const list = await api('/api/requests/open?' + qs.toString());
  if(list.length===0){
    area.innerHTML = `<div class="empty-state">در حال حاضر استعلام باز مطابق این فیلتر وجود ندارد.</div>`;
    return;
  }
  area.innerHTML = list.map(r=>`
    <div class="rfq-card" id="rfq-browse-${r.id}">
      <div class="rfq-head"><b>${r.title}</b><span class="prod-cat">${catLabel(r.category)}</span></div>
      <div class="prod-meta">${toFaNum(r.qty)} ${r.unit} · ${r.city}</div>
      ${r.description ? `<p style="font-size:.85rem; color:rgba(var(--text-rgb),0.6); margin-top:8px;">${r.description}</p>` : ''}
      <div class="price-range-box" style="margin-top:12px;">${priceBoxHTML(r)}</div>
      <div class="field-row" style="margin-top:16px;">
        <div class="field"><label>قیمت واحد پیشنهادی (تومان به ازای هر ${r.unit})</label><input class="input" id="bidPrice-${r.id}" type="number" value="${r.myOfferUnitPrice ?? ''}" placeholder="مثلاً ۵۰۰۰۰" oninput="updateLiveTotal('${r.id}', ${r.qty})"></div>
        <div class="field"><label>توضیح (اختیاری)</label><input class="input" id="bidMsg-${r.id}" placeholder="مثلاً زمان تحویل"></div>
      </div>
      <div class="prod-meta" id="liveTotal-${r.id}" style="margin-top:4px;">${r.myOfferUnitPrice != null ? `قیمت کل: ${toFaNum(r.myOfferUnitPrice * r.qty)} تومان` : ''}</div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="submitOffer('${r.id}')">ثبت / به‌روزرسانی پیشنهاد</button>
    </div>`).join('');
}

function updateLiveTotal(requestId, qty){
  const priceInput = document.getElementById(`bidPrice-${requestId}`);
  const totalEl = document.getElementById(`liveTotal-${requestId}`);
  const unitPrice = parseFloat(priceInput.value);
  if(!totalEl) return;
  totalEl.textContent = unitPrice > 0 ? `قیمت کل: ${toFaNum(Math.round(unitPrice * qty))} تومان` : '';
}

function priceBoxHTML(r){
  if(r.lowestUnitPrice == null){
    return `هنوز پیشنهادی برای این درخواست ثبت نشده است.`;
  }
  let html = `پایین‌ترین قیمت واحد پیشنهادی: <b>${toFaNum(r.lowestUnitPrice)}</b> تومان <span style="color:rgba(var(--text-rgb),0.5)">(قیمت کل: ${toFaNum(r.lowestTotalPrice)} تومان)</span>`;
  if(r.myOfferUnitPrice != null){
    html += `<br><span class="my-price">آخرین پیشنهاد شما: قیمت واحد <b>${toFaNum(r.myOfferUnitPrice)}</b> تومان — قیمت کل <b>${toFaNum(r.myOfferTotalPrice)}</b> تومان</span>`;
  }
  return html;
}

async function submitOffer(requestId){
  const price = parseInt(document.getElementById(`bidPrice-${requestId}`).value);
  const message = document.getElementById(`bidMsg-${requestId}`).value.trim();
  const box = document.querySelector(`#rfq-browse-${requestId} .price-range-box`);
  if(!price){ if(box) box.innerHTML = `<span style="color:var(--danger)">لطفاً قیمت واحد را وارد کنید.</span>`; return; }
  try{
    await api(`/api/requests/${requestId}/offers`, {method:'POST', body: JSON.stringify({
      supplierId: currentUser.id, supplierName: currentUser.name, price, message,
    })});
    await refreshPriceBox(requestId);
  }catch(e){
    if(box) box.innerHTML = `<span style="color:var(--danger)">${e.message}</span>`;
  }
}

async function refreshPriceBox(requestId){
  try{
    const list = await api('/api/requests/open?' + new URLSearchParams({supplierId: currentUser.id}));
    const match = list.find(r=>r.id===requestId);
    const box = document.querySelector(`#rfq-browse-${requestId} .price-range-box`);
    if(!box || !match) return;
    box.innerHTML = priceBoxHTML(match);
  }catch(e){ /* non-critical, ignore */ }
}

/* ---------- SUPPLIER: manage order fulfillment ---------- */
const FULFILLMENT_STAGES = ['preparing', 'packaging', 'shipping', 'delivered'];
const FULFILLMENT_LABELS = {
  preparing: 'در حال آماده‌سازی',
  packaging: 'در حال بسته‌بندی',
  shipping: 'در حال ارسال',
  delivered: 'تحویل داده شده',
};

async function renderSupplierOrders(){
  const area = document.getElementById('supplierOrdersArea');
  if(!currentUser || currentUser.role !== 'supplier'){
    area.innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های تأمین‌کننده در دسترس است.</div>`;
    return;
  }
  const items = await api('/api/supplier/orders?supplierId=' + currentUser.id);
  if(items.length===0){
    area.innerHTML = `<div class="empty-state">هنوز سفارشی برای شما ثبت نشده است.</div>`;
    return;
  }
  area.innerHTML = items.map(i=>{
    const isPendingAdmin = i.orderStatus === 'awaiting_confirmation';
    const stageIdx = FULFILLMENT_STAGES.indexOf(i.fulfillmentStatus);
    const nextStage = FULFILLMENT_STAGES[stageIdx+1];
    const statusPill = isPendingAdmin
      ? `<span class="status-pill status-awaiting">در انتظار تایید ادمین</span>`
      : `<span class="status-pill status-confirmed">${FULFILLMENT_LABELS[i.fulfillmentStatus] || i.fulfillmentStatus}</span>`;
    const actionArea = isPendingAdmin
      ? `<div class="form-msg" style="margin-top:14px;">این سفارش هنوز توسط ادمین تایید نشده است؛ پس از تایید پرداخت، می‌توانید مراحل ارسال را جلو ببرید.</div>`
      : (nextStage ? `
      <button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="advanceFulfillment('${i.itemId}','${nextStage}')">
        انتقال به مرحله «${FULFILLMENT_LABELS[nextStage]}»
      </button>` : `<div class="form-msg ok" style="margin-top:14px;">این سفارش تحویل داده شده است.</div>`);
    return `
    <div class="rfq-card">
      <div class="rfq-head"><b>${i.title}</b>${statusPill}</div>
      <div class="prod-meta">شماره سفارش: ${i.orderId} · تعداد: ${toFaNum(i.qty)}</div>
      <div class="prod-meta">خریدار: ${i.buyerName}</div>
      <div class="prod-meta" style="margin-top:6px;">آدرس تحویل: ${i.address || '—'}</div>
      ${actionArea}
    </div>`;
  }).join('');
}

async function advanceFulfillment(itemId, status){
  try{
    await api(`/api/supplier/order-items/${itemId}`, {method:'PATCH', body: JSON.stringify({supplierId: currentUser.id, status})});
    renderSupplierOrders();
  }catch(e){
    alert(e.message);
  }
}

/* ---------- FACADE MOCKUP (free local simulation by default; real AI optional) ---------- */
const STONE_CATEGORIES = [
  {key:'facade', label:'سنگ‌های مناسب نمای ساختمان'},
  {key:'floor', label:'سنگ‌های مناسب کف ساختمان'},
  {key:'traffic', label:'سنگ‌های مناسب فضاهای پرتردد'},
  {key:'luxury', label:'سنگ‌های لوکس و دکوراتیو'},
  {key:'interior', label:'سنگ‌های مناسب سرویس بهداشتی و فضاهای داخلی'},
  {key:'landscape', label:'سنگ‌های خاص برای نما و محوطه'},
];

const STONE_CATALOG = [
  // نمای ساختمان
  {key:'travertine_abbasabad', label:'تراورتن عباس‌آباد', category:'facade', color:'#e8dfc8', grain:true, desc:'بهترین گزینه برای نمای لوکس ساختمان؛ مقاوم، روشن و با چسبندگی عالی.'},
  {key:'travertine_hajiabad', label:'تراورتن حاجی‌آباد', category:'facade', color:'#d9c3a0', grain:true, desc:'مناسب نمای بیرونی ساختمان مسکونی و تجاری؛ مقاوم در برابر شرایط جوی.'},
  {key:'travertine_atashkooh', label:'تراورتن آتشکوه', category:'facade', color:'#ede6d6', grain:true, desc:'سنگی لوکس با رنگ روشن؛ مناسب نماهای کلاسیک و ساختمان‌های شاخص.'},
  {key:'travertine_darehbokhari', label:'تراورتن دره‌بخاری', category:'facade', color:'#dcc9ac', grain:true, desc:'مناسب نمای اصلی، ستون‌ها و قاب پنجره‌ها با ظاهر طبیعی و زیبا.'},
  {key:'travertine_tekab', label:'تراورتن تکاب', category:'facade', color:'#cbb491', grain:true, desc:'انتخابی اقتصادی برای نمای ساختمان با دوام مناسب و ظاهر طبیعی.'},
  // کف ساختمان
  {key:'marmarit_dehbid', label:'مرمریت دهبید', category:'floor', color:'#ede7dc', grain:true, desc:'یکی از بهترین گزینه‌ها برای کف واحدهای مسکونی، لابی لوکس.'},
  {key:'marmarit_harsin', label:'مرمریت هرسین', category:'floor', color:'#e8d9c9', grain:true, desc:'مناسب کف راهروها، اتاق‌ها و فضاهای داخلی با تردد متوسط.'},
  {key:'marmarit_lashtar', label:'مرمریت لاشتر', category:'floor', color:'#8a8d91', grain:true, desc:'مناسب کف، پله و لابی؛ با رنگ خاکستری خاص و مقاومت بالا.'},
  {key:'marmarit_gohareh', label:'مرمریت گوهره', category:'floor', color:'#e7dcc5', grain:true, desc:'مناسب دیوارهای داخلی و کف فضاهای کم‌تردد با رنگ کرم روشن.'},
  {key:'marmarit_salsali', label:'مرمریت صلصالی', category:'floor', color:'#e3d2ae', grain:true, desc:'مناسب کف ساختمان‌های مسکونی و اداری با ظاهری یکنواخت.'},
  // فضاهای پرتردد
  {key:'granite_natanz', label:'گرانیت نطنز', category:'traffic', color:'#c9c9c7', grain:true, desc:'مناسب پارکینگ، رمپ و فضاهای پرتردد؛ بسیار مقاوم در برابر سایش.'},
  {key:'granite_nehbandan', label:'گرانیت نهبندان', category:'traffic', color:'#d9a98a', grain:true, desc:'انتخابی عالی برای پله‌ها، ورودی ساختمان و فضاهای عمومی.'},
  {key:'granite_morvarid_mashhad', label:'گرانیت مروارید مشهد', category:'traffic', color:'#d4d4d2', grain:true, desc:'مناسب کف مراکز تجاری، ادارات و ساختمان‌های پرتردد.'},
  {key:'granite_zahedan', label:'گرانیت زاهدان', category:'traffic', color:'#dbae8e', grain:true, desc:'مناسب محوطه، پیاده‌رو و فضاهای بیرونی با دوام بالا.'},
  {key:'granite_black_tuyserkan', label:'گرانیت مشکی تویسرکان', category:'traffic', color:'#1c1c1c', grain:true, desc:'گزینه‌ای لوکس برای لابی، دیوارهای شاخص، کانتر و کف فضاهای خاص.'},
  // لوکس و دکوراتیو
  {key:'marble_white', label:'مرمر سفید', category:'luxury', color:'#f0efea', grain:true, desc:'مناسب لابی‌های لوکس، دیوارهای شاخص و فضاهای داخلی مجلل.'},
  {key:'marble_green', label:'مرمر سبز', category:'luxury', color:'#2e4a3b', grain:true, desc:'انتخابی خاص برای دیوارهای دکوراتیو، لابی و فضاهای تشریفاتی.'},
  {key:'marble_pink', label:'مرمر صورتی', category:'luxury', color:'#e3c2c2', grain:true, desc:'مناسب دیوارهای داخلی، هتل‌ها و پروژه‌های لوکس.'},
  {key:'marble_cream', label:'مرمر کرم', category:'luxury', color:'#e5dcc3', grain:true, desc:'گزینه‌ای شیک برای دیوار، کانتر و فضاهای داخلی با نورپردازی مناسب.'},
  {key:'marble_honey', label:'مرمر عسلی', category:'luxury', color:'#c9a159', grain:true, desc:'مناسب لابی، دیوار پشت تلویزیون، کانتر پذیرش و فضاهای دکوراتیو.'},
  // سرویس بهداشتی و فضاهای داخلی
  {key:'porcelain_aligoodarz', label:'چینی الیگودرز', category:'interior', color:'#ededed', grain:false, desc:'مناسب سرویس بهداشتی، حمام و دیوارهای داخلی؛ رنگ روشن و جذب آب پایین.'},
  {key:'porcelain_azna', label:'چینی ازنا', category:'interior', color:'#e9e7e1', grain:false, desc:'مناسب کف داخلی، دیوار، آشپزخانه و سرویس بهداشتی با مقاومت بالا.'},
  {key:'crystal_sirjan', label:'کریستال سیرجان', category:'interior', color:'#e5e0d8', grain:true, desc:'مناسب کف واحدهای مسکونی، راهروها و فضاهای داخلی با ظاهر درخشان.'},
  {key:'crystal_laybid', label:'کریستال لایبید', category:'interior', color:'#ded0b8', grain:true, desc:'انتخابی مناسب برای کف، دیوار و پله‌های داخلی با زمینه روشن و رگه‌های طبیعی.'},
  {key:'crystal_qorveh', label:'کریستال قروه', category:'interior', color:'#c7b393', grain:true, desc:'مناسب لابی، کف ساختمان، پله و فضاهای پرتردد داخلی با دوام بالا.'},
  // نما و محوطه خاص
  {key:'sandstone', label:'سنداستون (Sandstone)', category:'landscape', color:'#c2955f', grain:true, desc:'مناسب نمای روستیک، دیوارهای باغ، ویلاها و محوطه‌سازی با ظاهر طبیعی.'},
  {key:'limestone', label:'لایم‌استون (Limestone)', category:'landscape', color:'#dcd3bc', grain:true, desc:'مناسب نمای داخلی و دیوارهای دکوراتیو در فضاهای کم‌بارش.'},
  {key:'slate', label:'اسلیت (Slate)', category:'landscape', color:'#4a5158', grain:true, desc:'مناسب دیوارهای دکوراتیو، شومینه، آبنما و نمای مدرن.'},
  {key:'quartzite', label:'کوارتزیت (Quartzite)', category:'landscape', color:'#9ba3a6', grain:true, desc:'بسیار مقاوم در برابر سایش و شرایط جوی؛ مناسب نما، کف محوطه و پله‌های بیرونی.'},
  {key:'basalt', label:'بازالت (Basalt)', category:'landscape', color:'#4b4b4b', grain:true, desc:'سنگی بسیار مقاوم برای پیاده‌رو، محوطه، حیاط، رمپ و فضاهای پرتردد بیرونی.'},
];
function stoneImage(key){ return '/images/stones/' + key + '.jpg'; }

function renderStoneGuide(){
  const area = document.getElementById('stoneGuideArea');
  if(!currentUser || currentUser.role !== 'buyer'){
    area.innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های خریدار در دسترس است. <a style="color:var(--safety-yellow); cursor:pointer" onclick="showPage('auth')">ورود / ثبت‌نام</a></div>`;
    return;
  }
  area.innerHTML = STONE_CATEGORIES.map(cat=>`
    <div class="page-head" style="margin-top:20px; margin-bottom:18px;"><h2 style="font-size:1.2rem;">${cat.label}</h2></div>
    <div class="stone-grid">
      ${STONE_CATALOG.filter(s=>s.category===cat.key).map(s=>`
        <div class="stone-card">
          <img src="${stoneImage(s.key)}" alt="${s.label}" class="stone-swatch">
          <div class="stone-info">
            <b>${s.label}</b>
            <p>${s.desc}</p>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

let selectedMockupImage = null;
let selectedMockupImageEl = null;

function initMockupPage(){
  document.getElementById('mockupMsg').innerHTML = '';
  document.getElementById('mockupCompare').style.display = 'none';
  const gate = document.getElementById('mockupFormBody');
  if(!currentUser || currentUser.role !== 'buyer'){
    gate.style.display = 'none';
    document.getElementById('mockupMsg').innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های خریدار در دسترس است. <a style="color:var(--safety-yellow); cursor:pointer" onclick="showPage('auth')">ورود / ثبت‌نام</a></div>`;
    return;
  }
  gate.style.display = 'block';
  const sel = document.getElementById('mockupMaterial');
  if(!sel.dataset.loaded){
    sel.innerHTML = STONE_CATEGORIES.map(cat=>`
      <optgroup label="${cat.label}">
        ${STONE_CATALOG.filter(s=>s.category===cat.key).map(s=>`<option value="${s.key}">${s.label}</option>`).join('')}
      </optgroup>`).join('');
    sel.dataset.loaded = '1';
  }
}

function handleMockupImageSelect(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1024;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      selectedMockupImage = canvas.toDataURL('image/png');
      selectedMockupImageEl = img;
      const btn = document.getElementById('mockupGenerateBtn');
      btn.disabled = false;
      btn.textContent = 'تولید شبیه‌سازی';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Free, local, instant "mockup": tints/textures the whole photo toward the
// chosen material using canvas blend modes. This is a simplified visual
// simulation (no real wall/window segmentation) — not true AI image editing,
// but works instantly, offline, and with zero API cost.
function applyLocalMaterialBlend(material){
  const canvas = document.createElement('canvas');
  canvas.width = selectedMockupImageEl.width;
  canvas.height = selectedMockupImageEl.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(selectedMockupImageEl, 0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = material.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if(material.grain){
    const grain = document.createElement('canvas');
    grain.width = canvas.width; grain.height = canvas.height;
    const gctx = grain.getContext('2d');
    const imgData = gctx.createImageData(canvas.width, canvas.height);
    for(let i=0; i<imgData.data.length; i+=4){
      const v = 128 + (Math.random()-0.5)*70;
      imgData.data[i]=v; imgData.data[i+1]=v; imgData.data[i+2]=v; imgData.data[i+3]=22;
    }
    gctx.putImageData(imgData, 0, 0);
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(grain, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

function generateMockup(){
  if(!selectedMockupImage || !selectedMockupImageEl) return;
  const materialKey = document.getElementById('mockupMaterial').value;
  const material = STONE_CATALOG.find(m=>m.key===materialKey);
  const msg = document.getElementById('mockupMsg');
  const compare = document.getElementById('mockupCompare');
  const afterWrap = document.getElementById('mockupAfterWrap');

  msg.innerHTML = `<div class="form-msg">این یک شبیه‌سازی ساده و رایگان است (رنگ و بافت سنگ روی کل عکس اعمال می‌شود) — نه تشخیص هوشمند دیوار با هوش مصنوعی واقعی.</div>`;
  document.getElementById('mockupBeforeImg').src = selectedMockupImage;
  compare.style.display = 'grid';

  const resultDataUrl = applyLocalMaterialBlend(material);
  afterWrap.innerHTML = `<img src="${resultDataUrl}" alt="نمای شبیه‌سازی‌شده">`;
}

/* ---------- ACCOUNT PANEL ---------- */
async function renderAccountPage(){
  const area = document.getElementById('accountArea');
  if(!currentUser){
    area.innerHTML = `<div class="form-msg">برای دیدن حساب کاربری ابتدا <a style="color:var(--safety-yellow); cursor:pointer" onclick="showPage('auth')">وارد شوید</a>.</div>`;
    return;
  }

  const isSupplier = currentUser.role === 'supplier';

  area.innerHTML = `
    <div class="form-card wide">
      <div class="detail-row"><span>نام</span><span>${currentUser.name}</span></div>
      <div class="detail-row"><span>شماره موبایل</span><span>${currentUser.phone}</span></div>
      <div class="detail-row"><span>شهر</span><span>${currentUser.city || '—'}</span></div>
      <div class="detail-row"><span>نوع حساب</span><span>${isSupplier ? 'تأمین‌کننده' : 'خریدار'}</span></div>
      ${isSupplier ? `<div class="detail-row"><span>نام شرکت/کارخانه</span><span>${currentUser.company_name || '—'}</span></div>` : ''}
    </div>

    <div class="form-card wide" style="margin-top:26px; text-align:center;">
      <button class="btn btn-danger" onclick="logout()">خروج از حساب</button>
    </div>
  `;
}

/* ---------- ADDRESSES (buyer, own page) ---------- */
function resetAddressForm(){
  const msg = document.getElementById('addressMsg');
  if(msg) msg.innerHTML = '';
  const card = document.getElementById('addrFormCard');
  if(card) card.style.display = 'none';
  editingAddressId = null;
  const submitBtn = document.getElementById('addrFormSubmitBtn');
  if(submitBtn) submitBtn.textContent = 'افزودن آدرس';
  const titleEl = document.getElementById('addrFormTitle');
  if(titleEl) titleEl.textContent = 'ثبت آدرس جدید';
  const toggleBtn = document.getElementById('newAddrToggleBtn');
  if(!toggleBtn) return;
  toggleBtn.style.display = (currentUser && currentUser.role === 'buyer') ? 'inline-block' : 'none';
}

function toggleNewAddressForm(){
  if(!currentUser || currentUser.role !== 'buyer'){
    showPage('auth');
    return;
  }
  const card = document.getElementById('addrFormCard');
  const isHidden = card.style.display === 'none';
  if(isHidden){
    editingAddressId = null;
    document.getElementById('newAddrLabel').value = '';
    document.getElementById('newAddrText').value = '';
    document.getElementById('addrFormSubmitBtn').textContent = 'افزودن آدرس';
    document.getElementById('addrFormTitle').textContent = 'ثبت آدرس جدید';
  }
  card.style.display = isHidden ? 'block' : 'none';
  if(isHidden) card.scrollIntoView({behavior:'smooth', block:'start'});
}

async function renderAddressList(){
  const area = document.getElementById('addressListArea');
  if(!area) return;
  if(!currentUser || currentUser.role !== 'buyer'){
    area.innerHTML = `<div class="form-msg">این بخش فقط برای حساب‌های خریدار در دسترس است.</div>`;
    return;
  }
  const list = await api('/api/addresses?userId=' + currentUser.id);
  if(list.length===0){
    area.innerHTML = `<div class="empty-state">هنوز آدرسی ثبت نکرده‌اید. <br><button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="toggleNewAddressForm()">ثبت آدرس جدید</button></div>`;
    return;
  }
  window._myAddresses = list;
  area.innerHTML = list.map(a=>`
    <div class="cart-item">
      <div class="ci-info"><b>${a.label}</b><span>${a.fullAddress}</span></div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="startEditAddress('${a.id}')">ویرایش</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAddress('${a.id}')">حذف</button>
      </div>
    </div>`).join('');
}

let editingAddressId = null;

function startEditAddress(id){
  const addr = (window._myAddresses || []).find(a=>a.id === id);
  if(!addr) return;
  editingAddressId = id;
  document.getElementById('newAddrLabel').value = addr.label;
  document.getElementById('newAddrText').value = addr.fullAddress;
  document.getElementById('addrFormSubmitBtn').textContent = 'ذخیره تغییرات';
  document.getElementById('addrFormTitle').textContent = 'ویرایش آدرس';
  const card = document.getElementById('addrFormCard');
  card.style.display = 'block';
  card.scrollIntoView({behavior:'smooth', block:'start'});
}

async function saveAddress(){
  const label = document.getElementById('newAddrLabel').value.trim();
  const fullAddress = document.getElementById('newAddrText').value.trim();
  const msg = document.getElementById('addressMsg');
  if(!label || !fullAddress){
    msg.innerHTML = `<div class="form-msg error">لطفاً برچسب و متن آدرس را وارد کنید.</div>`;
    return;
  }
  try{
    if(editingAddressId){
      await api(`/api/addresses/${editingAddressId}`, {method:'PUT', body: JSON.stringify({userId: currentUser.id, label, fullAddress})});
      msg.innerHTML = `<div class="form-msg ok">آدرس ویرایش شد.</div>`;
    }else{
      await api('/api/addresses', {method:'POST', body: JSON.stringify({userId: currentUser.id, label, fullAddress})});
      msg.innerHTML = `<div class="form-msg ok">آدرس اضافه شد.</div>`;
    }
    document.getElementById('newAddrLabel').value = '';
    document.getElementById('newAddrText').value = '';
    editingAddressId = null;
    document.getElementById('addrFormSubmitBtn').textContent = 'افزودن آدرس';
    document.getElementById('addrFormTitle').textContent = 'ثبت آدرس جدید';
    await renderAddressList();
    setTimeout(()=>{ const card = document.getElementById('addrFormCard'); if(card) card.style.display = 'none'; }, 900);
  }catch(e){
    msg.innerHTML = `<div class="form-msg error">${e.message}</div>`;
  }
}

async function deleteAddress(id){
  try{
    await api(`/api/addresses/${id}?userId=${currentUser.id}`, {method:'DELETE'});
    await renderAddressList();
  }catch(e){
    alert(e.message);
  }
}

/* ---------- Material ripple interaction ---------- */
(function initRipple(){
  const RIPPLE_SELECTOR = '.btn, .nav-btn, .cat-card, .prod-card, .rfq-card, .stone-card, .feature-card';
  document.addEventListener('pointerdown', (e)=>{
    const target = e.target.closest(RIPPLE_SELECTOR);
    if(!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size/2) + 'px';
    span.style.top = (e.clientY - rect.top - size/2) + 'px';
    target.appendChild(span);
    span.addEventListener('animationend', ()=> span.remove());
  });
})();

init();
