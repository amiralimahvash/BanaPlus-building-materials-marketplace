# بناپلاس (BanaPlus) — Building Materials Marketplace

<p align="center">
  <a href="#english">English</a> | <a href="#فارسی">فارسی</a>
</p>

---

<a id="english"></a>
## 🇬🇧 English

An online marketplace for buying and selling building materials (stone, tile, cement, rebar, gypsum, tools). Full-stack app: a real Node.js backend with a real on-disk SQLite database — no in-memory mocking, everything persists in `data/banaplus.db`.

### Tech stack
- **Backend:** Node's built-in `http` module — no framework (Express, etc.), so **zero npm dependencies**.
- **Database:** Node's built-in `node:sqlite` module (experimental, Node 22.5+) — a real file-based SQLite database.
- **Frontend:** Plain HTML/CSS/JS, single-page app, talks to the backend only through `fetch` calls to `/api/*`.
- **SMS OTP:** phone verification via the sms.ir Verify API for login/registration.
- **AI facade simulation:** local canvas-based color/texture blending by default; an OpenAI Images API (`gpt-image-1`) integration is wired up server-side but not currently called from the frontend.

### Prerequisites
Node.js **v22.5 or newer** (for the built-in `node:sqlite` module):
```bash
node --version
```
If your version is older, update from nodejs.org. No external SQLite package (`sqlite3`, `better-sqlite3`, etc.) is needed.

### Setup & run
```bash
cd sakhtmart-app
node server.js
```
Then open **http://localhost:3000**.

If you hit a sqlite-related error on Node 22.5–22.9, try:
```bash
node --experimental-sqlite server.js
```
For auto-restart during development:
```bash
npm run dev
```

### Project structure
```
sakhtmart-app/
├── server.js          # Raw HTTP server (no Express) + all REST API routes
├── db.js              # Table definitions + node:sqlite connection, demo data seeding
├── config.js          # Editable settings: payment card, admin password, SMS/AI API keys
├── package.json
├── data/              # SQLite database file (created/updated on first run) — gitignored
└── public/
    ├── index.html     # Storefront SPA shell
    ├── admin.html     # Admin panel shell
    ├── style.css      # Styling
    ├── app.js         # Frontend logic — talks to the backend purely via fetch("/api/...")
    ├── admin.js        # Admin panel logic
    └── images/         # Stone photos, category icons, logos
```

### Database schema
SQLite tables: `users`, `products`, `cart_items`, `orders`, `order_items`, `requests` (RFQs), `offers`, `addresses`, `otp_codes`. Four demo listings (stone, cement, rebar, tile) are seeded automatically on first run so the storefront isn't empty.

### API reference

**Products**
| Method | Path | Description |
|---|---|---|
| GET | `/api/products?category=&q=&sellerId=` | List/filter listings |
| GET | `/api/products/:id` | Listing detail |
| POST | `/api/products` | Create a listing |
| DELETE | `/api/products/:id?sellerId=` | Delete a listing (owner only) |

