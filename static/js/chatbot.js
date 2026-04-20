// ── State ──
let activeConvId = null;
let isStreaming  = false;

// ── DOM refs ──
const chatWindow  = document.getElementById('chatWindow');
const messagesEl  = document.getElementById('messages');
const emptyState  = document.getElementById('emptyState');
const userInput   = document.getElementById('userInput');
const sendBtn     = document.getElementById('sendBtn');
const convList    = document.getElementById('convList');
const newChatBtn  = document.getElementById('newChatBtn');
const topbarTitle = document.getElementById('topbarTitle');
const mobMenuBtn  = document.getElementById('mobMenuBtn');
const sidebar     = document.getElementById('sidebar');

// ── On page load ──
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  autoResizeTextarea();
});

// ── Mobile sidebar toggle ──
mobMenuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// ── Auto resize textarea ──
function autoResizeTextarea() {
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
  });
}

// ── Handle Enter key ──
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── Load conversation history into sidebar ──
async function loadHistory() {
  try {
    const res  = await fetch('/api/chat/history');
    const data = await res.json();

    convList.innerHTML = '';

    if (data.length === 0) {
      convList.innerHTML = '<div style="padding:12px 16px;font-size:0.75rem;color:var(--muted)">No chats yet</div>';
      return;
    }

    data.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'conv-item';
      item.dataset.id = conv.id;
      item.innerHTML = `
        <div class="conv-icon"><i class='bx bx-chat'></i></div>
        <div class="conv-info">
          <div class="conv-title">${escapeHtml(conv.title)}</div>
          <div class="conv-date">${conv.created_at}</div>
        </div>
      `;
      item.addEventListener('click', () => loadConversation(conv.id, conv.title));
      convList.appendChild(item);
    });

  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

// ── Load a specific conversation ──
async function loadConversation(convId, title) {
  if (isStreaming) return;

  activeConvId = convId;
  topbarTitle.textContent = title || 'Elective Advisor';

  // Mark active in sidebar
  document.querySelectorAll('.conv-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id == convId);
  });

  // Clear messages
  messagesEl.innerHTML = '';
  emptyState.style.display = 'none';

  // Close mobile sidebar
  sidebar.classList.remove('open');

  try {
    const res  = await fetch(`/api/chat/${convId}/messages`);
    const msgs = await res.json();

    msgs.forEach(msg => appendMessage(msg.role, msg.content));
    scrollToBottom();

  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

// ── New Chat button ──
newChatBtn.addEventListener('click', async () => {
  if (isStreaming) return;

  try {
    const res  = await fetch('/api/chat/new', { method: 'POST' });
    const data = await res.json();

    activeConvId = data.conversation_id;
    topbarTitle.textContent = 'New Chat';

    // Clear chat area, show empty state
    messagesEl.innerHTML = '';
    emptyState.style.display = 'flex';

    // Deselect all sidebar items
    document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));

    // Reload sidebar to show new conversation
    await loadHistory();

    // Mark new one as active
    document.querySelectorAll('.conv-item').forEach(el => {
      if (el.dataset.id == activeConvId) el.classList.add('active');
    });

    userInput.focus();

  } catch (err) {
    console.error('Failed to create new chat:', err);
  }
});

// ── Send message ──
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  // If no active conversation, create one first
  if (!activeConvId) {
    try {
      const res  = await fetch('/api/chat/new', { method: 'POST' });
      const data = await res.json();
      activeConvId = data.conversation_id;
      await loadHistory();
      document.querySelectorAll('.conv-item').forEach(el => {
        if (el.dataset.id == activeConvId) el.classList.add('active');
      });
    } catch (err) {
      console.error('Failed to create conversation:', err);
      return;
    }
  }

  // Hide empty state
  emptyState.style.display = 'none';

  // Clear input
  userInput.value = '';
  userInput.style.height = 'auto';

  // Show user message
  appendMessage('user', text);
  scrollToBottom();

  // Disable input while streaming
  isStreaming = true;
  sendBtn.disabled = true;
  userInput.disabled = true;

  // Show typing indicator
  const typingRow = showTyping();

  try {
    const response = await fetch(`/api/chat/${activeConvId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    if (!response.ok) throw new Error('API error');

    // Remove typing indicator, create assistant bubble
    typingRow.remove();
    const assistantBubble = appendMessage('assistant', '');
    scrollToBottom();

    // Stream the response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      assistantBubble.querySelector('.msg-bubble').textContent += chunk;
      scrollToBottom();
    }

    // Reload sidebar to update title after first message
    await loadHistory();
    document.querySelectorAll('.conv-item').forEach(el => {
      if (el.dataset.id == activeConvId) {
        el.classList.add('active');
        topbarTitle.textContent = el.querySelector('.conv-title').textContent;
      }
    });

  } catch (err) {
    typingRow.remove();
    appendMessage('assistant', 'Something went wrong. Please try again.');
    console.error(err);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

// ── Suggestion chip click ──
async function sendChip(btn) {
  userInput.value = btn.textContent;
  await sendMessage();
}

// ── Append a message bubble ──
function appendMessage(role, content) {
  const initials = role === 'user'
    ? CURRENT_USER.username.substring(0, 2).toUpperCase()
    : 'AI';

  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  row.innerHTML = `
    <div class="msg-avatar">${initials}</div>
    <div class="msg-bubble">${escapeHtml(content)}</div>
  `;
  messagesEl.appendChild(row);
  return row;
}

// ── Show typing indicator ──
function showTyping() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesEl.appendChild(row);
  scrollToBottom();
  return row;
}

// ── Scroll chat to bottom ──
function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ── Escape HTML to prevent XSS ──
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
