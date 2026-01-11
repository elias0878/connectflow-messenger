/**
 * ConnectFlow Messenger - Server
 * خادم المراسلة الفورية المتكامل
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Datastore = require('nedb-promises');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// إعدادات البيئة
const JWT_SECRET = process.env.JWT_SECRET || 'connectflow-secret-key-2024';
const PORT = process.env.PORT || 3000;

// إنشاء المجلدات
const dataDir = path.join(__dirname, 'data');
const uploadDirs = ['public/uploads', 'public/avatars', dataDir];

uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// تهيئة قاعدة البيانات NeDB
const db = {
  users: Datastore.create({ filename: path.join(dataDir, 'users.db'), autoload: true }),
  messages: Datastore.create({ filename: path.join(dataDir, 'messages.db'), autoload: true }),
  groups: Datastore.create({ filename: path.join(dataDir, 'groups.db'), autoload: true }),
  calls: Datastore.create({ filename: path.join(dataDir, 'calls.db'), autoload: true }),
  statuses: Datastore.create({ filename: path.join(dataDir, 'statuses.db'), autoload: true })
};

// إنشاء الفهارس
db.users.ensureIndex({ fieldName: 'username', unique: true });
db.messages.ensureIndex({ fieldName: 'sender_id' });
db.messages.ensureIndex({ fieldName: 'receiver_id' });
db.messages.ensureIndex({ fieldName: 'created_at' });

// إعدادات رفع الملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.params.type || 'file';
    const uploadPath = type === 'avatar' ? 'public/avatars' : 'public/uploads';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 
                          'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg',
                          'video/mp4', 'video/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// دالة التحقق من التوكن
const verifyToken = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'غير مصرح' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (error) {
    res.status(401).json({ error: 'توكن غير صالح' });
  }
};

// ==================== API Routes ====================

// التسجيل
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.json({ success: false, error: 'يرجى ملء جميع الحقول' });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.json({ success: false, error: 'اسم المستخدم 3-20 حرف' });
    }
    
    if (password.length < 4) {
      return res.json({ success: false, error: 'كلمة المرور 4 أحرف أو أكثر' });
    }
    
    const existingUser = await db.users.findOne({ username });
    if (existingUser) {
      return res.json({ success: false, error: 'اسم المستخدم موجود' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.users.insert({
      username,
      password: hashedPassword,
      avatar: null,
      bio: '',
      phone: '',
      is_online: 0,
      created_at: new Date().toISOString()
    });
    
    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    res.json({ 
      success: true, 
      user: { 
        id: user._id, 
        username: user.username, 
        avatar: user.avatar,
        bio: user.bio,
        is_online: user.is_online
      } 
    });
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
    
    const user = await db.users.findOne({ username });
    if (!user) {
      return res.json({ success: false, error: 'اسم المستخدم غير موجود' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.json({ success: false, error: 'كلمة المرور غير صحيحة' });
    }
    
    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    res.json({ 
      success: true, 
      user: { 
        id: user._id, 
        username: user.username, 
        avatar: user.avatar,
        bio: user.bio,
        phone: user.phone,
        is_online: user.is_online
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, error: 'حدث خطأ أثناء تسجيل الدخول' });
  }
});

// جلب المستخدم الحالي
app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await db.users.findOne({ _id: req.userId });
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    res.json({ 
      user: { 
        id: user._id, 
        username: user.username, 
        avatar: user.avatar,
        bio: user.bio,
        phone: user.phone,
        is_online: user.is_online
      } 
    });
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

// جلب جهات الاتصال
app.get('/api/contacts', verifyToken, async (req, res) => {
  try {
    const users = await db.users.find({ _id: { $ne: req.userId } });
    const formattedUsers = users.map(user => ({
      id: user._id,
      username: user.username,
      avatar: user.avatar || '/avatars/default.png',
      is_online: user.is_online || 0,
      bio: user.bio || ''
    }));
    
    // ترتيب: المتصلون أولاً
    formattedUsers.sort((a, b) => {
      if (a.is_online === b.is_online) return a.username.localeCompare(b.username);
      return b.is_online - a.is_online;
    });
    
    res.json({ contacts: formattedUsers });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// جلب قائمة الدردشات
app.get('/api/chats', verifyToken, async (req, res) => {
  try {
    const allMessages = await db.messages.find({
      $or: [
        { sender_id: req.userId },
        { receiver_id: req.userId }
      ]
    });
    
    const chatMap = new Map();
    
    allMessages.forEach(msg => {
      const otherId = msg.sender_id === req.userId ? msg.receiver_id : msg.sender_id;
      
      if (!chatMap.has(otherId)) {
        chatMap.set(otherId, {
          id: otherId,
          type: 'private',
          lastMessage: '',
          lastMessageTime: msg.created_at,
          unreadCount: 0
        });
      }
      
      const chat = chatMap.get(otherId);
      if (new Date(msg.created_at) > new Date(chat.lastMessageTime)) {
        chat.lastMessageTime = msg.created_at;
        chat.lastMessage = this.formatMessageContent(msg);
      }
      
      if (msg.receiver_id === req.userId && !msg.is_read) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }
    });
    
    // جلب معلومات المستخدمين
    const chats = [];
    for (const [userId, chat] of chatMap) {
      const user = await db.users.findOne({ _id: userId });
      if (user) {
        chats.push({
          ...chat,
          name: user.username,
          avatar: user.avatar || '/avatars/default.png',
          is_online: user.is_online || 0
        });
      }
    }
    
    // ترتيب حسب آخر رسالة
    chats.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    
    res.json({ chats });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// دالة مساعدة لتنسيق محتوى الرسالة
function formatMessageContent(msg) {
  if (msg.type === 'image') return '📷 صورة';
  if (msg.type === 'audio') return '🎵 رسالة صوتية';
  if (msg.type === 'video') return '🎬 فيديو';
  if (msg.type === 'document') return '📄 مستند';
  if (msg.content && msg.content.length > 30) return msg.content.substring(0, 30) + '...';
  return msg.content || 'وسائط';
}

// جلب الرسائل بين مستخدمين
app.get('/api/messages/:userId', verifyToken, async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    
    const messages = await db.messages.find({
      $or: [
        { sender_id: req.userId, receiver_id: otherUserId },
        { sender_id: otherUserId, receiver_id: req.userId }
      ]
    }).sort({ created_at: 1 });
    
    // تحديث الرسائل المقروءة
    await db.messages.update(
      { sender_id: otherUserId, receiver_id: req.userId, is_read: 0 },
      { $set: { is_read: 1 } },
      { multi: true }
    );
    
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// إرسال رسالة
app.post('/api/messages', verifyToken, async (req, res) => {
  try {
    const { receiverId, content, type, fileUrl } = req.body;
    
    const message = await db.messages.insert({
      sender_id: req.userId,
      receiver_id: receiverId,
      content: content || '',
      type: type || 'text',
      file_url: fileUrl || null,
      is_read: 0,
      is_starred: 0,
      created_at: new Date().toISOString()
    });
    
    res.json({ success: true, message: { ...message, id: message._id } });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// حذف رسالة
app.delete('/api/messages/:messageId', verifyToken, async (req, res) => {
  try {
    await db.messages.remove({ _id: req.params.messageId });
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: 'حدث خطأ' });
  }
});

// جلب المجموعات
app.get('/api/groups', verifyToken, async (req, res) => {
  try {
    const groups = await db.groups.find({ participants: req.userId });
    const formattedGroups = groups.map(g => ({
      id: g._id,
      name: g.name,
      avatar: g.avatar || '/avatars/default.png',
      description: g.description || '',
      participantCount: g.participants.length,
      lastMessage: '',
      lastMessageTime: g.created_at,
      unreadCount: 0
    }));
    
    res.json({ groups: formattedGroups });
  } catch (error) {
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// إنشاء مجموعة
app.post('/api/groups', verifyToken, async (req, res) => {
  try {
    const { name, description, participantIds } = req.body;
    
    const group = await db.groups.insert({
      name,
      description: description || '',
      avatar: null,
      admin_id: req.userId,
      participants: [req.userId, ...(participantIds || [])],
      created_at: new Date().toISOString()
    });
    
    res.json({ success: true, group: { ...group, id: group._id } });
  } catch (error) {
    console.error('Create group error:', error);
    res.json({ success: false, error: 'حدث خطأ' });
  }
});

// جلب رسائل مجموعة
app.get('/api/groups/:groupId/messages', verifyToken, async (req, res) => {
  try {
    const messages = await db.messages.find({
      group_id: req.params.groupId
    }).sort({ created_at: 1 });
    
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// جلب الحالات
app.get('/api/status', verifyToken, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const statuses = await db.statuses.find({
      expires_at: { $gt: now },
      user_id: { $ne: req.userId }
    });
    
    const statusesWithUsers = [];
    for (const status of statuses) {
      const user = await db.users.findOne({ _id: status.user_id });
      if (user) {
        statusesWithUsers.push({
          id: status._id,
          userId: user._id,
          userName: user.username,
          userAvatar: user.avatar || '/avatars/default.png',
          content: status.content,
          type: status.type,
          createdAt: status.created_at
        });
      }
    }
    
    res.json({ statuses: statusesWithUsers });
  } catch (error) {
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// جلب سجل المكالمات
app.get('/api/calls', verifyToken, async (req, res) => {
  try {
    const calls = await db.calls.find({
      $or: [
        { caller_id: req.userId },
        { receiver_id: req.userId }
      ]
    }).sort({ created_at: -1 });
    
    const callsWithUsers = [];
    for (const call of calls) {
      const otherId = call.caller_id === req.userId ? call.receiver_id : call.caller_id;
      const user = await db.users.findOne({ _id: otherId });
      if (user) {
        callsWithUsers.push({
          id: call._id,
          userId: user._id,
          userName: user.username,
          userAvatar: user.avatar || '/avatars/default.png',
          type: call.type,
          direction: call.caller_id === req.userId ? 'outgoing' : 'incoming',
          duration: call.duration,
          timestamp: call.created_at
        });
      }
    }
    
    res.json({ calls: callsWithUsers });
  } catch (error) {
    res.status(500).json({ error: 'حدث خطأ' });
  }
});

// رفع الملفات
app.post('/api/upload/:type', verifyToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: 'يرجى اختيار ملف' });
    }
    
    const type = req.params.type;
    const url = type === 'avatar' ? `/avatars/${req.file.filename}` : `/uploads/${req.file.filename}`;
    
    if (type === 'avatar') {
      db.users.update({ _id: req.userId }, { $set: { avatar: url } });
    }
    
    res.json({ success: true, url });
  } catch (error) {
    console.error('Upload error:', error);
    res.json({ success: false, error: 'فشل في رفع الملف' });
  }
});

// ==================== Socket.io ====================

const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  
  // المصادقة
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.join(`user_${decoded.userId}`);
      
      await db.users.update({ _id: decoded.userId }, { $set: { is_online: 1 } });
      connectedUsers.set(decoded.userId, socket.id);
      
      io.emit('user_online', { userId: decoded.userId, username: decoded.username });
      
      console.log(`User ${decoded.username} (${decoded.userId}) authenticated`);
    } catch (error) {
      console.error('Socket auth error:', error);
      socket.disconnect();
    }
  });
  
  // إرسال رسالة
  socket.on('send_message', async (data) => {
    if (!socket.userId) return;
    
    const { receiverId, content, type, fileUrl } = data;
    
    try {
      const message = await db.messages.insert({
        sender_id: socket.userId,
        receiver_id: receiverId,
        content: content || '',
        type: type || 'text',
        file_url: fileUrl || null,
        is_read: 0,
        is_starred: 0,
        created_at: new Date().toISOString()
      });
      
      const messageData = {
        id: message._id,
        sender_id: socket.userId,
        receiver_id: receiverId,
        content,
        type,
        file_url: fileUrl,
        created_at: message.created_at,
        is_read: 0
      };
      
      // إرسال تأكيد للمرسل
      socket.emit('message_sent', messageData);
      
      // إرسال للمستقبل
      io.to(`user_${receiverId}`).emit('receive_message', messageData);
      
    } catch (error) {
      console.error('Send message error:', error);
    }
  });
  
  // مؤشر الكتابة
  socket.on('typing', (data) => {
    if (!socket.userId) return;
    const { receiverId } = data;
    socket.to(`user_${receiverId}`).emit('user_typing', { 
      userId: socket.userId, 
      username: socket.username 
    });
  });
  
  // إيقاف مؤشر الكتابة
  socket.on('stop_typing', (data) => {
    if (!socket.userId) return;
    const { receiverId } = data;
    socket.to(`user_${receiverId}`).emit('user_stop_typing', { userId: socket.userId });
  });
  
  // قطع الاتصال
  socket.on('disconnect', async () => {
    if (socket.userId) {
      await db.users.update({ _id: socket.userId }, { $set: { is_online: 0 } });
      connectedUsers.delete(socket.userId);
      io.emit('user_offline', { userId: socket.userId });
      console.log(`User ${socket.userId} disconnected`);
    }
  });
});

// ==================== إنشاء مستخدمين تجريبيين ====================

async function seedDemoUsers() {
  try {
    const userCount = await db.users.count({});
    
    if (userCount === 0) {
      console.log('Creating demo users...');
      
      const demoUsers = [
        { username: 'demo1', password: 'demo123', bio: 'مستخدم تجريبي 1' },
        { username: 'demo2', password: 'demo123', bio: 'مستخدم تجريبي 2' },
        { username: 'demo3', password: 'demo123', bio: 'مستخدم تجريبي 3' },
        { username: 'ahmed', password: 'ahmed123', bio: 'أحمد - مدير المشروع' },
        { username: 'sara', password: 'sara123', bio: 'سارة - مساعدة' }
      ];
      
      for (const user of demoUsers) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await db.users.insert({
          username: user.username,
          password: hashedPassword,
          avatar: null,
          bio: user.bio,
          phone: '',
          is_online: 0,
          created_at: new Date().toISOString()
        });
      }
      
      console.log('Demo users created successfully!');
      console.log('Demo accounts: demo1/demo123, demo2/demo123, demo3/demo123, ahmed/ahmed123, sara/sara123');
    }
  } catch (error) {
    console.error('Error creating demo users:', error);
  }
}

// بدء الخادم
server.listen(PORT, async () => {
  console.log(`
╔══════════════════════════════════════════╗
║     ConnectFlow Messenger v1.0           ║
║     Port: ${PORT}                              ║
║     http://localhost:${PORT}                  ║
╚══════════════════════════════════════════╝
  `);
  
  await seedDemoUsers();
});

module.exports = { app, server, io };
