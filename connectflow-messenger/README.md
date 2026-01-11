# ConnectFlow Messenger 🌟

تطبيق مراسلة فورية متكامل يشبه WhatsApp، مبني بتقنيات حديثة ويدعم جميع الميزات الأساسية.

## المميزات ✨

- **المحادثات الفورية** - تواصل مع أصدقائك بشكل فوري
- **المجموعات** - أنشئ مجموعات للمحادثات الجماعية
- **الحالات** - شارك لحظاتك مع أصدقائك
- **المكالمات** - مكالمات صوتية ومرئية
- **مشاركة الوسائط** - صور، ملفات، رسائل صوتية
- **الوضع الداكن** - واجهة مريحة للعين
- **الأمان** - تشفير JWT والمصادقة الآمنة

## التقنيات المستخدمة 🛠️

### الواجهة الأمامية
- HTML5, CSS3, JavaScript (Vanilla)
- Socket.io Client
- Font Awesome Icons
- Google Fonts (Cairo)

### الخادم الخلفي
- Node.js + Express
- Socket.io (WebSockets)
- NeDB (Database)
- JWT (Authentication)
- Multer (File Uploads)

## البدء السريع 🚀

### المتطلبات
- Node.js 18 أو أحدث
- npm أو yarn

### التثبيت المحلي

```bash
# استنساخ المشروع
git clone https://github.com/elias0878/connectflow-messenger.git
cd connectflow-messenger

# تثبيت الاعتماديات
npm install

# تشغيل الخادم
npm start
```

افتح المتصفح على `http://localhost:3000`

## النشر على المنصات السحابية ☁️

### الخيار 1: Render (مجاني)

1. اذهب إلى [Render Dashboard](https://dashboard.render.com)
2. سجّل الدخول بحساب GitHub
3. اضغط "New +" ثم اختر "Web Service"
4. اختر هذا المستودع
5. الإعدادات:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free
6. اضغط "Create Web Service"

### الخيار 2: Railway

```bash
# تثبيت Railway CLI
npm install -g @railway/cli

# تسجيل الدخول
railway login

# ربط المشروع
railway init

# نشر
railway up
```

### الخيار 3: Docker

```bash
# بناء الصورة
docker build -t connectflow-messenger .

# تشغيل الحاوية
docker run -d -p 3000:3000 --name connectflow connectflow-messenger
```

أو باستخدام Docker Compose:

```bash
docker-compose up -d
```

### الخيار 4: VPS/Server

```bash
# الاتصال بالخادم
ssh user@your-server-ip

# تثبيت Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# استنساخ المشروع
git clone https://github.com/elias0878/connectflow-messenger.git
cd connectflow-messenger

# التثبيت والتشغيل
npm install
npm install -g pm2
pm2 start server.js --name connectflow-messenger
pm2 startup
pm2 save

# إعداد Nginx (اختياري)
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/connectflow
```

إعداد Nginx:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## CI/CD مع GitHub Actions 🔄

المشروع يحتوي على ملف `.github/workflows/deploy.yml` للنشر التلقائي:

1. اذهب إلى GitHub → Settings → Secrets
2. أضف المفاتيح:
   - `RAILWAY_TOKEN` - توكن Railway
   - `RENDER_API_KEY` - مفتاح Render API
3. عند كل push للفرع الرئيسي، سيتم النشر تلقائياً

## هيكل المشروع 📁

```
connectflow-messenger/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions
├── data/                       # قاعدة البيانات (NeDB)
├── public/
│   ├── css/
│   │   └── style.css          # أنماط CSS
│   ├── js/
│   │   └── app.js             # تطبيق JavaScript
│   ├── avatars/               # صور الملفات الشخصية
│   └── index.html             # الصفحة الرئيسية
├── uploads/                   # الملفات المرفوعة
├── .env.example              # ملف الإعدادات
├── .github/workflows/        # GitHub Actions
├── Dockerfile               # Docker
├── docker-compose.yml       # Docker Compose
├── package.json            # npm
├── render.yaml             # Render
├── railway.json            # Railway
└── server.js               # الخادم الرئيسي
```

## المتغيرات البيئية 🌱

انسخ `.env.example` إلى `.env` وملأ القيم:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your_secret_key
CLIENT_URL=https://your-domain.com
```

## اختبار التطبيق 🧪

```bash
# تشغيل الاختبارات
npm test

# أو تشغيل الخادم والاختبار يدوياً
npm start
# افتح http://localhost:3000
```

## المساهمة 🤝

نرحب بمساهماتك! للمساهمة:

1. انسخ المشروع (`fork`)
2. أنشئ فرعاً جديداً (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. ادفع للفرع (`git push origin feature/amazing-feature`)
5. افتح Pull Request

## الترخيص 📄

هذا المشروع مرخص تحت MIT License - راجع ملف [LICENSE](LICENSE) للمزيد من التفاصيل.

## الدعم 💬

- **المشاكل**: [GitHub Issues](https://github.com/elias0878/connectflow-messenger/issues)
- **المستودع**: https://github.com/elias0878/connectflow-messenger

---

تم التطوير بـ ❤️ بواسطة MiniMax Agent
