/* Meșter — utilitare comune: DOM, evenimente, formatare, memorie locală, clipboard. */
(function (M) {
  'use strict';

  class Emitator {
    constructor() { this.h = {}; }
    on(ev, f) { (this.h[ev] = this.h[ev] || []).push(f); return () => this.off(ev, f); }
    off(ev, f) { this.h[ev] = (this.h[ev] || []).filter(x => x !== f); }
    emit(ev, d) { for (const f of (this.h[ev] || []).slice()) { try { f(d); } catch (e) { console.error('[' + ev + ']', e); } } }
  }
  M.Emitator = Emitator;
  M.bus = new Emitator();

  const SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, atr, ...copii) {
    const e = document.createElement(tag);
    aplica(e, atr);
    for (const c of copii.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  function svgEl(tag, atr) {
    const e = document.createElementNS(SVGNS, tag);
    if (atr) for (const k in atr) { if (atr[k] !== undefined && atr[k] !== null) e.setAttribute(k, atr[k]); }
    return e;
  }
  function aplica(e, atr) {
    if (!atr) return;
    for (const k in atr) {
      const v = atr[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'on') { for (const ev in v) e.addEventListener(ev, v[ev]); }
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k in e && typeof v !== 'string') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  let contorId = 0;
  function id(prefix) { return (prefix || 'x') + Date.now().toString(36).slice(-4) + (++contorId).toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function debounce(f, ms) { let t; const d = function (...a) { clearTimeout(t); t = setTimeout(() => f.apply(this, a), ms); }; d.acum = () => { clearTimeout(t); f(); }; return d; }
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  function numar(v, zec) { if (v === null || v === undefined || isNaN(v)) return '—'; return Number(v).toFixed(zec === undefined ? 2 : zec).replace('.', ','); }
  function formatTimp(us) {
    const s = us / 1e6;
    if (s < 60) return numar(s, 3) + ' s';
    const m = Math.floor(s / 60);
    return m + ' min ' + numar(s - m * 60, 1) + ' s';
  }
  function dataRo(t) {
    const d = new Date(t);
    const azi = new Date();
    const ore = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === azi.toDateString()) return 'azi, ' + ore;
    const ieri = new Date(Date.now() - 864e5);
    if (d.toDateString() === ieri.toDateString()) return 'ieri, ' + ore;
    const luni = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
    return d.getDate() + ' ' + luni[d.getMonth()] + (d.getFullYear() !== azi.getFullYear() ? ' ' + d.getFullYear() : '') + ', ' + ore;
  }
  const memorie = {
    citeste(k, implicit) { try { const v = localStorage.getItem('mester.' + k); return v === null ? implicit : JSON.parse(v); } catch (e) { return implicit; } },
    scrie(k, v) { try { localStorage.setItem('mester.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    sterge(k) { try { localStorage.removeItem('mester.' + k); } catch (e) { /* nimic */ } },
    chei(prefix) { try { const r = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('mester.' + prefix)) r.push(k.slice(7)); } return r; } catch (e) { return []; } }
  };
  async function copiaza(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      try {
        const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } });
        t.value = text; document.body.append(t); t.select();
        const ok = document.execCommand('copy'); t.remove(); return ok;
      } catch (e2) { return false; }
    }
  }
  function nodDinHtml(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  M.u = { el, svgEl, aplica, $, $$, esc, id, debounce, clamp, numar, formatTimp, dataRo, memorie, copiaza, nodDinHtml, SVGNS };
})(window.M = window.M || {});