**Auth (phone + SMS OTP)**
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/otp/send` | Send a one-time SMS code for login or registration |
| POST | `/api/auth/register` | Register with name, phone, role, and the OTP code |
| POST | `/api/auth/login` | Log in with phone + OTP code |

**Cart**
| Method | Path | Description |
|---|---|---|
| GET | `/api/cart/:userId` | View cart |
| POST | `/api/cart/:userId` | Add item `{productId, qty}` |
| DELETE | `/api/cart/:userId/:productId` | Remove item |

**Checkout & orders**
| Method | Path | Description |
|---|---|---|
| GET | `/api/payment-info` | Get the card-transfer payment details |
| GET | `/api/commission-rates` | Get platform commission rates by category |
| POST | `/api/checkout` | Place an order with a bank tracking code |
| GET | `/api/orders/:userId` | A buyer's orders |
| GET | `/api/supplier/orders` | A supplier's incoming orders |
| PATCH | `/api/supplier/order-items/:id` | Advance a line item's fulfillment status |

**RFQ / reverse-auction quotes**
| Method | Path | Description |
|---|---|---|
| GET | `/api/price-range/:category` | Suggested price range from existing listings |
| POST | `/api/requests` | Buyer creates a quote request |
| DELETE | `/api/requests/:id` | Buyer cancels a request |
| GET | `/api/requests?buyerId=` | A buyer's own requests |
| GET | `/api/requests/open?category=` | Open requests visible to suppliers (blind — no rival prices shown) |
| GET | `/api/requests/:id/my-offer?supplierId=` | A supplier's own latest offer |
| GET | `/api/requests/:id` | Request detail + all offers (buyer only) |
| POST | `/api/requests/:id/offers` | Submit or lower an offer |
| GET | `/api/offers/:id` | Get a single offer (for checkout) |
| POST | `/api/requests/:id/checkout` | Accept an offer and proceed to payment |

**Addresses**
| Method | Path | Description |
|---|---|---|
| GET | `/api/addresses?userId=` | List a user's saved addresses |
| POST | `/api/addresses` | Add an address `{userId, label, fullAddress}` |
| PUT | `/api/addresses/:id` | Update an address |
| DELETE | `/api/addresses/:id?userId=` | Delete an address (owner only) |

**Admin**
| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/login` | Admin login `{password}` |
| GET | `/api/admin/orders?password=&status=` | List orders for review |
| PATCH | `/api/admin/orders/:id?password=` | Approve/reject an order |

**Facade mockup**
| Method | Path | Description |
|---|---|---|
| GET | `/api/mockup/materials` | List available materials for the visualizer |
| POST | `/api/mockup/generate` | (Wired but unused by the frontend) OpenAI-based mockup generation |

### Key features
- **Stone selection guide:** 30 real building stones across 6 categories (facade, flooring, high-traffic areas, luxury/decorative, bathroom/interior, and specialty facade stones like sandstone, limestone, slate, quartzite, basalt), each with a real photo and usage notes.
- **Facade visualizer:** buyer uploads a photo of their building facade and previews a stone/material color-blend. Runs free and fully client-side (canvas) by default; a real OpenAI Images API integration exists server-side for a future, more realistic version.
- **RFQ / reverse-auction:** instead of buying at a listed price, a buyer can post a quote request; suppliers submit blind offers (they only see the current lowest price, never who submitted it); the buyer sees all offers with supplier company names and picks any one.
- **Order fulfillment tracking:** suppliers move each order line through `preparing → packing → shipping → delivered` (no going backward); buyers see live status.
- **Light/dark theme toggle**, persisted per browser.
- **Guest access:** unauthenticated visitors only see Home, Shop, and Cart; buyer/supplier-specific sections appear after login based on role.
- **Card-to-card payment with manual admin approval:** buyer transfers manually, enters a tracking code, and the order sits as "awaiting confirmation" until an admin approves or rejects it via `/admin.html`.

