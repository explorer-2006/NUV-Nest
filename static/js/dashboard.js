/* ── Sidebar toggle ── */
const sidebar   = document.getElementById('sidebar');
const mainEl    = document.getElementById('main');
const toggleBtn = document.getElementById('toggleBtn');

toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  mainEl.classList.toggle('expanded');
});

/* ── Dynamic greeting based on time of day ── */
(function setGreeting() {
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning'
                 : hour < 17 ? 'Good afternoon'
                 : 'Good evening';

  const greetEl = document.getElementById('greeting');
  if (greetEl) {
    // Replace the "Good morning" part but keep the name & emoji
    greetEl.textContent = greetEl.textContent.replace(
      /^Good (morning|afternoon|evening)/,
      greeting
    );
  }
})();

/* ── Dynamic date in topbar ── */
(function setDate() {
  const dateEl = document.getElementById('dateInfo');
  if (!dateEl) return;

  const today = new Date();
  const opts  = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const formatted = today.toLocaleDateString('en-IN', opts);

  // Prepend the formatted date; keep the " · Semester X ongoing" part
  const existing = dateEl.textContent;
  const semPart  = existing.includes('·') ? existing.substring(existing.indexOf('·')) : '';
  dateEl.textContent = formatted + (semPart ? '  ' + semPart : '');
})();
