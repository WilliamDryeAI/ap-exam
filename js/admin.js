// ── Auth ──────────────────────────────────────────────────────
const DEFAULT_PW = 'apgov2025';
function getAdminPW() { return localStorage.getItem('apgov_adminpw') || DEFAULT_PW; }

function doLogin() {
  const pw = document.getElementById('pw-input').value;
  if (pw === getAdminPW()) {
    document.getElementById('login-wrap').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    loadAdminData();
  } else {
    document.getElementById('login-err').textContent = 'Incorrect password.';
  }
}

function changePW() {
  const a = document.getElementById('new-pw').value;
  const b = document.getElementById('confirm-pw').value;
  if (!a) { alert('Enter a new password.'); return; }
  if (a !== b) { alert('Passwords do not match.'); return; }
  localStorage.setItem('apgov_adminpw', a);
  alert('Password changed!');
}

// ── Data ──────────────────────────────────────────────────────
let QUESTIONS = [], FLASHCARDS = [];
let editingId = null, editingFC = null;
const PAGE_SIZE = 25;
let currentPage = 0;

function getOverrides() {
  try { return JSON.parse(localStorage.getItem('apgov_overrides') || '{}'); } catch(e) { return {}; }
}
function saveOverrides(o) { localStorage.setItem('apgov_overrides', JSON.stringify(o)); }

async function loadAdminData() {
  try {
    const [qRes, fRes] = await Promise.all([fetch('data/questions.json'), fetch('data/flashcards.json')]);
    QUESTIONS = await qRes.json();
    FLASHCARDS = await fRes.json();

    // Apply overrides
    const o = getOverrides();
    if (o.questions) {
      o.questions.forEach(oq => {
        const i = QUESTIONS.findIndex(q => q.id === oq.id);
        if (i >= 0) QUESTIONS[i] = oq; else QUESTIONS.push(oq);
      });
    }
    if (o.deleted) QUESTIONS = QUESTIONS.filter(q => !o.deleted.includes(q.id));
    if (o.flashcards) {
      o.flashcards.forEach(of => {
        const i = FLASHCARDS.findIndex(f => f.id === of.id);
        if (i >= 0) FLASHCARDS[i] = of; else FLASHCARDS.push(of);
      });
    }
    if (o.deletedFC) FLASHCARDS = FLASHCARDS.filter(f => !o.deletedFC.includes(f.id));
  } catch(e) { alert('Failed to load data: ' + e.message); return; }

  renderTable();
  renderFCTable();
  renderQStats();
  renderStudentStats();
}

// ── Question Status ───────────────────────────────────────────
function getFlagged()  { return JSON.parse(localStorage.getItem('apgov_flagged') || '[]'); }
function getInactive() { return JSON.parse(localStorage.getItem('apgov_inactive') || '[]'); }
function setFlagged(a)  { localStorage.setItem('apgov_flagged', JSON.stringify(a)); }
function setInactive(a) { localStorage.setItem('apgov_inactive', JSON.stringify(a)); }

function toggleFlag(id) {
  const f = getFlagged();
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.push(id);
  setFlagged(f);
  renderTable(); renderQStats();
}
function toggleInactive(id) {
  const f = getInactive();
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.push(id);
  setInactive(f);
  renderTable(); renderQStats();
}

function getStatus(id) {
  if (getInactive().includes(id)) return 'inactive';
  if (getFlagged().includes(id)) return 'flagged';
  return 'active';
}

// ── Question Table ────────────────────────────────────────────
function renderQStats() {
  const flagged  = getFlagged().length;
  const inactive = getInactive().length;
  const active   = QUESTIONS.length - inactive;
  document.getElementById('q-stats-row').innerHTML = `
    <div class="stat-pill">Total: <span>${QUESTIONS.length}</span></div>
    <div class="stat-pill">Active: <span>${active}</span></div>
    <div class="stat-pill">Flagged: <span>${flagged}</span></div>
    <div class="stat-pill">Inactive: <span>${inactive}</span></div>`;
}

