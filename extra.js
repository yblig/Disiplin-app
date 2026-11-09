/* Disiplin — fitur tambahan: tema, snack, wallpaper alarm, sehat (berat, air, mood, tidur, timer),
   level & lencana, kalender, template alarm, kutipan, laporan CSV, berbagi file dari aplikasi lain. */
'use strict';

// ======================================================================
// TEMA
// ======================================================================
const THEMES = [
  ['api', '🔥 Api', '#ef4444', '#f97316'], ['galaxy', '🌌 Galaxy', '#7c3aed', '#db2777'], ['laut', '🌊 Laut', '#0284c7', '#06b6d4'],
  ['hutan', '🌿 Hutan', '#059669', '#84cc16'], ['senja', '🌅 Senja', '#ea580c', '#eab308'], ['malam', '🌃 Malam', '#4f46e5', '#0ea5e9'],
];
function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = S.theme || 'api';
  root.dataset.mode = S.mode || 'auto';
  const th = THEMES.find(t => t[0] === root.dataset.theme) || THEMES[0];
  document.querySelector('meta[name=theme-color]').setAttribute('content', th[2]);
  if (NATIVE && NATIVE.setStatusBarColor) try { NATIVE.setStatusBarColor(th[2]); } catch (e) {}
}
function renderThemes() {
  const w = $('#themes'); w.innerHTML = '';
  THEMES.forEach(([id, name, c1, c2]) => {
    const b = document.createElement('button');
    b.textContent = name; b.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    b.className = (S.theme || 'api') === id ? 'on' : '';
    b.onclick = () => { S.theme = id; save(); applyTheme(); renderThemes(); };
    w.append(b);
  });
  document.querySelectorAll('#modeSeg button').forEach(b => {
    b.classList.toggle('on', (S.mode || 'auto') === b.dataset.m);
    b.onclick = () => { S.mode = b.dataset.m; save(); applyTheme(); renderThemes(); drawAllCharts(); };
  });
}
function drawAllCharts() {
  if ($('#tab-stats').classList.contains('active')) renderStats();
  if ($('#tab-health').classList.contains('active')) renderHealth();
}

// ======================================================================
// HEADER: cincin progres, hari ke-N, level
// ======================================================================
function startDate() {
  if (!S.startDate) {
    const keys = Object.keys(S.log).sort();
    S.startDate = keys[0] || today();
    save();
  }
  return S.startDate;
}
function renderHeader() {
  const e = dayEntry(today());
  const vals = S.tasks.map(t => e.answers[t.id] && e.answers[t.id].v).concat(MEALS.map(m => e.meals[m.id]));
  const pct = Math.round(vals.filter(v => v === true).length / Math.max(1, vals.length) * 100);
  $('#ringFg').style.strokeDashoffset = 169.6 * (1 - pct / 100);
  $('#ringPct').textContent = pct + '%';
  const sd = new Date(startDate() + 'T00:00:00');
  const n = Math.max(1, Math.floor((new Date().setHours(0, 0, 0, 0) - sd) / 864e5) + 1);
  $('#dayChip').textContent = `📅 Hari ke-${n}`;
  $('#lvChip').textContent = `⭐ Lv ${levelInfo().level}`;
}

// ======================================================================
// SNACK: catat banyak snack, jumlah, perkiraan kalori
// ======================================================================
const SNACK_PRESETS = [
  ['🍟', 'Keripik', 150], ['🥟', 'Gorengan', 120], ['🍫', 'Cokelat', 200], ['🧋', 'Minuman manis', 180], ['🍪', 'Biskuit', 100],
  ['🍬', 'Permen', 25], ['🍜', 'Mie instan', 380], ['🍞', 'Roti manis', 250], ['🍦', 'Es krim', 200], ['🍩', 'Donat', 250],
  ['🥤', 'Soda', 140], ['🍢', 'Cilok/Siomay', 200],
];
function renderSnacks(e) {
  const box = $('#snackBox'); if (!box) return;
  const total = e.snacks.reduce((s, x) => s + (x.kcal || 0) * (x.qty || 1), 0);
  box.innerHTML = `<label class="lbl">🍪 Catat semua snack yang kamu makan hari ini (jujur)</label>
    <ul class="snacks"></ul>
    ${total ? `<div class="snacktotal">Perkiraan total: ±${total} kkal dari snack</div>` : ''}
    <div class="presets"></div>
    <div class="snackadd"><input type="text" class="sa-name" placeholder="Snack lain..."><input type="number" class="sa-kcal" placeholder="kkal" inputmode="numeric"><button class="btn primary sa-add">➕</button></div>`;
  const ul = box.querySelector('.snacks');
  if (!e.snacks.length) ul.innerHTML = `<li><span class="sn">${e.meals.noSnack === true ? '🎉 Tidak ada snack. Hebat!' : 'Belum ada snack dicatat.'}</span></li>`;
  e.snacks.forEach(sn => {
    const li = document.createElement('li');
    const t = new Date(sn.t);
    li.innerHTML = `<span class="sn">${esc(sn.name)}<br><span class="sk">${pad(t.getHours())}:${pad(t.getMinutes())}${sn.kcal ? ' · ±' + sn.kcal * sn.qty + ' kkal' : ''}</span></span>
      <span class="qty"><button class="m">−</button><b>${sn.qty}</b><button class="p">+</button></span><button class="del">🗑️</button>`;
    li.querySelector('.m').onclick = () => { if (sn.qty > 1) sn.qty--; else e.snacks = e.snacks.filter(x => x !== sn); changed(); };
    li.querySelector('.p').onclick = () => { sn.qty++; changed(); };
    li.querySelector('.del').onclick = () => { e.snacks = e.snacks.filter(x => x !== sn); changed(); };
    ul.append(li);
  });
  const pr = box.querySelector('.presets');
  SNACK_PRESETS.forEach(([ic, name, kcal]) => {
    const b = document.createElement('button'); b.textContent = `${ic} ${name}`;
    b.onclick = () => add(`${ic} ${name}`, kcal);
    pr.append(b);
  });
  box.querySelector('.sa-add').onclick = () => {
    const name = box.querySelector('.sa-name').value.trim();
    if (!name) return toast('Tulis nama snacknya');
    add(name, +box.querySelector('.sa-kcal').value || 0);
  };
  function add(name, kcal) {
    const ex = e.snacks.find(x => x.name === name);
    if (ex) ex.qty++; else e.snacks.push({ id: uid(), name, qty: 1, kcal, t: Date.now() });
    if (e.meals.noSnack !== false) { e.meals.noSnack = false; toast('Dicatat. Jawaban "tidak ngemil" otomatis jadi Tidak — terima kasih sudah jujur 🙏'); }
    changed();
  }
  function changed() { e.saved = false; save(); renderToday(); }
}

