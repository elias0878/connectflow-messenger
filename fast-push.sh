#!/bin/bash
set -e

echo "🚀 بدء عملية الرفع السريع..."

# تكوين Git
git config --global --add safe.directory /workspace

# إزالة node_modules من التتبع
echo "📦 إزالة node_modules من التتبع..."
git rm -r --cached node_modules frontend/node_modules frontend/.vite 2>/dev/null || true

# إضافة التغييرات
echo "➕ إضافة الملفات..."
git add -A

# إنشاء-commit
echo "💾 إنشاء Commit..."
git commit -m "feat: Clean repository - remove node_modules for faster push" || echo "لا يوجد تغييرات جديدة"

# رفع إلى GitHub
echo "☁️ رفع إلى GitHub..."
GIT_TERMINAL_PROMPT=0 git push -u origin master

echo "✅ تم رفع الملفات بنجاح!"
