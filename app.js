/* ═══════════════════════════════════════════════════
   Wedding QR — app.js
   ════════════════════════════════════════════════ */

// ════════════════════════════════════════════════
//  CONFIGURATION
// ════════════════════════════════════════════════
var SUPABASE_URL = 'https://pyfinjrjvkudyfteelkw.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5ZmluanJqdmt1ZHlmdGVlbGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODk1MjQsImV4cCI6MjA5MDA2NTUyNH0.unWUjfa883HFkzaZgoOYHyMGs_7eXPkOD71EokomWLA';

var PAGE_PIN = '24042';

// ════════════════════════════════════════════════
//  SUPABASE CLIENT
// ════════════════════════════════════════════════
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ════════════════════════════════════════════════
//  APPLICATION STATE
// ════════════════════════════════════════════════
var SESSION_ID = null;
var SESSION_NAME = null;
var codes = [];
var usedSet = new Set();
var scanLog = [];
var realtimeSub = null;

// Scanner state
var html5QrScanner = null;
var scannerRunning = false;
var currentFacingMode = 'environment';

// PIN state
var pinState = {
  gen: { buffer: '', unlocked: false },
  manage: { buffer: '', unlocked: false }
};

// ════════════════════════════════════════════════
//  PIN SYSTEM
// ════════════════════════════════════════════════
function pinKey(page, value) {
  var state = pinState[page];
  if (value === 'del') {
    state.buffer = state.buffer.slice(0, -1);
  } else {
    if (state.buffer.length >= PAGE_PIN.length) return;
    state.buffer += value;
  }
  renderPinDots(page);
  document.getElementById('pin-err-' + page).textContent = '';
  if (state.buffer.length === PAGE_PIN.length) checkPin(page);
}

function renderPinDots(page, errorState) {
  var state = pinState[page];
  var prefix = page + '-pd';
  for (var i = 0; i < PAGE_PIN.length; i++) {
    var dot = document.getElementById(prefix + i);
    if (!dot) continue;
    dot.className = 'pin-dot'
      + (i < state.buffer.length ? ' filled' : '')
      + (errorState ? ' err' : '');
  }
}

function checkPin(page) {
  var state = pinState[page];
  if (state.buffer === PAGE_PIN) {
    state.unlocked = true;
    document.getElementById('pin-overlay-' + page).style.display = 'none';
    state.buffer = '';
    renderPinDots(page);
  } else {
    renderPinDots(page, true);
    document.getElementById('pin-err-' + page).textContent = 'INCORRECT PIN';
    setTimeout(function () {
      state.buffer = '';
      renderPinDots(page);
      document.getElementById('pin-err-' + page).textContent = '';
    }, 1000);
  }
}

function showPinOverlay(page) {
  pinState[page].buffer = '';
  renderPinDots(page);
  document.getElementById('pin-err-' + page).textContent = '';
  document.getElementById('pin-overlay-' + page).style.display = 'flex';
}

function lockAllPages() {
  pinState.gen.unlocked = false;
  pinState.manage.unlocked = false;
  showPinOverlay('gen');
  showPinOverlay('manage');
}

