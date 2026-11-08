/* Disiplin — pengingat, checklist jujur, aturan makan, dan grafik perkembangan.
   Semua data disimpan di perangkat (localStorage + IndexedDB untuk file suara). */
'use strict';

// ---------- util ----------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => Math.random().toString(36).slice(2, 9);
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- state ----------
const STORE = 'disiplin-data-v1';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MEALS = [
  { id: 'breakfast', icon: '🍳', name: 'Makan pagi (sebelum/di sekolah)' },
  { id: 'dinner', icon: '🍛', name: 'Makan malam' },
  { id: 'noSnack', icon: '🚫', name: 'Aku TIDAK ngemil/jajan snack hari ini' },
];

function defaults() {
  return {
    name: 'Gilbi',
    volume: 300,
    sound: 'siren',
    customName: '',
    mathLock: true,
    vibrate: true,
    tasks: [
      { id: 'bangun', icon: '⏰', name: 'Bangun pagi (langsung, tanpa tunda)' },
      { id: 'kasur', icon: '🛏️', name: 'Rapikan tempat tidur' },
      { id: 'mandi', icon: '🚿', name: 'Mandi pagi' },
      { id: 'gigi', icon: '🪥', name: 'Sikat gigi pagi & malam' },
      { id: 'olahraga', icon: '🏃', name: 'Olahraga minimal 20 menit' },
      { id: 'air', icon: '💧', name: 'Minum air putih 8 gelas' },
      { id: 'belajar', icon: '📚', name: 'Belajar / kerjakan PR' },
      { id: 'mandisore', icon: '🛁', name: 'Mandi sore' },
      { id: 'tidur', icon: '😴', name: 'Tidur sebelum jam 22.00' },
    ],
    alarms: [
      { id: uid(), time: '05:00', label: 'BANGUN! Hari baru, kamu baru! 💪', days: ALL_DAYS.slice(), on: true },
      { id: uid(), time: '05:10', label: 'Rapikan kasur & mandi pagi 🚿', days: ALL_DAYS.slice(), on: true },
      { id: uid(), time: '06:00', label: 'Sarapan sekarang (makan pagi) 🍳', days: ALL_DAYS.slice(), on: true },
      { id: uid(), time: '16:30', label: 'Olahraga 20 menit 🏃 — jangan ngemil!', days: ALL_DAYS.slice(), on: true },
      { id: uid(), time: '19:00', label: 'Makan malam 🍛 (terakhir makan hari ini)', days: ALL_DAYS.slice(), on: true },
      { id: uid(), time: '21:00', label: 'Isi checklist hari ini dengan JUJUR ✅', days: ALL_DAYS.slice(), on: true },
      { id: uid(), time: '21:45', label: 'Siap-siap tidur 😴', days: ALL_DAYS.slice(), on: true },
    ],
    log: {},
  };
}

let S;
try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(STORE) || '{}')); }
catch { S = defaults(); }
// Di dalam APK Android, alarm dijalankan oleh sistem (AlarmManager) lewat jembatan ini.
const NATIVE = window.DisiplinNative || null;
let lastSynced = '';
function syncNative() {
  if (!NATIVE) return;
  const cfg = JSON.stringify({ alarms: S.alarms, volume: S.volume, sound: S.sound, mathLock: S.mathLock, vibrate: S.vibrate });
  if (cfg === lastSynced) return;
  lastSynced = cfg;
  try { NATIVE.syncConfig(cfg); } catch (e) {}
}
const save = () => { localStorage.setItem(STORE, JSON.stringify(S)); syncNative(); };

// ---------- IndexedDB untuk file suara ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('disiplin', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(k, v) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction('files').objectStore('files').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

