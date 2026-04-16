/* ── School → Branch mapping ── */
const SCHOOL_BRANCHES = {
  "SBL": [
    "BBA",
    "BBA Hons Business Analytics",
    "BBA LLB",
    "MBA",
    "LLM",
    "Executive MBA",
    "PHD"
  ],
  "SET": [
    "BCA Hons AI-ML",
    "BSc Data Science",
    "BTech CSE",
    "BTech Mechanical",
    "BTech Civil",
    "BTech EEE",
    "BSc-MSc Computer Science AI-ML",
    "Integrated BTech MBA",
    "MSc Computer Science Coop",
    "MTech Structural Engineering",
    "MTech Robotics & Automation",
    "MTech Computer Science Engineering",
    "PHD"
  ],
  "SOS": [
    "BSc Chemistry",
    "BSc Microbiology",
    "BSc Zoology and Animal Technology",
    "BSc Botany and Plant Technology",
    "BSc-MSc Biomedical",
    "BSc-MSc Botany",
    "BSc-MSc Zoology",
    "BSc-MSc Microbiology",
    "BSc-MSc Food Science",
    "BSc-MSc Analytical Chemistry",
    "BSc-MSc Organic Chemistry",
    "MSc Organic Chemistry",
    "BSc Analytical Chemistry",
    "MSc Zoology & Biotechnology",
    "MSc Botany & Biotechnology",
    "MSc Microbiology",
    "MSc Clinical Embryology",
    "MSc Medicinal & Pharmaceutical Chemistry",
    "MSc Food Science & Dietetics",
    "PHD"
  ],
  "SEDA": [
    "BDesign Interior",
    "BDesign Product and Visual Communication",
    "BArch",
    "MPlan Urban & Regional Planning"
  ],
  "SLSE": [
    "BA Journalism & Mass Communication",
    "BA Humanities & Social Sciences",
    "BEd",
    "PHD"
  ]
};

/* ── Dynamic branch dropdown ── */
const schoolSelect  = document.getElementById('school');
const branchSelect  = document.getElementById('branch');

function updateBranches() {
  const school = schoolSelect.value;
  branchSelect.innerHTML = '<option value="">-- Select Program --</option>';
  branchSelect.disabled = !school;

  if (school && SCHOOL_BRANCHES[school]) {
    SCHOOL_BRANCHES[school].forEach(function(branch) {
      const opt = document.createElement('option');
      opt.value = branch;
      opt.textContent = branch;
      branchSelect.appendChild(opt);
    });
  }
}

if (schoolSelect) {
  schoolSelect.addEventListener('change', updateBranches);
  updateBranches(); // run on page load in case of back-navigation
}

/* ── Panel sweep animation ── */
const panel      = document.getElementById('panel');
const formsArea  = document.getElementById('formsArea');
const toggleBtn  = document.getElementById('panelToggle');
const panelTitle = document.getElementById('panelTitle');
const panelSub   = document.getElementById('panelSub');

const SWEEP_MS = 900;
const MIDPOINT = 480;
let animating  = false;
let isRegister = false;

// If page loaded with ?form=register (e.g. after a failed register POST)
if (window.location.search.includes('form=register') || document.body.dataset.form === 'register') {
  formsArea.classList.add('show-register');
  panel.classList.add('is-right');
  isRegister = true;
  panelTitle.innerHTML  = 'Welcome<br>Back!';
  panelSub.textContent  = 'Already have an account?';
  toggleBtn.textContent = 'Login';
}

toggleBtn.addEventListener('click', () => {
  if (animating) return;
  animating = true;
  toggleBtn.disabled = true;

  const sweepClass = isRegister ? 'sweep-left' : 'sweep-right';
  panel.classList.add(sweepClass);
  formsArea.classList.add('sweeping');

  setTimeout(() => {
    isRegister = !isRegister;

    if (isRegister) {
      panelTitle.innerHTML  = 'Welcome<br>Back!';
      panelSub.textContent  = 'Already have an account?';
      toggleBtn.textContent = 'Login';
    } else {
      panelTitle.innerHTML  = 'Hello,<br>Welcome!';
      panelSub.textContent  = "Don't have an account?";
      toggleBtn.textContent = 'Register';
    }

    panel.classList.toggle('is-right', isRegister);
    formsArea.classList.toggle('show-register', isRegister);
  }, MIDPOINT);

  setTimeout(() => {
    panel.classList.remove('sweep-right', 'sweep-left');
    formsArea.classList.remove('sweeping');
    toggleBtn.disabled = false;
    animating = false;
  }, SWEEP_MS);
});
