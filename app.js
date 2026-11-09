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
  const cfg = JSON.stringify({ alarms: S.alarms, volume: S.volume, sound: S.sound, mathLock: S.mathLock, vibrate: S.vibrate, sleepUntil: S.sleepUntil || 0,
    challenge: S.challenge || (S.mathLock ? 'math' : 'none'), wallKind: S.wallMode === 'custom' ? (S.wallKind || 'image') : 'none', wallName: S.wallName || '' });
  if (cfg === lastSynced) return;
  lastSynced = cfg;
  try { NATIVE.syncConfig(cfg); } catch (e) {}
}
const save = () => { localStorage.setItem(STORE, JSON.stringify(S)); syncNative(); };

// Volume: 10%..3000%. Slider 0..100 -> separuh kiri 10-100%, separuh kanan 100-3000% (logaritmik)
const MAX_VOL = 3000;
const posToVol = p => p <= 50 ? Math.round((10 + p * 1.8) / 10) * 10 : Math.min(MAX_VOL, Math.round(100 * Math.pow(MAX_VOL / 100, (p - 50) / 50) / 10) * 10);
const volToPos = v => v <= 100 ? (v - 10) / 1.8 : 50 + 50 * Math.log(v / 100) / Math.log(MAX_VOL / 100);
const volText = v => v >= MAX_VOL ? 'MAKS' : v + '%';
const effSound = a => (a && a.sound && a.sound !== 'default') ? a.sound : S.sound;
const effVol = a => (a && a.volume) ? a.volume : S.volume;
const effKey = a => (a && a.sound === 'custom') ? a.id : 'default';
const SOUND_NAMES = { siren: '🚨 Sirine', beep: '⏰ Beep', rooster: '🐓 Kokok', custom: '🎵 Dari HP' };

// ---------- Lewati alarm ----------
/** Kemunculan alarm berikutnya yang waktunya > after (ms). */
function nextOcc(a, after) {
  const [h, m] = a.time.split(':').map(Number);
  for (let add = 0; add <= 8; add++) {
    const d = new Date(after); d.setDate(d.getDate() + add); d.setHours(h, m, 0, 0);
    if (d.getTime() <= after) continue;
    if (!a.days.length || a.days.includes(d.getDay())) return d.getTime();
  }
  return 0;
}
/** Kapan alarm ini benar-benar akan bunyi (memperhitungkan lewati sekali & mode tidur). */
function effectiveNext(a) {
  return nextOcc(a, Math.max(Date.now(), a.skipUntil || 0, (S.sleepUntil || 0) - 1));
}
function whenText(t) {
  const d = new Date(t), now = new Date();
  const tom = new Date(); tom.setDate(now.getDate() + 1);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (dkey(d) === dkey(now)) return 'hari ini ' + hm;
  if (dkey(d) === dkey(tom)) return 'besok ' + hm;
  return `${DAYS_FULL[d.getDay()]} ${hm}`;
}
function renderAll() { renderAlarms(); renderSleep(); }