// ---------- Audio (dengan BOOST di atas 100%) ----------
const Sound = {
  ctx: null, master: null, boost: null, nodes: [], timers: [], customBuf: null,
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // rantai: sumber -> boost (gain bisa > 1) -> soft-clipper -> output
      this.boost = this.ctx.createGain();
      const shaper = this.ctx.createWaveShaper();
      const n = 2048, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 1.5) / Math.tanh(1.5); }
      shaper.curve = curve;
      shaper.oversample = '4x';
      this.boost.connect(shaper).connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    this.boost.gain.value = S.volume / 100;
    return this.ctx;
  },
  setVolume(v) { if (this.boost) this.boost.gain.setTargetAtTime(v / 100, this.ctx.currentTime, 0.05); },
  async loadCustom() {
    const blob = await idbGet('custom').catch(() => null);
    if (!blob) return null;
    const ctx = this.ensure();
    const buf = await blob.arrayBuffer();
    this.customBuf = await ctx.decodeAudioData(buf);
    return this.customBuf;
  },
  osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; this.nodes.push(o); return o; },
  async play(kind = S.sound) {
    this.stop();
    const ctx = this.ensure();
    const out = ctx.createGain(); out.gain.value = 1; out.connect(this.boost); this.nodes.push(out);
    if (kind === 'custom') {
      const buf = this.customBuf || await this.loadCustom().catch(() => null);
      if (buf) {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        src.connect(out); src.start(); this.nodes.push(src);
        return;
      }
      toast('File suara belum dipilih, pakai sirine dulu');
      kind = 'siren';
    }
    if (kind === 'siren') {
      const o = this.osc('sawtooth', 900), lfo = this.osc('sine', 0.7), lg = ctx.createGain();
      lg.gain.value = 450; lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g).connect(out); this.nodes.push(g, lg);
      o.start(); lfo.start();
    } else if (kind === 'beep') {
      const o = this.osc('square', 1046), g = ctx.createGain(); g.gain.value = 0;
      o.connect(g).connect(out); o.start(); this.nodes.push(g);
      const sched = () => {
        const t = ctx.currentTime;
        for (let i = 0; i < 4; i++) { g.gain.setValueAtTime(0.5, t + i * 0.18); g.gain.setValueAtTime(0, t + i * 0.18 + 0.1); }
      };
      sched(); this.timers.push(setInterval(sched, 1100));
    } else if (kind === 'rooster') {
      const o = this.osc('square', 700), g = ctx.createGain(); g.gain.value = 0;
      o.connect(g).connect(out); o.start(); this.nodes.push(g);
      const sched = () => {
        const t = ctx.currentTime;
        o.frequency.setValueAtTime(500, t); o.frequency.linearRampToValueAtTime(1300, t + 0.25);
        o.frequency.linearRampToValueAtTime(1100, t + 0.6); o.frequency.linearRampToValueAtTime(1500, t + 1.0);
        o.frequency.linearRampToValueAtTime(600, t + 1.4);
        g.gain.setValueAtTime(0.45, t); g.gain.setValueAtTime(0.45, t + 1.4); g.gain.linearRampToValueAtTime(0, t + 1.5);
      };
      sched(); this.timers.push(setInterval(sched, 2000));
    }
  },
  stop() {
    this.timers.forEach(clearInterval); this.timers = [];
    this.nodes.forEach(n => { try { n.stop && n.stop(); } catch {} try { n.disconnect(); } catch {} });
    this.nodes = [];
  },
};
// buka kunci audio di sentuhan pertama (aturan browser)
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => Sound.ensure(), { once: true }));

