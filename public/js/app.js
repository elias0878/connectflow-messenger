/**
 * ConnectFlow Messenger - WhatsApp Style Application
 * Features: Chats, Status, Calls, Groups, Media, and more
 */

class ConnectFlowApp {
  constructor() {
    // Core state
    this.currentUser = null;
    this.selectedChat = null;
    this.selectedUser = null;
    this.socket = null;
    this.messages = new Map();
    this.chats = [];
    this.users = [];
    this.groups = [];
    this.statuses = [];
    this.calls = [];
    
    // UI state
    this.currentView = 'chats';
    this.isRecording = false;
    this.recordingStartTime = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordingTimer = null;
    this.typingTimeout = null;
    this.replyMessage = null;
    this.forwardMessage = null;
    this.selectedMessages = new Set();
    this.isMultiSelectMode = false;
    
    // Media state
    this.activeAudio = null;
    this.imageViewerOpen = false;
    
    // Search state
    this.searchMode = false;
    this.searchQuery = '';
    
    // Dark mode
    this.darkMode = false;
    
    // Initialize
    this.init();
  }

  init() {
    this.loadSettings();
    this.checkAuth();
    this.bindEvents();
    this.loadEmojis();
    this.generateStickers();
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
        this.loadChats();
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
        this.loadChats();
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
    this.socket = io({
      auth: {
        token: this.getCookie('token')
      },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.socket.emit('authenticate', this.getCookie('token'));
      this.loadChats();
      this.loadStatuses();
      this.loadCalls();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    // Message events
    this.socket.on('receive_message', (message) => {
      this.handleReceiveMessage(message);
    });

    this.socket.on('message_sent', (message) => {
      this.handleMessageSent(message);
    });

    this.socket.on('message_delivered', (data) => {
      this.updateMessageStatus(data.messageId, 'delivered');
    });

    this.socket.on('message_read', (data) => {
      this.updateMessageStatus(data.messageId, 'read');
    });

    // User status events
    this.socket.on('user_online', (data) => {
      this.updateUserOnlineStatus(data.userId, true);
    });

    this.socket.on('user_offline', (data) => {
      this.updateUserOnlineStatus(data.userId, false);
    });

    // Typing events
    this.socket.on('user_typing', (data) => {
      if (this.selectedChat?.id === data.userId) {
        this.showTypingIndicator();
      }
    });

    this.socket.on('user_stop_typing', (data) => {
      this.hideTypingIndicator();
    });

    // Group events
    this.socket.on('group_created', (group) => {
      this.groups.push(group);
      this.renderGroups();
      this.loadChats();
    });

    this.socket.on('group_updated', (group) => {
      const index = this.groups.findIndex(g => g.id === group.id);
      if (index !== -1) {
        this.groups[index] = group;
      }
      this.renderGroups();
    });

    // Status events
    this.socket.on('status_update', (status) => {
      this.handleStatusUpdate(status);
    });

    // Call events
    this.socket.on('incoming_call', (data) => {
      this.handleIncomingCall(data);
    });

    this.socket.on('call_ended', (data) => {
      this.handleCallEnded(data);
    });

    // Message reactions
    this.socket.on('message_reaction', (data) => {
      this.handleMessageReaction(data);
    });
  }

  // ==================== Message Handling ====================

  handleReceiveMessage(message) {
    // Add to messages map
    const chatKey = this.getChatKey(message.sender_id, message.receiver_id);
    if (!this.messages.has(chatKey)) {
      this.messages.set(chatKey, []);
    }
    this.messages.get(chatKey).push(message);

    // Update or add chat
    this.updateChatFromMessage(message);

    // If chatting with this user, add to view
    if (this.selectedChat?.id === message.sender_id || this.selectedChat?.id === message.receiver_id) {
      this.appendMessage(message, message.sender_id === this.currentUser.id);
      this.markMessagesAsRead([message.id]);
    }

    // Show notification
    this.showMessageNotification(message);

    // Play notification sound
    this.playNotificationSound();
  }

  handleMessageSent(message) {
    const chatKey = this.getChatKey(message.sender_id, message.receiver_id);
    if (!this.messages.has(chatKey)) {
      this.messages.set(chatKey, []);
    }
    
    const messages = this.messages.get(chatKey);
    const existingIndex = messages.findIndex(m => m.tempId === message.tempId);
    
    if (existingIndex !== -1) {
      messages[existingIndex] = { ...message, tempId: undefined };
    } else {
      messages.push(message);
    }

    if (this.selectedChat && chatKey === this.getChatKey(this.selectedChat.id, this.currentUser.id)) {
      const messageElement = document.querySelector(`[data-temp-id="${message.tempId}"]`);
      if (messageElement) {
        messageElement.dataset.messageId = message.id;
        messageElement.classList.add('sent');
        messageElement.classList.remove('pending');
      }
    }
  }

  updateChatFromMessage(message) {
    const otherUserId = message.sender_id === this.currentUser.id ? message.receiver_id : message.sender_id;
    let chat = this.chats.find(c => c.id === otherUserId);
    
    if (!chat) {
      const user = this.users.find(u => u.id === otherUserId) || { 
        id: otherUserId, 
        username: 'مستخدم',
        avatar: '/avatars/default.png'
      };
      chat = {
        id: otherUserId,
        type: 'private',
        name: user.username,
        avatar: user.avatar,
        lastMessage: null,
        lastMessageTime: null,
        unreadCount: 0,
        isOnline: user.is_online || false,
        isPinned: false,
        isArchived: false,
        isMuted: false,
        starred: false
      };
      this.chats.unshift(chat);
    }

    chat.lastMessage = this.formatLastMessage(message);
    chat.lastMessageTime = message.created_at;
    
    if (message.sender_id !== this.currentUser.id && this.selectedChat?.id !== otherUserId) {
      chat.unreadCount = (chat.unreadCount || 0) + 1;
    }

    this.renderChatsList();
  }

  formatLastMessage(message) {
    if (message.type === 'image') return '📷 صورة';
    if (message.type === 'audio') return '🎵 رسالة صوتية';
    if (message.type === 'video') return '🎬 فيديو';
    if (message.type === 'document') return '📄 مستند';
    if (message.type === 'location') return '📍 موقع';
    if (message.type === 'contact') return '👤 جهة اتصال';
    if (message.type === 'sticker') return '🎨 ملصق';
    if (message.content.length > 30) return message.content.substring(0, 30) + '...';
    return message.content || 'رسالة وسائط';
  }

  // ==================== Chat Operations ====================

  async loadChats() {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      this.users = data.users;
      
      // Load sample chats for demo
      this.initializeSampleChats();
      this.renderChatsList();
    } catch (error) {
      console.error('Error loading chats:', error);
      this.initializeSampleChats();
      this.renderChatsList();
    }
  }

  initializeSampleChats() {
    if (this.chats.length === 0 && this.users.length > 0) {
      this.chats = this.users.slice(0, 5).map(user => ({
        id: user.id,
        type: 'private',
        name: user.username,
        avatar: user.avatar || '/avatars/default.png',
        lastMessage: 'مرحباً! كيف حالك؟',
        lastMessageTime: new Date(Date.now() - Math.random() * 3600000 * 24).toISOString(),
        unreadCount: Math.floor(Math.random() * 5),
        isOnline: user.is_online || false,
        isPinned: false,
        isArchived: false,
        isMuted: false,
        starred: false
      }));
    }
  }

  async loadMessages(userId) {
    try {
      const response = await fetch(`/api/messages/${userId}`);
      const data = await response.json();
      
      const chatKey = this.getChatKey(userId, this.currentUser.id);
      this.messages.set(chatKey, data.messages);
      
      this.renderMessages(userId);
    } catch (error) {
      console.error('Error loading messages:', error);
      // Load sample messages
      this.loadSampleMessages(userId);
    }
  }

  loadSampleMessages(userId) {
    const sampleMessages = [];
    const now = Date.now();
    
    for (let i = 0; i < 10; i++) {
      const isSent = i % 2 === 0;
      sampleMessages.push({
        id: `sample-${i}`,
        sender_id: isSent ? this.currentUser.id : userId,
        receiver_id: isSent ? userId : this.currentUser.id,
        content: this.getSampleMessage(i),
        type: 'text',
        created_at: new Date(now - (10 - i) * 3600000).toISOString(),
        is_read: true,
        status: isSent ? 'read' : null
      });
    }

    const chatKey = this.getChatKey(userId, this.currentUser.id);
    this.messages.set(chatKey, sampleMessages);
    this.renderMessages(userId);
  }

  getSampleMessage(index) {
    const messages = [
      'مرحباً! كيف حالك؟',
      'بخير الحمد لله، وأنت؟',
      'أنا بخير شكراً',
      'هل لديك وقت للحديث اليوم؟',
      'بالتأكيد، متى يناسبك؟',
      'ما رأيك في المساء؟',
      'ممتاز، أراك مساءً',
      'إلى اللقاء',
      '👋 وداعاً',
      'مع السلامة!'
    ];
    return messages[index % messages.length];
  }

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

    // Add to UI immediately
    this.appendMessage(message, true);

    // Send via socket
    this.socket.emit('send_message', {
      receiverId: this.selectedChat.id,
      content: content || '',
      type,
      fileUrl
    });

    // Clear input
    document.getElementById('message-input').value = '';
    this.autoResizeTextarea();
  }