function renderSleep() {
  const now = Date.now();
  if (S.sleepUntil && S.sleepUntil <= now) { S.sleepUntil = 0; save(); }
  document.querySelectorAll('[data-sleep]').forEach(el => {
    if (S.sleepUntil) {
      const skipped = S.alarms.filter(a => { if (!a.on) return false; const t = nextOcc(a, Math.max(now, a.skipUntil || 0)); return t && t < S.sleepUntil; });
      el.classList.add('sleeping');
      el.innerHTML = `<h2>😴 Mode tidur aktif</h2>
        <p class="hint">${skipped.length} alarm dilewati sampai <b>${whenText(S.sleepUntil)}</b>. Alarm bangun tetap bunyi. Selamat tidur${S.name ? ', ' + esc(S.name) : ''}! 🌙</p>
        <button class="btn big s-cancel">↩️ Batalkan mode tidur</button>`;
      el.querySelector('.s-cancel').onclick = () => { S.sleepUntil = 0; save(); renderAll(); toast('Mode tidur dibatalkan, semua alarm aktif lagi'); };
      return;
    }
    el.classList.remove('sleeping');
    // pilihan: alarm-alarm berikutnya dalam 36 jam
    const opts = S.alarms.filter(a => a.on).map(a => ({ a, t: nextOcc(a, Math.max(now, a.skipUntil || 0)) }))
      .filter(o => o.t && o.t - now < 36 * 3600e3).sort((x, y) => x.t - y.t);
    if (!opts.length) { el.innerHTML = '<h2>😴 Tidur lebih awal?</h2><p class="hint">Tidak ada alarm aktif dalam 36 jam ke depan.</p>'; return; }
    const morning = opts.find(o => { const h = new Date(o.t).getHours(); return h >= 3 && h <= 10; }) || opts[opts.length - 1];
    el.innerHTML = `<h2>😴 Tidur lebih awal?</h2>
      <p class="hint">Lewati semua alarm sampai alarm bangunmu, biar tidak kebangun karena alarm lain.</p>
      <label class="lbl">Bangunkan aku dengan alarm</label>
      <select class="s-wake">${opts.map(o => `<option value="${o.t}"${o === morning ? ' selected' : ''}>${whenText(o.t)} — ${esc(o.a.label)}</option>`).join('')}</select>
      <button class="btn primary big s-go">😴 Aku tidur sekarang</button>`;
    el.querySelector('.s-go').onclick = () => {
      S.sleepUntil = +el.querySelector('.s-wake').value;
      (S.sleeps = S.sleeps || []).push({ start: Date.now(), until: S.sleepUntil }); S.sleeps = S.sleeps.slice(-400);
      save(); renderAll();
      toast(`Selamat tidur! 🌙 Alarm berikutnya: ${whenText(S.sleepUntil)}`);
    };
  });
}
setInterval(() => { if (S.sleepUntil && S.sleepUntil <= Date.now()) renderAll(); }, 30000);
S.alarms.forEach(a => { if (!a.sound) a.sound = 'default'; if (a.volume === undefined) a.volume = null; });

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
  ctx: null, master: null, boost: null, nodes: [], timers: [], bufs: {},
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
    return this.ctx;
  },
  setVolume(v) { if (this.boost) this.boost.gain.setTargetAtTime(v / 100, this.ctx.currentTime, 0.05); },
  async loadCustom(key = 'default') {
    let blob = await idbGet('custom-' + key).catch(() => null);
    if (!blob && key === 'default') blob = await idbGet('custom').catch(() => null); // data lama
    if (!blob) return null;
    const ctx = this.ensure();
    this.bufs[key] = await ctx.decodeAudioData(await blob.arrayBuffer()); // audio & video (mp4, webm, ...)
    return this.bufs[key];
  },
  osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; this.nodes.push(o); return o; },
  async play(kind = S.sound, volume = S.volume, key = 'default') {
    this.stop();
    const ctx = this.ensure();
    this.boost.gain.value = volume / 100;
    const out = ctx.createGain(); out.gain.value = 1; out.connect(this.boost); this.nodes.push(out);
    if (kind === 'custom') {
      const buf = this.bufs[key] || await this.loadCustom(key).catch(() => null);
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
  if (b.dataset.tab === 'stats') { renderStats(); if (typeof renderProgressExtra === 'function') renderProgressExtra(); }
  if (b.dataset.tab === 'health' && typeof renderHealth === 'function') renderHealth();
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
  if (!S.log[k]) S.log[k] = { answers: {}, meals: {}, snacks: [], saved: false };
  const e = S.log[k];
  if (!e.snacks) { e.snacks = e.snackNote ? [{ id: uid(), name: e.snackNote, qty: 1, kcal: 0, t: e.savedAt || Date.now() }] : []; }
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
  const QS = QUOTES.concat(S.quotes || []);
  $('#quote').textContent = '“' + QS[(now.getDate() * 7 + now.getMonth()) % QS.length] + '”';
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
  if (typeof renderSnacks === 'function') renderSnacks(e);
  $('#honestPledge').checked = !!e.saved;
  showScore(e);
  renderStreak();
  if (typeof renderHeader === 'function') renderHeader();
}

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
  if (typeof onDaySaved === 'function') onDaySaved(e);
};