// ---------- Tabs ----------
$$('nav.bottom button').forEach(b => b.onclick = () => {
  $$('nav.bottom button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'stats') renderStats();
  window.scrollTo(0, 0);
});

// ---------- HARI INI ----------
const QUOTES = [
  'Disiplin adalah jembatan antara tujuan dan pencapaian.',
  'Kamu nggak perlu sempurna. Kamu cuma perlu konsisten.',
  'Rasa lapar sebentar, bangga selamanya. Tahan ngemilnya!',
  'Orang yang bangun pagi sudah menang satu langkah.',
  'Jujur ke diri sendiri itu langkah pertama untuk berubah.',
  'Sedikit demi sedikit, lama-lama jadi bukit — begitu juga kebiasaan baik.',
  'Hari ini berat? Bagus. Itu tandanya kamu sedang berubah.',
];

function today() { return dkey(new Date()); }
function dayEntry(k) {
  if (!S.log[k]) S.log[k] = { answers: {}, meals: {}, snackNote: '', saved: false };
  return S.log[k];
}

function ynButtons(val, onSet) {
  const wrap = document.createElement('div'); wrap.className = 'yn';
  const y = document.createElement('button'); y.className = 'yes' + (val === true ? ' on' : ''); y.textContent = 'Ya';
  const n = document.createElement('button'); n.className = 'no' + (val === false ? ' on' : ''); n.textContent = 'Tidak';
  y.onclick = () => onSet(true); n.onclick = () => onSet(false);
  wrap.append(y, n); return wrap;
}

function renderToday() {
  const now = new Date();
  $('#hello').textContent = `Halo, ${S.name || 'kamu'}! 👋`;
  $('#todayLabel').textContent = `${DAYS_FULL[now.getDay()]}, ${now.getDate()} ${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`;
  $('#quote').textContent = '“' + QUOTES[(now.getDate() + now.getMonth()) % QUOTES.length] + '”';
  const e = dayEntry(today());

  const ul = $('#checklist'); ul.innerHTML = '';
  S.tasks.forEach(t => {
    const li = document.createElement('li');
    const cur = e.answers[t.id] ? e.answers[t.id].v : undefined;
    li.innerHTML = `<span>${esc(t.icon || '•')}</span><span class="name">${esc(t.name)}</span>`;
    li.append(ynButtons(cur, v => { e.answers[t.id] = { n: t.name, v }; e.saved = false; save(); renderToday(); }));
    ul.append(li);
  });

  const ml = $('#meallist'); ml.innerHTML = '';
  MEALS.forEach(m => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${m.icon}</span><span class="name">${esc(m.name)}</span>`;
    li.append(ynButtons(e.meals[m.id], v => { e.meals[m.id] = v; e.saved = false; save(); renderToday(); }));
    ml.append(li);
  });
  $('#snackNoteWrap').classList.toggle('hidden', e.meals.noSnack !== false);
  $('#snackNote').value = e.snackNote || '';
  $('#honestPledge').checked = !!e.saved;
  showScore(e);
  renderStreak();
}
$('#snackNote').oninput = ev => { dayEntry(today()).snackNote = ev.target.value; save(); };

function scoreOf(e) {
  const vals = Object.values(e.answers).map(a => a.v).concat(MEALS.map(m => e.meals[m.id]));
  const answered = vals.filter(v => v !== undefined);
  if (!answered.length) return null;
  return Math.round(answered.filter(v => v === true).length / answered.length * 100);
}

function showScore(e) {
  const el = $('#todayScore');
  if (!e.saved) { el.textContent = 'Belum disimpan hari ini.'; el.style.color = ''; return; }
  const s = e.score;
  let msg = s >= 80 ? 'Mantap! Pertahankan! 🔥' : s >= 50 ? 'Lumayan, besok harus lebih baik! 💪' : 'Hari ini kurang. Nggak apa-apa, besok bangkit lagi! 🙏';
  if (e.meals.noSnack === false) msg += ' (Ingat: besok TANPA snack!)';
  el.textContent = `Skor hari ini: ${s}% — ${msg}`;
  el.style.color = s >= 80 ? 'var(--good)' : s >= 50 ? 'var(--mid)' : 'var(--bad)';
}

$('#saveDay').onclick = () => {
  const e = dayEntry(today());
  const missing = S.tasks.filter(t => !e.answers[t.id]).length + MEALS.filter(m => e.meals[m.id] === undefined).length;
  if (missing) return toast(`Masih ada ${missing} pertanyaan yang belum dijawab`);
  if (!$('#honestPledge').checked) return toast('Centang dulu janji jujurnya ✋');
  // hanya simpan jawaban untuk kegiatan yang masih ada
  const keep = {}; S.tasks.forEach(t => keep[t.id] = e.answers[t.id]); e.answers = keep;
  e.score = scoreOf(e); e.saved = true; e.savedAt = Date.now();
  save(); renderToday(); toast('Tersimpan! Terima kasih sudah jujur 🙌');
};

function renderStreak() {
  let d = new Date(), n = 0;
  if (!(S.log[dkey(d)] && S.log[dkey(d)].saved)) d.setDate(d.getDate() - 1);
  while (true) {
    const e = S.log[dkey(d)];
    if (e && e.saved && e.score >= 80) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  $('#streak').textContent = '🔥 ' + n;
}

// ---------- PENGINGAT ----------
function renderAlarms() {
  const ul = $('#alarmList'); ul.innerHTML = '';
  S.alarms.sort((a, b) => a.time.localeCompare(b.time)).forEach(a => {
    const li = document.createElement('li');
    const days = a.days.length === 7 ? 'Setiap hari' : a.days.length ? a.days.slice().sort().map(d => DAYS[d]).join(', ') : 'Sekali';
    li.innerHTML = `<div class="t">${a.time}</div><div class="info"><div>${esc(a.label)}</div><div class="d">${days}</div></div>`;
    const sw = document.createElement('button'); sw.className = 'switch' + (a.on ? ' on' : '');
    sw.onclick = () => { a.on = !a.on; save(); renderAlarms(); };
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '🗑️';
    del.onclick = () => { if (confirm('Hapus pengingat ini?')) { S.alarms = S.alarms.filter(x => x !== a); save(); renderAlarms(); } };
    li.append(sw, del); ul.append(li);
  });
  if (NATIVE) setTimeout(renderNative, 50);
}

const newDays = new Set(ALL_DAYS);
function renderNewDays() {
  const w = $('#newAlarmDays'); w.innerHTML = '';
  [1, 2, 3, 4, 5, 6, 0].forEach(d => {
    const b = document.createElement('button'); b.textContent = DAYS[d]; b.className = newDays.has(d) ? 'on' : '';
    b.onclick = () => { newDays.has(d) ? newDays.delete(d) : newDays.add(d); renderNewDays(); };
    w.append(b);
  });
}
$('#addAlarm').onclick = () => {
  const time = $('#newAlarmTime').value;
  if (!time) return toast('Isi jamnya dulu');
  S.alarms.push({ id: uid(), time, label: $('#newAlarmLabel').value.trim() || 'Pengingat!', days: [...newDays], on: true });
  $('#newAlarmLabel').value = '';
  save(); renderAlarms(); toast('Pengingat ditambahkan ⏰');
};

// volume & suara
const vol = $('#volume');
vol.value = S.volume; $('#volLabel').textContent = S.volume + '%';
vol.oninput = () => {
  S.volume = +vol.value; $('#volLabel').textContent = S.volume + '%';
  $('#volLabel').style.color = S.volume > 100 ? 'var(--accent)' : '';
  Sound.setVolume(S.volume); save();
};
$('#soundSel').value = S.sound;
$('#customWrap').classList.toggle('hidden', S.sound !== 'custom');
$('#customName').textContent = S.customName ? 'Dipilih: ' + S.customName : '';
$('#soundSel').onchange = ev => { S.sound = ev.target.value; save(); $('#customWrap').classList.toggle('hidden', S.sound !== 'custom'); };
$('#customFile').onchange = async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    await idbPut('custom', f);
    if (NATIVE) {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
      if (!NATIVE.saveCustomSound(b64)) throw new Error('native');
    }
    S.customName = f.name; save();
    Sound.customBuf = null; await Sound.loadCustom();
    $('#customName').textContent = 'Dipilih: ' + f.name; toast('Suara tersimpan 🎵');
  } catch (e) { toast('Gagal membaca file suara'); }
};
$('#mathLock').checked = S.mathLock; $('#mathLock').onchange = ev => { S.mathLock = ev.target.checked; save(); };
$('#vibrate').checked = S.vibrate; $('#vibrate').onchange = ev => { S.vibrate = ev.target.checked; save(); };
$('#testSound').onclick = () => {
  if (NATIVE) { syncNative(); NATIVE.testSound(); return; }
  Sound.play(); setTimeout(() => Sound.stop(), 5000);
};
$('#stopSound').onclick = () => { if (NATIVE) NATIVE.stopSound(); else Sound.stop(); };

// ---------- Mode APK: status izin Android ----------
const PERMS = [
  ['notif', '🔔 Notifikasi'],
  ['exact', '⏱️ Alarm tepat waktu'],
  ['fullscreen', '📱 Layar alarm penuh (di atas layar kunci)'],
  ['battery', '🔋 Jangan dibatasi penghemat baterai'],
];
function renderNative() {
  if (!NATIVE) return;
  $('#permCard').classList.add('hidden');
  $('#nativeCard').classList.remove('hidden');
  let st = {};
  try { st = JSON.parse(NATIVE.permissionStatus()); } catch (e) {}
  const ul = $('#permList'); ul.innerHTML = '';
  PERMS.forEach(([k, name]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="name">${name}</span>`;
    const b = document.createElement('button');
    b.className = 'btn small' + (st[k] ? '' : ' primary');
    b.textContent = st[k] ? '✅ OK' : 'Izinkan';
    b.onclick = () => NATIVE.openPermission(k);
    li.append(b); ul.append(li);
  });
  const next = Number(NATIVE.nextAlarm());
  $('#nextAlarm').textContent = next > 0
    ? 'Alarm berikutnya: ' + new Date(next).toLocaleString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    : 'Belum ada alarm aktif.';
}
window.onNativeResume = () => {
  if (!NATIVE) return;
  // alarm "sekali" yang sudah berbunyi dimatikan oleh sistem -> ikuti di sini
  try {
    const cfg = JSON.parse(NATIVE.getConfig());
    (cfg.alarms || []).forEach(na => { const a = S.alarms.find(x => x.id === na.id); if (a && a.on && na.on === false) a.on = false; });
    localStorage.setItem(STORE, JSON.stringify(S));
    lastSynced = ''; syncNative();
  } catch (e) {}
  renderAlarms(); renderNative(); renderToday();
};
$('#testAlarm').onclick = () => {
  syncNative(); NATIVE.testAlarm(60);
  toast('Alarm tes akan bunyi 1 menit lagi. Coba kunci HP-nya sekarang 🔒');
};

