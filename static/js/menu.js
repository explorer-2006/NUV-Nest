/* ══════════════════════════════════════════════
   NUV Nest — Canteen Selection (menu.js)
   ══════════════════════════════════════════════ */

const CANTEENS = [
  {
    key:   'main_cafe',   // FIXED — was 'main', folder on disk is main_cafe
    name:  'Main Canteen',
    icon:  '🍽️',
    desc:  'Full-service dining with breakfast, lunch, snacks, dinner and beverages — the complete NUV dining experience.',
    tags:  [
      { label: 'Open Now', type: 'open' },
      { label: '7 AM – 10 PM',  type: '' },
      { label: 'Veg & More',    type: '' },
    ],
  },
  {
    key:   'tea_post',    // FIXED — was 'tea', folder on disk is tea_post
    name:  'Tea Post',
    icon:  '☕',
    desc:  'Your go-to spot for hot chai, maska bun, and quick bites between lectures.',
    tags:  [
      { label: 'Open Now', type: 'open' },
      { label: '7 AM – 8 PM', type: '' },
      { label: 'Beverages',   type: '' },
    ],
  },
  {
    key:   'bistro',      // UNCHANGED — confirm a 'bistro' folder exists in static/images/
    name:  'Tropical Bistro',
    icon:  '🌿',
    desc:  'Café-style snacks, burgers, pasta, and refreshing drinks in a relaxed campus setting.',
    tags:  [
      { label: 'Open Now', type: 'open' },
      { label: '9 AM – 9 PM', type: '' },
      { label: 'Quick Bites',  type: '' },
    ],
  },
];

/* ── Build cards ────────────────────────────────────────────── */
function buildSelectionCards() {
  const grid = document.getElementById('canteen-select-grid');
  if (!grid) return;

  CANTEENS.forEach(canteen => {
    const card = document.createElement('div');
    card.className = 'canteen-select-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Select ' + canteen.name);

    const tagsHTML = canteen.tags.map(t =>
      `<span class="meta-pill ${t.type}">
        ${t.type === 'open' ? '<span class="dot"></span>' : ''}
        ${t.label}
      </span>`
    ).join('');

    card.innerHTML = `
      <div class="select-card-arrow">→</div>
      <div class="select-card-icon">${canteen.icon}</div>
      <div class="select-card-body">
        <div class="select-card-name">${canteen.name}</div>
        <div class="select-card-desc">${canteen.desc}</div>
      </div>
      <div class="select-card-meta">${tagsHTML}</div>
    `;

    card.addEventListener('click', () => selectCanteen(canteen.key));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectCanteen(canteen.key);
      }
    });

    grid.appendChild(card);
  });
}

/* ── Select & redirect ──────────────────────────────────────── */
function selectCanteen(key) {
  localStorage.setItem('selectedCanteen', key);
  window.location.href = '/canteen';
}

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', buildSelectionCards);