function renderStreak() {
  let d = new Date(), n = 0;
  if (!(S.log[dkey(d)] && S.log[dkey(d)].saved)) d.setDate(d.getDate() - 1);
  while (true) {
    const e = S.log[dkey(d)];
    if (e && e.saved && e.score >= 80) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  renderStreak.n = n;
  $('#streak').textContent = '🔥 ' + n;
}

// ---------- PENGINGAT ----------
function skipInfo(a) {
  if (!a.on) return '';
  const now = Date.now();
  const raw = nextOcc(a, now);
  const real = effectiveNext(a);
  if (!raw || raw === real) return '';
  const why = raw < (S.sleepUntil || 0) ? '😴 Mode tidur' : '⏭️ Dilewati sekali';
  return `<div class="skip">${why} · bunyi lagi ${real ? whenText(real) : '-'}</div>`;
}
let openAlarm = null;
function renderAlarms() {
  const ul = $('#alarmList'); ul.innerHTML = '';
  S.alarms.sort((a, b) => a.time.localeCompare(b.time)).forEach(a => {
    const li = document.createElement('li');
    const days = a.days.length === 7 ? 'Setiap hari' : a.days.length ? a.days.slice().sort().map(d => DAYS[d]).join(', ') : 'Sekali';
    const snd = effSound(a) === 'custom' ? '🎵 ' + (a.sound === 'custom' ? (a.customName || 'Dari HP') : (S.customName || 'Dari HP')) : SOUND_NAMES[effSound(a)];
    li.innerHTML = `<div class="t">${a.time}</div><div class="info"><div>${esc(a.label)}</div><div class="d">${days}</div>
      <div class="snd">${esc(snd)} · 🔊 ${volText(effVol(a))}${a.sound === 'default' && !a.volume ? ' (umum)' : ''}</div>${skipInfo(a)}</div>`;
    const sk = document.createElement('button'); sk.className = 'edit'; sk.title = 'Lewati sekali';
    const skipping = (a.skipUntil || 0) > Date.now();
    sk.textContent = skipping ? '↩️' : '⏭️';
    sk.classList.toggle('hidden', !a.on);
    sk.onclick = () => {
      if (skipping) { a.skipUntil = 0; save(); renderAll(); toast('Alarm ' + a.time + ' tidak dilewati lagi'); return; }
      const t = effectiveNext(a); if (!t) return;
      a.skipUntil = t; save(); renderAll();
      const after = effectiveNext(a);
      toast(`Alarm ${whenText(t)} dilewati ⏭️` + (after ? ` · bunyi lagi ${whenText(after)}` : ''));
    };
    const ed = document.createElement('button'); ed.className = 'edit'; ed.textContent = openAlarm === a.id ? '✖️' : '✏️';
    ed.onclick = () => { openAlarm = openAlarm === a.id ? null : a.id; renderAlarms(); };
    const sw = document.createElement('button'); sw.className = 'switch' + (a.on ? ' on' : '');
    sw.onclick = () => { a.on = !a.on; save(); renderAlarms(); };
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '🗑️';
    del.onclick = () => { if (confirm('Hapus pengingat ini?')) { S.alarms = S.alarms.filter(x => x !== a); save(); renderAlarms(); } };
    const ctl = document.createElement('div'); ctl.className = 'ctl'; ctl.append(ed, sk, sw, del);
    li.append(ctl); ul.append(li);
    if (openAlarm === a.id) ul.append(alarmEditor(a));
  });
  if (NATIVE) setTimeout(renderNative, 50);
}

function alarmEditor(a) {
  const li = document.createElement('li'); li.className = 'editor';
  li.innerHTML = `<label class="lbl">Jam</label><input type="time" class="e-time" value="${a.time}">
    <label class="lbl">Tulisan pengingat</label><input type="text" class="e-label" value="${esc(a.label)}">
    <label class="lbl">Hari</label><div class="days e-days"></div>`;
  const q = sel => li.querySelector(sel);
  q('.e-time').onchange = ev => { if (ev.target.value) { a.time = ev.target.value; save(); renderAlarms(); } };
  q('.e-label').onchange = ev => { a.label = ev.target.value.trim() || 'Pengingat!'; save(); renderAlarms(); };
  const drawDays = () => {
    const w = q('.e-days'); w.innerHTML = '';
    [1, 2, 3, 4, 5, 6, 0].forEach(d => {
      const b = document.createElement('button'); b.textContent = DAYS[d]; b.className = a.days.includes(d) ? 'on' : '';
      b.onclick = () => { a.days = a.days.includes(d) ? a.days.filter(x => x !== d) : a.days.concat(d); save(); drawDays(); };
      w.append(b);
    });
  };
  drawDays();
  li.append(soundEditor(a, a.id, true, () => {
    // perbarui ringkasan di baris alarm tanpa menutup editor
    const row = li.previousElementSibling && li.previousElementSibling.querySelector('.snd');
    if (row) {
      const snd = effSound(a) === 'custom' ? '🎵 ' + (a.sound === 'custom' ? (a.customName || 'Dari HP') : (S.customName || 'Dari HP')) : SOUND_NAMES[effSound(a)];
      row.textContent = `${snd} · 🔊 ${volText(effVol(a))}${a.sound === 'default' && !a.volume ? ' (umum)' : ''}`;
    }
  }));
  if (typeof wallEditor === 'function') {
    const h = document.createElement('label'); h.className = 'lbl'; h.textContent = '🖼️ Wallpaper layar alarm'; li.append(h);
    li.append(wallEditor(a, a.id, true, () => {}));
  }
  const gr = document.createElement('label'); gr.className = 'honest';
  gr.innerHTML = `<input type="checkbox" ${a.gradual ? 'checked' : ''}> 📈 Volume naik bertahap (30 detik pertama)`;
  gr.querySelector('input').onchange = ev => { a.gradual = ev.target.checked; save(); };
  li.append(gr);
  const dup = document.createElement('button'); dup.className = 'btn'; dup.style.width = '100%'; dup.style.marginTop = '8px'; dup.textContent = '📄 Duplikat alarm ini';
  dup.onclick = () => {
    const c = JSON.parse(JSON.stringify(a)); c.id = uid(); c.label = a.label + ' (salinan)'; c.skipUntil = 0;
    if (c.sound === 'custom') { c.sound = 'default'; c.customName = ''; }
    if (c.wall === 'custom') { c.wall = 'default'; c.wallName = ''; }
    S.alarms.push(c); openAlarm = c.id; save(); renderAlarms(); toast('Alarm diduplikat (suara/wallpaper khusus diatur ulang)');
  };
  li.append(dup);
  const done = document.createElement('button'); done.className = 'btn primary big'; done.textContent = '✔️ Selesai';
  done.onclick = () => { openAlarm = null; renderAlarms(); };
  li.append(done);
  return li;
}

/** Editor suara + volume. t = S (umum) atau objek alarm; key = 'default' atau id alarm. */
function soundEditor(t, key, isAlarm, onChange = () => {}) {
  const w = document.createElement('div'); w.className = 'sndedit';
  const opts = (isAlarm ? [['default', '⚙️ Ikut pengaturan umum']] : []).concat([
    ['siren', '🚨 Sirine'], ['beep', '⏰ Beep klasik'], ['rooster', '🐓 Kokok (naik-turun)'], ['custom', '🎵 Lagu / video dari HP']]);
  w.innerHTML = `<label class="lbl">Suara</label>
    <select class="s-sel">${opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
    <div class="s-custom hidden"><div class="hint s-name"></div>
      <button class="btn s-pick">📂 Pilih lagu / video dari HP</button>
      <input type="file" class="s-file" accept="audio/*,video/*" hidden></div>
    ${isAlarm ? '<label class="honest"><input type="checkbox" class="s-own"> Volume khusus untuk alarm ini</label>' : ''}
    <div class="s-volwrap"><label class="lbl">Volume</label>
      <div class="vol"><input type="range" class="s-vol" min="0" max="100" step="1"><span class="s-vlabel"></span></div>
      <button class="btn s-max">🔥 MAKS — paling keras (3000%)</button></div>
    <div class="row"><button class="btn s-test">▶️ Tes suara</button><button class="btn s-stop">⏹️ Stop</button></div>`;
  const q = sel => w.querySelector(sel);
  const sel = q('.s-sel'), vol = q('.s-vol'), own = q('.s-own');
  sel.value = t.sound || (isAlarm ? 'default' : 'siren');
  const refresh = () => {
    q('.s-custom').classList.toggle('hidden', sel.value !== 'custom');
    q('.s-name').textContent = t.customName ? '✅ Dipilih: ' + t.customName : 'Belum ada lagu/video dipilih.';
    const v = isAlarm ? effVol(t) : t.volume;
    if (own) { own.checked = !!t.volume; q('.s-volwrap').classList.toggle('hidden', !t.volume); }
    vol.value = volToPos(v);
    const lb = q('.s-vlabel'); lb.textContent = volText(v); lb.style.color = v > 100 ? 'var(--accent)' : '';
    onChange();
  };
  const pick = () => {
    if (NATIVE) openPicker(key, name => { t.customName = name; t.sound = 'custom'; sel.value = 'custom'; save(); refresh(); });
    else q('.s-file').click();
  };
  sel.onchange = () => { t.sound = sel.value; save(); refresh(); if (sel.value === 'custom' && !t.customName) pick(); };
  vol.oninput = () => { t.volume = posToVol(+vol.value); save(); refresh(); Sound.setVolume(t.volume); };
  q('.s-max').onclick = () => { t.volume = MAX_VOL; save(); refresh(); Sound.setVolume(MAX_VOL); toast('Volume MAKSIMAL 🔥'); };
  if (own) own.onchange = () => { t.volume = own.checked ? S.volume : null; save(); refresh(); };
  q('.s-pick').onclick = pick;
  q('.s-file').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      await idbPut('custom-' + key, f);
      delete Sound.bufs[key];
      await Sound.loadCustom(key);
      t.customName = f.name; save(); refresh(); toast('Suara tersimpan 🎵');
    } catch (e) { toast('File ini tidak bisa diputar, pilih yang lain'); }
  };
  q('.s-test').onclick = () => {
    const a = isAlarm ? t : null;
    if (NATIVE) { syncNative(); NATIVE.testSoundFor(isAlarm ? t.id : ''); return; }
    Sound.play(effSound(a), effVol(a), effKey(a)); setTimeout(() => Sound.stop(), 6000);
  };
  q('.s-stop').onclick = () => { if (NATIVE) NATIVE.stopSound(); else Sound.stop(); };
  refresh();
  return w;
}