// ======================================================================
// KONFETI
// ======================================================================
function confetti() {
  const cv = $('#confetti'); cv.classList.remove('hidden');
  const W = cv.width = innerWidth, H = cv.height = innerHeight, g = cv.getContext('2d');
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  const parts = Array.from({ length: 140 }, () => ({ x: W / 2, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4,
    r: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6 }));
  let f = 0;
  (function step() {
    g.clearRect(0, 0, W, H);
    parts.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.a += .2; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore(); });
    if (++f < 150) requestAnimationFrame(step); else cv.classList.add('hidden');
  })();
}
let prevBadges = null;
function onDaySaved(e) {
  if (e.score >= 80) confetti();
  checkNewBadges();
  renderHeader();
}

// ======================================================================
// LEVEL, XP, LENCANA
// ======================================================================
const LEVEL_TITLES = ['Pemula', 'Mulai Bangkit', 'Pejuang Pagi', 'Anti Mager', 'Si Konsisten', 'Pemburu Target', 'Master Disiplin', 'Legenda Sehat', 'Raja Disiplin'];
function gatherStats() {
  const keys = Object.keys(S.log).sort();
  let best = 0, cur = 0, bestNS = 0, curNS = 0, prev = null, perfect = 0, saved = 0, waterDays = 0, journal = 0, scoreSum = 0;
  keys.forEach(k => {
    const e = S.log[k];
    const d = new Date(k + 'T00:00:00');
    const consecutive = prev && (d - prev) === 864e5;
    if (e.water >= (S.waterTarget || 8)) waterDays++;
    if ((e.jGrateful || '').trim() || (e.jTomorrow || '').trim()) journal++;
    if (!e.saved) { prev = null; cur = 0; curNS = 0; return; }
    saved++; scoreSum += e.score || 0;
    if (e.score === 100) perfect++;
    cur = e.score >= 80 ? (consecutive ? cur + 1 : 1) : 0; best = Math.max(best, cur);
    curNS = e.meals.noSnack === true ? (consecutive ? curNS + 1 : 1) : 0; bestNS = Math.max(bestNS, curNS);
    prev = d;
  });
  const early = (S.wakes || []).filter(w => { const d = new Date(w.t); return d.getHours() >= 3 && (d.getHours() * 60 + d.getMinutes()) <= 330; }).length;
  const ws = (S.weights || []).slice().sort((a, b) => a.d.localeCompare(b.d));
  const lost = ws.length > 1 ? ws[0].kg - Math.min(...ws.map(w => w.kg)) : 0;
  return { best, bestNS, perfect, saved, waterDays, journal, scoreSum, early, lost,
    workouts: (S.workouts || []).length, focus: (S.focus || []).length, weights: ws.length };
}
const BADGES = [
  ['first', '🌱', 'Langkah Pertama', 'Simpan checklist pertama', s => s.saved >= 1],
  ['s3', '🔥', 'Mulai Panas', '3 hari beruntun skor ≥80%', s => s.best >= 3],
  ['s7', '⚡', 'Seminggu Penuh', '7 hari beruntun skor ≥80%', s => s.best >= 7],
  ['s30', '🏆', 'Sebulan Juara', '30 hari beruntun skor ≥80%', s => s.best >= 30],
  ['perfect', '💯', 'Sempurna', 'Skor 100% sekali', s => s.perfect >= 1],
  ['perfect10', '👑', 'Raja Sempurna', 'Skor 100% sebanyak 10 kali', s => s.perfect >= 10],
  ['ns3', '🚫', 'Tahan Godaan', '3 hari beruntun tanpa snack', s => s.bestNS >= 3],
  ['ns7', '🥦', 'Seminggu Bersih', '7 hari beruntun tanpa snack', s => s.bestNS >= 7],
  ['ns30', '🦁', 'Anti Snack', '30 hari beruntun tanpa snack', s => s.bestNS >= 30],
  ['early5', '🌅', 'Pejuang Subuh', 'Matikan alarm sebelum 05:30 sebanyak 5 kali', s => s.early >= 5],
  ['water7', '💧', 'Si Paling Terhidrasi', 'Target minum air tercapai 7 hari', s => s.waterDays >= 7],
  ['wo10', '🏃', 'Rajin Gerak', 'Selesaikan 10 sesi olahraga', s => s.workouts >= 10],
  ['fo10', '📚', 'Otak Encer', 'Selesaikan 10 sesi fokus belajar', s => s.focus >= 10],
  ['w1', '⚖️', 'Turun 1 kg', 'Berat turun 1 kg dari catatan pertama', s => s.lost >= 1],
  ['w5', '🎯', 'Turun 5 kg', 'Berat turun 5 kg dari catatan pertama', s => s.lost >= 5],
  ['j7', '📝', 'Penulis Jujur', 'Isi jurnal 7 hari', s => s.journal >= 7],
  ['d30', '📅', 'Sebulan Jujur', 'Isi checklist 30 hari', s => s.saved >= 30],
];
function earnedBadges(st = gatherStats()) { return BADGES.filter(b => b[4](st)).map(b => b[0]); }
function levelInfo() {
  const st = gatherStats();
  const xp = st.scoreSum + st.waterDays * 20 + st.workouts * 15 + st.focus * 15 + st.weights * 10 + st.journal * 10 + earnedBadges(st).length * 50;
  let level = 1; while (xp >= 125 * level * (level + 1)) level++;
  const lo = 125 * (level - 1) * level, hi = 125 * level * (level + 1);
  return { xp, level, lo, hi, title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] };
}
function checkNewBadges() {
  const now = earnedBadges();
  if (prevBadges) now.filter(id => !prevBadges.includes(id)).forEach((id, i) => {
    const b = BADGES.find(x => x[0] === id);
    setTimeout(() => { toast(`🏅 Lencana baru: ${b[1]} ${b[2]}!`); confetti(); }, 1200 + i * 2800);
  });
  prevBadges = now;
}

