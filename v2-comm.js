/* v2-comm.js — หน้า "ค่าคอมมิชชั่น" แบบใหม่ (แทน renderCommission เดิม)
   - ข้อมูล/สูตรเดิมทั้งหมด: commLoad · commCalc · commDays · COMM_ANALYST_PRODUCTS · เป้า/คลิปนางฟ้า (NPoint)
   - ยอดยิง/ยอดขาย เติมจาก CasperCall อัตโนมัติ (เฉพาะช่องว่าง) + ปุ่มดึงใหม่ทับทั้งรอบ */
(function () {
  'use strict';
  if (typeof window.commLoad !== 'function' || typeof window.commCalc !== 'function') { return; }
  var API = 'https://richbiotech-fb-proxy.ads02.workers.dev/_casper/month';
  var COL = ['#2563EB', '#0EA5E9', '#14B8A6', '#8B5CF6', '#F59E0B', '#EC4899', '#64748B', '#22C55E'];
  var CK = {}, LOADING = {}, AUTO = {};
  var S = { tab: null, data: null, prev: null, yr: 0, mo: 0, saveT: null, sumT: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function n0(v) { return (Math.round(+v || 0)).toLocaleString('en-US'); }
  function baht(v) { return '฿' + n0(v); }
  function short(v) { v = +v || 0; return v >= 1e6 ? '฿' + (v / 1e6).toFixed(2) + ' ล.' : v >= 1e4 ? '฿' + (v / 1e3).toFixed(0) + 'K' : baht(v); }
  function tok() { try { return localStorage.getItem('rb_auth_token'); } catch (e) { return null; } }
  function readOnly() { try { return sessionStorage.getItem('rb_auth') === 'hr' && sessionStorage.getItem('rb_perm') !== 'edit'; } catch (e) { return false; } }
  function months(yr, mo) { var pm = mo === 1 ? 12 : mo - 1, py = mo === 1 ? yr - 1 : yr; return [py + '-' + p2(pm), yr + '-' + p2(mo)]; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s+]/g, ''); }
  function visible() { var w = document.getElementById('commissionViewInner'); return !!(w && w.offsetParent); }
  function isLord(p) { return ['The lord', 'Wolf', 'Sopink', 'Olymplus', 'BLING&SYN'].indexOf(p) >= 0; }

  /* ── CasperCall ─────────────────────────────────────────── */
  function fetchM(m) {
    if ((CK[m] && Date.now() - CK[m].t < 600000) || LOADING[m]) { return; }
    var t = tok(); if (!t) { return; }
    LOADING[m] = 1;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, m: m }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { LOADING[m] = 0; if (j && j.daily) { CK[m] = { t: Date.now(), d: j.daily, ak: j.adsThrough || '' }; if (visible() && !busy()) { render(); } } })
      .catch(function () { LOADING[m] = 0; });
  }
  function casperVal(dk, p) {
    var c = CK[dk.slice(0, 7)]; if (!c || !c.d[dk]) { return null; }
    var day = c.d[dk], k = norm(p), hit = null;
    Object.keys(day).forEach(function (n) { if (norm(n) === k) { hit = day[n]; } });
    if (!hit || (!hit.a && !hit.s)) { return null; }
    return { s: Math.round(hit.a || 0), r: Math.round(hit.s || 0) };
  }
  function fill(data, yr, mo, force) {
    commGetAnalysts().forEach(function (a) {
      (COMM_ANALYST_PRODUCTS[a] || []).forEach(function (p) {
        commDays(yr, mo).forEach(function (d) {
          var v = casperVal(d.dk, p); if (!v) { return; }
          var cur = data[a] && data[a][p] && data[a][p][d.dk];
          if (cur && ((+cur.s) || (+cur.r)) && !force) { return; }
          if (!data[a]) { data[a] = {}; } if (!data[a][p]) { data[a][p] = {}; }
          data[a][p][d.dk] = { s: v.s, r: v.r };
          AUTO[a + '|' + p + '|' + d.dk] = 1;
        });
      });
    });
    return data;
  }
  var _load = window.commLoad;
  window.commLoad = function (yr, mo) { var d = _load(yr, mo) || {}; try { fill(d, yr, mo, false); } catch (e) {} return d; };

  /* ── data helpers ───────────────────────────────────────── */
  function cell(a, p, dk) {
    var d = S.data, q = S.prev;
    if (d[a] && d[a][p] && d[a][p][dk]) { return d[a][p][dk]; }
    if (q[a] && q[a][p] && q[a][p][dk]) { return q[a][p][dk]; }
    return null;
  }
  function busy() { var e = document.activeElement; return !!(e && e.closest && e.closest('#commissionViewInner') && e.tagName === 'INPUT'); }
  function stats(a) {
    var prods = COMM_ANALYST_PRODUCTS[a] || [], days = commDays(S.yr, S.mo);
    var o = { a: a, com: 0, sp: 0, rv: 0, comDays: {}, workDays: {}, prods: [], spark: [] };
    prods.forEach(function (p, pi) {
      var ps = { p: p, c: COL[pi % COL.length], sp: 0, rv: 0, com: 0 };
      days.forEach(function (d, di) {
        var r = cell(a, p, d.dk), sp = (r && +r.s) || 0, rv = (r && +r.r) || 0, c = commCalc(sp, rv, p).com;
        ps.sp += sp; ps.rv += rv; ps.com += c;
        if (sp || rv) { o.workDays[d.dk] = 1; } if (c) { o.comDays[d.dk] = 1; }
        o.spark[di] = (o.spark[di] || 0) + c;
      });
      o.com += ps.com; o.sp += ps.sp; o.rv += ps.rv; o.prods.push(ps);
    });
    o.clips = commGetClips(a, S.yr, S.mo); o.clips2 = commGetClips2(a, S.yr, S.mo);
    o.bonus = o.clips * 1000 + o.clips2 * 500; o.total = o.com + o.bonus;
    o.goal = commGetGoal(a, S.yr, S.mo);
    // เดือนก่อน
    var pm = S.mo === 1 ? 12 : S.mo - 1, py = S.mo === 1 ? S.yr - 1 : S.yr, pd = commLoad(py, pm), pq = commLoad(pm === 1 ? py - 1 : py, pm === 1 ? 12 : pm - 1);
    o.prevTot = 0;
    prods.forEach(function (p) { commDays(py, pm).forEach(function (d) { var r = (pd[a] && pd[a][p] && pd[a][p][d.dk]) || (pq[a] && pq[a][p] && pq[a][p][d.dk]); if (r) { o.prevTot += commCalc(+r.s || 0, +r.r || 0, p).com; } }); });
    // สะสมปีนี้
    o.ytd = 0;
    for (var m = 1; m <= S.mo; m++) {
      var md = commLoad(S.yr, m);
      prods.forEach(function (p) { var dp = (md[a] && md[a][p]) || {}; Object.keys(dp).forEach(function (dk) { o.ytd += commCalc(+dp[dk].s || 0, +dp[dk].r || 0, p).com; }); });
      o.ytd += commGetClips(a, S.yr, m) * 1000 + commGetClips2(a, S.yr, m) * 500;
    }
    return o;
  }
  function pctCls(p) { return p >= 70 ? 'bad' : p >= 52 ? 'warn' : p > 0 ? 'good' : 'mute'; }

  /* ── render ─────────────────────────────────────────────── */
  function spark(vals) {
    var mx = Math.max.apply(null, vals.concat([1])), w = 240, h = 40;
    if (!vals.some(function (v) { return v > 0; })) { return '<div class="cm2-nospark">ยังไม่มีวันที่ได้ค่าคอม</div>'; }
    var pts = vals.map(function (v, i) { return (w * i / Math.max(vals.length - 1, 1)).toFixed(1) + ',' + (h - (v / mx) * (h - 4) - 2).toFixed(1); }).join(' ');
    return '<svg class="cm2-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polygon points="0,' + h + ' ' + pts + ' ' + w + ',' + h + '" fill="#DBEAFE"/><polyline points="' + pts + '" fill="none" stroke="#2563EB" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
  }
  function sumHtml() {
    var all = commGetAnalysts().map(stats).sort(function (x, y) { return y.total - x.total; });
    var T = { com: 0, sp: 0, rv: 0, bonus: 0 };
    all.forEach(function (s) { T.com += s.total; T.sp += s.sp; T.rv += s.rv; T.bonus += s.bonus; });
    var pct = T.rv ? T.sp / T.rv * 100 : 0;
    var h = '<div class="cm2-kpis">' +
      kpi('ค่าคอมรวมทั้งทีม', baht(T.com), T.bonus ? 'รวมโบนัสคลิป ' + baht(T.bonus) : 'รอบ ' + esc(commPeriodLabel(S.yr, S.mo))) +
      kpi('ยอดยิงแอดรวม', short(T.sp), 'ทุกสินค้าที่คิดค่าคอม') +
      kpi('ยอดขายรวม', short(T.rv), 'จาก CasperCall / กรอกเอง') +
      kpi('%Ads รวม', T.rv ? pct.toFixed(1) + '%' : '—', 'ยอดยิง ÷ ยอดขาย', T.rv ? pctCls(pct) : '') +
      '</div><div class="cm2-cards">';
    all.forEach(function (s, i) {
      var aq = esc(JSON.stringify(s.a));
      var vs = s.prevTot > 0 ? Math.round((s.total - s.prevTot) / s.prevTot * 100) : null;
      var gp = s.goal > 0 ? Math.round(s.total / s.goal * 100) : 0;
      var sp = s.rv ? s.sp / s.rv * 100 : 0;
      h += '<div class="cm2-card cm2-pad">' +
        '<div class="cm2-hd">' + (typeof avHtmlUpload === 'function' ? avHtmlUpload(s.a, 44) : '') +
        '<div class="cm2-who"><b>' + esc(s.a) + '</b><span>' + s.prods.length + ' สินค้า · ทีมยิงแอด</span></div>' +
        '<span class="cm2-rank' + (i === 0 ? ' top' : '') + '">อันดับ ' + (i + 1) + '</span></div>' +
        '<div class="cm2-big">' + baht(s.total) + '</div>' +
        '<div class="cm2-row"><span class="cm2-pill ' + (vs === null ? 'mute' : vs >= 0 ? 'good' : 'bad') + '">' + (vs === null ? 'ไม่มีข้อมูลเดือนก่อน' : (vs >= 0 ? '▲ ' : '▼ ') + Math.abs(vs) + '% เทียบเดือนก่อน') + '</span><span class="cm2-mute">สะสมปีนี้ <b>' + baht(s.ytd) + '</b></span></div>' +
        '<div class="cm2-goal"><label>เป้า ฿</label><input class="comm-goal-inp cm2-in" type="number" value="' + (s.goal || '') + '" placeholder="0" onchange="csumSaveGoal(' + aq + ',' + S.yr + ',' + S.mo + ',this.value)">' +
        (s.goal ? '<span class="cm2-' + (gp >= 100 ? 'good' : gp >= 70 ? 'warn' : 'bad') + 't">' + gp + '%</span>' : '<span class="cm2-mute">ยังไม่ตั้งเป้า</span>') + '</div>' +
        '<div class="cm2-bar"><i style="width:' + Math.min(gp, 100) + '%;background:' + (gp >= 100 ? '#16A34A' : gp >= 70 ? '#F59E0B' : '#2563EB') + '"></i></div>' +
        (s.a === 'บุ๋มบิ๋ม' ? clipRow('คลิปนางฟ้า', 'csumSaveClips', aq, s.clips, 1000) + clipRow('คลิปนางฟ้ารอง', 'csumSaveClips2', aq, s.clips2, 500) : '') +
        '<div class="cm2-stats"><div><b>' + short(s.sp) + '</b><span>ยอดยิง</span></div><div><b class="cm2-' + pctCls(sp) + 't">' + (s.rv ? sp.toFixed(1) + '%' : '—') + '</b><span>%Ads</span></div><div><b>' + Object.keys(s.comDays).length + '/' + Object.keys(s.workDays).length + '</b><span>วันได้คอม / วันยิง</span></div></div>' +
        spark(s.spark) +
        '<div class="cm2-plist">' + s.prods.map(function (p) {
          var pp = p.rv ? p.sp / p.rv * 100 : 0;
          return '<div><i style="background:' + p.c + '"></i><span class="cm2-pn">' + esc(p.p) + (isLord(p.p) ? ' <em>ตาราง LORD</em>' : '') + '</span><span class="cm2-mute">' + (p.rv ? pp.toFixed(1) + '%' : '—') + '</span><b>' + baht(p.com) + '</b></div>';
        }).join('') + '</div>' +
        '<div class="cm2-row cm2-acts"><button class="cm2-btn" onclick="commV2.tab(' + aq + ',true)">ดูตารางรายวัน</button>' +
        (typeof openCommDetail === 'function' ? '<button class="cm2-link" onclick="openCommDetail(' + aq + ')">วิเคราะห์ / แนะนำ →</button>' : '') + '</div>' +
        '</div>';
    });
    return h + '</div>';
  }
  function kpi(l, v, sub, cls) { return '<div class="cm2-card cm2-kpi"><span class="cm2-lbl">' + l + '</span><span class="cm2-val' + (cls ? ' cm2-' + cls + 't' : '') + '">' + v + '</span><span class="cm2-ksub">' + sub + '</span></div>'; }
  function clipRow(l, fn, aq, v, rate) { return '<div class="cm2-goal"><label>' + l + '</label><input class="comm-clip-inp cm2-in" type="number" value="' + (v || '') + '" placeholder="0" onchange="' + fn + '(' + aq + ',' + S.yr + ',' + S.mo + ',this.value)"><span class="cm2-mute">× ' + baht(rate) + (v ? ' = +' + baht(v * rate) : '') + '</span></div>'; }

  function tableHtml(a) {
    var prods = COMM_ANALYST_PRODUCTS[a] || [], days = commDays(S.yr, S.mo), ro = readOnly();
    var h1 = '<th class="cm2-sd" rowspan="2">วันที่</th>', h2 = '';
    prods.forEach(function (p, pi) {
      h1 += '<th colspan="4" class="cm2-g"><i style="background:' + COL[pi % COL.length] + '"></i>' + esc(p) + '</th>';
      h2 += '<th class="cm2-g r">ยอดยิง</th><th class="r">ยอดขาย</th><th class="r">%Ads</th><th class="r">คอม</th>';
    });
    h1 += '<th class="cm2-g r" rowspan="2">รวมคอม<br>ต่อวัน</th>';
    var body = '', foot = [];
    prods.forEach(function () { foot.push({ sp: 0, rv: 0, com: 0 }); });
    var grand = 0;
    days.forEach(function (d) {
      var row = '', tot = 0;
      prods.forEach(function (p, pi) {
        var r = cell(a, p, d.dk), sp = (r && +r.s) || 0, rv = (r && +r.r) || 0, res = commCalc(sp, rv, p);
        var auto = AUTO[a + '|' + p + '|' + d.dk] ? ' auto' : '';
        foot[pi].sp += sp; foot[pi].rv += rv; foot[pi].com += res.com; tot += res.com;
        var at = ' data-a="' + esc(a) + '" data-p="' + esc(p) + '" data-d="' + d.dk + '"' + (ro ? ' disabled' : '') + ' oninput="commV2.inp(this)"';
        row += '<td class="cm2-g"><input class="comm-edit cm2-cin' + auto + '" data-f="s" inputmode="numeric" value="' + (sp || '') + '"' + at + '></td>' +
          '<td><input class="comm-edit cm2-cin' + auto + '" data-f="r" inputmode="numeric" value="' + (rv || '') + '"' + at + '></td>' +
          '<td class="r" data-o="pct">' + pctOut(sp, rv, res) + '</td><td class="r" data-o="com">' + comOut(sp, rv, res) + '</td>';
      });
      grand += tot;
      body += '<tr data-dk="' + d.dk + '"' + (tot ? '' : ' class="dim"') + '><td class="cm2-sd">' + d.label + '</td>' + row + '<td class="cm2-g r" data-o="tot">' + (tot ? '<b>' + baht(tot) + '</b>' : '<span class="cm2-mute">—</span>') + '</td></tr>';
    });
    var ft = '<td class="cm2-sd">รวม</td>';
    foot.forEach(function (f, pi) {
      var pc = f.rv ? f.sp / f.rv * 100 : 0;
      ft += '<td class="cm2-g r" data-f="' + pi + 's">' + n0(f.sp) + '</td><td class="r">' + n0(f.rv) + '</td><td class="r">' + (f.rv ? '<span class="cm2-pill ' + pctCls(pc) + '">' + pc.toFixed(1) + '%</span>' : '—') + '</td><td class="r"><b>' + baht(f.com) + '</b></td>';
    });
    ft += '<td class="cm2-g r"><b>' + baht(grand) + '</b></td>';
    return '<div class="cm2-scroll"><table class="cm2-t"><thead><tr>' + h1 + '</tr><tr>' + h2 + '</tr></thead><tbody>' + body + '</tbody><tfoot><tr>' + ft + '</tr></tfoot></table></div>';
  }
  function pctOut(sp, rv, res) { return (sp || rv) ? '<span class="cm2-pill ' + pctCls(res.pct) + '">' + (rv ? res.pct.toFixed(1) + '%' : '—') + '</span>' : '<span class="cm2-mute">—</span>'; }
  function comOut(sp, rv, res) { return (sp || rv) ? (res.com ? '<b class="cm2-goodt">' + n0(res.com) + '</b>' : '<span class="cm2-mute">0</span>') : '<span class="cm2-mute">—</span>'; }

  function render() {
    var wrap = document.getElementById('commissionViewInner'); if (!wrap) { return; }
    S.yr = commYear; S.mo = commMonth;
    var pm = S.mo === 1 ? 12 : S.mo - 1, py = S.mo === 1 ? S.yr - 1 : S.yr;
    months(S.yr, S.mo).forEach(fetchM);
    S.data = commLoad(S.yr, S.mo); S.prev = commLoad(py, pm);
    var an = commGetAnalysts(); if (an.indexOf(S.tab) < 0) { S.tab = an[0]; }
    var ms = months(S.yr, S.mo), ak = (CK[ms[1]] && CK[ms[1]].ak) || (CK[ms[0]] && CK[ms[0]].ak) || '';
    var cInfo = ak ? 'ข้อมูล CasperCall ถึง ' + (+ak.slice(8)) + ' ' + THAI_MO_SHORT[+ak.slice(5, 7) - 1] : (LOADING[ms[0]] || LOADING[ms[1]] ? 'กำลังดึง CasperCall…' : 'ยังไม่ได้ดึง CasperCall');
    var tabs = an.map(function (a) { return '<button class="' + (a === S.tab ? 'on' : '') + '" onclick="commV2.tab(' + esc(JSON.stringify(a)) + ')">' + esc(a) + '</button>'; }).join('');
    wrap.innerHTML = '<div class="cm2-wrap">' +
      '<div class="cm2-head"><div><h1>ค่าคอมมิชชั่น</h1><div class="cm2-sub">รอบ ' + esc(commPeriodLabel(S.yr, S.mo)) + ' · คิดรายวันต่อสินค้า จากยอดยิงและ %Ads</div></div>' +
      '<div class="cm2-tools"><span id="commSaveIndicator" class="cm2-saved"></span>' +
      '<div class="cm2-month"><button onclick="commPrevMonth()" aria-label="เดือนก่อน">‹</button><span>' + THAI_MO_SHORT[S.mo - 1] + ' ' + (S.yr + 543) + '</span><button onclick="commNextMonth()" aria-label="เดือนถัดไป">›</button></div></div></div>' +
      '<div id="cm2Sum">' + sumHtml() + '</div>' +
      '<div class="cm2-card cm2-pad"><div class="cm2-h2row"><h2>แนวโน้มค่าคอมรวมทั้งทีม (13 เดือน)</h2><span class="cm2-legend"><i style="background:#2563EB"></i>ค่าคอม <i class="ln"></i>ยอดยิงแอด</span></div><div style="position:relative;height:220px"><canvas id="commTrendChart"></canvas></div></div>' +
      '<div class="cm2-card" id="cm2Detail"><div class="cm2-pad cm2-dhead"><div class="cm2-h2row"><h2>ตารางรายวัน</h2><div class="cm2-tabs">' + tabs + '</div></div>' +
      '<div class="cm2-note"><span class="cm2-sw"></span> ช่องสีเขียว = ดึงจาก CasperCall (ยอดยิง = ค่าแอดที่คีย์ · ยอดขาย = ยอดขายสินค้านั้น) · ' + cInfo +
      (readOnly() ? '' : ' <button class="cm2-link" onclick="commV2.refill()">↻ ดึงจาก Casper ใหม่ (ทับทุกช่อง)</button>') + '</div></div>' +
      '<div id="cm2Table">' + tableHtml(S.tab) + '</div></div>' +
      '<div class="cm2-card cm2-pad cm2-rates"><h2>อัตราค่าคอมต่อวัน</h2><div class="cm2-note">ได้ค่าคอมเมื่อยอดยิงต่อวันต่อสินค้า ≥ ฿30,000 และ %Ads ต่ำกว่า 70% · ยิ่ง %Ads ต่ำและยอดยิงสูง ยิ่งได้มาก · The lord / Wolf / Sopink / Olymplus / BLING&SYN ใช้ตาราง LORD</div>' + rateTable() + '</div>' +
      '</div>';
    trend();
  }
  function rateTable() {
    var hd = ['≥52%', '50–52%', '48–50%', '45–48%', '42–45%', '38–42%', '<38%'];
    function t(tbl, name) { return '<div><div class="cm2-mute" style="margin:6px 0">' + name + '</div><div class="cm2-scroll"><table class="cm2-t cm2-rt"><thead><tr><th>ยอดยิง/วัน</th>' + hd.map(function (x) { return '<th class="r">' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + tbl.map(function (r) { return '<tr><td>≥ ' + baht(r.min) + '</td>' + r.r.map(function (v) { return '<td class="r">' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>'; }
    return '<details><summary class="cm2-link">ดูตารางอัตรา</summary>' + t(COMM_TABLE, 'ตารางปกติ') + t(COMM_TABLE_LORD, 'ตาราง LORD (The lord / Wolf / Sopink / Olymplus / BLING&SYN)') + '</details>';
  }
  function trend() {
    requestAnimationFrame(function () {
      var ctx = document.getElementById('commTrendChart'); if (!ctx || !window.Chart) { return; }
      var L = [], C = [], P = [];
      for (var i = 12; i >= 0; i--) {
        var m = S.mo - i, y = S.yr; while (m < 1) { m += 12; y--; }
        var md = commLoad(y, m), c = 0, s = 0;
        commGetAnalysts().forEach(function (a) { (COMM_ANALYST_PRODUCTS[a] || []).forEach(function (p) { var dp = (md[a] && md[a][p]) || {}; Object.keys(dp).forEach(function (dk) { s += +dp[dk].s || 0; c += commCalc(+dp[dk].s || 0, +dp[dk].r || 0, p).com; }); }); });
        L.push(THAI_MO_SHORT[m - 1] + String(y + 543).slice(-2)); C.push(c); P.push(s);
      }
      if (window.chartInst && chartInst.commTrend) { try { chartInst.commTrend.destroy(); } catch (e) {} }
      var k = function (v) { return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v; };
      var ch = new Chart(ctx, {
        type: 'bar',
        data: { labels: L, datasets: [
          { type: 'bar', label: 'ค่าคอม', data: C, backgroundColor: '#2563EB', borderRadius: 4, maxBarThickness: 28, yAxisID: 'y', order: 2 },
          { type: 'line', label: 'ยอดยิงแอด', data: P, borderColor: '#F59E0B', backgroundColor: '#F59E0B', borderWidth: 2, pointRadius: 3, tension: 0.3, yAxisID: 'y2', order: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ฿' + n0(c.parsed.y); } } } },
          scales: { x: { grid: { display: false }, ticks: { color: '#64748B', font: { size: 11 } } },
            y: { position: 'left', grid: { color: '#EEF1F6' }, ticks: { color: '#2563EB', font: { size: 11 }, callback: k } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#B45309', font: { size: 11 }, callback: k } } } }
      });
      if (window.chartInst) { chartInst.commTrend = ch; }
    });
  }

  /* ── edit & save ────────────────────────────────────────── */
  function clean(d) {
    Object.keys(d).forEach(function (a) { Object.keys(d[a]).forEach(function (p) { Object.keys(d[a][p]).forEach(function (dk) { var x = d[a][p][dk]; if (!(+x.s) && !(+x.r)) { delete d[a][p][dk]; } }); }); });
    return d;
  }
  function save() {
    var key = S.yr + '-' + p2(S.mo), d = clean(S.data);
    try { commSave(S.yr, S.mo, d); } catch (e) {}
    try { _commNpointData[key] = d; } catch (e) {}
    try { commSheetData = {}; } catch (e) {}
    try { _leavePost(window._leaveCache || {}); } catch (e) {}
    var si = document.getElementById('commSaveIndicator');
    if (si) { si.textContent = '✓ บันทึกแล้ว'; si.style.opacity = '1'; clearTimeout(si._t); si._t = setTimeout(function () { si.style.opacity = '0'; }, 2000); }
  }
  window.commV2 = {
    tab: function (a, scroll) {
      S.tab = a;
      var t = document.getElementById('cm2Table'); if (t) { t.innerHTML = tableHtml(a); }
      document.querySelectorAll('#cm2Detail .cm2-tabs button').forEach(function (b) { b.classList.toggle('on', b.textContent === a); });
      if (scroll) { var dd = document.getElementById('cm2Detail'); if (dd) { dd.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
    },
    inp: function (el) {
      if (readOnly()) { return; }
      var a = el.getAttribute('data-a'), p = el.getAttribute('data-p'), dk = el.getAttribute('data-d'), f = el.getAttribute('data-f');
      var v = parseFloat(String(el.value || '').replace(/[,\s]/g, '')) || 0;
      if (!S.data[a]) { S.data[a] = {}; } if (!S.data[a][p]) { S.data[a][p] = {}; }
      var cur = S.data[a][p][dk] || cell(a, p, dk) || { s: 0, r: 0 };
      S.data[a][p][dk] = { s: f === 's' ? v : (+cur.s || 0), r: f === 'r' ? v : (+cur.r || 0) };
      delete AUTO[a + '|' + p + '|' + dk];
      el.classList.remove('auto');
      var td = el.closest('td'), tr = el.closest('tr'), x = S.data[a][p][dk], res = commCalc(x.s, x.r, p);
      var cells = [td]; var n = td; while (n && !n.matches('[data-o="com"]')) { n = n.nextElementSibling; if (n) { cells.push(n); } }
      cells.forEach(function (c) { if (c.matches('[data-o="pct"]')) { c.innerHTML = pctOut(x.s, x.r, res); } if (c.matches('[data-o="com"]')) { c.innerHTML = comOut(x.s, x.r, res); } });
      var tot = 0; (COMM_ANALYST_PRODUCTS[a] || []).forEach(function (pp) { var r = cell(a, pp, dk); if (r) { tot += commCalc(+r.s || 0, +r.r || 0, pp).com; } });
      var tc = tr.querySelector('[data-o="tot"]'); if (tc) { tc.innerHTML = tot ? '<b>' + baht(tot) + '</b>' : '<span class="cm2-mute">—</span>'; }
      tr.classList.toggle('dim', !tot);
      clearTimeout(S.saveT); S.saveT = setTimeout(save, 400);
      clearTimeout(S.sumT); S.sumT = setTimeout(function () { var s = document.getElementById('cm2Sum'); if (s) { s.innerHTML = sumHtml(); } }, 900);
    },
    refill: function () {
      if (readOnly()) { return; }
      if (!confirm('เขียนทับยอดยิง/ยอดขายทุกช่องในรอบนี้ด้วยตัวเลขจาก CasperCall?')) { return; }
      fill(S.data, S.yr, S.mo, true); save(); render();
    }
  };
  window.renderCommission = render;

  /* ── CSS ────────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent = [
    '#commissionViewInner{padding:0!important;max-width:none!important}',
    '.cm2-wrap{--ink:#0F172A;--mute:#475569;--line:#E5E7EB;--blue:#2563EB;font-family:"IBM Plex Sans Thai","Sarabun",system-ui,sans-serif;color:var(--ink);background:#F5F6FA;padding:24px 28px 64px;font-variant-numeric:tabular-nums;min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column;gap:16px}',
    '.cm2-wrap *{box-sizing:border-box}.cm2-wrap h1{margin:0;font-size:26px;font-weight:700}.cm2-wrap h2{margin:0;font-size:16px;font-weight:700}',
    '.cm2-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:14px}.cm2-sub{font-size:13px;color:var(--mute);margin-top:4px}',
    '.cm2-tools{display:flex;gap:10px;align-items:center}.cm2-saved{font-size:13px;color:#15803D;font-weight:600;opacity:0;transition:opacity .4s}',
    '.cm2-month{display:flex;align-items:center;background:#fff;border:1px solid var(--line);border-radius:10px}.cm2-month button{border:0;background:none;width:40px;height:40px;font-size:20px;color:var(--mute);cursor:pointer}.cm2-month span{min-width:110px;text-align:center;font-weight:600}',
    '.cm2-card{background:#fff;border:1px solid var(--line);border-radius:12px}.cm2-pad{padding:18px 20px;display:flex;flex-direction:column;gap:12px}',
    '.cm2-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:16px}.cm2-kpi{padding:16px 18px;display:flex;flex-direction:column;gap:6px}.cm2-lbl{font-size:13px;color:var(--mute)}.cm2-val{font-size:26px;font-weight:700;line-height:1.2}.cm2-ksub{font-size:12px;color:var(--mute)}',
    '.cm2-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}',
    '.cm2-hd{display:flex;align-items:center;gap:12px}.cm2-who{display:flex;flex-direction:column;flex:1;min-width:0}.cm2-who b{font-size:16px}.cm2-who span{font-size:12px;color:var(--mute)}',
    '.cm2-rank{font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px;background:#F1F5F9;color:var(--mute)}.cm2-rank.top{background:#FEF3C7;color:#B45309}',
    '.cm2-big{font-size:32px;font-weight:700;line-height:1.1}.cm2-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}',
    '.cm2-mute{color:var(--mute);font-size:12px;font-weight:400}.cm2-mute b{color:var(--ink)}',
    '.cm2-pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}.cm2-pill.good{background:#DCFCE7;color:#15803D}.cm2-pill.bad{background:#FEE2E2;color:#B91C1C}.cm2-pill.warn{background:#FEF3C7;color:#B45309}.cm2-pill.mute{background:#F1F5F9;color:var(--mute)}',
    '.cm2-goodt{color:#15803D}.cm2-badt{color:#B91C1C}.cm2-warnt{color:#B45309}.cm2-mutet{color:var(--mute)}',
    '.cm2-goal{display:flex;align-items:center;gap:8px;font-size:13px}.cm2-goal label{color:var(--mute);min-width:62px}',
    '.cm2-wrap input.cm2-in{height:34px;width:120px;padding:0 8px;border:1px solid #CBD5E1;border-radius:8px;background:#fff;font:inherit;font-size:13px;text-align:right;color:var(--ink)}',
    '.cm2-bar{height:8px;border-radius:99px;background:#EEF1F6;overflow:hidden}.cm2-bar i{display:block;height:100%;border-radius:99px}',
    '.cm2-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid #EEF1F6;padding-top:12px}.cm2-stats div{display:flex;flex-direction:column;gap:2px}.cm2-stats b{font-size:16px}.cm2-stats span{font-size:12px;color:var(--mute)}',
    '.cm2-spark{display:block;width:100%;height:40px}.cm2-nospark{font-size:12px;color:#94A3B8;height:40px;display:flex;align-items:center}',
    '.cm2-plist{display:flex;flex-direction:column;gap:6px;font-size:13px}.cm2-plist div{display:flex;align-items:center;gap:8px}.cm2-plist i{width:9px;height:9px;border-radius:99px;flex:none}.cm2-pn{flex:1;min-width:0}.cm2-pn em{font-style:normal;font-size:11px;color:#B45309;background:#FEF3C7;border-radius:4px;padding:0 4px}.cm2-plist b{min-width:64px;text-align:right}',
    '.cm2-acts{border-top:1px solid #EEF1F6;padding-top:12px}',
    '.cm2-btn{height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--line);background:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:var(--ink)}.cm2-btn:hover{border-color:var(--blue);color:var(--blue)}',
    '.cm2-link{border:0;background:none;padding:0;font:inherit;font-size:13px;color:#1D4ED8;font-weight:600;cursor:pointer}',
    '.cm2-h2row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px}.cm2-legend{font-size:12px;color:var(--mute);display:flex;align-items:center;gap:6px}.cm2-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}.cm2-legend i.ln{width:16px;height:2px;background:#F59E0B;margin-left:8px}',
    '.cm2-tabs{display:flex;flex-wrap:wrap;gap:8px}.cm2-tabs button{height:36px;padding:0 16px;border-radius:99px;border:1px solid var(--line);background:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;color:var(--ink)}.cm2-tabs button.on{background:var(--blue);border-color:var(--blue);color:#fff}',
    '.cm2-note{font-size:12px;color:var(--mute);display:flex;flex-wrap:wrap;gap:6px;align-items:center}.cm2-sw{width:12px;height:12px;border-radius:3px;background:#F0FDF4;border:1px solid #86EFAC;display:inline-block}',
    '.cm2-dhead{border-bottom:1px solid var(--line)}',
    '.cm2-scroll{overflow-x:auto;max-height:70vh;overflow-y:auto}',
    '.cm2-t{border-collapse:separate;border-spacing:0;font-size:13px;width:100%}.cm2-t th{position:sticky;top:0;z-index:2;padding:8px 10px;font-size:12px;font-weight:600;color:var(--mute);text-align:left;background:#F8FAFC;border-bottom:1px solid var(--line);white-space:nowrap}.cm2-t thead tr:nth-child(2) th{top:33px}',
    '.cm2-t th i{width:9px;height:9px;border-radius:99px;display:inline-block;margin-right:6px}.cm2-t td{padding:4px 8px;border-bottom:1px solid #EEF1F6;white-space:nowrap;vertical-align:middle}.cm2-t .r{text-align:right}',
    '.cm2-t .cm2-g{border-left:1px solid var(--line)}.cm2-t .cm2-sd{position:sticky;left:0;background:#fff;z-index:1;font-weight:600;color:var(--mute);min-width:64px}.cm2-t thead .cm2-sd{z-index:3;background:#F8FAFC}',
    '.cm2-t tbody tr.dim td{color:#94A3B8}.cm2-t tbody tr:hover td{background:#F8FAFC}',
    '.cm2-t tfoot td{position:sticky;bottom:0;background:#EFF6FF;border-top:2px solid var(--blue);font-weight:700;padding:10px 8px}',
    '.cm2-wrap input.cm2-cin{width:96px;height:30px;padding:0 8px;border:1px solid #E2E8F0;border-radius:6px;background:#fff;font:inherit;font-size:13px;text-align:right;color:var(--ink)}.cm2-wrap input.cm2-cin:focus{outline:2px solid #93C5FD;border-color:var(--blue)}.cm2-wrap input.cm2-cin.auto{background:#F0FDF4;border-color:#BBF7D0}.cm2-wrap input.cm2-cin[disabled]{opacity:.7}',
    '.cm2-rates details summary{list-style:none}.cm2-rt td,.cm2-rt th{padding:6px 10px}',
    '@media (max-width:640px){.cm2-wrap{padding:16px}.cm2-cards{grid-template-columns:1fr}.cm2-big{font-size:28px}}'
  ].join('\n');
  document.head.appendChild(css);

  if (visible()) { render(); }
})();
