/* Meșter — plăci de prototipare (breadboard) de 830, 400 și 170 de găuri.
   Găurile a–e și f–j ale fiecărei coloane sunt legate intern; șinele de alimentare
   sunt legate pe toată lungimea. */
(function (M) {
  'use strict';
  const D = M.desen;
  const RANDURI_SUS = ['a', 'b', 'c', 'd', 'e'];
  const RANDURI_JOS = ['f', 'g', 'h', 'i', 'j'];

  function geometrie(marime) {
    if (marime === 'mini') return { col: 17, sine: false, w: 200, h: 150, y0: 20, grupe: 0 };
    if (marime === 'jumatate') return { col: 30, sine: true, w: 330, h: 215, y0: 50, grupe: 5, primaSina: 2 };
    return { col: 63, sine: true, w: 660, h: 215, y0: 50, grupe: 10, primaSina: 3 };
  }
  // y pentru rânduri
  function yRand(g, r) {
    const i = RANDURI_SUS.indexOf(r);
    if (i >= 0) return g.y0 + i * 10;
    const j = RANDURI_JOS.indexOf(r);
    return g.y0 + 70 + j * 10;
  }
  function coloaneSina(g) {
    const c = [];
    for (let k = 0; k < g.grupe; k++) for (let q = 0; q < 5; q++) c.push(g.primaSina + k * 6 + q);
    return c;
  }
  const SINE = [
    { id: 'S1', y: 10, semn: '+', culoare: '#d83a2e' },
    { id: 'S2', y: 20, semn: '−', culoare: '#2a63c9' },
    { id: 'S3', y: 190, semn: '+', culoare: '#d83a2e' },
    { id: 'S4', y: 200, semn: '−', culoare: '#2a63c9' }
  ];

  function pini(p) {
    const g = geometrie(p.marime);
    const r = [];
    for (let c = 1; c <= g.col; c++) {
      const x = (c - 1) * 10 + 20;
      for (const rr of RANDURI_SUS.concat(RANDURI_JOS)) r.push({ id: rr + c, x, y: yRand(g, rr), gaura: true });
    }
    if (g.sine) {
      for (const s of SINE) {
        coloaneSina(g).forEach((c, i) => r.push({ id: s.id + '_' + (i + 1), x: (c - 1) * 10 + 20, y: s.y, gaura: true, sina: s.id }));
      }
    }
    return r;
  }
  function interne(p) {
    const g = geometrie(p.marime);
    const gr = [];
    for (let c = 1; c <= g.col; c++) {
      gr.push(RANDURI_SUS.map(r => r + c));
      gr.push(RANDURI_JOS.map(r => r + c));
    }
    if (g.sine) for (const s of SINE) gr.push(coloaneSina(g).map((c, i) => s.id + '_' + (i + 1)));
    return gr;
  }

  M.componente.defineste({
    tip: 'breadboard', nume: 'Breadboard', categorie: 'breadboard', eticheta: 'BB', esteBreadboard: true,
    cauta: 'breadboard placa de test prototipare 830 400 170 gauri',
    descriere: 'Placă de test fără lipire. Cele 5 găuri de pe aceeași coloană (a–e sau f–j) sunt legate între ele. Șinele roșii (+) și albastre (−) sunt legate pe toată lungimea.',
    prop: [{ cheie: 'marime', eticheta: 'Mărime', tip: 'alegere', optiuni: [['completa', '830 de găuri'], ['jumatate', '400 de găuri'], ['mini', '170 de găuri']], implicit: 'completa' }],
    pini, interne,
    cutie(p) { const g = geometrie(p.marime); return { x: 0, y: 0, w: g.w, h: g.h }; },
    desen(p) {
      const g = geometrie(p.marime);
      let s = `<rect x="0" y="0" width="${g.w}" height="${g.h}" rx="5" fill="var(--bb-corp)" stroke="var(--bb-margine)" stroke-width="1"/>`;
      // șanțul din mijloc
      s += `<rect x="4" y="${g.y0 + 43}" width="${g.w - 8}" height="14" rx="2" fill="var(--bb-sant)"/>`;
      if (g.sine) {
        s += `<rect x="4" y="3" width="${g.w - 8}" height="25" rx="2" fill="var(--bb-sina)"/>`;
        s += `<rect x="4" y="${g.h - 32}" width="${g.w - 8}" height="25" rx="2" fill="var(--bb-sina)"/>`;
        for (const si of SINE) {
          const ly = si.y + (si.semn === '+' ? -6 : 6);
          const lyy = si.id === 'S1' ? 4.5 : si.id === 'S2' ? 25.5 : si.id === 'S3' ? g.h - 30.5 : g.h - 9.5;
          void ly;
          s += `<line x1="14" y1="${lyy}" x2="${g.w - 14}" y2="${lyy}" stroke="${si.culoare}" stroke-width="1"/>`;
          s += D.text(8, si.y, si.semn, { m: 6, c: si.culoare, g: 700, f: 'var(--font-ui)' });
          s += D.text(g.w - 8, si.y, si.semn, { m: 6, c: si.culoare, g: 700, f: 'var(--font-ui)' });
        }
      }
      // găuri
      let d = '';
      for (const pin of pini(p)) d += `M${pin.x - 1.7} ${pin.y - 1.7}h3.4v3.4h-3.4z`;
      s += `<path d="${d}" fill="var(--bb-gaura)"/>`;
      // etichete rânduri și coloane
      for (const r of RANDURI_SUS.concat(RANDURI_JOS)) {
        s += D.text(9, yRand(g, r), r, { m: 5, c: 'var(--bb-text)', g: 500, f: 'var(--font-ui)' });
        s += D.text(g.w - 9, yRand(g, r), r, { m: 5, c: 'var(--bb-text)', g: 500, f: 'var(--font-ui)' });
      }
      for (let c = 1; c <= g.col; c++) {
        if (c === 1 || c % 5 === 0) {
          const x = (c - 1) * 10 + 20;
          s += D.text(x, g.y0 - 8, String(c), { m: 4.2, c: 'var(--bb-text)', g: 500, f: 'var(--font-ui)' });
          s += D.text(x, g.y0 + 118, String(c), { m: 4.2, c: 'var(--bb-text)', g: 500, f: 'var(--font-ui)' });
        }
      }
      return s;
    },
    electric() { return {}; }
  });

  M.breadboard = { geometrie, yRand };
})(window.M = window.M || {});
