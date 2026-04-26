// ── State ──
let activeConvId = null;           //shows which conv-id is currently active
let isStreaming  = false;          /* this becomes true when the ai responds..
                                      required so that user does not send multiple messages*/

// ── DOM refs ──
const chatWindow  = document.getElementById('chatWindow');   //scrollable chat area
const messagesEl  = document.getElementById('messages');     //messages bubble
const emptyState  = document.getElementById('emptyState');   //the welcome screen
const userInput   = document.getElementById('userInput');    //the textarea
const sendBtn     = document.getElementById('sendBtn');      //send button
const convList    = document.getElementById('convList');     //sidebar conversation list(history)
const newChatBtn  = document.getElementById('newChatBtn');   //new chat button
const topbarTitle = document.getElementById('topbarTitle');  //title at the top of the page
const mobMenuBtn  = document.getElementById('mobMenuBtn');
const sidebar     = document.getElementById('sidebar');      //the entire left sidebar

// ── On page load ──
document.addEventListener('DOMContentLoaded', () => {       //domcontentloaded checks if the entire page is loaded
                                                            //then calls loadhistory and autoresizetextarea function
  loadHistory();
  autoResizeTextarea();
});

// ── Mobile sidebar toggle ──
mobMenuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// ── Auto resize textarea ──
function autoResizeTextarea() {                      //everytime a user types something this function runs
  userInput.addEventListener('input', () => {            
    userInput.style.height = 'auto';                //resizes the size of the textarea to fit the content
    userInput.style.height = userInput.scrollHeight + 'px'; 
  });
}

// ── Handle Enter key ──
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { //checks if enter key is pressed or shift+enter
    e.preventDefault();
    sendMessage(); //send message is called if both the conditions are true 
  }
}

// ── Load conversation history into sidebar ──
async function loadHistory() {
  try {
    const res  = await fetch('/api/chat/history');  //silently calls the route without reloading the page
    const data = await res.json();           // convert the response to json object

    convList.innerHTML = '';   //convList is the sidebar div element.. removes everything inside it to prevent duplicates

    if (data.length === 0) {   //if no previous chats... just say no existing chats and return
      convList.innerHTML = '<div style="padding:12px 16px;font-size:0.75rem;color:var(--muted)">No chats yet</div>';
      return;
    }

    data.forEach(conv => {    //if chats are found loop through every conversation in the array
      const item = document.createElement('div'); //create div element for each conv
      item.className = 'conv-item'; //sets the class of the div 
      item.dataset.id = conv.id; //to know which conversation to load
      //creates the chat icon and title and date
      item.innerHTML = `                                       
        <div class="conv-icon"><i class='bx bx-chat'></i></div>
        <div class="conv-info">
          <div class="conv-title">${escapeHtml(conv.title)}</div>
          <div class="conv-date">${conv.created_at}</div>
        </div>
      `;
      item.addEventListener('click', () => loadConversation(conv.id, conv.title)); //function is called when user clicks on any of the conv on the sidebar
      convList.appendChild(item);
    });

  } catch (err) {   //if by any chance history is not loaded it will try to resolve error gracefully
    console.error('Failed to load history:', err);
  }
}

// ── Load a specific conversation ──
async function loadConversation(convId, title) {
  if (isStreaming) return;  //it wont allow user to switch conv midway if the ai is responding

  activeConvId = convId;     //which conv is currently active
  topbarTitle.textContent = title || 'Elective Advisor';  //title at the top of the conv 

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
  const text = userInput.value.trim();  //trim is used to remove any access spaces in the input
  if (!text || isStreaming) return;    //if empty input or ai is responding... cannot send another message

  // If no active conversation, create one first
  if (!activeConvId) {
    try {
      const res  = await fetch('/api/chat/new', { method: 'POST' });
      const data = await res.json();
      activeConvId = data.conversation_id;
      await loadHistory();   //reload sidebar to show new conversation
      document.querySelectorAll('.conv-item').forEach(el => {
        if (el.dataset.id == activeConvId) el.classList.add('active'); //highlight the new conversation in the sidebar
      });
    } catch (err) {
      console.error('Failed to create conversation:', err); //if by any chance fails to create a new coversation
      return;
    }
  }

  // Hide empty state
  emptyState.style.display = 'none'; //hides the welcome screen before the flask call

  // Clear input
  userInput.value = '';             //clears the textarea and resizes it back to one line
  userInput.style.height = 'auto';

  // Show user message
  appendMessage('user', text);  //creates a bubble with users message
  scrollToBottom();    //scrolls to the bottom of the chat

  // Disable input while streaming
  isStreaming = true;
  sendBtn.disabled = true;
  userInput.disabled = true;

  // Show typing indicator
  const typingRow = showTyping();

  try {
    const response = await fetch(`/api/chat/${activeConvId}/message`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, //tells flask the body is in json
      body: JSON.stringify({ message: text })    //converts json object to json string
    });

    if (!response.ok) throw new Error('API error');   //if didnt get the response give error

    // Remove typing indicator, create assistant bubble
    typingRow.remove();
    const assistantBubble = appendMessage('assistant', '');
    scrollToBottom();

    // Stream the response
    const reader = response.body.getReader(); //opens the reader to to read the stream chunk by chunk
    const decoder = new TextDecoder(); //converts raw bytes to readable text

    while (true) {  //infinite loop to read chunks one by one until we break out
      const { done, value } = await reader.read(); //reader.read returns object with 2 properties
      if (done) break;  //done- boolean, true when stream finishes; value-chunk data(bytes)

      const chunk = decoder.decode(value, { stream: true }); //decoder.decode converts bytes to string
      assistantBubble.querySelector('.msg-bubble').textContent += chunk; //appends chunks to the msg-bubble
      scrollToBottom();
    }

    // Reload sidebar to update title after first message
    await loadHistory();
    document.querySelectorAll('.conv-item').forEach(el => {
      if (el.dataset.id == activeConvId) {
        el.classList.add('active');
        topbarTitle.textContent = el.querySelector('.conv-title').textContent;  //update the title on top of the convo
      }
    });

  } catch (err) {
    typingRow.remove();
    appendMessage('assistant', 'Something went wrong. Please try again.');
    console.error(err);
  } finally {   //this block always runs even if there is an error
    isStreaming = false;
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus(); //puts cursor in the text area without clicking first
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
    ? CURRENT_USER.username.substring(0, 2).toUpperCase() //for the avatar
    : 'AI';

  const row = document.createElement('div');  //new div element
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
  row.className = 'msg-row assistant';//styles it as an assitant message..appears on the left hand side
  row.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesEl.appendChild(row);//adds to the chat area 
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