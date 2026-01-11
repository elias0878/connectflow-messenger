#!/bin/bash

# ConnectFlow Messenger - Deployment Script
# هذا السكريبت帮助你 نشر التطبيق على المنصات المختلفة

set -e

# الألوان للطباعة الجميلة
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# دالة الطباعة الملونة
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# العنوان
echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║     ConnectFlow Messenger - Deployment Script     ║"
echo "║           سكريبت نشر ConnectFlow Messenger        ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# التحقق من Node.js
print_info "التحقق من المتطلبات..."
if ! command -v node &> /dev/null; then
    print_error "Node.js غير مثبت! يرجى تثبيت Node.js من https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
print_status "Node.js Version: $NODE_VERSION"

# التحقق من npm
if ! command -v npm &> /dev/null; then
    print_error "npm غير مثبت!"
    exit 1
fi

print_status "npm Version: $(npm -v)"
echo ""

# قائمة الخيارات
echo "اختر منصة النشر:"
echo ""
echo "  1) 🚂 Railway (مجاني، سهل)"
echo "  2) 🎨 Render (مجاني، بسيط)"
echo "  3) ☁️  VPS/Server (خادم خاص)"
echo "  4) 🐳 Docker (حاوية)"
echo "  5) 🔧 تشغيل محلي للاختبار"
echo ""
read -p "أدخل اختيارك (1-5): " choice

echo ""