// ---------- Pemilih lagu/video dari HP (APK): cari otomatis, tanpa cari folder ----------
let pickState = null, mediaCache = null, previewing = null;
function fmtDur(ms) { if (!ms) return ''; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; }
const PICK_MODES = {
  sound: { title: 'Pilih lagu / video dari HP', kinds: ['audio', 'video'], tabs: [['all', 'Semua'], ['audio', '🎵 Audio'], ['video', '🎬 Video']] },
  wall: { title: 'Pilih foto / video untuk wallpaper', kinds: ['image', 'video'], tabs: [['all', 'Semua'], ['image', '🖼️ Foto'], ['video', '🎬 Video']] },
};
function openPicker(key, onDone, mode = 'sound') {
  pickState = { key, onDone, kind: 'all', busy: false, mode };
  const M = PICK_MODES[mode];
  $('#pickTitle').textContent = M.title;
  const seg = $('#pickSeg'); seg.innerHTML = '';
  M.tabs.forEach(([k, n]) => {
    const b = document.createElement('button'); b.textContent = n; b.className = k === 'all' ? 'on' : '';
    b.onclick = () => { seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); pickState.kind = k; renderPicker(); };
    seg.append(b);
  });
  $('#picker').classList.remove('hidden');
  $('#pickSearch').value = '';
  if (!NATIVE.hasMediaPermission()) {
    $('#pickInfo').textContent = 'Izinkan akses foto, lagu & video sekali saja, nanti semua file di HP langsung muncul di sini.';
    $('#pickList').innerHTML = '';
    $('#pickPerm').classList.remove('hidden');
    return;
  }
  $('#pickPerm').classList.add('hidden');
  loadMedia();
}
function loadMedia() {
  $('#pickInfo').textContent = '🔎 Mencari semua file di HP...';
  setTimeout(() => {
    try { mediaCache = JSON.parse(NATIVE.listMedia()).sort((a, b) => b.added - a.added); } catch (e) { mediaCache = []; }
    renderPicker();
  }, 30);
}
function closePicker() {
  if (NATIVE) NATIVE.stopPreview();
  closePreview(); dlInfo('');
  previewing = null; pickState = null;
  $('#picker').classList.add('hidden');
}
function renderPicker() {
  if (!pickState || !mediaCache) return;
  const q = $('#pickSearch').value.trim().toLowerCase();
  const M = PICK_MODES[pickState.mode];
  const pool = mediaCache.filter(m => M.kinds.includes(m.kind));
  const list = pool.filter(m => (pickState.kind === 'all' || m.kind === pickState.kind)
    && (!q || (m.name + ' ' + m.folder).toLowerCase().includes(q)));
  const cnt = k => pool.filter(m => m.kind === k).length;
  const names = { audio: 'audio', video: 'video', image: 'foto' };
  $('#pickInfo').textContent = pool.length
    ? `Ditemukan ${M.kinds.map(k => cnt(k) + ' ' + names[k]).join(' & ')}. Tampil ${Math.min(list.length, 300)} dari ${list.length}${list.length > 300 ? ' — ketik untuk mencari' : ''}. 👆 Ketuk nama/gambar untuk lihat atau dengar dulu.`
    : 'Tidak ada file yang cocok di HP ini.';
  const ul = $('#pickList'); ul.innerHTML = '';
  list.slice(0, 300).forEach(m => {
    const li = document.createElement('li');
    const ic = m.kind === 'video' ? '🎬' : m.kind === 'image' ? '🖼️' : '🎵';
    li.innerHTML = (m.kind === 'audio' ? `<span class="pk-ic pk-open">${ic}</span>`
        : `<img class="pk-thumb pk-open" loading="lazy" src="${thumbUrl(m.uri)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pk-ic',textContent:'${ic}'}))">`)
      + `<div class="pk-info pk-open"><div class="pk-name">${esc(m.name)}</div><div class="d">${m.kind === 'video' ? '🎬 ' : ''}${esc(m.folder || '')}${m.duration ? ' · ' + fmtDur(m.duration) : ''}</div></div>`;
    li.querySelectorAll('.pk-open').forEach(el => el.onclick = () => openPreview(m));
    const play = document.createElement('button'); play.className = 'btn small' + (pickState.mode === 'wall' ? ' hidden' : ''); play.textContent = previewing === m.uri ? '⏹' : '▶';
    play.onclick = () => {
      if (previewing === m.uri) { NATIVE.stopPreview(); previewing = null; } else { NATIVE.previewMedia(m.uri); previewing = m.uri; }
      renderPicker();
    };
    const use = document.createElement('button'); use.className = 'btn small primary'; use.textContent = 'Pilih';
    use.onclick = () => chooseMedia(m);
    li.append(play, use); ul.append(li);
  });
}
function chooseMedia(m) {
  if (!pickState || pickState.busy) return;
  if (!PICK_MODES[pickState.mode].kinds.includes(m.kind)) return toast(pickState.mode === 'wall' ? 'Audio tidak bisa jadi wallpaper, pilih foto/video' : 'Foto tidak bisa jadi suara, pilih audio/video');
  closePreview();
  NATIVE.stopPreview(); previewing = null; pickState.busy = true;
  if (pickState.mode === 'wall') {
    $('#pickInfo').textContent = '💾 Menyimpan wallpaper...';
    NATIVE.useWall(pickState.key, m.uri, m.name, m.kind);
    return;
  }
  $('#pickInfo').textContent = m.kind === 'video' ? '🎬 Mengubah video jadi suara alarm... tunggu sebentar' : '💾 Menyimpan suara...';
  NATIVE.useMedia(pickState.key, m.uri, m.name, m.kind === 'video');
}

