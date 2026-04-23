// ── State & Data ──────────────────────────────────────────────
let QUESTIONS = [], FLASHCARDS = [];
const S = {
  xp: 0, level: 1, streak: 0, lastStudied: null,
  dailyDone: false, dailyDate: '',
  correct: 0, total: 0,
  catStats: {},   // {category: {correct, total}}
  unitProgress: {},  // {unit: {seen, correct}}
  flagged: [],   // question ids flagged by admin
  inactive: [],  // question ids deactivated by admin
  unlockedGames: []
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('apgov_state') || '{}');
    Object.assign(S, saved);
  } catch(e) {}
}
function saveState() {
  localStorage.setItem('apgov_state', JSON.stringify(S));
}

// ── Data Loading ─────────────────────────────────────────────
async function loadData() {
  try {
    const [qRes, fRes] = await Promise.all([
      fetch('data/questions.json'),
      fetch('data/flashcards.json')
    ]);
    QUESTIONS = await qRes.json();
    FLASHCARDS = await fRes.json();
    // Apply admin overrides from localStorage
    const overrides = JSON.parse(localStorage.getItem('apgov_overrides') || '{}');
    if (overrides.questions) {
      // Merge admin-edited questions
      overrides.questions.forEach(oq => {
        const idx = QUESTIONS.findIndex(q => q.id === oq.id);
        if (idx >= 0) QUESTIONS[idx] = oq; else QUESTIONS.push(oq);
      });
    }
    if (overrides.deleted) {
      QUESTIONS = QUESTIONS.filter(q => !overrides.deleted.includes(q.id));
    }
  } catch(e) {
    console.error('Failed to load data', e);
  }
  try {
    const adminInactive = JSON.parse(localStorage.getItem('apgov_inactive') || '[]');
    S.inactive = [...new Set([...S.inactive, ...adminInactive])];
  } catch(e) {}
}

function activeQuestions() {
  return QUESTIONS.filter(q => !S.inactive.includes(q.id));
}

// ── Routing ─────────────────────────────────────────────────
const screens = ['home','study','flashcard','quiz','minigames','stats'];
function showScreen(id) {
  clearInterval(timerInterval);
  clearInterval(blitzTimer);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id)?.classList.add('active');
  document.querySelectorAll('.botnav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === id);
  });
}

// ── XP / Level ───────────────────────────────────────────────
const XP_PER_LEVEL = 300;
function updateStreak() {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (S.lastStudied === today) return;
  S.streak = (S.lastStudied === yesterday) ? S.streak + 1 : 1;
  S.lastStudied = today;
}
function addXP(amount) {
  S.xp += amount;
  const newLevel = Math.floor(S.xp / XP_PER_LEVEL) + 1;
  if (newLevel > S.level) {
    S.level = newLevel;
    showToast(`🎉 Level ${S.level} unlocked!`);
    checkUnlocks();
  }
  saveState();
  renderTopbar();
}

function checkUnlocks() {
  const games = [
    { id: 'match', level: 2, name: 'SCOTUS Match' },
    { id: 'decoder', level: 3, name: 'Quote Decoder' },
    { id: 'blitz', level: 4, name: 'Blitz Mode' }
  ];
  games.forEach(g => {
    if (S.level >= g.level && !S.unlockedGames.includes(g.id)) {
      S.unlockedGames.push(g.id);
      showToast(`🔓 ${g.name} unlocked!`);
    }
  });
}

// ── Confirm Dialog ───────────────────────────────────────────
let confirmResolve = () => {};
function showConfirm(msg, onConfirm, okLabel = 'Confirm', danger = true) {
  document.getElementById('confirm-msg').textContent = msg;
  const okBtn = document.getElementById('confirm-ok');
  okBtn.textContent = okLabel;
  okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
  document.getElementById('confirm-overlay').classList.add('open');
  document.getElementById('confirm-modal').classList.add('open');
  confirmResolve = (ok) => {
    document.getElementById('confirm-overlay').classList.remove('open');
    document.getElementById('confirm-modal').classList.remove('open');
    if (ok) onConfirm();
  };
}

