/* Meșter — modelul proiectului: componente, fire, cod; etichete unice și istoric (anulare/refacere). */
(function (M) {
  'use strict';

  const COD_IMPLICIT = `// Proiect nou pentru ESP32
// Scrie aici codul Arduino. Apasă „Pornește” ca să rulezi simularea.

#define PIN_LED 2   // LED-ul albastru de pe placă

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  Serial.println("Salut de la ESP32!");
}

void loop() {
  digitalWrite(PIN_LED, HIGH);
  delay(500);
  digitalWrite(PIN_LED, LOW);
  delay(500);
}
`;

  const CULORI_FIRE = [
    { c: '#e53935', n: 'Roșu' }, { c: '#1f1f1f', n: 'Negru' }, { c: '#1e88e5', n: 'Albastru' }, { c: '#43a047', n: 'Verde' },
    { c: '#fdd835', n: 'Galben' }, { c: '#fb8c00', n: 'Portocaliu' }, { c: '#f5f5f5', n: 'Alb' }, { c: '#8e24aa', n: 'Mov' },
    { c: '#795548', n: 'Maro' }, { c: '#9e9e9e', n: 'Gri' }
  ];

  function nou(nume) {
    const acum = Date.now();
    return { id: M.u.id('p'), versiune: 1, nume: nume || 'Proiect nou', componente: [], fire: [], cod: COD_IMPLICIT, vedere: null, memorie: {}, creat: acum, modificat: acum };
  }
  function normalizeaza(p) {
    const r = Object.assign(nou(), p || {});
    r.componente = (r.componente || []).filter(c => c && M.componente.def(c.tip)).map(c => Object.assign({ rot: 0, prop: {} }, c));
    const iduri = new Set(r.componente.map(c => c.id));
    r.fire = (r.fire || []).filter(f => f && f.a && f.b && iduri.has(f.a.c) && iduri.has(f.b.c)).map(f => Object.assign({ culoare: '#43a047', puncte: [] }, f));
    for (const c of r.componente) if (!c.eticheta) c.eticheta = urmatoareaEticheta(r, M.componente.def(c.tip).eticheta);
    if (typeof r.cod !== 'string') r.cod = COD_IMPLICIT;
    r.memorie = r.memorie || {};
    return r;
  }
  function urmatoareaEticheta(p, prefix) {
    const folosite = new Set(p.componente.map(c => c.eticheta));
    for (let i = 1; ; i++) { const e = prefix + i; if (!folosite.has(e)) return e; }
  }
  function adaugaComponenta(p, tip, x, y, prop, extra) {
    const def = M.componente.def(tip);
    if (!def) throw new Error('Tip necunoscut: ' + tip);
    const c = Object.assign({ id: M.u.id('c'), tip, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, rot: 0, prop: Object.assign(M.componente.propImplicite(def), prop || {}) }, extra || {});
    if (def.control) c.control = M.componente.controaleImplicite(def);
    c.eticheta = c.eticheta || urmatoareaEticheta(p, def.eticheta);
    // breadboard-urile stau dedesubt
    if (def.esteBreadboard) p.componente.unshift(c); else p.componente.push(c);
    return c;
  }
  function stergeComponenta(p, id) {
    p.componente = p.componente.filter(c => c.id !== id);
    p.fire = p.fire.filter(f => f.a.c !== id && f.b.c !== id);
  }
  function adaugaFir(p, a, b, culoare, puncte) {
    const f = { id: M.u.id('f'), a: { c: a.c, p: a.p }, b: { c: b.c, p: b.p }, culoare: culoare || '#43a047', puncte: puncte || [] };
    p.fire.push(f);
    return f;
  }
  function copie(o) { return JSON.parse(JSON.stringify(o)); }

  // Istoric pentru schemă (componente + fire)
  class Istoric {
    constructor(ia, pune) { this.ia = ia; this.pune = pune; this.inapoi = []; this.inainte = []; this.max = 120; }
    inregistreaza() {
      const s = JSON.stringify(this.ia());
      if (this.inapoi.length && this.inapoi[this.inapoi.length - 1] === s) return;
      this.inapoi.push(s);
      if (this.inapoi.length > this.max) this.inapoi.shift();
      this.inainte = [];
      M.bus.emit('istoric');
    }
    anuleaza() {
      if (!this.inapoi.length) return false;
      this.inainte.push(JSON.stringify(this.ia()));
      this.pune(JSON.parse(this.inapoi.pop()));
      M.bus.emit('istoric');
      return true;
    }
    refa() {
      if (!this.inainte.length) return false;
      this.inapoi.push(JSON.stringify(this.ia()));
      this.pune(JSON.parse(this.inainte.pop()));
      M.bus.emit('istoric');
      return true;
    }
    goleste() { this.inapoi = []; this.inainte = []; M.bus.emit('istoric'); }
  }

  M.proiect = { COD_IMPLICIT, CULORI_FIRE, nou, normalizeaza, urmatoareaEticheta, adaugaComponenta, stergeComponenta, adaugaFir, copie, Istoric };
})(window.M = window.M || {});
