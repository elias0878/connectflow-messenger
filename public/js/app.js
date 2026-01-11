/**
 * ConnectFlow Messenger - Simplified Working Version
 */

class ConnectFlowApp {
  constructor() {
    this.currentUser = null;
    this.selectedChat = null;
    this.socket = null;
    this.messages = [];
    this.chats = [];
    this.users = [];
    this.isRecording = false;
    this.recordingStartTime = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordingTimer = null;
    this.typingTimeout = null;
    this.replyMessage = null;
    this.darkMode = false;
    
    this.init();
  }

  init() {
    this.loadSettings();
    this.checkAuth();
    this.bindEvents();
  }

  // ==================== Authentication ====================

  async checkAuth() {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        this.currentUser = data.user;
        this.showMainApp();
        this.connectSocket();
        this.loadData();
      } else {
        this.showAuthScreen();
      }
    } catch (error) {
      console.error('Auth check error:', error);
      this.showAuthScreen();
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
        this.showMainApp();
        this.connectSocket();
        this.loadData();
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
        this.showMainApp();
        this.connectSocket();
        this.loadData();
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
      this.showAuthScreen();
      this.saveSettings();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // ==================== Socket Connection ====================

  connectSocket() {
    const token = this.getCookie('token');
    if (!token) return;
    
    this.socket = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.socket.emit('authenticate', token);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    this.socket.on('receive_message', (message) => {
      this.handleReceiveMessage(message);
    });

    this.socket.on('message_sent', (message) => {
      this.handleMessageSent(message);
    });

    this.socket.on('user_online', (data) => {
      this.updateUserOnlineStatus(data.userId, true);
    });

    this.socket.on('user_offline', (data) => {
      this.updateUserOnlineStatus(data.userId, false);
    });

    this.socket.on('user_typing', (data) => {
      if (this.selectedChat?.id === data.userId) {
        this.showTypingIndicator();
      }
    });

    this.socket.on('user_stop_typing', (data) => {
      this.hideTypingIndicator();
    });
  }

  handleReceiveMessage(message) {
    this.messages.push(message);
    
    // Update or create chat
    const chatKey = message.sender_id === this.currentUser.id ? message.receiver_id : message.sender_id;
    let chat = this.chats.find(c => c.id === chatKey);
    
    if (!chat) {
      const user = this.users.find(u => u.id === chatKey);
      chat = {
        id: chatKey,
        type: 'private',
        name: user?.username || 'مستخدم',
        avatar: user?.avatar || '/avatars/default.png',
        lastMessage: this.formatLastMessage(message),
        lastMessageTime: message.created_at,
        unreadCount: 0,
        is_online: user?.is_online || 0
      };
      this.chats.unshift(chat);
    }
    
    chat.lastMessage = this.formatLastMessage(message);
    chat.lastMessageTime = message.created_at;
    
    if (message.sender_id !== this.currentUser.id && this.selectedChat?.id !== chatKey) {
      chat.unreadCount = (chat.unreadCount || 0) + 1;
    }
    
    this.renderChatsList();
    
    if (this.selectedChat?.id === chatKey) {
      this.appendMessage(message, false);
      this.markMessagesAsRead([message.id]);
    }
    
    this.playNotificationSound();
  }

  handleMessageSent(message) {
    const existingIndex = this.messages.findIndex(m => m.tempId === message.tempId);
    if (existingIndex !== -1) {
      this.messages[existingIndex] = { ...message, tempId: undefined };
    } else {
      this.messages.push(message);
    }
    
    const messageElement = document.querySelector(`[data-temp-id="${message.tempId}"]`);
    if (messageElement) {
      messageElement.dataset.messageId = message.id;
      messageElement.dataset.tempId = '';
      messageElement.classList.remove('pending');
    }
  }

  formatLastMessage(message) {
    if (message.type === 'image') return '📷 صورة';
    if (message.type === 'audio') return '🎵 رسالة صوتية';
    if (message.type === 'video') return '🎬 فيديو';
    if (message.type === 'document') return '📄 مستند';
    if (message.type === 'location') return '📍 موقع';
    if (message.type === 'contact') return '👤 جهة اتصال';
    if (message.content?.length > 30) return message.content.substring(0, 30) + '...';
    return message.content || 'وسائط';
  }

  // ==================== Data Loading ====================

  async loadData() {
    await Promise.all([
      this.loadChats(),
      this.loadUsers(),
      this.loadCalls()
    ]);
  }

  async loadChats() {
    try {
      const response = await fetch('/api/chats');
      const data = await response.json();
      this.chats = data.chats || [];
      this.renderChatsList();
    } catch (error) {
      console.error('Error loading chats:', error);
      this.chats = [];
    }
  }

  async loadUsers() {
    try {
      const response = await fetch('/api/contacts');
      const data = await response.json();
      this.users = data.contacts || [];
      this.renderNewChatContacts();
    } catch (error) {
      console.error('Error loading users:', error);
      this.users = [];
    }
  }

  async loadCalls() {
    try {
      const response = await fetch('/api/calls');
      const data = await response.json();
      this.renderCallsList(data.calls || []);
    } catch (error) {
      console.error('Error loading calls:', error);
    }
  }

  async loadMessages(userId) {
    try {
      const response = await fetch(`/api/messages/${userId}`);
      const data = await response.json();
      this.messages = data.messages || [];
      this.renderMessages();
    } catch (error) {
      console.error('Error loading messages:', error);
      this.messages = [];
      this.renderMessages();
    }
  }

  // ==================== Messaging ====================

  sendMessage(content, type = 'text', fileUrl = null) {
    if (!this.selectedChat) return;

    const tempId = Date.now().toString();
    const message = {
      tempId,
      sender_id: this.currentUser.id,
      receiver_id: this.selectedChat.id,
      content: content || '',
      type,
      file_url: fileUrl || null,
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'pending'
    };

    this.messages.push(message);
    this.appendMessage(message, true);

    this.socket.emit('send_message', {
      receiverId: this.selectedChat.id,
      content: content || '',
      type,
      fileUrl
    });

    document.getElementById('message-input').value = '';
    this.autoResizeTextarea();
  }

  appendMessage(message, isSent) {
    const container = document.getElementById('chat-content');
    const messageHtml = this.createMessageElement(message, isSent);
    container.insertAdjacentHTML('beforeend', messageHtml);
    this.scrollToBottom();
  }

  createMessageElement(message, isSent) {
    const time = this.formatTime(message.created_at);
    const date = this.formatDate(message.created_at);
    
    let content = '';
    
    switch (message.type) {
      case 'image':
        content = `<div class="message-bubble image" onclick="app.viewImage('${message.file_url}')">
          <img src="${message.file_url}" alt="صورة" loading="lazy">
        </div>`;
        break;
      case 'audio':
        content = `<div class="message-bubble audio">
          <button class="audio-play-btn" onclick="app.playAudio(this, '${message.file_url}')">
            <i class="fas fa-play"></i>
          </button>
          <div class="audio-info">
            <span class="audio-duration">0:30</span>
          </div>
        </div>`;
        break;
      case 'video':
        content = `<div class="message-bubble video">
          <video src="${message.file_url}" controls></video>
        </div>`;
        break;
      case 'document':
        content = `<div class="message-bubble document">
          <div class="document-icon"><i class="fas fa-file-pdf"></i></div>
          <div class="document-info">
            <span class="document-name">${message.content || 'مستند'}</span>
          </div>
          <button class="document-download" onclick="window.open('${message.file_url}', '_blank')">
            <i class="fas fa-download"></i>
          </button>
        </div>`;
        break;
      default:
        content = `<div class="message-bubble text">${this.escapeHtml(message.content)}</div>`;
    }

    const statusIcons = isSent ? '<span class="message-status sent"><i class="fas fa-clock"></i></span>' : '';

    return `
      <div class="message ${isSent ? 'sent' : 'received'}" 
           data-message-id="${message.id || message.tempId}" 
           data-temp-id="${message.tempId || ''}"
           onclick="app.showMessageContextMenu(event, '${message.id || message.tempId}')"
           ondblclick="app.startReply('${message.id || message.tempId}')">
        ${!isSent ? `
          <div class="message-avatar">
            <img src="${this.selectedChat?.avatar || '/avatars/default.png'}" alt="">
          </div>
        ` : ''}
        <div class="message-content">
          ${content}
          <div class="message-meta">
            <span class="message-time">${time}</span>
            ${statusIcons}
          </div>
        </div>
      </div>
    `;
  }

  renderMessages() {
    const container = document.getElementById('chat-content');
    container.innerHTML = '';
    
    let lastDate = null;
    
    this.messages.forEach(message => {
      const messageDate = this.formatDate(message.created_at);
      
      if (messageDate !== lastDate) {
        lastDate = messageDate;
        const dateHtml = `<div class="date-separator"><span>${messageDate}</span></div>`;
        container.insertAdjacentHTML('beforeend', dateHtml);
      }

      const isSent = message.sender_id === this.currentUser.id;
      const messageHtml = this.createMessageElement(message, isSent);
      container.insertAdjacentHTML('beforeend', messageHtml);
    });

    this.scrollToBottom();
  }

  async markMessagesAsRead(messageIds) {
    if (!messageIds || messageIds.length === 0) return;
    
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds })
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  async deleteMessage(messageId) {
    try {
      await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
      
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement) {
        messageElement.style.opacity = '0';
        messageElement.style.transform = 'translateX(-20px)';
        setTimeout(() => messageElement.remove(), 300);
      }
      
      this.messages = this.messages.filter(m => m.id !== messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }

  // ==================== Chat Operations ====================

  renderChatsList() {
    const container = document.getElementById('chats-list');
    const searchTerm = document.getElementById('chat-search')?.value?.toLowerCase() || '';
    
    let filteredChats = this.chats.filter(chat => 
      chat.name?.toLowerCase().includes(searchTerm)
    );

    if (filteredChats.length === 0) {
      container.innerHTML = `
        <div class="empty-chats">
          <div class="empty-icon"><i class="fas fa-comment-slash"></i></div>
          <h3>لا توجد دردشات بعد</h3>
          <p>ابدأ محادثة جديدة مع أصدقائك</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredChats.map(chat => this.createChatItem(chat)).join('');

    container.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const chatId = item.dataset.chatId;
        this.openChat(chatId);
      });
    });
  }

  createChatItem(chat) {
    const time = this.formatChatTime(chat.lastMessageTime);
    const unreadBadge = chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount}</span>` : '';
    const onlineIndicator = chat.is_online ? '<span class="online-indicator"></span>' : '';

    return `
      <div class="chat-item" data-chat-id="${chat.id}">
        <div class="chat-avatar">
          <img src="${chat.avatar || '/avatars/default.png'}" alt="${chat.name}">
          ${onlineIndicator}
        </div>
        <div class="chat-info">
          <div class="chat-header-info">
            <span class="chat-name">${chat.name}</span>
            <span class="chat-time">${time}</span>
          </div>
          <div class="chat-preview">
            <span class="chat-last-message">${chat.lastMessage || 'لا توجد رسائل'}</span>
            ${unreadBadge}
          </div>
        </div>
      </div>
    `;
  }

  async openChat(chatId) {
    const chat = this.chats.find(c => c.id === chatId) || this.users.find(u => u.id === chatId);
    if (!chat) return;

    this.selectedChat = chat;
    
    if (chat.unreadCount) {
      chat.unreadCount = 0;
      this.renderChatsList();
    }

    document.getElementById('chat-window').classList.remove('hidden');
    document.getElementById('new-chat-panel').classList.add('hidden');
    document.getElementById('new-group-panel').classList.add('hidden');
    document.getElementById('settings-panel').classList.add('hidden');

    this.updateChatHeader(chat);
    await this.loadMessages(chatId);
  }

  updateChatHeader(chat) {
    const header = document.getElementById('chat-user-info');
    header.innerHTML = `
      <div class="avatar">
        <img src="${chat.avatar || '/avatars/default.png'}" alt="${chat.name}">
      </div>
      <div class="user-details">
        <span class="username">${chat.name}</span>
        <span class="status ${chat.is_online ? 'online' : ''}" id="chat-status-text">
          ${chat.is_online ? 'متصل الآن' : 'غير متصل'}
        </span>
      </div>
    `;
  }

  closeChat() {
    this.selectedChat = null;
    document.getElementById('chat-window').classList.add('hidden');
    this.hideTypingIndicator();
    this.hideReplyPreview();
  }

  // ==================== Users & Contacts ====================

  renderNewChatContacts() {
    const container = document.getElementById('new-chat-contacts');
    if (this.users.length === 0) {
      container.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--text-muted);">لا توجد جهات اتصال بعد</p>';
      return;
    }
    
    container.innerHTML = this.users.map(user => `
      <div class="contact-item" data-user-id="${user.id}" onclick="app.startChatWithUser('${user.id}')">
        <div class="contact-avatar">
          <img src="${user.avatar || '/avatars/default.png'}" alt="${user.username}">
        </div>
        <div class="contact-info">
          <span class="contact-name">${user.username}</span>
          <span class="contact-status">${user.is_online ? 'متصل الآن' : 'غير متصل'}</span>
        </div>
      </div>
    `).join('');
  }

  async startChatWithUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    let chat = this.chats.find(c => c.id === userId);
    if (!chat) {
      chat = {
        id: userId,
        type: 'private',
        name: user.username,
        avatar: user.avatar || '/avatars/default.png',
        lastMessage: '',
        lastMessageTime: new Date().toISOString(),
        unreadCount: 0,
        is_online: user.is_online || 0
      };
      this.chats.unshift(chat);
    }

    this.openChat(chat.id);
    document.getElementById('new-chat-panel').classList.add('hidden');
    this.renderChatsList();
  }

  // ==================== Calls ====================

  renderCallsList(calls) {
    const container = document.getElementById('calls-list');
    
    if (calls.length === 0) {
      container.innerHTML = `
        <div class="empty-calls">
          <div class="empty-icon"><i class="fas fa-phone-slash"></i></div>
          <h3>لا توجد مكالمات</h3>
          <p>ابدأ مكالمة مع صديق</p>
        </div>
      `;
      return;
    }

    container.innerHTML = calls.map(call => `
      <div class="call-item" data-call-id="${call.id}">
        <div class="call-avatar">
          <img src="${call.userAvatar || '/avatars/default.png'}" alt="${call.userName}">
        </div>
        <div class="call-info">
          <span class="call-name">${call.userName}</span>
          <span class="call-details">
            <i class="fas fa-arrow-${call.direction === 'outgoing' ? 'up-right' : 'down-left'}"></i>
            ${this.formatCallTime(call.timestamp)}
            <span class="call-duration">${call.duration || '0:00'}</span>
          </span>
        </div>
        <div class="call-actions">
          <button class="call-action-btn" onclick="app.startCall('${call.userId}', '${call.type}')">
            <i class="fas fa-phone-alt ${call.type === 'video' ? 'video' : ''}"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  startCall(userId, type) {
    console.log(`Starting ${type || 'voice'} call with user ${userId}`);
    alert('ميزة المكالمات ستكون متاحة قريباً!');
  }

  // ==================== File Upload ====================

  async uploadFile(file, type) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`/api/upload/${type}`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.success) {
        return data.url;
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  async handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const url = await this.uploadFile(file, type);
      
      if (type === 'image') {
        this.sendMessage(file.name, 'image', url);
      } else if (type === 'audio') {
        this.sendMessage('رسالة صوتية', 'audio', url);
      } else if (type === 'camera') {
        this.sendMessage('صورة', 'image', url);
      }
    } catch (error) {
      console.error('File upload error:', error);
      alert('فشل في رفع الملف');
    }
    
    event.target.value = '';
  }

  // ==================== Voice Recording ====================

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.recordingStartTime = Date.now();

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
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;

      document.getElementById('voice-record-panel').classList.remove('hidden');
      document.getElementById('mic-btn').classList.add('hidden');
      document.getElementById('send-btn').classList.remove('hidden');

      this.recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('record-timer').textContent = `${minutes}:${seconds}`;
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
    }

    document.getElementById('voice-record-panel').classList.add('hidden');
    document.getElementById('mic-btn').classList.remove('hidden');
    document.getElementById('send-btn').classList.add('hidden');
  }

  // ==================== Audio Player ====================

  playAudio(button, url) {
    const audioContainer = button.closest('.audio-message') || button.closest('.message-bubble.audio');
    
    const audio = new Audio(url);
    
    if (button.querySelector('i').classList.contains('fa-play')) {
      button.querySelector('i').classList.remove('fa-play');
      button.querySelector('i').classList.add('fa-pause');
      
      audio.play();
      audio.onended = () => {
        button.querySelector('i').classList.remove('fa-pause');
        button.querySelector('i').classList.add('fa-play');
      };
    } else {
      audio.pause();
      button.querySelector('i').classList.remove('fa-pause');
      button.querySelector('i').classList.add('fa-play');
    }
  }

  // ==================== Reply ====================

  startReply(messageId) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) return;

    this.replyMessage = message;
    
    const replyPreview = document.getElementById('reply-preview');
    replyPreview.querySelector('.reply-sender').textContent = message.sender_id === this.currentUser.id ? 'أنت' : this.selectedChat?.name || 'مستخدم';
    replyPreview.querySelector('.reply-content').textContent = message.content?.substring(0, 50) || 'وسائط';
    replyPreview.classList.remove('hidden');
  }

  hideReplyPreview() {
    this.replyMessage = null;
    document.getElementById('reply-preview').classList.add('hidden');
  }

  // ==================== Context Menu ====================

  showMessageContextMenu(event, messageId) {
    event.stopPropagation();
    
    const menu = document.getElementById('context-menu');
    const backdrop = document.getElementById('context-backdrop');
    
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.classList.remove('hidden');
    backdrop.classList.remove('hidden');

    document.getElementById('context-reply').onclick = () => {
      this.startReply(messageId);
      this.hideContextMenu();
    };

    document.getElementById('context-copy').onclick = () => {
      this.copyMessage(messageId);
      this.hideContextMenu();
    };

    document.getElementById('context-forward').onclick = () => {
      this.showForwardPanel(messageId);
      this.hideContextMenu();
    };

    document.getElementById('context-delete').onclick = () => {
      this.showDeleteConfirmation(messageId);
      this.hideContextMenu();
    };
  }

  hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
    document.getElementById('context-backdrop').classList.add('hidden');
  }

  copyMessage(messageId) {
    const message = this.messages.find(m => m.id === messageId);
    if (message?.content) {
      navigator.clipboard.writeText(message.content);
      this.showToast('تم نسخ النص');
    }
  }

  // ==================== Delete Confirmation ====================

  showDeleteConfirmation(messageId) {
    const dialog = document.getElementById('confirm-dialog');
    dialog.classList.remove('hidden');
    
    document.getElementById('confirm-ok').onclick = () => {
      this.deleteMessage(messageId);
      dialog.classList.add('hidden');
    };
    
    document.getElementById('confirm-cancel').onclick = () => {
      dialog.classList.add('hidden');
    };
  }

  // ==================== Forward ====================

  showForwardPanel(messageId) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) return;
    
    this.forwardMessage = message;
    const forwardPanel = document.getElementById('forward-panel');
    forwardPanel.classList.remove('hidden');
    
    const forwardList = document.getElementById('forward-list');
    forwardList.innerHTML = this.chats.map(chat => `
      <div class="forward-item" data-chat-id="${chat.id}" onclick="app.forwardToChat('${chat.id}')">
        <div class="forward-avatar">
          <img src="${chat.avatar}" alt="${chat.name}">
        </div>
        <div class="forward-info">
          <span class="forward-name">${chat.name}</span>
        </div>
      </div>
    `).join('');
  }

  async forwardToChat(chatId) {
    if (!this.forwardMessage) return;

    this.socket.emit('send_message', {
      receiverId: chatId,
      content: this.forwardMessage.content || '',
      type: this.forwardMessage.type,
      fileUrl: this.forwardMessage.file_url
    });

    document.getElementById('forward-panel').classList.add('hidden');
    this.forwardMessage = null;
    this.showToast('تم إعادة إرسال الرسالة');
  }

  // ==================== Media Viewer ====================

  viewImage(url) {
    const viewer = document.getElementById('media-viewer');
    const img = document.getElementById('media-image');
    const video = document.getElementById('media-video');
    
    video.classList.add('hidden');
    img.classList.remove('hidden');
    img.src = url;
    
    viewer.classList.remove('hidden');
  }

  // ==================== Panels ====================

  showNewChatPanel() {
    document.getElementById('new-chat-panel').classList.remove('hidden');
    this.renderNewChatContacts();
  }

  showSettingsPanel() {
    document.getElementById('settings-panel').classList.remove('hidden');
    this.updateSettingsUI();
  }

  showNewGroupPanel() {
    document.getElementById('new-group-panel').classList.remove('hidden');
    document.getElementById('new-chat-panel').classList.add('hidden');
  }

  async createGroup() {
    const name = document.getElementById('group-name').value.trim();
    if (!name) {
      alert('يرجى إدخال اسم المجموعة');
      return;
    }

    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, participantIds: [] })
      });

      const data = await response.json();
      if (data.success) {
        document.getElementById('new-group-panel').classList.add('hidden');
        this.openChat(data.group.id);
        this.showToast('تم إنشاء المجموعة');
      }
    } catch (error) {
      console.error('Create group error:', error);
    }
  }

  updateSettingsUI() {
    if (this.currentUser) {
      document.getElementById('settings-avatar').src = this.currentUser.avatar || '/avatars/default.png';
      document.getElementById('settings-name').textContent = this.currentUser.username;
      document.getElementById('dark-mode-toggle').checked = this.darkMode;
    }
  }

  // ==================== View Navigation ====================

  switchView(view) {
    this.currentView = view;
    
    document.querySelectorAll('.header-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
    
    document.querySelectorAll('.content-view').forEach(content => {
      content.classList.toggle('active', content.id === `${view}-view`);
    });
  }

  // ==================== Dark Mode ====================

  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    document.body.classList.toggle('dark-mode', this.darkMode);
    this.saveSettings();
  }

  // ==================== Settings ====================

  loadSettings() {
    const settings = JSON.parse(localStorage.getItem('connectflow-settings') || '{}');
    this.darkMode = settings.darkMode || false;
    document.body.classList.toggle('dark-mode', this.darkMode);
  }

  saveSettings() {
    localStorage.setItem('connectflow-settings', JSON.stringify({ darkMode: this.darkMode }));
  }

  // ==================== Utilities ====================

  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
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
      return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  }

  formatChatTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'د';
    if (diff < 86400000) return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  }

  formatCallTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 86400000) {
      return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) {
      return date.toLocaleDateString('ar-EG', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    }
  }

  escapeHtml(text) {
    if (!text) return '';
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

  scrollToBottom() {
    const container = document.getElementById('chat-content');
    container.scrollTop = container.scrollHeight;
  }

  autoResizeTextarea() {
    const textarea = document.getElementById('message-input');
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }

  showTypingIndicator() {
    document.getElementById('typing-indicator').classList.remove('hidden');
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    document.getElementById('typing-indicator').classList.add('hidden');
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  playNotificationSound() {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  updateUserOnlineStatus(userId, isOnline) {
    const chat = this.chats.find(c => c.id === userId);
    if (chat) {
      chat.is_online = isOnline ? 1 : 0;
      this.renderChatsList();
    }
    
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.is_online = isOnline ? 1 : 0;
    }
    
    if (this.selectedChat?.id === userId) {
      const statusEl = document.getElementById('chat-status-text');
      statusEl.textContent = isOnline ? 'متصل الآن' : 'غير متصل';
      statusEl.className = `status ${isOnline ? 'online' : ''}`;
    }
  }

  // ==================== Event Bindings ====================

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

    // Password toggle
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const icon = btn.querySelector('i');
        if (input.type === 'password') {
          input.type = 'text';
          icon.classList.remove('fa-eye');
          icon.classList.add('fa-eye-slash');
        } else {
          input.type = 'password';
          icon.classList.remove('fa-eye-slash');
          icon.classList.add('fa-eye');
        }
      });
    });

    // Header tabs
    document.querySelectorAll('.header-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchView(tab.dataset.view));
    });

    // Dropdown menu
    document.getElementById('header-menu-btn').addEventListener('click', () => {
      document.getElementById('dropdown-menu').classList.toggle('active');
    });

    document.getElementById('dropdown-backdrop').addEventListener('click', () => {
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    document.getElementById('dropdown-settings').addEventListener('click', (e) => {
      e.preventDefault();
      this.showSettingsPanel();
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    document.getElementById('dropdown-new-group').addEventListener('click', (e) => {
      e.preventDefault();
      this.showNewGroupPanel();
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    document.getElementById('dropdown-logout').addEventListener('click', (e) => {
      e.preventDefault();
      this.logout();
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    // Chat back
    document.getElementById('chat-back').addEventListener('click', () => this.closeChat());

    // Message input
    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('input', () => {
      this.autoResizeTextarea();
      
      if (this.selectedChat && messageInput.value.trim()) {
        this.socket.emit('typing', { receiverId: this.selectedChat.id });
        
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          this.socket.emit('stop_typing', { receiverId: this.selectedChat.id });
        }, 2000);
      }
    });

    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
    document.getElementById('mic-btn').addEventListener('click', () => this.startRecording());
    document.getElementById('record-close').addEventListener('click', () => this.stopRecording());
    document.getElementById('send-voice').addEventListener('click', () => this.stopRecording());

    // Input actions
    document.getElementById('emoji-btn').addEventListener('click', () => {
      document.getElementById('emoji-panel').classList.toggle('hidden');
      document.getElementById('attach-panel').classList.add('hidden');
    });

    document.getElementById('attach-btn').addEventListener('click', () => {
      document.getElementById('attach-panel').classList.toggle('hidden');
      document.getElementById('emoji-panel').classList.add('hidden');
    });

    document.getElementById('camera-btn').addEventListener('click', () => {
      document.getElementById('camera-input').click();
    });

    // Attachment options
    document.querySelectorAll('.attach-option').forEach(option => {
      option.addEventListener('click', () => {
        const type = option.dataset.type;
        const inputMap = {
          'document': 'document-input',
          'gallery': 'image-input',
          'audio': 'audio-input',
          'camera': 'camera-input',
          'contact': 'file-input'
        };
        if (inputMap[type]) {
          document.getElementById(inputMap[type]).click();
        }
        document.getElementById('attach-panel').classList.add('hidden');
      });
    });

    // File inputs
    document.getElementById('image-input').addEventListener('change', (e) => this.handleFileSelect(e, 'image'));
    document.getElementById('audio-input').addEventListener('change', (e) => this.handleFileSelect(e, 'audio'));
    document.getElementById('camera-input').addEventListener('change', (e) => this.handleFileSelect(e, 'camera'));
    document.getElementById('document-input').addEventListener('change', (e) => this.handleFileSelect(e, 'document'));
    document.getElementById('avatar-input').addEventListener('change', (e) => this.handleFileSelect(e, 'avatar'));

    // FAB
    document.getElementById('main-fab').addEventListener('click', () => this.showNewChatPanel());
    document.getElementById('fab-new-chat').addEventListener('click', () => this.showNewChatPanel());
    document.getElementById('fab-new-group').addEventListener('click', () => this.showNewGroupPanel());

    // Panels close
    document.getElementById('close-new-chat').addEventListener('click', () => {
      document.getElementById('new-chat-panel').classList.add('hidden');
    });
    document.getElementById('close-settings').addEventListener('click', () => {
      document.getElementById('settings-panel').classList.add('hidden');
    });
    document.getElementById('close-new-group').addEventListener('click', () => {
      document.getElementById('new-group-panel').classList.add('hidden');
    });
    document.getElementById('close-forward').addEventListener('click', () => {
      document.getElementById('forward-panel').classList.add('hidden');
    });
    document.getElementById('create-new-group-btn').addEventListener('click', () => {
      this.showNewGroupPanel();
      document.getElementById('new-chat-panel').classList.add('hidden');
    });
    document.getElementById('create-group-action').addEventListener('click', () => this.createGroup());

    // Reply preview
    document.getElementById('reply-preview-close').addEventListener('click', () => this.hideReplyPreview());

    // Context menu backdrop
    document.getElementById('context-backdrop').addEventListener('click', () => this.hideContextMenu());

    // Confirm dialog
    document.querySelector('.confirm-backdrop')?.addEventListener('click', () => {
      document.getElementById('confirm-dialog').classList.add('hidden');
    });

    // Media viewer
    document.getElementById('media-close').addEventListener('click', () => {
      document.getElementById('media-viewer').classList.add('hidden');
    });

    // Dark mode
    document.getElementById('dark-mode-toggle').addEventListener('change', () => this.toggleDarkMode());

    // Search
    document.getElementById('chat-search')?.addEventListener('input', () => this.renderChatsList());

    // Click outside to close panels
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown-menu') && !e.target.closest('#header-menu-btn')) {
        document.getElementById('dropdown-menu').classList.remove('active');
      }
      if (!e.target.closest('.emoji-panel') && !e.target.closest('#emoji-btn')) {
        document.getElementById('emoji-panel').classList.add('hidden');
      }
      if (!e.target.closest('.attach-panel') && !e.target.closest('#attach-btn')) {
        document.getElementById('attach-panel').classList.add('hidden');
      }
      if (!e.target.closest('.context-menu')) {
        this.hideContextMenu();
      }
    });

    // Notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // ==================== UI Helpers ====================

  showAuthScreen() {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('main-screen').classList.add('hidden');
  }

  showMainApp() {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    
    if (this.currentUser) {
      // Update UI with user info
    }
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ConnectFlowApp();
});