function filteredQuestions() {
  const search = document.getElementById('q-search').value.toLowerCase();
  const cat    = document.getElementById('q-cat').value;
  const diff   = document.getElementById('q-diff').value;
  const status = document.getElementById('q-status').value;
  return QUESTIONS.filter(q => {
    if (cat && q.category !== cat) return false;
    if (diff && q.difficulty !== diff) return false;
    if (status && getStatus(q.id) !== status) return false;
    if (search && !q.question.toLowerCase().includes(search) && !q.topic?.toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderTable() {
  const qs = filteredQuestions();
  const total = qs.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (currentPage >= pages) currentPage = Math.max(0, pages - 1);
  const slice = qs.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const tbody = document.getElementById('q-tbody');
  tbody.innerHTML = slice.map(q => {
    const st = getStatus(q.id);
    return `<tr>
      <td>${q.id}</td>
      <td><span class="badge badge-${q.category}">${q.category}</span></td>
      <td style="font-size:0.78rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${q.topic || ''}</td>
      <td class="q-text-cell" title="${q.question.replace(/"/g,'&quot;')}">${q.question}</td>
      <td><span class="badge badge-${q.difficulty}">${q.difficulty}</span></td>
      <td><span class="badge ${st==='active'?'badge-easy':st==='flagged'?'badge-flag':'badge-off'}">${st}</span></td>
      <td>
        <button class="act-btn btn-edit" onclick="openEditModal(${q.id})">Edit</button>
        <button class="act-btn btn-flag" onclick="toggleFlag(${q.id})">${getFlagged().includes(q.id)?'Unflag':'Flag'}</button>
        <button class="act-btn btn-del" onclick="toggleInactive(${q.id})">${getInactive().includes(q.id)?'Restore':'Disable'}</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('q-pagination').innerHTML = total > PAGE_SIZE
    ? `Page ${currentPage+1} of ${pages} &nbsp; <button onclick="currentPage=Math.max(0,currentPage-1);renderTable()" ${currentPage===0?'disabled':''}>‹</button> <button onclick="currentPage=Math.min(${pages-1},currentPage+1);renderTable()" ${currentPage===pages-1?'disabled':''}>›</button> &nbsp; Showing ${slice.length} of ${total}`
    : `Showing ${total} questions`;
}

// ── Question Modal ────────────────────────────────────────────
function questionFormHTML(q) {
  const cats = ['scotus','documents','unit1','unit2','unit3','unit4','unit5','amendments','parties','interest','elections','media'];
  return `
    <div class="form-group"><label>Category</label>
      <select id="f-cat"><option value="">--</option>${cats.map(c=>`<option value="${c}"${q&&q.category===c?' selected':''}>${c}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Topic</label><input id="f-topic" value="${q?escH(q.topic||''):''}" placeholder="e.g. Marbury v. Madison"></div>
    <div class="form-group"><label>Question</label><textarea id="f-question">${q?escH(q.question):''}</textarea></div>
    <div class="form-group"><label>Options (select correct answer)</label>
      <div class="opt-inputs">${(q?q.options:['','','','']).map((o,i)=>`
        <div class="opt-row">
          <label>${['A','B','C','D'][i]}</label>
          <input id="f-opt-${i}" value="${escH(o)}" placeholder="Option ${['A','B','C','D'][i]}">
          <input type="radio" name="f-correct" value="${i}" ${q&&q.correct===i?'checked':i===0&&!q?'checked':''}> Correct
        </div>`).join('')}
      </div>
    </div>
    <div class="form-group"><label>Explanation</label><textarea id="f-exp">${q?escH(q.explanation||''):''}</textarea></div>
    <div class="form-group"><label>Difficulty</label>
      <select id="f-diff">
        <option value="easy" ${q&&q.difficulty==='easy'?'selected':''}>Easy (10 XP)</option>
        <option value="medium" ${q&&q.difficulty==='medium'?'selected':''}>Medium (20 XP)</option>
        <option value="hard" ${q&&q.difficulty==='hard'?'selected':''}>Hard (30 XP)</option>
      </select>
    </div>`;
}

function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add Question';
  document.getElementById('modal-body').innerHTML = questionFormHTML(null);
  document.getElementById('modal-bg').classList.add('open');
}

function openEditModal(id) {
  editingId = id;
  const q = QUESTIONS.find(q => q.id === id);
  if (!q) return;
  document.getElementById('modal-title').textContent = 'Edit Question';
  document.getElementById('modal-body').innerHTML = questionFormHTML(q);
  document.getElementById('modal-bg').classList.add('open');
}

function closeModal() { document.getElementById('modal-bg').classList.remove('open'); editingId = null; }

function saveQuestion() {
  const cat  = document.getElementById('f-cat').value;
  const topic = document.getElementById('f-topic').value.trim();
  const question = document.getElementById('f-question').value.trim();
  const options = [0,1,2,3].map(i => document.getElementById(`f-opt-${i}`).value.trim());
  const correct = parseInt(document.querySelector('input[name="f-correct"]:checked')?.value ?? '0');
  const explanation = document.getElementById('f-exp').value.trim();
  const difficulty = document.getElementById('f-diff').value;
  const xp = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 30;

  if (!cat || !question || options.some(o => !o)) { alert('Please fill in all required fields.'); return; }

  const o = getOverrides();
  if (!o.questions) o.questions = [];

  if (editingId !== null) {
    const idx = QUESTIONS.findIndex(q => q.id === editingId);
    const updated = { ...QUESTIONS[idx], category: cat, topic, question, options, correct, explanation, difficulty, xp };
    QUESTIONS[idx] = updated;
    const oi = o.questions.findIndex(q => q.id === editingId);
    if (oi >= 0) o.questions[oi] = updated; else o.questions.push(updated);
  } else {
    const newId = Math.max(...QUESTIONS.map(q => q.id), 0) + 1;
    const newQ = { id: newId, category: cat, topic, question, options, correct, explanation, difficulty, xp };
    QUESTIONS.push(newQ);
    o.questions.push(newQ);
  }

  saveOverrides(o);
  closeModal();
  renderTable();
  renderQStats();
}

// ── Flashcard Table ───────────────────────────────────────────
function renderFCTable() {
  const search = document.getElementById('fc-search').value.toLowerCase();
  const cat    = document.getElementById('fc-cat').value;
  const cards  = FLASHCARDS.filter(f => {
    if (cat && f.category !== cat) return false;
    if (search && !f.front.toLowerCase().includes(search) && !f.topic?.toLowerCase().includes(search)) return false;
    return true;
  });
  document.getElementById('fc-tbody').innerHTML = cards.map(f => `<tr>
    <td><span class="badge">${f.category}</span></td>
    <td style="font-size:0.78rem">${f.topic||''}</td>
    <td style="font-size:0.82rem;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(f.front)}</td>
    <td>
      <button class="act-btn btn-edit" onclick="openEditFCModal('${f.id}')">Edit</button>
      <button class="act-btn btn-del" onclick="deleteFC('${f.id}')">Delete</button>
    </td>
  </tr>`).join('');
}

function openAddFCModal() {
  editingFC = null;
  document.getElementById('modal-title').textContent = 'Add Flashcard';
  document.getElementById('modal-body').innerHTML = flashcardFormHTML(null);
  document.getElementById('modal-bg').classList.add('open');
  document.getElementById('modal').querySelector('.btn-save').onclick = saveFlashcard;
}

function openEditFCModal(id) {
  editingFC = id;
  const f = FLASHCARDS.find(f => f.id === id);
  if (!f) return;
  document.getElementById('modal-title').textContent = 'Edit Flashcard';
  document.getElementById('modal-body').innerHTML = flashcardFormHTML(f);
  document.getElementById('modal-bg').classList.add('open');
  document.getElementById('modal').querySelector('.btn-save').onclick = saveFlashcard;
}

function flashcardFormHTML(f) {
  const cats = ['scotus','documents','unit1','unit2','unit3','unit4','unit5'];
  return `
    <div class="form-group"><label>Category</label>
      <select id="ff-cat">${cats.map(c=>`<option value="${c}"${f&&f.category===c?' selected':''}>${c}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Topic</label><input id="ff-topic" value="${f?escH(f.topic||''):''}" placeholder="e.g. Marbury v. Madison"></div>
    <div class="form-group"><label>Front (Term / Question)</label><input id="ff-front" value="${f?escH(f.front):''}"></div>
    <div class="form-group"><label>Back (Definition / Answer)</label><textarea id="ff-back" style="min-height:120px">${f?escH(f.back):''}</textarea></div>`;
}

function saveFlashcard() {
  const cat   = document.getElementById('ff-cat').value;
  const topic = document.getElementById('ff-topic').value.trim();
  const front = document.getElementById('ff-front').value.trim();
  const back  = document.getElementById('ff-back').value.trim();
  if (!front || !back) { alert('Front and Back are required.'); return; }
  const o = getOverrides();
  if (!o.flashcards) o.flashcards = [];
  if (editingFC) {
    const idx = FLASHCARDS.findIndex(f => f.id === editingFC);
    const updated = { ...FLASHCARDS[idx], category: cat, topic, front, back };
    FLASHCARDS[idx] = updated;
    const oi = o.flashcards.findIndex(f => f.id === editingFC);
    if (oi >= 0) o.flashcards[oi] = updated; else o.flashcards.push(updated);
  } else {
    const newId = 'fc_custom_' + Date.now();
    const newF = { id: newId, category: cat, topic, front, back };
    FLASHCARDS.push(newF);
    o.flashcards.push(newF);
  }
  saveOverrides(o);
  closeModal();
  renderFCTable();
}

function deleteFC(id) {
  showAdminConfirm('Delete this flashcard? This cannot be undone.', () => {
    FLASHCARDS = FLASHCARDS.filter(f => f.id !== id);
    const o = getOverrides();
    if (!o.deletedFC) o.deletedFC = [];
    o.deletedFC.push(id);
    saveOverrides(o);
    renderFCTable();
  });
}

// ── Export / Import ───────────────────────────────────────────
function exportQuestions() {
  const blob = new Blob([JSON.stringify(QUESTIONS, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'questions.json';
  a.click();
}

function importQuestions(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Not an array');
      QUESTIONS = data;
      const o = getOverrides();
      o.questions = data;
      saveOverrides(o);
      renderTable(); renderQStats();
      alert(`Imported ${data.length} questions!`);
    } catch(err) { alert('Invalid JSON file: ' + err.message); }
  };
  reader.readAsText(file);
}

// ── Tabs ──────────────────────────────────────────────────────
function setTab(tab) {
  ['questions','flashcards','settings'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab').forEach((b, i) => {
    b.classList.toggle('active', ['questions','flashcards','settings'][i] === tab);
  });
}

// ── Student Stats ─────────────────────────────────────────────
function renderStudentStats() {
  try {
    const s = JSON.parse(localStorage.getItem('apgov_state') || '{}');
    const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    document.getElementById('student-stats').innerHTML = `
      <div class="stats-row">
        <div class="stat-pill">Level: <span>${s.level||1}</span></div>
        <div class="stat-pill">XP: <span>${s.xp||0}</span></div>
        <div class="stat-pill">Streak: <span>${s.streak||0} days</span></div>
        <div class="stat-pill">Answered: <span>${s.total||0}</span></div>
        <div class="stat-pill">Accuracy: <span>${acc}%</span></div>
      </div>`;
  } catch(e) {}
}

// ── Confirm Dialog ────────────────────────────────────────────
let adminConfirmResolve = () => {};
function showAdminConfirm(msg, onConfirm) {
  document.getElementById('admin-confirm-msg').textContent = msg;
  document.getElementById('admin-confirm-modal').classList.add('open');
  document.getElementById('admin-confirm-overlay').classList.add('open');
  adminConfirmResolve = (ok) => {
    document.getElementById('admin-confirm-modal').classList.remove('open');
    document.getElementById('admin-confirm-overlay').classList.remove('open');
    if (ok) onConfirm();
  };
}

// ── Utilities ─────────────────────────────────────────────────
function escH(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Save btn default is saveQuestion
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.btn-save').onclick = saveQuestion;
});
