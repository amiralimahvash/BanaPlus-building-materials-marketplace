let adminPassword = sessionStorage.getItem('sm_admin_pass') || '';
let currentFilter = 'awaiting_confirmation';

function toFaNum(n){ return Number(n).toLocaleString('fa-IR'); }

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: {'Content-Type': 'application/json'}, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطای ناشناخته سرور');
  return data;
}

async function adminLogin(){
  const pass = document.getElementById('adminPassword').value;
  const msg = document.getElementById('loginMsg');
  try{
    await api('/api/admin/login', {method:'POST', body: JSON.stringify({password: pass})});
    adminPassword = pass;
    sessionStorage.setItem('sm_admin_pass', pass);
    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadOrders();
  }catch(e){
    msg.innerHTML = `<div class="form-msg error">${e.message}</div>`;
  }
}

function setFilter(status){
  currentFilter = status;
  document.querySelectorAll('.filter-row .btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.filter-row .btn[data-status="${status}"]`).classList.add('active');
  loadOrders();
}

async function loadOrders(){
  const list = document.getElementById('ordersList');
  list.innerHTML = `<div class="loading">در حال بارگذاری...</div>`;
  try{
    const qs = currentFilter ? `&status=${currentFilter}` : '';
    const orders = await api(`/api/admin/orders?password=${encodeURIComponent(adminPassword)}${qs}`);
    if(orders.length===0){ list.innerHTML = `<div class="empty-state">سفارشی در این وضعیت وجود ندارد.</div>`; return; }
    list.innerHTML = orders.map(o=>`
      <div class="order-card">
        <div class="oc-head">
          <b>${o.id}</b>
          <span class="status-pill ${statusClass(o.status)}">${statusLabel(o.status)}</span>
        </div>
        <div class="detail-row"><span>خریدار</span><span>${o.buyerName} (${o.buyerId})</span></div>
        <div class="detail-row"><span>اقلام</span><span>${o.items.map(i=>i.title+' ×'+toFaNum(i.qty)).join('، ')}</span></div>
        <div class="detail-row"><span>مبلغ کل</span><span>${toFaNum(o.total)} تومان</span></div>
        <div class="detail-row"><span>شماره پیگیری واریزی</span><span style="font-family:var(--font-tag)">${o.trackingCode || '—'}</span></div>
        ${o.status==='awaiting_confirmation' ? `
        <div class="oc-actions">
          <button class="btn btn-primary btn-sm" onclick="reviewOrder('${o.id}','confirmed')">تأیید پرداخت</button>
          <button class="btn btn-danger btn-sm" onclick="reviewOrder('${o.id}','rejected')">رد سفارش</button>
        </div>` : ''}
      </div>`).join('');
  }catch(e){
    list.innerHTML = `<div class="form-msg error">${e.message}</div>`;
  }
}

function statusLabel(s){
  return {awaiting_confirmation:'در انتظار تأیید', confirmed:'تأییدشده', rejected:'ردشده'}[s] || s;
}
function statusClass(s){
  return {awaiting_confirmation:'status-awaiting', confirmed:'status-confirmed', rejected:'status-rejected'}[s] || 'status-awaiting';
}

async function reviewOrder(id, status){
  try{
    await api(`/api/admin/orders/${id}?password=${encodeURIComponent(adminPassword)}`, {method:'PATCH', body: JSON.stringify({status})});
    loadOrders();
  }catch(e){
    alert(e.message);
  }
}

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
  const btn = document.getElementById('themeToggleBtn');
  if(btn) btn.textContent = isLight ? '☀️' : '🌙';
  // Header background is fixed dark chrome in both themes, so the logo
  // always uses the light-colored variant made for a dark background.
  const logo = document.getElementById('logoImg');
  if(logo) logo.src = '/images/logo-header.png';
}
applyThemeAssets();

if(adminPassword){
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  loadOrders();
}
