/* Meșter — sunetul simulării.
   Difuzoarele, buzzerele și amplificatoarele „ascultă” tensiunile din circuit prin sonde. O sondă ține
   minte, în timpul simulat, fiecare schimbare a pinilor care o influențează (nivel, PWM, DAC) și tensiunea
   care rezultă la bornele ei — calculată cu rezolvitorul, deci ține cont de tranzistoare, rezistoare,
   de curentul limitat al pinului etc. La fiecare cadru semnalele devin eșantioane audio (media pe durata
   fiecărui eșantion, ca un filtru) și, în browser, sunt redate prin Web Audio.
   Tot aici e „mediul sonor” din jurul microfoanelor: voce, muzică, fluierat, zgomot, bătăi din palme și
   sunetele scoase de difuzoarele și buzzerele din schemă (mai încet cu cât sunt mai departe). */
(function (M) {
  'use strict';
  const RATA = 22050;
  const ctl = (inst, k, implicit) => inst && inst.control && inst.control[k] !== undefined ? +inst.control[k] : implicit;
  const DOI_PI = 2 * Math.PI;

  // integrala unui segment de semnal pe [a, b] (µs): nivel constant sau dreptunghi periodic (PWM)
  function integreaza(e, a, b) {
    if (b <= a) return 0;
    if (!e.pwm) return e.v * (b - a);
    const per = 1e6 / e.f;
    const H = (x) => { const c = x / per; const fl = Math.floor(c); return (fl * e.duty + Math.min(c - fl, e.duty)) * per; };
    const sus = H(b) - H(a);
    return e.vH * sus + e.vL * ((b - a) - sus);
  }
  const egale = (x, y) => x.pwm === y.pwm && (x.pwm ? x.f === y.f && x.duty === y.duty && Math.abs(x.vH - y.vH) < 1e-4 && Math.abs(x.vL - y.vL) < 1e-4 : Math.abs(x.v - y.v) < 1e-4);

  // ---------- sonda: tensiunea dintre două rețele, în timp ----------
  class Sonda {
    constructor(sim, a, b) {
      this.sim = sim; this.a = a; this.b = b;
      this.ev = [];
      this.gpio = [];
      this.insule = [];
      this.cache = new Map(); this.cacheCadru = -1;
      const c = sim.circuit;
      const idx = new Set();
      for (const n of [a, b]) if (n >= 0 && !c.fix.has(n) && c.insulaNodului && c.insulaNodului[n] >= 0) idx.add(c.insulaNodului[n]);
      this.insule = [...idx].map(i => c.insule[i]);
      for (const [g, st] of sim.stariPin) {
        const net = sim.netGPIO(g);
        if (st.element && net >= 0 && !c.fix.has(net) && idx.has(c.insulaNodului[net])) this.gpio.push(st.element);
      }
      const vazute = new Set();
      const asc = (n) => { if (n >= 0 && !vazute.has(n)) { vazute.add(n); sim.asculta(n, () => this.marcheaza()); } };
      for (const el of this.gpio) asc(el.net);
      asc(a); asc(b);
      this.constanta = !this.gpio.length;
      this.marcheaza();
    }
    marcheaza() {
      const s = this.stare();
      const u = this.ev[this.ev.length - 1];
      if (u && egale(u, s)) return;
      s.t = this.sim.timp;
      if (u && u.t === s.t) this.ev[this.ev.length - 1] = s; else this.ev.push(s);
      if (this.ev.length > 40000) this.ev.splice(0, this.ev.length - 20000);
    }
    stare() {
      let pw = null, cheie = '';
      for (const el of this.gpio) {
        const st = el.st;
        const p = el.pwmActiv();
        if (p && !pw) pw = el;
        cheie += st.mod.charCodeAt(0) + (st.nivel ? 'h' : 'l') + (st.dac !== null && st.dac !== undefined ? 'd' + st.dac.toFixed(4) : '') + (p ? 'p' + st.pwm.frecventa + ':' + st.pwm.duty.toFixed(5) : '') + '|';
      }
      if (this.cacheCadru !== Motor.cadruId) { this.cache.clear(); this.cacheCadru = Motor.cadruId; }
      const x = this.cache.get(cheie);
      if (x) return Object.assign({}, x);
      let r;
      if (!pw) r = { pwm: 0, v: this.dif() };
      else r = { pwm: 1, f: pw.st.pwm.frecventa, duty: pw.st.pwm.duty, vH: this.difMod({ sus: pw }), vL: this.difMod({ sus: null }) };
      this.cache.set(cheie, r);
      return Object.assign({}, r);
    }
    v(n) {
      if (n < 0) return 0;
      const x = this.sim.circuit.tensiune(n);
      return isNaN(x) ? 0 : x;
    }
    dif() { return this.v(this.a) - this.v(this.b); }
    difMod(mod) {
      const c = this.sim.circuit;
      for (const ins of this.insule) c.rezolvaInsula(ins, mod);
      const v = (n) => n < 0 ? 0 : (c.fix.has(n) ? c.fix.get(n) : c.v[n]);
      const r = v(this.a) - v(this.b);
      for (const ins of this.insule) ins.murdara = true;
      return isNaN(r) ? 0 : r;
    }
    // n eșantioane pentru [t0, t1): fiecare e media semnalului pe durata lui
    randeaza(t0, t1, n) {
      if (this.cacheR && this.cacheR.t0 === t0 && this.cacheR.t1 === t1 && this.cacheR.n === n) return this.cacheR.v.slice();
      this.marcheaza(); // prinde schimbările fără notificare (ex. un comutator acționat de alt modul)
      const out = new Float32Array(n);
      const ev = this.ev;
      const dt = (t1 - t0) / n;
      let k = -1;
      for (let j = 0; j < ev.length && ev[j].t <= t0; j++) k = j;
      let cur = k >= 0 ? ev[k] : (ev[0] || { pwm: 0, v: 0 });
      let urm = k + 1;
      for (let s = 0; s < n; s++) {
        const a = t0 + s * dt, b = a + dt;
        let acc = 0, t = a;
        while (urm < ev.length && ev[urm].t < b) {
          const te = Math.max(ev[urm].t, t);
          acc += integreaza(cur, t, te);
          t = te; cur = ev[urm]; urm++;
        }
        acc += integreaza(cur, t, b);
        out[s] = acc / dt;
      }
      let ultim = -1;
      for (let j = 0; j < ev.length && ev[j].t <= t1; j++) ultim = j;
      if (ultim > 0) ev.splice(0, ultim);
      this.cacheR = { t0, t1, n, v: out.slice() };
      return out;
    }
    // starea de acum (pentru estimări rapide)
    ultima() { return this.ev[this.ev.length - 1] || { pwm: 0, v: 0 }; }
  }

  // ieșirile audio ale modulelor (amplificatoare, DFPlayer): rețea -> { d, pin }
  function iesiriAudio(sim) {
    if (sim.__iesiriAudio) return sim.__iesiriAudio;
    const m = new Map();
    for (const d of sim.disp.values()) {
      if (!d.iesiriAudio || !d.semnalAudio) continue;
      for (const p of d.iesiriAudio) { const n = sim.netPin(d.inst, p); if (n >= 0 && !m.has(n)) m.set(n, { d, pin: p }); }
    }
    sim.__iesiriAudio = m;
    return m;
  }

  // intrarea audio a unui dispozitiv: tensiunea dintre două rețele (din circuit sau de la ieșirea unui modul audio)
  class Intrare {
    constructor(sim, a, b, proprietar) {
      this.sim = sim;
      const io = iesiriAudio(sim);
      this.ia = io.get(a) || null; this.ib = io.get(b) || null;
      if (this.ia && this.ia.d === proprietar) this.ia = null;
      if (this.ib && this.ib.d === proprietar) this.ib = null;
      this.sonda = new Sonda(sim, this.ia ? -1 : a, this.ib ? -1 : b);
      this.inCurs = false;
    }
    randeaza(t0, t1, n) {
      const v = this.sonda.randeaza(t0, t1, n);
      if (this.inCurs) return v; // buclă (ieșirea unui amplificator întoarsă la propria intrare)
      this.inCurs = true;
      try {
        if (this.ia) { const x = this.ia.d.semnalAudio(this.ia.pin, t0, t1, n); if (x) for (let i = 0; i < n; i++) v[i] += x[i]; }
        if (this.ib) { const x = this.ib.d.semnalAudio(this.ib.pin, t0, t1, n); if (x) for (let i = 0; i < n; i++) v[i] -= x[i]; }
      } finally { this.inCurs = false; }
      return v;
    }
    get modul() { return this.ia || this.ib; }
  }

  // ---------- filtre ----------
  // trece-sus de ordinul 1 (condensator de cuplaj / membrana care nu redă curentul continuu)
  class TreceSus {
    constructor(fc) { this.fc = fc; this.x = 0; this.y = 0; }
    proceseaza(v, rata) {
      const rc = 1 / (DOI_PI * this.fc), a = rc / (rc + 1 / rata);
      let x0 = this.x, y = this.y;
      for (let i = 0; i < v.length; i++) { const x = v[i]; y = a * (y + x - x0); x0 = x; v[i] = y; }
      this.x = x0; this.y = y;
      return v;
    }
  }
  // trece-jos de ordinul 1
  class TreceJos {
    constructor(fc) { this.fc = fc; this.y = 0; }
    proceseaza(v, rata) {
      const a = 1 - Math.exp(-DOI_PI * this.fc / rata);
      let y = this.y;
      for (let i = 0; i < v.length; i++) { y += a * (v[i] - y); v[i] = y; }
      this.y = y;
      return v;
    }
  }
  // rezonator (trece-bandă biquad): timbrul buzzerelor și al membranelor mici
  class Rezonator {
    constructor(f0, q) { this.f0 = f0; this.q = q; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
    proceseaza(v, rata) {
      const w = DOI_PI * Math.min(this.f0, rata * 0.45) / rata, al = Math.sin(w) / (2 * this.q), cw = Math.cos(w);
      const a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
      let { x1, x2, y1, y2 } = this;
      for (let i = 0; i < v.length; i++) {
        const x = v[i];
        const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y; v[i] = y;
      }
      Object.assign(this, { x1, x2, y1, y2 });
      return v;
    }
  }
  const saturatie = (x, lim) => lim * Math.tanh(x / lim);
  const rms = (v) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return v.length ? Math.sqrt(s / v.length) : 0; };
  // frecvența dominantă, din trecerile prin zero
  function frecventa(v, rata) {
    let n = 0, semn = 0;
    const prag = rms(v) * 0.2;
    if (prag < 1e-5) return 0;
    for (let i = 0; i < v.length; i++) {
      const s = v[i] > prag ? 1 : v[i] < -prag ? -1 : 0;
      if (s && s !== semn) { if (semn) n++; semn = s; }
    }
    return n / 2 / (v.length / rata);
  }

  // ---------- mediul sonor din jurul unui microfon ----------
  const SURSE = ['Liniște', 'Voce', 'Muzică', 'Fluierat 1 kHz', 'Zgomot'];
  const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const alb = () => Math.random() * 2 - 1;
  // vocea: impulsuri glotale (≈120 Hz, cu intonație) filtrate de formanți, în silabe și fraze
  function voce(s) {
    const faza = DOI_PI * (125 * s - 18 / (DOI_PI * 0.6) * Math.cos(DOI_PI * 0.6 * s));
    const silaba = Math.floor(s * 4.3);
    const f1 = 450 + hash(silaba) * 450, f2 = 1100 + hash(silaba + 7) * 1300;
    let x = 0;
    const f0 = 125 + 18 * Math.sin(DOI_PI * 0.6 * s);
    for (let k = 1; k <= 22; k++) {
      const fk = k * f0;
      const g = 1 / (1 + Math.pow((fk - f1) / 160, 2)) + 0.6 / (1 + Math.pow((fk - f2) / 260, 2)) + 0.08 / k;
      x += g * Math.sin(k * faza);
    }
    const inSilaba = (s * 4.3) - silaba;
    let anv = Math.sin(Math.PI * inSilaba); anv *= anv;
    const fraza = (s % 3.1) < 2.4 ? 1 : 0;
    const fricativa = hash(silaba + 3) > 0.7 && inSilaba < 0.25 ? alb() * 0.5 : 0;
    return (x * 0.35 * anv + fricativa * anv) * fraza;
  }
  // muzica: acorduri care se schimbă la fiecare jumătate de secundă, cu o tobă mare pe fiecare timp
  const ACORDURI = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 207.65, 246.94]];
  function muzica(s) {
    const ac = ACORDURI[Math.floor(s / 2) % 4];
    let x = 0;
    for (const f of ac) { const p = (s * f) % 1; x += (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) * 0.3; }
    const melodie = ac[Math.floor(s * 4) % 3] * 2;
    x += Math.sin(DOI_PI * melodie * s) * 0.35 * Math.exp(-((s * 4) % 1) * 3);
    const tb = (s * 2) % 1;
    x += Math.sin(DOI_PI * 55 * tb * (1 - tb * 0.5)) * Math.exp(-tb * 18) * 0.9;
    return x * 0.8;
  }
  function presiuneSursa(tip, s) {
    switch (tip) {
      case 1: return voce(s);
      case 2: return muzica(s);
      case 3: return Math.sin(DOI_PI * 1000 * s) * 0.9;
      case 4: return alb() * 0.8;
      default: return alb() * 0.05;
    }
  }
  // cât de tare e o sursă pentru un nivel dat (1 ≈ 110 dB SPL)
  const dinDb = (db) => Math.pow(10, (db - 110) / 20);

  // ---------- motorul audio ----------
  const Motor = {
    RATA, SURSE, Sonda, Intrare, TreceSus, TreceJos, Rezonator, saturatie, rms, frecventa, dinDb, voce, muzica, hash,
    activ: true, volum: 0.8,
    ctx: null, iesire: null, urmator: 0, cadruId: 0, surse: new Set(),
    ultim: null, laCadru: null,
    initializeaza() {
      try { const v = localStorage.getItem('mester-sunet'); if (v === '0') this.activ = false; } catch (e) { /* fără stocare */ }
    },
    deblocheaza() {
      try {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        if (!this.ctx) {
          this.ctx = new AC();
          const g = this.ctx.createGain();
          g.gain.value = this.volum * 0.6;
          const comp = this.ctx.createDynamicsCompressor();
          comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 6;
          g.connect(comp); comp.connect(this.ctx.destination);
          this.iesire = g;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
    },
    comuta(activ) {
      this.activ = activ === undefined ? !this.activ : !!activ;
      try { localStorage.setItem('mester-sunet', this.activ ? '1' : '0'); } catch (e) { /* fără stocare */ }
      if (!this.activ) this.opresteTot(); else this.deblocheaza();
      return this.activ;
    },
    opresteTot() {
      for (const s of this.surse) { try { s.stop(); } catch (e) { /* deja oprită */ } }
      this.surse.clear();
      this.urmator = 0;
    },
    emitatori(sim) {
      if (!sim.__emitatori) sim.__emitatori = [...sim.disp.values()].filter(d => typeof d.sunet === 'function');
      return sim.__emitatori;
    },
    // apelat la sfârșitul fiecărui pas de simulare: [t0, t1) în µs de timp simulat
    cadru(sim, t0, t1) {
      if (!(t1 > t0)) return;
      const emit = this.emitatori(sim);
      if (!emit.length) return;
      this.cadruId++;
      const exact = (t1 - t0) / 1e6 * RATA + (sim.__restEsantioane || 0);
      const n = Math.floor(exact);
      sim.__restEsantioane = exact - n;
      if (n <= 0) return;
      const mix = new Float32Array(n);
      for (const d of emit) {
        let x = null;
        try { x = d.sunet(t0, t1, n, RATA); } catch (e) { console.error(e); }
        if (x) { for (let i = 0; i < n; i++) mix[i] += x[i]; d.nivelSunet = rms(x); d.frecventaSunet = frecventa(x, RATA); }
        else { d.nivelSunet = 0; d.frecventaSunet = 0; }
      }
      for (let i = 0; i < n; i++) mix[i] = saturatie(mix[i], 1.2);
      this.ultim = { mix, t0, t1, rata: RATA };
      if (this.laCadru) this.laCadru(mix, t0, t1, sim);
      if (sim.viteza === 1) this.reda(mix);
    },
    reda(mix) {
      const ctx = this.ctx;
      if (!ctx || !this.activ || ctx.state !== 'running') return;
      let max = 0;
      for (let i = 0; i < mix.length; i++) { const a = Math.abs(mix[i]); if (a > max) max = a; }
      if (max < 1e-4) return;
      const acum = ctx.currentTime;
      if (this.urmator < acum + 0.02) this.urmator = acum + 0.07;
      if (this.urmator > acum + 0.45) return; // simularea a luat-o înainte: sărim, ca să nu crească întârzierea
      const buf = ctx.createBuffer(1, mix.length, RATA);
      buf.getChannelData(0).set(mix);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.iesire);
      src.start(this.urmator);
      this.urmator += mix.length / RATA;
      this.surse.add(src);
      src.onended = () => this.surse.delete(src);
    },
    // presiunea sonoră la microfonul `inst`, la momentul t (µs); 1 ≈ 110 dB SPL
    presiune(sim, inst, t) {
      const s = t / 1e6;
      const tip = Math.round(ctl(inst, 'sursa', 1));
      let p = dinDb(ctl(inst, 'nivel', 60)) * presiuneSursa(tip, s);
      const d = sim && sim.disp.get(inst.id);
      if (d && d.aplauzaPana && t < d.aplauzaPana) {
        const x = 1 - (d.aplauzaPana - t) / 60000;
        p += alb() * 0.9 * Math.exp(-x * 9);
      }
      // sunetele din schemă: difuzoare, buzzere (1 la 10 cm, scade cu distanța)
      if (sim) {
        for (const e of this.emitatori(sim)) {
          if (!e.nivelSunet || e.nivelSunet < 1e-3) continue;
          const dx = (e.inst.x || 0) - (inst.x || 0), dy = (e.inst.y || 0) - (inst.y || 0);
          const cm = Math.hypot(dx, dy) * 0.254;
          const at = 1 / (1 + Math.max(0, cm - 10) / 10);
          const f = e.frecventaSunet || 0;
          const amp = e.nivelSunet * 1.414 * 0.2 * at;
          p += f > 20 ? amp * Math.sin(DOI_PI * f * s) : amp * alb();
        }
      }
      return p;
    },
    // amplitudinea (vârf) așteptată la microfon, pentru controlul automat al amplificării (AGC)
    nivelAsteptat(sim, inst) {
      let a = dinDb(ctl(inst, 'nivel', 60)) * [0.05, 0.9, 1.2, 0.9, 0.8][Math.round(ctl(inst, 'sursa', 1))];
      if (sim) {
        for (const e of this.emitatori(sim)) if (e.nivelSunet > 1e-3) a += e.nivelSunet * 0.3;
        const d = sim.disp.get(inst.id);
        if (d && d.aplauzaPana && sim.timp < d.aplauzaPana) a += 0.9;
      }
      return a;
    },
    controaleMicrofon(nivelImplicit) {
      return [
        { cheie: 'sursa', eticheta: 'Ce se aude', min: 0, max: SURSE.length - 1, pas: 1, implicit: 1, format: (v) => SURSE[Math.round(v)] || '' },
        { cheie: 'nivel', eticheta: 'Cât de tare', min: 30, max: 115, pas: 1, unitate: 'dB', implicit: nivelImplicit || 60 }
      ];
    }
  };
  Motor.initializeaza();
  M.sunet = Motor;
})(window.M = window.M || {});