// izin notifikasi & wake lock
let swReg = null;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(r => swReg = r).catch(() => {});
function renderNotifBtn() {
  const b = $('#btnNotif');
  if (!('Notification' in window)) { b.textContent = '🔕 Notifikasi tidak didukung'; b.disabled = true; return; }
  b.textContent = Notification.permission === 'granted' ? '🔔 Notifikasi: AKTIF' : '🔔 Izinkan Notifikasi';
}
$('#btnNotif').onclick = async () => { if ('Notification' in window) { await Notification.requestPermission(); renderNotifBtn(); } };

let wakeLock = null, wakeWanted = false;
async function requestWake() {
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; renderWake(); }); }
  catch { wakeLock = null; }
  renderWake();
}
function renderWake() { $('#btnWake').textContent = '🌙 Mode Jaga Layar: ' + (wakeLock ? 'ON' : 'OFF'); }
$('#btnWake').onclick = async () => {
  if (!('wakeLock' in navigator)) return toast('HP/browser ini tidak mendukung Jaga Layar');
  if (wakeLock) { wakeWanted = false; await wakeLock.release(); wakeLock = null; renderWake(); }
  else { wakeWanted = true; await requestWake(); if (wakeLock) toast('Layar tidak akan mati otomatis. Redupkan kecerahan & colok charger 🔌'); }
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (wakeWanted && !wakeLock) requestWake(); checkAlarms(); } });