// ---------- pratinjau foto / video / suara ----------
const b64url = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const thumbUrl = uri => '/thumb/' + b64url(uri);
const mediaUrl = uri => '/media/' + b64url(uri);
let previewItem = null;
function openPreview(m) {
  if (NATIVE) NATIVE.stopPreview();
  previewing = null;
  previewItem = m;
  $('#pvName').textContent = m.name;
  const body = $('#pvBody'), src = mediaUrl(m.uri);
  if (m.kind === 'image') body.innerHTML = `<img src="${src}" alt="">`;
  else if (m.kind === 'video') body.innerHTML = `<video src="${src}" controls autoplay playsinline loop></video>`;
  else body.innerHTML = `<div class="pvaudio"><div>🎵</div><audio src="${src}" controls autoplay></audio></div>`;
  const ok = pickState && PICK_MODES[pickState.mode].kinds.includes(m.kind);
  $('#pvUse').classList.toggle('hidden', !ok);
  $('#pvUse').textContent = pickState && pickState.mode === 'wall' ? '🖼️ Pakai jadi wallpaper' : '🎵 Pakai jadi suara alarm';
  $('#preview').classList.remove('hidden');
}
function closePreview() {
  const body = $('#pvBody');
  body.querySelectorAll('video,audio').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
  body.innerHTML = '';
  $('#preview').classList.add('hidden');
  previewItem = null;
}
$('#pvClose').onclick = closePreview;
$('#pvUse').onclick = () => { if (previewItem) chooseMedia(previewItem); };

