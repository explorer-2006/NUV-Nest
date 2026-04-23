/* ══════════════════════════════════════════════
   NUV Nest — Canteen Menu + Cart (canteen.js)
   ══════════════════════════════════════════════ */

const CANTEEN_CONFIG = {
  1: { key: 'main_cafe', name: 'Main Canteen'     },
  2: { key: 'tea_post',  name: 'Tea Post'          },
  3: { key: 'bistro',    name: 'Tropical Bistro'   },
};

function getCanteenConfig() {
  const param = new URLSearchParams(window.location.search).get('canteen');
  return CANTEEN_CONFIG[param] || null;
}

let DYNAMIC_MENU = {};
let cart = [];
let cartItemsEl, cartCountEl, cartTotalEl;

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
  const canteenId = new URLSearchParams(window.location.search).get('canteen') || '1';
  const checkoutData = {
    canteenId: canteenId,
    timeSlot: selectedSlot.textContent.trim(),
    items: cart.map(i => ({ name: i.name, price: i.price, qty: i.qty }))
  };
  localStorage.setItem('nuv_checkout', JSON.stringify(checkoutData));
  window.location.href = '/checkout';
}

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

function setPageMeta(canteenName) {
  const heading = document.getElementById('canteen-heading');
  const dateEl = document.getElementById('menu-date');
  if (heading) heading.textContent = canteenName + ' Menu';
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
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

document.addEventListener('DOMContentLoaded', async () => {
  cartItemsEl = document.getElementById('cartItems');
  cartCountEl = document.getElementById('cartCount');
  cartTotalEl = document.getElementById('cartTotal');

  document.querySelectorAll('.slot-option').forEach(slot => {
    slot.addEventListener('click', function () {
      document.querySelectorAll('.slot-option').forEach(s => s.classList.remove('selected'));
      this.classList.add('selected');
    });
  });

  const config = getCanteenConfig();
  if (!config) {
    window.location.href = '/menu';
    return;
  }

  try {
    const response = await fetch('/api/menu');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const flatList = await response.json();
    DYNAMIC_MENU = transformMenuData(flatList);
    if (!DYNAMIC_MENU[config.key]) {
      window.location.href = '/menu';
      return;
    }
    setPageMeta(config.name);
    renderMenu(config.key);
  } catch (err) {
    console.error('Failed to load menu:', err);
    const panelsEl = document.getElementById('tab-panels');
    if (panelsEl) {
      panelsEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0;">Menu could not be loaded. Please try again later.</p>';
    }
  }
});