// ── Toast ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Topbar ───────────────────────────────────────────────────
function renderTopbar() {
  const xpInLevel = S.xp % XP_PER_LEVEL;
  const pct = (xpInLevel / XP_PER_LEVEL) * 100;
  document.getElementById('xp-bar').style.width = pct + '%';
  document.getElementById('stat-xp').textContent = xpInLevel;
  document.getElementById('stat-streak').textContent = S.streak;
  document.getElementById('stat-level').textContent = S.level;
}

// ── Settings ─────────────────────────────────────────────────
function openSettings() {
  const list = document.getElementById('settings-unit-list');
  list.innerHTML = UNITS.map(u =>
    `<button class="settings-unit-btn" onclick="resetUnit('${u.id}')">${u.icon} Reset ${u.name.split(':')[0]}</button>`
  ).join('');
  document.getElementById('settings-overlay').classList.add('open');
  document.getElementById('settings-modal').classList.add('open');
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
  document.getElementById('settings-modal').classList.remove('open');
}
function resetUnit(unitId) {
  delete S.catStats[unitId];
  delete S.unitProgress[unitId];
  saveState();
  renderTopbar();
  showToast('Unit progress reset');
  closeSettings();
}
function resetAll() {
  showConfirm('Reset ALL progress? This cannot be undone.', () => {
    S.xp = 0; S.level = 1; S.streak = 0; S.lastStudied = null;
    S.dailyDone = false; S.dailyDate = '';
    S.correct = 0; S.total = 0;
    S.catStats = {}; S.unitProgress = {};
    S.unlockedGames = [];
    saveState();
    renderTopbar();
    renderHome();
    showToast('All progress reset');
    closeSettings();
  });
}

// ── Home Screen ──────────────────────────────────────────────
function renderHome() {
  const today = new Date().toDateString();
  if (S.dailyDate !== today) S.dailyDone = false;

  document.getElementById('stat-correct').textContent = S.correct;
  document.getElementById('stat-total').textContent = S.total;
  const acc = S.total ? Math.round((S.correct / S.total) * 100) : 0;
  document.getElementById('stat-acc').textContent = acc + '%';

  const dailyBtn = document.getElementById('daily-btn');
  if (S.dailyDone) {
    dailyBtn.querySelector('.daily-badge').textContent = '✓ Done Today';
    dailyBtn.querySelector('.daily-sub').textContent = 'Come back tomorrow for more XP!';
  }

  renderUnitProgress();
}

const UNITS = [
  { id: 'unit1', icon: '🏛️', name: 'Unit 1: Foundations', sub: 'Democracy, Enlightenment, Path to Constitution' },
  { id: 'unit2', icon: '📜', name: 'Unit 2: Constitution & Federalism', sub: 'Civil liberties, Amendments, Grants' },
  { id: 'unit3', icon: '🏦', name: 'Unit 3: Legislative Branch', sub: 'Congress, Bills, Fiscal Policy' },
  { id: 'unit4', icon: '🦅', name: 'Unit 4: Executive Branch', sub: 'Presidency, Bureaucracy, Roles' },
  { id: 'unit5', icon: '⚖️', name: 'Unit 5: Judicial Branch & Civil Rights', sub: 'Courts, SCOTUS, Civil Rights' },
  { id: 'scotus', icon: '🔨', name: 'SCOTUS Cases', sub: '15 required Supreme Court cases' },
  { id: 'documents', icon: '📋', name: 'Foundational Documents', sub: '9 required documents' },
  { id: 'amendments', icon: '⭐', name: 'Amendments', sub: 'All 27 constitutional amendments' },
];

