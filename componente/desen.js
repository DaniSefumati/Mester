/* Meșter — trusă de desen pentru componente (SVG ca text).
   Unitatea de bază: 10 = 0,1 inch (pasul găurilor de breadboard). */
(function (M) {
  'use strict';
  const PAS = 10;
  const CUL = {
    pcbAlbastru: '#1d5aa6', pcbAlbastruInchis: '#164a8a', pcbVerde: '#2a7a44', pcbNegru: '#1c1f24', pcbMov: '#4a2d86', pcbRosu: '#a8281f',
    serigrafie: '#f3f5f2', aur: '#d6b25a', aurInchis: '#a8843a', cositor: '#c9ccd1', metal: '#b9bec6', metalInchis: '#8a9099',
    negru: '#17191c', plastic: '#2a2d33', alb: '#f4f4ef', cip: '#1f2124'
  };
  let uid = 0;
  function id(p) { return (p || 'g') + (++uid); }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // text serigrafiat
  function text(x, y, t, o) {
    o = o || {};
    const m = o.m || 4.2;
    const a = o.a || 'middle';
    const c = o.c || CUL.serigrafie;
    const g = o.g || 600;
    const rot = o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : '';
    const f = o.f || 'var(--font-pcb)';
    return `<text x="${x}" y="${y}" font-size="${m}" font-family="${f}" font-weight="${g}" fill="${c}" text-anchor="${a}" dominant-baseline="${o.b || 'central'}"${rot}${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${esc(t)}</text>`;
  }
  // placă PCB cu colțuri rotunjite și găuri de prindere
  function pcb(x, y, w, h, o) {
    o = o || {};
    const c = o.culoare || CUL.pcbAlbastru;
    const r = o.raza !== undefined ? o.raza : 2.5;
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}" stroke="rgba(0,0,0,.45)" stroke-width="0.6"/>`;
    s += `<rect x="${x + 0.8}" y="${y + 0.8}" width="${w - 1.6}" height="${h - 1.6}" rx="${Math.max(0, r - 0.8)}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="0.6"/>`;
    if (o.gauri) {
      const g = o.gauri === true ? 3 : o.gauri;
      for (const [gx, gy] of [[x + g, y + g], [x + w - g, y + g], [x + g, y + h - g], [x + w - g, y + h - g]]) {
        s += `<circle cx="${gx}" cy="${gy}" r="1.6" fill="${CUL.cositor}"/><circle cx="${gx}" cy="${gy}" r="1" fill="#0d0f11"/>`;
      }
    }
    return s;
  }
  // pin de antet (pătrat aurit) la poziția exactă a pinului
  function pinAntet(x, y, o) {
    o = o || {};
    const m = o.m || 2.6;
    return `<rect x="${x - m}" y="${y - m}" width="${m * 2}" height="${m * 2}" rx="0.5" fill="${o.fond || '#141518'}"/><rect x="${x - m * 0.55}" y="${y - m * 0.55}" width="${m * 1.1}" height="${m * 1.1}" fill="${CUL.aur}" stroke="${CUL.aurInchis}" stroke-width="0.3"/>`;
  }
  // pad rotund (cositorit) pentru plăci unde pinii sunt găuri
  function pad(x, y, o) {
    o = o || {};
    const r = o.r || 2.4;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${o.patrat ? 'none' : CUL.aur}" stroke="${CUL.aurInchis}" stroke-width="0.4"/>${o.patrat ? `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="${CUL.aur}"/>` : ''}<circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="#101113"/>`;
  }
  // un rând de pini de antet cu etichete
  function randPini(pini, o) {
    o = o || {};
    let s = '';
    for (const p of pini) {
      s += pinAntet(p.x, p.y, o);
      if (o.etichete !== false && p.eticheta) {
        const dx = o.etDx || 0, dy = o.etDy !== undefined ? o.etDy : -5.5;
        s += text(p.x + dx, p.y + dy, p.eticheta, { m: o.etM || 3.2, rot: o.etRot || 0, a: o.etA || 'middle' });
      }
    }
    return s;
  }
  // circuit integrat
  function cip(x, y, w, h, o) {
    o = o || {};
    let s = '';
    const pic = o.picioare || 0;
    if (pic) {
      const pas = o.pasPicioare || 2.54;
      const n = pic;
      for (let i = 0; i < n; i++) {
        const px = x + (w - (n - 1) * pas) / 2 + i * pas;
        s += `<rect x="${px - 0.5}" y="${y - 1.6}" width="1" height="1.8" fill="${CUL.metal}"/><rect x="${px - 0.5}" y="${y + h - 0.2}" width="1" height="1.8" fill="${CUL.metal}"/>`;
      }
    }
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.6" fill="${o.culoare || CUL.cip}"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.6" fill="url(#lucire)" opacity="0.5"/>`;
    if (o.eticheta) s += text(x + w / 2, y + h / 2, o.eticheta, { m: o.m || Math.min(3.2, h * 0.35), c: '#9aa0a8', g: 500 });
    if (o.punct) s += `<circle cx="${x + 1.8}" cy="${y + 1.8}" r="0.7" fill="#3a3d42"/>`;
    return s;
  }
  // picior de componentă (fir) de la (x1,y1) la (x2,y2)
  function picior(x1, y1, x2, y2, o) {
    o = o || {};
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.c || '#aeb3ba'}" stroke-width="${o.g || 1.2}" stroke-linecap="round"/>`;
  }
  function led(x, y, culoare, raza) {
    const r = raza || 1.3;
    return `<circle cx="${x}" cy="${y}" r="${r + 0.4}" fill="rgba(0,0,0,.35)"/><circle cx="${x}" cy="${y}" r="${r}" fill="${culoare}" opacity="0.35" data-led-mic="1"/>`;
  }
  function conector(x, y, w, h, o) {
    o = o || {};
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r || 0.8}" fill="${o.c || CUL.metal}" stroke="${CUL.metalInchis}" stroke-width="0.5"/>`;
  }
  function butonSMD(x, y, eticheta) {
    return `<rect x="${x - 3}" y="${y - 2.2}" width="6" height="4.4" rx="0.5" fill="${CUL.metal}" stroke="${CUL.metalInchis}" stroke-width="0.4"/><circle cx="${x}" cy="${y}" r="1.4" fill="#2b2e33"/>` + (eticheta ? text(x, y + 4.5, eticheta, { m: 2.6 }) : '');
  }
  function cilindruMetal(cx, cy, r) {
    const g = id('cm');
    return `<defs><radialGradient id="${g}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f1f3f6"/><stop offset="0.6" stop-color="#b8bec6"/><stop offset="1" stop-color="#7f858e"/></radialGradient></defs>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g})" stroke="#6c727a" stroke-width="0.5"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="#2a2d31"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r * 0.66}" fill="none" stroke="#50555c" stroke-width="0.4" stroke-dasharray="0.6 0.6"/>`;
  }
  // coduri de culori pentru rezistoare
  const CULORI_INELE = ['#1b1b1b', '#7a4a21', '#d32f2f', '#f57c00', '#fbc02d', '#2e7d32', '#1565c0', '#6a1b9a', '#8a8a8a', '#fafafa'];
  function inele(valoare) {
    if (!(valoare > 0)) valoare = 0;
    let exp = 0;
    let v = valoare;
    if (v === 0) return { benzi: [CULORI_INELE[0]], mult: CULORI_INELE[0] };
    while (v >= 100) { v /= 10; exp++; }
    while (v < 10) { v *= 10; exp--; }
    v = Math.round(v);
    if (v >= 100) { v = 10; exp++; }
    const d1 = Math.floor(v / 10), d2 = v % 10;
    let mult;
    if (exp >= 0 && exp <= 9) mult = CULORI_INELE[exp];
    else if (exp === -1) mult = '#c9a227'; // auriu
    else mult = '#c0c0c0'; // argintiu
    return { benzi: [CULORI_INELE[d1], CULORI_INELE[d2]], mult };
  }
  function formatValoare(v, unitate) {
    if (v === undefined || v === null || isNaN(v)) return '';
    const a = Math.abs(v);
    let s, suf = '';
    if (a >= 1e9) { s = v / 1e9; suf = 'G'; }
    else if (a >= 1e6) { s = v / 1e6; suf = 'M'; }
    else if (a >= 1e3) { s = v / 1e3; suf = 'k'; }
    else if (a >= 1 || a === 0) { s = v; }
    else if (a >= 1e-3) { s = v * 1e3; suf = 'm'; }
    else if (a >= 1e-6) { s = v * 1e6; suf = 'µ'; }
    else if (a >= 1e-9) { s = v * 1e9; suf = 'n'; }
    else { s = v * 1e12; suf = 'p'; }
    let t = Math.abs(s) >= 100 ? s.toFixed(0) : Math.abs(s) >= 10 ? (+s.toFixed(1)).toString() : (+s.toFixed(2)).toString();
    t = t.replace('.', ',');
    return t + (unitate ? ' ' + suf + unitate : suf);
  }
  function parseValoare(txt) {
    if (typeof txt === 'number') return txt;
    const s = String(txt).trim().replace(',', '.').replace(/\s+/g, '').replace(/[ΩΩohmFVAH]+$/i, '');
    const m = /^(-?\d*\.?\d+)\s*([pnuµmkKMG]?)(\d*)$/.exec(s);
    if (!m) return NaN;
    let v = parseFloat(m[1]);
    const mult = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 }[m[2]] || 1;
    // notație 4k7
    if (m[3]) v = parseFloat(m[1] + '.' + m[3]);
    return v * mult;
  }

  M.desen = { PAS, CUL, text, pcb, pinAntet, pad, randPini, cip, picior, led, conector, butonSMD, cilindruMetal, inele, formatValoare, parseValoare, esc, id };
})(window.M = window.M || {});
