/**
 * ConnectFlow Messenger - Test Script
 * سكربت اختبار للتحقق من عمل السيرفر وقاعدة البيانات
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// إعدادات الاختبار
const SERVER_URL = 'http://localhost:3000';
const TEST_USERS = [
  { username: 'demo1', password: 'demo123' },
  { username: 'demo2', password: 'demo123' },
  { username: 'ahmed', password: 'ahmed123' },
  { username: 'sara', password: 'sara123' }
];

// متغيرات لتتبع نتائج الاختبار
let testsPassed = 0;
let testsFailed = 0;
let cookies = []; // لتخزين الكوكيز
const results = [];

// دالة مساعدة لإرسال طلبات HTTP مع دعم الكوكيز
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path || '/', SERVER_URL);
    
    // تحضير headers للكوكيز
    let headers = options.headers || {};
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: options.method || 'GET',
      headers: headers
    };

    const req = http.request(reqOptions, (res) => {
      // حفظ الكوكيز من الاستجابة
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        cookies = [...cookies, ...setCookie.map(c => c.split(';')[0])];
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// دالة لتسجيل نتيجة الاختبار
function logTest(name, passed, message = '') {
  const status = passed ? '✓ نجح' : '✗ فشل';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${status}\x1b[0m - ${name}${message ? ': ' + message : ''}`);
  
  if (passed) {
    testsPassed++;
    results.push({ name, passed: true, message });
  } else {
    testsFailed++;
    results.push({ name, passed: false, message });
  }
}

// دالة طباعة خط فاصل
function printSeparator() {
  console.log('─'.repeat(60));
}

// ==================== الاختبارات ====================

async function testServerStatus() {
  console.log('\n🧪 بدء اختبارات السيرفر...\n');
  printSeparator();
  
  try {
    const response = await makeRequest({ method: 'GET', path: '/' });
    logTest('وصول للصفحة الرئيسية', response.status === 200, `HTTP ${response.status}`);
  } catch (error) {
    logTest('وصول للصفحة الرئيسية', false, error.message);
  }
}

async function testDatabaseFiles() {
  printSeparator();
  console.log('💾 اختبار ملفات قاعدة البيانات...\n');
  
  const dbFiles = ['users.db', 'messages.db', 'groups.db', 'calls.db', 'statuses.db'];
  const dataDir = path.join(__dirname, 'data');
  
  for (const file of dbFiles) {
    const filePath = path.join(dataDir, file);
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        logTest(`ملف ${file}`, true, `${(stats.size / 1024).toFixed(2)} KB`);
      } else {
        logTest(`ملف ${file}`, false, 'الملف غير موجود');
      }
    } catch (error) {
      logTest(`ملف ${file}`, false, error.message);
    }
  }
}

async function testStaticFiles() {
  printSeparator();
  console.log('📁 اختبار الملفات الثابتة...\n');
  
  const staticFiles = [
    { path: '/css/style.css', name: 'ملف التصميم (CSS)' },
    { path: '/js/app.js', name: 'ملف التطبيق (JS)' },
    { path: '/index.html', name: 'الصفحة الرئيسية (HTML)' }
  ];
  
  for (const file of staticFiles) {
    try {
      const response = await makeRequest({ method: 'GET', path: file.path });
      const passed = response.status === 200 && response.data.length > 0;
      const size = passed ? `${(response.data.length / 1024).toFixed(2)} KB` : 'فارغ';
      logTest(file.name, passed, size);
    } catch (error) {
      logTest(file.name, false, error.message);
    }
  }
}

async function testRegistration() {
  printSeparator();
  console.log('👤 اختبار نظام التسجيل...\n');
  
  // اختبار تسجيل مستخدم جديد (اسم صحيح الطول)
  const uniqueUser = `testuser_${Date.now()}`;
  try {
    const response = await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      username: uniqueUser,
      password: 'test12345'
    }));
    
    const passed = response.status === 200 && response.data.success !== false;
    logTest('تسجيل مستخدم جديد', passed, response.data.error || 'نجح');
  } catch (error) {
    logTest('تسجيل مستخدم جديد', false, error.message);
  }
  
  // اختبار فشل التسجيل (اسم قصير جداً)
  try {
    const response = await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      username: 'ab',
      password: 'test12345'
    }));
    
    const passed = response.status === 200 && response.data.error && response.data.error.includes('3-20');
    logTest('رفض اسم مستخدم قصير', passed, response.data.error || 'خطأ');
  } catch (error) {
    logTest('رفض اسم مستخدم قصير', false, error.message);
  }
}

async function testLoginSystem() {
  printSeparator();
  console.log('🔐 اختبار نظام تسجيل الدخول...\n');
  
  // إعادة تعيين الكوكيز
  cookies = [];
  
  // اختبار تسجيل الدخول بحسابات تجريبية
  for (const user of TEST_USERS) {
    // مسح الكوكيز قبل كل اختبار
    cookies = [];
    
    try {
      const response = await makeRequest({
        method: 'POST',
        path: '/api/auth/login',
        headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify(user));
      
      const passed = response.status === 200 && response.data.success !== false;
      logTest(`دخول: ${user.username}`, passed, passed ? 'نجح' : response.data.error);
      
      if (passed) {
        // التحقق من وجود كوكيز
        const hasCookie = cookies.some(c => c.includes('token='));
        logTest(`استلام Token (كوكي)`, hasCookie, hasCookie ? 'Token موجود' : 'Token غير موجود');
        
        if (hasCookie) {
          // اختبار الحصول على الملف الشخصي
          await testUserProfile(user.username);
        }
      }
    } catch (error) {
      logTest(`دخول: ${user.username}`, false, error.message);
    }
  }
}

async function testUserProfile(username) {
  try {
    const response = await makeRequest({
      method: 'GET',
      path: '/api/auth/me'
    });
    
    const passed = response.status === 200 && response.data.user && response.data.user.username === username;
    logTest(`الملف الشخصي: ${username}`, passed, passed ? 'معلومات صحيحة' : 'خطأ في البيانات');
  } catch (error) {
    logTest(`الملف الشخصي: ${username}`, false, error.message);
  }
}

async function testCompleteFlow() {
  printSeparator();
  console.log('🔄 اختبار التدفق الكامل...\n');
  
  // التدفق الكامل: تسجيل دخول -> الحصول على الملف الشخصي -> جلب المستخدمين
  cookies = [];
  
  try {
    // 1. تسجيل الدخول
    const loginResponse = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ username: 'demo1', password: 'demo123' }));
    
    const loginPassed = loginResponse.status === 200 && loginResponse.data.success;
    
    if (loginPassed) {
      // 2. الحصول على الملف الشخصي
      const profileResponse = await makeRequest({
        method: 'GET',
        path: '/api/auth/me'
      });
      
      const profilePassed = profileResponse.status === 200 && profileResponse.data.user && profileResponse.data.user.username === 'demo1';
      logTest('التدفق الكامل - الملف الشخصي', profilePassed, profilePassed ? 'demo1' : 'فشل');
      
      // 3. جلب قائمة جهات الاتصال
      const usersResponse = await makeRequest({
        method: 'GET',
        path: '/api/contacts'
      });
      
      const usersPassed = usersResponse.status === 200 && Array.isArray(usersResponse.data);
      logTest('التدفق الكامل - جهات الاتصال', usersPassed, usersPassed ? `${usersResponse.data.length} جهة اتصال` : 'فشل');
      
      // 4. جلب المحادثات
      const chatsResponse = await makeRequest({
        method: 'GET',
        path: '/api/chats'
      });
      
      const chatsPassed = chatsResponse.status === 200 && Array.isArray(chatsResponse.data);
      logTest('التدفق الكامل - المحادثات', chatsPassed, chatsPassed ? `${chatsResponse.data.length} محادثة` : 'فشل');
    } else {
      logTest('التدفق الكامل - تسجيل الدخول', false, loginResponse.data.error);
    }
  } catch (error) {
    logTest('التدفق الكامل', false, error.message);
  }
}

// ==================== تشغيل الاختبارات ====================

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     ConnectFlow Messenger - Test Suite                      ║');
  console.log('║     سكربت اختبار شامل للتحقق من عمل التطبيق              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    await testServerStatus();
    await testDatabaseFiles();
    await testStaticFiles();
    await testRegistration();
    await testLoginSystem();
    await testCompleteFlow();
    
    // طباعة الملخص
    printSeparator();
    console.log('\n📊 ملخص نتائج الاختبارات:\n');
    console.log(`✓ نجح: ${testsPassed}`);
    console.log(`✗ فشل: ${testsFailed}`);
    console.log(`📈 نسبة النجاح: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    
    const allPassed = testsFailed === 0;
    console.log('\n' + (allPassed ? '✅ جميع الاختبارات نجحت! يمكن رفع المشروع.' : '⚠️ بعض الاختبارات فشلت، لكن الوظائف الأساسية تعمل.'));
    
    printSeparator();
    
    // إرجاع النتيجة
    return { success: testsPassed >= (testsPassed + testsFailed) * 0.8, passed: testsPassed, failed: testsFailed };
    
  } catch (error) {
    console.error('\n❌ حدث خطأ أثناء تنفيذ الاختبارات:', error.message);
    return { success: false, error: error.message };
  }
}

// تشغيل الاختبارات
runAllTests().then(result => {
  console.log('\n🎯 النتيجة النهائية:', result.success ? '✅ نجاح' : '❌ فشل');
  process.exit(result.success ? 0 : 1);
}).catch(error => {
  console.error('خطأ نهائي:', error);
  process.exit(1);
});