function renderProgressExtra() {
  const L = levelInfo();
  $('#lvNum').textContent = L.level;
  $('#lvTitle').textContent = L.title;
  $('#lvXp').textContent = `${L.xp} XP · ${L.hi - L.xp} XP lagi ke Level ${L.level + 1}`;
  $('#lvBar').style.width = Math.round((L.xp - L.lo) / (L.hi - L.lo) * 100) + '%';
  // lencana
  const got = earnedBadges();
  const bw = $('#badges'); bw.innerHTML = '';
  BADGES.forEach(([id, ic, name, desc]) => {
    const d = document.createElement('div'); d.className = 'badge' + (got.includes(id) ? ' got' : '');
    d.innerHTML = `<span class="bi">${ic}</span>${esc(name)}`; d.title = desc;
    d.onclick = () => toast(`${ic} ${name}: ${desc}${got.includes(id) ? ' ✅' : ''}`);
    bw.append(d);
  });
  // kalender setahun
  const heat = $('#heat'); heat.innerHTML = '';
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(end.getDate() - 364 - end.getDay());
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const e = S.log[dkey(d)];
    const i = document.createElement('i');
    if (e && e.saved) i.className = e.score >= 80 ? 'g' : e.score >= 50 ? 'y' : 'r';
    i.title = `${d.getDate()} ${MONTHS[d.getMonth()]}${e && e.saved ? ' · ' + e.score + '%' : ''}`;
    heat.append(i);
  }
  heat.scrollLeft = heat.scrollWidth;
  renderWeekly();
}

function renderWeekly() {
  let card = $('#weeklyCard');
  if (!card) {
    card = document.createElement('div'); card.className = 'card'; card.id = 'weeklyCard';
    $('#tab-stats').insertBefore(card, $('#tab-stats').children[1]);
  }
  const week = off => {
    const out = [];
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i - off * 7); out.push(S.log[dkey(d)]); }
    return out.filter(Boolean);
  };
  const avg = arr => { const s = arr.filter(e => e.saved); return s.length ? Math.round(s.reduce((a, e) => a + e.score, 0) / s.length) : null; };
  const a = week(0), b = week(1), sa = avg(a), sb = avg(b);
  const ns = a.filter(e => e.saved && e.meals.noSnack === true).length;
  const water = a.length ? (a.reduce((s, e) => s + (e.water || 0), 0) / 7).toFixed(1) : 0;
  const wo = (S.workouts || []).filter(w => Date.now() - w.t < 7 * 864e5).length;
  let trend = '';
  if (sa !== null && sb !== null) trend = sa > sb ? `📈 naik ${sa - sb}% dari minggu lalu` : sa < sb ? `📉 turun ${sb - sa}% dari minggu lalu` : '➡️ sama dengan minggu lalu';
  card.innerHTML = `<h2>📰 Laporan 7 Hari Terakhir</h2>
    <p class="hint" style="margin-bottom:0">${sa === null ? 'Belum ada data minggu ini. Isi checklist setiap malam ya!' :
      `Skor rata-rata <b>${sa}%</b> ${trend}. Tanpa snack <b>${ns}</b> hari, minum rata-rata <b>${water}</b> gelas/hari, olahraga <b>${wo}</b> sesi. ${sa >= 80 ? 'Luar biasa, pertahankan! 🔥' : sa >= 50 ? 'Sudah lumayan, ayo dorong sedikit lagi! 💪' : 'Pelan-pelan saja, yang penting jujur dan terus mencoba 🙏'}`}</p>`;
}