// ---------- Mesin alarm ----------
const fired = new Set(JSON.parse(localStorage.getItem('disiplin-fired') || '[]'));
let snoozes = [];       // [{at: ms, label}]
let ringing = null;     // alarm aktif
let mathAnswer = 0;

function checkAlarms() {
  if (ringing || NATIVE) return; // di APK, alarm ditangani Android
  const now = new Date();
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dk = dkey(now);
  for (const a of S.alarms) {
    if (!a.on || a.time !== hm) continue;
    if (a.days.length && !a.days.includes(now.getDay())) continue;
    const key = `${dk} ${a.time} ${a.id}`;
    if (fired.has(key)) continue;
    fired.add(key);
    localStorage.setItem('disiplin-fired', JSON.stringify([...fired].slice(-60)));
    if (!a.days.length) { a.on = false; save(); renderAlarms(); } // sekali saja
    return ring(a.time, a.label);
  }
  const due = snoozes.find(s => s.at <= Date.now());
  if (due) { snoozes = snoozes.filter(s => s !== due); ring(hm, due.label, true); }
}
setInterval(checkAlarms, 1000);

function ring(time, label, wasSnoozed = false) {
  ringing = { time, label, wasSnoozed };
  $('#ringTime').textContent = time;
  $('#ringLabel').textContent = label;
  $('#snooze').classList.toggle('hidden', wasSnoozed);
  if (S.mathLock) {
    const a = 12 + Math.floor(Math.random() * 40), b = 3 + Math.floor(Math.random() * 9), c = Math.floor(Math.random() * 50);
    mathAnswer = a * b + c;
    $('#mathQ').textContent = `${a} × ${b} + ${c} = ?`;
    $('#mathA').value = '';
  }
  $('#mathBox').classList.toggle('hidden', !S.mathLock);
  $('#ring').classList.remove('hidden');
  Sound.play();
  if (S.vibrate && navigator.vibrate) { navigator.vibrate([800, 300, 800, 300, 800]); ringing.vib = setInterval(() => navigator.vibrate([800, 300, 800]), 2500); }
  if ('Notification' in window && Notification.permission === 'granted') {
    const opt = { body: label, tag: 'disiplin-alarm', renotify: true, requireInteraction: true, vibrate: [800, 300, 800], icon: 'icons/icon.svg' };
    (swReg ? swReg.showNotification('⏰ ' + time + ' — Disiplin', opt) : Promise.resolve(new Notification('⏰ ' + time, opt))).catch(() => {});
  }
}
function stopRing() {
  Sound.stop();
  if (ringing && ringing.vib) clearInterval(ringing.vib);
  if (navigator.vibrate) navigator.vibrate(0);
  ringing = null;
  $('#ring').classList.add('hidden');
}
$('#dismiss').onclick = () => {
  if (S.mathLock && +$('#mathA').value !== mathAnswer) { toast('Jawaban salah! Ayo melek dulu 👀'); $('#mathA').value = ''; return; }
  stopRing(); toast('Bagus! Langsung gerak, jangan balik ke kasur! 💪');
};
$('#snooze').onclick = () => {
  if (!ringing) return;
  snoozes.push({ at: Date.now() + 5 * 60 * 1000, label: ringing.label + ' (tunda)' });
  stopRing(); toast('Ditunda 5 menit. Cuma sekali ya!');
};

