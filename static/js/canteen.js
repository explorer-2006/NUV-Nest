/* ══════════════════════════════════════════════
   NUV Nest — Canteen Menu + Cart (canteen.js)
   ══════════════════════════════════════════════ */

/* ── Canteen Display Names ──────────────────────────────────── */
const CANTEEN_NAMES = {
  main:      'Main Canteen',
  tea:       'Tea Post',
  bistro:    'Tropical Bistro',
  main_cafe: 'Main Café',
};

/* ── Dynamic menu — populated after fetch ───────────────────── */
let DYNAMIC_MENU = {};

/* ── Cart state ─────────────────────────────────────────────── */
let cart = [];

// FIXED — declared here but assigned inside DOMContentLoaded
//         (previously assigned at top level via getElementById,
//          which returned null because the DOM wasn't ready yet,
//          causing the entire script to crash before renderMenu ran)
let cartItemsEl, cartCountEl, cartTotalEl;

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

async function checkout() {
  if (cart.length === 0) { alert('Please add items to your cart first!'); return; }

  const currentUserId = "user_1";
  const selectedSlot  = document.querySelector('.slot-option.selected');
  const time_slot     = selectedSlot ? selectedSlot.textContent.trim() : 'No slot selected';
  const total         = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const response = await fetch('/api/order', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id:   currentUserId,
      total:     total,
      time_slot: time_slot,
      items:     cart.map(i => ({ name: i.name, price: i.price, qty: i.qty }))
    })
  });

  const data = await response.json();
  alert(data.message || 'Order placed successfully!');
  cart = [];
  updateCart();
}

/* ════════════════════════════════════════════════════════════
   MENU RENDERING
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
  const base     = (typeof STATIC_BASE !== 'undefined' ? STATIC_BASE : '/static/');
  const imgSrc   = base + 'images/' + item.img;
  const safeName = item.name.replace(/'/g, "\\'");

  return `
    <div class="menu-item">
      <div class="item-image">
        <img
          src="${imgSrc}"
          alt="${item.name}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        />
        <span class="item-image-emoji" style="display:none;">🍴</span>
      </div>
      <div class="item-details">
        <div class="item-name">${item.name}</div>
        <div class="item-price">₹${item.price}</div>
        <div class="item-desc">${item.desc}</div>
        <button class="add-btn" onclick="addToCart('${safeName}', ${item.price})">
          Add to Cart
        </button>
      </div>
    </div>`;
}

function renderMenu(canteenKey) {
  const canteenData = DYNAMIC_MENU[canteenKey];
  if (!canteenData) return;

  const tabsEl   = document.getElementById('meal-tabs');
  const panelsEl = document.getElementById('tab-panels');
  tabsEl.innerHTML   = '';
  panelsEl.innerHTML = '';

  Object.keys(canteenData).forEach((tabKey, index) => {
    const section = canteenData[tabKey];

    const btn = document.createElement('div');
    btn.className   = 'meal-tab' + (index === 0 ? ' active' : '');
    btn.dataset.tab = tabKey;
    btn.textContent = section.label;
    btn.addEventListener('click', () => showTab(tabKey));
    tabsEl.appendChild(btn);

    const panel     = document.createElement('div');
    panel.id        = 'tab-' + tabKey;
    panel.className = 'tab-content' + (index === 0 ? ' active' : '');
    panel.innerHTML = `<div class="menu-items">${section.items.map(buildItemCard).join('')}</div>`;
    panelsEl.appendChild(panel);
  });
}

function setPageMeta(canteenKey) {
  const heading = document.getElementById('canteen-heading');
  const dateEl  = document.getElementById('menu-date');
  if (heading) heading.textContent = (CANTEEN_NAMES[canteenKey] || 'Canteen') + ' Menu';
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
}

function transformMenuData(flatList) {
  const result = {};
  flatList.forEach(item => {
    const canteenKey  = item.canteen;
    const categoryKey = item.category;

    if (!result[canteenKey]) result[canteenKey] = {};

    if (!result[canteenKey][categoryKey]) {
      const label = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
      result[canteenKey][categoryKey] = { label, items: [] };
    }

    const img = item.image.startsWith('images/')
      ? item.image.slice('images/'.length)
      : item.image;

    result[canteenKey][categoryKey].items.push({
      name:  item.name,
      price: item.price,
      desc:  '',
      img,
    });
  });
  return result;
}

/* ════════════════════════════════════════════════════════════
   INIT — all DOM interaction starts here, after DOM is ready
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {

  // FIXED — safe to look up DOM elements now
  cartItemsEl = document.getElementById('cartItems');
  cartCountEl = document.getElementById('cartCount');
  cartTotalEl = document.getElementById('cartTotal');

  // Time slot selection
  document.querySelectorAll('.slot-option').forEach(slot => {
    slot.addEventListener('click', function () {
      document.querySelectorAll('.slot-option').forEach(s => s.classList.remove('selected'));
      this.classList.add('selected');
    });
    initOrderHistory();
  });

  const selected = localStorage.getItem('selectedCanteen');
  if (!selected) {
    window.location.href = '/menu';
    return;
  }

  try {
    const response = await fetch('/api/menu');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const flatList = await response.json();

    DYNAMIC_MENU = transformMenuData(flatList);

    if (!DYNAMIC_MENU[selected]) {
      window.location.href = '/menu';
      return;
    }

    setPageMeta(selected);
    renderMenu(selected);

  } catch (err) {
    console.error('Failed to load menu:', err);
    const panelsEl = document.getElementById('tab-panels');
    if (panelsEl) {
      panelsEl.innerHTML =
        '<p style="color:var(--muted);text-align:center;padding:40px 0;">' +
        'Menu could not be loaded. Please try again later.</p>';
    }
  }
  async function loadOrderHistory(userId) {
  const response = await fetch('/api/orders/' + userId);
  const orders   = await response.json();
  console.log('Order history:', orders);
  return orders;
}

function reorder(order) {
  cart = order.items.map(i => ({ name: i.name, price: i.price, qty: i.qty }));
  updateCart();
}
/* ════════════════════════════════════════════════════════════
   ORDER HISTORY + REORDER PANEL
   ════════════════════════════════════════════════════════════ */