// ======================================================================
// SEHAT
// ======================================================================
function drawSeries(cv, pts, opt) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = +cv.getAttribute('height') || 180;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  g.font = '11px system-ui, sans-serif';
  if (!pts.length) { g.fillStyle = v('--muted'); g.textAlign = 'center'; g.fillText(opt.empty || 'Belum ada data', W / 2, H / 2); return; }
  const L = 40, R = 18, T = 12, B = 22, ch = H - T - B, cw = W - L - R;
  let min = opt.min ?? Math.min(...pts.map(p => p.v)), max = opt.max ?? Math.max(...pts.map(p => p.v));
  if (opt.target != null) { min = Math.min(min, opt.target); max = Math.max(max, opt.target); }
  if (max - min < 1) { max += 1; min -= 1; }
  const y = val => T + ch - (val - min) / (max - min) * ch;
  const x = i => L + (pts.length === 1 ? cw / 2 : i * cw / (pts.length - 1));
  g.strokeStyle = v('--line'); g.fillStyle = v('--muted'); g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let k = 0; k <= 3; k++) {
    const val = min + (max - min) * k / 3, yy = y(val);
    g.beginPath(); g.moveTo(L, yy + .5); g.lineTo(W - R, yy + .5); g.stroke();
    g.fillText(opt.fmt ? opt.fmt(val) : val.toFixed(1), L - 4, yy);
  }
  if (opt.target != null) {
    g.setLineDash([5, 4]); g.strokeStyle = v('--good'); g.beginPath(); g.moveTo(L, y(opt.target)); g.lineTo(W - R, y(opt.target)); g.stroke(); g.setLineDash([]);
  }
  const grad = g.createLinearGradient(0, T, 0, T + ch); grad.addColorStop(0, v('--accent') + '55'); grad.addColorStop(1, v('--accent') + '00');
  g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(x(i), y(p.v)) : g.moveTo(x(i), y(p.v)));
  g.strokeStyle = v('--accent'); g.lineWidth = 2.5; g.stroke();
  g.lineTo(x(pts.length - 1), T + ch); g.lineTo(x(0), T + ch); g.closePath(); g.fillStyle = grad; g.fill();
  g.fillStyle = v('--accent'); pts.forEach((p, i) => { g.beginPath(); g.arc(x(i), y(p.v), 3.5, 0, 7); g.fill(); });
  g.fillStyle = v('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
  const every = Math.ceil(pts.length / 6);
  pts.forEach((p, i) => { if (i % every === 0 || i === pts.length - 1) g.fillText(p.label, x(i), T + ch + 6); });
}

