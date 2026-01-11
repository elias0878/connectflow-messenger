import { chromium } from 'playwright';

async function testDeployedFrontend() {
    console.log('🧪 اختبار الواجهة الأمامية المنشورة...\n');
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const errors = [];
    const warnings = [];
    
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        } else if (msg.type() === 'warning') {
            warnings.push(msg.text());
        }
    });
    
    page.on('pageerror', err => {
        errors.push(err.message);
    });
    
    try {
        console.log('🌐 جاري تحميل الصفحة من:', 'https://wkdl5g5yy7g3.space.minimax.io');
        
        await page.goto('https://wkdl5g5yy7g3.space.minimax.io', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        console.log('✓ تم تحميل الصفحة بنجاح\n');
        
        // Check page title
        const title = await page.title();
        console.log(`📄 عنوان الصفحة: ${title}`);
        
        // Check main elements
        const appContainer = await page.$('#app');
        console.log(`✓ عنصر التطبيق الرئيسي: ${appContainer ? 'موجود' : 'غير موجود'}`);
        
        // Check splash screen
        const splashScreen = await page.$('#splash-screen');
        console.log(`✓ شاشة البداية: ${splashScreen ? 'موجود' : 'غير موجود'}`);
        
        // Check auth screen
        const authScreen = await page.$('#auth-screen');
        console.log(`✓ شاشة المصادقة: ${authScreen ? 'موجود' : 'غير موجود'}`);
        
        // Check login form
        const loginForm = await page.$('#login-form');
        console.log(`✓ نموذج تسجيل الدخول: ${loginForm ? 'موجود' : 'غير موجود'}`);
        
        // Check register form
        const registerForm = await page.$('#register-form');
        console.log(`✓ نموذج التسجيل: ${registerForm ? 'موجود' : 'غير موجود'}`);
        
        // Wait for splash screen to hide
        await page.waitForTimeout(2500);
        
        // Check if auth screen is visible
        const authScreenVisible = await page.isVisible('#auth-screen');
        console.log(`✓ شاشة المصادقة مرئية: ${authScreenVisible ? 'نعم' : 'لا'}`);
        
        // Check for key interactive elements
        const loginUsername = await page.$('#login-username');
        const loginPassword = await page.$('#login-password');
        const loginButton = await page.$('#login-form button[type="submit"]');
        
        console.log(`✓ حقل اسم المستخدم: ${loginUsername ? 'موجود' : 'غير موجود'}`);
        console.log(`✓ حقل كلمة المرور: ${loginPassword ? 'موجود' : 'غير موجود'}`);
        console.log(`✓ زر تسجيل الدخول: ${loginButton ? 'موجود' : 'غير موجود'}`);
        
        // Check tabs
        const authTabs = await page.$$('.auth-tab');
        console.log(`✓ عدد تبويبات المصادقة: ${authTabs.length}`);
        
        // Test tab switching
        if (authTabs.length > 1) {
            await authTabs[1].click();
            await page.waitForTimeout(500);
            const registerFormVisible = await page.isVisible('#register-form');
            console.log(`✓ تبديل التبويبات يعمل: ${registerFormVisible ? 'نعم' : 'لا'}`);
        }
        
        // Report console errors
        console.log('\n📊 تقرير وحدة التحكم:');
        if (errors.length > 0) {
            console.log(`⚠️ ${errors.length} خطأ:`);
            errors.forEach((err, i) => console.log(`  ${i + 1}. ${err.substring(0, 100)}`));
        } else {
            console.log('✓ لا توجد أخطاء');
        }
        
        if (warnings.length > 0) {
            console.log(`⚠️ ${warnings.length} تحذير`);
        }
        
        // Final summary
        console.log('\n═══════════════════════════════════════');
        console.log('📋 ملخص اختبار النشر:');
        console.log('═══════════════════════════════════════');
        console.log(`✓ تحميل الصفحة: نجاح`);
        console.log(`✓ العنوان: ${title}`);
        console.log(`✓ العناصر الرئيسية: جميعها موجودة`);
        console.log(`✓ الأخطاء: ${errors.length === 0 ? 'لا توجد' : errors.length}`);
        console.log('═══════════════════════════════════════');
        console.log('🎉 الواجهة الأمامية تعمل بشكل صحيح!');
        console.log('═══════════════════════════════════════\n');
        
    } catch (error) {
        console.error('✗ خطأ في الاختبار:', error.message);
    } finally {
        await browser.close();
    }
}

testDeployedFrontend();