function renderUnitProgress() {
  const list = document.getElementById('unit-progress-list');
  const allActive = activeQuestions();
  list.innerHTML = UNITS.map(u => {
    const st = S.catStats[u.id] || { correct: 0, total: 0 };
    const pct = st.total ? Math.round((st.correct / st.total) * 100) : 0;
    const totalQ = allActive.filter(q => q.category === u.id).length;
    return `<div class="unit-row" onclick="startStudy('${u.id}')">
      <div class="unit-icon">${u.icon}</div>
      <div class="unit-info">
        <div class="unit-name">${u.name}</div>
        <div class="unit-sub">${u.sub}</div>
      </div>
      <div class="unit-right">
        <div class="unit-pct">${pct}%</div>
        <div class="unit-answered">${st.total} / ${totalQ} answered</div>
        <div class="prog-bar-wrap"><div class="prog-bar" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join('');
}

// ── Study Mode (select → flashcards or quiz) ─────────────────
function renderStudySelect() {
  const list = document.getElementById('study-select-list');
  const allActive = activeQuestions();
  list.innerHTML = UNITS.map(u => {
    const qCount = allActive.filter(q => q.category === u.id).length;
    const fcCount = FLASHCARDS.filter(f => f.category === u.id || (u.id.startsWith('unit') && f.category === u.id)).length;
    return `<div class="select-item" onclick="pickStudyMode('${u.id}')">
      <div class="si-icon">${u.icon}</div>
      <div class="si-info">
        <div class="si-name">${u.name}</div>
        <div class="si-sub">${qCount} questions · ${fcCount} flashcards</div>
      </div>
      <div class="si-arrow">›</div>
    </div>`;
  }).join('');
  showScreen('study');
}

let currentStudyUnit = '';
function pickStudyMode(unitId) {
  currentStudyUnit = unitId;
  const unit = UNITS.find(u => u.id === unitId);
  document.getElementById('study-mode-title').textContent = unit.name;
  document.getElementById('screen-study').innerHTML = `
    <button class="back-btn" onclick="renderStudySelect()">‹ Back</button>
    <h2>${unit.icon} ${unit.name}</h2>
    <p style="margin:0.4rem 0 1.25rem">${unit.sub}</p>
    <div class="mode-grid">
      <div class="mode-card" onclick="startFlashcards('${unitId}')">
        <div class="mode-icon">🃏</div><h3>Flashcards</h3><p>Review key concepts</p>
      </div>
      <div class="mode-card red" onclick="startQuiz('${unitId}')">
        <div class="mode-icon">🧠</div><h3>Quiz</h3><p>Test your knowledge</p>
      </div>
    </div>
    <div class="mode-grid">
      <div class="mode-card" onclick="startQuiz('${unitId}','easy')">
        <div class="mode-icon">🟢</div><h3>Easy Only</h3><p>Build confidence</p>
      </div>
      <div class="mode-card" onclick="startQuiz('${unitId}','hard')">
        <div class="mode-icon">🔴</div><h3>Hard Only</h3><p>Challenge yourself</p>
      </div>
    </div>`;
}

function startStudy(unitId) {
  renderStudySelect();
  setTimeout(() => pickStudyMode(unitId), 50);
}

// ── Flashcards ───────────────────────────────────────────────
let fcCards = [], fcIdx = 0, fcFlipped = false;

function startFlashcards(unitId) {
  const unit = UNITS.find(u => u.id === unitId);
  fcCards = FLASHCARDS.filter(f => {
    if (unitId === 'scotus') return f.category === 'scotus';
    if (unitId === 'documents') return f.category === 'documents';
    if (unitId === 'amendments') return f.category === 'unit2' && f.topic.toLowerCase().includes('amendment');
    return f.category === unitId;
  });
  if (!fcCards.length) { showToast('No flashcards for this category yet'); return; }
  fcIdx = 0; fcFlipped = false;
  document.getElementById('fc-unit-name').textContent = unit.icon + ' ' + unit.name;
  renderFlashcard();
  showScreen('flashcard');
}

function renderFlashcard() {
  const card = fcCards[fcIdx];
  document.getElementById('fc-progress-text').textContent = `${fcIdx + 1} / ${fcCards.length}`;
  document.getElementById('fc-front-topic').textContent = card.topic || card.category.toUpperCase();
  document.getElementById('fc-front-text').textContent = card.front;
  document.getElementById('fc-back-content').textContent = card.back;
  const inner = document.getElementById('fc-inner');
  inner.classList.remove('flipped');
  fcFlipped = false;

  const dots = document.getElementById('fc-dots');
  dots.innerHTML = fcCards.map((_, i) =>
    `<div class="fc-dot ${i < fcIdx ? 'seen' : ''} ${i === fcIdx ? 'current' : ''}"></div>`
  ).join('');
}

function flipCard() {
  fcFlipped = !fcFlipped;
  document.getElementById('fc-inner').classList.toggle('flipped', fcFlipped);
}
function fcNext() {
  if (fcIdx < fcCards.length - 1) { fcIdx++; renderFlashcard(); }
  else showToast('🎉 You finished all flashcards!');
}
function fcPrev() {
  if (fcIdx > 0) { fcIdx--; renderFlashcard(); }
}
function fcShuffle() {
  fcCards = shuffle(fcCards);
  fcIdx = 0; renderFlashcard();
  showToast('Shuffled!');
}

// ── Quiz ─────────────────────────────────────────────────────
let quizQ = [], quizIdx = 0, quizScore = 0, quizXP = 0;
let quizAnswered = false, timerInterval, timeLeft, isDailyChallenge = false;
const QUIZ_LENGTH = 10, TIMER_SECS = 30;

function startQuiz(unitId, difficulty) {
  isDailyChallenge = false;
  let pool = activeQuestions().filter(q => q.category === unitId);
  if (difficulty) pool = pool.filter(q => q.difficulty === difficulty);
  if (!pool.length) { showToast('No questions for this filter'); return; }
  quizQ = shuffle(pool).slice(0, QUIZ_LENGTH);
  quizIdx = 0; quizScore = 0; quizXP = 0;
  showScreen('quiz');
  renderQuizQuestion();
}

function startQuizAll() {
  isDailyChallenge = false;
  let pool = activeQuestions();
  quizQ = shuffle(pool).slice(0, QUIZ_LENGTH);
  quizIdx = 0; quizScore = 0; quizXP = 0;
  showScreen('quiz');
  renderQuizQuestion();
}

function startDailyChallenge() {
  isDailyChallenge = true;
  const today = new Date().toDateString();
  if (S.dailyDone && S.dailyDate === today) { showToast('Already done today! 🌟'); return; }
  // Seed by date for consistent daily questions
  const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  const pool = activeQuestions();
  quizQ = seededShuffle(pool, seed).slice(0, 5);
  quizIdx = 0; quizScore = 0; quizXP = 0;
  showScreen('quiz');
  renderQuizQuestion(true);
}

function renderQuizQuestion(isDaily) {
  clearInterval(timerInterval);
  quizAnswered = false;
  const q = quizQ[quizIdx];

  // progress pips
  document.getElementById('q-pips').innerHTML = quizQ.map((_, i) =>
    `<div class="q-pip ${i < quizIdx ? '' : i === quizIdx ? 'current' : ''}"></div>`
  ).join('');

  document.getElementById('q-category-tag').textContent = categoryLabel(q.category);
  document.getElementById('q-counter').textContent = `${quizIdx + 1} / ${quizQ.length}`;
  document.getElementById('q-difficulty').textContent = q.difficulty;
  document.getElementById('q-difficulty').className = 'q-difficulty ' + q.difficulty;
  document.getElementById('question-text').textContent = q.question;
  document.getElementById('explanation-box').classList.remove('show');
  document.getElementById('explanation-box').textContent = '';
  document.getElementById('quiz-next-btn').style.display = 'none';

  const opts = document.getElementById('options-list');
  const letters = ['A', 'B', 'C', 'D'];
  opts.innerHTML = q.options.map((o, i) =>
    `<button class="opt-btn" onclick="selectAnswer(${i})" id="opt-${i}">
      <span class="opt-letter">${letters[i]}</span>${o}
    </button>`
  ).join('');

  // Timer
  timeLeft = TIMER_SECS;
  updateTimerBar();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerBar();
    if (timeLeft <= 0) { clearInterval(timerInterval); timeExpired(); }
  }, 1000);
}

function updateTimerBar() {
  const bar = document.getElementById('timer-bar');
  const pct = (timeLeft / TIMER_SECS) * 100;
  bar.style.width = pct + '%';
  bar.classList.toggle('warn', timeLeft <= 10);
}

function timeExpired() {
  if (quizAnswered) return;
  quizAnswered = true;
  const q = quizQ[quizIdx];
  document.getElementById(`opt-${q.correct}`).classList.add('reveal');
  showExplanation(q, false);
  document.getElementById('quiz-next-btn').style.display = 'block';
}

function selectAnswer(idx) {
  if (quizAnswered) return;
  quizAnswered = true;
  clearInterval(timerInterval);
  const q = quizQ[quizIdx];
  const correct = idx === q.correct;

  document.getElementById(`opt-${idx}`).classList.add(correct ? 'correct' : 'wrong');
  if (!correct) document.getElementById(`opt-${q.correct}`).classList.add('reveal');
  document.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);

  // Update pip
  const pips = document.querySelectorAll('.q-pip');
  if (pips[quizIdx]) pips[quizIdx].classList.add(correct ? 'correct' : 'wrong');

  if (correct) {
    quizScore++;
    quizXP += q.xp || 10;
    recordAnswer(q, true);
  } else {
    recordAnswer(q, false);
  }

  showExplanation(q, correct);
  document.getElementById('quiz-next-btn').style.display = 'block';
}

function showExplanation(q, correct) {
  const box = document.getElementById('explanation-box');
  box.classList.add('show');
  const label = document.createElement('strong');
  label.textContent = correct ? '✓ Correct!' : '✗ Incorrect.';
  box.replaceChildren(label, document.createTextNode(' ' + q.explanation));
}

function nextQuestion() {
  quizIdx++;
  if (quizIdx >= quizQ.length) showResults();
  else renderQuizQuestion();
}

function showResults() {
  const pct = Math.round((quizScore / quizQ.length) * 100);
  addXP(quizXP);

  const today = new Date().toDateString();
  if (isDailyChallenge) {
    S.dailyDate = today;
    S.dailyDone = true;
    updateStreak();
  }
  saveState();

  document.getElementById('res-score').textContent = quizScore;
  document.getElementById('res-total').textContent = quizQ.length;
  document.getElementById('res-pct').textContent = pct + '%';
  document.getElementById('res-xp').textContent = '+' + quizXP + ' XP earned';
  document.getElementById('res-correct').textContent = quizScore;
  document.getElementById('res-wrong').textContent = quizQ.length - quizScore;
  showScreen('results');
}

function recordAnswer(q, correct) {
  S.total++;
  if (correct) S.correct++;
  if (!S.catStats[q.category]) S.catStats[q.category] = { correct: 0, total: 0 };
  S.catStats[q.category].total++;
  if (correct) S.catStats[q.category].correct++;
  saveState();
}

// ── Mini-games ───────────────────────────────────────────────
function renderMinigames() {
  const games = [
    { id: 'match', icon: '🃏', name: 'SCOTUS Match', sub: 'Match cases to their rulings', level: 2 },
    { id: 'decoder', icon: '🔍', name: 'Quote Decoder', sub: 'Identify the foundational document', level: 3 },
    { id: 'blitz', icon: '⚡', name: 'Blitz Mode', sub: '90-second rapid-fire quiz', level: 4 },
  ];
  const list = document.getElementById('minigames-list');
  list.innerHTML = games.map(g => {
    const locked = !S.unlockedGames.includes(g.id);
    return `<div class="select-item ${locked ? 'locked' : ''}" onclick="${locked ? `showToast('Reach Level ${g.level} to unlock!')` : `startGame('${g.id}')`}">
      <div class="si-icon">${locked ? '🔒' : g.icon}</div>
      <div class="si-info">
        <div class="si-name">${g.name}</div>
        <div class="si-sub">${locked ? `Unlocks at Level ${g.level}` : g.sub}</div>
      </div>
      ${locked ? `<span class="si-badge">Lvl ${g.level}</span>` : '<div class="si-arrow">›</div>'}
    </div>`;
  }).join('');
  showScreen('minigames');
}

function startGame(id) {
  if (id === 'match') startScotusMatch();
  if (id === 'decoder') startQuoteDecoder();
  if (id === 'blitz') startBlitz();
}

// SCOTUS Match Game
let matchSelected = null, matchPairs = [], matchMatched = [];
function startScotusMatch() {
  const cases = FLASHCARDS.filter(f => f.category === 'scotus').slice(0, 6);
  matchPairs = cases.map(c => ({
    case: c.front,
    ruling: c.back.split('\n')[0].replace(/^[^—]*—\s*/, '').substring(0, 60) + '…'
  }));
  matchSelected = null; matchMatched = [];
  renderMatchGame();
}

function renderMatchGame() {
  const screen = document.getElementById('screen-minigames');
  const items = [];
  matchPairs.forEach((p, i) => {
    items.push({ text: p.case, type: 'case', idx: i });
    items.push({ text: p.ruling, type: 'ruling', idx: i });
  });
  const shuffled = shuffle(items);
  screen.innerHTML = `
    <button class="back-btn" onclick="renderMinigames()">‹ Back</button>
    <h2>🃏 SCOTUS Match</h2>
    <p style="margin:0.4rem 0 1rem">Tap a case, then its matching ruling.</p>
    <div id="match-grid">${shuffled.map((item, i) =>
      `<div class="match-card" id="mc-${i}" data-type="${item.type}" data-idx="${item.idx}" onclick="matchTap(this,${item.idx},'${item.type}',${i})">${item.text}</div>`
    ).join('')}</div>
    <div id="match-status" style="text-align:center;margin-top:1rem;font-weight:700;color:var(--muted)">Matched: 0 / ${matchPairs.length}</div>`;
}

let matchFirstSel = null;
function matchTap(el, idx, type, domIdx) {
  if (el.classList.contains('matched')) return;
  if (matchFirstSel === null) {
    matchFirstSel = { el, idx, type };
    el.classList.add('selected');
  } else {
    const a = matchFirstSel, b = { el, idx, type };
    a.el.classList.remove('selected');
    if (a.idx === b.idx && a.type !== b.type) {
      a.el.classList.add('matched'); b.el.classList.add('matched');
      matchMatched.push(idx);
      addXP(15);
      document.getElementById('match-status').textContent = `Matched: ${matchMatched.length} / ${matchPairs.length}`;
      if (matchMatched.length === matchPairs.length) {
        setTimeout(() => { showToast('🎉 Perfect Match!'); addXP(50); }, 300);
      }
    } else {
      a.el.classList.add('wrong'); b.el.classList.add('wrong');
      setTimeout(() => { a.el.classList.remove('wrong'); b.el.classList.remove('wrong'); }, 600);
    }
    matchFirstSel = null;
  }
}

// Quote Decoder
let decoderQ = [], decoderIdx = 0, decoderScore = 0;
const QUOTES = [
  { quote: '"If men were angels, no government would be necessary."', answer: 'Federalist #51', options: ['Federalist #10', 'Federalist #51', 'Brutus #1', 'Federalist #78'] },
  { quote: '"Liberty is to faction what air is to fire."', answer: 'Federalist #10', options: ['Federalist #10', 'Declaration of Independence', 'Brutus #1', 'Federalist #51'] },
  { quote: '"Energy in the Executive is essential to the protection of the community."', answer: 'Federalist #70', options: ['Federalist #70', 'Federalist #51', 'Federalist #78', 'US Constitution'] },
  { quote: '"[The judiciary has] neither FORCE nor WILL, but merely judgment."', answer: 'Federalist #78', options: ['Federalist #78', 'Federalist #70', 'Brutus #1', 'Federalist #51'] },
  { quote: '"Injustice anywhere is a threat to justice everywhere."', answer: 'Letter from Birmingham Jail', options: ['Declaration of Independence', 'Letter from Birmingham Jail', 'Federalist #10', 'Brutus #1'] },
  { quote: '"We hold these truths to be self-evident, that all men are created equal..."', answer: 'Declaration of Independence', options: ['Declaration of Independence', 'US Constitution', 'Articles of Confederation', 'Federalist #51'] },
  { quote: '"Ambition must be made to counteract ambition."', answer: 'Federalist #51', options: ['Federalist #51', 'Federalist #70', 'Federalist #10', 'Federalist #78'] },
  { quote: '"The powers given by this article are very general and comprehensive, and may receive a construction to justify the passing of almost any law."', answer: 'Brutus #1', options: ['Brutus #1', 'Federalist #10', 'Federalist #51', 'US Constitution'] },
  { quote: '"We, therefore...do solemnly publish and declare, that these united colonies are, and of right ought to be, free and independent states."', answer: 'Declaration of Independence', options: ['Articles of Confederation', 'Declaration of Independence', 'US Constitution', 'Federalist #78'] },
  { quote: '"The said States hereby severally enter into a firm league of friendship with each other."', answer: 'Articles of Confederation', options: ['US Constitution', 'Articles of Confederation', 'Declaration of Independence', 'Federalist #10'] },
];

function startQuoteDecoder() {
  decoderQ = shuffle(QUOTES).slice(0, 5);
  decoderIdx = 0; decoderScore = 0;
  renderDecoderQuestion();
}

function renderDecoderQuestion() {
  const q = decoderQ[decoderIdx];
  const screen = document.getElementById('screen-minigames');
  screen.innerHTML = `
    <button class="back-btn" onclick="renderMinigames()">‹ Back</button>
    <h2>🔍 Quote Decoder</h2>
    <p style="margin:0.3rem 0 0.75rem">${decoderIdx + 1} / ${decoderQ.length}</p>
    <div id="quote-box">${q.quote}</div>
    <p style="font-weight:700;margin-bottom:0.6rem;color:var(--navy)">Which document is this from?</p>
    <div id="decoder-options">${q.options.map(o =>
      `<button class="opt-btn" onclick="decoderAnswer(this,'${o}','${q.answer}')">${o}</button>`
    ).join('')}</div>`;
}

function decoderAnswer(el, chosen, correct) {
  document.querySelectorAll('#decoder-options .opt-btn').forEach(b => b.disabled = true);
  if (chosen === correct) {
    el.classList.add('correct'); decoderScore++; addXP(20);
    showToast('✓ Correct! +20 XP');
  } else {
    el.classList.add('wrong');
    document.querySelectorAll('#decoder-options .opt-btn').forEach(b => {
      if (b.textContent === correct) b.classList.add('reveal');
    });
    showToast('✗ Incorrect');
  }
  setTimeout(() => {
    decoderIdx++;
    if (decoderIdx < decoderQ.length) renderDecoderQuestion();
    else {
      const screen = document.getElementById('screen-minigames');
      screen.innerHTML = `<button class="back-btn" onclick="renderMinigames()">‹ Back</button>
        <div class="results-card">
          <div class="results-score">${decoderScore}<span> / ${decoderQ.length}</span></div>
          <div class="results-label">Quote Decoder Complete!</div>
          <button class="btn btn-primary btn-full mt2" onclick="startQuoteDecoder()">Play Again</button>
        </div>`;
    }
  }, 1200);
}

// Blitz Mode
let blitzTimer, blitzSeconds, blitzScore, blitzCurrent;
function startBlitz() {
  blitzScore = 0; blitzSeconds = 90;
  const pool = activeQuestions();
  blitzCurrent = shuffle(pool);
  let blitzIdx = 0;
  const screen = document.getElementById('screen-minigames');
  function renderBlitzQ() {
    if (blitzIdx >= blitzCurrent.length) blitzCurrent = shuffle(activeQuestions()), blitzIdx = 0;
    const q = blitzCurrent[blitzIdx++];
    const letters = ['A','B','C','D'];
    screen.innerHTML = `
      <div id="blitz-timer">${blitzSeconds}s</div>
      <div id="blitz-score">⚡ ${blitzScore} correct</div>
      <div class="question-card"><div class="question-text">${escHTML(q.question)}</div></div>
      <div class="options-list">${q.options.map((o, i) =>
        `<button class="opt-btn" onclick="blitzAnswer(this,${i},${q.correct})">
          <span class="opt-letter">${letters[i]}</span>${escHTML(o)}
        </button>`
      ).join('')}</div>`;
  }
  function blitzTick() {
    blitzSeconds--;
    const el = document.getElementById('blitz-timer');
    if (el) el.textContent = blitzSeconds + 's';
    if (blitzSeconds <= 0) {
      clearInterval(blitzTimer);
      screen.innerHTML = `<button class="back-btn" onclick="renderMinigames()">‹ Back</button>
        <div class="results-card">
          <div class="results-score">${blitzScore}</div>
          <div class="results-label">Blitz answers in 90 seconds!</div>
          <div class="results-xp">+${blitzScore * 5} XP earned</div>
          <button class="btn btn-primary btn-full mt2" onclick="startBlitz()">Play Again</button>
        </div>`;
      addXP(blitzScore * 5);
    }
  }
  window.blitzAnswer = function(el, idx, correct) {
    if (idx === correct) { blitzScore++; document.getElementById('blitz-score').textContent = '⚡ ' + blitzScore + ' correct'; }
    renderBlitzQ();
  };
  renderBlitzQ();
  blitzTimer = setInterval(blitzTick, 1000);
}

// ── Stats Screen ─────────────────────────────────────────────
function renderStats() {
  const acc = S.total ? Math.round((S.correct / S.total) * 100) : 0;
  document.getElementById('stats-total').textContent = S.total;
  document.getElementById('stats-correct').textContent = S.correct;
  document.getElementById('stats-acc').textContent = acc + '%';
  document.getElementById('stats-xp').textContent = S.xp;
  document.getElementById('stats-streak').textContent = S.streak;
  document.getElementById('stats-level').textContent = S.level;

  const catList = document.getElementById('cat-stats-list');
  catList.innerHTML = UNITS.map(u => {
    const st = S.catStats[u.id] || { correct: 0, total: 0 };
    const pct = st.total ? Math.round((st.correct / st.total) * 100) : 0;
    return `<div class="cat-row">
      <span class="cat-name">${u.icon} ${u.name.replace(/^Unit \d+: /,'')}</span>
      <div class="prog-bar-wrap" style="width:100px"><div class="prog-bar" style="width:${pct}%"></div></div>
      <span class="cat-pct">${pct}%</span>
    </div>`;
  }).join('');
  showScreen('stats');
}

// ── Utilities ────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function categoryLabel(cat) {
  const map = { scotus: 'SCOTUS', documents: 'Documents', unit1: 'Unit 1', unit2: 'Unit 2', unit3: 'Unit 3', unit4: 'Unit 4', unit5: 'Unit 5', amendments: 'Amendments', parties: 'Parties', interest: 'Interest Groups', elections: 'Elections', media: 'Media' };
  return map[cat] || cat;
}
function escHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  loadState();
  await loadData();
  checkUnlocks();
  renderTopbar();
  renderHome();
  showScreen('home');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
