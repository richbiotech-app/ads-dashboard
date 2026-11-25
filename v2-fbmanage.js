/* v2-fbmanage.js — เพิ่มบัญชีโฆษณา / เพิ่มเพจ / แก้ข้อมูลเพจ ด้วยตัวเอง (หน้า Facebook Ads แบบใหม่)
   - บันทึกลง index.html บน GitHub (FB_ACCOUNTS_META / FB_TOKENS / FB_HIERARCHY) → Worker (ต่อแอดเที่ยงคืน, LINE) เห็นด้วย
   - ทุกคนที่ล็อกอินและแก้ไขได้: เพิ่มบัญชี / เพิ่มเพจ / แก้ชื่อ-ผู้ดูแล-เบอร์เพจ
   - เฉพาะแอดมิน (สิทธิ์ทุกหน้า): ลบเพจ (ที่ไม่มีบัญชี) / เอาบัญชีออกจากเพจ
   - ทุกครั้งบันทึกในประวัติการแก้ไข (camplog) */
(function () {
  'use strict';
  var REPO = 'https://api.github.com/repos/richbiotech-app/ads-dashboard/contents/index.html';
  var LOG = 'https://richbiotech-fb-proxy.ads02.workers.dev/_camplog';
  var PKEY = 'rb_fbmanage_pending';
  var CUR = { p: -1, pg: -1 };
  var BUSY = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(s) { return String(s == null ? '' : s).replace(/['"\\\x60\n\r\t]/g, '').replace(/\s+/g, ' ').trim(); }
  function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
  function reEsc(s) { return String(s).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'); }
  function ss(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function user() { try { return (typeof _rbLogUser === 'function' ? _rbLogUser() : '') || ss('rb_username') || 'Unknown'; } catch (e) { return 'Unknown'; } }
  function isAdmin() { return ss('rb_access') === 'all'; }
  function canEdit() { var a = ss('rb_auth'); return !!a && a !== 'hr' && ss('rb_perm') !== 'view'; }
  function pat() { try { return localStorage.getItem('_ghPAT') || (window._nw ? window._nw.join('') : ''); } catch (e) { return ''; } }
  function log(action, acc, where, oldV, newV) {
    try { fetch(LOG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: user(), campaignId: acc || '-', campaignName: where || '-', action: action, oldValue: String(oldV || ''), newValue: String(newV || '') }) }).catch(function () {}); } catch (e) {}
  }
  function toast(msg, bad) {
    var t = document.getElementById('fmToast');
    if (!t) { t = document.createElement('div'); t.id = 'fmToast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'fm-toast on' + (bad ? ' bad' : '');
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = 'fm-toast'; }, 4500);
  }

  /* ── ตัวช่วยอ่านโค้ด JS ใน index.html ───────────────────── */
  function close(t, i) { // i = ตำแหน่ง [ หรือ { → คืนตำแหน่งวงเล็บปิดคู่กัน
    var d = 0, qch = null;
    for (; i < t.length; i++) {
      var c = t[i];
      if (qch) { if (c === '\\') { i++; continue; } if (c === qch) { qch = null; } continue; }
      if (c === "'" || c === '"' || c === '\x60') { qch = c; continue; }
      if (c === '[' || c === '{') { d++; } else if (c === ']' || c === '}') { d--; if (d === 0) { return i; } }
    }
    return -1;
  }
  function objs(t, open, end) { // วัตถุ {…} ชั้นบนสุดใน array [open..end]
    var out = [], i = open + 1;
    while (i < end) {
      var c = t[i];
      if (c === '{') { var e = close(t, i); if (e < 0) { break; } out.push([i, e]); i = e + 1; continue; }
      if (c === "'" || c === '"' || c === '\x60') { var j = i + 1; while (j < end && t[j] !== c) { if (t[j] === '\\') { j++; } j++; } i = j + 1; continue; }
      i++;
    }
    return out;
  }
  function seg(t, marker) { var s = t.indexOf(marker); if (s < 0) { throw new Error('ไม่พบ ' + marker); } var o = s + marker.length - 1, e = close(t, o); if (e < 0) { throw new Error('อ่าน ' + marker + ' ไม่ได้'); } return [o, e]; }
  function evalSeg(t, marker) { var r = seg(t, marker); return new Function('return ' + t.slice(r[0], r[1] + 1))(); }
  function keyAt(t, a, b, key) { var m = new RegExp('(?:^|[{,\\s])' + key + "\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'").exec(t.slice(a, b)); return m ? m[1].replace(/\\(.)/g, '$1') : null; }
  function findProduct(t, product) {
    var H = seg(t, 'var FB_HIERARCHY=[');
    var list = objs(t, H[0], H[1]);
    for (var i = 0; i < list.length; i++) { if (keyAt(t, list[i][0], list[i][1], 'product') === product) { return list[i]; } }
    throw new Error('ไม่พบสินค้า ' + product + ' ใน index.html');
  }
  function pagesArr(t, P) { var m = /pages\s*:\s*\[/.exec(t.slice(P[0], P[1])); if (!m) { throw new Error('ไม่พบ pages'); } var o = P[0] + m.index + m[0].length - 1; return [o, close(t, o)]; }
  function findPage(t, product, page, nth) {
    var P = findProduct(t, product), A = pagesArr(t, P), list = objs(t, A[0], A[1]), k = 0;
    for (var i = 0; i < list.length; i++) {
      var o = list[i], ai = t.slice(o[0], o[1]).search(/accounts\s*:\s*\[/);
      if (keyAt(t, o[0], ai > 0 ? o[0] + ai : o[1], 'name') === page) { if (k === (nth || 0)) { return { P: P, A: A, o: o, list: list, i: i }; } k++; }
    }
    throw new Error('ไม่พบเพจ ' + page + ' ใน index.html');
  }
  function accArr(t, o) { var m = /accounts\s*:\s*\[/.exec(t.slice(o[0], o[1])); if (!m) { throw new Error('ไม่พบ accounts'); } var a = o[0] + m.index + m[0].length - 1; return [a, close(t, a)]; }
  function removeObj(t, list, i, open, end) { // ตัดวัตถุลำดับ i ออกจาก array พร้อมจุลภาค
    var o = list[i];
    if (list.length === 1) { return t.slice(0, open + 1) + t.slice(end); }
    if (i < list.length - 1) { return t.slice(0, o[0]) + t.slice(list[i + 1][0]); }
    return t.slice(0, list[i - 1][1] + 1) + t.slice(o[1] + 1);
  }
  function rtrim(t, end) { var i = end; while (i > 0 && /[\s,]/.test(t[i - 1])) { i--; } return i; }
  function appendObj(t, open, end, code) { var inner = t.slice(open + 1, end); return /\S/.test(inner) ? t.slice(0, rtrim(t, end)) + ',' + code + t.slice(end) : t.slice(0, open + 1) + code + t.slice(end); }

  /* ── การแก้แต่ละแบบ (ใช้ทั้งกับข้อความ index.html และข้อมูลในหน้า) ── */
  var OPS = {
    addAcct: {
      text: function (t, op) {
        if (new RegExp("\\{\\s*name\\s*:\\s*'" + reEsc(op.name) + "'").test(t.slice(0, seg(t, 'var FB_ACCOUNTS_META=[')[1]))) { throw new Error('มีชื่อบัญชี ' + op.name + ' อยู่แล้ว'); }
        var M = seg(t, 'var FB_ACCOUNTS_META=[');
        t = t.slice(0, rtrim(t, M[1])) + ",\n  {name:" + q(op.name) + ",id:" + q(op.id) + ",configKey:" + q('FB_GID_' + op.name) + "}\n" + t.slice(M[1]);
        var T = seg(t, 'var FB_TOKENS={');
        t = t.slice(0, T[0] + 1) + "\n  " + q(op.name) + ":" + q(op.token) + "," + t.slice(T[0] + 1);
        // ค่าใน object ถูกรีเซ็ตเป็นชื่อตัวเองตอนรัน → ต้องมีบรรทัด FB_TOKENS['X']=FB_TOKENS['token']; ต่อท้ายชุด alias ด้วย
        var reA = /FB_TOKENS\['[^']+'\]=FB_TOKENS\['[^']+'\];/g, mA, endA = -1; while ((mA = reA.exec(t))) { endA = mA.index + mA[0].length; }
        if (endA < 0) { throw new Error('หาแถว FB_TOKENS alias ไม่เจอ'); }
        t = t.slice(0, endA) + "FB_TOKENS[" + q(op.name) + "]=FB_TOKENS[" + q(op.token) + "];" + t.slice(endA);
        var f = findPage(t, op.product, op.page, op.nth), A = accArr(t, f.o), hs = objs(t, A[0], A[1]);
        var code = '{displayName:' + q(op.display) + ',adAccounts:[' + q(op.name) + ']}';
        for (var i = 0; i < hs.length; i++) { // แทนตัวแทน "ยังไม่ได้ผูกบัญชี"
          if (/adAccounts\s*:\s*\[\s*\]/.test(t.slice(hs[i][0], hs[i][1] + 1))) { return t.slice(0, hs[i][0]) + code + t.slice(hs[i][1] + 1); }
        }
        return appendObj(t, A[0], A[1], code);
      },
      mem: function (op) {
        if (!FB_ACCOUNTS_META.some(function (m) { return m.name === op.name; })) { FB_ACCOUNTS_META.push({ name: op.name, id: op.id, configKey: 'FB_GID_' + op.name }); }
        FB_TOKENS[op.name] = op.token;
        var pg = memPage(op.product, op.page, op.nth); if (!pg) { return; }
        if (allHolders().some(function (h) { return (h.adAccounts || []).indexOf(op.name) >= 0; })) { return; }
        var ph = pg.accounts.filter(function (h) { return !(h.adAccounts || []).length; })[0];
        if (ph) { ph.displayName = op.display; ph.adAccounts = [op.name]; } else { pg.accounts.push({ displayName: op.display, adAccounts: [op.name] }); }
        load(op.name);
      },
      has: function (op) { return FB_ACCOUNTS_META.some(function (m) { return m.name === op.name; }); }
    },
    addPage: {
      text: function (t, op) {
        var P = findProduct(t, op.product), A = pagesArr(t, P);
        return appendObj(t, A[0], A[1], '\n      {name:' + q(op.page) + ',manager:' + q(op.manager || '-') + ',phone:' + q(op.phone || '-') + ',accounts:[{displayName:' + q(op.page + ' Account') + ',adAccounts:[]}]}\n    ');
      },
      mem: function (op) { var p = memProduct(op.product); if (p && !p.pages.some(function (g) { return g.name === op.page; })) { p.pages.push({ name: op.page, manager: op.manager || '-', phone: op.phone || '-', accounts: [{ displayName: op.page + ' Account', adAccounts: [] }] }); } },
      has: function (op) { var p = memProduct(op.product); return !!(p && p.pages.some(function (g) { return g.name === op.page; })); }
    },
    editPage: {
      text: function (t, op) {
        var f = findPage(t, op.product, op.page, op.nth), A = accArr(t, f.o), hd = t.slice(f.o[0] + 1, A[0]);
        var nh = hd;
        [['name', op.to.name], ['manager', op.to.manager], ['phone', op.to.phone]].forEach(function (kv) {
          var re = new RegExp('(' + kv[0] + "\\s*:\\s*)'(?:[^'\\\\]|\\\\.)*'");
          nh = re.test(nh) ? nh.replace(re, function (m, a) { return a + q(kv[1]); }) : nh.replace(/^(\s*)/, '$1' + kv[0] + ':' + q(kv[1]) + ',');
        });
        return t.slice(0, f.o[0] + 1) + nh + t.slice(A[0]);
      },
      mem: function (op) { var pg = memPage(op.product, op.page, op.nth) || memPage(op.product, op.to.name, op.nth); if (pg) { pg.name = op.to.name; pg.manager = op.to.manager; pg.phone = op.to.phone; } },
      has: function (op) { var p = memProduct(op.product); return !!(p && p.pages.some(function (g) { return g.name === op.to.name && g.manager === op.to.manager && g.phone === op.to.phone; })); }
    },
    delPage: {
      text: function (t, op) {
        var f = findPage(t, op.product, op.page, op.nth), A = accArr(t, f.o);
        if (/adAccounts\s*:\s*\[\s*'/.test(t.slice(A[0], A[1]))) { throw new Error('เพจนี้ยังมีบัญชีโฆษณาอยู่ ต้องเอาบัญชีออกก่อน'); }
        return removeObj(t, f.list, f.i, f.A[0], f.A[1]);
      },
      mem: function (op) { var p = memProduct(op.product), pg = memPage(op.product, op.page, op.nth); if (p && pg) { p.pages.splice(p.pages.indexOf(pg), 1); } },
      has: function (op) { return !memPage(op.product, op.page, op.nth); }
    },
    delHolder: {
      text: function (t, op) {
        var H = seg(t, 'var FB_HIERARCHY=['), ps = objs(t, H[0], H[1]);
        for (var a = 0; a < ps.length; a++) {
          var A = pagesArr(t, ps[a]), pgs = objs(t, A[0], A[1]);
          for (var b = 0; b < pgs.length; b++) {
            var C = accArr(t, pgs[b]), hs = objs(t, C[0], C[1]);
            for (var c = 0; c < hs.length; c++) {
              if (keyAt(t, hs[c][0], hs[c][1], 'displayName') === op.display) {
                if (hs.length === 1) { var pn = keyAt(t, pgs[b][0], C[0], 'name') || 'เพจ'; return t.slice(0, hs[c][0]) + '{displayName:' + q(pn + ' Account') + ',adAccounts:[]}' + t.slice(hs[c][1] + 1); }
                return removeObj(t, hs, c, C[0], C[1]);
              }
            }
          }
        }
        throw new Error('ไม่พบบัญชี ' + op.display + ' ใน index.html');
      },
      mem: function (op) {
        FB_HIERARCHY.forEach(function (p) { p.pages.forEach(function (pg) { for (var i = pg.accounts.length - 1; i >= 0; i--) { if (pg.accounts[i].displayName === op.display) { if (pg.accounts.length === 1) { pg.accounts[i] = { displayName: pg.name + ' Account', adAccounts: [] }; } else { pg.accounts.splice(i, 1); } } } }); });
      },
      has: function (op) { return !allHolders().some(function (h) { return h.displayName === op.display; }); }
    }
  };
  function memProduct(name) { return (window.FB_HIERARCHY || []).filter(function (p) { return p.product === name; })[0] || null; }
  function memPage(product, page, nth) { var p = memProduct(product); if (!p) { return null; } var m = p.pages.filter(function (g) { return g.name === page; }); return m[nth || 0] || m[0] || null; }
  function allHolders() { var o = []; (window.FB_HIERARCHY || []).forEach(function (p) { p.pages.forEach(function (pg) { pg.accounts.forEach(function (h) { o.push(h); }); }); }); return o; }
  function whereAcc(name) {
    var r = null;
    (window.FB_HIERARCHY || []).forEach(function (p) { p.pages.forEach(function (pg) { pg.accounts.forEach(function (h) { if (!r && (h.adAccounts || []).indexOf(name) >= 0) { r = { product: p.product, page: pg.name, display: h.displayName }; } }); }); });
    return r;
  }
  function load(n) {
    try {
      var m = FB_ACCOUNTS_META.filter(function (x) { return x.name === n; })[0]; if (!m) { return; }
      if (window.fbLoadedMap) { fbLoadedMap[n] = false; } if (window._fbLoadingMap) { _fbLoadingMap[n] = true; }
      if (typeof _loadFBFromAPI === 'function') { _loadFBFromAPI(m, n); }
      if (typeof _fetchFBCampaigns === 'function') { _fetchFBCampaigns(m.id, n); }
    } catch (e) {}
  }

  /* ── บันทึกลง GitHub ───────────────────────────────────── */
  function b64(s) { var u = new TextEncoder().encode(s), b = ''; for (var i = 0; i < u.length; i += 0x8000) { b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); } return btoa(b); }
  function unb64(s) { return new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\n/g, '')), function (c) { return c.charCodeAt(0); })); }
  function check(t0, t1) {
    if (Math.abs(t1.length - t0.length) > 4000) { throw new Error('การแก้ใหญ่ผิดปกติ ยกเลิกเพื่อความปลอดภัย'); }
    var h = evalSeg(t1, 'var FB_HIERARCHY=['), m = evalSeg(t1, 'var FB_ACCOUNTS_META=['); evalSeg(t1, 'var FB_TOKENS={');
    if (!Array.isArray(h) || h.length < evalSeg(t0, 'var FB_HIERARCHY=[').length || !Array.isArray(m)) { throw new Error('ตรวจไฟล์หลังแก้ไม่ผ่าน'); }
  }
  async function commit(op, msg) {
    var P = pat(); if (!P) { throw new Error('ไม่มีสิทธิ์บันทึกขึ้นระบบ (GitHub)'); }
    var H = { Authorization: 'token ' + P, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
    for (var tries = 0; tries < 3; tries++) {
      var r = await fetch(REPO + '?ref=main&t=' + Date.now(), { headers: H, cache: 'no-store' });
      if (!r.ok) { throw new Error('โหลดไฟล์จาก GitHub ไม่ได้ (' + r.status + ')'); }
      var j = await r.json(), t0 = j.content ? unb64(j.content) : null;
      if (!t0) { var bl = await (await fetch(j.git_url, { headers: H })).json(); t0 = unb64(bl.content); }
      var t1 = OPS[op.type].text(t0, op);
      check(t0, t1);
      if (window.fbManage && fbManage._dry) { return { dry: true, before: t0, after: t1 }; }
      var w = await fetch(REPO, { method: 'PUT', headers: H, body: JSON.stringify({ message: msg + ' — ' + user() + ' (หน้าแดชบอร์ด)', content: b64(t1), sha: j.sha, branch: 'main' }) });
      if (w.ok) { return { ok: true }; }
      if (w.status !== 409 && w.status !== 422) { throw new Error('บันทึกขึ้น GitHub ไม่สำเร็จ (' + w.status + ')'); }
      await new Promise(function (res) { setTimeout(res, 1500); });
    }
    throw new Error('มีคนแก้ไฟล์พร้อมกัน ลองใหม่อีกครั้ง');
  }
  async function run(op, msg, logArgs) {
    if (BUSY) { throw new Error('กำลังบันทึกรายการก่อนหน้า รอสักครู่'); }
    BUSY = true;
    try {
      var res = await commit(op, msg);
      if (res.dry) { return res; }
      OPS[op.type].mem(op);
      pend(op);
      log.apply(null, logArgs);
      rerender();
      return res;
    } finally { BUSY = false; }
  }
  // GitHub Pages อัปเดตช้า 1–2 นาที → จำรายการไว้ในเครื่อง แล้วใส่ซ้ำตอนเปิดหน้าใหม่ (ไม่เกิน 30 นาที)
  function pend(op) { try { var a = JSON.parse(localStorage.getItem(PKEY) || '[]'); op.ts = Date.now(); a.push(op); localStorage.setItem(PKEY, JSON.stringify(a.slice(-20))); } catch (e) {} }
  function replay() {
    try {
      var a = JSON.parse(localStorage.getItem(PKEY) || '[]').filter(function (o) { return Date.now() - o.ts < 1800000; });
      localStorage.setItem(PKEY, JSON.stringify(a));
      var ch = false; a.forEach(function (o) { if (OPS[o.type] && !OPS[o.type].has(o)) { try { OPS[o.type].mem(o); ch = true; } catch (e) {} } });
      if (ch) { rerender(); }
    } catch (e) {}
  }
  function rerender() { try { if (window.fbV2 && fbV2.render) { fbV2.render(); } } catch (e) {} try { if (typeof renderFB === 'function' && document.getElementById('fbView') && document.getElementById('fbView').style.display !== 'none') { renderFB(); } } catch (e) {} }

  /* ── ดึงข้อมูลบัญชีจาก Facebook (ผ่าน proxy ด้วยชื่อ token) ── */
  function tokName(v) { return typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(v); }
  function tokens() { var s = {}; Object.keys(window.FB_TOKENS || {}).forEach(function (k) { var v = FB_TOKENS[k]; if (tokName(v)) { s[v] = (s[v] || 0) + 1; } }); return Object.keys(s).filter(function (v) { return s[v] >= 2; }).sort(function (a, b) { return s[b] - s[a]; }); }
  function pageTokens(pg) { var c = {}; (pg ? pg.accounts : []).forEach(function (h) { (h.adAccounts || []).forEach(function (a) { var t = FB_TOKENS[a]; if (tokName(t)) { c[t] = (c[t] || 0) + 1; } }); }); return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }); }
  async function probe(id, tok) {
    try {
      var r = await fetch(FB_API + id + '?fields=name,account_status,currency,amount_spent,timezone_name&access_token=' + encodeURIComponent(tok));
      var d = await r.json();
      if (d && d.id) { return { ok: true, d: d, tok: tok }; }
      return { ok: false, code: d && d.error && d.error.code, msg: (d && d.error && d.error.message) || 'ไม่ทราบสาเหตุ', tok: tok };
    } catch (e) { return { ok: false, msg: e.message, tok: tok }; }
  }
  var STATUS = { 1: ['ใช้งานได้ปกติ', 'good'], 2: ['ถูกปิดใช้งาน', 'bad'], 3: ['ค้างชำระ', 'bad'], 7: ['รอตรวจสอบ', 'warn'], 8: ['รอชำระเงิน', 'warn'], 9: ['ช่วงผ่อนผัน', 'warn'], 100: ['รอปิด', 'warn'], 101: ['ปิดแล้ว', 'bad'] };

  /* ── หน้าต่าง ──────────────────────────────────────────── */
  function modal(title, body, foot) {
    shut();
    var m = document.createElement('div'); m.id = 'fmModal'; m.className = 'fm-bg';
    m.innerHTML = '<div class="fm-box" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="fm-hd"><h3>' + esc(title) + '</h3><button class="fm-x" onclick="fbManage.close()" aria-label="ปิด">×</button></div><div class="fm-bd">' + body + '</div><div class="fm-ft">' + foot + '</div></div>';
    m.addEventListener('mousedown', function (e) { if (e.target === m) { shut(); } });
    document.body.appendChild(m);
    var f = m.querySelector('input,select'); if (f) { setTimeout(function () { f.focus(); }, 30); }
    return m;
  }
  function shut() { var m = document.getElementById('fmModal'); if (m) { m.remove(); } }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function setRes(html) { var e = document.getElementById('fmRes'); if (e) { e.innerHTML = html; } }
  function lockBtns(on) { document.querySelectorAll('#fmModal .fm-ft button').forEach(function (b) { b.disabled = on; }); }
  function crumbs() { var b = document.querySelector('#fbV2Inner .v2-crumbs'); return b ? Array.prototype.filter.call(b.children, function (e) { return e.getAttribute('aria-hidden') !== 'true'; }).map(function (e) { return e.textContent.trim(); }) : []; }
  function ctx() {
    var p = FB_HIERARCHY[CUR.p];
    if (!p) { p = memProduct(crumbs()[1]); }
    var pg = p && CUR.pg >= 0 ? p.pages[CUR.pg] : null;
    var nth = 0; if (p && pg) { nth = p.pages.slice(0, p.pages.indexOf(pg)).filter(function (g) { return g.name === pg.name; }).length; }
    return { p: p, pg: pg, nth: nth };
  }
  function accName(display, id) {
    var base = String(display).normalize('NFD').replace(/[^\x00-\x7F]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join('');
    if (!base || !/^[A-Za-z]/.test(base)) { base = 'Acc' + String(id).replace(/\D/g, '').slice(-8); }
    var n = base, k = 2; while (FB_ACCOUNTS_META.some(function (m) { return m.name === n; }) || (FB_TOKENS && FB_TOKENS.hasOwnProperty(n))) { n = base + k++; }
    return n;
  }

  function mgrList(p) { // ผู้ดูแลทุกคนในแดชบอร์ด (คนในสินค้านี้ขึ้นก่อน)
    var a = [], b = [];
    (window.FB_HIERARCHY || []).forEach(function (x) { x.pages.forEach(function (g) { var m = clean(g.manager); if (!m || m === '-') { return; } var L = x === p ? a : b; if (a.indexOf(m) < 0 && b.indexOf(m) < 0) { L.push(m); } else if (x === p && b.indexOf(m) >= 0) { b.splice(b.indexOf(m), 1); a.push(m); } }); });
    return a.sort().concat(b.sort());
  }
  function mgrDL(list) { return '<datalist id="fmMgL">' + list.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist>'; }

  var A = null; // สถานะหน้าต่างเพิ่มบัญชี
  window.fbManage = {
    close: shut,
    addAcct: function () {
      var c = ctx(); if (!c.p || !c.pg) { return toast('เปิดหน้าเพจก่อนแล้วค่อยกดเพิ่มบัญชี', true); }
      A = { c: c, res: null };
      var pref = pageTokens(c.pg), toks = pref.concat(tokens()).filter(function (t, i, a) { return a.indexOf(t) === i; });
      var opts = '<option value="">อัตโนมัติ (ระบบลองหา token ที่เข้าได้)</option>' + toks.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + (pref.indexOf(t) >= 0 ? ' — ใช้ในเพจนี้' : '') + '</option>'; }).join('');
      modal('เพิ่มบัญชีโฆษณา',
        '<div class="fm-where">' + esc(c.p.product) + ' › <b>' + esc(c.pg.name) + '</b></div>' +
        '<label class="fm-f"><span>ชื่อบัญชี (ตามที่จะแสดง)</span><input id="fmName" maxlength="60" placeholder="เช่น Charles Kouassi Yao"></label>' +
        '<label class="fm-f"><span>เลขบัญชีโฆษณา</span><input id="fmId" inputmode="numeric" placeholder="เช่น 1110283445146201" oninput="fbManage._dirty()"></label>' +
        '<label class="fm-f"><span>Token ที่ใช้ดึงข้อมูล</span><select id="fmTok" onchange="fbManage._dirty()">' + opts + '</select><small>เลือกแค่ชื่อ — ไม่ต้องใส่ token จริง · ถ้าต้องใช้ token ใหม่ที่ยังไม่มีในรายการ ให้แอดมินเพิ่มใน Cloudflare ก่อน</small></label>' +
        '<div id="fmRes"></div>',
        '<button class="fm-btn" onclick="fbManage.close()">ยกเลิก</button><button class="fm-btn" id="fmChk" onclick="fbManage._check()">ตรวจสอบ</button><button class="fm-btn fm-pri" id="fmSave" onclick="fbManage._saveAcct()" disabled>เพิ่มบัญชี</button>');
    },
    _dirty: function () { if (A) { A.res = null; } var s = document.getElementById('fmSave'); if (s) { s.disabled = true; } setRes(''); },
    _check: async function () {
      var id = val('fmId').replace(/\D/g, ''), tok = val('fmTok'), nm = clean(val('fmName'));
      if (id.length < 8) { return setRes('<div class="fm-msg bad">ใส่เลขบัญชีโฆษณาให้ถูกต้อง (ตัวเลขล้วน)</div>'); }
      var act = 'act_' + id;
      var dup = FB_ACCOUNTS_META.filter(function (m) { return m.id === act; })[0];
      if (dup) {
        var w = whereAcc(dup.name);
        return setRes('<div class="fm-msg warn"><b>บัญชีนี้มีในแดชบอร์ดแล้ว</b> (' + esc(dup.name) + ')' + (w ? ' อยู่ที่ ' + esc(w.product) + ' › ' + esc(w.page) + ' ชื่อ "' + esc(w.display) + '"' : ' แต่ยังไม่ได้อยู่ในเพจไหน') + '<br>ถ้าจะย้ายมาเพจนี้ ให้ไปที่เพจนั้นแล้วกด "⇄ ย้ายไปเพจอื่น"</div>');
      }
      lockBtns(true); setRes('<div class="fm-msg">กำลังตรวจกับ Facebook…</div>');
      var list = tok ? [tok] : pageTokens(A.c.pg).concat(tokens()).filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 8);
      var hit = null, last = null;
      for (var i = 0; i < list.length && !hit; i++) { var r = await probe(act, list[i]); if (r.ok) { hit = r; } else { last = r; } }
      lockBtns(false);
      if (hit) {
        var st = STATUS[hit.d.account_status] || ['สถานะ ' + hit.d.account_status, 'warn'];
        if (!nm) { var e = document.getElementById('fmName'); if (e) { e.value = clean(hit.d.name); } }
        A.res = { id: act, token: hit.tok, ok: true };
        setRes('<div class="fm-msg good"><b>เจอบัญชี: ' + esc(hit.d.name) + '</b><br>สถานะ <span class="fm-pill ' + st[1] + '">' + st[0] + '</span> · สกุลเงิน ' + esc(hit.d.currency || '-') + ' · ใช้ token <b>' + esc(hit.tok) + '</b></div>');
      } else {
        var no = last && (last.code === 200 || /permission/i.test(last.msg || ''));
        A.res = tok ? { id: act, token: tok, ok: false } : null;
        setRes('<div class="fm-msg bad"><b>' + (no ? (tok ? 'Token ' + esc(tok) + ' ยังไม่มีสิทธิ์เข้าบัญชีนี้' : 'ยังไม่มี token ไหนเข้าบัญชีนี้ได้') : 'ตรวจไม่ผ่าน') + '</b><br>' +
          (no ? 'ให้เจ้าของบัญชีเพิ่มสิทธิ์ใน Business Manager ให้คนที่ถือ token ก่อน (ถ้าจะให้ระบบต่อแอดเที่ยงคืน ต้องให้สิทธิ์ "แก้ไข" ด้วย)' : esc(last ? last.msg : '')) +
          (tok ? '<br>ยังเพิ่มได้ — ข้อมูลจะขึ้นเองเมื่อได้สิทธิ์แล้ว' : '<br>ถ้ารู้ว่าจะใช้ token ไหน ให้เลือกในช่อง Token แล้วตรวจอีกครั้ง จะเพิ่มไว้ก่อนได้') + '</div>');
      }
      var s = document.getElementById('fmSave'); if (s) { s.disabled = !A.res; }
    },
    _saveAcct: async function () {
      if (!A || !A.res) { return; }
      var display = clean(val('fmName')); if (!display) { return setRes('<div class="fm-msg bad">ใส่ชื่อบัญชีก่อน</div>'); }
      if (allHolders().some(function (h) { return h.displayName === display; })) { return setRes('<div class="fm-msg bad">มีบัญชีชื่อ "' + esc(display) + '" ในแดชบอร์ดแล้ว ใช้ชื่ออื่น</div>'); }
      var op = { type: 'addAcct', name: accName(display, A.res.id), id: A.res.id, token: A.res.token, display: display, product: A.c.p.product, page: A.c.pg.name, nth: A.c.nth };
      lockBtns(true); setRes('<div class="fm-msg">กำลังบันทึก…</div>');
      try {
        var r = await run(op, 'เพิ่มบัญชี ' + display + ' (' + op.id + ') → ' + op.product + ' / ' + op.page, ['acct:add', op.name, op.product + ' / ' + op.page, '', display + ' · ' + op.id + ' · token ' + op.token]);
        if (r.dry) { lockBtns(false); setRes('<div class="fm-msg">ทดลอง (ไม่บันทึกจริง) ผ่าน</div>'); return; }
        shut(); toast('เพิ่ม ' + display + ' แล้ว · คนอื่นจะเห็นภายใน 1–2 นาที');
      } catch (e) { lockBtns(false); setRes('<div class="fm-msg bad">' + esc(e.message) + '</div>'); }
    },
    addPage: function () {
      var c = ctx(); if (!c.p) { return toast('เปิดหน้าสินค้าก่อนแล้วค่อยกดเพิ่มเพจ', true); }
      var mg = mgrList(c.p);
      modal('เพิ่มเพจใหม่',
        '<div class="fm-where">สินค้า <b>' + esc(c.p.product) + '</b></div>' +
        '<label class="fm-f"><span>ชื่อเพจ</span><input id="fmPg" maxlength="80" placeholder="ชื่อเพจตามใน Facebook"></label>' +
        '<label class="fm-f"><span>ผู้ดูแลเพจ</span><input id="fmMg" list="fmMgL" maxlength="40" placeholder="เลือกจากรายชื่อ หรือพิมพ์ชื่อใหม่ (ยังไม่รู้ใส่ -)" onfocus="this.select()">' + mgrDL(mg) + '<small>กดช่องนี้จะมีรายชื่อผู้ดูแลที่มีอยู่ให้เลือก · พิมพ์ชื่อใหม่ได้เลย</small></label>' +
        '<label class="fm-f"><span>เบอร์โทร</span><input id="fmPh" maxlength="20" placeholder="-"></label><div id="fmRes"></div>',
        '<button class="fm-btn" onclick="fbManage.close()">ยกเลิก</button><button class="fm-btn fm-pri" onclick="fbManage._savePage()">เพิ่มเพจ</button>');
    },
    _savePage: async function () {
      var c = ctx(), name = clean(val('fmPg')), mg = clean(val('fmMg')) || '-', ph = clean(val('fmPh')) || '-';
      if (!name) { return setRes('<div class="fm-msg bad">ใส่ชื่อเพจก่อน</div>'); }
      var dup = null; FB_HIERARCHY.forEach(function (p) { p.pages.forEach(function (g) { if (!dup && g.name === name) { dup = p.product; } }); });
      if (dup && !document.getElementById('fmDupOk')) { return setRes('<div class="fm-msg warn">มีเพจชื่อนี้อยู่แล้วในสินค้า <b>' + esc(dup) + '</b> ถ้าตั้งใจเพิ่มซ้ำ กด "เพิ่มเพจ" อีกครั้ง<input type="hidden" id="fmDupOk"></div>'); }
      var op = { type: 'addPage', product: c.p.product, page: name, manager: mg, phone: ph };
      lockBtns(true); setRes('<div class="fm-msg">กำลังบันทึก…</div>');
      try {
        var r = await run(op, 'เพิ่มเพจ ' + name + ' → ' + op.product, ['page:add', '-', op.product + ' / ' + name, '', 'ผู้ดูแล ' + mg + ' · ' + ph]);
        if (r.dry) { lockBtns(false); setRes('<div class="fm-msg">ทดลอง (ไม่บันทึกจริง) ผ่าน</div>'); return; }
        shut(); toast('เพิ่มเพจ ' + name + ' แล้ว');
        var i = c.p.pages.map(function (g) { return g.name; }).lastIndexOf(name);
        if (i >= 0 && window.fbV2) { CUR.pg = i; fbV2.page(i); }
      } catch (e) { lockBtns(false); setRes('<div class="fm-msg bad">' + esc(e.message) + '</div>'); }
    },
    editPage: function () {
      var c = ctx(); if (!c.pg) { return; }
      var adm = isAdmin(), hs = c.pg.accounts.filter(function (h) { return (h.adAccounts || []).length; });
      var admin = adm ? '<div class="fm-adm"><div class="fm-sub">สำหรับแอดมิน</div>' +
        (hs.length ? hs.map(function (h, i) { return '<div class="fm-row"><span>' + esc(h.displayName) + '</span><button class="fm-btn fm-sm fm-red" onclick="fbManage._delHolder(' + i + ')">เอาออกจากแดชบอร์ด</button></div>'; }).join('') : '') +
        (hs.length ? '<small>ลบเพจได้เมื่อไม่มีบัญชีเหลืออยู่</small>' : '<button class="fm-btn fm-red" onclick="fbManage._delPage()">ลบเพจนี้</button>') + '</div>'
        : (!hs.length ? '<div class="fm-adm"><div class="fm-sub">เพจนี้ไม่มีบัญชีโฆษณา</div><button class="fm-btn fm-red" onclick="fbManage._delPage()">ลบเพจนี้</button></div>' : '');
      modal('แก้ไขข้อมูลเพจ',
        '<div class="fm-where">' + esc(c.p.product) + '</div>' +
        '<label class="fm-f"><span>ชื่อเพจ</span><input id="fmPg" maxlength="80" value="' + esc(c.pg.name) + '"></label>' +
        '<label class="fm-f"><span>ผู้ดูแลเพจ</span><input id="fmMg" list="fmMgL" maxlength="40" value="' + esc(c.pg.manager || '-') + '" placeholder="เลือกจากรายชื่อ หรือพิมพ์ชื่อใหม่" onfocus="this.select()">' + mgrDL(mgrList(c.p)) + '<small>กดช่องนี้จะมีรายชื่อผู้ดูแลที่มีอยู่ให้เลือก · พิมพ์ชื่อใหม่ได้เลย</small></label>' +
        '<label class="fm-f"><span>เบอร์โทร</span><input id="fmPh" maxlength="20" value="' + esc(c.pg.phone || '-') + '"></label>' + admin + '<div id="fmRes"></div>',
        '<button class="fm-btn" onclick="fbManage.close()">ยกเลิก</button><button class="fm-btn fm-pri" onclick="fbManage._saveEdit()">บันทึก</button>');
      A = { c: c, hs: hs };
    },
    _saveEdit: async function () {
      var c = A.c, to = { name: clean(val('fmPg')), manager: clean(val('fmMg')) || '-', phone: clean(val('fmPh')) || '-' };
      if (!to.name) { return setRes('<div class="fm-msg bad">ชื่อเพจห้ามว่าง</div>'); }
      if (to.name === c.pg.name && to.manager === (c.pg.manager || '-') && to.phone === (c.pg.phone || '-')) { return shut(); }
      var op = { type: 'editPage', product: c.p.product, page: c.pg.name, nth: c.nth, to: to };
      lockBtns(true); setRes('<div class="fm-msg">กำลังบันทึก…</div>');
      try {
        var r = await run(op, 'แก้ข้อมูลเพจ ' + c.pg.name + ' (' + c.p.product + ')', ['page:edit', '-', c.p.product + ' / ' + c.pg.name, c.pg.name + ' · ' + (c.pg.manager || '-') + ' · ' + (c.pg.phone || '-'), to.name + ' · ' + to.manager + ' · ' + to.phone]);
        if (r.dry) { lockBtns(false); setRes('<div class="fm-msg">ทดลอง (ไม่บันทึกจริง) ผ่าน</div>'); return; }
        // บัญชีที่เคยถูกย้ายเข้ามาเพจนี้ (KV acctmove) ต้องชี้ชื่อเพจใหม่ด้วย
        if (to.name !== op.page && window._fbAcctMoveMap && window.FB_ACCTMOVE_API) {
          Object.keys(_fbAcctMoveMap).forEach(function (dn) { var v = _fbAcctMoveMap[dn]; if (v && v.product === op.product && v.page === op.page) { v.page = to.name; fetch(FB_ACCTMOVE_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: dn, product: op.product, page: to.name }) }).catch(function () {}); } });
        }
        shut(); toast('บันทึกข้อมูลเพจแล้ว');
      } catch (e) { lockBtns(false); setRes('<div class="fm-msg bad">' + esc(e.message) + '</div>'); }
    },
    _delHolder: async function (i) {
      if (!isAdmin()) { return; }
      var h = A.hs[i]; if (!h) { return; }
      if (!confirm('เอาบัญชี "' + h.displayName + '" ออกจากแดชบอร์ด?\nบัญชีโฆษณาใน Facebook ไม่ถูกลบ · ระบบจะไม่ดึงข้อมูล ไม่รายงาน และไม่ต่อแอดเที่ยงคืนให้บัญชีนี้')) { return; }
      var op = { type: 'delHolder', display: h.displayName };
      lockBtns(true); setRes('<div class="fm-msg">กำลังบันทึก…</div>');
      try {
        var r = await run(op, 'เอาบัญชี ' + h.displayName + ' ออกจาก ' + A.c.p.product + ' / ' + A.c.pg.name, ['acct:remove', (h.adAccounts || []).join(','), A.c.p.product + ' / ' + A.c.pg.name, h.displayName, '']);
        if (r.dry) { lockBtns(false); setRes('<div class="fm-msg">ทดลอง (ไม่บันทึกจริง) ผ่าน</div>'); return; }
        shut(); toast('เอา ' + h.displayName + ' ออกแล้ว');
      } catch (e) { lockBtns(false); setRes('<div class="fm-msg bad">' + esc(e.message) + '</div>'); }
    },
    // ลบเพจว่าง (ไม่มีบัญชีโฆษณา) จากปุ่มบนการ์ดเพจ · ทุกคนที่แก้ไขได้ (ฝั่งแก้ไฟล์กันไม่ให้ลบเพจที่ยังมีบัญชี)
    delPageAt: async function (idx) {
      if (!canEdit()) { return; }
      var p = ctx().p || FB_HIERARCHY[CUR.p]; if (!p) { return; }
      var pg = p.pages[idx]; if (!pg) { return; }
      if (pg.accounts.some(function (h) { return (h.adAccounts || []).length; })) { return toast('เพจนี้ยังมีบัญชีโฆษณา ลบไม่ได้'); }
      if (!confirm('ลบเพจ "' + pg.name + '" ออกจากแดชบอร์ด?\nเพจนี้ไม่มีบัญชีโฆษณา · เพจใน Facebook ไม่ถูกลบ')) { return; }
      var nth = p.pages.slice(0, idx).filter(function (g) { return g.name === pg.name; }).length;
      var op = { type: 'delPage', product: p.product, page: pg.name, nth: nth };
      toast('กำลังลบเพจ…');
      try {
        var r = await run(op, 'ลบเพจ ' + pg.name + ' (' + p.product + ')', ['page:remove', '-', p.product + ' / ' + pg.name, pg.name, '']);
        if (r.dry) { return toast('ทดลอง (ไม่บันทึกจริง) ผ่าน'); }
        toast('ลบเพจ ' + pg.name + ' แล้ว'); CUR.pg = -1; if (window.fbV2) { fbV2.product(FB_HIERARCHY.indexOf(p)); }
      } catch (e) { toast('ลบไม่สำเร็จ: ' + e.message); }
    },
    _delPage: async function () {
      if (!isAdmin() && !(canEdit() && A.hs && !A.hs.length)) { return; }
      var c = A.c;
      if (!confirm('ลบเพจ "' + c.pg.name + '" ออกจากแดชบอร์ด?')) { return; }
      var op = { type: 'delPage', product: c.p.product, page: c.pg.name, nth: c.nth };
      lockBtns(true); setRes('<div class="fm-msg">กำลังบันทึก…</div>');
      try {
        var r = await run(op, 'ลบเพจ ' + c.pg.name + ' (' + c.p.product + ')', ['page:remove', '-', c.p.product + ' / ' + c.pg.name, c.pg.name, '']);
        if (r.dry) { lockBtns(false); setRes('<div class="fm-msg">ทดลอง (ไม่บันทึกจริง) ผ่าน</div>'); return; }
        shut(); toast('ลบเพจแล้ว'); CUR.pg = -1; if (window.fbV2) { fbV2.go('product'); }
      } catch (e) { lockBtns(false); setRes('<div class="fm-msg bad">' + esc(e.message) + '</div>'); }
    },
    _ops: OPS, _dry: false
  };

  /* ── ปุ่มในหน้า Facebook Ads แบบใหม่ ───────────────────── */
  function hook() {
    if (!window.fbV2 || fbV2._fmHooked) { return !!(window.fbV2 && fbV2._fmHooked); }
    var oP = fbV2.product, oG = fbV2.page, oGo = fbV2.go;
    fbV2.product = function (i) { CUR.p = i; CUR.pg = -1; return oP.apply(this, arguments); };
    fbV2.page = function (i) { if (CUR.p < 0) { var c = ctx(); if (c.p) { CUR.p = FB_HIERARCHY.indexOf(c.p); } } CUR.pg = i; return oG.apply(this, arguments); };
    fbV2.go = function (l) { if (l === 'root') { CUR.p = -1; CUR.pg = -1; } if (l === 'product') { CUR.pg = -1; } return oGo.apply(this, arguments); };
    fbV2._fmHooked = true;
    return true;
  }
  function inject() {
    var box = document.getElementById('fbV2Inner'); if (!box || !canEdit()) { return; }
    var heads = box.querySelectorAll('h2');
    var lvlPage = Array.prototype.some.call(heads, function (h) { return h.textContent.trim() === 'บัญชีโฆษณาในเพจนี้'; });
    var lvlProd = !lvlPage && Array.prototype.some.call(heads, function (h) { return h.textContent.trim() === 'เพจทั้งหมด'; });
    if (lvlPage) {
      // ตรวจว่า CUR ตรงกับหน้าที่เปิดอยู่
      var pn = crumbs()[2], c = ctx();
      if (!c.pg || c.pg.name !== pn) { var p = c.p; if (p) { CUR.p = FB_HIERARCHY.indexOf(p); CUR.pg = p.pages.map(function (g) { return g.name; }).indexOf(pn); } }
      var list = box.querySelector('.v2-list');
      if (list && !list.querySelector('.fm-addcard')) {
        var b = document.createElement('button'); b.className = 'v2-card fm-addcard'; b.type = 'button';
        b.innerHTML = '<span class="fm-plus">+</span><span><b>เพิ่มบัญชีโฆษณาในเพจนี้</b><small>ใส่เลขบัญชี → ระบบตรวจกับ Facebook ให้ก่อนบันทึก</small></span>';
        b.onclick = function () { fbManage.addAcct(); }; list.appendChild(b);
      }
      var h2 = Array.prototype.filter.call(heads, function (h) { return h.textContent.trim() === 'บัญชีโฆษณาในเพจนี้'; })[0];
      if (h2 && !box.querySelector('.fm-editpg')) {
        var e = document.createElement('button'); e.type = 'button'; e.className = 'fm-editpg'; e.textContent = '✎ แก้ไขข้อมูลเพจ' + (isAdmin() ? ' / จัดการบัญชี' : '');
        e.onclick = function () { fbManage.editPage(); };
        var wrap = document.createElement('div'); wrap.className = 'fm-h2row'; h2.parentNode.insertBefore(wrap, h2); wrap.appendChild(h2); wrap.appendChild(e);
      }
    } else if (lvlProd) {
      var g = box.querySelector('.v2-grid');
      if (g && !g.querySelector('.fm-addpage')) {
        var a = document.createElement('button'); a.type = 'button'; a.className = 'v2-card fm-addpage';
        a.innerHTML = '<span class="fm-plus">+</span><b>เพิ่มเพจใหม่</b><small>ในสินค้านี้</small>';
        a.onclick = function () { fbManage.addPage(); }; g.appendChild(a);
      }
      // ป้าย "ซ้ำ" + ปุ่มลบบนการ์ดเพจที่ไม่มีบัญชีโฆษณา
      var pp = ctx().p;
      if (g && pp) {
        var nm = function (s) { return String(s || '').replace(/โทร\.?\s*[\d\-\s]+$/, '').replace(/\s+/g, '').toLowerCase(); }, cnt = {};
        pp.pages.forEach(function (x) { var k = nm(x.name); cnt[k] = (cnt[k] || 0) + 1; });
        Array.prototype.forEach.call(g.querySelectorAll('.v2-pagecard'), function (card) {
          if (card.querySelector('.fm-pgtools')) { return; }
          var m = /fbV2\.page\((\d+)\)/.exec(card.getAttribute('onclick') || ''); if (!m) { return; }
          var idx = +m[1], pg = pp.pages[idx]; if (!pg) { return; }
          var empty = !pg.accounts.some(function (h) { return (h.adAccounts || []).length; }), dup = cnt[nm(pg.name)] > 1;
          if (!empty && !dup) { return; }
          var t = document.createElement('div'); t.className = 'fm-pgtools';
          t.innerHTML = (dup ? '<span class="fm-dup" title="มีเพจชื่อเดียวกันในสินค้านี้">ซ้ำ</span>' : '') + (empty ? '<span class="fm-del" role="button" tabindex="0">ลบเพจ</span>' : '');
          var d = t.querySelector('.fm-del');
          if (d) { var go = function (e) { e.stopPropagation(); e.preventDefault(); fbManage.delPageAt(idx); }; d.onclick = go; d.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { go(e); } }; }
          var more = card.querySelector('.v2-more'); if (more) { card.insertBefore(t, more); } else { card.appendChild(t); }
        });
      }
    }
  }

  var css = document.createElement('style');
  css.textContent = [
    '.fm-addcard{display:flex;align-items:center;gap:14px;padding:14px 18px;width:100%;text-align:left;font:inherit;color:#1D4ED8;cursor:pointer;border:1px dashed #93C5FD!important;background:#F8FBFF!important}.fm-addcard:hover{background:#EFF6FF!important}.fm-addcard span:last-child{display:flex;flex-direction:column}.fm-addcard small{color:#475569;font-size:12px}',
    '.fm-pgtools{display:flex;gap:6px;align-items:center;margin:2px 0 4px}.fm-dup{font-size:11px;font-weight:700;color:#B45309;background:#FEF3C7;border-radius:99px;padding:2px 8px}.fm-del{font-size:12px;font-weight:600;color:#B91C1C;border:1px solid #FECACA;background:#FEF2F2;border-radius:8px;padding:3px 10px;cursor:pointer}.fm-del:hover,.fm-del:focus{background:#FEE2E2;outline:none}',
    '.fm-plus{width:36px;height:36px;border-radius:99px;background:#DBEAFE;color:#1D4ED8;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex:none}',
    '.fm-addpage{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:120px;font:inherit;color:#1D4ED8;cursor:pointer;border:1px dashed #93C5FD!important;background:#F8FBFF!important}.fm-addpage:hover{background:#EFF6FF!important}.fm-addpage small{color:#475569;font-size:12px}',
    '.fm-h2row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}.fm-editpg{border:1px solid #E5E7EB;background:#fff;border-radius:8px;height:32px;padding:0 12px;font:inherit;font-size:13px;font-weight:600;color:#1D4ED8;cursor:pointer}.fm-editpg:hover{border-color:#93C5FD}',
    '.fm-bg{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px}',
    '.fm-box{background:#fff;border-radius:14px;width:440px;max-width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(15,23,42,.3);font-family:"IBM Plex Sans Thai","Sarabun",system-ui,sans-serif;color:#0F172A}',
    '.fm-hd{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 6px}.fm-hd h3{margin:0;font-size:18px;font-weight:700}.fm-x{border:0;background:none;font-size:24px;line-height:1;color:#64748B;cursor:pointer;width:32px;height:32px;border-radius:8px}.fm-x:hover{background:#F1F5F9}',
    '.fm-bd{padding:8px 20px 12px;overflow:auto;display:flex;flex-direction:column;gap:12px}.fm-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 18px;border-top:1px solid #EEF1F6}',
    '.fm-where{font-size:13px;color:#475569;background:#F8FAFC;border-radius:8px;padding:8px 10px}',
    '.fm-f{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600}.fm-f input,.fm-f select{height:40px;border:1px solid #CBD5E1;border-radius:8px;padding:0 10px;font:inherit;font-size:14px;font-weight:400;color:#0F172A;background:#fff}.fm-f input:focus,.fm-f select:focus{outline:2px solid #93C5FD;border-color:#2563EB}.fm-f small{font-weight:400;color:#64748B;font-size:12px}',
    '.fm-btn{height:38px;padding:0 16px;border-radius:10px;border:1px solid #E5E7EB;background:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;color:#0F172A}.fm-btn:hover{border-color:#93C5FD}.fm-btn[disabled]{opacity:.5;cursor:not-allowed}.fm-pri{background:#2563EB;border-color:#2563EB;color:#fff}.fm-pri:hover{background:#1D4ED8}.fm-red{color:#B91C1C;border-color:#FECACA}.fm-red:hover{background:#FEF2F2;border-color:#FCA5A5}.fm-sm{height:30px;padding:0 10px;font-size:12px}',
    '.fm-msg{font-size:13px;line-height:1.55;padding:10px 12px;border-radius:8px;background:#F1F5F9;color:#334155}.fm-msg.good{background:#F0FDF4;color:#166534}.fm-msg.bad{background:#FEF2F2;color:#991B1B}.fm-msg.warn{background:#FFFBEB;color:#92400E}',
    '.fm-pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600}.fm-pill.good{background:#DCFCE7;color:#15803D}.fm-pill.bad{background:#FEE2E2;color:#B91C1C}.fm-pill.warn{background:#FEF3C7;color:#B45309}',
    '.fm-adm{border-top:1px solid #EEF1F6;padding-top:12px;display:flex;flex-direction:column;gap:8px}.fm-sub{font-size:12px;font-weight:700;color:#B91C1C}.fm-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px}.fm-adm small{color:#64748B;font-size:12px}',
    '.fm-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);opacity:0;pointer-events:none;background:#0F172A;color:#fff;padding:10px 18px;border-radius:10px;font-size:14px;transition:.2s;z-index:100001;max-width:90vw}.fm-toast.on{opacity:1;transform:translateX(-50%)}.fm-toast.bad{background:#B91C1C}'
  ].join('\n');
  document.head.appendChild(css);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { shut(); } });

  function start() {
    if (!hook()) { return setTimeout(start, 500); }
    var box = document.getElementById('fbV2Inner');
    if (box) { new MutationObserver(function () { inject(); }).observe(box, { childList: true }); inject(); }
    var tries = 0; (function wait() { if (window.FB_HIERARCHY && window.fbDataMap) { replay(); } else if (tries++ < 40) { setTimeout(wait, 500); } })();
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
})();