const CURRENT_USER_ID = "user_1";

/* ── Inject "My Orders" button below checkout btn ───────────── */
function injectOrderHistoryUI() {
  const checkoutBtn = document.querySelector('.checkout-btn');
  if (!checkoutBtn) return;

  const btn = document.createElement('button');
  btn.className   = 'checkout-btn';
  btn.id          = 'orders-toggle-btn';
  btn.textContent = '🧾 View Past Orders';
  btn.style.cssText = `
    margin-top: 10px;
    background: transparent;
    border: 2px solid var(--primary, #2563eb);
    color: var(--primary, #2563eb);
  `;
  btn.onclick = toggleOrderPanel;
  checkoutBtn.insertAdjacentElement('afterend', btn);

  // Slide-down panel injected right after the button
  const panel = document.createElement('div');
  panel.id = 'orders-panel';
  panel.style.cssText = `
    display: none;
    margin-top: 14px;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    background: var(--bg, #fff);
    max-height: 420px;
    overflow-y: auto;
  `;
  panel.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid #e5e7eb;
                display:flex;justify-content:space-between;align-items:center;">
      <span style="font-weight:700;font-size:14px;">Order History</span>
      <span id="orders-panel-close"
            onclick="toggleOrderPanel()"
            style="cursor:pointer;color:#9ca3af;font-size:18px;line-height:1;">✕</span>
    </div>
    <div id="orders-list" style="padding:12px;">
      <p style="color:#9ca3af;text-align:center;padding:20px 0;font-size:13px;">
        Loading...
      </p>
    </div>
  `;
  btn.insertAdjacentElement('afterend', panel);
}

/* ── Toggle panel open/close ────────────────────────────────── */
function toggleOrderPanel() {
  const panel  = document.getElementById('orders-panel');
  const btn    = document.getElementById('orders-toggle-btn');
  const isOpen = panel.style.display === 'block';

  if (isOpen) {
    panel.style.display  = 'none';
    btn.textContent      = '🧾 View Past Orders';
  } else {
    panel.style.display  = 'block';
    btn.textContent      = '✕ Close Orders';
    renderOrderList();
  }
}

/* ── Fetch + render list ─────────────────────────────────────── */
async function renderOrderList() {
  const listEl = document.getElementById('orders-list');
  listEl.innerHTML = `
    <p style="color:#9ca3af;text-align:center;padding:20px 0;font-size:13px;">
      Loading...
    </p>`;

  const orders = await loadOrderHistory(CURRENT_USER_ID);

  if (!orders || orders.length === 0) {
    listEl.innerHTML = `
      <p style="color:#9ca3af;text-align:center;padding:24px 0;font-size:13px;">
        No past orders yet.<br>Place your first order!
      </p>`;
    return;
  }

  listEl.innerHTML = orders.map(order => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;
                margin-bottom:10px;background:#fafafa;">

      <div style="display:flex;justify-content:space-between;
                  align-items:center;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:700;color:#374151;">
          Order #${order.order_id}
        </span>
        <span style="font-size:11px;color:#9ca3af;">
          ${new Date(order.created_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
          })}
        </span>
      </div>

      <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">
        🕐 ${order.time_slot}
      </div>

      <div style="font-size:12px;color:#4b5563;margin-bottom:8px;line-height:1.6;">
        ${order.items.map(i =>
          `<span style="display:inline-block;background:#f3f4f6;
                        border-radius:6px;padding:1px 7px;margin:2px 2px 0 0;">
            ${i.name} × ${i.qty}
          </span>`
        ).join('')}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;
                  border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px;">
        <span style="font-size:13px;font-weight:700;color:#111;">
          ₹${order.total}
        </span>
        <button
          onclick='handleReorder(${JSON.stringify(order)})'
          style="background:#2563eb;color:#fff;border:none;border-radius:8px;
                 padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;">
          🔁 Reorder
        </button>
      </div>
    </div>
  `).join('');
}

/* ── Reorder — rebuild cart, close panel, scroll to cart ───── */
function handleReorder(order) {
  reorder(order);
  toggleOrderPanel();

  // Scroll cart into view so the user sees items were added
  const cartSection = document.querySelector('.cart-section');
  if (cartSection) {
    cartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Brief flash on cart header to confirm
  const cartHeader = document.querySelector('.cart-header');
  if (cartHeader) {
    cartHeader.style.transition   = 'background 0.3s';
    cartHeader.style.background   = '#dbeafe';
    setTimeout(() => cartHeader.style.background = '', 800);
  }
}

/* ── Bootstrap: only inject UI if user has ≥1 past order ───── */
async function initOrderHistory() {
  const orders = await loadOrderHistory(CURRENT_USER_ID);
  if (orders && orders.length > 0) {
    injectOrderHistoryUI();
  }
}
});