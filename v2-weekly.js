/* v2-weekly.js — หน้า "สรุปรายสัปดาห์" (เมนูกลุ่มใหม่ในแถบซ้าย)
   - ยอดขาย / ออเดอร์ / ค่าแอดที่คีย์ = CasperCall (/_casper/month daily)
   - คนทัก / แคมเปญ / ROAS รายแคมเปญ = Facebook (fbDataMap)
   - เป้า %ADS = monthly-targets.json
   - ลิงก์ตรง: #weekly หรือ #weekly=YYYY-MM-DD (วันจันทร์ของสัปดาห์) */
(function () {
  'use strict';
  var API = 'https://richbiotech-fb-proxy.ads02.workers.dev/_casper/month';
  var TGT = 'https://raw.githubusercontent.com/richbiotech-app/ads-dashboard/main/monthly-targets.json';
  var DN = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var TM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var CK = {}, LOAD = {}, TG = null, TGL = false;
  var S = { start: null, open: false, lastN: -1, chart: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function jsq(s) { return esc(JSON.stringify(String(s))); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function parse(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function add(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function days(start) { var o = []; for (var i = 0; i < 7; i++) { o.push(add(start, i)); } return o; }
  function monday(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); }
  function defStart() { return add(monday(new Date()), -7); }
  function thd(s) { var d = parse(s); return d.getDate() + ' ' + TM[d.getMonth()]; }
  function range(st) { var e = add(st, 6), a = parse(st), b = parse(e); return a.getDate() + (a.getMonth() !== b.getMonth() ? ' ' + TM[a.getMonth()] : '') + '–' + b.getDate() + ' ' + TM[b.getMonth()] + ' ' + String(b.getFullYear() + 543).slice(-2); }
  function n0(v) { return Math.round(+v || 0).toLocaleString('en-US'); }
  function baht(v) { return '฿' + n0(v); }
  function short(v) { v = +v || 0; return v >= 1e6 ? '฿' + (v / 1e6).toFixed(2) + ' ล.' : v >= 1e4 ? '฿' + (v / 1e3).toFixed(0) + 'K' : baht(v); }
  function pct(a, b) { return b ? (a - b) / b * 100 : null; }
  function tok() { try { return localStorage.getItem('rb_auth_token'); } catch (e) { return null; } }
  function visible() { var v = document.getElementById('weeklyView'); return !!(v && v.style.display !== 'none'); }

  /* ── โหลดข้อมูล ───────────────────────────────────────── */
  function casper(m) {
    if ((CK[m] && Date.now() - CK[m].t < 600000) || LOAD[m]) { return; }
    var t = tok(); if (!t) { return; }
    LOAD[m] = 1;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, m: m }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { LOAD[m] = 0; if (j && j.daily) { CK[m] = { t: Date.now(), d: j.daily, ak: j.adsThrough || '' }; if (visible()) { render(); } } })
      .catch(function () { LOAD[m] = 0; });
  }
  function targets() {
    if (TG || TGL) { return; } TGL = true;
    fetch(TGT + '?t=' + Date.now()).then(function (r) { return r.json(); }).then(function (j) { TG = j || {}; if (visible()) { render(); } }).catch(function () { TG = {}; });
  }
  function cday(d) { var c = CK[d.slice(0, 7)]; return c && c.d[d] ? c.d[d] : null; }
  function akThrough(list) { var ak = ''; list.forEach(function (d) { var c = CK[d.slice(0, 7)]; if (c && c.ak > ak) { ak = c.ak; } }); return ak; }
  function tgtAds(prod, month) { var m = TG && TG.months && TG.months[month]; if (!m) { return null; } var it = (m.items || []).filter(function (x) { return x.product === prod; })[0]; return it && +it.ads ? +it.ads : null; }
  function prodAccs() {
    var o = {};
    (window.FB_HIERARCHY || []).forEach(function (p) { var s = {}; p.pages.forEach(function (g) { g.accounts.forEach(function (h) { (h.adAccounts || []).forEach(function (a) { s[a] = 1; }); }); }); o[p.product] = Object.keys(s); });
    return o;
  }
  function fbLoaded() { var tot = 0, ok = 0, rows = 0; (window.FB_ACCOUNTS_META || []).forEach(function (m) { tot++; if (window.fbLoadedMap && fbLoadedMap[m.name]) { ok++; } rows += ((window.fbDataMap || {})[m.name] || []).length; }); return { tot: tot, ok: ok, rows: rows }; }

  /* ── คำนวณ ────────────────────────────────────────────── */
  function compute(st) {
    var W1 = days(st), W0 = days(add(st, -7)), last = W1[6], newFrom = W1[0];
    var PA = prodAccs(), prods = {};
    function cs(list, p) { var s = 0, o = 0, a = 0; list.forEach(function (d) { var x = cday(d); x = x && x[p]; if (x) { s += x.s || 0; o += x.o || 0; a += x.a || 0; } }); return { s: s, o: o, a: a }; }
    var names = {}; W1.concat(W0).forEach(function (d) { var x = cday(d); if (x) { Object.keys(x).forEach(function (k) { names[k] = 1; }); } });
    Object.keys(names).forEach(function (p) {
      var w1 = cs(W1, p), w0 = cs(W0, p); if (!w1.s && !w1.a && !w0.s) { return; }
      var camps = {}; w1.c = 0; w0.c = 0; w1.fs = 0; w0.fs = 0;
      (PA[p] || []).forEach(function (acc) {
        ((window.fbDataMap || {})[acc] || []).forEach(function (r) {
          var sp = +r.spend || 0, inw1 = W1.indexOf(r.date) >= 0, inw0 = W0.indexOf(r.date) >= 0;
          if (inw1) { w1.c += +r.conversations || 0; w1.fs += sp; } if (inw0) { w0.c += +r.conversations || 0; w0.fs += sp; }
          if (!sp) { return; }
          var k = acc + '|' + r.campaign, x = camps[k] || (camps[k] = { acc: acc, n: r.campaign, first: r.date, sp: 0, rv: 0, b: 0, last: 0 });
          if (r.date < x.first) { x.first = r.date; }
          if (inw1) { x.sp += sp; x.rv += +r.revenue || 0; x.b += +r.purchases || 0; }
          if (r.date === last) { x.last += sp; }
        });
      });
      var L = Object.keys(camps).map(function (k) { return camps[k]; }).filter(function (x) { return x.sp > 0 && x.first <= last; });
      var m = {
        p: p, w1: w1, w0: w0,
        ads1: w1.s ? w1.a / w1.s * 100 : 0, ads0: w0.s ? w0.a / w0.s * 100 : 0,
        cl1: w1.c ? w1.o / w1.c * 100 : 0, cl0: w0.c ? w0.o / w0.c * 100 : 0,
        aov1: w1.o ? w1.s / w1.o : 0, aov0: w0.o ? w0.s / w0.o : 0,
        sg: pct(w1.s, w0.s), ag: pct(w1.a, w0.a),
        act: L.filter(function (x) { return x.last > 0; }).length, run: L.length,
        newc: L.filter(function (x) { return x.first >= newFrom; }).length,
        newWin: L.filter(function (x) { return x.first >= newFrom && x.sp >= 1000 && x.rv / x.sp >= 1.5; }),
        win: L.filter(function (x) { return x.sp >= 3000 && x.rv / x.sp >= 2; }).sort(function (a, b) { return b.rv / b.sp - a.rv / a.sp; }),
        lose: L.filter(function (x) { return x.sp >= 3000 && x.rv / x.sp < 1; }).sort(function (a, b) { return b.sp - a.sp; }),
        T: tgtAds(p, last.slice(0, 7))
      };
      m.flags = flags(m); m.todo = todo(m);
      prods[p] = m;
    });
    var T = { w1: { s: 0, o: 0, a: 0, c: 0 }, w0: { s: 0, o: 0, a: 0, c: 0 } };
    Object.keys(prods).forEach(function (p) { ['w1', 'w0'].forEach(function (w) { ['s', 'o', 'a', 'c'].forEach(function (k) { T[w][k] += prods[p][w][k] || 0; }); }); });
    var daily = W1.map(function (d, i) { var s = 0, a = 0, s0 = 0; var x = cday(d) || {}, y = cday(W0[i]) || {}; Object.keys(x).forEach(function (k) { s += x[k].s || 0; a += x[k].a || 0; }); Object.keys(y).forEach(function (k) { s0 += y[k].s || 0; }); return { d: d, s: s, a: a, s0: s0 }; });
    return { W1: W1, W0: W0, prods: prods, T: T, daily: daily, ak: akThrough(W1) };
  }
  function lv(bad, warn) { return bad ? 'bad' : warn ? 'warn' : 'good'; }
  function flags(m) {
    var f = {};
    var dcl = m.cl1 - m.cl0;
    f.close = { lv: m.w1.c ? lv(m.cl1 < 25 || dcl <= -5, m.cl1 < 30 || dcl <= -3) : 'mute', t: m.w1.c ? m.cl1.toFixed(1) + '%' : '—', s: m.w1.c && m.w0.c ? arrowPt(dcl) : '' };
    var da = pct(m.aov1, m.aov0);
    f.aov = { lv: m.aov1 ? lv(da !== null && da <= -10, da !== null && da <= -5) : 'mute', t: m.aov1 ? baht(m.aov1) : '—', s: da !== null ? arrowPc(da) : '' };
    f.run = { lv: lv(m.act < 10 || (m.ag !== null && m.ag <= -30), m.act < 20 || (m.ag !== null && m.ag <= -20)), t: m.act + ' ตัว', s: m.ag !== null ? 'งบ ' + arrowPc(m.ag) : '' };
    f.content = { lv: lv(!m.win.length && !m.newWin.length, m.win.length < 2 && m.newWin.length < 2), t: 'ชนะ ' + m.win.length, s: 'ตัวใหม่ติด ' + m.newWin.length + '/' + m.newc };
    var T = m.T || 60;
    f.ads = { lv: m.w1.s ? lv(m.ads1 > T + 10, m.ads1 > T) : 'mute', t: m.w1.s ? m.ads1.toFixed(1) + '%' : '—', s: 'เป้า ' + (m.T ? m.T + '%' : '—') };
    var order = { bad: 3, warn: 2, good: 1, mute: 0 }, worst = 0;
    Object.keys(f).forEach(function (k) { worst = Math.max(worst, order[f[k].lv]); });
    f.score = worst;
    return f;
  }
  function arrowPc(v) { return (v >= 0 ? '▲' : '▼') + Math.abs(v).toFixed(0) + '%'; }
  function arrowPt(v) { return (v >= 0 ? '▲' : '▼') + Math.abs(v).toFixed(1); }
  function todo(m) {
    var L = [], T = m.T, a = m.ads1, sg = m.sg || 0;
    if (T && a > T + 10) { L.push(['bad', '%ADS ' + a.toFixed(0) + '% สูงกว่าเป้า ' + T + '% มาก → ลดงบตัวที่ ROAS ต่ำกว่า 1 ก่อน ไม่เพิ่มงบรวม']); }
    else if (T && a > T) { L.push(['warn', '%ADS เกินเป้า ' + T + '% เล็กน้อย → คงงบรวม ย้ายงบจากตัวอ่อนไปตัวที่ ROAS ดี']); }
    else if (T && a <= T - 5 && sg >= 0) { L.push(['good', '%ADS ต่ำกว่าเป้า ' + T + '% → เพิ่มงบรวมได้ 10–20% ที่ตัวที่ ROAS ดี']); }
    else if (T) { L.push(['good', '%ADS อยู่ในเป้า ' + T + '% → คงแผนเดิม']); }
    if (m.cl1 < m.cl0 - 5 && m.w1.c > m.w0.c) { L.push(['warn', 'คนทักเพิ่มแต่ปิดได้ลดลง ' + (m.cl0 - m.cl1).toFixed(0) + ' จุด → เช็กแชทว่าตอบทัน/ปิดการขายได้ไหม ก่อนเพิ่มงบ']); }
    else if (m.cl1 && m.cl1 < 20) { L.push(['warn', 'ปิดได้แค่ ' + m.cl1.toFixed(0) + '% → เช็กคุณภาพคนทักและสคริปต์ปิดการขาย']); }
    if (sg <= -20) { L.push(['bad', 'ยอดขายลด ' + Math.abs(sg).toFixed(0) + '% → เช็กบัญชีโดนปิด/งบถูกตัด และเปิดตัวใหม่ทดแทน']); }
    var da = pct(m.aov1, m.aov0); if (da !== null && da <= -5) { L.push(['warn', 'ยอดต่อบิลลด ' + Math.abs(da).toFixed(0) + '% → เช็กโปรและการเสนอเซ็ตใหญ่']); }
    if (!m.win.length && !m.newWin.length) { L.push(['warn', 'ไม่มีตัวชนะ (ROAS ≥ 2) และตัวใหม่ยังไม่ติด → ต้องการคอนเทนต์ใหม่']); }
    if (m.act < 10) { L.push(['warn', 'แคมเปญที่ยังใช้เงินเหลือ ' + m.act + ' ตัว → เปิดแคมเปญเพิ่ม เช็กบัญชีโดนปิด']); }
    return L;
  }

  /* ── แสดงผล ───────────────────────────────────────────── */
  function kpi(l, v, sub, cls) { return '<div class="wk-card wk-kpi"><span class="wk-lbl">' + l + '</span><span class="wk-val">' + v + '</span><span class="wk-sub ' + (cls || '') + '">' + sub + '</span></div>'; }
  function chg(v, inverse) { if (v === null || !isFinite(v)) { return '<span class="wk-sub">ไม่มีข้อมูลสัปดาห์ก่อน</span>'; } var good = inverse ? v <= 0 : v >= 0; return '<span class="wk-' + (good ? 'up' : 'dn') + '">' + arrowPc(v) + '</span> เทียบสัปดาห์ก่อน'; }
  function chgPt(v, inverse) { var good = inverse ? v <= 0 : v >= 0; return '<span class="wk-' + (good ? 'up' : 'dn') + '">' + arrowPt(v) + ' จุด</span> เทียบสัปดาห์ก่อน'; }
  function cell(f) { return '<td><span class="wk-dot wk-' + f.lv + '"></span><b>' + f.t + '</b>' + (f.s ? '<small>' + f.s + '</small>' : '') + '</td>'; }
  function campLink(x) { var r = x.rv / x.sp; return '<button class="wk-camp" onclick="weeklyV2.camp(' + jsq(x.acc) + ',' + jsq(x.n) + ')"><span class="wk-ell">' + esc(x.n) + '</span><span class="wk-cm">' + esc(x.acc) + ' · ใช้ ' + baht(x.sp) + ' · ROAS <b class="wk-' + (r >= 2 ? 'up' : r < 1 ? 'dn' : '') + '">' + r.toFixed(2) + '</b></span></button>'; }

  function render() {
    var box = document.getElementById('weeklyInner'); if (!box) { return; }
    var st = S.start || defStart(), W1 = days(st), W0 = days(add(st, -7));
    W1.concat(W0).map(function (d) { return d.slice(0, 7); }).filter(function (m, i, a) { return a.indexOf(m) === i; }).forEach(casper);
    targets();
    var fl = fbLoaded(), need = W1.concat(W0).map(function (d) { return d.slice(0, 7); }).filter(function (m, i, a) { return a.indexOf(m) === i; });
    var ready = need.every(function (m) { return CK[m]; });
    var head = '<div class="wk-head"><div><h1>สรุปรายสัปดาห์</h1><div class="wk-hsub">' + range(st) + ' (จ.–อา.) · เทียบ ' + range(add(st, -7)) + '</div></div>' +
      '<div class="wk-tools"><div class="wk-week"><button onclick="weeklyV2.shift(-7)" aria-label="สัปดาห์ก่อน">‹</button><span>' + range(st) + '</span><button onclick="weeklyV2.shift(7)" aria-label="สัปดาห์ถัดไป"' + (add(st, 7) > defStart() ? ' disabled' : '') + '>›</button></div>' +
      '<button class="wk-btn" onclick="weeklyV2.copy(this)">คัดลอกลิงก์</button></div></div>';
    if (!tok()) { box.innerHTML = '<div class="wk-wrap">' + head + '<div class="wk-card wk-pad">ต้องล็อกอินแดชบอร์ดก่อน</div></div>'; return; }
    if (!ready) { box.innerHTML = '<div class="wk-wrap">' + head + '<div class="wk-card wk-pad wk-load">กำลังดึงยอดขายจาก CasperCall…</div></div>'; return; }
    var R = compute(st), T = R.T, P = Object.keys(R.prods).map(function (k) { return R.prods[k]; }).sort(function (a, b) { return b.w1.s - a.w1.s; });
    var notes = [];
    if (R.ak && R.ak < W1[6]) { notes.push('ยอด Casper มีถึง ' + thd(R.ak) + ' — สัปดาห์นี้ยังไม่ครบ ตัวเลขจะเปลี่ยนเมื่อคีย์ครบ'); }
    if (fl.tot && fl.ok < fl.tot * 0.9) { notes.push('ข้อมูล Facebook โหลดแล้ว ' + fl.ok + '/' + fl.tot + ' บัญชี — คนทัก/แคมเปญอาจยังไม่ครบ'); }
    var ads1 = T.w1.s ? T.w1.a / T.w1.s * 100 : 0, ads0 = T.w0.s ? T.w0.a / T.w0.s * 100 : 0, cl1 = T.w1.c ? T.w1.o / T.w1.c * 100 : 0, cl0 = T.w0.c ? T.w0.o / T.w0.c * 100 : 0;
    var h = '<div class="wk-wrap">' + head;
    if (notes.length) { h += '<div class="wk-note">' + notes.map(esc).join('<br>') + '</div>'; }
    h += '<div class="wk-kpis">' +
      kpi('ยอดขาย', short(T.w1.s), chg(pct(T.w1.s, T.w0.s))) +
      kpi('ค่าแอด (คีย์ใน Casper)', short(T.w1.a), chg(pct(T.w1.a, T.w0.a), true)) +
      kpi('%ADS', ads1.toFixed(1) + '%', chgPt(ads1 - ads0, true)) +
      kpi('คนทัก', n0(T.w1.c), chg(pct(T.w1.c, T.w0.c))) +
      kpi('% ปิดการขาย', cl1.toFixed(1) + '%', chgPt(cl1 - cl0)) +
      kpi('ต้นทุน/ซื้อ', baht(T.w1.o ? T.w1.a / T.w1.o : 0), chg(pct(T.w1.o ? T.w1.a / T.w1.o : 0, T.w0.o ? T.w0.a / T.w0.o : 0), true)) +
      '</div>';
    // ไฮไลต์
    var gr = P.filter(function (m) { return m.sg !== null && m.w0.s > 20000; }).sort(function (a, b) { return b.sg - a.sg; });
    var best = R.daily.slice().sort(function (a, b) { return b.s - a.s; })[0];
    h += '<div class="wk-hl">' +
      '<div class="wk-card wk-pad"><span class="wk-lbl">โตแรงสุด</span>' + gr.slice(0, 2).map(function (m) { return '<div class="wk-hli"><b>' + esc(m.p) + '</b><span class="wk-up">' + arrowPc(m.sg) + '</span></div>'; }).join('') + '</div>' +
      '<div class="wk-card wk-pad"><span class="wk-lbl">ลดลง</span>' + (gr.filter(function (m) { return m.sg < 0; }).reverse().slice(0, 2).map(function (m) { return '<div class="wk-hli"><b>' + esc(m.p) + '</b><span class="wk-dn">' + arrowPc(m.sg) + '</span></div>'; }).join('') || '<div class="wk-hli wk-sub">ไม่มีสินค้าที่ยอดลด</div>') + '</div>' +
      '<div class="wk-card wk-pad"><span class="wk-lbl">วันขายดีสุด</span>' + (best && best.s ? '<div class="wk-hli"><b>' + DN[parse(best.d).getDay()] + ' ' + thd(best.d) + '</b><span>' + baht(best.s) + '</span></div>' : '') + '</div></div>';
    // ตารางสุขภาพ
    var groups = { close: [], aov: [], run: [], content: [] };
    P.forEach(function (m) { Object.keys(groups).forEach(function (k) { if (m.flags[k].lv === 'bad') { groups[k].push(m.p); } }); });
    h += '<div class="wk-card"><div class="wk-pad wk-sec"><div class="wk-h2row"><h2>จุดที่ควรแก้</h2><span class="wk-legend"><i class="wk-dot wk-bad"></i>ต้องแก้ <i class="wk-dot wk-warn"></i>เฝ้าดู <i class="wk-dot wk-good"></i>ปกติ</span></div>' +
      '<div class="wk-fix">' +
      fixBox('💬', '% ปิดการขายน้อย', 'เช็กแชท / สคริปต์ปิดการขาย', groups.close) +
      fixBox('🧾', 'ยอดต่อบิลลดลง', 'เช็กโปร / การเสนอเซ็ตใหญ่', groups.aov) +
      fixBox('📣', 'แอดรันน้อย / งบหาย', 'เปิดแคมเปญเพิ่ม เช็กบัญชีโดนปิด', groups.run) +
      fixBox('🎬', 'ต้องการคอนเทนต์ใหม่', 'ไม่มีตัวชนะ ROAS ≥ 2 และตัวใหม่ไม่ติด', groups.content) +
      '</div></div>' +
      '<div class="wk-scroll"><table class="wk-t"><thead><tr><th>สินค้า</th><th class="r">ยอดขาย</th><th>%ADS เทียบเป้า</th><th>% ปิดการขาย</th><th>ยอดต่อบิล</th><th>แอดที่รันวันสุดท้าย</th><th>คอนเทนต์</th></tr></thead><tbody>' +
      P.slice().sort(function (a, b) { return b.flags.score - a.flags.score || b.w1.s - a.w1.s; }).map(function (m) {
        return '<tr><td><button class="wk-link" onclick="weeklyV2.go(' + jsq(m.p) + ')">' + esc(m.p) + '</button></td><td class="r"><b>' + short(m.w1.s) + '</b><small class="wk-' + ((m.sg || 0) >= 0 ? 'up' : 'dn') + '">' + (m.sg !== null ? arrowPc(m.sg) : '') + '</small></td>' +
          cell(m.flags.ads) + cell(m.flags.close) + cell(m.flags.aov) + cell(m.flags.run) + cell(m.flags.content) + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="wk-hm">' + P.slice().sort(function (a, b) { return b.flags.score - a.flags.score || b.w1.s - a.w1.s; }).map(function (m) {
        var sc = m.flags.score;
        return '<button class="wk-hmr" onclick="weeklyV2.go(' + jsq(m.p) + ')"><div class="wk-hmh"><span class="wk-dot wk-' + (sc >= 3 ? 'bad' : sc === 2 ? 'warn' : 'good') + '"></span><b>' + esc(m.p) + '</b><span class="wk-hms">' + short(m.w1.s) + ' <small class="wk-' + ((m.sg || 0) >= 0 ? 'up' : 'dn') + '">' + (m.sg !== null ? arrowPc(m.sg) : '') + '</small></span></div>' +
          '<div class="wk-hmg">' + hm('%ADS', m.flags.ads) + hm('% ปิด', m.flags.close) + hm('ยอด/บิล', m.flags.aov) + hm('แอดรัน', m.flags.run) + hm('คอนเทนต์', m.flags.content) + '</div></button>';
      }).join('') + '</div></div>';
    // กราฟ
    h += '<div class="wk-card wk-pad"><div class="wk-h2row"><h2>ยอดขายรายวัน</h2><span class="wk-legend"><i style="background:#2563EB"></i>สัปดาห์นี้ <i style="background:#CBD5E1"></i>สัปดาห์ก่อน <i class="ln"></i>%ADS</span></div><div style="position:relative;height:240px" class="wk-chartbox"><canvas id="wkChart"></canvas></div></div>';
    // รายสินค้า
    h += '<h2 class="wk-h2">รายสินค้า</h2><div class="wk-prods">' + P.map(prodCard).join('') + '</div>';
    h += '<div class="wk-foot">ยอดขาย ออเดอร์ และค่าแอดที่คีย์ = CasperCall · คนทัก แคมเปญ และ ROAS รายแคมเปญ = Facebook · เป้า %ADS = หน้าเป้าประจำเดือน · % ปิด = ออเดอร์ ÷ คนทัก</div></div>';
    box.innerHTML = h;
    drawChart(R.daily);
  }
  function fixBox(ic, t, how, list) {
    return '<div class="wk-fixb' + (list.length ? '' : ' ok') + '"><div class="wk-fixh"><span>' + ic + '</span><div><b>' + t + '</b><small>' + how + '</small></div></div>' +
      (list.length ? '<div class="wk-chips">' + list.map(function (p) { return '<button onclick="weeklyV2.go(' + jsq(p) + ')">' + esc(p) + '</button>'; }).join('') + '</div>' : '<div class="wk-sub">ไม่มี 👍</div>') + '</div>';
  }
  function prodCard(m) {
    var a = m.w1;
    var good = m.win.slice(0, 3), bad = m.lose.slice(0, 3);
    return '<div class="wk-card wk-pad wk-prod" id="' + pid(m.p) + '">' +
      '<div class="wk-h2row"><h3>' + esc(m.p) + '</h3><span class="wk-pill wk-' + (m.flags.score >= 3 ? 'bad' : m.flags.score === 2 ? 'warn' : 'good') + '">' + (m.flags.score >= 3 ? 'ต้องแก้' : m.flags.score === 2 ? 'เฝ้าดู' : 'ปกติ') + '</span></div>' +
      '<div class="wk-mini">' +
      mini('ยอดขาย', short(a.s), m.sg !== null ? '<span class="wk-' + (m.sg >= 0 ? 'up' : 'dn') + '">' + arrowPc(m.sg) + '</span>' : '') +
      mini('ค่าแอด', short(a.a), m.ag !== null ? arrowPc(m.ag) : '') +
      mini('%ADS', m.ads1.toFixed(1) + '%', '<span class="wk-' + (m.ads1 - m.ads0 <= 0 ? 'up' : 'dn') + '">' + arrowPt(m.ads1 - m.ads0) + '</span>') +
      mini('คนทัก / ซื้อ', n0(a.c) + ' / ' + n0(a.o), '') +
      mini('% ปิด', m.cl1.toFixed(1) + '%', m.w0.c ? '<span class="wk-' + (m.cl1 - m.cl0 >= 0 ? 'up' : 'dn') + '">' + arrowPt(m.cl1 - m.cl0) + '</span>' : '') +
      mini('ต้นทุน/ซื้อ', baht(a.o ? a.a / a.o : 0), '') +
      '</div>' +
      (m.todo.length ? '<div class="wk-todo"><b>👉 ควรทำ</b><ul>' + m.todo.map(function (t) { return '<li class="wk-t-' + t[0] + '">' + esc(t[1]) + '</li>'; }).join('') + '</ul></div>' : '') +
      (good.length ? '<div class="wk-cl"><b class="wk-up">ควรเพิ่ม / รุมยิง</b>' + good.map(campLink).join('') + '</div>' : '') +
      (bad.length ? '<div class="wk-cl"><b class="wk-dn">ควรลด / ปิด</b>' + bad.map(campLink).join('') + '</div>' : '') +
      '</div>';
  }
  function hm(l, f) { return '<div class="wk-hmc wk-c-' + f.lv + '"><span>' + l + '</span><b>' + f.t + '</b></div>'; }
  function pid(p) { return 'wkp-' + encodeURIComponent(p).replace(/[^A-Za-z0-9]/g, ''); }
  function mini(l, v, s) { return '<div><span>' + l + '</span><b>' + v + '</b><small>' + s + '</small></div>'; }
  function drawChart(D) {
    requestAnimationFrame(function () {
      var c = document.getElementById('wkChart'); if (!c || !window.Chart) { return; }
      if (S.chart) { try { S.chart.destroy(); } catch (e) {} }
      var k = function (v) { return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v; };
      S.chart = new Chart(c, {
        type: 'bar',
        data: { labels: D.map(function (x) { return DN[parse(x.d).getDay()] + ' ' + parse(x.d).getDate(); }), datasets: [
          { type: 'bar', label: 'สัปดาห์นี้', data: D.map(function (x) { return Math.round(x.s); }), backgroundColor: '#2563EB', borderRadius: 4, maxBarThickness: 34, order: 2, yAxisID: 'y' },
          { type: 'bar', label: 'สัปดาห์ก่อน', data: D.map(function (x) { return Math.round(x.s0); }), backgroundColor: '#CBD5E1', borderRadius: 4, maxBarThickness: 34, order: 3, yAxisID: 'y' },
          { type: 'line', label: '%ADS', data: D.map(function (x) { return x.s ? +(x.a / x.s * 100).toFixed(1) : null; }), borderColor: '#F59E0B', backgroundColor: '#F59E0B', borderWidth: 2, pointRadius: 3, tension: 0.3, order: 1, yAxisID: 'y2' }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: function (x) { return x.dataset.label + ': ' + (x.dataset.yAxisID === 'y2' ? x.parsed.y + '%' : '฿' + n0(x.parsed.y)); } } } },
          scales: { x: { grid: { display: false }, ticks: { color: '#64748B' } }, y: { grid: { color: '#EEF1F6' }, ticks: { color: '#64748B', callback: k } }, y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#B45309', callback: function (v) { return v + '%'; } } } } }
      });
    });
  }

  /* ── เปิดหน้า / เมนู ──────────────────────────────────── */
  function setHash() { try { history.replaceState(null, '', location.pathname + location.search + '#weekly=' + (S.start || defStart())); } catch (e) {} }
  function open(el) {
    document.querySelectorAll('[id$="View"]').forEach(function (v) { v.style.display = 'none'; });
    document.querySelectorAll('.sb-item').forEach(function (i) { i.classList.remove('active'); });
    var v = document.getElementById('weeklyView'); if (v) { v.style.display = ''; }
    var it = el || document.getElementById('sb-weekly'); if (it) { it.classList.add('active'); }
    S.open = true; setHash(); render(); window.scrollTo(0, 0);
  }
  window.weeklyV2 = {
    open: open, render: render,
    shift: function (n) { var s = add(S.start || defStart(), n); if (s > defStart()) { return; } S.start = s; setHash(); render(); window.scrollTo(0, 0); },
    copy: function (b) { var u = location.origin + location.pathname + '#weekly=' + (S.start || defStart()); try { navigator.clipboard.writeText(u); } catch (e) {} if (b) { var t = b.textContent; b.textContent = 'คัดลอกแล้ว'; setTimeout(function () { b.textContent = t; }, 1500); } },
    go: function (p) { var e = document.getElementById(pid(p)); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'start' }); e.classList.add('wk-flash'); setTimeout(function () { e.classList.remove('wk-flash'); }, 1600); } },
    camp: function (acc, name) {
      var H = window.FB_HIERARCHY || [], pi = -1, gi = -1, hi = -1;
      H.forEach(function (p, a) { p.pages.forEach(function (g, b) { g.accounts.forEach(function (h, c) { if (pi < 0 && (h.adAccounts || []).indexOf(acc) >= 0) { pi = a; gi = b; hi = c; } }); }); });
      if (pi < 0 || !window.fbV2) { return alert('ไม่พบบัญชี ' + acc + ' ในหน้า Facebook Ads'); }
      fbV2.open(document.getElementById('sb-fbv2')); fbV2.product(pi); fbV2.page(gi); fbV2.acct(hi, acc);
      var info = window.fbCampaignsMap && fbCampaignsMap[acc] && fbCampaignsMap[acc][name];
      if (info && info.id && fbV2.detail) { setTimeout(function () { try { fbV2.detail(name, info.id); } catch (e) {} }, 300); }
    }
  };

  function install() {
    var nav = document.querySelector('.sb-nav') || (document.getElementById('sb-fb') && document.getElementById('sb-fb').parentNode);
    var wrap = document.querySelector('.content-wrap');
    var first = nav && nav.querySelector('.v2nav-group');
    if (!nav || !wrap || (!first && !nav.getAttribute('data-v2nav') && (install.n = (install.n || 0) + 1) < 30)) { return setTimeout(install, 500); }
    if (document.getElementById('sb-weekly')) { return; }
    var item = document.createElement('div'); item.className = 'sb-item'; item.id = 'sb-weekly';
    item.innerHTML = '<span class="sb-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 14h3M7 17h6"/></svg></span><span>สรุปรายสัปดาห์</span>';
    item.onclick = function () { open(item); };
    if (first) {
      var g = document.createElement('div'); g.className = 'v2nav-group';
      g.innerHTML = '<button type="button" class="v2nav-head" aria-expanded="true"><span>สรุปรายสัปดาห์</span><i aria-hidden="true">▾</i></button><div class="v2nav-items"></div>';
      g.querySelector('.v2nav-items').appendChild(item);
      g.querySelector('.v2nav-head').onclick = function () { var f = g.classList.toggle('fold'); this.setAttribute('aria-expanded', f ? 'false' : 'true'); };
      first.parentNode.insertBefore(g, first.nextSibling);
    } else { nav.insertBefore(item, nav.firstChild); }
    var view = document.createElement('div'); view.id = 'weeklyView'; view.style.display = 'none';
    view.innerHTML = '<div id="weeklyInner"></div>';
    wrap.appendChild(view);
    document.addEventListener('click', function (e) { var it = e.target.closest && e.target.closest('.sb-item'); if (it && it.id !== 'sb-weekly') { var v = document.getElementById('weeklyView'); if (v) { v.style.display = 'none'; } S.open = false; } }, true);
    // รอข้อมูล Facebook โหลดเพิ่ม แล้ววาดใหม่ (ไม่วาดระหว่างที่คนกำลังเลื่อนอ่านถ้าข้อมูลไม่เปลี่ยน)
    setInterval(function () { if (!visible()) { return; } var r = fbLoaded().rows; if (r !== S.lastN) { S.lastN = r; render(); } }, 5000);
    var m = /^#weekly(?:=(\d{4}-\d\d-\d\d))?/.exec(location.hash || '');
    if (m) { if (m[1]) { S.start = monday(parse(m[1])); if (S.start > defStart()) { S.start = defStart(); } } setTimeout(function () { open(item); }, 800); }
    window.addEventListener('hashchange', function () { var x = /^#weekly(?:=(\d{4}-\d\d-\d\d))?/.exec(location.hash || ''); if (x) { if (x[1]) { S.start = monday(parse(x[1])); } open(item); } });
  }

  var css = document.createElement('style');
  css.textContent = [
    '#weeklyInner{padding:0}',
    '.wk-wrap{--ink:#0F172A;--mute:#475569;--line:#E5E7EB;--blue:#2563EB;font-family:"IBM Plex Sans Thai","Sarabun",system-ui,sans-serif;color:var(--ink);background:#F5F6FA;padding:24px 28px 64px;font-variant-numeric:tabular-nums;min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column;gap:16px}',
    '.wk-wrap *{box-sizing:border-box}.wk-wrap h1{margin:0;font-size:26px;font-weight:700}.wk-wrap h2{margin:0;font-size:16px;font-weight:700}.wk-wrap h3{margin:0;font-size:16px;font-weight:700}',
    '.wk-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:14px}.wk-hsub{font-size:13px;color:var(--mute);margin-top:4px}',
    '.wk-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.wk-week{display:flex;align-items:center;background:#fff;border:1px solid var(--line);border-radius:10px}.wk-week button{border:0;background:none;width:40px;height:40px;font-size:20px;color:var(--mute);cursor:pointer}.wk-week button[disabled]{opacity:.3;cursor:default}.wk-week span{min-width:130px;text-align:center;font-weight:600}',
    '.wk-btn{height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--line);background:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:var(--ink)}.wk-btn:hover{border-color:#93C5FD}',
    '.wk-card{background:#fff;border:1px solid var(--line);border-radius:12px}.wk-pad{padding:16px 18px;display:flex;flex-direction:column;gap:10px}.wk-load{color:var(--mute)}',
    '.wk-note{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.6}',
    '.wk-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.wk-kpi{padding:14px 16px;display:flex;flex-direction:column;gap:4px}.wk-lbl{font-size:13px;color:var(--mute)}.wk-val{font-size:24px;font-weight:700;line-height:1.2}.wk-sub{font-size:12px;color:var(--mute)}',
    '.wk-up{color:#15803D;font-weight:600}.wk-dn{color:#B91C1C;font-weight:600}',
    '.wk-hl{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.wk-hli{display:flex;justify-content:space-between;gap:8px;font-size:14px}',
    '.wk-h2row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px}.wk-legend{font-size:12px;color:var(--mute);display:flex;align-items:center;gap:6px;flex-wrap:wrap}.wk-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}.wk-legend i.ln{width:16px;height:2px;background:#F59E0B}',
    '.wk-dot{width:9px;height:9px;border-radius:99px;display:inline-block;margin-right:6px;flex:none}.wk-dot.wk-bad,.wk-legend i.wk-bad{background:#EF4444}.wk-dot.wk-warn,.wk-legend i.wk-warn{background:#F59E0B}.wk-dot.wk-good,.wk-legend i.wk-good{background:#22C55E}.wk-dot.wk-mute{background:#CBD5E1}',
    '.wk-sec{border-bottom:1px solid var(--line)}',
    '.wk-fix{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.wk-fixb{border:1px solid #FECACA;background:#FEF2F2;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}.wk-fixb.ok{border-color:var(--line);background:#F8FAFC}.wk-fixh{display:flex;gap:10px;align-items:flex-start}.wk-fixh>span{font-size:18px}.wk-fixh div{display:flex;flex-direction:column}.wk-fixh small{font-size:12px;color:var(--mute)}',
    '.wk-chips{display:flex;flex-wrap:wrap;gap:6px}.wk-chips button{border:1px solid #FCA5A5;background:#fff;color:#991B1B;border-radius:99px;padding:3px 10px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}',
    '.wk-scroll{overflow-x:auto}.wk-t{width:100%;border-collapse:collapse;font-size:13px;min-width:820px}.wk-t th{padding:9px 12px;font-size:12px;font-weight:600;color:var(--mute);text-align:left;background:#F8FAFC;border-bottom:1px solid var(--line);white-space:nowrap}.wk-t td{padding:9px 12px;border-bottom:1px solid #EEF1F6;white-space:nowrap;vertical-align:middle}.wk-t .r{text-align:right}.wk-t td small{display:block;font-size:11px;color:var(--mute);margin-left:15px}.wk-t td.r small{margin-left:0}',
    '.wk-link{border:0;background:none;padding:0;font:inherit;font-weight:600;color:#1D4ED8;cursor:pointer;text-align:left}',
    '.wk-h2{margin:6px 0 0!important}.wk-prods{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr));gap:12px}.wk-prods>*,.wk-kpis>*,.wk-hl>*,.wk-fix>*{min-width:0}.wk-wrap{max-width:100%;overflow-x:hidden}',
    '.wk-hm{display:none}.wk-hmr{display:flex;flex-direction:column;gap:8px;width:100%;text-align:left;border:0;border-bottom:1px solid #EEF1F6;background:#fff;padding:12px 14px;font:inherit;color:var(--ink);cursor:pointer}.wk-hmh{display:flex;align-items:center;gap:6px}.wk-hmh b{flex:1;font-size:15px}.wk-hms{font-weight:700;font-size:14px}.wk-hms small{font-size:12px}',
    '.wk-hmg{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}.wk-hmc{border-radius:8px;padding:5px 4px;text-align:center;display:flex;flex-direction:column;min-width:0}.wk-hmc span{font-size:10px;color:var(--mute);white-space:nowrap}.wk-hmc b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wk-c-bad{background:#FEE2E2}.wk-c-bad b{color:#B91C1C}.wk-c-warn{background:#FEF3C7}.wk-c-warn b{color:#B45309}.wk-c-good{background:#F0FDF4}.wk-c-good b{color:#15803D}.wk-c-mute{background:#F1F5F9}',
    '.wk-prod{scroll-margin-top:80px;transition:box-shadow .3s}.wk-prod.wk-flash{box-shadow:0 0 0 3px #93C5FD}',
    '.wk-pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600}.wk-pill.wk-bad{background:#FEE2E2;color:#B91C1C}.wk-pill.wk-warn{background:#FEF3C7;color:#B45309}.wk-pill.wk-good{background:#DCFCE7;color:#15803D}',
    '.wk-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 12px}.wk-mini div{display:flex;flex-direction:column;min-width:0}.wk-mini span{font-size:12px;color:var(--mute)}.wk-mini b{font-size:15px}.wk-mini small{font-size:12px;color:var(--mute)}',
    '.wk-todo{border-top:1px solid #EEF1F6;padding-top:10px;font-size:13px}.wk-todo ul{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px;line-height:1.5}.wk-t-bad::marker{color:#EF4444}.wk-t-warn::marker{color:#F59E0B}.wk-t-good::marker{color:#22C55E}',
    '.wk-cl{display:flex;flex-direction:column;gap:6px;font-size:13px}.wk-camp{display:flex;flex-direction:column;gap:2px;text-align:left;border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 10px;font:inherit;cursor:pointer;color:var(--ink);min-width:0}.wk-camp:hover{border-color:#93C5FD;background:#F8FBFF}.wk-ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.wk-cm{font-size:12px;color:var(--mute)}',
    '.wk-foot{font-size:12px;color:var(--mute);line-height:1.6}',
    '@media (max-width:640px){.wk-wrap{padding:14px 12px 48px;gap:12px}.wk-wrap h1{font-size:22px}.wk-head{align-items:stretch}.wk-head>div:first-child{width:100%}.wk-tools{width:100%}.wk-week{flex:1;justify-content:space-between}.wk-week span{min-width:0;font-size:14px}.wk-btn{padding:0 12px}',
    '.wk-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.wk-kpi{padding:10px 12px}.wk-lbl{font-size:12px}.wk-val{font-size:19px}.wk-sub{font-size:11px}',
    '.wk-hl{grid-template-columns:1fr;gap:8px}.wk-pad{padding:12px 14px}.wk-fix{grid-template-columns:1fr;gap:8px}.wk-fixb{padding:10px}.wk-fixb.ok{display:none}',
    '.wk-scroll{display:none}.wk-hm{display:block}.wk-chartbox{height:200px!important}.wk-legend{font-size:11px}',
    '.wk-prods{grid-template-columns:minmax(0,1fr)}.wk-mini{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.wk-mini b{font-size:14px}.wk-mini span{font-size:11px}.wk-todo{font-size:13px}}'
  ].join('\n');
  document.head.appendChild(css);
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', install); } else { install(); }
})();
