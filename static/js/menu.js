// menu.js — Canteen selection, menu fetching, cart logic, and checkout redirect


// ── CANTEEN DATA ─────────────────────────────────────────────────────────────

// Static canteen list used to build the sidebar UI
const CANTEENS = [
  {
    key:  'main_cafe',  // matches folder name in /static/images/ and backend key
    name: 'Main Cafe',
    icon: '🍽️',
    tags: [
      { label: 'Open Now',   type: 'open' }, // type:'open' applies a green CSS class
      { label: '7 AM – 7 PM', type: '' },
      { label: 'Veg & More',   type: '' },
    ],
  },
  {
    key:  'tea_post',
    name: 'Tea Post',
    icon: '☕',
    tags: [
      { label: 'Open Now',  type: 'open' },
      { label: '7 AM – 7 PM', type: '' },
      { label: 'Beverages',   type: '' },
    ],
  },
  {
    key:  'bistro',
    name: 'Tropical Bistro',
    icon: '🌿',
    tags: [
      { label: 'Open Now',  type: 'open' },
      { label: '7 AM – 7 PM', type: '' },
      { label: 'Quick Bites', type: '' },
    ],
  },
];

// Maps numeric canteen IDs (used by the backend) to their key and display name
const CANTEEN_CONFIG = {
  '1': { key: 'main_cafe', name: 'Main Cafe'      },
  '2': { key: 'tea_post',  name: 'Tea Post'        },
  '3': { key: 'bistro',    name: 'Tropical Bistro' },
};


// ── STATE ────────────────────────────────────────────────────────────────────

let DYNAMIC_MENU     = {}; // full menu data after fetching from /api/menu, grouped by canteen→category
let cart             = []; // [{ name, price, qty }, ...]
let currentCanteenId = null; // numeric ID string of the active canteen ('1', '2', or '3')


// ── SIDEBAR ──────────────────────────────────────────────────────────────────

// Builds the clickable canteen list in the left sidebar from the CANTEENS array
function buildSidebarItems() {
  const list = document.getElementById('canteen-list');
  if (!list) return;

  CANTEENS.forEach((canteen, index) => {
    const item = document.createElement('div');
    item.className = 'canteen-sidebar-item' + (index === 0 ? ' active' : ''); // first item active by default
    item.setAttribute('role', 'button');                        // accessibility: marks as clickable
    item.setAttribute('tabindex', '0');                         // accessibility: keyboard-focusable
    item.setAttribute('aria-label', 'Select ' + canteen.name); // accessibility: screen reader label
    item.dataset.key = canteen.key; // stored so selectCanteen() can find it with querySelector
    item.dataset.id  = Object.keys(CANTEEN_CONFIG).find(k => CANTEEN_CONFIG[k].key === canteen.key); // numeric ID

    item.innerHTML = `
      <div class="sidebar-item-icon">${canteen.icon}</div>
      <div class="sidebar-item-text">
        <div class="sidebar-item-name">${canteen.name}</div>
        <div class="sidebar-item-meta">
          ${canteen.tags.map(t => `<span class="meta-tag ${t.type}">${t.label}</span>`).join('')}
        </div>
      </div>
      <div class="sidebar-item-arrow"><i class='bx bx-chevron-right'></i></div>
    `;

    item.addEventListener('click', () => selectCanteen(canteen.key));

    // Keyboard support: Enter/Space trigger click (Space would otherwise scroll the page)
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectCanteen(canteen.key);
      }
    });

    list.appendChild(item);
  });
}

