// db.js — SQLite data layer for BanaPlus
// Uses Node's built-in `node:sqlite` module (no npm install required).
// Requires Node.js v22.5+ (ships behind an experimental flag on some builds;
// if you get an error, re-run with: node --experimental-sqlite server.js)

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'banaplus.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  city TEXT,
  role TEXT NOT NULL DEFAULT 'buyer',
  company_name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  seller_name TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  price INTEGER NOT NULL,
  unit TEXT NOT NULL,
  qty INTEGER NOT NULL,
  city TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  image_url TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  address TEXT,
  subtotal INTEGER,
  commission INTEGER,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_confirmation',
  tracking_code TEXT,
  reviewed_at INTEGER,
  request_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  supplier_id TEXT,
  title TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  fulfillment_status TEXT NOT NULL DEFAULT 'preparing'
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  qty INTEGER NOT NULL,
  unit TEXT NOT NULL,
  city TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  accepted_offer_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(request_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  full_address TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- کدهای یک‌بارمصرف (OTP) پیامکی برای ورود و ثبت‌نام
CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,      -- 'login' یا 'register'
  code TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (phone, purpose)
);
`);

// Seed demo data on first run only
const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (productCount === 0) {
  const seed = [
    ['p1', 'demo-seller', 'کارخانه فرآوری سنگ نیریز', 'stone', 'تراورتن نیریز عسلی', 850000, 'متر مربع', 200, 'نیریز', 'تراورتن درجه یک، ضخامت ۲ سانتی‌متر، مناسب نمای ساختمان.', '🪨'],
    ['p2', 'demo-seller', 'بنکداری مرکزی اصفهان', 'cement', 'سیمان تیپ ۲', 3200000, 'تن', 50, 'اصفهان', 'سیمان پاکتی، تحویل درب کارخانه یا با باربری.', '🧱'],
    ['p3', 'demo-seller', 'گروه صنعتی زاگرس', 'rebar', 'میلگرد آجدار A3 سایز ۱۴', 28500000, 'تن', 20, 'اهواز', 'استاندارد ملی، آنالیز شیمیایی موجود است.', '🔩'],
    ['p4', 'demo-seller', 'سرام پخش شرق', 'tile', 'کاشی دیوار پذیرایی طرح مرمر', 410000, 'متر مربع', 600, 'یزد', 'سایز ۶۰×۶۰، درجه یک، موجودی انبار کافی.', '🀄'],
  ];
  const insert = db.prepare(`INSERT INTO products (id, seller_id, seller_name, category, title, price, unit, qty, city, description, icon, view_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = Date.now();
  seed.forEach((row, i) => insert.run(...row, 0, now - (seed.length - i) * 86400000));
}

module.exports = db;
