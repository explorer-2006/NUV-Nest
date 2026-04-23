/* ══════════════════════════════════════════════
   NUV Nest — Canteen Selection + Dynamic Menu (menu.js)
   ══════════════════════════════════════════════ */

const CANTEENS = [
  {
    key:   'main_cafe',
    name:  'Main Cafe',
    icon:  '🍽️',
    tags:  [
      { label: 'Open Now', type: 'open' },
      { label: '7 AM – 10 PM',  type: '' },
      { label: 'Veg & More',    type: '' },
    ],
  },
  {
    key:   'tea_post',
    name:  'Tea Post',
    icon:  '☕',
    tags:  [
      { label: 'Open Now', type: 'open' },
      { label: '7 AM – 8 PM', type: '' },
      { label: 'Beverages',   type: '' },
    ],
  },
  {
    key:   'bistro',
    name:  'Tropical Bistro',
    icon:  '🌿',
    tags:  [
      { label: 'Open Now', type: 'open' },
      { label: '9 AM – 9 PM', type: '' },
      { label: 'Quick Bites',  type: '' },
    ],
  },
];

const CANTEEN_CONFIG = {
  '1': { key: 'main_cafe', name: 'Main Cafe'        },
  '2': { key: 'tea_post',  name: 'Tea Post'          },
  '3': { key: 'bistro',    name: 'Tropical Bistro'   },
};

/* ── State ──────────────────────────────────────────────────── */
let DYNAMIC_MENU = {};
let cart = [];
let currentCanteenId = null;

/* ════════════════════════════════════════════════════════════
   SIDEBAR
   ════════════════════════════════════════════════════════════ */

function buildSidebarItems() {
  const list = document.getElementById('canteen-list');
  if (!list) return;

  CANTEENS.forEach((canteen, index) => {
    const item = document.createElement('div');
    item.className = 'canteen-sidebar-item' + (index === 0 ? ' active' : '');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', 'Select ' + canteen.name);
    item.dataset.key = canteen.key;
    item.dataset.id = Object.keys(CANTEEN_CONFIG).find(k => CANTEEN_CONFIG[k].key === canteen.key);

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
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectCanteen(canteen.key);
      }
    });

    list.appendChild(item);
  });
}