// Switches to the given canteen: updates sidebar highlight and loads the menu
function selectCanteen(key) {
  const paramMap = { 'main_cafe': '1', 'tea_post': '2', 'bistro': '3' };
  const id = paramMap[key];
  if (!id) return; // unknown key — exit safely

  // Move 'active' highlight to the selected sidebar item
  document.querySelectorAll('.canteen-sidebar-item').forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-key="${key}"]`)?.classList.add('active'); // ?. guards against missing element

  loadCanteenMenu(id);
}


// ── DYNAMIC MENU LOADING ─────────────────────────────────────────────────────

// Fetches menu items from /api/menu, transforms them, and renders the menu panel
async function loadCanteenMenu(canteenId) {
  currentCanteenId = canteenId;
  const config = CANTEEN_CONFIG[canteenId];
  if (!config) return;

  // Swap placeholder view for the active menu shell
  document.getElementById('canteen-placeholder').style.display = 'none';
  document.getElementById('canteen-shell').classList.add('active');

  // Clear cart when switching canteens — items can't be mixed across canteens
  cart = [];
  updateCart();

  // Update heading and today's date above the menu
  const heading = document.getElementById('canteen-heading');
  const dateEl  = document.getElementById('menu-date');
  if (heading) heading.textContent = config.name + ' Menu';
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', // e.g. "Monday, 27 April 2026"
    });
  }

  try {
    const response = await fetch('/api/menu?canteen=' + canteenId);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const flatList = await response.json(); // flat array of items from the server

    DYNAMIC_MENU = transformMenuData(flatList); // group by canteen→category

    if (!DYNAMIC_MENU[config.key]) {
      showPlaceholder(); // no items for this canteen — go back to placeholder
      return;
    }

    renderMenu(config.key);
  } catch (err) {
    console.error('Failed to load menu:', err);
    const panelsEl = document.getElementById('tab-panels');
    if (panelsEl) {
      panelsEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0;">Menu could not be loaded. Please try again later.</p>';
    }
  }
}

// Resets the UI to the canteen selection placeholder (used when a canteen has no items)
function showPlaceholder() {
  document.getElementById('canteen-placeholder').style.display = 'block';
  document.getElementById('canteen-shell').classList.remove('active');
  cart = [];
  updateCart();
  document.querySelectorAll('.canteen-sidebar-item').forEach(item => item.classList.remove('active'));
}

// Converts the flat /api/menu array into a nested canteen→category→items structure
// Input:  [{ name, price, category, canteen, image }, ...]
// Output: { main_cafe: { snacks: { label: 'Snacks', items: [...] } }, ... }
function transformMenuData(flatList) {
  const result = {};
  flatList.forEach(item => {
    const canteenKey  = item.canteen;
    const categoryKey = item.category;

    if (!result[canteenKey]) result[canteenKey] = {}; // create canteen bucket if missing

    if (!result[canteenKey][categoryKey]) {
      const label = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1); // 'snacks' → 'Snacks'
      result[canteenKey][categoryKey] = { label, items: [] };
    }

    // Strip leading 'images/' — we prepend the full static base URL in buildItemCard
    const img = item.image.startsWith('images/') ? item.image.slice('images/'.length) : item.image;

    result[canteenKey][categoryKey].items.push({
      name:  item.name,
      price: item.price,
      desc:  '', // description not provided by the API
      img,
    });
  });
  return result;
}


// ── MENU RENDERING ───────────────────────────────────────────────────────────

// Activates the tab panel for tabKey and deactivates all others
function showTab(tabKey) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.meal-tab').forEach(t => t.classList.remove('active'));

  const panel  = document.getElementById('tab-' + tabKey);
  if (panel) panel.classList.add('active');
  const tabBtn = document.querySelector(`.meal-tab[data-tab="${tabKey}"]`);
  if (tabBtn) tabBtn.classList.add('active');
}

// Builds the HTML string for a single menu item card
function buildItemCard(item) {
  const base     = (typeof STATIC_BASE !== 'undefined' ? STATIC_BASE : '/static/'); // STATIC_BASE injected by Flask template
  const imgSrc   = base + 'images/' + item.img;
  const safeName = item.name.replace(/'/g, "\\'"); // escape quotes for safe use in inline onclick

  return `
    <div class="menu-item">
      <div class="item-image">
        <img src="${imgSrc}" alt="${item.name}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>
        <!-- onerror: hide broken image and show emoji fallback instead -->
        <span class="item-image-emoji" style="display:none;">🍴</span>
      </div>
      <div class="item-details">
        <div class="item-name">${item.name}</div>
        <div class="item-price">₹${item.price}</div>
        <div class="item-desc">${item.desc}</div>
        <button class="add-btn" onclick="addToCart('${safeName}', ${item.price})">Add to Cart</button>
      </div>
    </div>`;
}

// Renders the category tab buttons and item grids for a canteen
function renderMenu(canteenKey) {
  const canteenData = DYNAMIC_MENU[canteenKey];
  if (!canteenData) return;

  const tabsEl   = document.getElementById('meal-tabs');
  const panelsEl = document.getElementById('tab-panels');
  tabsEl.innerHTML   = ''; // clear old tabs
  panelsEl.innerHTML = ''; // clear old panels

  Object.keys(canteenData).forEach((tabKey, index) => {
    const section = canteenData[tabKey]; // { label, items }

    // Tab button
    const btn = document.createElement('div');
    btn.className   = 'meal-tab' + (index === 0 ? ' active' : ''); // first tab active by default
    btn.dataset.tab = tabKey;
    btn.textContent = section.label; // e.g. 'Snacks'
    btn.addEventListener('click', () => showTab(tabKey));
    tabsEl.appendChild(btn);

    // Tab panel (grid of item cards)
    const panel = document.createElement('div');
    panel.id        = 'tab-' + tabKey; // ID that showTab() looks up
    panel.className = 'tab-content' + (index === 0 ? ' active' : '');
    panel.innerHTML = `<div class="menu-items">${section.items.map(buildItemCard).join('')}</div>`;
    panelsEl.appendChild(panel);
  });
}


// ── CART LOGIC ───────────────────────────────────────────────────────────────

// Adds an item to the cart, or increments qty if it's already there
function addToCart(name, price) {
  const existing = cart.find(i => i.name === name);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ name, price, qty: 1 });
  }
  updateCart();
}

// Changes an item's qty by delta (+1 or -1); removes the item if qty reaches 0
function updateQty(name, delta) {
  const item = cart.find(i => i.name === name);
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.name !== name); // remove when qty hits 0
  }
  updateCart();
}

// Re-renders the cart panel: badge count, total price, and item rows
function updateCart() {
  const cartCountEl = document.getElementById('cartCount'); // item count badge
  const cartTotalEl = document.getElementById('cartTotal'); // total price label
  const cartItemsEl = document.getElementById('cartItems'); // scrollable item list

  cartCountEl.textContent = cart.reduce((s, i) => s + i.qty, 0); // sum all quantities
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  cartTotalEl.textContent = '₹' + total;

  if (cart.length === 0) {
    cartItemsEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0;">Your cart is empty</p>';
    return;
  }

  cartItemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${item.price} × ${item.qty}</div>
      </div>
      <div class="quantity-control">
        <button class="qty-btn" onclick="updateQty('${item.name.replace(/'/g, "\\'")}', -1)">−</button>
        <span>${item.qty}</span>
        <button class="qty-btn" onclick="updateQty('${item.name.replace(/'/g, "\\'")}', 1)">+</button>
      </div>
    </div>
  `).join('');
}