### Configuration before going live
Edit `config.js`:
```js
payment: {
  cardNumber: '...',      // your real card number
  cardHolder: '...',
  bankName: '...',
},
adminPassword: '...',     // pick something stronger than the default
```
Also set real API keys for `sms` / `aiMockup` if you want live OTP SMS and/or AI-based facade mockups (both optional — the app works without them, though OTP login won't function without a working SMS provider key).

### Resetting the database
```bash
rm data/banaplus.db data/banaplus.db-shm data/banaplus.db-wal
node server.js
```

### What's real vs. current limitations
- ✅ Real on-disk SQLite database with real relational tables and real SQL queries.
- ✅ Real REST API, testable directly with curl/Postman.
- ✅ Data persists across server restarts.
- ✅ Real SMS OTP verification for login/registration (via sms.ir).
- ⚠️ Payment is manual card-to-card with admin approval, not a real payment gateway/webhook integration.
- ⚠️ Session state lives in browser `localStorage`, not a signed server session/JWT.

### Team
Amirali Mahvash · Erfan Hajheidari · Nima Mehrayin — E-commerce course project, Computer Engineering Dept., instructor: Dr. Nourbahbahani.

---

<a id="فارسی"></a>
## 🇮🇷 فارسی

بازارگاه آنلاین خرید و فروش مصالح ساختمانی (سنگ، کاشی، سیمان، میلگرد، گچ، ابزار). یک اپلیکیشن واقعیِ کامل: سرور Node.js + پایگاه‌داده SQLite واقعی روی دیسک — هیچ داده‌ای شبیه‌سازی‌شده در حافظه نیست، همه‌چیز در `data/banaplus.db` ذخیره می‌شود.

### فناوری‌های استفاده‌شده
- **Backend:** ماژول درون‌ساخت `http` — بدون فریم‌ورک (Express و مشابه)، پس **صفر وابستگی npm**.
- **Database:** ماژول درون‌ساخت `node:sqlite` (نسخه‌ی experimental، Node 22.5 به بعد) — دیتابیس واقعی فایلی.
- **Frontend:** HTML/CSS/JS ساده، تک‌صفحه‌ای (SPA)، ارتباط با بک‌اند فقط از طریق `fetch` به `/api/*`.
- **پیامک OTP:** تأیید هویت با شماره موبایل از طریق سرویس sms.ir برای ورود/ثبت‌نام.
- **شبیه‌سازی نما:** به‌صورت پیش‌فرض ترکیب رنگ/بافت محلی با Canvas؛ اتصال به OpenAI Images API (`gpt-image-1`) در سمت سرور آماده است ولی فعلاً از فرانت‌اند صدا زده نمی‌شود.

### پیش‌نیاز
Node.js نسخه‌ی **۲۲.۵ یا بالاتر** (برای ماژول `node:sqlite`):
```bash
node --version
```
اگر نسخه‌ی شما قدیمی‌تر است، از nodejs.org به‌روزرسانی کنید. نیازی به پکیج خارجی SQLite نیست.

### اجرا
```bash
cd sakhtmart-app
node server.js
```
سپس در مرورگر باز کنید: **http://localhost:3000**

اگر در Node نسخه‌ی ۲۲.۵–۲۲.۹ با خطای sqlite مواجه شدید:
```bash
node --experimental-sqlite server.js
```
برای توسعه با ری‌استارت خودکار:
```bash
npm run dev
```

### ساختار پروژه
```
sakhtmart-app/
├── server.js          # سرور HTTP خام (بدون Express) + همه‌ی مسیرهای REST API
├── db.js              # تعریف جدول‌ها، اتصال node:sqlite، و درج داده‌ی نمونه
├── config.js          # تنظیمات قابل ویرایش: شماره کارت، رمز ادمین، کلیدهای API
├── package.json
├── data/              # فایل دیتابیس SQLite (در اولین اجرا ساخته می‌شود) — در .gitignore
└── public/
    ├── index.html     # پوسته‌ی SPA فروشگاه
    ├── admin.html     # پوسته‌ی پنل ادمین
    ├── style.css      # استایل
    ├── app.js         # منطق فرانت‌اند — فقط از طریق fetch("/api/...") با بک‌اند حرف می‌زند
    ├── admin.js       # منطق پنل ادمین
    └── images/        # عکس سنگ‌ها، آیکن دسته‌بندی‌ها، لوگوها
```

### ساختار دیتابیس
جدول‌های SQLite: `users`, `products`, `cart_items`, `orders`, `order_items`, `requests` (استعلام قیمت), `offers`, `addresses`, `otp_codes`. در اولین اجرا، ۴ آگهی نمونه (سنگ، سیمان، میلگرد، کاشی) به‌صورت خودکار درج می‌شود تا سایت خالی نباشد.

### نقشه‌ی API

**آگهی‌ها**
| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/products?category=&q=&sellerId=` | لیست آگهی‌ها با فیلتر |
| GET | `/api/products/:id` | جزئیات یک آگهی |
| POST | `/api/products` | ثبت آگهی جدید |
| DELETE | `/api/products/:id?sellerId=` | حذف آگهی (فقط توسط مالک) |

**احراز هویت (شماره موبایل + OTP پیامکی)**
| متد | مسیر | توضیح |
|---|---|---|
| POST | `/api/auth/otp/send` | ارسال کد یک‌بارمصرف برای ورود یا ثبت‌نام |
| POST | `/api/auth/register` | ثبت‌نام با نام، شماره موبایل، نقش، و کد OTP |
| POST | `/api/auth/login` | ورود با شماره موبایل + کد OTP |

**سبد خرید**
| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/cart/:userId` | مشاهده سبد خرید |
| POST | `/api/cart/:userId` | افزودن به سبد خرید `{productId, qty}` |
| DELETE | `/api/cart/:userId/:productId` | حذف از سبد خرید |

**پرداخت و سفارش‌ها**
| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/payment-info` | دریافت اطلاعات کارت‌به‌کارت |
| GET | `/api/commission-rates` | دریافت نرخ کارمزد پلتفرم بر اساس دسته |
| POST | `/api/checkout` | ثبت سفارش با شماره پیگیری بانکی |
| GET | `/api/orders/:userId` | سفارش‌های یک خریدار |
| GET | `/api/supplier/orders` | سفارش‌های ورودی یک تأمین‌کننده |
| PATCH | `/api/supplier/order-items/:id` | پیشروی وضعیت آماده‌سازی یک قلم سفارش |

**استعلام قیمت / حراج معکوس**
| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/price-range/:category` | بازه قیمتی راهنما بر اساس آگهی‌های موجود |
| POST | `/api/requests` | ثبت درخواست خرید توسط خریدار |
| DELETE | `/api/requests/:id` | لغو درخواست توسط خریدار |
| GET | `/api/requests?buyerId=` | درخواست‌های یک خریدار |
| GET | `/api/requests/open?category=` | درخواست‌های باز برای تأمین‌کننده (کور — بدون نمایش قیمت رقبا) |
| GET | `/api/requests/:id/my-offer?supplierId=` | آخرین پیشنهاد خودِ یک تأمین‌کننده |
| GET | `/api/requests/:id` | جزئیات درخواست + همه‌ی پیشنهادها (فقط خریدار) |
| POST | `/api/requests/:id/offers` | ثبت یا پایین‌آوردن پیشنهاد قیمت |
| GET | `/api/offers/:id` | دریافت یک پیشنهاد (برای پرداخت) |
| POST | `/api/requests/:id/checkout` | نهایی‌کردن یک پیشنهاد و ورود به پرداخت |

**آدرس‌ها**
| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/addresses?userId=` | لیست آدرس‌های ذخیره‌شده |
| POST | `/api/addresses` | افزودن آدرس `{userId, label, fullAddress}` |
| PUT | `/api/addresses/:id` | ویرایش آدرس |
| DELETE | `/api/addresses/:id?userId=` | حذف آدرس (فقط مالک) |

**ادمین**
| متد | مسیر | توضیح |
|---|---|---|
| POST | `/api/admin/login` | ورود ادمین `{password}` |
| GET | `/api/admin/orders?password=&status=` | لیست سفارش‌ها برای بررسی |
| PATCH | `/api/admin/orders/:id?password=` | تأیید/رد سفارش |

**شبیه‌سازی نما**
| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/mockup/materials` | لیست متریال‌های قابل انتخاب برای شبیه‌سازی |
| POST | `/api/mockup/generate` | (آماده ولی فعلاً استفاده‌نشده) تولید پیش‌نمایش با OpenAI |

### امکانات کلیدی
- **راهنمای انتخاب سنگ:** ۳۰ نوع سنگ ساختمانی واقعی در ۶ دسته (نما، کف، فضاهای پرتردد، لوکس/دکوراتیو، سرویس بهداشتی/داخلی، و سنگ‌های خاص نما مثل Sandstone، Limestone، Slate، Quartzite، Basalt)، هرکدام با عکس واقعی و توضیح کاربرد.
- **شبیه‌سازی نمای ساختمان:** خریدار عکس نمای خود را آپلود می‌کند و پیش‌نمایش ترکیب رنگ/بافت سنگ را می‌بیند. به‌صورت پیش‌فرض رایگان و کاملاً محلی (Canvas)؛ اتصال واقعی به OpenAI Images API هم در سرور آماده است.
- **استعلام قیمت / حراج معکوس:** به‌جای خرید مستقیم، خریدار می‌تواند درخواست ثبت کند؛ تأمین‌کنندگان به‌صورت کور پیشنهاد می‌دهند (فقط پایین‌ترین قیمت رقبا را می‌بینند، نه هویت رقیب)؛ خریدار همه‌ی پیشنهادها را با نام شرکت می‌بیند و هرکدام را که بخواهد انتخاب می‌کند.
- **پیگیری سفارش:** تأمین‌کننده هر قلم سفارش را از `آماده‌سازی → بسته‌بندی → ارسال → تحویل` جلو می‌برد (بدون بازگشت)؛ خریدار وضعیت را زنده می‌بیند.
- **پوسته‌ی روشن/تیره**، ذخیره‌شده در مرورگر.
- **دسترسی مهمان:** کاربر واردنشده فقط خانه، خرید و سبد خرید را می‌بیند؛ بخش‌های خریدار/تأمین‌کننده پس از ورود و بر اساس نقش نمایش داده می‌شوند.
- **پرداخت کارت‌به‌کارت با تأیید دستی ادمین:** خریدار خودش واریز می‌کند، شماره پیگیری وارد می‌کند، و سفارش تا تأیید/رد توسط ادمین در `/admin.html` در وضعیت «در انتظار تأیید» می‌ماند.

### تنظیمات پیش از استفاده‌ی واقعی
فایل `config.js` را ویرایش کنید:
```js
payment: {
  cardNumber: '...',      // شماره کارت واقعی خودتان
  cardHolder: '...',
  bankName: '...',
},
adminPassword: '...',     // رمزی قوی‌تر از پیش‌فرض انتخاب کنید
```
برای فعال‌سازی واقعی پیامک OTP و/یا شبیه‌سازی نما با هوش مصنوعی، کلیدهای API واقعی را هم در `sms` و `aiMockup` جایگزین کنید (هر دو اختیاری‌اند — بدون آن‌ها هم اپ کار می‌کند، با این تفاوت که بدون کلید سرویس پیامک، ورود با OTP کار نخواهد کرد).

### بازنشانی پایگاه‌داده
```bash
rm data/banaplus.db data/banaplus.db-shm data/banaplus.db-wal
node server.js
```

### چه چیزی واقعی است و چه محدودیتی دارد
- ✅ دیتابیس واقعی SQLite روی دیسک، با جدول‌های رابطه‌ای و کوئری‌های SQL واقعی.
- ✅ API واقعی REST، قابل تست با curl/Postman.
- ✅ داده‌ها بین اجراهای مختلف سرور باقی می‌مانند.
- ✅ تأیید هویت واقعی با OTP پیامکی (از طریق sms.ir).
- ⚠️ پرداخت به‌صورت کارت‌به‌کارت با تأیید دستی ادمین است، نه اتصال واقعی به درگاه پرداخت/webhook.
- ⚠️ نشست کاربر در `localStorage` مرورگر نگه‌داری می‌شود، نه یک سشن امن/JWT سمت سرور.

### تیم
امیرعلی ماهوش · عرفان حاج حیدری · نیما مهرایین — پروژه‌ی درس تجارت الکترونیک، دانشکده مهندسی کامپیوتر، استاد درس: دکتر نوربهبهانی.