// ════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════
function showPage(id, btn) {
  _activatePage(id);
  document.querySelectorAll('.dtab').forEach(function (t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  syncBnav(id);
  _onPageEnter(id);
}

function navTo(id, btn) {
  _activatePage(id);
  document.querySelectorAll('.bnav-btn').forEach(function (b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.dtab').forEach(function (t) { t.classList.remove('active'); });
  _onPageEnter(id);
}

function _activatePage(id) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  document.getElementById('page-' + id).classList.add('active');
}

function _onPageEnter(id) {
  if (id === 'scan') { updateStats(); startScanner(); }
  if (id === 'manage') { renderManage('all'); }
}

function syncBnav(id) {
  ['scan', 'gen', 'manage'].forEach(function (x) {
    var b = document.getElementById('bnav-' + x);
    if (b) b.classList.toggle('active', x === id);
  });
}

function requestGenPage(btn) { showPage('gen', btn); if (!pinState.gen.unlocked) showPinOverlay('gen'); }
function requestGenPageMobile(btn) { navTo('gen', btn); if (!pinState.gen.unlocked) showPinOverlay('gen'); }
function requestManagePage(btn) { showPage('manage', btn); if (!pinState.manage.unlocked) showPinOverlay('manage'); }
function requestManagePageMobile(btn) { navTo('manage', btn); if (!pinState.manage.unlocked) showPinOverlay('manage'); }

// ════════════════════════════════════════════════
//  LOGIN / SESSION
// ════════════════════════════════════════════════
function switchTab(tab) {
  document.getElementById('tab-join').classList.toggle('active', tab === 'join');
  document.getElementById('tab-create').classList.toggle('active', tab === 'create');
  document.getElementById('panel-join').style.display = tab === 'join' ? '' : 'none';
  document.getElementById('panel-create').style.display = tab === 'create' ? '' : 'none';
  clrAlerts();
}

function showErr(m) { var e = document.getElementById('lerr'); e.textContent = m; e.style.display = 'block'; document.getElementById('lok').style.display = 'none'; }
function showOk(m) { var e = document.getElementById('lok'); e.textContent = m; e.style.display = 'block'; document.getElementById('lerr').style.display = 'none'; }
function clrAlerts() { document.getElementById('lerr').style.display = 'none'; document.getElementById('lok').style.display = 'none'; }
function btnLd(id, on, lbl) { var b = document.getElementById(id); b.disabled = on; b.textContent = on ? '...' : lbl; }

async function doCreate() {
  var name = document.getElementById('create-name').value.trim();
  var pass = document.getElementById('create-pass').value.trim();
  if (!name) { showErr('Enter a session name.'); return; }
  if (!pass) { showErr('Enter a password.'); return; }
  btnLd('create-btn', true, 'Creating...');
  var chk = await sb.from('sessions').select('id').ilike('name', name).maybeSingle();
  if (chk.data) { showErr('Session name already exists. Use "Join Session".'); btnLd('create-btn', false, '◆ Create Session'); return; }
  var res = await sb.from('sessions').insert({ name: name, password_hash: hash(pass) }).select().single();
  if (res.error) { showErr('Error: ' + res.error.message); btnLd('create-btn', false, '◆ Create Session'); return; }
  showOk('Session created! Joining...');
  setTimeout(function () { enterApp(res.data.id, name); }, 600);
}

async function doJoin() {
  var name = document.getElementById('join-name').value.trim();
  var pass = document.getElementById('join-pass').value.trim();
  if (!name) { showErr('Enter the session name.'); return; }
  if (!pass) { showErr('Enter the password.'); return; }
  btnLd('join-btn', true, 'Joining...');
  var res = await sb.from('sessions').select('id,name,password_hash').ilike('name', name).maybeSingle();
  if (res.error || !res.data) { showErr('Session not found.'); btnLd('join-btn', false, '▶ Join Session'); return; }
  if (res.data.password_hash !== hash(pass)) { showErr('Incorrect password.'); btnLd('join-btn', false, '▶ Join Session'); return; }
  enterApp(res.data.id, res.data.name);
}

async function enterApp(sid, sname) {
  SESSION_ID = sid;
  SESSION_NAME = sname;
  localStorage.setItem('wqr_session', JSON.stringify({ id: sid, name: sname }));
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('session-pill').textContent = sname;
  document.getElementById('event-name').value = sname;
  setSS('syncing', 'Loading...');
  await loadCodes();
  subscribeRT();
  updateStats();
  startScanner();
}

async function loadCodes() {
  var res = await sb.from('codes').select('*').eq('session_id', SESSION_ID).order('num', { ascending: true });
  if (res.error) { setSS('err', 'Load error'); return; }
  codes = res.data || [];
  usedSet = new Set(codes.filter(function (c) { return c.used_at !== null; }).map(function (c) { return c.code_id; }));
  if (codes.length > 0) renderGrid();
  updateStats();
  setSS('live', 'Live · ' + codes.length + ' codes');
}

function subscribeRT() {
  if (realtimeSub) { sb.removeChannel(realtimeSub); realtimeSub = null; }
  realtimeSub = sb.channel('codes-' + SESSION_ID)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'codes', filter: 'session_id=eq.' + SESSION_ID }, function (p) {
      var u = p.new;
      var idx = codes.findIndex(function (c) { return c.code_id === u.code_id; });
      if (idx !== -1) codes[idx] = u;
      if (u.used_at) usedSet.add(u.code_id); else usedSet.delete(u.code_id);
      updateStats();
      setSS('live', 'Live · ' + new Date().toLocaleTimeString());
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'codes', filter: 'session_id=eq.' + SESSION_ID }, function (p) {
      if (!codes.find(function (c) { return c.code_id === p.new.code_id; })) codes.push(p.new);
      updateStats();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'codes', filter: 'session_id=eq.' + SESSION_ID }, function (p) {
      codes = codes.filter(function (c) { return c.code_id !== p.old.code_id; });
      usedSet.delete(p.old.code_id);
      updateStats();
    })
    .subscribe(function (s) {
      if (s === 'SUBSCRIBED') setSS('live', 'Live · synced');
      if (s === 'CHANNEL_ERROR') setSS('err', 'Realtime error');
    });
}

function doLogout() {
  stopScanner();
  if (html5QrScanner) { html5QrScanner = null; }
  if (realtimeSub) { sb.removeChannel(realtimeSub); realtimeSub = null; }
  SESSION_ID = SESSION_NAME = null;
  codes = []; usedSet = new Set(); scanLog = [];
  localStorage.removeItem('wqr_session');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = '';
  document.getElementById('qr-reader').innerHTML = '';
  document.getElementById('qr-grid').innerHTML = '<div class="empty-state"><div class="ei">&#9671;</div><div>No codes yet</div></div>';
  document.getElementById('join-name').value = '';
  document.getElementById('join-pass').value = '';
  lockAllPages();
  clrAlerts();
  switchTab('join');
}

// ════════════════════════════════════════════════
//  SCANNER
// ════════════════════════════════════════════════
function initScanner() {
  if (html5QrScanner) return;
  var fb = document.getElementById('flip-btn');
  if (fb) fb.classList.add('hidden');
  html5QrScanner = new Html5Qrcode('qr-reader', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false
  });
}