// ---------- download dari link (file langsung) ----------
const BLOCKED_HOSTS = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|tiktok\.com|tiktokv\.com|instagram\.com|facebook\.com|fb\.watch|spotify\.com)$/i;
function dlInfo(msg) { const el = $('#dlInfo'); el.classList.toggle('hidden', !msg); el.innerHTML = msg || ''; }
$('#pickDl').onclick = () => {
  const url = $('#pickUrl').value.trim();
  if (!url) return toast('Tempel link filenya dulu');
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return toast('Link tidak valid'); }
  if (BLOCKED_HOSTS.test(host)) {
    return dlInfo('⚠️ <b>Link YouTube / TikTok / Instagram tidak bisa di-download di aplikasi ini.</b> Aturan platform itu melarang videonya diunduh tanpa izin. ' +
      'Pakai link <b>file langsung</b> (yang berakhiran .mp3, .mp4, .jpg, dll.), atau file yang sudah ada di HP-mu.');
  }
  if (!NATIVE || !NATIVE.downloadUrl) return toast('Download dari link hanya ada di APK');
  dlInfo('⬇️ Mengunduh...');
  $('#pickDl').disabled = true;
  NATIVE.downloadUrl(url);
};
window.onNativeDownloadProgress = (done, total) => {
  dlInfo(`⬇️ Mengunduh... ${(done / 1048576).toFixed(1)} MB${total > 0 ? ' dari ' + (total / 1048576).toFixed(1) + ' MB (' + Math.round(done / total * 100) + '%)' : ''}`);
};
window.onNativeDownloaded = json => {
  $('#pickDl').disabled = false;
  let r; try { r = JSON.parse(json); } catch (e) { r = { ok: false, error: 'Gagal' }; }
  if (!r.ok) return dlInfo('❌ ' + esc(r.error || 'Gagal mengunduh'));
  dlInfo(`✅ Berhasil: <b>${esc(r.name)}</b> (${(r.size / 1048576).toFixed(1)} MB). Lihat pratinjaunya lalu tekan "Pakai".`);
  $('#pickUrl').value = '';
  const item = { uri: r.uri, name: r.name, kind: r.kind, folder: '🔗 Dari link', duration: 0, size: r.size, added: Date.now() / 1000 + 1e9 };
  mediaCache = [item].concat(mediaCache || []);
  renderPicker();
  openPreview(item);
};
window.onNativeMediaPermission = granted => {
  if (!pickState) return;
  if (granted) { $('#pickPerm').classList.add('hidden'); loadMedia(); }
  else $('#pickInfo').textContent = 'Izin ditolak. Buka Pengaturan → Aplikasi → Disiplin → Izin, lalu izinkan Musik & Video.';
};
window.onNativeMediaUsed = (key, ok, name, converted) => {
  if (!pickState || pickState.key !== key) return;
  pickState.busy = false;
  if (!ok) { toast('File ini tidak bisa diputar, pilih yang lain'); renderPicker(); return; }
  const cb = pickState.onDone; closePicker(); cb(name);
  toast(converted ? 'Video berhasil diubah jadi suara alarm 🎵' : 'Suara alarm tersimpan 🎵');
};
window.onNativeWallUsed = (key, ok, name, kind) => {
  if (!pickState || pickState.key !== key) return;
  pickState.busy = false;
  if (!ok) { toast('File ini tidak bisa dipakai, pilih yang lain'); renderPicker(); return; }
  const cb = pickState.onDone; closePicker(); cb(name, kind);
  toast('Wallpaper alarm tersimpan 🖼️');
};
$('#pickClose').onclick = closePicker;
$('#pickPerm').onclick = () => NATIVE.requestMediaPermission();
$('#pickSearch').oninput = renderPicker;

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