  appendMessage(message, isSent) {
    const container = document.getElementById('messages-container');
    const chatKey = this.getChatKey(this.selectedChat?.id, this.currentUser.id);
    
    if (!this.messages.has(chatKey)) {
      this.messages.set(chatKey, []);
    }
    this.messages.get(chatKey).push(message);

    const messageHtml = this.createMessageElement(message, isSent);
    container.insertAdjacentHTML('beforeend', messageHtml);
    this.scrollToBottom();

    // Bind message events
    this.bindMessageEvents(container.lastElementChild);
  }

  createMessageElement(message, isSent) {
    const time = this.formatTime(message.created_at);
    const date = this.formatDate(message.created_at);
    const status = message.status || (isSent ? 'sent' : null);
    
    let content = '';
    let additionalClass = '';

    switch (message.type) {
      case 'image':
        content = `<div class="message-bubble image" onclick="app.viewImage('${message.file_url}', '${this.escapeHtml(message.content)}')">
          <img src="${message.file_url}" alt="صورة" loading="lazy">
        </div>`;
        break;
      case 'video':
        content = `<div class="message-bubble video">
          <video src="${message.file_url}" controls></video>
        </div>`;
        break;
      case 'audio':
        content = `<div class="message-bubble audio">
          <button class="audio-play-btn" onclick="app.playAudio(this, '${message.file_url}')">
            <i class="fas fa-play"></i>
          </button>
          <div class="audio-info">
            <span class="audio-duration">0:30</span>
            <div class="audio-waveform">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>
        </div>`;
        break;
      case 'document':
        content = `<div class="message-bubble document">
          <div class="document-icon">
            <i class="fas fa-file-pdf"></i>
          </div>
          <div class="document-info">
            <span class="document-name">${message.content || 'مستند'}</span>
            <span class="document-size">PDF</span>
          </div>
          <button class="document-download" onclick="app.downloadFile('${message.file_url}')">
            <i class="fas fa-download"></i>
          </button>
        </div>`;
        break;
      case 'location':
        content = `<div class="message-bubble location" onclick="app.openLocation('${message.file_url}', '${message.content}')">
          <div class="location-preview">
            <i class="fas fa-map-marker-alt"></i>
          </div>
          <div class="location-info">
            <span>${message.content || 'موقع جغرافي'}</span>
          </div>
        </div>`;
        break;
      case 'contact':
        content = `<div class="message-bubble contact">
          <div class="contact-card">
            <div class="contact-avatar">
              <i class="fas fa-user"></i>
            </div>
            <div class="contact-info">
              <span class="contact-name">${message.content}</span>
            </div>
          </div>
          <button class="contact-add">إضافة جهة اتصال</button>
        </div>`;
        break;
      case 'sticker':
        content = `<div class="message-bubble sticker">
          <img src="${message.content}" alt="ملصق" onclick="app.viewSticker('${message.content}')">
        </div>`;
        break;
      default:
        content = `<div class="message-bubble text">${this.escapeHtml(message.content)}</div>`;
    }

    if (this.replyMessage && this.replyMessage.id === message.id) {
      additionalClass += ' reply-message';
    }

    const replyPreview = message.reply_to ? `
      <div class="reply-preview-mini" onclick="app.jumpToMessage('${message.reply_to.id}')">
        <span class="reply-sender">${message.reply_to.sender_name || 'مستخدم'}</span>
        <span class="reply-text">${message.reply_to.content?.substring(0, 30)}...</span>
      </div>
    ` : '';

    const statusIcons = isSent ? this.getStatusIcons(status) : '';

    const reactions = message.reactions ? this.renderReactions(message.reactions) : '';

    return `
      <div class="message ${isSent ? 'sent' : 'received'} ${additionalClass}" 
           data-message-id="${message.id || message.tempId}" 
           data-temp-id="${message.tempId || ''}"
           onclick="app.showMessageContextMenu(event, '${message.id || message.tempId}')">
        ${!isSent ? `
          <div class="message-avatar">
            <img src="${this.selectedChat?.avatar || '/avatars/default.png'}" alt="">
          </div>
        ` : ''}
        <div class="message-content">
          ${replyPreview}
          ${content}
          <div class="message-meta">
            ${date !== this.formatDate(Date.now()) ? `<span class="message-date">${date}</span>` : ''}
            <span class="message-time">${time}</span>
            ${statusIcons}
          </div>
          ${reactions}
        </div>
      </div>
    `;
  }

