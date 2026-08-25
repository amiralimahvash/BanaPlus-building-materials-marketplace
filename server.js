// server.js — BanaPlus backend
// Plain Node.js http server (no Express) + SQLite (node:sqlite), zero npm installs.
// Run with:  node server.js   (then open http://localhost:3000)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const db = require('./db.js');
const config = require('./config.js');

// Marketplace commission per category — tile/stone are higher-margin/discretionary
// items (per the business model), rebar is a thin-margin bulk commodity, others
// fall in between.
const COMMISSION_RATES = {
  stone: 0.03,
  tile: 0.03,
  rebar: 0.01,
  cement: 0.015,
  gypsum: 0.015,
  tools: 0.02,
};
const DEFAULT_COMMISSION_RATE = 0.02;
function commissionRateFor(category) {
  return COMMISSION_RATES[category] ?? DEFAULT_COMMISSION_RATE;
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function send(res, status, data, headers = {}) {
  const isJSON = typeof data !== 'string' && !Buffer.isBuffer(data);
  const body = isJSON ? JSON.stringify(data) : data;
  res.writeHead(status, {
    'Content-Type': isJSON ? 'application/json; charset=utf-8' : (headers['Content-Type'] || 'text/plain'),
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    const ext = path.extname(filePath);
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

/* ---------------- Product helpers ---------------- */
function rowToProduct(r) {
  return {
    id: r.id, sellerId: r.seller_id, sellerName: r.seller_name, category: r.category,
    title: r.title, price: r.price, unit: r.unit, qty: r.qty, city: r.city,
    desc: r.description, icon: r.icon, imageUrl: r.image_url, createdAt: r.created_at,
    views: r.view_count || 0, salesCount: r.sales_count || 0,
  };
}

const SALES_SUBQUERY = `(SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status = 'confirmed') AS sales_count`;

/* ---------------- Route handlers ---------------- */
const routes = [];
function route(method, pattern, handler) {
  // pattern like /api/products/:id -> regex with named groups
  const paramNames = [];
  const regexStr = '^' + pattern.replace(/:[^/]+/g, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  }) + '$';
  routes.push({ method, regex: new RegExp(regexStr), paramNames, handler });
}

route('GET', '/api/products', async (req, res, params, query) => {
  let sql = `SELECT p.*, ${SALES_SUBQUERY} FROM products p WHERE 1=1`;
  const args = [];
  if (query.category) { sql += ' AND p.category = ?'; args.push(query.category); }
  if (query.sellerId) { sql += ' AND p.seller_id = ?'; args.push(query.sellerId); }
  if (query.q) {
    sql += ' AND (p.title LIKE ? OR p.seller_name LIKE ? OR p.city LIKE ?)';
    const like = `%${query.q}%`;
    args.push(like, like, like);
  }
  sql += ' ORDER BY p.created_at DESC';
  const rows = db.prepare(sql).all(...args);
  send(res, 200, rows.map(rowToProduct));
});

route('GET', '/api/products/:id', async (req, res, params) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(params.id);
  if (!row) return send(res, 404, { error: 'محصول پیدا نشد' });
  db.prepare('UPDATE products SET view_count = view_count + 1 WHERE id = ?').run(params.id);
  const updated = db.prepare(`SELECT p.*, ${SALES_SUBQUERY} FROM products p WHERE p.id = ?`).get(params.id);
  send(res, 200, rowToProduct(updated));
});

route('POST', '/api/products', async (req, res) => {
  const b = await readBody(req);
  const required = ['sellerId', 'sellerName', 'category', 'title', 'price', 'unit', 'qty', 'city'];
  for (const f of required) if (!b[f] && b[f] !== 0) return send(res, 400, { error: `فیلد ${f} الزامی است` });
  const id = 'p_' + randomUUID();
  const now = Date.now();
  const icons = { stone: '🪨', cement: '🧱', gypsum: '⬜', rebar: '🔩', tile: '🀄', tools: '🛠️' };
  db.prepare(`INSERT INTO products (id, seller_id, seller_name, category, title, price, unit, qty, city, description, icon, image_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, b.sellerId, b.sellerName, b.category, b.title, Number(b.price), b.unit, Number(b.qty), b.city, b.desc || '', icons[b.category] || '📦', b.imageUrl || null, now);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  send(res, 201, rowToProduct(row));
});

route('DELETE', '/api/products/:id', async (req, res, params) => {
  const query = params._query || {};
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(params.id);
  if (!row) return send(res, 404, { error: 'محصول پیدا نشد' });
  if (query.sellerId && row.seller_id !== query.sellerId) return send(res, 403, { error: 'مجاز به حذف این آگهی نیستید' });
  db.prepare('DELETE FROM products WHERE id = ?').run(params.id);
  send(res, 200, { ok: true });
});

/* ---------------- Auth / OTP (پیامک تایید هویت با sms.ir) ---------------- */
const PHONE_RE = /^09\d{9}$/;

function generateOtpCode() {
  const len = config.sms.codeLength || 5;
  const min = 10 ** (len - 1);
  const max = 10 ** len - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

// ارسال پیامک تایید از طریق متد Verify سرویس sms.ir
// در Sandbox و Production، ساختار درخواست یکسان است و فقط نوع کلید API فرق دارد.
async function sendVerifySms(mobile, code) {
  const { apiUrl, apiKey, templateId } = config.sms;

  // اگر کلید API هنوز تنظیم نشده باشد (مقدار پیش‌فرض placeholder)، به‌جای خطا دادن،
  // کد را در کنسول سرور چاپ می‌کنیم تا توسعه‌دهنده بتواند بدون کلید واقعی هم تست کند.
  if (!apiKey || apiKey.includes('YOUR_')) {
    console.log(`⚠️  [SMS DEV MODE] کلید sms.ir تنظیم نشده — کد تایید برای ${mobile}: ${code}`);
    return { ok: true, dev: true };
  }

  // sms.ir شماره موبایل را بدون صفر ابتدایی می‌پذیرد (مطابق نمونه مستندات: 919xxxx904)
  const normalizedMobile = mobile.replace(/^0/, '');

  try {
    const smsRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/plain',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        mobile: normalizedMobile,
        templateId,
        parameters: [{ name: 'Code', value: code }],
      }),
    });
    const data = await smsRes.json().catch(() => ({}));
    if (!smsRes.ok || data.status !== 1) {
      return { ok: false, error: (data && data.message) || 'ارسال پیامک با خطا مواجه شد' };
    }
    return { ok: true, data: data.data };
  } catch (e) {
    return { ok: false, error: 'خطا در ارتباط با سرویس پیامک: ' + e.message };
  }
}

// ارسال کد تایید برای ورود یا ثبت‌نام
route('POST', '/api/auth/otp/send', async (req, res) => {
  const b = await readBody(req);
  const phone = (b.phone || '').trim();
  const purpose = b.purpose === 'login' ? 'login' : (b.purpose === 'register' ? 'register' : null);
  if (!PHONE_RE.test(phone)) return send(res, 400, { error: 'شماره موبایل معتبر نیست (مثال: 09123456789)' });
  if (!purpose) return send(res, 400, { error: 'نوع درخواست (purpose) نامعتبر است' });

  const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (purpose === 'register' && existing) return send(res, 409, { error: 'این شماره قبلاً ثبت‌نام کرده است' });
  if (purpose === 'login' && !existing) return send(res, 404, { error: 'کاربری با این شماره پیدا نشد. ابتدا ثبت‌نام کنید' });

  const now = Date.now();
  const prevOtp = db.prepare('SELECT * FROM otp_codes WHERE phone = ? AND purpose = ?').get(phone, purpose);
  const resendDelayMs = (config.sms.resendDelaySeconds || 60) * 1000;
  if (prevOtp && now - prevOtp.created_at < resendDelayMs) {
    const waitSec = Math.ceil((resendDelayMs - (now - prevOtp.created_at)) / 1000);
    return send(res, 429, { error: `لطفاً ${waitSec} ثانیه دیگر دوباره تلاش کنید` });
  }

  const code = generateOtpCode();
  const expiresAt = now + (config.sms.codeExpirySeconds || 120) * 1000;
  const result = await sendVerifySms(phone, code);
  if (!result.ok) return send(res, 502, { error: result.error });

  db.prepare(`INSERT INTO otp_codes (phone, purpose, code, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT(phone, purpose) DO UPDATE SET code = excluded.code, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`)
    .run(phone, purpose, code, expiresAt, now);

  send(res, 200, { ok: true, expiresIn: config.sms.codeExpirySeconds || 120, dev: !!result.dev });
});

// بررسی و مصرف کد تایید — خطاهای مشترک بین ورود و ثبت‌نام
function checkOtp(phone, purpose, code) {
  const row = db.prepare('SELECT * FROM otp_codes WHERE phone = ? AND purpose = ?').get(phone, purpose);
  if (!row) return { error: 'کدی برای این شماره ارسال نشده است' };
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM otp_codes WHERE phone = ? AND purpose = ?').run(phone, purpose);
    return { error: 'کد تایید منقضی شده است. دوباره درخواست دهید' };
  }
  const maxAttempts = config.sms.maxAttempts || 5;
  if (row.attempts >= maxAttempts) {
    db.prepare('DELETE FROM otp_codes WHERE phone = ? AND purpose = ?').run(phone, purpose);
    return { error: 'تعداد تلاش‌های مجاز به پایان رسید. دوباره درخواست کد دهید' };
  }
  if (row.code !== String(code || '').trim()) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ? AND purpose = ?').run(phone, purpose);
    return { error: 'کد تایید وارد شده صحیح نیست' };
  }
  db.prepare('DELETE FROM otp_codes WHERE phone = ? AND purpose = ?').run(phone, purpose);
  return { ok: true };
}

route('POST', '/api/auth/register', async (req, res) => {
  const b = await readBody(req);
  if (!b.name || !b.phone) return send(res, 400, { error: 'نام و شماره موبایل الزامی است' });
  if (!PHONE_RE.test(b.phone)) return send(res, 400, { error: 'شماره موبایل معتبر نیست (مثال: 09123456789)' });
  if (!b.otpCode) return send(res, 400, { error: 'کد تایید پیامکی الزامی است' });
  if (b.role === 'supplier' && !b.companyName) return send(res, 400, { error: 'برای تأمین‌کننده، نام کارخانه یا شرکت الزامی است' });
  const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(b.phone);
  if (existing) return send(res, 409, { error: 'این شماره قبلاً ثبت‌نام کرده است' });

  const otpResult = checkOtp(b.phone, 'register', b.otpCode);
  if (otpResult.error) return send(res, 400, { error: otpResult.error });

  const id = b.phone;
  db.prepare('INSERT INTO users (id, name, phone, city, role, company_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, b.name, b.phone, b.city || 'نامشخص', b.role || 'buyer', b.companyName || null, Date.now());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  send(res, 201, user);
});

route('POST', '/api/auth/login', async (req, res) => {
  const b = await readBody(req);
  if (!b.phone) return send(res, 400, { error: 'شماره موبایل الزامی است' });
  if (!b.otpCode) return send(res, 400, { error: 'کد تایید پیامکی الزامی است' });
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(b.phone);
  if (!user) return send(res, 404, { error: 'کاربری با این شماره پیدا نشد' });

  const otpResult = checkOtp(b.phone, 'login', b.otpCode);
  if (otpResult.error) return send(res, 400, { error: otpResult.error });

  send(res, 200, user);
});

/* ---------------- Cart ---------------- */
route('GET', '/api/cart/:userId', async (req, res, params) => {
  const rows = db.prepare(`
    SELECT c.product_id AS productId, c.qty, p.title, p.price, p.unit, p.category
    FROM cart_items c JOIN products p ON p.id = c.product_id
    WHERE c.user_id = ?`).all(params.userId);
  send(res, 200, rows);
});

route('POST', '/api/cart/:userId', async (req, res, params) => {
  const b = await readBody(req);
  if (!b.productId || !b.qty) return send(res, 400, { error: 'productId و qty الزامی است' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(b.productId);
  if (!product) return send(res, 404, { error: 'محصول پیدا نشد' });
  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(params.userId, b.productId);
  const currentCartQty = existing ? existing.qty : 0;
  const desiredQty = currentCartQty + Number(b.qty);
  if (desiredQty > product.qty) {
    return send(res, 400, { error: `موجودی کافی نیست. حداکثر موجودی قابل خرید: ${product.qty} ${product.unit}` });
  }
  if (existing) {
    db.prepare('UPDATE cart_items SET qty = qty + ? WHERE user_id = ? AND product_id = ?').run(b.qty, params.userId, b.productId);
  } else {
    db.prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)').run(params.userId, b.productId, b.qty);
  }
  send(res, 200, { ok: true });
});

route('DELETE', '/api/cart/:userId/:productId', async (req, res, params) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(params.userId, params.productId);
  send(res, 200, { ok: true });
});

/* ---------------- Price range helper (for buyer guidance, not a quote) ---------------- */
route('GET', '/api/price-range/:category', async (req, res, params) => {
  const row = db.prepare('SELECT MIN(price) AS min, MAX(price) AS max, COUNT(*) AS count FROM products WHERE category = ?').get(params.category);
  send(res, 200, { min: row.min || null, max: row.max || null, count: row.count || 0 });
});

/* ---------------- Requests (RFQ / reverse auction) ---------------- */
route('POST', '/api/requests', async (req, res) => {
  const b = await readBody(req);
  const required = ['buyerId', 'buyerName', 'category', 'title', 'qty', 'unit', 'city'];
  for (const f of required) if (!b[f] && b[f] !== 0) return send(res, 400, { error: `فیلد ${f} الزامی است` });
  const id = 'r_' + randomUUID();
  db.prepare(`INSERT INTO requests (id, buyer_id, buyer_name, category, title, description, qty, unit, city, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`)
    .run(id, b.buyerId, b.buyerName, b.category, b.title, b.description || '', Number(b.qty), b.unit, b.city, Date.now());
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
  send(res, 201, rowToRequest(row));
});

function rowToRequest(r) {
  return {
    id: r.id, buyerId: r.buyer_id, buyerName: r.buyer_name, category: r.category, title: r.title,
    description: r.description, qty: r.qty, unit: r.unit, city: r.city, status: r.status,
    acceptedOfferId: r.accepted_offer_id, createdAt: r.created_at,
  };
}

route('DELETE', '/api/requests/:id', async (req, res, params) => {
  const query = params._query || {};
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(params.id);
  if (!row) return send(res, 404, { error: 'درخواست پیدا نشد' });
  if (query.buyerId && row.buyer_id !== query.buyerId) return send(res, 403, { error: 'مجاز به حذف این درخواست نیستید' });
  if (row.status === 'closed') return send(res, 400, { error: 'درخواست‌های نهایی‌شده قابل حذف نیستند' });
  db.prepare('DELETE FROM offers WHERE request_id = ?').run(params.id);
  db.prepare('DELETE FROM requests WHERE id = ?').run(params.id);
  send(res, 200, { ok: true });
});

// Supplier browsing: open requests only. Suppliers can see the lowest price
// competitors are offering (as a number only — never who submitted it), so they
// know what they need to beat, without any names being revealed between suppliers.
// Supplier browsing: open requests only. Each request shows the overall lowest
// price submitted so far (anonymous — never whose it is) plus, if this supplier
// has already bid, their own last submitted price for direct comparison.
route('GET', '/api/requests/open', async (req, res, params, query) => {
  let sql = "SELECT * FROM requests WHERE status = 'open'";
  const args = [];
  if (query.category) { sql += ' AND category = ?'; args.push(query.category); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...args);
  const withPrices = rows.map((r) => {
    const lowestRow = db.prepare('SELECT MIN(price) AS m FROM offers WHERE request_id = ?').get(r.id);
    const lowestUnitPrice = lowestRow.m;
    let myOfferUnitPrice = null;
    if (query.supplierId) {
      const mine = db.prepare('SELECT price FROM offers WHERE request_id = ? AND supplier_id = ?').get(r.id, query.supplierId);
      myOfferUnitPrice = mine ? mine.price : null;
    }
    return {
      ...rowToRequest(r),
      lowestPrice: lowestUnitPrice, // kept for backward compat — represents the unit price
      lowestUnitPrice,
      lowestTotalPrice: lowestUnitPrice != null ? lowestUnitPrice * r.qty : null,
      myOfferPrice: myOfferUnitPrice,
      myOfferUnitPrice,
      myOfferTotalPrice: myOfferUnitPrice != null ? myOfferUnitPrice * r.qty : null,
    };
  });
  send(res, 200, withPrices);
});

// Supplier's own existing offer on a request (to prefill "update my offer")
route('GET', '/api/requests/:id/my-offer', async (req, res, params, query) => {
  if (!query.supplierId) return send(res, 400, { error: 'supplierId الزامی است' });
  const request = db.prepare('SELECT qty FROM requests WHERE id = ?').get(params.id);
  const offer = db.prepare('SELECT * FROM offers WHERE request_id = ? AND supplier_id = ?').get(params.id, query.supplierId);
  send(res, 200, offer ? rowToOffer(offer, request ? request.qty : null) : null);
});

// price = unit price (تومان به ازای هر واحد کالا). totalPrice is derived from the
// request's qty and is always price * qty — computed here, never stored twice.
function rowToOffer(o, qty) {
  const unitPrice = o.price;
  const totalPrice = qty != null ? unitPrice * qty : null;
  return { id: o.id, requestId: o.request_id, supplierId: o.supplier_id, supplierName: o.supplier_name, price: unitPrice, unitPrice, totalPrice, message: o.message, createdAt: o.created_at, updatedAt: o.updated_at };
}

// Buyer: list own requests
route('GET', '/api/requests', async (req, res, params, query) => {
  if (!query.buyerId) return send(res, 400, { error: 'buyerId الزامی است' });
  const rows = db.prepare('SELECT * FROM requests WHERE buyer_id = ? ORDER BY created_at DESC').all(query.buyerId);
  const withCounts = rows.map((r) => {
    const offerCount = db.prepare('SELECT COUNT(*) AS c FROM offers WHERE request_id = ?').get(r.id).c;
    return { ...rowToRequest(r), offerCount };
  });
  send(res, 200, withCounts);
});

// Buyer: request detail + full offers list (company/factory name shown, not the person's name)
route('GET', '/api/requests/:id', async (req, res, params) => {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(params.id);
  if (!row) return send(res, 404, { error: 'درخواست پیدا نشد' });
  const offerRows = db.prepare(`
    SELECT o.*, u.company_name AS company_name, u.name AS person_name
    FROM offers o LEFT JOIN users u ON u.id = o.supplier_id
    WHERE o.request_id = ? ORDER BY o.price ASC`).all(params.id);
  const offers = offerRows.map((o) => ({
    id: o.id, requestId: o.request_id, supplierId: o.supplier_id,
    supplierName: o.company_name || o.person_name || o.supplier_name,
    price: o.price, unitPrice: o.price, totalPrice: o.price * row.qty,
    message: o.message, createdAt: o.created_at, updatedAt: o.updated_at,
  }));
  send(res, 200, { ...rowToRequest(row), offers });
});

// Supplier: submit or update (lower) their offer — fully anonymous to other suppliers
route('POST', '/api/requests/:id/offers', async (req, res, params) => {
  const b = await readBody(req);
  if (!b.supplierId || !b.supplierName || !b.price) return send(res, 400, { error: 'supplierId، supplierName و price الزامی است' });
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(params.id);
  if (!request) return send(res, 404, { error: 'درخواست پیدا نشد' });
  if (request.status !== 'open') return send(res, 400, { error: 'این درخواست دیگر باز نیست' });
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM offers WHERE request_id = ? AND supplier_id = ?').get(params.id, b.supplierId);
  if (existing) {
    db.prepare('UPDATE offers SET price = ?, message = ?, updated_at = ? WHERE id = ?').run(Number(b.price), b.message || '', now, existing.id);
  } else {
    const offerId = 'of_' + randomUUID();
    db.prepare(`INSERT INTO offers (id, request_id, supplier_id, supplier_name, price, message, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(offerId, params.id, b.supplierId, b.supplierName, Number(b.price), b.message || '', now, now);
  }
  const saved = db.prepare('SELECT * FROM offers WHERE request_id = ? AND supplier_id = ?').get(params.id, b.supplierId);
  send(res, 200, rowToOffer(saved, request.qty));
});

// Fetch a single offer (used to confirm the exact current price right before payment)
route('GET', '/api/offers/:id', async (req, res, params) => {
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(params.id);
  if (!offer) return send(res, 404, { error: 'پیشنهاد پیدا نشد' });
  const request = db.prepare('SELECT qty, unit FROM requests WHERE id = ?').get(offer.request_id);
  const result = rowToOffer(offer, request ? request.qty : null);
  result.qty = request ? request.qty : null;
  result.unit = request ? request.unit : null;
  send(res, 200, result);
});

// Expose commission rates so the frontend can show buyers the same breakdown
// the server will use — server always recomputes independently, this is just
// for transparent display before payment.
route('GET', '/api/commission-rates', async (req, res) => {
  send(res, 200, { rates: COMMISSION_RATES, default: DEFAULT_COMMISSION_RATE });
});

// Buyer: accept an offer (any offer, not necessarily the lowest) and check out via card-to-card payment
route('POST', '/api/requests/:id/checkout', async (req, res, params) => {
  const b = await readBody(req);
  if (!b.buyerId || !b.offerId) return send(res, 400, { error: 'buyerId و offerId الزامی است' });
  if (!b.address || !b.address.trim()) return send(res, 400, { error: 'وارد کردن آدرس تحویل الزامی است' });
  if (!b.trackingCode || !b.trackingCode.trim()) return send(res, 400, { error: 'وارد کردن شماره پیگیری واریز الزامی است' });
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(params.id);
  if (!request) return send(res, 404, { error: 'درخواست پیدا نشد' });
  if (request.buyer_id !== b.buyerId) return send(res, 403, { error: 'این درخواست متعلق به شما نیست' });
  if (request.status !== 'open') return send(res, 400, { error: 'این درخواست قبلاً نهایی شده است' });
  const offer = db.prepare('SELECT * FROM offers WHERE id = ? AND request_id = ?').get(b.offerId, params.id);
  if (!offer) return send(res, 404, { error: 'پیشنهاد پیدا نشد' });

  const subtotal = offer.price;
  const rate = commissionRateFor(request.category);
  const commission = Math.round(subtotal * rate);
  const total = subtotal + commission;

  const orderId = 'o_' + randomUUID();
  db.prepare(`INSERT INTO orders (id, buyer_id, buyer_name, address, subtotal, commission, total, status, tracking_code, request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_confirmation', ?, ?, ?)`)
    .run(orderId, b.buyerId, request.buyer_name, b.address.trim(), subtotal, commission, total, b.trackingCode.trim(), params.id, Date.now());
  db.prepare('INSERT INTO order_items (id, order_id, product_id, supplier_id, title, price, qty) VALUES (?, ?, NULL, ?, ?, ?, 1)')
    .run('oi_' + randomUUID(), orderId, offer.supplier_id, `${request.title} (استعلام قیمت — تأمین‌کننده منتخب)`, subtotal);
  db.prepare("UPDATE requests SET status = 'closed', accepted_offer_id = ? WHERE id = ?").run(offer.id, params.id);

  send(res, 201, { id: orderId, subtotal, commission, total, status: 'awaiting_confirmation' });
});

/* ---------------- Payment info (card-to-card) ---------------- */
route('GET', '/api/payment-info', async (req, res) => {
  send(res, 200, config.payment);
});

/* ---------------- Checkout / Orders ---------------- */
route('POST', '/api/checkout', async (req, res) => {
  const b = await readBody(req);
  if (!b.userId) return send(res, 400, { error: 'userId الزامی است' });
  if (!b.address || !b.address.trim()) return send(res, 400, { error: 'وارد کردن آدرس تحویل الزامی است' });
  if (!b.trackingCode || !b.trackingCode.trim()) return send(res, 400, { error: 'وارد کردن شماره پیگیری واریز الزامی است' });
  const items = db.prepare(`
    SELECT c.product_id AS productId, c.qty, p.title, p.price, p.qty AS stock, p.unit, p.category, p.seller_id AS sellerId
    FROM cart_items c JOIN products p ON p.id = c.product_id
    WHERE c.user_id = ?`).all(b.userId);
  if (items.length === 0) return send(res, 400, { error: 'سبد خرید خالی است' });

  // Validate stock for every item before mutating anything
  for (const i of items) {
    if (i.qty > i.stock) {
      return send(res, 400, { error: `موجودی «${i.title}» کافی نیست (موجودی فعلی: ${i.stock} ${i.unit})` });
    }
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(b.userId);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const commission = items.reduce((s, i) => s + Math.round(i.price * i.qty * commissionRateFor(i.category)), 0);
  const total = subtotal + commission;
  const orderId = 'o_' + randomUUID();
  db.prepare(`INSERT INTO orders (id, buyer_id, buyer_name, address, subtotal, commission, total, status, tracking_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(orderId, b.userId, user ? user.name : b.userId, b.address.trim(), subtotal, commission, total, 'awaiting_confirmation', b.trackingCode.trim(), Date.now());
  const insertItem = db.prepare('INSERT INTO order_items (id, order_id, product_id, supplier_id, title, price, qty) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const decrementStock = db.prepare('UPDATE products SET qty = qty - ? WHERE id = ?');
  items.forEach((i) => {
    insertItem.run('oi_' + randomUUID(), orderId, i.productId, i.sellerId, i.title, i.price, i.qty);
    decrementStock.run(i.qty, i.productId);
  });
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(b.userId);
  send(res, 201, { id: orderId, subtotal, commission, total, status: 'awaiting_confirmation' });
});

route('GET', '/api/orders/:userId', async (req, res, params) => {
  const orders = db.prepare('SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC').all(params.userId);
  const withItems = orders.map((o) => ({
    id: o.id, address: o.address, subtotal: o.subtotal, commission: o.commission, total: o.total,
    status: o.status, trackingCode: o.tracking_code, createdAt: o.created_at,
    items: db.prepare('SELECT id, title, price, qty, fulfillment_status AS fulfillmentStatus FROM order_items WHERE order_id = ?').all(o.id),
  }));
  send(res, 200, withItems);
});

/* ---------------- Admin (manual payment review) ---------------- */
function checkAdmin(req, query) {
  const pass = query.password || req.headers['x-admin-password'];
  return pass === config.adminPassword;
}

route('POST', '/api/admin/login', async (req, res) => {
  const b = await readBody(req);
  if (b.password === config.adminPassword) return send(res, 200, { ok: true });
  return send(res, 401, { error: 'رمز عبور اشتباه است' });
});

route('GET', '/api/admin/orders', async (req, res, params, query) => {
  if (!checkAdmin(req, query)) return send(res, 401, { error: 'دسترسی غیرمجاز' });
  const status = query.status; // optional filter
  let sql = 'SELECT * FROM orders';
  const args = [];
  if (status) { sql += ' WHERE status = ?'; args.push(status); }
  sql += ' ORDER BY created_at DESC';
  const orders = db.prepare(sql).all(...args);
  const withItems = orders.map((o) => ({
    id: o.id, buyerId: o.buyer_id, buyerName: o.buyer_name, address: o.address,
    subtotal: o.subtotal, commission: o.commission, total: o.total, status: o.status,
    trackingCode: o.tracking_code, createdAt: o.created_at,
    items: db.prepare('SELECT title, price, qty FROM order_items WHERE order_id = ?').all(o.id),
  }));
  send(res, 200, withItems);
});

route('PATCH', '/api/admin/orders/:id', async (req, res, params, query) => {
  if (!checkAdmin(req, query)) return send(res, 401, { error: 'دسترسی غیرمجاز' });
  const b = await readBody(req);
  if (!['confirmed', 'rejected'].includes(b.status)) return send(res, 400, { error: 'وضعیت نامعتبر است' });
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(params.id);
  if (!row) return send(res, 404, { error: 'سفارش پیدا نشد' });
  if (row.status !== 'awaiting_confirmation') return send(res, 400, { error: 'این سفارش قبلاً بررسی شده است' });
  if (b.status === 'rejected') {
    const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(params.id);
    const restock = db.prepare('UPDATE products SET qty = qty + ? WHERE id = ?');
    items.forEach((i) => { if (i.product_id) restock.run(i.qty, i.product_id); });
  }
  db.prepare('UPDATE orders SET status = ?, reviewed_at = ? WHERE id = ?').run(b.status, Date.now(), params.id);
  send(res, 200, { ok: true });
});

/* ---------------- Saved addresses (buyer address book) ---------------- */
route('GET', '/api/addresses', async (req, res, params, query) => {
  if (!query.userId) return send(res, 400, { error: 'userId الزامی است' });
  const rows = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY created_at DESC').all(query.userId);
  send(res, 200, rows.map((r) => ({ id: r.id, label: r.label, fullAddress: r.full_address, createdAt: r.created_at })));
});

route('POST', '/api/addresses', async (req, res) => {
  const b = await readBody(req);
  if (!b.userId || !b.label || !b.fullAddress) return send(res, 400, { error: 'userId، label و fullAddress الزامی است' });
  const id = 'addr_' + randomUUID();
  db.prepare('INSERT INTO addresses (id, user_id, label, full_address, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, b.userId, b.label.trim(), b.fullAddress.trim(), Date.now());
  send(res, 201, { id, label: b.label.trim(), fullAddress: b.fullAddress.trim() });
});

route('PUT', '/api/addresses/:id', async (req, res, params) => {
  const b = await readBody(req);
  if (!b.userId || !b.label || !b.fullAddress) return send(res, 400, { error: 'userId، label و fullAddress الزامی است' });
  const row = db.prepare('SELECT * FROM addresses WHERE id = ?').get(params.id);
  if (!row) return send(res, 404, { error: 'آدرس پیدا نشد' });
  if (row.user_id !== b.userId) return send(res, 403, { error: 'این آدرس متعلق به شما نیست' });
  db.prepare('UPDATE addresses SET label = ?, full_address = ? WHERE id = ?')
    .run(b.label.trim(), b.fullAddress.trim(), params.id);
  send(res, 200, { id: params.id, label: b.label.trim(), fullAddress: b.fullAddress.trim() });
});

route('DELETE', '/api/addresses/:id', async (req, res, params, query) => {
  if (!query.userId) return send(res, 400, { error: 'userId الزامی است' });
  const row = db.prepare('SELECT * FROM addresses WHERE id = ?').get(params.id);
  if (!row) return send(res, 404, { error: 'آدرس پیدا نشد' });
  if (row.user_id !== query.userId) return send(res, 403, { error: 'این آدرس متعلق به شما نیست' });
  db.prepare('DELETE FROM addresses WHERE id = ?').run(params.id);
  send(res, 200, { ok: true });
});

/* ---------------- Supplier order fulfillment ---------------- */
const FULFILLMENT_STAGES = ['preparing', 'packaging', 'shipping', 'delivered'];

// Supplier: list order items belonging to them. Orders still awaiting admin
// confirmation are included too (read-only — orderStatus tells the front-end
// to show a "pending admin approval" badge and lock the stage-advance button),
// alongside orders already confirmed by the admin (payment verified).
route('GET', '/api/supplier/orders', async (req, res, params, query) => {
  if (!query.supplierId) return send(res, 400, { error: 'supplierId الزامی است' });
  const rows = db.prepare(`
    SELECT oi.id AS itemId, oi.title, oi.price, oi.qty, oi.fulfillment_status AS fulfillmentStatus,
           o.id AS orderId, o.buyer_name AS buyerName, o.address, o.created_at AS createdAt, o.status AS orderStatus
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.supplier_id = ? AND o.status IN ('awaiting_confirmation', 'confirmed')
    ORDER BY o.created_at DESC`).all(query.supplierId);
  send(res, 200, rows);
});

// Supplier: advance fulfillment status of one of their order items
route('PATCH', '/api/supplier/order-items/:id', async (req, res, params) => {
  const b = await readBody(req);
  if (!b.supplierId || !b.status) return send(res, 400, { error: 'supplierId و status الزامی است' });
  const idx = FULFILLMENT_STAGES.indexOf(b.status);
  if (idx === -1) return send(res, 400, { error: 'وضعیت نامعتبر است' });
  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(params.id);
  if (!item) return send(res, 404, { error: 'قلم سفارش پیدا نشد' });
  if (item.supplier_id !== b.supplierId) return send(res, 403, { error: 'این سفارش متعلق به شما نیست' });
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(item.order_id);
  if (!order || order.status !== 'confirmed') return send(res, 400, { error: 'این سفارش هنوز توسط ادمین تایید نشده است' });
  const currentIdx = FULFILLMENT_STAGES.indexOf(item.fulfillment_status);
  if (idx < currentIdx) return send(res, 400, { error: 'امکان بازگشت به مرحله قبلی وجود ندارد' });
  db.prepare('UPDATE order_items SET fulfillment_status = ? WHERE id = ?').run(b.status, params.id);
  send(res, 200, { ok: true });
});

/* ---------------- AI facade mockup (apply stone to a building photo) ---------------- */
// Descriptive prompts per material preset — kept in English since the image
// model follows detailed English prompts more reliably; label is shown to the user.
const MOCKUP_MATERIALS = {
  travertine_honey: { label: 'تراورتن عسلی', prompt: 'honey-beige travertine natural stone cladding, linear pattern, warm tones' },
  travertine_cream: { label: 'تراورتن کرم', prompt: 'cream white travertine natural stone cladding, elegant light tone' },
  marble_white: { label: 'مرمر سفید', prompt: 'polished white marble cladding with subtle grey veining' },
  granite_grey: { label: 'گرانیت خاکستری', prompt: 'dark grey granite stone cladding, coarse natural texture' },
  basalt_black: { label: 'بازالت مشکی', prompt: 'black basalt stone cladding, matte dark natural texture' },
  modern_tile: { label: 'کاشی مدرن نما', prompt: 'modern large-format porcelain tile facade cladding, light grey minimal look' },
};

route('GET', '/api/mockup/materials', async (req, res) => {
  send(res, 200, Object.entries(MOCKUP_MATERIALS).map(([key, v]) => ({ key, label: v.label })));
});

route('POST', '/api/mockup/generate', async (req, res) => {
  const b = await readBody(req);
  if (!b.imageBase64) return send(res, 400, { error: 'تصویر نمای ساختمان الزامی است' });
  if (!b.material || !MOCKUP_MATERIALS[b.material]) return send(res, 400, { error: 'نوع سنگ انتخاب‌شده نامعتبر است' });

  const apiKey = config.aiMockup && config.aiMockup.apiKey;
  if (!apiKey || apiKey.includes('YOUR_')) {
    return send(res, 400, { error: 'کلید API هوش مصنوعی تنظیم نشده است. مقدار aiMockup.apiKey را در فایل config.js وارد کنید.' });
  }

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(b.imageBase64);
  if (!match) return send(res, 400, { error: 'فرمت تصویر نامعتبر است' });
  const [, mimeType, base64Data] = match;

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: mimeType });
    const form = new FormData();
    form.append('image', blob, 'facade.png');
    form.append('model', config.aiMockup.model || 'gpt-image-1');
    form.append('prompt',
      `Apply realistic ${MOCKUP_MATERIALS[b.material].prompt} to the building facade walls in this photo. ` +
      `Keep the exact same architecture, windows, doors, proportions, camera angle, and lighting. ` +
      `Only change the wall surface material. Photorealistic result.`);
    form.append('size', '1024x1024');

    const aiRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      const msg = (data && data.error && data.error.message) || aiRes.statusText;
      return send(res, 502, { error: 'خطا از سرویس هوش مصنوعی: ' + msg });
    }
    const resultB64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!resultB64) return send(res, 502, { error: 'پاسخ نامعتبر از سرویس هوش مصنوعی دریافت شد.' });
    send(res, 200, { imageBase64: 'data:image/png;base64,' + resultB64 });
  } catch (e) {
    send(res, 500, { error: 'خطا در ارتباط با سرویس هوش مصنوعی: ' + e.message });
  }
});

/* ---------------- Server ---------------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());

    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const match = pathname.match(r.regex);
        if (!match) continue;
        const params = {};
        r.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
        params._query = query;
        try {
          return await r.handler(req, res, params, query);
        } catch (e) {
          console.error(e);
          return send(res, 500, { error: 'خطای سرور: ' + e.message });
        }
      }
      return send(res, 404, { error: 'مسیر API پیدا نشد' });
    }

    serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'خطای سرور' });
  }
});

server.listen(PORT,'0.0.0.0', () => {
  console.log(`✅ BanaPlus server running at http://localhost:${PORT}`);
  console.log(`   Database file: ${path.join(__dirname, 'data', 'banaplus.db')}`);
});
