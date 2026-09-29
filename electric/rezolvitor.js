/* Meșter — rezolvitorul de circuit (analiză nodală cu Newton–Raphson).
   Elemente: rezistoare, surse (Norton), diode/LED-uri, comutatoare, tranzistoare
   bipolare (Ebers–Moll), MOSFET-uri, surse de curent și pini GPIO.
   Circuitul e împărțit în „insule” separate de nodurile cu tensiune fixă (GND, 3V3, 5V),
   ca o schimbare pe un pin să recalculeze doar partea afectată. */
(function (M) {
  'use strict';

  const VT = 0.025852; // tensiunea termică la 27°C
  const GMIN = 1e-9;

  function pnjlim(vnou, vvechi, vt, vcrit) {
    if (vnou > vcrit && Math.abs(vnou - vvechi) > 2 * vt) {
      if (vvechi > 0) {
        const arg = 1 + (vnou - vvechi) / vt;
        vnou = arg > 0 ? vvechi + vt * Math.log(arg) : vcrit;
      } else vnou = vt * Math.log(vnou / vt);
    }
    return vnou;
  }

  // Rezolvă sistemul liniar A·x = b (A n×n, stocat pe rânduri). Modifică A și b.
  function rezolvaLiniar(A, b, n) {
    for (let k = 0; k < n; k++) {
      let max = Math.abs(A[k * n + k]), p = k;
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > max) { max = v; p = i; } }
      if (max < 1e-18) { A[k * n + k] = 1e-12; continue; }
      if (p !== k) {
        for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
        const t = b[k]; b[k] = b[p]; b[p] = t;
      }
      const pk = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = A[i * n + k] / pk;
        if (f === 0) continue;
        for (let j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j];
        b[i] -= f * b[k];
      }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
      x[i] = s / A[i * n + i];
    }
    return x;
  }

  /* ---------- elemente ---------- */
  // Fiecare element are: noduri (rețele), stamp(ctx), curent(), ancora()
  class Rezistor {
    constructor(a, b, r) { this.a = a; this.b = b; this.r = Math.max(r, 1e-4); this.i = 0; this.tip = 'R'; }
    noduri() { return [this.a, this.b]; }
    stamp(c) { c.g(this.a, this.b, 1 / this.r); }
    calculeaza(c) { this.v = c.v(this.a) - c.v(this.b); this.i = this.v / this.r; this.p = this.v * this.i; }
    ancora() { return false; }
  }
  class Comutator {
    constructor(a, b, inchis, ron) { this.a = a; this.b = b; this.inchis = !!inchis; this.ron = ron || 0.05; this.i = 0; this.tip = 'S'; }
    noduri() { return [this.a, this.b]; }
    stamp(c) { c.g(this.a, this.b, this.inchis ? 1 / this.ron : 1e-12); }
    calculeaza(c) { this.v = c.v(this.a) - c.v(this.b); this.i = this.inchis ? this.v / this.ron : 0; }
    ancora() { return false; }
  }
  // Sursă de tensiune reală: V în serie cu R (echivalent Norton). v poate fi funcție.
  class Sursa {
    constructor(p, n, v, r) { this.p = p; this.n = n; this.val = v; this.r = r || 0.1; this.i = 0; this.tip = 'V'; this.activa = true; }
    noduri() { return [this.p, this.n]; }
    V() { return typeof this.val === 'function' ? this.val() : this.val; }
    stamp(c) {
      if (!this.activa) return;
      const g = 1 / this.r, v = this.V();
      c.g(this.p, this.n, g);
      c.sursaCurent(this.n, this.p, v * g);
    }
    calculeaza(c) {
      if (!this.activa) { this.i = 0; return; }
      // curentul care iese pe borna +
      this.i = (this.V() - (c.v(this.p) - c.v(this.n))) / this.r;
      this.p_ = this.i * this.V();
    }
    ancora() { return this.activa; }
  }
  class SursaCurent {
    constructor(a, b, i) { this.a = a; this.b = b; this.val = i; this.tip = 'I'; this.i = 0; }
    noduri() { return [this.a, this.b]; }
    I() { return typeof this.val === 'function' ? this.val() : this.val; }
    stamp(c) { c.sursaCurent(this.a, this.b, this.I()); }
    calculeaza() { this.i = this.I(); }
    ancora() { return false; }
  }
  // Diodă / LED: model Shockley + rezistență serie (nod intern)
  class Dioda {
    constructor(a, k, model, nodIntern) {
      this.a = a; this.k = k; this.m = model; this.x = nodIntern; // x = nod intern (după rezistența serie)
      this.nvt = model.n * VT;
      this.is = model.is;
      this.vcrit = this.nvt * Math.log(this.nvt / (Math.SQRT2 * this.is));
      this.vd = 0; this.i = 0; this.tip = 'D';
    }
    noduri() { return this.x !== undefined && this.x >= 0 ? [this.a, this.k, this.x] : [this.a, this.k]; }
    stamp(c) {
      const anod = this.x >= 0 ? this.x : this.a;
      if (this.x >= 0) c.g(this.a, this.x, 1 / this.m.rs);
      const vdReal = c.v(anod) - c.v(this.k);
      let vd = pnjlim(vdReal, this.vd, this.nvt, this.vcrit);
      if (Math.abs(vd - vdReal) > 1e-7) c.limitat = true;
      // străpungere inversă (zener / tensiune maximă inversă)
      let id, gd;
      const e = Math.exp(Math.min(vd / this.nvt, 80));
      id = this.is * (e - 1);
      gd = this.is * e / this.nvt + GMIN;
      if (this.m.vz && vd < -this.m.vz + 0.5) {
        const x = (-vd - this.m.vz) / this.nvt;
        const ez = Math.exp(Math.min(x, 80));
        id -= this.is * 1e6 * ez;
        gd += this.is * 1e6 * ez / this.nvt;
      }
      this.vd = vd;
      const ieq = id - gd * vd;
      c.g(anod, this.k, gd);
      c.sursaCurent(anod, this.k, ieq);
    }
    calculeaza(c) {
      const anod = this.x >= 0 ? this.x : this.a;
      const vd = c.v(anod) - c.v(this.k);
      let i = this.is * (Math.exp(Math.min(vd / this.nvt, 80)) - 1);
      if (this.m.vz && vd < -this.m.vz) i -= this.is * 1e6 * Math.exp(Math.min((-vd - this.m.vz) / this.nvt, 80));
      this.i = i;
      this.v = c.v(this.a) - c.v(this.k);
      this.p = this.v * this.i;
    }
    ancora() { return false; }
    reseteazaStare() { this.vd = 0; }
  }
  // Tranzistor bipolar, model Ebers–Moll de transport
  class TranzistorBJT {
    constructor(c_, b, e, pnp, bf) {
      this.c = c_; this.b = b; this.e = e; this.pnp = !!pnp; this.bf = bf || 150; this.br = 2;
      this.is = 1e-14; this.vbe = 0; this.vbc = 0; this.tip = 'Q';
      this.vcrit = VT * Math.log(VT / (Math.SQRT2 * this.is));
      this.ic = 0; this.ib = 0;
    }
    noduri() { return [this.c, this.b, this.e]; }
    stamp(k) {
      const s = this.pnp ? -1 : 1;
      let vbe = s * (k.v(this.b) - k.v(this.e));
      let vbc = s * (k.v(this.b) - k.v(this.c));
      const vbeReal = vbe, vbcReal = vbc;
      vbe = pnjlim(vbe, this.vbe, VT, this.vcrit);
      vbc = pnjlim(vbc, this.vbc, VT, this.vcrit);
      if (Math.abs(vbe - vbeReal) > 1e-7 || Math.abs(vbc - vbcReal) > 1e-7) k.limitat = true;
      this.vbe = vbe; this.vbc = vbc;
      const ebe = Math.exp(Math.min(vbe / VT, 80)), ebc = Math.exp(Math.min(vbc / VT, 80));
      const is = this.is, bf = this.bf, br = this.br;
      // curenți (convenție NPN; intră în terminal)
      const icc = is * (ebe - ebc);
      const ic = icc - is / br * (ebc - 1);
      const ib = is / bf * (ebe - 1) + is / br * (ebc - 1);
      // derivate
      const gbe = is * ebe / VT, gbc = is * ebc / VT;
      const dic_dvbe = gbe, dic_dvbc = -gbc - gbc / br;
      const dib_dvbe = gbe / bf, dib_dvbc = gbc / br;
      // tensiuni noduri: vbe = s(vb - ve), vbc = s(vb - vc)
      // I_c (intră în C) = s*ic ; I_b = s*ib ; I_e = -(I_c + I_b)
      // Jacobian față de vb, vc, ve
      const C = this.c, B = this.b, Ee = this.e;
      const dIc = { b: dic_dvbe + dic_dvbc, c: -dic_dvbc, e: -dic_dvbe };
      const dIb = { b: dib_dvbe + dib_dvbc, c: -dib_dvbc, e: -dib_dvbe };
      const dIe = { b: -(dIc.b + dIb.b), c: -(dIc.c + dIb.c), e: -(dIc.e + dIb.e) };
      // echivalent liniarizat: I = I0 + J·(v - v0); curentul intră în nod din element => în KCL apare ca -I (iese din nod spre element)
      // punctul de liniarizare: tensiunile de joncțiune LIMITATE (altfel Newton face pași minusculi și nu converge)
      const ve = k.v(Ee), vb = ve + s * vbe, vc = vb - s * vbc;
      const Ic = s * ic, Ib = s * ib, Ie = -(Ic + Ib);
      const lin = (nod, I, d) => {
        // curent care curge din nod în tranzistor = I(v)
        k.jac(nod, B, d.b); k.jac(nod, C, d.c); k.jac(nod, Ee, d.e);
        k.injectie(nod, -(I - d.b * vb - d.c * vc - d.e * ve));
      };
      lin(C, Ic, dIc); lin(B, Ib, dIb); lin(Ee, Ie, dIe);
      // GMIN pe joncțiuni pentru stabilitate
      k.g(B, Ee, GMIN); k.g(B, C, GMIN);
    }
    calculeaza(k) {
      const s = this.pnp ? -1 : 1;
      const vbe = s * (k.v(this.b) - k.v(this.e)), vbc = s * (k.v(this.b) - k.v(this.c));
      const ebe = Math.exp(Math.min(vbe / VT, 80)), ebc = Math.exp(Math.min(vbc / VT, 80));
      const is = this.is;
      this.ic = s * (is * (ebe - ebc) - is / this.br * (ebc - 1));
      this.ib = s * (is / this.bf * (ebe - 1) + is / this.br * (ebc - 1));
      this.i = this.ic;
      this.vce = s * (k.v(this.c) - k.v(this.e));
      this.p = Math.abs(this.ic * this.vce);
    }
    ancora() { return false; }
    reseteazaStare() { this.vbe = 0; this.vbc = 0; }
  }
  // MOSFET canal N/P, model pătratic cu tranziție netedă
  class Mosfet {
    constructor(d, g, s, pcanal, vth, kp) {
      this.d = d; this.gt = g; this.s = s; this.p = !!pcanal; this.vth = vth || 1.8; this.kp = kp || 2; this.tip = 'MOS'; this.id = 0;
      this.vgsV = 0;
    }
    noduri() { return [this.d, this.gt, this.s]; }
    model(vgs, vds) {
      // întoarce [id, gm, gds] pentru vds >= 0
      const vov = vgs - this.vth;
      const lambda = 0.01;
      if (vov <= 0) {
        // sub prag: curent exponențial mic
        const i0 = 1e-9 * Math.exp(Math.max(-40, vov / 0.1));
        return [i0 * (1 - Math.exp(-vds / 0.05)), i0 / 0.1, i0 / 0.05 * Math.exp(-vds / 0.05)];
      }
      if (vds < vov) {
        const id = this.kp * (vov * vds - vds * vds / 2) * (1 + lambda * vds);
        const gm = this.kp * vds * (1 + lambda * vds);
        const gds = this.kp * (vov - vds) * (1 + lambda * vds) + this.kp * (vov * vds - vds * vds / 2) * lambda;
        return [id, gm, gds];
      }
      const id = this.kp / 2 * vov * vov * (1 + lambda * vds);
      return [id, this.kp * vov * (1 + lambda * vds), this.kp / 2 * vov * vov * lambda];
    }
    stamp(k) {
      const sg = this.p ? -1 : 1;
      let vd = k.v(this.d), vg = k.v(this.gt), vs = k.v(this.s);
      let vgs = sg * (vg - vs), vds = sg * (vd - vs);
      // limitare pas
      let limitat = false;
      if (Math.abs(vgs - this.vgsV) > 1) { vgs = this.vgsV + Math.sign(vgs - this.vgsV); limitat = true; }
      this.vgsV = vgs;
      let inv = false;
      if (vds < 0) { inv = true; vds = -vds; vgs = sg * (vg - vd); limitat = false; }
      if (limitat) k.limitat = true;
      const [id, gm, gds] = this.model(vgs, vds);
      // curent drenă->sursă (în convenția N)
      const D = inv ? this.s : this.d, S = inv ? this.d : this.s;
      const vD = k.v(D), vS = k.v(S), vG = limitat ? vS + sg * vgs : vg;
      // I(D->S) = sg*id; derivate față de vG, vD, vS
      const dG = sg * gm * sg, dD = sg * gds * sg, dS = -(dG + dD);
      const I = sg * id;
      k.jac(D, this.gt, dG); k.jac(D, D, dD); k.jac(D, S, dS);
      k.injectie(D, -(I - dG * vG - dD * vD - dS * vS));
      k.jac(S, this.gt, -dG); k.jac(S, D, -dD); k.jac(S, S, -dS);
      k.injectie(S, (I - dG * vG - dD * vD - dS * vS));
      k.g(this.gt, this.s, 1e-9);
      k.g(this.d, this.s, 1e-9);
    }
    calculeaza(k) {
      const sg = this.p ? -1 : 1;
      const vd = k.v(this.d), vg = k.v(this.gt), vs = k.v(this.s);
      let vgs = sg * (vg - vs), vds = sg * (vd - vs), semn = 1;
      if (vds < 0) { vds = -vds; vgs = sg * (vg - vd); semn = -1; }
      this.id = sg * semn * this.model(vgs, vds)[0];
      this.i = this.id;
      this.p_ = Math.abs(this.id * (vd - vs));
    }
    ancora() { return false; }
    reseteazaStare() { this.vgsV = 0; }
  }

  // Ieșire comandată față de masă: împinge nodul spre o tensiune printr-o rezistență.
  // getStare() întoarce {v, r} sau null (înaltă impedanță). Folosită de ieșirile modulelor.
  class IesireComandata {
    constructor(net, getStare) { this.net = net; this.getStare = getStare; this.tip = 'OUT'; this.i = 0; }
    noduri() { return [this.net]; }
    stamp(c) { const s = this.getStare(c.mod); if (s) c.gFix(this.net, 1 / s.r, s.v); }
    calculeaza(c) { const s = this.getStare('inst'); this.i = s ? (s.v - c.v(this.net)) / s.r : 0; }
    ancora() { const s = this.getStare('inst'); return !!s; }
  }
  // Pin GPIO al plăcii: ieșire push-pull / open-drain, rezistențe interne pull-up/pull-down, PWM, DAC
  class ElementGPIO {
    constructor(net, stare, sim) { this.net = net; this.st = stare; this.sim = sim; this.tip = 'GPIO'; this.i = 0; this.iMed = 0; }
    noduri() { return [this.net]; }
    pwmActiv() { const p = this.st.pwm; return !!(p && this.st.mod === 'OUTPUT' && p.duty > 0 && p.duty < 1 && p.frecventa > 0); }
    duty() { return this.st.pwm ? this.st.pwm.duty : 0; }
    nivel(mod) {
      const st = this.st;
      if (st.pwm && st.pwm.frecventa > 0) {
        if (mod && typeof mod === 'object') { if (mod.sus === this) return 1; if (this.pwmActiv()) return 0; }
        if (st.pwm.duty <= 0) return 0;
        if (st.pwm.duty >= 1) return 1;
        if (mod === 'medie') return st.pwm.duty;
        // nivelul instantaneu după faza semnalului
        const per = 1e6 / st.pwm.frecventa;
        const t = this.sim ? this.sim.timp : 0;
        return ((t % per) / per) < st.pwm.duty ? 1 : 0;
      }
      return st.nivel ? 1 : 0;
    }
    parametri(mod) {
      const st = this.st;
      const vdd = st.vdd || 3.3;
      if (st.dac !== null && st.dac !== undefined) return { v: st.dac, r: 800 };
      switch (st.mod) {
        case 'OUTPUT': return { v: this.nivel(mod) * vdd, r: st.rOut || 30 };
        case 'OUTPUT_OPEN_DRAIN': return this.nivel(mod) ? null : { v: 0, r: st.rOut || 30 };
        case 'INPUT_PULLUP': return st.arePull === false ? null : { v: vdd, r: st.rPull || 45000 };
        case 'INPUT_PULLDOWN': return st.arePull === false ? null : { v: 0, r: st.rPull || 45000 };
        default: return null;
      }
    }
    stamp(c) { const p = this.parametri(c.mod); if (p) c.gFix(this.net, 1 / p.r, p.v); }
    calculeaza(c) { const p = this.parametri(c.mod); this.i = p ? (p.v - c.v(this.net)) / p.r : 0; }
    ancora() { return !!this.parametri('inst'); }
  }

  /* ---------- circuitul ---------- */
  class Circuit {
    constructor(nrRetele) {
      this.nr = nrRetele;
      this.elemente = [];
      this.fix = new Map();       // rețea -> tensiune fixă
      this.fixSursa = new Map();  // rețea -> descrierea sursei care o fixează
      this.conflicte = [];
      this.nodInternUrmator = nrRetele;
      this.v = new Float64Array(nrRetele + 256);
      this.insule = [];
      this.insulaNodului = null;
      this.fixeCurent = new Map();
    }
    nodIntern() { const n = this.nodInternUrmator++; if (n >= this.v.length) { const nv = new Float64Array(this.v.length * 2); nv.set(this.v); this.v = nv; } return n; }
    adauga(el) { this.elemente.push(el); return el; }
    fixeaza(net, volti, sursa) {
      if (net < 0) return;
      if (this.fix.has(net)) {
        const vechi = this.fix.get(net);
        if (Math.abs(vechi - volti) > 0.05) this.conflicte.push({ net, v1: vechi, v2: volti, s1: this.fixSursa.get(net), s2: sursa });
        return;
      }
      this.fix.set(net, volti);
      this.fixSursa.set(net, sursa);
    }
    // împarte circuitul în insule după nodurile libere
    construiesteInsule() {
      const N = this.nodInternUrmator;
      const uf = new M.retea.UnionFind(N);
      const folosit = new Uint8Array(N);
      const faraInsula = [];
      for (const el of this.elemente) {
        const nd = el.noduri().filter(n => n >= 0 && !this.fix.has(n));
        for (const n of nd) folosit[n] = 1;
        for (let i = 1; i < nd.length; i++) uf.uneste(nd[0], nd[i]);
        if (!nd.length) faraInsula.push(el);
      }
      const harta = new Map();
      this.insulaNodului = new Int32Array(N).fill(-1);
      for (let n = 0; n < N; n++) {
        if (!folosit[n]) continue;
        const r = uf.gaseste(n);
        let ins = harta.get(r);
        if (!ins) { ins = { noduri: [], elemente: [], murdara: true, neliniar: false, ancorata: false, pwm: [] }; harta.set(r, ins); this.insule.push(ins); }
        this.insulaNodului[n] = this.insule.indexOf(ins);
        ins.noduri.push(n);
      }
      for (const el of this.elemente) {
        const nd = el.noduri().filter(n => n >= 0 && !this.fix.has(n));
        if (!nd.length) continue;
        const ins = this.insule[this.insulaNodului[nd[0]]];
        ins.elemente.push(el);
        el.insula = ins;
        if (el.tip === 'D' || el.tip === 'Q' || el.tip === 'MOS' || el.neliniar) ins.neliniar = true;
      }
      this.faraInsula = faraInsula;
      for (const ins of this.insule) {
        ins.index = new Map(ins.noduri.map((n, i) => [n, i]));
        ins.pwm = ins.elemente.filter(e => e.tip === 'GPIO');
        // surse care se schimbă în timp (ex. ieșirea unui microfon): se recalculează la fiecare citire
        ins.dinamica = ins.elemente.some(e => e.dinamic);
      }
    }
    murdarNet(net) {
      if (net < 0 || !this.insulaNodului) return;
      const i = this.insulaNodului[net];
      if (i >= 0) this.insule[i].murdara = true;
    }
    murdarTot() { for (const ins of this.insule) ins.murdara = true; this.faraInsulaMurdare = true; }
    tensiune(net) {
      if (net < 0) return NaN;
      if (this.fix.has(net)) return this.fix.get(net);
      const i = this.insulaNodului ? this.insulaNodului[net] : -1;
      if (i < 0) return NaN; // neconectat
      const ins = this.insule[i];
      if (ins.murdara || ins.dinamica) this.rezolvaInsula(ins, 'inst');
      return this.v[net];
    }
    // Rezolvă o insulă. mod: 'inst' (starea de acum a pinilor) sau o funcție care dă nivelul PWM
    rezolvaInsula(ins, mod) {
      const n = ins.noduri.length;
      const idx = ins.index;
      const v = this.v, fix = this.fix;
      const ctx = {
        A: null, b: null,
        v: (net) => net < 0 ? 0 : (fix.has(net) ? fix.get(net) : v[net]),
        g: (a, b2, g) => {
          const ia = a >= 0 && !fix.has(a) ? idx.get(a) : undefined;
          const ib = b2 >= 0 && !fix.has(b2) ? idx.get(b2) : undefined;
          const va = a >= 0 && fix.has(a) ? fix.get(a) : 0, vb = b2 >= 0 && fix.has(b2) ? fix.get(b2) : 0;
          if (ia !== undefined) { ctx.A[ia * n + ia] += g; if (ib !== undefined) ctx.A[ia * n + ib] -= g; else ctx.b[ia] += g * vb; }
          if (ib !== undefined) { ctx.A[ib * n + ib] += g; if (ia !== undefined) ctx.A[ib * n + ia] -= g; else ctx.b[ib] += g * va; }
        },
        // curent i care iese din nodul a și intră în nodul b (prin element)
        sursaCurent: (a, b2, i) => {
          const ia = a >= 0 && !fix.has(a) ? idx.get(a) : undefined;
          const ib = b2 >= 0 && !fix.has(b2) ? idx.get(b2) : undefined;
          if (ia !== undefined) ctx.b[ia] -= i;
          if (ib !== undefined) ctx.b[ib] += i;
        },
        // termen de Jacobian: derivata curentului care iese din `rand` față de tensiunea `col`
        jac: (rand, col, val) => {
          const ir = rand >= 0 && !fix.has(rand) ? idx.get(rand) : undefined;
          if (ir === undefined) return;
          if (col >= 0 && fix.has(col)) { ctx.b[ir] -= val * fix.get(col); return; }
          const ic = col >= 0 ? idx.get(col) : undefined;
          if (ic === undefined) return; // col la masă (0V) sau în afara insulei
          ctx.A[ir * n + ic] += val;
        },
        // curent constant care iese din nod (partea liberă a liniarizării)
        injectie: (rand, i) => {
          const ir = rand >= 0 && !fix.has(rand) ? idx.get(rand) : undefined;
          if (ir !== undefined) ctx.b[ir] += i;
        },
        // conductanță g de la nodul a către un potențial fix vref (ex. ieșirea unui pin)
        gFix: (a, g, vref) => {
          const ia = a >= 0 && !fix.has(a) ? idx.get(a) : undefined;
          if (ia === undefined) return;
          ctx.A[ia * n + ia] += g;
          ctx.b[ia] += g * vref;
        },
        mod
      };
      const iteratii = (maxIt, gExtra) => {
        for (let it = 0; it < maxIt; it++) {
          ctx.A = new Float64Array(n * n);
          ctx.b = new Float64Array(n);
          ctx.limitat = false;
          for (const el of ins.elemente) el.stamp(ctx);
          for (let i = 0; i < n; i++) ctx.A[i * n + i] += GMIN + gExtra;
          const x = rezolvaLiniar(ctx.A, ctx.b, n);
          let dmax = 0;
          for (let i = 0; i < n; i++) {
            let xi = x[i];
            if (!isFinite(xi)) xi = 0;
            const net = ins.noduri[i];
            const d = Math.abs(xi - v[net]);
            if (d > dmax) dmax = d;
            // amortizare pentru circuite neliniare
            if (ins.neliniar && d > 2) xi = v[net] + Math.sign(xi - v[net]) * 2;
            v[net] = xi;
          }
          // convergent doar dacă nodurile nu se mai mișcă ȘI nicio joncțiune n-a mai fost limitată
          if (dmax < 1e-6 && !ctx.limitat) return true;
        }
        return false;
      };
      let convergent;
      if (!ins.neliniar) convergent = iteratii(1, 0) || true;
      else {
        const salvat = ins.noduri.map(nd => v[nd]);
        convergent = iteratii(150, 0);
        if (!convergent) {
          // a doua încercare: pornim de la zero și coborâm treptat o conductanță spre masă (gmin stepping)
          for (const nd of ins.noduri) v[nd] = 0;
          for (const el of ins.elemente) if (el.reseteazaStare) el.reseteazaStare();
          for (let g = 1e-2; g > 1e-10; g /= 10) iteratii(60, g);
          convergent = iteratii(200, 0);
          if (!convergent) {
            // tot nimic: păstrăm ultima soluție bună în loc de valori absurde
            ins.noduri.forEach((nd, i) => { v[nd] = salvat[i]; });
          }
        }
      }
      ins.convergent = convergent || !ins.neliniar;
      for (const el of ins.elemente) el.calculeaza(ctx);
      if (mod === 'inst') ins.murdara = false;
      return ctx;
    }
    // Un nod e „flotant” dacă nu are nicio cale conductoare spre o sursă sau spre un nod fix.
    flotant(net) {
      if (net < 0) return true;
      if (this.fix.has(net)) return false;
      const i = this.insulaNodului ? this.insulaNodului[net] : -1;
      if (i < 0) return true;
      const ins = this.insule[i];
      if (!ins.elNet) {
        ins.elNet = new Map();
        for (const el of ins.elemente) for (const nd of el.noduri()) {
          if (!ins.elNet.has(nd)) ins.elNet.set(nd, []);
          ins.elNet.get(nd).push(el);
        }
      }
      const vazut = new Set([net]);
      const coada = [net];
      while (coada.length) {
        const nd = coada.pop();
        for (const el of (ins.elNet.get(nd) || [])) {
          if (el.tip === 'S' && !el.inchis) continue;
          if (el.ancora()) return false;
          if (el.tip === 'GPIO' || el.tip === 'OUT' || el.tip === 'I') continue;
          let vecini = el.noduri();
          if (el.tip === 'MOS') { if (nd === el.gt) continue; vecini = [el.d, el.s]; }
          for (const v of vecini) {
            if (v < 0) continue;
            if (this.fix.has(v)) return false;
            if (!vazut.has(v)) { vazut.add(v); coada.push(v); }
          }
        }
      }
      return true;
    }
    // Rezolvă toate insulele murdare pentru afișare: include media PWM
    rezolvaPentruAfisare() {
      for (const ins of this.insule) {
        if (!ins.murdara && !ins.arePwm && !ins.dinamica) continue;
        const pwm = ins.pwm.filter(g => g.pwmActiv());
        ins.arePwm = pwm.length > 0;
        if (!pwm.length) {
          if (ins.murdara) this.rezolvaInsula(ins, 'inst');
          for (const el of ins.elemente) el.iMed = el.i;
          continue;
        }
        if (pwm.length > 6) {
          // prea mulți pini PWM: aproximăm cu nivelul mediu
          this.rezolvaInsula(ins, 'medie');
          for (const el of ins.elemente) el.iMed = el.i;
          ins.murdara = true;
          continue;
        }
        // superpoziție: toți jos, apoi câte unul sus
        this.rezolvaInsula(ins, { baza: true });
        const baza = new Map(ins.elemente.map(e => [e, e.i]));
        const medii = new Map(ins.elemente.map(e => [e, e.i]));
        for (const p of pwm) {
          this.rezolvaInsula(ins, { sus: p });
          const d = p.duty();
          for (const e of ins.elemente) medii.set(e, medii.get(e) + d * (e.i - baza.get(e)));
        }
        for (const e of ins.elemente) e.iMed = medii.get(e);
        // lăsăm valorile instantanee corecte pentru citiri
        ins.murdara = true;
      }
      if (this.faraInsula) {
        const ctx = { v: (net) => net < 0 ? 0 : (this.fix.has(net) ? this.fix.get(net) : this.v[net]) };
        for (const el of this.faraInsula) { el.calculeaza(ctx); el.iMed = el.i; }
      }
    }
    // curentul total tras dintr-o rețea fixă (pentru verificarea surselor)
    curentDinRetea(net) {
      let s = 0;
      for (const el of this.elemente) {
        const nd = el.noduri();
        if (el.tip === 'R' || el.tip === 'S') {
          if (el.a === net) s += el.i; else if (el.b === net) s -= el.i;
        } else if (el.tip === 'D') {
          if (el.a === net && el.x < 0) s += el.i; else if (el.k === net) s -= el.i;
          else if (el.a === net && el.x >= 0) s += el.i;
        } else if (el.tip === 'V') {
          if (el.n === net) s += el.i; else if (el.p === net) s -= el.i;
        } else if (el.tip === 'GPIO') {
          if (el.net === net) s -= el.i;
        } else if (el.tip === 'Q') {
          if (el.c === net) s += el.ic; if (el.b === net) s += el.ib; if (el.e === net) s -= (el.ic + el.ib);
        } else if (el.tip === 'MOS') {
          if (el.d === net) s += el.id; if (el.s === net) s -= el.id;
        } else if (el.tip === 'I') {
          if (el.a === net) s += el.i; else if (el.b === net) s -= el.i;
        }
        void nd;
      }
      return s;
    }
  }

  // Modele de diode și LED-uri
  function modelDioda(nume) {
    const led = (vf, rs) => { const n = 2; const is = 0.02 / (Math.exp(vf / (n * VT)) - 1); return { is, n, rs: rs || 8, led: true, vf, imax: 0.03, vz: 5 }; };
    switch (nume) {
      case 'rosu': return led(2.0);
      case 'portocaliu': return led(2.05);
      case 'galben': return led(2.1);
      case 'verde': return led(2.2);
      case 'verde-pur': return led(3.0);
      case 'albastru': return led(3.1);
      case 'alb': return led(3.1);
      case 'roz': return led(3.1);
      case 'uv': return led(3.3);
      case 'ir': return led(1.3, 3);
      case '1n4148': return { is: 2.5e-9, n: 1.75, rs: 0.6, vz: 100 };
      case '1n4007': return { is: 7e-9, n: 1.9, rs: 0.04, vz: 1000 };
      case '1n5819': return { is: 3e-6, n: 1.2, rs: 0.05, vz: 40 };
      case 'zener5v1': return { is: 1e-12, n: 1.4, rs: 1, vz: 5.1 };
      case 'zener3v3': return { is: 1e-12, n: 1.4, rs: 1, vz: 3.3 };
      default: return { is: 1e-12, n: 1.5, rs: 0.5, vz: 100 };
    }
  }

  M.circuit = { Circuit, Rezistor, Comutator, Sursa, SursaCurent, Dioda, TranzistorBJT, Mosfet, IesireComandata, ElementGPIO, modelDioda, rezolvaLiniar, VT };
})(window.M = window.M || {});
