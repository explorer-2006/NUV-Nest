// checkout.js — Razorpay payment flow for NUV Nest Canteen
//
// Globals injected by the Jinja template:
//   ORDER_TOTAL, CART_ITEMS, TIME_SLOT, CANTEEN_ID, RAZORPAY_KEY, USER_NAME


// ── UI HELPERS ───────────────────────────────────────────────────────────────

// Shows a colour-coded toast at the bottom of the screen for 3.5 s
function showToast(msg, type = "info") {
  const t = document.getElementById("co-toast");
  if (!t) return;
  t.textContent = msg;
  t.className   = `show ${type}`;               // type = 'info' | 'error' | 'success'
  setTimeout(() => { t.className = ""; }, 3500); // hide after 3.5 s
}

// Switches the Pay button between loading state (disabled + spinner) and normal
function setBtn(loading) {
  const btn     = document.getElementById("pay-btn");
  const btnText = document.getElementById("btn-text");
  const spinner = document.getElementById("btn-spinner");
  if (!btn) return;

  btn.disabled = loading; // disable while request is in flight to prevent double-clicks

  if (loading) {
    btnText.textContent   = "Creating order…";
    spinner.style.display = "block";
  } else {
    btnText.textContent   = `Pay ₹${ORDER_TOTAL} via Razorpay`;
    spinner.style.display = "none";
  }
}

// Shorthand to restore the Pay button — called in every cancel/error path
function resetBtn() { setBtn(false); }


// ── MAIN PAYMENT FLOW ────────────────────────────────────────────────────────

// Called when the user clicks Pay
async function initiatePayment() {

  if (!CART_ITEMS || CART_ITEMS.length === 0) {
    showToast("Your cart is empty. Please add items first.", "error");
    return;
  }

  setBtn(true); // show loading state

  try {

    // Step 1 — create an order on our backend; backend also calls Razorpay API
    const res = await fetch("/create-order", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items:      CART_ITEMS,  // [{ name, price, qty }, ...]
        time_slot:  TIME_SLOT,
        canteen_id: CANTEEN_ID,
      }),
    });

    const orderData = await res.json();
    if (orderData.error) throw new Error(orderData.error);

    // Step 2 — configure the Razorpay modal with the order details we got back
    const options = {
      key:         RAZORPAY_KEY,
      amount:      orderData.amount,            // in paise (₹1 = 100 paise)
      currency:    orderData.currency,          // "INR"
      name:        "NUV Nest — Canteen",
      description: "Food Order Payment",
      order_id:    orderData.razorpay_order_id, // signed order ID from Razorpay
      prefill:     { name: USER_NAME, email: "", contact: "" },
      theme:       { color: "#b32020" },

      // Step 3 — Razorpay calls this after a successful payment
      handler: async function (response) {

        // Tell our backend to mark the order as 'success' in the DB
        await fetch("/confirm-order", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            db_order_id:         orderData.db_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
          }),
        });

        // Redirect to confirmation page
        window.location.href =
          `/payment-success?payment_id=${response.razorpay_payment_id}&order_id=${response.razorpay_order_id}`;
      },

      // Fires when the user closes the modal without paying
      modal: {
        ondismiss: function () {
          showToast("Payment cancelled.", "info");
          resetBtn();
        },
      },
    };

    const rzp = new Razorpay(options);

    // Fires on hard declines (card rejected, timeout, etc.) — separate from ondismiss
    rzp.on("payment.failed", function (resp) {
      const reason = resp.error.description || resp.error.reason || "Unknown error";
      showToast(`Payment failed: ${reason}`, "error");
      resetBtn();
    });

    rzp.open(); // launch the modal

  } catch (err) {
    // Catches network errors or any server error thrown above
    showToast("Error: " + err.message, "error");
    resetBtn();
  }
}