  getStatusIcons(status) {
    if (!status) return '';
    
    const icons = {
      'pending': '<span class="message-status pending"><i class="fas fa-clock"></i></span>',
      'sent': '<span class="message-status sent"><i class="fas fa-check"></i></span>',
      'delivered': '<span class="message-status delivered"><i class="fas fa-check-double"></i></span>',
      'read': '<span class="message-status read"><i class="fas fa-check-double" style="color: #53bdeb;"></i></span>'
    };
    return icons[status] || '';
  }

  renderReactions(reactions) {
    if (!reactions || Object.keys(reactions).length === 0) return '';

    const reactionCounts = {};
    reactions.forEach(r => {
      reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
    });

    return `
      <div class="message-reactions">
        ${Object.entries(reactionCounts).map(([emoji, count]) => `
          <button class="reaction-btn" onclick="app.addReaction('${emoji}')">
            ${emoji} <span>${count}</span>
          </button>
        `).join('')}
        <button class="reaction-add" onclick="app.showReactionPicker()">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
  }

  renderMessages(userId) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';

    const chatKey = this.getChatKey(userId, this.currentUser.id);
    const messages = this.messages.get(chatKey) || [];

    let lastDate = null;
    
    messages.forEach((message, index) => {
      const messageDate = this.formatDate(message.created_at);
      
      if (messageDate !== lastDate) {
        lastDate = messageDate;
        const dateHtml = `
          <div class="date-separator">
            <span>${messageDate}</span>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', dateHtml);
      }