function startScanner() {
  initScanner();
  if (scannerRunning) return;
  var cfg = {
    fps: 15,
    qrbox: function (w, h) { var s = Math.min(w, h) * 0.7; return { width: s, height: s }; },
    aspectRatio: 1.0,
    rememberLastUsedCamera: true,
    useBarCodeDetectorIfSupported: true
  };
  html5QrScanner.start(
    { facingMode: currentFacingMode },
    cfg,
    function (text) { processCode(text); },
    function () { }
  ).then(function () {
    scannerRunning = true;
    var fb = document.getElementById('flip-btn');
    if (fb) fb.classList.remove('hidden');
    updateFlipLabel();
  }).catch(function () {
    showResult('fail', '!', 'CAMERA ERROR', 'Could not start camera. Use manual entry below.');
  });
}

function stopScanner() {
  if (!html5QrScanner || !scannerRunning) return;
  html5QrScanner.stop()
    .then(function () { scannerRunning = false; })
    .catch(function () { scannerRunning = false; });
}

// ════════════════════════════════════════════════
//  CAMERA FLIP
// ════════════════════════════════════════════════
function flipCamera() {
  if (!scannerRunning) return;
  currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
  html5QrScanner.stop()
    .then(function () { scannerRunning = false; startScanner(); })
    .catch(function () { scannerRunning = false; startScanner(); });
}

function updateFlipLabel() {
  var lbl = document.getElementById('flip-label');
  if (!lbl) return;
  lbl.textContent = (currentFacingMode === 'environment') ? 'Rear Camera' : 'Front Camera';
}

// ════════════════════════════════════════════════
//  SCAN PROCESSING
// ════════════════════════════════════════════════
var _lastCode = '', _lastCodeTime = 0;

async function processCode(raw) {
  var now = Date.now();
  if (raw === _lastCode && now - _lastCodeTime < 3000) return;
  _lastCode = raw; _lastCodeTime = now;

  var code = codes.find(function (c) { return c.code_id === raw; });
  if (!code) { showResult('fail', '&#10005;', 'INVALID CODE', 'Not registered in this session'); addLog(raw, false, 'Invalid code'); return; }
  if (usedSet.has(raw)) { showResult('fail', '!', 'ALREADY USED', 'Guest #' + code.num + ' already entered'); addLog(raw, false, 'Guest #' + code.num + ' – already scanned'); return; }

  var res = await sb.from('codes').update({ used_at: new Date().toISOString() }).eq('code_id', raw).eq('session_id', SESSION_ID);
  if (res.error) { showResult('fail', '!', 'DB ERROR', res.error.message); return; }

  usedSet.add(raw);
  var idx = codes.findIndex(function (c) { return c.code_id === raw; });
  if (idx !== -1) codes[idx].used_at = new Date().toISOString();
  updateStats();
  showResult('ok', '&#10003;', 'WELCOME!', 'Guest #' + code.num + ' – Enjoy the celebration!');
  addLog(raw, true, 'Guest #' + code.num + ' admitted');
}

