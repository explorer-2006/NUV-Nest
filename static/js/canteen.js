/*Canteen Menu + Cart */

const CANTEEN_CONFIG = {                                //Stores information about the 3 canteens available at the university.
  1: { key: 'main_cafe', name: 'Main Canteen'     },
  2: { key: 'tea_post',  name: 'Tea Post'          },
  3: { key: 'bistro',    name: 'Tropical Bistro'   },
};

function getCanteenConfig() {                                                  //Returns config object
  const param = new URLSearchParams(window.location.search).get('canteen');
  return CANTEEN_CONFIG[param] || null;
}                                                                                

let DYNAMIC_MENU = {};           //organised menu data from backend
let cart = [];                   //list of items the user selected 
let cartItemsEl, cartCountEl, cartTotalEl;    

function addToCart(name, price) {                                    //Check if item already exists in cart, if yes increment qty, else add new item
  const existing = cart.find(i => i.name === name);
  if (existing) { existing.qty++; } else { cart.push({ name, price, qty: 1 }); }
  updateCart();                       //Always refresh UI after change
}

function updateQty(name, delta) {
  const item = cart.find(i => i.name === name);
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.name !== name);      //Remove item if quantity becomes 0
  } 
  updateCart();
}

function updateCart() {
  cartCountEl.textContent = cart.reduce((s, i) => s + i.qty, 0);   //Update total quantity in cart 
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);    //Calculate total price
  cartTotalEl.textContent = '₹' + total;
  if (cart.length === 0) {
    cartItemsEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px 0;">Your cart is empty. Please add some items!</p>';
    return;
  }
  cartItemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">               <!--each item in cart with name, price, qty and buttons to update qty-->
      <div class="cart-item-info">        //Item name and price
        <div class="cart-item-name">${item.name}</div>              //item name 
        <div class="cart-item-price">₹${item.price} × ${item.qty}</div>    //item price and quantity
      </div>
      <div class="quantity-control">          //Buttons to decrease or increase quantity
        <button class="qty-btn" onclick="updateQty('${item.name.replace(/'/g, "\\'")}', -1)">−</button>         //Decrease quantity button
        <span>${item.qty}</span>    //Display current quantity
        <button class="qty-btn" onclick="updateQty('${item.name.replace(/'/g, "\\'")}', 1)">+</button>           //Increase quantity button
      </div>
    </div>
  `).join('');
}

async function checkout() {
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
    timeSlot:  selectedSlot.textContent.trim(),
    items:     cart.map(i => ({ name: i.name, price: i.price, qty: i.qty }))
  };

  // POST cart to Flask session, then redirect to checkout page
  const res = await fetch('/save-cart', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(checkoutData)
  });
  if (res.ok) {
    window.location.href = '/checkout';
  } else {
    alert('Could not save cart. Please try again.');
  }
}

function showTab(tabKey) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));      //Remove active from all tab buttons
  document.querySelectorAll('.meal-tab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById('tab-' + tabKey);    //Get the selected tab’s content panel
  if (panel) panel.classList.add('active');          //Activate the selected panel
  const tabBtn = document.querySelector(`.meal-tab[data-tab="${tabKey}"]`);         //Get the clicked tab button
  if (tabBtn) tabBtn.classList.add('active');      //Highlights the selected tab
}

function buildItemCard(item) {    //Builds HTML for a menu item card, including image, name, price, description and add to cart button
  const base = (typeof STATIC_BASE !== 'undefined' ? STATIC_BASE : '/static/');      //Construct image source URL, ensuring it works regardless of how the image path is stored in the data
  const imgSrc = base + 'images/' + item.img;  
  const safeName = item.name.replace(/'/g, "\\'");  //Escape single quotes in item name for use in onclick handler
  return `
    <div class="menu-item">
      <div class="item-image">
        <img src="${imgSrc}" alt="${item.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>  //Show image if it loads, otherwise hide img and show emoji fallback
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

function renderMenu(canteenKey) {                    //Renders the menu for the selected canteen by creating tab buttons and content panels based on the structured menu data. 
                                                    //It dynamically builds the HTML for each menu item using the buildItemCard function and organizes them into their respective categories (tabs).
  const canteenData = DYNAMIC_MENU[canteenKey];
  if (!canteenData) return;
  const tabsEl = document.getElementById('meal-tabs');  //where buttons go
  const panelsEl = document.getElementById('tab-panels');   //where content goes
  tabsEl.innerHTML = '';    //Removes previous menu before rendering new one
  panelsEl.innerHTML = '';  //Clears existing tabs and panels to prepare for new content
  Object.keys(canteenData).forEach((tabKey, index) => {           //tabkey - category key like breakfast, lunch etc. index - to set first tab as active by default
    const section = canteenData[tabKey];                          //Create tab button for each category, setting the first one as active by default
    const btn = document.createElement('div');                    //Builds the HTML for a menu item card, including image, name, price, description and add to cart button
    btn.className = 'meal-tab' + (index === 0 ? ' active' : '');
    btn.dataset.tab = tabKey;
    btn.textContent = section.label;                            //Set the button text to the category label (e.g., "Breakfast", "Lunch")
    btn.addEventListener('click', () => showTab(tabKey));       //add
    tabsEl.appendChild(btn); 
    const panel = document.createElement('div');   //creates panel for each category 
    panel.id = 'tab-' + tabKey;             
    panel.className = 'tab-content' + (index === 0 ? ' active' : '');
    panel.innerHTML = `<div class="menu-items">${section.items.map(buildItemCard).join('')}</div>`;
    panelsEl.appendChild(panel);
  });
}

function setPageMeta(canteenName) {              //Sets the page heading and date based on the selected canteen. It updates the text content of the heading element to display the canteen name followed by "Menu". This function ensures that the page displays relevant information about the menu being viewed.
  const heading = document.getElementById('canteen-heading');
  const dateEl = document.getElementById('menu-date');
  if (heading) heading.textContent = canteenName + ' Menu';
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {    //Formats the current date in a human-readable format using the toLocaleDateString method with options for weekday, day, month, and year.
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
}

function transformMenuData(flatList) {   //Transforms the flat list of menu items from the backend into a structured format organized by canteen and category. 
  const result = {};
  flatList.forEach(item => {
    const canteenKey = item.canteen;
    const categoryKey = item.category;
    if (!result[canteenKey]) result[canteenKey] = {};
    if (!result[canteenKey][categoryKey]) {
      const label = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
      result[canteenKey][categoryKey] = { label, items: [] };
    }
    const img = item.image.startsWith('images/') ? item.image.slice('images/'.length) : item.image;  // Normalize image path by removing 'images/' prefix if it exists.
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
    const response = await fetch('/api/menu');     //Fetch the menu data from the backend API endpoint.
    if (!response.ok) throw new Error(`API returned ${response.status}`);  // If the response is not successful, throw an error to be caught in the catch block.
    const flatList = await response.json();      
    DYNAMIC_MENU = transformMenuData(flatList);        //transforms data into js object with canteen keys and category keys.
    if (!DYNAMIC_MENU[config.key]) {      //If backend doesn’t have this canteen == redirect
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