// suara & volume umum
$('#defaultSound').append(soundEditor(S, 'default', false, () => { if (typeof renderAlarms === 'function' && !openAlarm) setTimeout(renderAlarmsSoft, 0); }));
function renderAlarmsSoft() { if (!openAlarm) renderAlarms(); }
$('#mathLock').checked = S.mathLock; $('#mathLock').onchange = ev => { S.mathLock = ev.target.checked; save(); };
$('#vibrate').checked = S.vibrate; $('#vibrate').onchange = ev => { S.vibrate = ev.target.checked; save(); };
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
  renderAlarms(); renderNative(); renderToday(); renderSleep();
  if (typeof onResumeExtra === 'function') onResumeExtra();
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
    const occ = new Date(now); occ.setSeconds(0, 0);
    if (occ.getTime() <= (a.skipUntil || 0) || occ.getTime() < (S.sleepUntil || 0)) continue; // dilewati
    if (a.days.length && !a.days.includes(now.getDay())) continue;
    const key = `${dk} ${a.time} ${a.id}`;
    if (fired.has(key)) continue;
    fired.add(key);
    localStorage.setItem('disiplin-fired', JSON.stringify([...fired].slice(-60)));
    if (!a.days.length) { a.on = false; save(); renderAlarms(); } // sekali saja
    return ring(a.time, a.label, false, a);
  }
  const due = snoozes.find(s => s.at <= Date.now());
  if (due) { snoozes = snoozes.filter(s => s !== due); ring(hm, due.label, true, due.alarm); }
}
setInterval(checkAlarms, 1000);