function showResult(type, icon, title, sub) {
  var box = document.getElementById('result-box');
  box.className = 'result-box' + (type ? ' ' + type : '');
  box.innerHTML = '<div class="ri">' + icon + '</div><div class="rt">' + title + '</div><div class="rs">' + sub + '</div>';
  if (type) {
    setTimeout(function () {
      box.className = 'result-box';
      box.innerHTML = '<div class="ri">&#9671;</div><div class="rt">READY</div><div class="rs">Scanner is active — point at guest QR code</div>';
    }, 4000);
  }
}

function addLog(code, ok, msg) {
  var time = new Date().toLocaleTimeString();
  scanLog.unshift({ code: code, ok: ok, msg: msg, time: time });
  var list = document.getElementById('log-list');
  var item = document.createElement('div'); item.className = 'li';
  item.innerHTML = '<span class="ldot ' + (ok ? 'ok' : 'fail') + '"></span><span>' + msg + '</span><span class="ltime">' + time + '</span>';
  if (list.querySelector('.lempty')) list.innerHTML = '';
  list.prepend(item);
  if (list.children.length > 40) list.removeChild(list.lastChild);
}

function manualCheck() {
  var val = document.getElementById('manual-code').value.trim().toUpperCase();
  if (!val) return;
  processCode(val);
  document.getElementById('manual-code').value = '';
}

function updateStats() {
  document.getElementById('stat-total').textContent = codes.length;
  document.getElementById('stat-scanned').textContent = usedSet.size;
  document.getElementById('stat-remaining').textContent = codes.length - usedSet.size;
}

// ════════════════════════════════════════════════
//  CODE GENERATION  (appends — never replaces)
// ════════════════════════════════════════════════
function uid() {
  return 'WED-' + Math.random().toString(36).substr(2, 4).toUpperCase()
    + Math.random().toString(36).substr(2, 4).toUpperCase();
}

async function generateQRs() {
  if (!SESSION_ID) return;
  var count = parseInt(document.getElementById('qr-count').value);
  var name = document.getElementById('event-name').value.trim() || 'Wedding';
  if (!count || count < 1) { alert('Enter a valid number.'); return; }

  document.getElementById('gen-btn').disabled = true;
  document.getElementById('gen-info').textContent = 'Adding ' + count + ' codes...';

  var maxNum = codes.reduce(function (m, c) { return Math.max(m, c.num); }, 0);
  var batch = [];
  for (var i = 1; i <= count; i++) {
    batch.push({ session_id: SESSION_ID, code_id: uid(), num: maxNum + i, name: name, used_at: null });
  }

  var CHUNK = 500;
  for (var j = 0; j < batch.length; j += CHUNK) {
    var res = await sb.from('codes').insert(batch.slice(j, j + CHUNK));
    if (res.error) { alert('DB error: ' + res.error.message); document.getElementById('gen-btn').disabled = false; return; }
  }

  codes = codes.concat(batch);
  renderGrid();
  updateStats();
  document.getElementById('dl-btn').disabled = false;
  document.getElementById('img-btn').disabled = false;
  document.getElementById('gen-btn').disabled = false;
  document.getElementById('gen-info').textContent = count + ' codes added. Total: ' + codes.length + '.';
  setSS('live', 'Live · ' + codes.length + ' codes');
}

// ════════════════════════════════════════════════
//  QR GRID RENDER
// ════════════════════════════════════════════════
function renderGrid() {
  var grid = document.getElementById('qr-grid');
  grid.innerHTML = '';

  codes.forEach(function (c) {
    var wrap = document.createElement('div');
    wrap.className = 'qi'; wrap.id = 'qi-' + c.code_id;

    var qd = document.createElement('div');
    qd.title = 'Click to download PDF for guest #' + c.num;
    qd.style.cursor = 'pointer';
    new QRCode(qd, { text: c.code_id, width: 108, height: 108, colorDark: '#0d0b08', colorLight: '#f7f2e8', correctLevel: QRCode.CorrectLevel.M });
    qd.addEventListener('click', function () { downloadOnePDF(c); });

    var lbl = document.createElement('div');
    lbl.className = 'qi-num';
    lbl.textContent = '#' + c.num + ' · ' + c.name;

    var dlBtn = document.createElement('button');
    dlBtn.className = 'qi-dl';
    dlBtn.innerHTML = '&#8595; PDF';
    dlBtn.addEventListener('click', function () { downloadOnePDF(c); });

    wrap.appendChild(qd); wrap.appendChild(lbl); wrap.appendChild(dlBtn);
    grid.appendChild(wrap);
  });

  document.getElementById('dl-btn').disabled = false;
  document.getElementById('img-btn').disabled = false;
}

