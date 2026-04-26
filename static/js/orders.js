/* ════════════════════════════════════════════════════════════
   orders.js — Past Orders page for NUV Nest Canteen
*/

/** Maps numeric canteen ID strings (from DB) to human-readable names for display. */
const CANTEEN_NAMES = {
  '1': 'Main Cafe',
  '2': 'Tea Post',
  '3': 'Tropical Bistro',
};


/** Wait for the HTML to fully load before running any code */
document.addEventListener('DOMContentLoaded', function () {
  loadOrders();  // fetch and render the user's past orders immediately on page load
});


function loadOrders() {
  const container = document.getElementById('orders-container');  // the div where all order cards will be injected

  fetch('/api/orders')  // GET request to Flask — returns array of this user's orders
    .then(response => {
      console.log('Response status:', response.status);  // log HTTP status for debugging
      if (!response.ok) {
        // Handle specific HTTP errors with helpful messages
        if (response.status === 403) throw new Error('Please log in to view orders');  // not authenticated
        throw new Error('Failed to load orders (HTTP ' + response.status + ')');       // any other HTTP error
      }
      return response.json();  // parse JSON body of the response
    })
    .then(orders => {
      console.log('Orders received:', orders);  // log data for debugging

      if (!Array.isArray(orders)) {
        // Safety check — backend should always return an array
        console.error('Expected array, got:', orders);
        throw new Error('Invalid response format');
      }

      if (orders.length === 0) {
        // User has no orders yet — show a friendly empty state instead of a blank page
        container.innerHTML = `
          <div class="empty-state">
            <h2>No orders yet</h2>
            <p>Place your first order from the canteen!</p>
          </div>`;
        return;  // stop here, nothing more to render
      }

      // Build and inject all order cards in one go
      // buildOrderCard() returns an HTML string for each order, join('') merges them all
      container.innerHTML = orders.map(order => buildOrderCard(order)).join('');
    })
    .catch(error => {
      // Any fetch or parsing error lands here — show an error message with a login link
      console.error('Error loading orders:', error);
      container.innerHTML = `
        <div class="error">
          <h3>⚠️ ${error.message}</h3>
          <p><a href="/login">Log in</a> to view your orders</p>
        </div>`;
    });
}

function buildStatusBadge(status, reason) {
  if (!status || status === 'success') {
    // Green paid badge — the happy path
    return `<span class="status-badge success">✓ Paid</span>`;
  }
  // Red failed badge + optional reason text below it
  return `
    <span class="status-badge failed">✗ Payment Failed</span>
    ${reason ? `<div class="failure-reason">Reason: ${reason}</div>` : ''}`;
    // the ternary only renders the reason div if a reason string exists
}

function buildOrderCard(order) {
  // Look up canteen name from our constant map, fallback to generic label if ID not found
  const canteenName = CANTEEN_NAMES[order.canteen_id] || 'Canteen ' + (order.canteen_id || '1');
  const isFailed    = order.status === 'failed';  // boolean used to apply different CSS classes for failed orders

  return `
    <div class="order-card ${isFailed ? 'order-failed' : ''}">
      <!-- order-failed class adds a red border/tint via CSS to visually distinguish failed orders -->

      <div class="order-header">
        <div>
          <div class="order-id">Order #${order.order_id}</div>           <!-- unique order number -->
          <div class="order-date">${order.created_at || 'Recent'}</div>  <!-- formatted timestamp from backend, fallback to 'Recent' -->
          <span class="time-slot">⏰ ${order.time_slot}</span>           <!-- pickup slot the user selected -->
          <span class="canteen-badge">${canteenName}</span>              <!-- which canteen this order is from -->
        </div>
        <div class="order-right">
          <div class="order-total ${isFailed ? 'total-failed' : ''}">₹${order.total}</div>
          <!-- total-failed class greys out or strikes through the total for failed orders -->
          ${buildStatusBadge(order.status, order.reason)}  <!-- green/red badge depending on payment outcome -->
        </div>
      </div>

      <!-- List every item in the order with its name, quantity, and line total -->
      <div class="items-list">
        ${order.items.map(item => `
          <div class="item">
            <span class="item-name">${item.name} × ${item.qty}</span>          <!-- item name and quantity -->
            <span class="item-price">₹${item.price * item.qty}</span>          <!-- line total (price × qty) -->
          </div>`).join('')}
        <!-- .map() creates one row per item, .join('') merges them into a single HTML string -->
      </div>
    </div>`;
}