// Saves the cart to the session via /save-cart then redirects to /checkout
async function checkout() {
  if (cart.length === 0) {
    alert('Please add items to your cart first!');
    return;
  }

  // selectedOrderType is optionally set by the template ('takeaway' or 'dinein')
  const orderType = (typeof selectedOrderType !== 'undefined') ? selectedOrderType : 'takeaway';
  const isDineIn  = orderType === 'dinein';

  let timeSlot = 'Dine In'; // default for dine-in; overwritten below for takeaway
  if (!isDineIn) {
    const selectedSlot = document.querySelector('.slot-option.selected');
    if (!selectedSlot) {
      alert('Please select a pickup time slot!');
      return;
    }
    timeSlot = selectedSlot.textContent.trim();
  }

  const checkoutData = {
    canteenId: currentCanteenId || '1', // fallback to canteen 1 if state not set
    timeSlot,
    orderType,
    items: cart.map(i => ({ name: i.name, price: i.price, qty: i.qty })), // strip extra fields
  };

  try {
    // Backend stores this in the session so the checkout page can read it
    const res = await fetch('/save-cart', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(checkoutData),
    });
    if (res.ok) {
      window.location.href = '/checkout';
    } else {
      alert('Could not save cart. Please try again.');
    }
  } catch (err) {
    alert('Network error. Please try again.'); // fetch itself failed (offline, etc.)
  }
}


// ── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildSidebarItems(); // inject canteen list into the sidebar

  // Time slot buttons — only one can be selected at a time
  document.querySelectorAll('.slot-option').forEach(slot => {
    slot.addEventListener('click', function () {
      document.querySelectorAll('.slot-option').forEach(s => s.classList.remove('selected'));
      this.classList.add('selected');
    });
  });

  // If URL has ?canteen=N, open that canteen directly; otherwise default to Main Cafe
  const urlParams    = new URLSearchParams(window.location.search);
  const canteenParam = urlParams.get('canteen'); // e.g. '2' from ?canteen=2

  if (canteenParam && CANTEEN_CONFIG[canteenParam]) {
    selectCanteen(CANTEEN_CONFIG[canteenParam].key);
  } else {
    selectCanteen('main_cafe');
  }
});