      const isSent = message.sender_id === this.currentUser.id;
      const messageHtml = this.createMessageElement(message, isSent);
      container.insertAdjacentHTML('beforeend', messageHtml);
    });

    // Bind message events
    container.querySelectorAll('.message').forEach(el => {
      this.bindMessageEvents(el);
    });

    this.scrollToBottom();
  }

  bindMessageEvents(element) {
    // Double click to reply
    element.addEventListener('dblclick', () => {
      const messageId = element.dataset.messageId;
      this.startReply(messageId);
    });
  }

  // ==================== Chat UI ====================

  renderChatsList() {
    const container = document.getElementById('chats-list');
    const searchTerm = document.getElementById('chat-search')?.value?.toLowerCase() || '';
    
    let filteredChats = this.chats.filter(chat => {
      if (!chat.isArchived) {
        return chat.name.toLowerCase().includes(searchTerm);
      }
      return false;
    });

    // Sort: pinned first, then by last message time
    filteredChats.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    });

    if (filteredChats.length === 0) {
      container.innerHTML = `
        <div class="empty-chats">
          <div class="empty-icon">
            <i class="fas fa-comment-slash"></i>
          </div>
          <h3>لا توجد دردشات بعد</h3>
          <p>ابدأ محادثة جديدة مع أصدقائك</p>
          <button class="btn-primary" onclick="app.showNewChatPanel()">
            <i class="fas fa-plus"></i>
            محادثة جديدة
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredChats.map(chat => this.createChatItem(chat)).join('');

    // Bind events
    container.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const chatId = item.dataset.chatId;
        this.openChat(chatId);
      });
      
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showChatContextMenu(e, chatId);
      });
    });
  }

  createChatItem(chat) {
    const time = this.formatChatTime(chat.lastMessageTime);
    const unreadBadge = chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';
    const pinnedIcon = chat.isPinned ? '<i class="fas fa-pin chat-pin-icon"></i>' : '';
    const mutedIcon = chat.isMuted ? '<i class="fas fa-volume-mute chat-muted-icon"></i>' : '';
    const onlineIndicator = chat.isOnline ? '<span class="online-indicator"></span>' : '';

    return `
      <div class="chat-item ${chat.isPinned ? 'pinned' : ''}" data-chat-id="${chat.id}">
        ${pinnedIcon}
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
            ${mutedIcon}
          </div>
        </div>
      </div>
    `;
  }

  async openChat(chatId) {
    const chat = this.chats.find(c => c.id === chatId);
    if (!chat) return;

    this.selectedChat = chat;
    chat.unreadCount = 0;

    // Show chat window
    document.getElementById('chat-window').classList.remove('hidden');
    document.getElementById('new-chat-panel').classList.add('hidden');
    document.getElementById('new-group-panel').classList.add('hidden');
    document.getElementById('user-info-panel').classList.add('hidden');
    document.getElementById('settings-panel').classList.add('hidden');
    document.getElementById('profile-panel').classList.add('hidden');

    // Update header
    this.updateChatHeader(chat);

    // Load messages
    await this.loadMessages(chatId);

    // Mark as read
    this.markChatAsRead(chatId);
  }

  updateChatHeader(chat) {
    const header = document.getElementById('chat-user-info');
    header.innerHTML = `
      <div class="avatar">
        <img src="${chat.avatar || '/avatars/default.png'}" alt="${chat.name}">
      </div>
      <div class="user-details">
        <span class="username">${chat.name}</span>
        <span class="status ${chat.isOnline ? 'online' : ''}" id="chat-status-text">
          ${chat.isOnline ? 'متصل الآن' : 'غير متصل'}
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

  markChatAsRead(chatId) {
    const chatKey = this.getChatKey(chatId, this.currentUser.id);
    const messages = this.messages.get(chatKey) || [];
    const unreadIds = messages.filter(m => m.sender_id !== this.currentUser.id && !m.is_read).map(m => m.id);
    
    if (unreadIds.length > 0) {
      this.markMessagesAsRead(unreadIds);
    }
  }

  async markMessagesAsRead(messageIds) {
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

  // ==================== Status ====================

  loadStatuses() {
    // Sample statuses
    this.statuses = [
      {
        id: 'status-1',
        userId: this.users[0]?.id || 'user-1',
        userName: this.users[0]?.username || 'أحمد',
        userAvatar: this.users[0]?.avatar || '/avatars/default.png',
        type: 'image',
        content: 'https://picsum.photos/400/800?random=1',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        views: 5,
        reactions: []
      },
      {
        id: 'status-2',
        userId: this.users[1]?.id || 'user-2',
        userName: this.users[1]?.username || 'سارة',
        userAvatar: this.users[1]?.avatar || '/avatars/default.png',
        type: 'image',
        content: 'https://picsum.photos/400/800?random=2',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        views: 12,
        reactions: []
      }
    ];
    this.renderStatuses();
  }

  renderStatuses() {
    const container = document.getElementById('status-list');
    
    // My status
    const myStatusHtml = `
      <div class="status-item my-status" onclick="app.viewMyStatus()">
        <div class="status-avatar">
          <img src="${this.currentUser?.avatar || '/avatars/default.png'}" alt="">
          <div class="status-add-btn">
            <i class="fas fa-plus"></i>
          </div>
        </div>
        <div class="status-info">
          <span class="status-name">حالتي</span>
          <span class="status-time">أضف حالة</span>
        </div>
      </div>
    `;

    // Recent statuses
    const recentStatuses = this.statuses.filter(s => {
      const statusTime = new Date(s.createdAt);
      const now = new Date();
      return (now - statusTime) < 24 * 60 * 60 * 1000;
    });

    const statusesHtml = recentStatuses.map(status => `
      <div class="status-item" onclick="app.viewStatus('${status.id}')">
        <div class="status-ring">
          <div class="status-avatar">
            <img src="${status.userAvatar}" alt="${status.userName}">
          </div>
        </div>
        <div class="status-info">
          <span class="status-name">${status.userName}</span>
          <span class="status-time">${this.formatStatusTime(status.createdAt)}</span>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="status-section">
        <h3>المحدثة مؤخراً</h3>
        <div class="status-list-scroll">
          ${myStatusHtml}
          ${statusesHtml}
        </div>
      </div>
    `;
  }

  viewStatus(statusId) {
    const status = this.statuses.find(s => s.id === statusId);
    if (!status) return;

    const viewer = document.getElementById('story-viewer');
    const container = document.getElementById('story-container');
    
    document.getElementById('story-user-avatar').src = status.userAvatar;
    document.getElementById('story-user-name').textContent = status.userName;
    document.getElementById('story-time').textContent = this.formatStatusTime(status.createdAt);
    
    const content = status.type === 'image' 
      ? `<img src="${status.content}" alt="حالة" class="story-image">`
      : `<video src="${status.content}" controls class="story-video"></video>`;
    
    document.getElementById('story-content').innerHTML = content;
    
    viewer.classList.remove('hidden');
    this.startStoryProgress();
  }

  viewMyStatus() {
    // Open camera for new status
    document.getElementById('camera-input').click();
  }

  startStoryProgress() {
    const progress = document.getElementById('story-progress');
    progress.style.width = '0%';
    
    setTimeout(() => {
      progress.style.width = '100%';
      progress.style.transition = 'width 5s linear';
    }, 100);
  }

  // ==================== Calls ====================

  loadCalls() {
    // Sample calls
    this.calls = [
      {
        id: 'call-1',
        userId: this.users[0]?.id || 'user-1',
        userName: this.users[0]?.username || 'أحمد',
        userAvatar: this.users[0]?.avatar || '/avatars/default.png',
        type: 'voice',
        direction: 'outgoing',
        duration: '05:32',
        timestamp: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'call-2',
        userId: this.users[1]?.id || 'user-2',
        userName: this.users[1]?.username || 'سارة',
        userAvatar: this.users[1]?.avatar || '/avatars/default.png',
        type: 'video',
        direction: 'incoming',
        duration: '02:15',
        timestamp: new Date(Date.now() - 86400000).toISOString()
      }
    ];
    this.renderCalls();
  }

  renderCalls() {
    const container = document.getElementById('calls-list');
    
    if (this.calls.length === 0) {
      container.innerHTML = `
        <div class="empty-calls">
          <div class="empty-icon">
            <i class="fas fa-phone-slash"></i>
          </div>
          <h3>لا توجد مكالمات</h3>
          <p>ابدأ مكالمة مع صديق</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.calls.map(call => `
      <div class="call-item" data-call-id="${call.id}">
        <div class="call-avatar">
          <img src="${call.userAvatar}" alt="${call.userName}">
        </div>
        <div class="call-info">
          <span class="call-name">${call.userName}</span>
          <span class="call-details">
            <i class="fas fa-arrow-${call.direction === 'outgoing' ? 'up-right' : 'down-left'}"></i>
            ${this.formatCallTime(call.timestamp)}
            <span class="call-duration">${call.duration}</span>
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
    console.log(`Starting ${type} call with user ${userId}`);
    // Implement call functionality
  }

  // ==================== Groups ====================

  createGroup(name, description, participantIds) {
    const group = {
      id: 'group-' + Date.now(),
      name,
      description,
      avatar: '/avatars/default.png',
      participants: [
        { id: this.currentUser.id, name: this.currentUser.username, isAdmin: true },
        ...participantIds.map(id => {
          const user = this.users.find(u => u.id === id);
          return { id, name: user?.username || 'مستخدم', isAdmin: false };
        })
      ],
      createdAt: new Date().toISOString(),
      settings: {
        allowAddMembers: true,
        allowEditGroupInfo: true,
        allowSendMessages: true
      }
    };

    this.groups.push(group);
    this.socket.emit('create_group', group);
    this.renderGroups();
    this.openGroupChat(group.id);
  }

  renderGroups() {
    // Update groups in chats list
    this.chats = this.chats.filter(c => c.type !== 'group');
    this.groups.forEach(group => {
      const existingChat = this.chats.find(c => c.id === group.id);
      if (!existingChat) {
        this.chats.unshift({
          id: group.id,
          type: 'group',
          name: group.name,
          avatar: group.avatar,
          lastMessage: 'تم إنشاء مجموعة جديدة',
          lastMessageTime: group.createdAt,
          unreadCount: 0,
          isOnline: false,
          isPinned: false,
          isArchived: false,
          isMuted: false,
          starred: false
        });
      }
    });
    this.renderChatsList();
  }

  openGroupChat(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    this.selectedChat = {
      id: group.id,
      type: 'group',
      name: group.name,
      avatar: group.avatar,
      group: group
    };

    document.getElementById('chat-window').classList.remove('hidden');
    this.updateChatHeader(this.selectedChat);
    this.loadMessages(groupId);
  }

  // ==================== File Upload ====================

  async uploadFile(file, type) {
    const formData = new FormData();
    formData.append(type, file);

    try {
      const endpoint = {
        'avatar': '/api/upload/avatar',
        'image': '/api/upload/image',
        'audio': '/api/upload/audio',
        'document': '/api/upload/document'
      }[type] || '/api/upload/image';

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

  async handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const url = await this.uploadFile(file, type);
      
      if (type === 'image') {
        this.sendMessage(file.name, 'image', url);
      } else if (type === 'audio') {
        this.sendMessage('رسالة صوتية', 'audio', url);
      } else if (type === 'document') {
        this.sendMessage(file.name, 'document', url);
      }
    } catch (error) {
      console.error('File upload error:', error);
      alert('فشل في رفع الملف');
    }
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

      // Show recording UI
      document.getElementById('voice-record-panel').classList.remove('hidden');
      document.getElementById('mic-btn').classList.add('hidden');
      document.getElementById('send-btn').classList.remove('hidden');

      // Start timer
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

  stopRecording(cancel = false) {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      clearInterval(this.recordingTimer);
    }

    document.getElementById('voice-record-panel').classList.add('hidden');
    document.getElementById('mic-btn').classList.remove('hidden');
    document.getElementById('send-btn').classList.add('hidden');

    if (cancel) {
      this.audioChunks = [];
    }
  }

  // ==================== Audio Player ====================

  playAudio(button, url) {
    const audioContainer = button.closest('.audio-message');
    
    if (this.activeAudio && this.activeAudio !== audioContainer) {
      this.activeAudio.querySelector('audio').pause();
      this.activeAudio.querySelector('.audio-play-btn i').classList.add('fa-play');
      this.activeAudio.querySelector('.audio-play-btn i').classList.remove('fa-pause');
    }

    const audio = audioContainer.querySelector('audio');
    const icon = button.querySelector('i');

    if (audio.paused) {
      audio.play();
      icon.classList.remove('fa-play');
      icon.classList.add('fa-pause');
      this.activeAudio = audioContainer;
    } else {
      audio.pause();
      icon.classList.remove('fa-pause');
      icon.classList.add('fa-play');
    }
  }

  // ==================== Reply to Message ====================

  startReply(messageId) {
    const chatKey = this.getChatKey(this.selectedChat?.id, this.currentUser.id);
    const messages = this.messages.get(chatKey) || [];
    const message = messages.find(m => m.id === messageId);
    
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

  // ==================== Forward Message ====================

  showForwardPanel(messageId) {
    const forwardPanel = document.getElementById('forward-panel');
    forwardPanel.classList.remove('hidden');
    
    // Populate contacts
    const forwardList = document.getElementById('forward-list');
    forwardList.innerHTML = this.chats.map(chat => `
      <div class="forward-item" data-chat-id="${chat.id}" onclick="app.forwardToChat('${chat.id}')">
        <div class="forward-avatar">
          <img src="${chat.avatar}" alt="${chat.name}">
        </div>
        <div class="forward-info">
          <span class="forward-name">${chat.name}</span>
        </div>
        <div class="forward-checkbox">
          <i class="far fa-circle"></i>
        </div>
      </div>
    `).join('');
  }

  async forwardToChat(chatId) {
    const chat = this.chats.find(c => c.id === chatId);
    if (!this.forwardMessage || !chat) return;

    this.socket.emit('send_message', {
      receiverId: chatId,
      content: this.forwardMessage.content || '',
      type: this.forwardMessage.type,
      fileUrl: this.forwardMessage.file_url
    });

    document.getElementById('forward-panel').classList.add('hidden');
    this.forwardMessage = null;
  }

  // ==================== Delete Message ====================

  showDeleteConfirmation(messageId) {
    const dialog = document.getElementById('confirm-dialog');
    dialog.classList.remove('hidden');
    
    document.getElementById('confirm-title').textContent = 'حذف الرسالة';
    document.getElementById('confirm-message').textContent = 'هل تريد حذف هذه الرسالة؟';
    
    document.getElementById('confirm-ok').onclick = () => {
      this.deleteMessage(messageId);
      dialog.classList.add('hidden');
    };
    
    document.getElementById('confirm-cancel').onclick = () => {
      dialog.classList.add('hidden');
    };
  }

  async deleteMessage(messageId, forEveryone = true) {
    try {
      await fetch('/api/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, forEveryone })
      });

      // Remove from UI
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement) {
        messageElement.style.opacity = '0';
        messageElement.style.transform = 'translateX(-20px)';
        setTimeout(() => messageElement.remove(), 300);
      }

      // Update in messages map
      this.messages.forEach((messages, key) => {
        const index = messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
          messages.splice(index, 1);
        }
      });
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }

  // ==================== Message Context Menu ====================

  showMessageContextMenu(event, messageId) {
    event.stopPropagation();
    
    const menu = document.getElementById('context-menu');
    const backdrop = document.getElementById('context-backdrop');
    
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.classList.remove('hidden');
    backdrop.classList.remove('hidden');

    // Bind actions
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
    const chatKey = this.getChatKey(this.selectedChat?.id, this.currentUser.id);
    const messages = this.messages.get(chatKey) || [];
    const message = messages.find(m => m.id === messageId);
    
    if (message && message.content) {
      navigator.clipboard.writeText(message.content);
      this.showToast('تم نسخ النص');
    }
  }

  // ==================== Chat Context Menu ====================

  showChatContextMenu(event, chatId) {
    // Implement chat context menu
    console.log('Chat context menu for:', chatId);
  }

  // ==================== Panels ====================

  showNewChatPanel() {
    document.getElementById('new-chat-panel').classList.remove('hidden');
    this.renderNewChatContacts();
  }

  renderNewChatContacts() {
    const container = document.getElementById('new-chat-contacts');
    container.innerHTML = this.users.map(user => `
      <div class="contact-item" data-user-id="${user.id}" onclick="app.startChatWithUser('${user.id}')">
        <div class="contact-avatar">
          <img src="${user.avatar || '/avatars/default.png'}" alt="${user.username}">
        </div>
        <div class="contact-info">
          <span class="contact-name">${user.username}</span>
        </div>
      </div>
    `).join('');
  }

  startChatWithUser(userId) {
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
        isOnline: user.is_online || false,
        isPinned: false,
        isArchived: false,
        isMuted: false,
        starred: false
      };
      this.chats.unshift(chat);
    }

    this.openChat(chat.id);
    document.getElementById('new-chat-panel').classList.add('hidden');
    this.renderChatsList();
  }

  showNewGroupPanel() {
    document.getElementById('new-group-panel').classList.remove('hidden');
    this.renderGroupParticipants();
  }

  renderGroupParticipants() {
    const container = document.getElementById('group-participants');
    container.innerHTML = '';
  }

  showSettingsPanel() {
    document.getElementById('settings-panel').classList.remove('hidden');
    this.updateSettingsUI();
  }

  showProfilePanel() {
    document.getElementById('profile-panel').classList.remove('hidden');
    this.updateProfileUI();
  }

  showUserInfoPanel(userId) {
    document.getElementById('user-info-panel').classList.remove('hidden');
    this.updateUserInfoUI(userId);
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

  // ==================== Emojis & Stickers ====================

  loadEmojis() {
    const emojiCategories = {
      'recent': ['😀', '😂', '😍', '😊', '👍', '❤️', '😎', '🤔'],
      'smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'],
      'animals': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'],
      'foods': ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕', '🫖', '🍵', '🧃', '🥤', '🫗', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾'],
      'activities': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩'],
      'travel': ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '🪝', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🛖', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🏐'],
      'objects': ['💌', '💎', '💍', '💄', '👠', '👟', '👞', '👢', '👓', '🕶️', '👑', '🧢', '🎩', '🎓', '🧶', '🧵', '🪡', '🧵', '🪮', '🪭', '🧱', '🪵', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞', '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️', '🪧', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓'],
      'symbols': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '👁️‍🗨️', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧']
    };

    const emojiPanel = document.getElementById('emoji-panel');
    
    emojiPanel.innerHTML = Object.entries(emojiCategories).map(([category, emojis]) => `
      <div class="emoji-category" data-category="${category}">
        ${emojis.map(emoji => `
          <button class="emoji-btn" onclick="app.insertEmoji('${emoji}')">${emoji}</button>
        `).join('')}
      </div>
    `).join('');
  }

  insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    input.value += emoji;
    this.autoResizeTextarea();
    input.focus();
  }

  generateStickers() {
    const stickers = [];
    const emojis = ['😀', '😎', '😍', '😂', '🥰', '😇', '🤔', '😴', '🤯', '🥳', '😈', '👻', '🤖', '👽', '🎃', '🦄', '🐱', '🐶', '🦊', '🦁'];
    
    emojis.forEach((emoji, index) => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
          <defs>
            <linearGradient id="grad${index}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')};stop-opacity:1" />
              <stop offset="100%" style="stop-color:#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')};stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" rx="20" fill="url(#grad${index})"/>
          <text x="50" y="65" font-size="50" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
        </svg>
      `;
      stickers.push('data:image/svg+xml,' + encodeURIComponent(svg));
    });

    this.stickers = stickers;
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
    const settings = {
      darkMode: this.darkMode
    };
    localStorage.setItem('connectflow-settings', JSON.stringify(settings));
  }

  updateSettingsUI() {
    document.getElementById('settings-avatar').src = this.currentUser?.avatar || '/avatars/default.png';
    document.getElementById('settings-name').textContent = this.currentUser?.username || 'المستخدم';
    document.getElementById('dark-mode-toggle').checked = this.darkMode;
  }

  updateProfileUI() {
    document.getElementById('profile-avatar-img').src = this.currentUser?.avatar || '/avatars/default.png';
    document.getElementById('profile-name').textContent = this.currentUser?.username || 'المستخدم';
    document.getElementById('profile-phone').textContent = this.currentUser?.phone || '+123 456 7890';
    document.getElementById('profile-username').textContent = '@' + (this.currentUser?.username || 'user');
  }

  // ==================== Utilities ====================

  getChatKey(id1, id2) {
    return [id1, id2].sort().join('_');
  }

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
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return 'الآن';
    } else if (diff < 3600000) {
      return Math.floor(diff / 60000) + 'د';
    } else if (diff < 86400000) {
      return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) {
      return date.toLocaleDateString('ar-EG', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    }
  }

  formatStatusTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return 'الآن';
    } else if (diff < 3600000) {
      return Math.floor(diff / 60000) + 'د';
    } else {
      return Math.floor(diff / 3600000) + 'س';
    }
  }

  formatCallTime(dateString) {
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
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
  }

  autoResizeTextarea() {
    const textarea = document.getElementById('message-input');
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }

  showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    indicator.classList.remove('hidden');
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

  showMessageNotification(message) {
    if (Notification.permission === 'granted') {
      new Notification('رسالة جديدة', {
        body: message.content || 'وسائط جديدة',
        icon: '/avatars/default.png'
      });
    }
  }

  playNotificationSound() {
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
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

    // Header tabs
    document.querySelectorAll('.header-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchView(tab.dataset.view);
      });
    });

    // Dropdown menu
    document.getElementById('header-menu-btn').addEventListener('click', () => {
      document.getElementById('dropdown-menu').classList.toggle('active');
    });

    document.getElementById('dropdown-backdrop').addEventListener('click', () => {
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    // Dropdown actions
    document.getElementById('dropdown-new-group').addEventListener('click', (e) => {
      e.preventDefault();
      this.showNewGroupPanel();
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    document.getElementById('dropdown-settings').addEventListener('click', (e) => {
      e.preventDefault();
      this.showSettingsPanel();
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    document.getElementById('dropdown-profile').addEventListener('click', (e) => {
      e.preventDefault();
      this.showProfilePanel();
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    document.getElementById('dropdown-logout').addEventListener('click', (e) => {
      e.preventDefault();
      this.logout();
      document.getElementById('dropdown-menu').classList.remove('active');
    });

    // Chat back button
    document.getElementById('chat-back').addEventListener('click', () => {
      this.closeChat();
    });

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

    // Send button
    document.getElementById('send-btn').addEventListener('click', () => {
      this.sendMessage();
    });

    // Mic button
    document.getElementById('mic-btn').addEventListener('click', () => {
      this.startRecording();
    });

    // Voice record panel
    document.getElementById('record-close').addEventListener('click', () => {
      this.stopRecording(true);
    });

    document.getElementById('send-voice').addEventListener('click', () => {
      this.stopRecording(false);
    });

    // Input action buttons
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
        this.handleAttachment(type);
        document.getElementById('attach-panel').classList.add('hidden');
      });
    });

    // File inputs
    document.getElementById('image-input').addEventListener('change', (e) => {
      this.handleFileSelect(e, 'image');
    });

    document.getElementById('audio-input').addEventListener('change', (e) => {
      this.handleFileSelect(e, 'audio');
    });

    document.getElementById('document-input').addEventListener('change', (e) => {
      this.handleFileSelect(e, 'document');
    });

    document.getElementById('camera-input').addEventListener('change', (e) => {
      this.handleFileSelect(e, 'image');
    });

    document.getElementById('avatar-input').addEventListener('change', (e) => {
      this.handleFileSelect(e, 'avatar');
    });

    // FAB buttons
    document.getElementById('main-fab').addEventListener('click', () => {
      this.showNewChatPanel();
    });

    document.getElementById('fab-new-chat').addEventListener('click', () => {
      this.showNewChatPanel();
    });

    document.getElementById('fab-new-group').addEventListener('click', () => {
      this.showNewGroupPanel();
    });

    // New chat panel
    document.getElementById('close-new-chat').addEventListener('click', () => {
      document.getElementById('new-chat-panel').classList.add('hidden');
    });

    // New group panel
    document.getElementById('close-new-group').addEventListener('click', () => {
      document.getElementById('new-group-panel').classList.add('hidden');
    });

    document.getElementById('create-new-group').addEventListener('click', () => {
      this.showNewGroupPanel();
      document.getElementById('new-chat-panel').classList.add('hidden');
    });

    document.getElementById('create-group-action').addEventListener('click', () => {
      const name = document.getElementById('group-name').value;
      const description = document.getElementById('group-description').value;
      if (name) {
        this.createGroup(name, description, []);
      }
    });

    // Settings panel
    document.getElementById('close-settings').addEventListener('click', () => {
      document.getElementById('settings-panel').classList.add('hidden');
    });

    document.getElementById('dark-mode-toggle').addEventListener('change', () => {
      this.toggleDarkMode();
    });

    // Profile panel
    document.getElementById('close-profile').addEventListener('click', () => {
      document.getElementById('profile-panel').classList.add('hidden');
    });

    // User info panel
    document.getElementById('close-user-info').addEventListener('click', () => {
      document.getElementById('user-info-panel').classList.add('hidden');
    });

    // Forward panel
    document.getElementById('close-forward').addEventListener('click', () => {
      document.getElementById('forward-panel').classList.add('hidden');
    });

    // Reply preview
    document.getElementById('reply-preview-close').addEventListener('click', () => {
      this.hideReplyPreview();
    });

    // Context menu backdrop
    document.getElementById('context-backdrop').addEventListener('click', () => {
      this.hideContextMenu();
    });

    // Confirm dialog
    document.getElementById('confirm-backdrop')?.addEventListener('click', () => {
      document.getElementById('confirm-dialog').classList.add('hidden');
    });

    // Media viewer
    document.getElementById('media-close').addEventListener('click', () => {
      document.getElementById('media-viewer').classList.add('hidden');
      const video = document.getElementById('media-video');
      video.pause();
    });

    // Story viewer
    document.getElementById('story-close').addEventListener('click', () => {
      document.getElementById('story-viewer').classList.add('hidden');
    });

    // Search
    document.getElementById('chat-search')?.addEventListener('input', (e) => {
      this.renderChatsList();
    });

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

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  handleAttachment(type) {
    const inputMap = {
      'document': 'document-input',
      'gallery': 'image-input',
      'audio': 'audio-input',
      'camera': 'camera-input'
    };
    
    if (inputMap[type]) {
      document.getElementById(inputMap[type]).click();
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
    
    // Update UI with user info
    if (this.currentUser) {
      document.getElementById('current-username').textContent = this.currentUser.username;
      document.getElementById('current-avatar').querySelector('img').src = 
        this.currentUser.avatar || '/avatars/default.png';
    }
  }

  updateUserOnlineStatus(userId, isOnline) {
    const chat = this.chats.find(c => c.id === userId);
    if (chat) {
      chat.isOnline = isOnline;
      this.renderChatsList();
    }
    
    if (this.selectedChat?.id === userId) {
      const statusEl = document.getElementById('chat-status-text');
      statusEl.textContent = isOnline ? 'متصل الآن' : 'غير متصل';
      statusEl.className = `status ${isOnline ? 'online' : ''}`;
    }
  }

  updateMessageStatus(messageId, status) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const statusElement = messageElement.querySelector('.message-status');
      if (statusElement) {
        statusElement.className = `message-status ${status}`;
        statusElement.innerHTML = status === 'read' 
          ? '<i class="fas fa-check-double" style="color: #53bdeb;"></i>'
          : '<i class="fas fa-check-double"></i>';
      }
    }
  }

  viewImage(url, caption) {
    const viewer = document.getElementById('media-viewer');
    const img = document.getElementById('media-image');
    const video = document.getElementById('media-video');
    
    video.classList.add('hidden');
    img.classList.remove('hidden');
    img.src = url;
    document.getElementById('media-title').textContent = caption || 'صورة';
    
    viewer.classList.remove('hidden');
  }

  viewSticker(url) {
    this.viewImage(url, 'ملصق');
  }

  openLocation(url, name) {
    window.open(url, '_blank');
  }

  downloadFile(url) {
    window.open(url, '_blank');
  }

  addReaction(emoji) {
    console.log('Adding reaction:', emoji);
  }

  showReactionPicker() {
    console.log('Showing reaction picker');
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ConnectFlowApp();
});