function renderHealth() {
  // --- berat ---
  const ws = (S.weights || []).slice().sort((a, b) => a.d.localeCompare(b.d));
  const last = ws[ws.length - 1];
  $('#wNow').textContent = last ? last.kg.toFixed(1) : '–';
  $('#wDelta').textContent = ws.length > 1 ? (() => { const d = last.kg - ws[0].kg; return `${d <= 0 ? '⬇️' : '⬆️'} ${Math.abs(d).toFixed(1)} kg sejak ${fmtD(ws[0].d)}`; })() : '';
  $('#hInput').value = S.height || '';
  $('#wTarget').value = S.targetW || '';
  drawSeries($('#wChart'), ws.slice(-30).map(w => ({ label: fmtD(w.d), v: w.kg })), { target: S.targetW || null, empty: 'Catat berat badanmu untuk melihat grafik' });
  let bmi = '';
  if (last && S.height) {
    const b = last.kg / Math.pow(S.height / 100, 2);
    const cat = b < 18.5 ? 'kurang' : b < 25 ? 'normal' : b < 30 ? 'berlebih' : 'obesitas';
    bmi = `BMI kamu <b>${b.toFixed(1)}</b> (${cat}). `;
  }
  if (last && S.targetW) bmi += `Sisa <b>${Math.max(0, last.kg - S.targetW).toFixed(1)} kg</b> lagi ke target ${S.targetW} kg. `;
  $('#bmiInfo').innerHTML = bmi + '<br><small>Untuk remaja, BMI hanya gambaran kasar karena masih tumbuh. Turunkan berat pelan-pelan (±0,5 kg/minggu) dan tetap makan pagi & malam yang cukup.</small>';
  const wl = $('#wList'); wl.innerHTML = '';
  ws.slice().reverse().forEach(w => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${fmtD(w.d, true)}</span><b>${w.kg.toFixed(1)} kg</b>`;
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '🗑️';
    del.onclick = () => { if (confirm('Hapus catatan ini?')) { S.weights = S.weights.filter(x => x !== w); save(); renderHealth(); } };
    li.append(del); wl.append(li);
  });

  // --- air ---
  const e = dayEntry(today());
  const tgt = S.waterTarget || 8;
  $('#waterTargetLbl').textContent = tgt;
  const wa = $('#water'); wa.innerHTML = '';
  for (let i = 0; i < Math.max(tgt, e.water || 0); i++) {
    const sp = document.createElement('span'); sp.textContent = '🥛'; sp.className = i < (e.water || 0) ? 'full' : '';
    sp.onclick = () => { e.water = i + 1 === e.water ? i : i + 1; save(); renderHealth(); waterDone(e, tgt); };
    wa.append(sp);
  }

  // --- mood & jurnal ---
  const mw = $('#moods'); mw.innerHTML = '';
  ['😫', '😕', '😐', '🙂', '🤩'].forEach((m, i) => {
    const b = document.createElement('button'); b.textContent = m; b.className = e.mood === i + 1 ? 'on' : '';
    b.onclick = () => { e.mood = i + 1; save(); renderHealth(); };
    mw.append(b);
  });
  $('#jGrateful').value = e.jGrateful || '';
  $('#jTomorrow').value = e.jTomorrow || '';

  // --- tidur & bangun ---
  renderSleepStats();
  $('#foCount').textContent = `Sesi selesai hari ini: ${(S.focus || []).filter(f => dkey(new Date(f.t)) === today()).length}`;
}
function fmtD(k, long) { const d = new Date(k + 'T00:00:00'); return long ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : `${d.getDate()}/${d.getMonth() + 1}`; }
function waterDone(e, tgt) { if (e.water === tgt) { toast('💧 Target minum air tercapai! Mantap!'); confetti(); checkNewBadges(); } }

$('#wSave').onclick = () => {
  const kg = parseFloat(String($('#wInput').value).replace(',', '.'));
  if (!(kg > 20 && kg < 300)) return toast('Masukkan berat yang benar (kg)');
  S.weights = (S.weights || []).filter(w => w.d !== today());
  S.weights.push({ d: today(), kg });
  $('#wInput').value = ''; save(); renderHealth(); toast('Berat tersimpan ⚖️'); checkNewBadges();
};
$('#hInput').onchange = ev => { S.height = +ev.target.value || null; save(); renderHealth(); };
$('#wTarget').onchange = ev => { S.targetW = +String(ev.target.value).replace(',', '.') || null; save(); renderHealth(); };
$('#waterPlus').onclick = () => { const e = dayEntry(today()); e.water = (e.water || 0) + 1; save(); renderHealth(); waterDone(e, S.waterTarget || 8); };
$('#waterMinus').onclick = () => { const e = dayEntry(today()); e.water = Math.max(0, (e.water || 0) - 1); save(); renderHealth(); };
$('#jGrateful').oninput = ev => { dayEntry(today()).jGrateful = ev.target.value; save(); };
$('#jTomorrow').oninput = ev => { dayEntry(today()).jTomorrow = ev.target.value; save(); };

// --- catatan bangun & tidur ---
function logWake(w) { (S.wakes = S.wakes || []).push(w); S.wakes = S.wakes.slice(-500); save(); checkNewBadges(); }
function morningWakes() {
  const byDay = {};
  (S.wakes || []).forEach(w => {
    const d = new Date(w.t), h = d.getHours();
    if (h < 3 || h > 11) return;
    const k = dkey(d); if (!byDay[k] || w.t < byDay[k]) byDay[k] = w.t;
  });
  return byDay;
}
const hmOf = mins => `${pad(Math.floor(mins / 60) % 24)}:${pad(Math.round(mins % 60))}`;
function renderSleepStats() {
  const wakes = morningWakes();
  const keys = Object.keys(wakes).sort().slice(-14);
  const mins = t => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  const avgWake = keys.length ? keys.reduce((s, k) => s + mins(wakes[k]), 0) / keys.length : null;
  const sleeps = (S.sleeps || []).slice(-14);
  const bedM = sleeps.map(s => { const m = mins(s.start); return m < 12 * 60 ? m + 1440 : m; });
  const avgBed = bedM.length ? bedM.reduce((a, b) => a + b, 0) / bedM.length : null;
  const durs = sleeps.map(s => { const w = Object.values(wakes).find(t => t > s.start && t - s.start < 16 * 3600e3); return w ? (w - s.start) / 3600e3 : null; }).filter(Boolean);
  const avgDur = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
  $('#sleepSummary').innerHTML = `
    <div><b>${avgBed !== null ? hmOf(avgBed) : '–'}</b><small>Rata-rata tidur</small></div>
    <div><b>${avgWake !== null ? hmOf(avgWake) : '–'}</b><small>Rata-rata bangun</small></div>
    <div><b>${avgDur !== null ? avgDur.toFixed(1) + ' j' : '–'}</b><small>Lama tidur</small></div>`;
  drawSeries($('#wakeChart'), keys.map(k => ({ label: fmtD(k), v: mins(wakes[k]) })),
    { fmt: hmOf, empty: 'Jam bangun akan muncul setelah kamu mematikan alarm pagi' });
}

// --- timer olahraga ---
const EXERCISES = ['Jumping jack', 'Squat', 'Push up', 'High knees', 'Plank', 'Lunges', 'Mountain climber', 'Burpee', 'Sit up', 'Lari di tempat'];
let wo = null;
function beep(freq = 880, dur = .15, n = 1) {
  try {
    const ctx = Sound.ensure();
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; o.type = 'square';
      g.gain.value = .25; o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * (dur + .08); o.start(t); o.stop(t + dur);
    }
  } catch (e) {}
}
function speak(text) {
  try { if (!('speechSynthesis' in window)) return; const u = new SpeechSynthesisUtterance(text); u.lang = 'id-ID'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
}
function keepAwake(on) {
  if (NATIVE && NATIVE.keepScreenOn) { try { NATIVE.keepScreenOn(on); } catch (e) {} return; }
  if (on && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then(l => keepAwake.l = l).catch(() => {});
  if (!on && keepAwake.l) { keepAwake.l.release(); keepAwake.l = null; }
}
const mmss = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
$('#woStart').onclick = () => {
  if (wo) return;
  const work = Math.max(5, +$('#woWork').value || 30), rest = Math.max(0, +$('#woRest').value || 0), rounds = Math.max(1, +$('#woRounds').value || 8);
  wo = { work, rest, rounds, round: 1, phase: 'work', left: work, ex: 0 };
  keepAwake(true); woShow(); speak(`Ronde 1. ${EXERCISES[0]}. Mulai!`); beep(1000, .3);
  wo.timer = setInterval(() => {
    wo.left--;
    if (wo.left <= 3 && wo.left > 0) beep(700, .1);
    if (wo.left <= 0) {
      if (wo.phase === 'work' && wo.round >= wo.rounds) return woFinish(true);
      if (wo.phase === 'work' && wo.rest > 0) { wo.phase = 'rest'; wo.left = wo.rest; speak('Istirahat'); beep(500, .3); }
      else { wo.round++; wo.ex = (wo.ex + 1) % EXERCISES.length; wo.phase = 'work'; wo.left = wo.work; speak(`Ronde ${wo.round}. ${EXERCISES[wo.ex]}`); beep(1000, .3); }
    }
    woShow();
  }, 1000);
};
function woShow() {
  $('#woPhase').textContent = wo.phase === 'work' ? `🔥 GERAK — ronde ${wo.round}/${wo.rounds}` : `😮‍💨 Istirahat — ronde ${wo.round}/${wo.rounds}`;
  $('#woDisp').textContent = mmss(wo.left);
  $('#woEx').textContent = wo.phase === 'work' ? EXERCISES[wo.ex] : `Berikutnya: ${EXERCISES[(wo.ex + 1) % EXERCISES.length]}`;
}
function woFinish(done) {
  clearInterval(wo.timer); keepAwake(false);
  if (done) {
    (S.workouts = S.workouts || []).push({ t: Date.now(), rounds: wo.rounds, work: wo.work }); save();
    $('#woPhase').textContent = '🎉 Selesai! Kamu hebat!'; speak('Selesai! Kamu hebat!'); beep(1200, .2, 3); confetti(); checkNewBadges();
  } else $('#woPhase').textContent = 'Dihentikan';
  $('#woDisp').textContent = mmss(+$('#woWork').value || 30); $('#woEx').textContent = 'Tekan Mulai';
  wo = null;
}
$('#woStop').onclick = () => { if (wo) woFinish(false); };

// --- timer fokus (pomodoro) ---
let fo = null;
$('#foStart').onclick = () => {
  if (fo) return;
  fo = { phase: 'focus', left: 25 * 60 };
  keepAwake(true); foShow(); beep(900, .2);
  fo.timer = setInterval(() => {
    fo.left--;
    if (fo.left <= 0) {
      if (fo.phase === 'focus') {
        (S.focus = S.focus || []).push({ t: Date.now() }); save(); checkNewBadges();
        fo.phase = 'break'; fo.left = 5 * 60; speak('Waktu fokus selesai. Istirahat lima menit.'); beep(1200, .25, 3); renderHealth();
      } else { fo.phase = 'focus'; fo.left = 25 * 60; speak('Ayo fokus lagi.'); beep(900, .25, 2); }
    }
    foShow();
  }, 1000);
};
function foShow() {
  $('#foPhase').textContent = fo.phase === 'focus' ? '🧠 Fokus! Jauhkan HP dari tangan' : '☕ Istirahat sebentar';
  $('#foDisp').textContent = mmss(fo.left);
}
$('#foStop').onclick = () => {
  if (!fo) return; clearInterval(fo.timer); fo = null; keepAwake(false);
  $('#foPhase').textContent = 'Fokus 25 menit, istirahat 5 menit'; $('#foDisp').textContent = '25:00';
};

// ======================================================================
// WALLPAPER LAYAR ALARM (foto / video)
// ======================================================================
/** t = S (umum: wallMode) atau objek alarm (wall). */
function wallEditor(t, key, isAlarm, onChange = () => {}) {
  const F = isAlarm ? 'wall' : 'wallMode';
  const w = document.createElement('div'); w.className = 'walledit';
  const opts = (isAlarm ? [['default', '⚙️ Ikut wallpaper umum']] : []).concat([['none', '🔴 Tanpa wallpaper (warna berkedip)'], ['custom', '🖼️ Foto / video pilihanku']]);
  w.innerHTML = `<select class="w-sel">${opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
    <div class="w-custom hidden"><div class="hint w-name" style="margin:6px 0"></div><div class="w-prev"></div>
      <button class="btn w-pick" style="width:100%;margin-top:6px">📂 Pilih foto / video dari HP</button>
      <input type="file" class="w-file" accept="image/*,video/*" hidden></div>
    <button class="btn w-show" style="width:100%;margin-top:6px">👀 Lihat tampilan layar alarm</button>`;
  const q = s => w.querySelector(s), sel = q('.w-sel');
  sel.value = t[F] || (isAlarm ? 'default' : 'none');
  const refresh = async () => {
    q('.w-custom').classList.toggle('hidden', sel.value !== 'custom');
    q('.w-name').textContent = t.wallName ? `✅ ${t.wallKind === 'video' ? '🎬' : '🖼️'} ${t.wallName}` : 'Belum ada foto/video dipilih.';
    const pv = q('.w-prev'); pv.innerHTML = '';
    if (sel.value !== 'custom' || !t.wallName) return;
    if (NATIVE) {
      // pratinjau langsung dari file wallpaper yang tersimpan (video ikut bergerak)
      const src = `/wallfile/${encodeURIComponent(key)}?t=${Date.now()}`;
      pv.innerHTML = t.wallKind === 'video' ? `<video class="wallprev" src="${src}" muted autoplay loop playsinline></video>` : `<img class="wallprev" src="${src}" alt="">`;
    } else {
      const blob = await idbGet('wall-' + key).catch(() => null);
      if (blob) {
        const url = URL.createObjectURL(blob);
        pv.innerHTML = t.wallKind === 'video' ? `<video class="wallprev" src="${url}" muted autoplay loop playsinline></video>` : `<img class="wallprev" src="${url}">`;
      }
    }
    onChange();
  };
  const pick = () => {
    if (NATIVE) openPicker(key, (name, kind) => { t.wallName = name; t.wallKind = kind; t[F] = 'custom'; sel.value = 'custom'; save(); refresh(); }, 'wall');
    else q('.w-file').click();
  };
  sel.onchange = () => { t[F] = sel.value; save(); refresh(); if (sel.value === 'custom' && !t.wallName) pick(); };
  q('.w-pick').onclick = pick;
  q('.w-file').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    await idbPut('wall-' + key, f);
    t.wallName = f.name; t.wallKind = f.type.startsWith('video') ? 'video' : 'image'; t[F] = 'custom'; save(); refresh(); toast('Wallpaper tersimpan 🖼️');
  };
  q('.w-show').onclick = () => {
    syncNative();
    if (NATIVE && NATIVE.previewAlarmScreen) return NATIVE.previewAlarmScreen(isAlarm ? t.id : '');
    ring(isAlarm ? t.time : '05:00', isAlarm ? t.label : 'Contoh layar alarm', false, isAlarm ? t : null);
    Sound.stop(); if (ringing && ringing.vib) clearInterval(ringing.vib);
  };
  refresh();
  return w;
}
async function showRingWall(alarm) {
  const ring = $('#ring'), img = $('#ringImg'), vid = $('#ringVid');
  img.classList.add('hidden'); vid.classList.add('hidden'); ring.classList.remove('haswall');
  let key = null, kind = null;
  if (alarm && alarm.wall === 'custom') { key = alarm.id; kind = alarm.wallKind; }
  else if (!(alarm && alarm.wall === 'none') && S.wallMode === 'custom') { key = 'default'; kind = S.wallKind; }
  if (!key) return;
  const blob = await idbGet('wall-' + key).catch(() => null);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  ring.classList.add('haswall');
  if (kind === 'video') { vid.src = url; vid.classList.remove('hidden'); vid.play().catch(() => {}); }
  else { img.src = url; img.classList.remove('hidden'); }
}

// ======================================================================
// TANTANGAN ALARM, TEMPLATE, KUTIPAN, TANGGAL MULAI, CSV
// ======================================================================
$('#challengeSel').value = S.challenge || (S.mathLock ? 'math' : 'none');
$('#challengeSel').onchange = ev => { S.challenge = ev.target.value; S.mathLock = S.challenge !== 'none'; save(); };

const TEMPLATES = [
  ['💧 Minum air tiap 2 jam', () => [8, 10, 12, 14, 16, 18, 20].map(h => [`${pad(h)}:00`, 'Minum segelas air putih 💧', ALL_DAYS])],
  ['🏫 Bangun sekolah Sen–Jum', () => [['05:00', 'BANGUN! Waktunya sekolah 🏫', [1, 2, 3, 4, 5]]]],
  ['🛌 Bangun akhir pekan', () => [['06:30', 'Bangun! Akhir pekan tetap disiplin 💪', [0, 6]]]],
  ['🧘 Peregangan 2x sehari', () => [['10:00', 'Peregangan 5 menit 🧘', ALL_DAYS], ['15:00', 'Peregangan 5 menit 🧘', ALL_DAYS]]],
  ['📵 Stop main HP malam', () => [['21:30', 'Taruh HP, siap-siap tidur 📵', ALL_DAYS]]],
  ['📝 Isi jurnal malam', () => [['21:15', 'Isi mood & jurnal hari ini 📝', ALL_DAYS]]],
  ['🍽️ Jangan ngemil sore', () => [['15:30', 'Lapar? Minum air dulu, JANGAN ngemil! 🚫🍪', ALL_DAYS]]],
];
function renderTemplates() {
  const w = $('#templates'); w.innerHTML = '';
  TEMPLATES.forEach(([name, gen]) => {
    const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '＋ ' + name;
    b.onclick = () => {
      let n = 0;
      gen().forEach(([time, label, days]) => {
        if (S.alarms.some(a => a.time === time && a.label === label)) return;
        S.alarms.push({ id: uid(), time, label, days: days.slice(), on: true, sound: 'default', volume: null }); n++;
      });
      save(); renderAll(); toast(n ? `${n} pengingat ditambahkan ⏰` : 'Pengingat ini sudah ada');
    };
    w.append(b);
  });
}

function renderQuotes() {
  const ul = $('#quoteList'); ul.innerHTML = '';
  (S.quotes || []).forEach((q, i) => {
    const li = document.createElement('li'); li.innerHTML = `<span>“${esc(q)}”</span>`;
    const d = document.createElement('button'); d.className = 'del'; d.textContent = '🗑️';
    d.onclick = () => { S.quotes.splice(i, 1); save(); renderQuotes(); };
    li.append(d); ul.append(li);
  });
}
$('#addQuote').onclick = () => {
  const v = $('#newQuote').value.trim(); if (!v) return;
  (S.quotes = S.quotes || []).push(v); $('#newQuote').value = ''; save(); renderQuotes(); renderToday(); toast('Kutipan ditambahkan 💬');
};
$('#startDate').value = startDate();
$('#startDate').onchange = ev => { if (ev.target.value) { S.startDate = ev.target.value; save(); renderHeader(); } };

$('#exportCsv').onclick = () => {
  const rows = [['tanggal', 'disimpan', 'skor', 'makan_pagi', 'makan_malam', 'tanpa_snack', 'snack', 'kkal_snack', 'air_gelas', 'mood', 'berat_kg', 'jurnal']];
  const wmap = {}; (S.weights || []).forEach(w => wmap[w.d] = w.kg);
  Object.keys(S.log).sort().forEach(k => {
    const e = S.log[k];
    const sn = (e.snacks || []).map(x => x.name + (x.qty > 1 ? ' x' + x.qty : '')).join('; ');
    const kc = (e.snacks || []).reduce((s, x) => s + (x.kcal || 0) * (x.qty || 1), 0);
    rows.push([k, e.saved ? 'ya' : 'tidak', e.saved ? e.score : '', yn(e.meals.breakfast), yn(e.meals.dinner), yn(e.meals.noSnack), sn, kc || '',
      e.water || '', e.mood || '', wmap[k] || '', [e.jGrateful, e.jTomorrow].filter(Boolean).join(' | ')]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const name = `disiplin-laporan-${today()}.csv`;
  if (NATIVE) return NATIVE.saveFile(name, '﻿' + csv);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name; a.click();
};
function yn(v) { return v === true ? 'ya' : v === false ? 'tidak' : ''; }

// ======================================================================
// BERBAGI FILE DARI APLIKASI LAIN (APK): "Bagikan → Disiplin"
// ======================================================================
function rerenderDefaults() {
  $('#defaultSound').innerHTML = '';
  $('#defaultSound').append(soundEditor(S, 'default', false, () => setTimeout(renderAlarmsSoft, 0)));
  $('#defaultWall').innerHTML = '';
  $('#defaultWall').append(wallEditor(S, 'default', false));
}
window.onNativeShared = json => {
  let it; try { it = JSON.parse(json); } catch (e) { return; }
  const kind = it.kind; // audio | video | image
  const box = document.createElement('div'); box.className = 'picker';
  box.innerHTML = `<div class="pickhead"><b>📥 File dari aplikasi lain</b></div><div class="pickbody">
    <div class="card"><b>${esc(it.name)}</b><p class="hint">Mau dipakai untuk apa?</p>
    ${kind !== 'image' ? '<button class="btn primary big sh-sound">🎵 Jadikan suara alarm umum</button>' : ''}
    ${kind !== 'audio' ? '<button class="btn primary big sh-wall">🖼️ Jadikan wallpaper alarm umum</button>' : ''}
    <button class="btn big sh-no">Batal</button></div></div>`;
  document.body.append(box);
  const close = () => box.remove();
  box.querySelector('.sh-no').onclick = close;
  const s1 = box.querySelector('.sh-sound');
  if (s1) s1.onclick = () => {
    close(); toast(kind === 'video' ? '🎬 Mengubah video jadi suara...' : '💾 Menyimpan suara...');
    pickState = { key: 'default', mode: 'sound', busy: true, onDone: name => { S.customName = name; S.sound = 'custom'; save(); rerenderDefaults(); renderAll(); } };
    NATIVE.useMedia('default', it.uri, it.name, kind === 'video');
  };
  const s2 = box.querySelector('.sh-wall');
  if (s2) s2.onclick = () => {
    close(); toast('💾 Menyimpan wallpaper...');
    pickState = { key: 'default', mode: 'wall', busy: true, onDone: (name, k) => { S.wallName = name; S.wallKind = k; S.wallMode = 'custom'; save(); rerenderDefaults(); } };
    NATIVE.useWall('default', it.uri, it.name, kind);
  };
};

// ======================================================================
// LAIN-LAIN & MULAI
// ======================================================================
function onResumeExtra() {
  if (NATIVE && NATIVE.takeWakeLog) {
    try { JSON.parse(NATIVE.takeWakeLog() || '[]').forEach(w => logWake(w)); } catch (e) {}
  }
  renderHeader();
  if ($('#tab-health').classList.contains('active')) renderHealth();
}
// getar halus saat menjawab Ya/Tidak
document.addEventListener('click', ev => { if (ev.target.closest('.yn button, .water span, .moods button') && navigator.vibrate) navigator.vibrate(12); });

applyTheme();
renderThemes();
$('#defaultWall').append(wallEditor(S, 'default', false));
renderTemplates();
renderQuotes();
renderToday();
renderAlarms();
prevBadges = earnedBadges();
onResumeExtra();
if (NATIVE && NATIVE.takeShared) { try { const sh = NATIVE.takeShared(); if (sh) window.onNativeShared(sh); } catch (e) {} }