const PHRASES = ['AKU BANGUN SEKARANG', 'AKU DISIPLIN HARI INI', 'TIDAK ADA SNACK HARI INI', 'AKU PASTI BISA BERUBAH', 'BANGUN DAN GERAK'];
let typeAnswer = '';
const chalMath = () => ['math', 'both'].includes(S.challenge || (S.mathLock ? 'math' : 'none'));
const chalType = () => ['type', 'both'].includes(S.challenge || 'math');
function ring(time, label, wasSnoozed = false, alarm = null) {
  ringing = { time, label, wasSnoozed, alarm };
  $('#ringTime').textContent = time;
  $('#ringLabel').textContent = label;
  $('#snooze').classList.toggle('hidden', wasSnoozed);
  if (typeof showRingWall === 'function') showRingWall(alarm);
  typeAnswer = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  $('#typeQ').textContent = typeAnswer; $('#typeA').value = '';
  $('#typeBox').classList.toggle('hidden', !chalType());
  if (chalMath()) {
    const a = 12 + Math.floor(Math.random() * 40), b = 3 + Math.floor(Math.random() * 9), c = Math.floor(Math.random() * 50);
    mathAnswer = a * b + c;
    $('#mathQ').textContent = `${a} × ${b} + ${c} = ?`;
    $('#mathA').value = '';
  }
  $('#mathBox').classList.toggle('hidden', !chalMath());
  $('#ring').classList.remove('hidden');
  Sound.play(effSound(alarm), effVol(alarm), effKey(alarm));
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
  const v = $('#ringVid'); v.pause(); v.removeAttribute('src');
}
$('#dismiss').onclick = () => {
  if (chalMath() && +$('#mathA').value !== mathAnswer) { toast('Jawaban salah! Ayo melek dulu 👀'); $('#mathA').value = ''; return; }
  if (chalType() && $('#typeA').value.trim().toUpperCase().replace(/\s+/g, ' ') !== typeAnswer) { toast('Kalimatnya belum sama persis ✍️'); return; }
  const r = ringing;
  stopRing(); toast('Bagus! Langsung gerak, jangan balik ke kasur! 💪');
  if (typeof logWake === 'function' && r) logWake({ t: Date.now(), time: r.time, label: r.label });
};
$('#snooze').onclick = () => {
  if (!ringing) return;
  snoozes.push({ at: Date.now() + 5 * 60 * 1000, label: ringing.label + ' (tunda)', alarm: ringing.alarm });
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
  const snackDays = entries.filter(x => x.e.meals.noSnack === false || (x.e.snacks && x.e.snacks.length));
  if (snackDays.length) {
    const top = {};
    let kcal = 0;
    snackDays.forEach(x => (x.e.snacks || []).forEach(sn => {
      const k = sn.name.trim().toLowerCase(); top[k] = top[k] || { name: sn.name, qty: 0 };
      top[k].qty += sn.qty || 1; kcal += (sn.kcal || 0) * (sn.qty || 1);
    }));
    const topList = Object.values(top).sort((a, b) => b.qty - a.qty).slice(0, 5);
    tbl.innerHTML += `<tr><th colspan="4">🍪 Ngemil di ${snackDays.length} hari${kcal ? ` · ±${kcal} kkal` : ''}</th></tr>`
      + (topList.length ? `<tr><td colspan="4"><b>Paling sering:</b> ${topList.map(t => `${esc(t.name)} (${t.qty}×)`).join(', ')}</td></tr>` : '')
      + snackDays.map(x => `<tr><td colspan="4">${x.d.getDate()} ${MONTHS[x.d.getMonth()]} — ${
        (x.e.snacks && x.e.snacks.length) ? x.e.snacks.map(sn => esc(sn.name) + (sn.qty > 1 ? ' ×' + sn.qty : '')).join(', ') : esc(x.e.snackNote || '(tidak dicatat)')}</td></tr>`).join('');
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
renderToday(); renderAlarms(); renderNewDays(); renderTaskEdit(); renderNotifBtn(); renderWake(); renderNative(); renderSleep();
