// ConnectFlow Messenger - Main Application JavaScript

class ConnectFlowApp {
  constructor() {
    this.currentUser = null;
    this.selectedUser = null;
    this.socket = null;
    this.messages = [];
    this.users = [];
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordingStartTime = null;
    
    this.init();
  }
  
  init() {
    this.checkAuth();
    this.bindEvents();
    this.loadStickers();
  }
  
  // Authentication
  async checkAuth() {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        this.currentUser = data.user;
        this.showChatApp();
        this.connectSocket();
      } else {
        this.showAuthContainer();
      }
    } catch (error) {
      this.showAuthContainer();
    }
  }
  
  async login(username, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.currentUser = data.user;
        this.showChatApp();
        this.connectSocket();
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (error) {
      throw error;
    }
  }
  
  async register(username, password) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.currentUser = data.user;
        this.showChatApp();
        this.connectSocket();
      } else {
        throw new Error(data.error || 'Registration failed');
      }
    } catch (error) {
      throw error;
    }
  }
  
  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      if (this.socket) {
        this.socket.disconnect();
      }
      this.currentUser = null;
      this.showAuthContainer();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  
  // Socket.io Connection
  connectSocket() {
    this.socket = io({
      auth: {
        token: this.getCookie('token')
      }
    });
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.socket.emit('authenticate', this.getCookie('token'));
      this.loadUsers();
    });
    
    this.socket.on('receive_message', (message) => {
      if (message.sender_id === this.selectedUser?.id) {
        this.appendMessage(message);
        this.markMessagesAsRead(message.id);
      }
      this.loadUsers();
    });
    
    this.socket.on('message_sent', (message) => {
      this.appendMessage(message);
    });
    
    this.socket.on('user_online', (data) => {
      this.updateUserOnlineStatus(data.userId, true);
    });
    
    this.socket.on('user_offline', (data) => {
      this.updateUserOnlineStatus(data.userId, false);
    });
    
    this.socket.on('user_typing', (data) => {
      if (this.selectedUser?.id === data.userId) {
        document.getElementById('typing-indicator').classList.remove('hidden');
      }
    });
    
    this.socket.on('user_stop_typing', (data) => {
      if (this.selectedUser?.id === data.userId) {
        document.getElementById('typing-indicator').classList.add('hidden');
      }
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
  }
  
  // User Management
  async loadUsers() {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      this.users = data.users;
      this.renderUsersList();
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }
  
  renderUsersList() {
    const container = document.getElementById('users-list');
    const searchTerm = document.getElementById('search-users').value.toLowerCase();
    
    const filteredUsers = this.users.filter(user => 
      user.username.toLowerCase().includes(searchTerm)
    );
    
    container.innerHTML = filteredUsers.map(user => `
      <div class="user-item ${this.selectedUser?.id === user.id ? 'active' : ''}" 
           data-user-id="${user.id}">
        <div class="avatar">
          <img src="${user.avatar || '/avatars/default.png'}" alt="${user.username}">
        </div>
        <div class="user-info">
          <span class="username">${user.username}</span>
          <span class="last-message">${user.is_online ? 'متصل الآن' : 'غير متصل'}</span>
        </div>
        ${user.is_online ? '<span class="status-dot" style="position:absolute;right:45px;top:35px;width:10px;height:10px;background:#10B981;border-radius:50%;"></span>' : ''}
      </div>
    `).join('');
    
    // Add click events
    container.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', () => {
        const userId = parseInt(item.dataset.userId);
        const user = this.users.find(u => u.id === userId);
        if (user) {
          this.selectUser(user);
        }
      });
    });
  }
  
  selectUser(user) {
    this.selectedUser = user;
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('chat-content').classList.remove('hidden');
    
    // Update header
    document.getElementById('chat-username').textContent = user.username;
    document.getElementById('chat-avatar').querySelector('img').src = user.avatar || '/avatars/default.png';
    this.updateUserOnlineStatus(user.id, user.is_online);
    
    // Update users list active state
    document.querySelectorAll('.user-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.userId) === user.id);
    });
    
    // Load messages
    this.loadMessages(user.id);
    
    // Update mobile view
    if (window.innerWidth <= 768) {
      document.querySelector('.sidebar').classList.add('hidden-mobile');
      document.getElementById('chat-content').classList.add('active');
    }
  }
  
  async loadMessages(userId) {
    try {
      const response = await fetch(`/api/messages/${userId}`);
      const data = await response.json();
      this.messages = data.messages;
      this.renderMessages();
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }
  
  renderMessages() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    
    let lastDate = null;
    
    this.messages.forEach(message => {
      // Add date separator if needed
      const messageDate = new Date(message.created_at).toDateString();
      if (messageDate !== lastDate) {
        lastDate = messageDate;
        const dateSeparator = document.createElement('div');
        dateSeparator.className = 'date-separator';
        dateSeparator.innerHTML = `<span>${this.formatDate(message.created_at)}</span>`;
        container.appendChild(dateSeparator);
      }
      
      const isSent = message.sender_id === this.currentUser.id;
      this.appendMessageToContainer(container, message, isSent);
    });
    
    this.scrollToBottom();
  }
  
  appendMessage(message) {
    const container = document.getElementById('messages-container');
    const isSent = message.sender_id === this.currentUser.id;
    
    // Add date separator if it's a new day
    const messageDate = new Date(message.created_at).toDateString();
    const lastElement = container.lastElementChild;
    const lastDate = lastElement?.classList.contains('date-separator') 
      ? lastElement.querySelector('span')?.textContent 
      : null;
    
    if (lastDate !== this.formatDate(message.created_at)) {
      const dateSeparator = document.createElement('div');
      dateSeparator.className = 'date-separator';
      dateSeparator.innerHTML = `<span>${this.formatDate(message.created_at)}</span>`;
      container.appendChild(dateSeparator);
    }
    
    this.appendMessageToContainer(container, message, isSent);
    this.scrollToBottom();
  }
  
  appendMessageToContainer(container, message, isSent) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = message.id;
    
    let content = '';
    
    switch (message.type) {
      case 'image':
        content = `<div class="message-bubble image"><img src="${message.file_url}" alt="Image" loading="lazy"></div>`;
        break;
      case 'audio':
        content = `<div class="message-bubble audio"><audio controls src="${message.file_url}"></audio></div>`;
        break;
      case 'sticker':
        content = `<div class="message-bubble sticker"><img src="${message.content}" alt="Sticker"></div>`;
        break;
      default:
        content = `<div class="message-bubble">${this.escapeHtml(message.content)}</div>`;
    }
    
    messageDiv.innerHTML = `
      <div class="avatar">
        <img src="${isSent ? this.currentUser.avatar : this.selectedUser?.avatar || '/avatars/default.png'}" alt="Avatar">
      </div>
      <div class="message-content">
        ${content}
        <span class="message-time">${this.formatTime(message.created_at)}</span>
      </div>
    `;
    
    container.appendChild(messageDiv);
  }
  
  sendMessage(content, type = 'text', fileUrl = null) {
    if (!this.selectedUser) return;
    
    const messageData = {
      receiverId: this.selectedUser.id,
      content: content || '',
      type,
      fileUrl
    };
    
    this.socket.emit('send_message', messageData);
    
    // Clear input
    document.getElementById('message-input').value = '';
    this.autoResizeTextarea();
  }
  
  // File Upload
  async uploadFile(file, type) {
    const formData = new FormData();
    formData.append(type, file);
    
    try {
      const endpoint = type === 'avatar' ? '/api/upload/avatar' : 
                       type === 'image' ? '/api/upload/image' : '/api/upload/audio';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        return type === 'avatar' ? data.avatar : data.url;
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }
  
  // Voice Recording
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };
      
      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        try {
          const url = await this.uploadFile(audioBlob, 'audio');
          this.sendMessage('رسالة صوتية', 'audio', url);
        } catch (error) {
          console.error('Audio upload error:', error);
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      
      // Update UI
      document.getElementById('recording-indicator').classList.remove('hidden');
      document.getElementById('btn-record').classList.add('hidden');
      document.getElementById('btn-record-stop').classList.remove('hidden');
      
      // Start timer
      this.recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('recording-time').textContent = `${minutes}:${seconds}`;
      }, 1000);
      
    } catch (error) {
      console.error('Recording error:', error);
      alert('لا يمكن الوصول إلى الميكروفون. يرجى التحقق من الأذونات.');
    }
  }
  
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      clearInterval(this.recordingTimer);
      
      // Update UI
      document.getElementById('recording-indicator').classList.add('hidden');
      document.getElementById('btn-record').classList.remove('hidden');
      document.getElementById('btn-record-stop').classList.add('hidden');
    }
  }
  
  // Stickers
  loadStickers() {
    const stickers = this.generateStickers();
    const container = document.getElementById('stickers-grid');
    
    container.innerHTML = stickers.map((sticker, index) => `
      <div class="sticker-item" data-sticker="${sticker}">
        <img src="${sticker}" alt="Sticker ${index + 1}">
      </div>
    `).join('');
    
    container.querySelectorAll('.sticker-item').forEach(item => {
      item.addEventListener('click', () => {
        this.sendMessage(item.dataset.sticker, 'sticker');
        this.toggleStickerPanel(false);
      });
    });
  }
  
  generateStickers() {
    // Generate colorful emoji-like stickers as SVG data URIs
    const emojis = ['😀', '😎', '😍', '😂', '🥰', '😇', '🤔', '😴', '🤯', '🥳', 
                   '😈', '👻', '🤖', '👽', '🎃', '🦄', '🐱', '🐶', '🦊', '🦁'];
    
    return emojis.map(emoji => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
          <defs>
            <linearGradient id="grad${emoji}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')};stop-opacity:1" />
              <stop offset="100%" style="stop-color:#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')};stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" rx="20" fill="url(#grad${emoji})"/>
          <text x="50" y="65" font-size="50" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
        </svg>
      `;
      return 'data:image/svg+xml,' + encodeURIComponent(svg);
    });
  }
  
  toggleStickerPanel(show) {
    const panel = document.getElementById('sticker-panel');
    if (show === undefined) {
      panel.classList.toggle('hidden');
    } else {
      panel.classList.toggle('hidden', !show);
    }
  }
  
  // UI Helpers
  showAuthContainer() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('chat-app').classList.add('hidden');
  }
  
  showChatApp() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('chat-app').classList.remove('hidden');
    
    // Update user info
    document.getElementById('current-username').textContent = this.currentUser.username;
    document.getElementById('current-avatar').querySelector('img').src = 
      this.currentUser.avatar || '/avatars/default.png';
    
    // Load users
    this.loadUsers();
  }
  
  updateUserOnlineStatus(userId, isOnline) {
    if (this.selectedUser?.id === userId) {
      const statusEl = document.getElementById('chat-status');
      statusEl.textContent = isOnline ? 'متصل الآن' : 'غير متصل';
      statusEl.className = `status ${isOnline ? 'online' : ''}`;
    }
    
    this.loadUsers();
  }
  
  scrollToBottom() {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
  }
  
  formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'اليوم';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'الأمس';
    } else {
      return date.toLocaleDateString('ar-EG', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    }
  }
  
  formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop().split(';').shift();
    }
    return null;
  }
  
  autoResizeTextarea() {
    const textarea = document.getElementById('message-input');
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }
  
  // Event Bindings
  bindEvents() {
    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
      });
    });
    
    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      
      try {
        await this.login(username, password);
      } catch (error) {
        document.getElementById('login-error').textContent = error.message;
      }
    });
    
    // Register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('register-username').value;
      const password = document.getElementById('register-password').value;
      const confirm = document.getElementById('register-confirm').value;
      
      if (password !== confirm) {
        document.getElementById('register-error').textContent = 'كلمتا المرور غير متطابقتين';
        return;
      }
      
      try {
        await this.register(username, password);
      } catch (error) {
        document.getElementById('register-error').textContent = error.message;
      }
    });
    
    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => this.logout());
    
    // User search
    document.getElementById('search-users').addEventListener('input', () => {
      this.renderUsersList();
    });
    
    // Back button (mobile)
    document.getElementById('btn-back').addEventListener('click', () => {
      document.querySelector('.sidebar').classList.remove('hidden-mobile');
      document.getElementById('chat-content').classList.remove('active');
    });
    
    // Message input
    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('input', () => {
      this.autoResizeTextarea();
      
      // Typing indicator
      if (this.selectedUser && messageInput.value.trim()) {
        this.socket.emit('typing', { receiverId: this.selectedUser.id });
        
        // Stop typing after 2 seconds of no input
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          this.socket.emit('stop_typing', { receiverId: this.selectedUser.id });
        }, 2000);
      }
    });
    
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // Send button
    document.getElementById('btn-send').addEventListener('click', () => {
      this.sendMessage();
    });
    
    // Sticker button
    document.getElementById('btn-sticker').addEventListener('click', () => {
      this.toggleStickerPanel();
    });
    
    // Close sticker panel
    document.getElementById('btn-close-sticker').addEventListener('click', () => {
      this.toggleStickerPanel(false);
    });
    
    // Close sticker panel when clicking outside
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('sticker-panel');
      const btnSticker = document.getElementById('btn-sticker');
      
      if (!panel.classList.contains('hidden') && 
          !panel.contains(e.target) && 
          !btnSticker.contains(e.target)) {
        this.toggleStickerPanel(false);
      }
    });
    
    // Image button
    document.getElementById('btn-image').addEventListener('click', () => {
      document.getElementById('image-input').click();
    });
    
    document.getElementById('image-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const url = await this.uploadFile(file, 'image');
          this.sendMessage('صورة', 'image', url);
        } catch (error) {
          console.error('Image upload error:', error);
          alert('فشل في رفع الصورة');
        }
      }
      e.target.value = '';
    });
    
    // Record button
    document.getElementById('btn-record').addEventListener('click', () => {
      this.startRecording();
    });
    
    document.getElementById('btn-record-stop').addEventListener('click', () => {
      this.stopRecording();
    });
    
    // Window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        document.querySelector('.sidebar').classList.remove('hidden-mobile');
        document.getElementById('chat-content').classList.remove('active');
      }
    });
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ConnectFlowApp();
});
