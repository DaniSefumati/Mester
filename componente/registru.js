/* Meșter — registrul componentelor. Fiecare componentă își declară pinii, desenul,
   modelul electric, comportamentul în simulare, controalele și codul generat. */
(function (M) {
  'use strict';

  const CATEGORII = [
    { id: 'placi', nume: 'Plăci de dezvoltare' },
    { id: 'breadboard', nume: 'Breadboard' },
    { id: 'alimentare', nume: 'Alimentare' },
    { id: 'pasive', nume: 'Componente pasive' },
    { id: 'semiconductoare', nume: 'Diode și tranzistoare' },
    { id: 'lumini', nume: 'LED-uri și lumini' },
    { id: 'intrari', nume: 'Butoane și comenzi' },
    { id: 'senzori', nume: 'Senzori' },
    { id: 'afisaje', nume: 'Afișaje' },
    { id: 'motoare', nume: 'Motoare și relee' },
    { id: 'sunet', nume: 'Sunet' },
    { id: 'comunicatii', nume: 'Comunicații și memorie' },
    { id: 'instrumente', nume: 'Instrumente de măsură' }
  ];

  const defs = new Map();
  const cachePini = new Map();

  function defineste(def) {
    if (!def.tip) throw new Error('Componentă fără tip');
    def.prop = def.prop || [];
    def.eticheta = def.eticheta || 'U';
    defs.set(def.tip, def);
    return def;
  }
  function def(tip) { return defs.get(tip); }
  function propImplicite(d) {
    const p = {};
    for (const x of d.prop) p[x.cheie] = x.implicit;
    return p;
  }
  function controaleImplicite(d) {
    const c = {};
    for (const x of (d.control || [])) c[x.cheie] = x.implicit;
    return c;
  }
  function pini(inst) {
    const d = defs.get(inst.tip);
    if (!d) return [];
    const cheie = inst.tip + '|' + JSON.stringify(inst.prop || {});
    let p = cachePini.get(cheie);
    if (!p) {
      p = d.pini(Object.assign(propImplicite(d), inst.prop || {}), inst);
      cachePini.set(cheie, p);
      if (cachePini.size > 500) cachePini.clear();
    }
    return p;
  }
  function cutie(inst) {
    const d = defs.get(inst.tip);
    return d.cutie(Object.assign(propImplicite(d), inst.prop || {}), inst);
  }
  function prop(inst) {
    const d = defs.get(inst.tip);
    return Object.assign(propImplicite(d), inst.prop || {});
  }
  function toate() { return [...defs.values()]; }

  // Valori standard pentru rezistoare (seria E12/E24) folosite la alegeri rapide
  const VALORI_REZISTENTA = [10, 22, 47, 100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700, 6800, 10000, 15000, 22000, 33000, 47000, 68000, 100000, 220000, 470000, 1000000];

  M.componente = { CATEGORII, defineste, def, propImplicite, controaleImplicite, pini, cutie, prop, toate, VALORI_REZISTENTA };
})(window.M = window.M || {});
