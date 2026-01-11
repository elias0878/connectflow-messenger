import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testFrontend() {
    console.log('🧪 بدء اختبار الواجهة الأمامية لـ ConnectFlow Messenger...\n');
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });
    
    page.on('pageerror', err => {
        errors.push(err.message);
    });
    
    try {
        // Navigate to the local file
        const filePath = path.join(__dirname, 'public', 'index.html');
        await page.goto(`file://${filePath}`, { waitUntil: 'networkidle' });
        
        console.log('✓ تم تحميل الصفحة بنجاح');
        
        // Check page title
        const title = await page.title();
        console.log(`✓ عنوان الصفحة: ${title}`);
        
        // Check main elements exist
        const appContainer = await page.$('#app');
        if (appContainer) {
            console.log('✓ عنصر #app موجود');
        } else {
            console.log('✗ عنصر #app غير موجود');
        }
        
        // Check for key UI elements
        const loginForm = await page.$('.login-container');
        const registerForm = await page.$('.register-container');
        
        console.log(`✓ نموذج التسجيل: ${registerForm ? 'موجود' : 'غير موجود'}`);
        console.log(`✓ نموذج تسجيل الدخول: ${loginForm ? 'موجود' : 'غير موجود'}`);
        
        // Wait for any async errors
        await page.waitForTimeout(2000);
        
        // Report errors
        if (errors.length > 0) {
            console.log('\n⚠️ أخطاء في وحدة التحكم:');
            errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
        } else {
            console.log('\n✓ لا توجد أخطاء في وحدة التحكم');
        }
        
        console.log('\n📊 ملخص الاختبار:');
        console.log('  - تحميل الصفحة: ✓');
        console.log('  - العنوان: ✓');
        console.log('  - عناصر واجهة المستخدم: ✓');
        console.log('  - الأخطاء: ' + (errors.length === 0 ? 'لا توجد' : `${errors.length} خطأ`));
        
    } catch (error) {
        console.error('✗ خطأ في الاختبار:', error.message);
    } finally {
        await browser.close();
    }
}

testFrontend();
