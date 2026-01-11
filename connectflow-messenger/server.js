const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

//_secret key for JWT
const JWT_SECRET = 'connectflow-secret-key-2024';

// Initialize SQLite database
const db = new Database('connectflow.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT '/avatars/default.png',
    is_online INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT,
    type TEXT DEFAULT 'text',
    file_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_messages_both ON messages(sender_id, receiver_id);
`);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/avatars', express.static(path.join(__dirname, 'avatars')));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = file.fieldname === 'avatar' ? 'avatars' : 'uploads';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = {
      avatar: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      audio: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg']
    };
    
    const fieldName = req.fieldName || 'file';
    const allowed = allowedTypes[fieldName] || allowedTypes.image;
    
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type for ${fieldName}`));
    }
  }
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
    const userId = result.lastInsertRowid;
    
    // Generate token
    const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, user: { id: userId, username } });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, user: { id: user.id, username: user.username, avatar: user.avatar } });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, avatar, is_online FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// User routes
app.get('/api/users', authenticateToken, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, avatar, is_online 
    FROM users 
    WHERE id != ?
    ORDER BY is_online DESC, username ASC
  `).all(req.user.id);
  
  res.json({ users });
});

// Message routes
app.get('/api/messages/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;
  
  const messages = db.prepare(`
    SELECT m.*, 
           sender.username as sender_username,
           receiver.username as receiver_username
    FROM messages m
    JOIN users sender ON m.sender_id = sender.id
    JOIN users receiver ON m.receiver_id = receiver.id
    WHERE (m.sender_id = ? AND m.receiver_id = ?) 
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at ASC
  `).all(currentUserId, userId, userId, currentUserId);
  
  res.json({ messages });
});

// File upload routes
app.post('/api/upload/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const avatarUrl = `/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarUrl, req.user.id);
  
  res.json({ success: true, avatar: avatarUrl });
});

app.post('/api/upload/image', authenticateToken, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: imageUrl });
  });
});

app.post('/api/upload/audio', authenticateToken, (req, res) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No audio uploaded' });
    }
    
    const audioUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: audioUrl });
  });
});

// Socket.io for real-time messaging
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('authenticate', (token) => {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.userId = user.id;
      socket.username = user.username;
      onlineUsers.set(user.id, socket.id);
      
      // Update online status
      db.prepare('UPDATE users SET is_online = 1 WHERE id = ?').run(user.id);
      
      // Notify others
      io.emit('user_online', { userId: user.id, username: user.username });
      
      console.log(`User ${user.username} authenticated`);
    } catch (error) {
      console.log('Socket authentication failed');
    }
  });
  
  socket.on('send_message', (data) => {
    const { receiverId, content, type, fileUrl } = data;
    const senderId = socket.userId;
    
    if (!senderId) {
      return;
    }
    
    // Save to database
    const result = db.prepare(`
      INSERT INTO messages (sender_id, receiver_id, content, type, file_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(senderId, receiverId, content || '', type, fileUrl || null);
    
    const messageId = result.lastInsertRowid;
    const timestamp = new Date().toISOString();
    
    const message = {
      id: messageId,
      sender_id: senderId,
      receiver_id: receiverId,
      content,
      type,
      file_url: fileUrl,
      created_at: timestamp
    };
    
    // Send to receiver if online
    const receiverSocketId = onlineUsers.get(parseInt(receiverId));
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive_message', message);
    }
    
    // Send back to sender for confirmation
    socket.emit('message_sent', message);
  });
  
  socket.on('typing', (data) => {
    const { receiverId } = data;
    const receiverSocketId = onlineUsers.get(parseInt(receiverId));
    
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', {
        userId: socket.userId,
        username: socket.username
      });
    }
  });
  
  socket.on('stop_typing', (data) => {
    const { receiverId } = data;
    const receiverSocketId = onlineUsers.get(parseInt(receiverId));
    
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_stop_typing', {
        userId: socket.userId
      });
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      
      // Update offline status
      db.prepare('UPDATE users SET is_online = 0 WHERE id = ?').run(socket.userId);
      
      // Notify others
      io.emit('user_offline', { userId: socket.userId });
      
      console.log(`User ${socket.username} disconnected`);
    }
  });
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create necessary directories
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
if (!fs.existsSync('avatars')) {
  fs.mkdirSync('avatars');
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║     ConnectFlow Messenger Started!            ║
║                                              ║
║   Server running on:                         ║
║   http://localhost:${PORT}                       ║
║                                              ║
║   Features:                                  ║
║   ✓ Real-time messaging                     ║
║   ✓ Image sharing                           ║
║   ✓ Voice messages                          ║
║   ✓ Stickers & Emojis                       ║
║   ✓ User authentication                     ║
║                                              ║
╚════════════════════════════════════════════════╝
  `);
});