function selectCanteen(key) {
  const paramMap = { 'main_cafe': '1', 'tea_post': '2', 'bistro': '3' };
  const id = paramMap[key];
  if (!id) return;

  document.querySelectorAll('.canteen-sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-key="${key}"]`)?.classList.add('active');

  loadCanteenMenu(id);
}



/* ════════════════════════════════════════════════════════════
   DYNAMIC MENU LOADING
   ════════════════════════════════════════════════════════════ */

async function loadCanteenMenu(canteenId) {
  currentCanteenId = canteenId;
  const config = CANTEEN_CONFIG[canteenId];
  if (!config) return;

  // Hide placeholder, show menu shell
  document.getElementById('canteen-placeholder').style.display = 'none';
  document.getElementById('canteen-shell').classList.add('active');

  // Reset cart for new canteen
  cart = [];
  updateCart();

  // Set meta
  const heading = document.getElementById('canteen-heading');
  const dateEl = document.getElementById('menu-date');
  if (heading) heading.textContent = config.name + ' Menu';
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // Fetch menu
  try {
    const response = await fetch('/api/menu?canteen=' + canteenId);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const flatList = await response.json();

    DYNAMIC_MENU = transformMenuData(flatList);

    if (!DYNAMIC_MENU[config.key]) {
      showPlaceholder();
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

function showPlaceholder() {
  document.getElementById('canteen-placeholder').style.display = 'block';
  document.getElementById('canteen-shell').classList.remove('active');
  cart = [];
  updateCart();
  document.querySelectorAll('.canteen-sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
}

function transformMenuData(flatList) {
  const result = {};
  flatList.forEach(item => {
    const canteenKey = item.canteen;
    const categoryKey = item.category;
    if (!result[canteenKey]) result[canteenKey] = {};
    if (!result[canteenKey][categoryKey]) {
      const label = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
      result[canteenKey][categoryKey] = { label, items: [] };
    }
    const img = item.image.startsWith('images/') ? item.image.slice('images/'.length) : item.image;
    result[canteenKey][categoryKey].items.push({
      name: item.name,
      price: item.price,
      desc: '',
      img,
    });
  });
  return result;
}

/* ════════════════════════════════════════════════════════════
   MENU RENDERING (from canteen.js)
   ════════════════════════════════════════════════════════════ */

function showTab(tabKey) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.meal-tab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById('tab-' + tabKey);
  if (panel) panel.classList.add('active');
  const tabBtn = document.querySelector(`.meal-tab[data-tab="${tabKey}"]`);
  if (tabBtn) tabBtn.classList.add('active');
}

function buildItemCard(item) {
  const base = (typeof STATIC_BASE !== 'undefined' ? STATIC_BASE : '/static/');
  const imgSrc = base + 'images/' + item.img;
  const safeName = item.name.replace(/'/g, "\\'");
  return `
    <div class="menu-item">
      <div class="item-image">
        <img src="${imgSrc}" alt="${item.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>
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

function renderMenu(canteenKey) {
  const canteenData = DYNAMIC_MENU[canteenKey];
  if (!canteenData) return;
  const tabsEl = document.getElementById('meal-tabs');
  const panelsEl = document.getElementById('tab-panels');
  tabsEl.innerHTML = '';
  panelsEl.innerHTML = '';
  Object.keys(canteenData).forEach((tabKey, index) => {
    const section = canteenData[tabKey];
    const btn = document.createElement('div');
    btn.className = 'meal-tab' + (index === 0 ? ' active' : '');
    btn.dataset.tab = tabKey;
    btn.textContent = section.label;
    btn.addEventListener('click', () => showTab(tabKey));
    tabsEl.appendChild(btn);
    const panel = document.createElement('div');
    panel.id = 'tab-' + tabKey;
    panel.className = 'tab-content' + (index === 0 ? ' active' : '');
    panel.innerHTML = `<div class="menu-items">${section.items.map(buildItemCard).join('')}</div>`;
    panelsEl.appendChild(panel);
  });
}

/* ════════════════════════════════════════════════════════════
   CART LOGIC
   ════════════════════════════════════════════════════════════ */

function addToCart(name, price) {
  const existing = cart.find(i => i.name === name);
  if (existing) { existing.qty++; } else { cart.push({ name, price, qty: 1 }); }
  updateCart();
}

function updateQty(name, delta) {
  const item = cart.find(i => i.name === name);
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.name !== name);
  }
  updateCart();
}

function updateCart() {
  const cartCountEl = document.getElementById('cartCount');
  const cartTotalEl = document.getElementById('cartTotal');
  const cartItemsEl = document.getElementById('cartItems');

  cartCountEl.textContent = cart.reduce((s, i) => s + i.qty, 0);
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

function checkout() {
  if (cart.length === 0) {
    alert('Please add items to your cart first!');
    return;
  }
  const selectedSlot = document.querySelector('.slot-option.selected');
  if (!selectedSlot) {
    alert('Please select a pickup time slot!');
    return;
  }
  const checkoutData = {
    canteenId: currentCanteenId || '1',
    timeSlot: selectedSlot.textContent.trim(),
    items: cart.map(i => ({ name: i.name, price: i.price, qty: i.qty }))
  };
  localStorage.setItem('nuv_checkout', JSON.stringify(checkoutData));
  window.location.href = '/checkout';
}

/* ════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  buildSidebarItems();

  // Slot selection
  document.querySelectorAll('.slot-option').forEach(slot => {
    slot.addEventListener('click', function () {
      document.querySelectorAll('.slot-option').forEach(s => s.classList.remove('selected'));
      this.classList.add('selected');
    });
  });

  // Check URL param for direct canteen load
  const urlParams = new URLSearchParams(window.location.search);
  const canteenParam = urlParams.get('canteen');
  if (canteenParam && CANTEEN_CONFIG[canteenParam]) {
    const key = CANTEEN_CONFIG[canteenParam].key;
    selectCanteen(key);
  }
});