// ════════════════════════════════════════════════
//  PDF  —  your original buildCard, untouched
// ════════════════════════════════════════════════
function ldScript(src) {
  return new Promise(function (r, e) {
    var s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = e;
    document.head.appendChild(s);
  });
}
function slp(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function buildCard(doc, c, couple) {
  var W = 148, H = 210;

  doc.setFillColor(248, 243, 233);
  doc.rect(0, 0, W, H, 'F');

  doc.setDrawColor(185, 148, 80);
  doc.setLineWidth(1.8);
  doc.rect(5, 5, W - 10, H - 10);

  doc.setLineWidth(0.4);
  doc.rect(8.5, 8.5, W - 17, H - 17);

  doc.setFillColor(185, 148, 80);
  [[5, 5], [W - 5, 5], [5, H - 5], [W - 5, H - 5]].forEach(function (p) { doc.circle(p[0], p[1], 1.5, 'F'); });
  [[W / 2, 5], [W / 2, H - 5], [5, H / 2], [W - 5, H / 2]].forEach(function (p) { doc.circle(p[0], p[1], 0.8, 'F'); });

  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(185, 148, 80);
  doc.text('*   *   *', W / 2, 20, { align: 'center' });

  doc.setFont('times', 'bolditalic');
  doc.setFontSize(30);
  doc.setTextColor(185, 148, 80);
  var nameLines = doc.splitTextToSize(couple, W - 24);
  var nameY = nameLines.length > 1 ? 30 : 33;
  doc.text(nameLines, W / 2, nameY, { align: 'center' });

  var ruleY = nameY + (nameLines.length > 1 ? 10 : 6);
  var rx = W * 0.15;
  doc.setDrawColor(185, 148, 80);
  doc.setLineWidth(0.5);
  doc.line(rx, ruleY, W - rx, ruleY);
  doc.setFillColor(185, 148, 80);
  var dx = W / 2, dy = ruleY;
  doc.triangle(dx, dy - 2.5, dx + 2.5, dy, dx, dy + 2.5, 'F');
  doc.triangle(dx, dy - 2.5, dx - 2.5, dy, dx, dy + 2.5, 'F');

  var qSize = 84, qX = (W - qSize) / 2, qY = ruleY + 7;
  var qi = document.getElementById('qi-' + c.code_id);
  var cv = qi ? qi.querySelector('canvas') : null;
  if (cv) {
    doc.setFillColor(185, 148, 80);
    doc.rect(qX - 1.5, qY - 1.5, qSize + 3, qSize + 3, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(qX - 0.5, qY - 0.5, qSize + 1, qSize + 1, 'F');
    doc.addImage(cv.toDataURL('image/png'), 'PNG', qX, qY, qSize, qSize);
  }

  var bQ = qY + qSize + 9;
  doc.setDrawColor(185, 148, 80);
  doc.setLineWidth(0.5);
  doc.line(rx, bQ, W - rx, bQ);

  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(28, 18, 5);
  doc.text('Guest  ' + c.num, W / 2, bQ + 13, { align: 'center' });

  doc.setFont('courier', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(155, 120, 65);
  doc.text(c.code_id, W / 2, bQ + 22, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(14);
  doc.setTextColor(105, 80, 38);
  doc.text('Please present upon arrival', W / 2, bQ + 33, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(185, 148, 80);
  doc.text('*   *   *', W / 2, bQ + 46, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(140, 110, 60);
  doc.text('QR system and design by Eng. Osama  |  01033234374', W / 2, H - 11, { align: 'center' });
}

async function downloadOnePDF(c) {
  if (!window.jspdf) await ldScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  var jsPDF = window.jspdf.jsPDF;

  var couple = c.name || SESSION_NAME || 'Wedding';

  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  buildCard(doc, c, couple);
  doc.save('guest_' + String(c.num).padStart(4, '0') + '.pdf');
}

async function downloadAllPDF() {
  if (!codes.length) return;
  if (!window.jspdf) await ldScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!window.JSZip) await ldScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

  var jsPDF = window.jspdf.jsPDF;
  var zip = new JSZip();
  var ov = document.getElementById('prog-ov');
  var fill = document.getElementById('pfill');
  var txt = document.getElementById('ppct');
  document.getElementById('prog-title').textContent = 'GENERATING PDFs';
  ov.classList.add('show');

  var folderName = (SESSION_NAME || codes[0].name || 'Wedding').replace(/[^a-z0-9]/gi, '_') + '_QR';
  var folder = zip.folder(folderName);

  for (var i = 0; i < codes.length; i++) {
    var c = codes[i];
    var couple = c.name || SESSION_NAME || 'Wedding';

    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    buildCard(doc, c, couple);
    folder.file('guest_' + String(c.num).padStart(4, '0') + '.pdf', doc.output('arraybuffer'));

    var pct = Math.round((i + 1) / codes.length * 100);
    fill.style.width = pct + '%';
    txt.textContent = pct + '%';
    if (i % 10 === 0) await slp(0);
  }

  var blob = await zip.generateAsync({ type: 'blob' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = folderName + '.zip';
  a.click();
  ov.classList.remove('show');
}

// ════════════════════════════════════════════════
//  IMAGE ZIP EXPORT
//  Renders each card onto an off-screen canvas
//  and saves as JPEG — no jsPDF needed.
//
//  Card size: 1240 × 1754 px  (A5 @ 150 dpi)
//  Same visual design as the PDF cards above.
// ════════════════════════════════════════════════

/**
 * Draws one invitation card onto an off-screen canvas and returns it.
 * Mirrors the PDF buildCard() layout exactly.
 */
function drawCardCanvas(c, couple) {
  // A5 at 150 dpi: 148mm × 210mm
  var PX_PER_MM = 5.906;   // 150dpi / 25.4
  var W_MM = 148, H_MM = 210;
  var W = Math.round(W_MM * PX_PER_MM);  // 874 px
  var H = Math.round(H_MM * PX_PER_MM);  // 1240 px

  var cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  var ctx = cv.getContext('2d');

  // Convert mm to px
  function px(mm) { return mm * PX_PER_MM; }

  // ── Background ──────────────────────────────
  ctx.fillStyle = 'rgb(248,243,233)';
  ctx.fillRect(0, 0, W, H);

  // ── Outer border (1.8mm lineWidth) ──────────
  ctx.strokeStyle = 'rgb(185,148,80)';
  ctx.lineWidth = px(1.8);
  // jsPDF rect(x,y,w,h) — strokeRect in canvas takes same args
  strokeRect(ctx, px(5), px(5), W - px(10), H - px(10));

  // ── Inner border (0.4mm) ────────────────────
  ctx.lineWidth = px(0.4);
  strokeRect(ctx, px(8.5), px(8.5), W - px(17), H - px(17));

  // ── Corner dots r=1.5mm ────────────────────
  ctx.fillStyle = 'rgb(185,148,80)';
  [[5, 5], [148 - 5, 5], [5, 210 - 5], [148 - 5, 210 - 5]].forEach(function (p) {
    filledCircle(ctx, px(p[0]), px(p[1]), px(1.5));
  });
  // Mid-edge dots r=0.8mm
  [[W_MM / 2, 5], [W_MM / 2, 210 - 5], [5, 210 / 2], [148 - 5, 210 / 2]].forEach(function (p) {
    filledCircle(ctx, px(p[0]), px(p[1]), px(0.8));
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // ── Top ornament (fontSize 10pt ≈ 3.527mm) ──
  // jsPDF fontSize is in pt; 1pt = 0.353mm
  ctx.fillStyle = 'rgb(185,148,80)';
  ctx.font = px(10 * 0.353) + 'px serif';
  ctx.fillText('*   *   *', W / 2, px(20));

  // ── Couple name (30pt bold italic) ──────────
  ctx.fillStyle = 'rgb(185,148,80)';
  ctx.font = 'bold italic ' + px(30 * 0.353) + 'px serif';
  var nameLines = wrapText(ctx, couple, W - px(24));
  var nameY = nameLines.length > 1 ? px(30) : px(33);
  // jsPDF line height for 30pt is roughly 30*0.353 + small leading
  var lineH = px(30 * 0.353 * 1.2);
  nameLines.forEach(function (line, i) {
    ctx.fillText(line, W / 2, nameY + i * lineH);
  });
  var ruleY = nameY + (nameLines.length > 1 ? px(10) : px(6));

  // ── Decorative rule ──────────────────────────
  var rx = W * 0.15;
  ctx.strokeStyle = 'rgb(185,148,80)';
  ctx.lineWidth = px(0.5);
  ctx.beginPath(); ctx.moveTo(rx, ruleY); ctx.lineTo(W - rx, ruleY); ctx.stroke();

  // ── Diamond on rule ──────────────────────────
  ctx.fillStyle = 'rgb(185,148,80)';
  var dx = W / 2, dy = ruleY;
  ctx.beginPath();
  ctx.moveTo(dx, dy - px(2.5));
  ctx.lineTo(dx + px(2.5), dy);
  ctx.lineTo(dx, dy + px(2.5));
  ctx.lineTo(dx - px(2.5), dy);
  ctx.closePath(); ctx.fill();

  // ── QR code ─────────────────────────────────
  var qSize = px(84), qX = (W - qSize) / 2, qY = ruleY + px(7);
  var qi = document.getElementById('qi-' + c.code_id);
  var qrCv = qi ? qi.querySelector('canvas') : null;
  if (qrCv) {
    // Gold frame px(1.5) margin each side → total +px(3) per side
    ctx.fillStyle = 'rgb(185,148,80)';
    ctx.fillRect(qX - px(1.5), qY - px(1.5), qSize + px(3), qSize + px(3));
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillRect(qX - px(0.5), qY - px(0.5), qSize + px(1), qSize + px(1));
    ctx.drawImage(qrCv, qX, qY, qSize, qSize);
  }

  var bQ = qY + qSize + px(9);

  // ── Rule below QR ────────────────────────────
  ctx.strokeStyle = 'rgb(185,148,80)';
  ctx.lineWidth = px(0.5);
  ctx.beginPath(); ctx.moveTo(rx, bQ); ctx.lineTo(W - rx, bQ); ctx.stroke();

  // ── Guest label (24pt bold) ──────────────────
  // PDF shows "Guest  N" — for Excel cards we show the name instead
  var guestLabel = 'Guest  ' + c.num;
  ctx.fillStyle = 'rgb(28,18,5)';
  ctx.font = 'bold ' + px(24 * 0.353) + 'px serif';
  ctx.fillText(guestLabel, W / 2, bQ + px(15));

  // ── Code string (10pt courier) ───────────────
  ctx.fillStyle = 'rgb(155,120,65)';
  ctx.font = px(10 * 0.353) + 'px monospace';
  ctx.fillText(c.code_id, W / 2, bQ + px(22));

  // ── Instruction (14pt italic) ────────────────
  ctx.fillStyle = 'rgb(105,80,38)';
  ctx.font = 'italic ' + px(14 * 0.353) + 'px serif';
  ctx.fillText('Please present upon arrival', W / 2, bQ + px(33));

  // ── Bottom ornament (11pt) ───────────────────
  ctx.fillStyle = 'rgb(185,148,80)';
  ctx.font = px(11 * 0.353) + 'px serif';
  ctx.fillText('*   *   *', W / 2, bQ + px(46));

  // ── Footer (10pt helvetica) ──────────────────
  ctx.fillStyle = 'rgb(140,110,60)';
  ctx.font = px(10 * 0.353) + 'px sans-serif';
  // Scale down if text overflows
  var footerText = 'QR system and design by Eng. Osama  |  01033234374';
  var maxFW = W - px(20);
  if (ctx.measureText(footerText).width > maxFW) {
    ctx.font = px(8 * 0.353) + 'px sans-serif';
  }
  ctx.fillText(footerText, W / 2, H - px(11));

  return cv;
}

// ── Canvas drawing helpers ───────────────────────
function strokeRect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.stroke();
}
function filledCircle(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
/** Wrap text to fit within maxWidth pixels, return array of lines. */
function wrapText(ctx, text, maxWidth) {
  var words = text.split(' ');
  var lines = [];
  var line = '';
  words.forEach(function (word) {
    var test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line); line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/** Download all codes as a ZIP of JPEG images. */
async function downloadAllImages() {
  if (!codes.length) return;
  if (!window.JSZip) await ldScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

  var zip = new JSZip();
  var ov = document.getElementById('prog-ov');
  var fill = document.getElementById('pfill');
  var txt = document.getElementById('ppct');
  document.getElementById('prog-title').textContent = 'GENERATING IMAGES';
  ov.classList.add('show');

  var folderName = (SESSION_NAME || codes[0].name || 'Wedding').replace(/[^a-z0-9]/gi, '_') + '_Images';
  var folder = zip.folder(folderName);

  for (var i = 0; i < codes.length; i++) {
    var c = codes[i];
    var couple = c.name || SESSION_NAME || 'Wedding';

    var card = drawCardCanvas(c, couple);
    var b64 = card.toDataURL('image/jpeg', 0.92).split(',')[1];
    folder.file('guest_' + String(c.num).padStart(4, '0') + '.jpg', b64, { base64: true });

    var pct = Math.round((i + 1) / codes.length * 100);
    fill.style.width = pct + '%';
    txt.textContent = pct + '%';
    if (i % 5 === 0) await slp(0);
  }

  var blob = await zip.generateAsync({ type: 'blob' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = folderName + '.zip';
  a.click();
  ov.classList.remove('show');
}

// ════════════════════════════════════════════════
//  MANAGE PAGE
// ════════════════════════════════════════════════
function renderManage(filter) {
  var list = document.getElementById('manage-list');
  if (!codes.length) { list.innerHTML = '<div class="empty-state"><div class="ei">&#9671;</div><div>No codes generated yet</div></div>'; return; }
  var shown = codes;
  if (filter === 'used') shown = codes.filter(function (c) { return usedSet.has(c.code_id); });
  if (filter === 'unused') shown = codes.filter(function (c) { return !usedSet.has(c.code_id); });
  document.getElementById('mc').textContent = 'Showing ' + shown.length + ' of ' + codes.length;
  list.innerHTML = shown.map(function (c) {
    var u = usedSet.has(c.code_id);
    return '<div class="mi" id="mi-' + c.code_id + '">'
      + '<span class="mnum">#' + c.num + '</span>'
      + '<span class="mcode">' + c.code_id + '</span>'
      + '<span class="badge ' + (u ? 'bu' : 'bn') + '">' + (u ? 'USED' : 'UNUSED') + '</span>'
      + (u ? '<button class="btn btn-out btn-sm" onclick="resetOne(\'' + c.code_id + '\')">&#8634;</button>' : '')
      + '<button class="btn-del" onclick="deleteOne(\'' + c.code_id + '\')">&#10005;</button>'
      + '</div>';
  }).join('');
}

async function resetOne(id) {
  await sb.from('codes').update({ used_at: null }).eq('code_id', id).eq('session_id', SESSION_ID);
  usedSet.delete(id);
  var idx = codes.findIndex(function (c) { return c.code_id === id; });
  if (idx !== -1) codes[idx].used_at = null;
  updateStats(); renderManage('all');
}

async function resetAllUsed() {
  if (!confirm('Reset ALL used codes?')) return;
  await sb.from('codes').update({ used_at: null }).eq('session_id', SESSION_ID);
  usedSet = new Set(); scanLog = [];
  codes.forEach(function (c) { c.used_at = null; });
  updateStats(); renderManage('all');
  document.getElementById('log-list').innerHTML = '<div class="lempty">No scans yet</div>';
}

async function deleteOne(codeId) {
  if (!confirm('Delete code ' + codeId + '? This cannot be undone.')) return;
  var res = await sb.from('codes').delete().eq('code_id', codeId).eq('session_id', SESSION_ID);
  if (res.error) { alert('Error: ' + res.error.message); return; }
  codes = codes.filter(function (c) { return c.code_id !== codeId; });
  usedSet.delete(codeId);
  var qi = document.getElementById('qi-' + codeId); if (qi) qi.remove();
  updateStats(); renderManage('all');
}

async function deleteAllCodes() {
  if (!confirm('Delete ALL ' + codes.length + ' codes in this session? This CANNOT be undone.')) return;
  if (!confirm('Final confirmation — all QR codes will be permanently deleted.')) return;
  var res = await sb.from('codes').delete().eq('session_id', SESSION_ID);
  if (res.error) { alert('Error: ' + res.error.message); return; }
  codes = []; usedSet = new Set(); scanLog = [];
  document.getElementById('qr-grid').innerHTML = '<div class="empty-state"><div class="ei">&#9671;</div><div>No codes yet</div></div>';
  document.getElementById('dl-btn').disabled = true;
  document.getElementById('img-btn').disabled = true;
  updateStats(); renderManage('all');
  document.getElementById('log-list').innerHTML = '<div class="lempty">No scans yet</div>';
  setSS('live', 'Live · 0 codes');
}

// ════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════
function setSS(s, t) {
  document.getElementById('sdot').className = 'sdot ' + s;
  document.getElementById('stxt').textContent = t;
}

function hash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return 'h' + Math.abs(h).toString(16);
}

// ════════════════════════════════════════════════
//  BOOT — auto-resume saved session on page load
// ════════════════════════════════════════════════
(async function boot() {
  var saved = localStorage.getItem('wqr_session');
  if (!saved) return;
  try {
    var s = JSON.parse(saved);
    var res = await sb.from('sessions').select('id,name').eq('id', s.id).maybeSingle();
    if (res.data) enterApp(res.data.id, res.data.name);
    else localStorage.removeItem('wqr_session');
  } catch (e) { localStorage.removeItem('wqr_session'); }
})();
