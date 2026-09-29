/* Meșter — construirea rețelelor electrice (nodurilor) din schemă.
   Unește pinii legați prin fire, prin găurile breadboard-ului (benzi interne),
   prin conexiuni interne ale componentelor și prin pini suprapuși. */
(function (M) {
  'use strict';

  class UnionFind {
    constructor(n) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
    gaseste(x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
    uneste(a, b) { a = this.gaseste(a); b = this.gaseste(b); if (a !== b) this.p[b] = a; }
  }

  // Rotește un punct local (multiplu de pas) cu rot grade (0/90/180/270) și îl translatează
  function transforma(inst, x, y) {
    let rx = x, ry = y;
    switch (((inst.rot || 0) % 360 + 360) % 360) {
      case 90: rx = -y; ry = x; break;
      case 180: rx = -x; ry = -y; break;
      case 270: rx = y; ry = -x; break;
    }
    if (inst.oglinda) rx = -rx;
    return { x: inst.x + rx, y: inst.y + ry };
  }
  function inversTransforma(inst, wx, wy) {
    let x = wx - inst.x, y = wy - inst.y;
    if (inst.oglinda) x = -x;
    switch (((inst.rot || 0) % 360 + 360) % 360) {
      case 90: return { x: y, y: -x };
      case 180: return { x: -x, y: -y };
      case 270: return { x: -y, y: x };
    }
    return { x, y };
  }

  function construieste(proiect) {
    const chei = [];            // "comp:pin"
    const index = new Map();    // cheie -> i
    const pozitii = [];         // {x,y}
    const pinInfo = [];         // {comp, pin, def}
    const componente = proiect.componente;
    const definitii = new Map();
    for (const c of componente) {
      const def = M.componente.def(c.tip);
      if (!def) continue;
      definitii.set(c.id, def);
      const pini = M.componente.pini(c);
      for (const p of pini) {
        const k = c.id + ':' + p.id;
        index.set(k, chei.length);
        chei.push(k);
        const w = transforma(c, p.x, p.y);
        pozitii.push(w);
        pinInfo.push({ comp: c, pin: p, def });
      }
    }
    const uf = new UnionFind(chei.length);
    // 1. conexiuni interne
    for (const c of componente) {
      const def = definitii.get(c.id);
      if (!def || !def.interne) continue;
      const grupuri = def.interne(c.prop || {}, c);
      for (const g of grupuri) {
        let prim = -1;
        for (const pid of g) {
          const i = index.get(c.id + ':' + pid);
          if (i === undefined) continue;
          if (prim < 0) prim = i; else uf.uneste(prim, i);
        }
      }
    }
    // 2. pini suprapuși (aceeași poziție în lume)
    const harta = new Map();
    for (let i = 0; i < pozitii.length; i++) {
      const p = pozitii[i];
      const k = Math.round(p.x) + ',' + Math.round(p.y);
      const lst = harta.get(k);
      if (lst) {
        // nu unim doi pini ai aceleiași componente doar pentru că se suprapun
        for (const j of lst) {
          if (pinInfo[j].comp !== pinInfo[i].comp) { uf.uneste(j, i); break; }
        }
        lst.push(i);
      } else harta.set(k, [i]);
    }
    // 3. fire
    const fireValide = [];
    for (const f of proiect.fire) {
      const a = index.get(f.a.c + ':' + f.a.p);
      const b = index.get(f.b.c + ':' + f.b.p);
      if (a === undefined || b === undefined) continue;
      uf.uneste(a, b);
      fireValide.push(f);
    }
    // numerotare rețele
    const netDeRadacina = new Map();
    const pinNet = new Int32Array(chei.length);
    const netPini = [];
    for (let i = 0; i < chei.length; i++) {
      const r = uf.gaseste(i);
      let n = netDeRadacina.get(r);
      if (n === undefined) { n = netPini.length; netDeRadacina.set(r, n); netPini.push([]); }
      pinNet[i] = n;
      netPini[n].push(i);
    }
    return {
      chei, index, pozitii, pinInfo, pinNet, netPini, harta, fire: fireValide,
      n: netPini.length,
      net(compId, pinId) { const i = index.get(compId + ':' + pinId); return i === undefined ? -1 : pinNet[i]; },
      // pinii „reali” dintr-o rețea (fără găurile goale de breadboard)
      piniReali(net) { return netPini[net].filter(i => !pinInfo[i].def.esteBreadboard); },
      descriere(net) {
        return netPini[net].filter(i => !pinInfo[i].def.esteBreadboard).map(i => {
          const pi = pinInfo[i];
          return (pi.comp.eticheta || pi.comp.id) + '.' + (pi.pin.eticheta || pi.pin.id);
        });
      }
    };
  }

  M.retea = { construieste, transforma, inversTransforma, UnionFind };
})(window.M = window.M || {});