case $choice in
    1)
        echo "╔════════════════════════════════════╗"
        echo "║      النشر على Railway 🚂          ║"
        echo "╚════════════════════════════════════╝"
        echo ""
        
        print_info "تعليمات النشر على Railway:"
        echo ""
        echo "  1. اذهب إلى: https://railway.app"
        echo "  2. سجّل الدخول بحساب GitHub"
        echo "  3. اضغط 'New Project'"
        echo "  4. اختر 'Deploy from GitHub repo'"
        echo "  5. اختر هذا المستودع"
        echo "  6. في الإعدادات، تأكد من:"
        echo "     - Build Command: npm install"
        echo "     - Start Command: npm start"
        echo "  7. اضغط 'Deploy'"
        echo ""
        print_warning "أو استخدم CLI:"
        echo ""
        echo "  # تثبيت Railway CLI"
        echo "  npm install -g @railway/cli"
        echo ""
        echo "  # تسجيل الدخول"
        echo "  railway login"
        echo ""
        echo "  # ربط المشروع"
        echo "  railway init"
        echo ""
        echo "  # نشر"
        echo "  railway up"
        echo ""
        ;;
        
    2)
        echo "╔════════════════════════════════════╗"
        echo "║      النشر على Render 🎨           ║"
        echo "╚════════════════════════════════════╝"
        echo ""
        
        print_info "تعليمات النشر على Render:"
        echo ""
        echo "  1. اذهب إلى: https://dashboard.render.com"
        echo "  2. سجّل الدخول بحساب GitHub"
        echo "  3. اضغط 'New +'"
        echo "  4. اختر 'Web Service'"
        echo "  5. اختر هذا المستودع من GitHub"
        echo "  6. الإعدادات:"
        echo "     - Name: connectflow-messenger"
        echo "     - Build Command: npm install"
        echo "     - Start Command: npm start"
        echo "     - Plan: Free"
        echo "  7. اضغط 'Create Web Service'"
        echo ""
        print_status "بعد النشر، س تحصل على رابط مثل:"
        print_info "https://connectflow-messenger.onrender.com"
        echo ""
        ;;
        
    3)
        echo "╔════════════════════════════════════╗"
        echo "║      النشر على VPS/Server ☁️       ║"
        echo "╚════════════════════════════════════╝"
        echo ""
        
        print_info "تعليمات النشر على خادم Linux:"
        echo ""
        
        # التحقق إذا كان الخادم يعمل محلياً
        if [ "$HOSTNAME" = "matrix-agent-chat" ] || [ "$HOSTNAME" = "sandbox" ]; then
            print_warning "يبدو أنك في بيئة سحابية. جاري تشغيل الخادم..."
            echo ""
            
            # التحقق من وجود الخادم
            if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
                print_warning "الخادم يعمل بالفعل على المنفذ 3000"
                print_info "رابط الوصول: http://localhost:3000"
            else
                print_info "تشغيل الخادم..."
                npm start &
                sleep 3
                
                if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
                    print_status "الخادم يعمل بنجاح!"
                    print_info "رابط الوصول: http://localhost:3000"
                else
                    print_error "فشل في تشغيل الخادم"
                fi
            fi
        else
            echo "  # الاتصال بالخادم عبر SSH"
            echo "  ssh user@your-server-ip"
            echo ""
            echo "  # على الخادم:"
            echo "  sudo apt update && sudo apt install -y nodejs npm git"
            echo ""
            echo "  # استنساخ المشروع"
            echo "  git clone https://github.com/your-username/connectflow-messenger.git"
            echo "  cd connectflow-messenger"
            echo ""
            echo "  # تثبيت الاعتماديات"
            echo "  npm install"
            echo ""
            echo "  # تشغيل في الخلفية باستخدام PM2"
            echo "  npm install -g pm2"
            echo "  pm2 start server.js --name connectflow-messenger"
            echo "  pm2 startup"
            echo "  pm2 save"
            echo ""
            echo "  # إعداد Nginx (اختياري)"
            echo "  sudo apt install -y nginx"
            echo "  sudo nano /etc/nginx/sites-available/connectflow"
            echo ""
            echo "  # محتوى ملف Nginx:"
            echo "  server {"
            echo "      listen 80;"
            echo "      server_name your-domain.com;"
            echo "      location / {"
            echo "          proxy_pass http://localhost:3000;"
            echo "      }"
            echo "  }"
            echo ""
            echo "  sudo ln -s /etc/nginx/sites-available/connectflow /etc/nginx/sites-enabled/"
            echo "  sudo nginx -t"
            echo "  sudo systemctl restart nginx"
            echo ""
        fi
        ;;
        
    4)
        echo "╔════════════════════════════════════╗"
        echo "║         النشر باستخدام Docker 🐳  ║"
        echo "╚════════════════════════════════════╝"
        echo ""
        
        print_info "إنشاء ملف Docker وتثبيت:"
        echo ""
        
        # التحقق من Docker
        if command -v docker &> /dev/null; then
            print_status "Docker مثبت!"
            echo ""
            
            # بناء الصورة
            print_info "جاري بناء الصورة..."
            docker build -t connectflow-messenger .
            
            # تشغيل الحاوية
            print_info "جاري تشغيل الحاوية..."
            docker run -d -p 3000:3000 --name connectflow-app connectflow-messenger
            
            print_status "الحاوية تعمل!"
            print_info "رابط الوصول: http://localhost:3000"
            
            echo ""
            echo "أوامر مفيدة:"
            echo "  docker logs connectflow-app  # عرض السجلات"
            echo "  docker stop connectflow-app  # إيقاف"
            echo "  docker start connectflow-app # تشغيل"
            echo "  docker rm connectflow-app    # حذف"
        else
            echo "  # تثبيت Docker"
            echo "  curl -fsSL https://get.docker.com -o get-docker.sh"
            echo "  sudo sh get-docker.sh"
            echo ""
            echo "  # بناء وتشغيل"
            echo "  docker build -t connectflow-messenger ."
            echo "  docker run -d -p 3000:3000 connectflow-messenger"
        fi
        echo ""
        ;;
        
    5)
        echo "╔════════════════════════════════════╗"
        echo "║      تشغيل محلي للاختبار 🔧        ║"
        echo "╚════════════════════════════════════╝"
        echo ""
        
        print_info "تثبيت الاعتماديات وتشغيل الخادم..."
        echo ""
        
        # تثبيت الاعتماديات
        print_info "جاري تثبيت الاعتماديات..."
        npm install
        
        # تشغيل الخادم
        print_info "جاري تشغيل الخادم..."
        echo ""
        
        # التحقق من المنفذ
        if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "المنفذ 3000 مشغول! جاري تغيير المنفذ..."
            PORT=3001 node server.js &
            sleep 2
            PORT=3001
        else
            npm start &
            sleep 3
        fi
        
        echo ""
        if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 || [ "$PORT" = "3001" ]; then
            ACTUAL_PORT=${PORT:-3000}
            print_status "✅ الخادم يعمل بنجاح!"
            echo ""
            echo "╔═══════════════════════════════════╗"
            echo "║    🎉 مرحباً بك في ConnectFlow!   ║"
            echo "╚═══════════════════════════════════╝"
            echo ""
            print_info "رابط الوصول: http://localhost:$ACTUAL_PORT"
            echo ""
        else
            print_error "حدث خطأ في تشغيل الخادم"
            echo "جرب: node server.js"
        fi
        ;;
        
    *)
        print_error "اختيار غير صحيح!"
        exit 1
        ;;
esac

echo ""
print_status "اكتمل النشر!"
echo ""
