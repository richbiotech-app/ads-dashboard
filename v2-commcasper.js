/* v2-commcasper.js — หน้าค่าคอมมิชชั่น: เติมยอดยิง (ค่าแอดที่คีย์) และยอดขาย จาก CasperCall อัตโนมัติ
   - เติมเฉพาะช่องที่ยังว่าง (ไม่ทับตัวเลขที่กรอกเอง)
   - ปุ่ม "ดึงจาก Casper ใหม่" = เขียนทับทุกช่องที่ Casper มีข้อมูล ในรอบที่เปิดอยู่ */
(function () {
  if (typeof window.commLoad !== 'function' || typeof window.renderCommission !== 'function') { return; }
  var API = 'https://richbiotech-fb-proxy.ads02.workers.dev/_casper/month';
  var CK = {}, LOADING = {}, AUTO = {};
  function tok() { try { return localStorage.getItem('rb_auth_token'); } catch (e) { return null; } }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function months(yr, mo) { var pm = mo === 1 ? 12 : mo - 1, py = mo === 1 ? yr - 1 : yr; return [py + '-' + p2(pm), yr + '-' + p2(mo)]; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s+]/g, ''); }
  function visible() { var w = document.getElementById('commissionViewInner'); return !!(w && w.offsetParent); }
  function fetchM(m) {
    if ((CK[m] && Date.now() - CK[m].t < 600000) || LOADING[m]) { return; }
    var t = tok(); if (!t) { return; }
    LOADING[m] = 1;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, m: m }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        LOADING[m] = 0;
        if (j && j.daily) { CK[m] = { t: Date.now(), d: j.daily, ak: j.adsThrough || '' }; if (visible()) { _render(); } }
      })
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
    var an = (typeof commGetAnalysts === 'function') ? commGetAnalysts() : Object.keys(COMM_ANALYST_PRODUCTS || {});
    var days = commDays(yr, mo);
    an.forEach(function (a) {
      (COMM_ANALYST_PRODUCTS[a] || []).forEach(function (p) {
        days.forEach(function (d) {
          var v = casperVal(d.dk, p); if (!v) { return; }
          var cur = data[a] && data[a][p] && data[a][p][d.dk];
          var empty = !cur || (!(+cur.s) && !(+cur.r));
          if (!empty && !force) { return; }
          if (!data[a]) { data[a] = {}; } if (!data[a][p]) { data[a][p] = {}; }
          data[a][p][d.dk] = { s: v.s, r: v.r };
          AUTO[a + '|' + p + '|' + d.dk] = 1;
        });
      });
    });
    return data;
  }
  var _load = window.commLoad;
  window.commLoad = function (yr, mo) {
    var data = _load(yr, mo) || {};
    try { fill(data, yr, mo, false); } catch (e) {}
    return data;
  };
  var _render = window.renderCommission;
  function mark() {
    var w = document.getElementById('commissionViewInner'); if (!w) { return; }
    w.querySelectorAll('input.comm-edit').forEach(function (el) {
      if (AUTO[el.getAttribute('data-a') + '|' + el.getAttribute('data-p') + '|' + el.getAttribute('data-d')] && el.value) {
        el.style.background = '#f0fdf4'; el.title = 'ดึงจาก CasperCall';
      }
    });
    if (!document.getElementById('commCasperBar')) {
      var bar = document.createElement('div'); bar.id = 'commCasperBar';
      bar.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 10px;font-size:12px;color:#64748b';
      var ms = months(commYear, commMonth), ak = (CK[ms[1]] && CK[ms[1]].ak) || (CK[ms[0]] && CK[ms[0]].ak) || '';
      bar.innerHTML = '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#f0fdf4;border:1px solid #bbf7d0;vertical-align:middle"></span> ช่องสีเขียว = ดึงจาก CasperCall (ยอดยิง = ค่าแอดที่คีย์ · ยอดขาย = ยอดขายสินค้านั้น)' + (ak ? ' · ข้อมูลถึง ' + ak.slice(8) + '/' + (+ak.slice(5, 7)) : ' · กำลังโหลด…') + '</span>' +
        '<button type="button" id="commCasperBtn" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:12px">↻ ดึงจาก Casper ใหม่ (ทับทุกช่อง)</button>';
      w.insertBefore(bar, w.firstChild);
      document.getElementById('commCasperBtn').onclick = function () {
        if (!confirm('เขียนทับยอดยิง/ยอดขายทุกช่องในรอบนี้ด้วยตัวเลขจาก CasperCall?')) { return; }
        var yr = commYear, mo = commMonth, data = _load(yr, mo) || {};
        fill(data, yr, mo, true);
        try { commSave(yr, mo, data); } catch (e) {}
        _render();
        try { var inp = document.querySelector('#commissionViewInner input.comm-edit'); if (inp) { inp.dispatchEvent(new Event('input', { bubbles: true })); } } catch (e) {}
      };
    }
  }
  window.renderCommission = function () {
    var r = _render.apply(this, arguments);
    try { months(commYear, commMonth).forEach(fetchM); mark(); } catch (e) {}
    return r;
  };
  var _r0 = _render; _render = function () { _r0(); try { mark(); } catch (e) {} };
})();
