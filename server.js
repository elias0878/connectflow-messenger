const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// إعدادات البيئة
const JWT_SECRET = process.env.JWT_SECRET || 'connectflow-secret-key-change-in-production';
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// تهيئة قاعدة البيانات
const db = new Database('connectflow.db');

// إنشاء الجداول
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT NULL,
    is_online INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT DEFAULT '',
    type TEXT DEFAULT 'text',
    file_url TEXT DEFAULT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`);

// إنشاء المجلدات اللازمة
const dirs = ['public/uploads', 'public/avatars', 'public/css', 'public/js'];
dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// إعدادات multer لرفع الملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = req.params.type === 'avatar' ? 'public/avatars' : 'public/uploads';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = {
      'avatar': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      'audio': ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg']
    };
    
    const type = req.params.type;
    if (type && allowedTypes[type]?.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مسموح'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// التحقق من التوكن
const verifyToken = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'غير مصرح لك بالوصول' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'توكن غير صالح' });
  }
};

// ==================== Routes ====================

// التسجيل
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.json({ success: false, error: 'يرجى ملء جميع الحقول' });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.json({ success: false, error: 'اسم المستخدم يجب أن يكون بين 3 و 20 حرفاً' });
    }
    
    if (password.length < 4) {
      return res.json({ success: false, error: 'كلمة المرور يجب أن تكون 4 أحرف أو أكثر' });
    }
    
    // التحقق من وجود المستخدم
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.json({ success: false, error: 'اسم المستخدم موجود بالفعل' });
    }
    
    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // إنشاء المستخدم
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
    const userId = result.lastInsertRowid;
    
    // إنشاء توكن
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
    
    // تعيين cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(userId);
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Registration error:', error);
    res.json({ success: false, error: 'حدث خطأ أثناء التسجيل' });
  }
});

// تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.json({ success: false, error: 'يرجى ملء جميع الحقول' });
    }
    
    // البحث عن المستخدم
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    // التحقق من كلمة المرور
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    // إنشاء توكن
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    // تعيين cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    res.json({
      success: true,
      user: { id: user.id, username: user.username, avatar: user.avatar }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, error: 'حدث خطأ أثناء تسجيل الدخول' });
  }
});

// جلب المستخدم الحالي
app.get('/api/auth/me', verifyToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, avatar, is_online FROM users WHERE id = ?').get(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// تسجيل الخروج
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// جلب جميع المستخدمين
app.get('/api/users', verifyToken, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, avatar, is_online, created_at
      FROM users
      WHERE id != ?
      ORDER BY is_online DESC, username ASC
    `).all(req.userId);
    
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// جلب الرسائل بين مستخدمين
app.get('/api/messages/:userId', verifyToken, (req, res) => {
  try {
    const otherUserId = parseInt(req.params.userId);
    
    const messages = db.prepare(`
      SELECT m.*, u.username as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `).all(req.userId, otherUserId, otherUserId, req.userId);
    
    // تحديث الرسائل المقروءة
    db.prepare(`
      UPDATE messages
      SET is_read = 1
      WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
    `).run(otherUserId, req.userId);
    
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// رفع الصور
app.post('/api/upload/image', verifyToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: 'يرجى اختيار صورة' });
    }
    
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (error) {
    console.error('Image upload error:', error);
    res.json({ success: false, error: 'فشل في رفع الصورة' });
  }
});

// رفع الرسائل الصوتية
app.post('/api/upload/audio', verifyToken, upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: 'يرجى اختيار ملف صوتي' });
    }
    
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (error) {
    console.error('Audio upload error:', error);
    res.json({ success: false, error: 'فشل في رفع الملف الصوتي' });
  }
});

// رفع الصور الشخصية
app.post('/api/upload/avatar', verifyToken, upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: 'يرجى اختيار صورة' });
    }
    
    const url = `/avatars/${req.file.filename}`;
    
    // تحديث صورة المستخدم
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, req.userId);
    
    res.json({ success: true, avatar: url });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.json({ success: false, error: 'فشل في رفع الصورة الشخصية' });
  }
});

// ==================== Socket.io ====================

const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.join(`user_${decoded.userId}`);
      
      // تحديث حالة الاتصال
      db.prepare('UPDATE users SET is_online = 1 WHERE id = ?').run(decoded.userId);
      connectedUsers.set(decoded.userId, socket.id);
      
      // إشعار المستخدمين الآخرين
      io.emit('user_online', { userId: decoded.userId });
      
      console.log(`User ${decoded.userId} authenticated`);
    } catch (error) {
      console.error('Socket auth error:', error);
      socket.disconnect();
    }
  });
  
  socket.on('send_message', (data) => {
    if (!socket.userId) return;
    
    const { receiverId, content, type, fileUrl } = data;
    
    try {
      // حفظ الرسالة في قاعدة البيانات
      const result = db.prepare(`
        INSERT INTO messages (sender_id, receiver_id, content, type, file_url)
        VALUES (?, ?, ?, ?, ?)
      `).run(socket.userId, receiverId, content || '', type, fileUrl || null);
      
      const message = {
        id: result.lastInsertRowid,
        sender_id: socket.userId,
        receiver_id: receiverId,
        content,
        type,
        file_url: fileUrl,
        created_at: new Date().toISOString()
      };
      
      // إرسال الرسالة للمرسل
      socket.emit('message_sent', message);
      
      // إرسال للمستقبل إذا كان متصلاً
      const receiverSocket = connectedUsers.get(receiverId);
      if (receiverSocket) {
        io.to(`user_${receiverId}`).emit('receive_message', message);
      }
    } catch (error) {
      console.error('Send message error:', error);
    }
  });
  
  socket.on('typing', (data) => {
    if (!socket.userId) return;
    const { receiverId } = data;
    
    const receiverSocket = connectedUsers.get(receiverId);
    if (receiverSocket) {
      io.to(`user_${receiverId}`).emit('user_typing', { userId: socket.userId, receiverId });
    }
  });
  
  socket.on('stop_typing', (data) => {
    if (!socket.userId) return;
    const { receiverId } = data;
    
    const receiverSocket = connectedUsers.get(receiverId);
    if (receiverSocket) {
      io.to(`user_${receiverId}`).emit('user_stop_typing', { userId: socket.userId, receiverId });
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.userId) {
      // تحديث حالة الاتصال
      db.prepare('UPDATE users SET is_online = 0 WHERE id = ?').run(socket.userId);
      connectedUsers.delete(socket.userId);
      
      // إشعار المستخدمين الآخرين
      io.emit('user_offline', { userId: socket.userId });
      
      console.log(`User ${socket.userId} disconnected`);
    }
  });
});

// ==================== بدء الخادم ====================

server.listen(PORT, () => {
  console.log(`ConnectFlow Messenger running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});