// ---------- ATUR: kegiatan ----------
function renderTaskEdit() {
  const ul = $('#taskEdit'); ul.innerHTML = '';
  S.tasks.forEach((t, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(t.icon || '•')}</b><span>${esc(t.name)}</span>`;
    const up = document.createElement('button'); up.textContent = '▲'; up.disabled = i === 0;
    up.onclick = () => { [S.tasks[i - 1], S.tasks[i]] = [S.tasks[i], S.tasks[i - 1]]; save(); renderTaskEdit(); renderToday(); };
    const del = document.createElement('button'); del.textContent = '🗑️';
    del.onclick = () => { if (confirm(`Hapus "${t.name}"?`)) { S.tasks.splice(i, 1); save(); renderTaskEdit(); renderToday(); } };
    li.append(up, del); ul.append(li);
  });
}
$('#addTask').onclick = () => {
  const name = $('#newTask').value.trim(); if (!name) return toast('Tulis nama kegiatannya');
  S.tasks.push({ id: uid(), icon: $('#newTaskIcon').value.trim() || '✔️', name });
  $('#newTask').value = ''; $('#newTaskIcon').value = '';
  save(); renderTaskEdit(); renderToday(); toast('Kegiatan ditambahkan');
};
$('#userName').value = S.name;
$('#userName').oninput = ev => { S.name = ev.target.value; save(); renderToday(); };

$('#exportData').onclick = () => {
  if (NATIVE) return NATIVE.saveFile(`disiplin-backup-${today()}.json`, JSON.stringify(S, null, 2));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `disiplin-backup-${today()}.json`; a.click();
};
$('#importData').onchange = async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!d.log || !d.tasks) throw 0; S = Object.assign(defaults(), d); save(); location.reload(); }
  catch { toast('File cadangan tidak valid'); }
};

// ---------- PERKEMBANGAN ----------
let period = 'week', offset = 0;
$$('#periodSeg button').forEach(b => b.onclick = () => {
  period = b.dataset.p; offset = 0;
  $$('#periodSeg button').forEach(x => x.classList.toggle('on', x === b));
  renderStats();
});
$('#prevPer').onclick = () => { offset--; renderStats(); };
$('#nextPer').onclick = () => { if (offset < 0) { offset++; renderStats(); } };

function daysBetween(a, b) { const out = []; const d = new Date(a); while (d <= b) { out.push(new Date(d)); d.setDate(d.getDate() + 1); } return out; }

function getRange() {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start, end, label: `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}` };
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { start, end, label: `${MONTHS_FULL[start.getMonth()]} ${start.getFullYear()}` };
  }
  const start = new Date(now.getFullYear() + offset, 0, 1), end = new Date(now.getFullYear() + offset, 11, 31);
  return { start, end, label: `Tahun ${start.getFullYear()}` };
}

function renderStats() {
  const { start, end, label } = getRange();
  $('#perLabel').textContent = label;
  $('#nextPer').disabled = offset >= 0;
  const days = daysBetween(start, end);
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const entries = days.map(d => ({ d, e: S.log[dkey(d)] })).filter(x => x.e && x.e.saved);

  // data grafik
  let bars;
  if (period === 'year') {
    bars = MONTHS.map((m, i) => {
      const es = entries.filter(x => x.d.getMonth() === i);
      return { label: m, v: es.length ? Math.round(es.reduce((s, x) => s + x.e.score, 0) / es.length) : null };
    });
  } else {
    bars = days.map(d => {
      const e = S.log[dkey(d)];
      return { label: period === 'week' ? DAYS[d.getDay()] : String(d.getDate()), v: e && e.saved ? e.score : null, today: dkey(d) === today() };
    });
  }
  drawChart(bars);

  // ringkasan
  const elapsed = days.filter(d => d <= todayD).length;
  const avg = entries.length ? Math.round(entries.reduce((s, x) => s + x.e.score, 0) / entries.length) : 0;
  const noSnack = entries.filter(x => x.e.meals.noSnack === true).length;
  $('#summary').innerHTML = `
    <div><b>${entries.length ? avg + '%' : '–'}</b><small>Rata-rata skor</small></div>
    <div><b>${entries.length}/${elapsed}</b><small>Hari diisi</small></div>
    <div><b>${noSnack}</b><small>Hari tanpa snack</small></div>`;

  // tabel per kegiatan
  const rows = new Map();
  const add = (id, name, v) => {
    if (v === undefined) return;
    if (!rows.has(id)) rows.set(id, { name, yes: 0, total: 0 });
    const r = rows.get(id); r.total++; if (v) r.yes++;
  };
  entries.forEach(({ e }) => {
    Object.entries(e.answers).forEach(([id, a]) => a && add(id, (S.tasks.find(t => t.id === id) || {}).name || a.n, a.v));
    MEALS.forEach(m => add('meal-' + m.id, m.icon + ' ' + m.name, e.meals[m.id]));
  });
  const tbl = $('#statTable');
  if (!rows.size) { tbl.innerHTML = '<tr><td>Belum ada data di periode ini. Isi checklist dan tekan Simpan setiap hari.</td></tr>'; return; }
  const sorted = [...rows.values()].sort((a, b) => a.yes / a.total - b.yes / b.total);
  tbl.innerHTML = '<tr><th>Kegiatan</th><th>Berhasil</th><th>%</th><th></th></tr>' + sorted.map(r => {
    const p = Math.round(r.yes / r.total * 100);
    const c = p >= 80 ? 'var(--good)' : p >= 50 ? 'var(--mid)' : 'var(--bad)';
    return `<tr><td>${esc(r.name)}</td><td class="num">${r.yes}/${r.total}</td><td class="num" style="color:${c}">${p}%</td><td><div class="bar"><i style="width:${p}%;background:${c}"></i></div></td></tr>`;
  }).join('');
  // tambahan: daftar snack yang dimakan (jujur)
  const snacks = entries.filter(x => x.e.meals.noSnack === false);
  if (snacks.length) {
    tbl.innerHTML += `<tr><th colspan="4">🍪 Catatan ngemil (${snacks.length} hari)</th></tr>` + snacks.map(x =>
      `<tr><td colspan="4">${x.d.getDate()} ${MONTHS[x.d.getMonth()]} — ${esc(x.e.snackNote || '(tidak dicatat)')}</td></tr>`).join('');
  }
}

function drawChart(bars) {
  const cv = $('#chart'), dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 320, H = 240;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  const L = 32, R = 6, T = 20, B = 26, ch = H - T - B, cw = W - L - R;
  g.font = '11px system-ui, sans-serif'; g.fillStyle = v('--muted'); g.strokeStyle = v('--line'); g.lineWidth = 1;
  [0, 50, 80, 100].forEach(p => {
    const y = T + ch - ch * p / 100;
    g.beginPath(); g.moveTo(L, y + .5); g.lineTo(W - R, y + .5); g.stroke();
    g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(p + '%', L - 4, y);
  });
  const n = bars.length, slot = cw / n, bw = Math.max(2, Math.min(36, slot * 0.7));
  const every = n > 20 ? 5 : 1;
  bars.forEach((b, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    if (b.v === null) { g.fillStyle = v('--none'); g.fillRect(x, T + ch - 3, bw, 3); }
    else {
      const h = Math.max(3, ch * b.v / 100);
      g.fillStyle = b.v >= 80 ? v('--good') : b.v >= 50 ? v('--mid') : v('--bad');
      const r = Math.min(4, bw / 2);
      g.beginPath(); g.moveTo(x, T + ch); g.lineTo(x, T + ch - h + r); g.quadraticCurveTo(x, T + ch - h, x + r, T + ch - h);
      g.lineTo(x + bw - r, T + ch - h); g.quadraticCurveTo(x + bw, T + ch - h, x + bw, T + ch - h + r); g.lineTo(x + bw, T + ch); g.fill();
      if (n <= 12) { g.fillStyle = v('--text'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(b.v, x + bw / 2, T + ch - h - 2); }
    }
    if (i % every === 0 || i === n - 1) {
      g.fillStyle = b.today ? v('--accent') : v('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(b.label, L + i * slot + slot / 2, T + ch + 6);
    }
  });
}
window.addEventListener('resize', () => { if ($('#tab-stats').classList.contains('active')) renderStats(); });

// ganti hari otomatis tengah malam
let lastDay = today();
setInterval(() => { if (today() !== lastDay) { lastDay = today(); renderToday(); } }, 30000);

// ---------- start ----------
save();
renderToday(); renderAlarms(); renderNewDays(); renderTaskEdit(); renderNotifBtn(); renderWake(); renderNative();
