/* Meșter — nucleul simulării: timp virtual, sarcini (setup/loop și FreeRTOS),
   evenimente, pini GPIO legați la circuit, dispozitive și probleme detectate la rulare. */
(function (M) {
  'use strict';
  const C = M.circuit;
  const { PAUZA, BUCLA } = M.jetoane;

  class Heap {
    constructor() { this.a = []; this.seq = 0; }
    get length() { return this.a.length; }
    cmp(x, y) { return x.t < y.t || (x.t === y.t && x.s < y.s); }
    push(e) {
      e.s = this.seq++;
      const a = this.a; a.push(e);
      let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (this.cmp(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break; }
    }
    peek() { return this.a[0]; }
    pop() {
      const a = this.a; const top = a[0]; const last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && this.cmp(a[l], a[m])) m = l;
          if (r < a.length && this.cmp(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]]; i = m;
        }
      }
      return top;
    }
    filtreaza(f) { const vechi = this.a; this.a = []; for (const e of vechi) if (f(e)) this.push(e); }
  }

  class Simulare {
    constructor(proiect, optiuni) {
      this.proiect = proiect;
      this.opt = optiuni || {};
      this.viteza = 1;
      this.timp = 0;
      this.stare = 'oprita';
      this.ev = {};
      this.probleme = new Map();
      this.problemeSchimbate = false;
      this.retea = M.retea.construieste(proiect);
      this.placaInst = proiect.componente.find(c => { const d = M.componente.def(c.tip); return d && d.esteplaca; }) || null;
      this.placa = this.placaInst ? M.placi.info(this.placaInst) : null;
      this.cip = this.placa ? this.placa.cip : null;
      this.gpioNet = new Map();
      this.gpioPinId = new Map();
      this.stariPin = new Map();
      this.el = new Map();
      this.disp = new Map();
      this.ascultatori = new Map();
      this.intreruperi = [];
      this.coadaIsr = [];
      this.evenimente = new Heap();
      this.sarcini = [];
      this.memorieRTC = {};
      this.nrResetari = 0;
      this.resetariRecente = [];
      this.rgbPlaca = null;
      this.wifiPornit = false;
      this.statistici = { factorReal: 1, timpUltimCadru: 0 };
      this.construieste();
    }

    on(ev, f) { (this.ev[ev] = this.ev[ev] || []).push(f); return () => { this.ev[ev] = this.ev[ev].filter(x => x !== f); }; }
    emit(ev, d) { for (const f of (this.ev[ev] || [])) { try { f(d); } catch (e) { console.error(e); } } }

    // ---------- construirea circuitului ----------
    construieste() {
      const retea = this.retea;
      const circ = this.circuit = new C.Circuit(retea.n);
      if (this.placaInst) {
        for (const p of M.componente.pini(this.placaInst)) {
          if (p.gpio === undefined) continue;
          const net = retea.net(this.placaInst.id, p.id);
          if (!this.gpioNet.has(p.gpio)) { this.gpioNet.set(p.gpio, net); this.gpioPinId.set(p.gpio, p.id); }
        }
      }
      const surseIdeale = [];
      for (const inst of this.proiect.componente) {
        const def = M.componente.def(inst.tip);
        if (!def || !def.electric) continue;
        inst.prop = Object.assign(M.componente.propImplicite(def), inst.prop || {});
        if (def.control) inst.control = Object.assign(M.componente.controaleImplicite(def), inst.control || {});
        const ctx = this.contextElectric(inst, surseIdeale);
        try {
          const el = def.electric(ctx, inst, this) || {};
          this.el.set(inst.id, el);
        } catch (e) {
          console.error('electric', inst.tip, e);
          this.problema('electric-' + inst.id, 'eroare', 'Nu am putut modela electric ' + (inst.eticheta || inst.tip) + ': ' + e.message, { comp: inst.id });
        }
      }
      // surse ideale: fixăm tensiunile acolo unde un capăt e deja fix
      let schimbat = true;
      const ramase = surseIdeale.slice();
      while (schimbat) {
        schimbat = false;
        for (let i = ramase.length - 1; i >= 0; i--) {
          const s = ramase[i];
          const fp = circ.fix.has(s.p), fn = circ.fix.has(s.n);
          if (fp && fn) {
            const dif = circ.fix.get(s.p) - circ.fix.get(s.n);
            if (Math.abs(dif - s.v) > 0.05) circ.conflicte.push({ net: s.p, v1: dif, v2: s.v, s1: circ.fixSursa.get(s.p), s2: s.desc });
            ramase.splice(i, 1); schimbat = true;
          } else if (fn) { circ.fixeaza(s.p, circ.fix.get(s.n) + s.v, s.desc); s.el.activa = false; ramase.splice(i, 1); schimbat = true; }
          else if (fp) { circ.fixeaza(s.n, circ.fix.get(s.p) - s.v, s.desc); s.el.activa = false; ramase.splice(i, 1); schimbat = true; }
        }
      }
      for (const s of surseIdeale) if (circ.fix.has(s.p) && circ.fix.has(s.n)) s.fixata = true;
      // pinii GPIO ai plăcii principale
      for (const [g, net] of this.gpioNet) {
        const st = this.stareInitialaPin(g);
        this.stariPin.set(g, st);
        st.element = circ.adauga(new C.ElementGPIO(net, st, this));
      }
      circ.construiesteInsule();
      for (const c of circ.conflicte) {
        const desc = this.retea.descriere(c.net).slice(0, 6).join(', ');
        const scurt = (Math.abs(c.v1) < 0.05 || Math.abs(c.v2) < 0.05);
        this.problema('scurt-' + c.net, 'eroare', (scurt ? 'Scurtcircuit! ' : 'Două surse cu tensiuni diferite sunt legate împreună! ') +
          (c.s1 || '?') + ' (' + fmtV(c.v1) + ') și ' + (c.s2 || '?') + ' (' + fmtV(c.v2) + ') sunt pe același nod' + (desc ? ': ' + desc : '') + '. În realitate sursa se încălzește sau se strică.', { net: c.net, scurt: true });
      }
      this.surseIdeale = surseIdeale;
      // dispozitive (comportamentul digital al modulelor)
      M.simCurenta = this;
      for (const inst of this.proiect.componente) {
        const def = M.componente.def(inst.tip);
        if (!def || !def.dispozitiv) continue;
        try {
          const d = def.dispozitiv(inst, this, this.el.get(inst.id) || {});
          if (d) { d.inst = inst; d.tip = inst.tip; this.disp.set(inst.id, d); }
        } catch (e) {
          console.error('dispozitiv', inst.tip, e);
        }
      }
    }
    contextElectric(inst, surseIdeale) {
      const circ = this.circuit, retea = this.retea, sim = this;
      const net = (x) => typeof x === 'number' ? x : retea.net(inst.id, x);
      const desc = (d) => (d || 'sursă') + ' [' + (inst.eticheta || inst.tip) + ']';
      return {
        inst, sim,
        net,
        nodNou: () => circ.nodIntern(),
        netGpio: (g) => sim.gpioNet.has(g) ? sim.gpioNet.get(g) : -1,
        fix: (pin, v, d) => circ.fixeaza(net(pin), v, desc(d)),
        R: (a, b, r) => circ.adauga(new C.Rezistor(net(a), net(b), r)),
        S: (a, b, inchis, ron) => circ.adauga(new C.Comutator(net(a), net(b), inchis, ron)),
        D: (a, k, model) => {
          const m = typeof model === 'string' ? C.modelDioda(model) : model;
          return circ.adauga(new C.Dioda(net(a), net(k), m, m.rs > 0 ? circ.nodIntern() : -1));
        },
        V: (p, n, v, r) => circ.adauga(new C.Sursa(net(p), net(n), v, r)),
        // sursă practic ideală: dacă un capăt e fix, celălalt devine fix
        Videal: (p, n, v, d) => {
          const el = circ.adauga(new C.Sursa(net(p), net(n), v, 0.05));
          surseIdeale.push({ p: net(p), n: net(n), v, desc: desc(d), el });
          return el;
        },
        I: (a, b, i) => circ.adauga(new C.SursaCurent(net(a), net(b), i)),
        Q: (c, b, e, pnp, beta) => circ.adauga(new C.TranzistorBJT(net(c), net(b), net(e), pnp, beta)),
        MOS: (d, g, s, pcanal, vth, k) => circ.adauga(new C.Mosfet(net(d), net(g), net(s), pcanal, vth, k)),
        iesire: (pin, getStare) => circ.adauga(new C.IesireComandata(net(pin), getStare)),
        regulator: (vin, vout, gnd, v, dropout, d) => {
          const nin = net(vin), ng = net(gnd);
          const el = circ.adauga(new C.Sursa(net(vout), ng, () => {
            const vi = (circ.fix.has(nin) ? circ.fix.get(nin) : circ.v[nin]) - (circ.fix.has(ng) ? circ.fix.get(ng) : circ.v[ng]);
            return Math.max(0, Math.min(v, vi - dropout));
          }, 0.2));
          el.neliniar = true;
          return el;
        },
        adauga: (el) => circ.adauga(el)
      };
    }
    stareInitialaPin(g) {
      const cip = this.cip || {};
      return { g, mod: 'INPUT', nivel: 0, pwm: null, dac: null, vdd: cip.vdd || 3.3, rOut: cip.platforma === 'avr' ? 25 : 30,
        rPull: cip.platforma === 'avr' ? 35000 : 45000, arePull: !(cip.faraPull || []).includes(g) };
    }

    // ---------- pini ----------
    netGPIO(g) { return this.gpioNet.has(g) ? this.gpioNet.get(g) : -1; }
    netPin(inst, pinId) { return this.retea.net(typeof inst === 'string' ? inst : inst.id, pinId); }
    gpioDinNet(net) { for (const [g, n] of this.gpioNet) if (n === net) return g; return -1; }
    // toți GPIO-urile plăcii legate la o rețea
    gpioLaNet(net) { const r = []; for (const [g, n] of this.gpioNet) if (n === net) r.push(g); return r; }
    pin(g, operatie) {
      const st = this.stariPin.get(g);
      if (st) return st;
      if (!this.cip) return null;
      if (!this.cip.valide.includes(g)) {
        this.problema('pin-invalid-' + g, 'eroare', 'GPIO' + g + ' nu există pe ' + this.cip.cip + (operatie ? ' (' + operatie + ')' : '') + '.', { linie: this.R ? this.R.L : 0 });
        return null;
      }
      // pin valid dar nescos pe placă (ex. GPIO6–11 flash)
      const s = this.stareInitialaPin(g);
      s.nescos = true;
      this.stariPin.set(g, s);
      if ((this.cip.flash || []).includes(g)) this.problema('pin-flash-' + g, 'eroare', 'GPIO' + g + ' este legat la memoria flash internă. Folosirea lui blochează sau resetează placa.', { linie: this.R ? this.R.L : 0 });
      return s;
    }
    tensiuneNet(net) { return this.circuit.tensiune(net); }
    tensiunePin(inst, pinId) { return this.circuit.tensiune(this.netPin(inst, pinId)); }
    flotant(net) { return this.circuit.flotant(net); }
    // nivelul logic al unei rețele, pentru dispozitivele care citesc un semnal
    nivelNet(net, vdd) {
      if (net < 0) return 0;
      if (this.circuit.flotant(net)) return Math.random() < 0.5 ? 1 : 0;
      const v = this.circuit.tensiune(net);
      return v > (vdd || 3.3) * 0.5 ? 1 : 0;
    }
    murdar(net) { this.circuit.murdarNet(net); }
    murdarComponenta(inst) {
      const el = this.el.get(inst.id);
      if (el) for (const k in el) { const e = el[k]; if (e && e.noduri) for (const n of e.noduri()) this.circuit.murdarNet(n); }
      for (const p of M.componente.pini(inst)) this.circuit.murdarNet(this.retea.net(inst.id, p.id));
      this.dupaSchimbareExterna(inst);
    }
    // după ce un dispozitiv sau utilizatorul schimbă ceva în circuit
    dupaSchimbareExterna(inst) {
      if (inst) {
        const vazute = new Set();
        for (const p of M.componente.pini(inst)) {
          const net = this.retea.net(inst.id, p.id);
          if (vazute.has(net)) continue;
          vazute.add(net);
          this.notificaNet(net);
        }
      }
      this.verificaIntreruperi();
    }
    semnal(net) { this.circuit.murdarNet(net); this.notificaNet(net); this.verificaIntreruperi(); this.verifica5V(net); }
    // un modul care scoate 5 V pe un pin al plăcii (ex. ECHO de la HC-SR04), chiar și doar pentru un impuls
    verifica5V(net) {
      if (!this.cip || this.cip.toleranta5V || net < 0) return;
      const g = this.gpioDinNet(net);
      if (g < 0) return;
      const v = this.circuit.tensiune(net);
      if (v > 3.6 && this.curentInjectat(g) > 0.001) this.problema('5v-gpio-' + g, 'eroare', mesaj5V(this, g, v), { gpio: g });
    }
    // Un pin de intrare „vede” uneori peste 3,6 V printr-o rezistență uriașă (joncțiunea unui tranzistor, un LED
    // stins): dioda de protecție a pinului limitează atunci tensiunea cu un curent neglijabil, fără pagubă.
    // Aflăm curentul care ar intra în pin dacă ar fi ținut la 3,6 V.
    curentInjectat(g) {
      const st = this.stariPin.get(g);
      if (!st || !st.element) return Infinity;
      const net = this.gpioNet.get(g), c = this.circuit;
      if (c.fix.has(net)) return Infinity;
      const i = c.insulaNodului ? c.insulaNodului[net] : -1;
      if (i < 0) return 0;
      const ins = c.insule[i];
      const salvat = { mod: st.mod, nivel: st.nivel, vdd: st.vdd, rOut: st.rOut, pwm: st.pwm, dac: st.dac };
      Object.assign(st, { mod: 'OUTPUT', nivel: 1, vdd: 3.6, rOut: 20, pwm: null, dac: null });
      let cur = Infinity;
      try { c.rezolvaInsula(ins, 'inst'); cur = -st.element.i; }
      finally { Object.assign(st, salvat); ins.murdara = true; c.rezolvaInsula(ins, 'inst'); }
      return cur;
    }
    asculta(net, f) {
      if (net < 0) return;
      if (!this.ascultatori.has(net)) this.ascultatori.set(net, []);
      this.ascultatori.get(net).push(f);
    }
    notificaNet(net, nivelCunoscut) {
      const l = this.ascultatori.get(net);
      if (!l) return;
      const nivel = nivelCunoscut !== undefined ? nivelCunoscut : this.nivelNet(net, 3.3);
      for (const f of l) { try { f(nivel, this.timp); } catch (e) { console.error(e); } }
    }

    // ---------- timp și evenimente ----------
    consuma(us) { this.timp += us; }
    programeaza(dtUs, fn, proprietar) { this.evenimente.push({ t: this.timp + dtUs, fn, p: proprietar || 'disp' }); }
    programeazaLa(t, fn, proprietar) { this.evenimente.push({ t, fn, p: proprietar || 'disp' }); }
    millis() { return Math.floor(this.timp / 1000) >>> 0; }
    micros() { return Math.floor(this.timp) >>> 0; }

    // ---------- întreruperi ----------
    ataseazaIntrerupere(g, fn, mod) {
      this.detaseazaIntrerupere(g);
      const net = this.netGPIO(g);
      this.intreruperi.push({ g, fn, mod, ultim: this.citesteNivelFaraEfecte(g), net });
    }
    detaseazaIntrerupere(g) { this.intreruperi = this.intreruperi.filter(i => i.g !== g); }
    citesteNivelFaraEfecte(g) {
      const net = this.netGPIO(g);
      if (net < 0) return 0;
      const st = this.stariPin.get(g);
      if (this.circuit.flotant(net)) return st && st.ultimFlotant !== undefined ? st.ultimFlotant : 0;
      const v = this.circuit.tensiune(net);
      return v > (this.cip ? this.cip.vdd : 3.3) / 2 ? 1 : 0;
    }
    verificaIntreruperi() {
      if (!this.intreruperi.length || this.stare !== 'ruleaza') return;
      for (const it of this.intreruperi) {
        const n = this.citesteNivelFaraEfecte(it.g);
        const vechi = it.ultim;
        it.ultim = n;
        let declansat = false;
        switch (it.mod) {
          case 1: case 'RISING': declansat = !vechi && n; break;
          case 2: case 'FALLING': declansat = vechi && !n; break;
          case 3: case 'CHANGE': declansat = vechi !== n; break;
          case 4: case 'ONLOW': declansat = !n; break;
          case 5: case 'ONHIGH': declansat = !!n; break;
        }
        if (declansat) this.coadaIsr.push(it.fn);
      }
    }
    ruleazaIsr() {
      let n = 0;
      while (this.coadaIsr.length && n++ < 64) {
        const fn = this.coadaIsr.shift();
        this.inIsr = true;
        try {
          const r = fn();
          if (r && typeof r.next === 'function') {
            let x = r.next();
            while (!x.done) {
              if (x.value && x.value.dorm !== undefined && x.value.dorm > 0) {
                this.problema('delay-isr', 'avertisment', 'delay() în funcția de întrerupere (ISR) nu funcționează pe ESP32 și poate reseta placa. Setează doar o variabilă în ISR și fă restul în loop().', { linie: this.R ? this.R.L : 0 });
              }
              x = r.next();
            }
          }
        } catch (e) { this.inIsr = false; throw e; }
        this.inIsr = false;
      }
    }

    // ---------- sarcini ----------
    sarcinaNoua(nume, gen, optiuni) {
      const s = Object.assign({ id: this.sarcini.length + 1, nume, gen, trezire: this.timp, valoare: undefined, asteapta: null, pana: Infinity, activa: true, nucleu: 1, prioritate: 1 }, optiuni || {});
      this.sarcini.push(s);
      return s;
    }
    urmatoareaSarcina() {
      let best = null;
      for (const s of this.sarcini) {
        if (!s.activa || s.suspendata) continue;
        if (!best || s.trezire < best.trezire || (s.trezire === best.trezire && s.prioritate > best.prioritate)) best = s;
      }
      return best;
    }
    ruleazaSarcina(s) {
      const R = this.R;
      R.b = 2000;
      this.sarcinaCurenta = s;
      if (s.asteapta) {
        const v = s.asteapta();
        if (v !== undefined) { s.valoare = v; s.asteapta = null; }
        else if (this.timp >= s.pana) { s.valoare = s.laExpirare; s.asteapta = null; }
        else { s.trezire = Math.min(s.pana, this.timp + (s.pasAsteptare || 500)); return; }
      }
      if (this.coadaIsr.length) this.ruleazaIsr();
      const val = s.valoare; s.valoare = undefined;
      const r = s.gen.next(val);
      this.sarcinaCurenta = null;
      if (r.done) { s.activa = false; if (s.laSfarsit) s.laSfarsit(); return; }
      const y = r.value;
      if (y === PAUZA) {
        s.trezire = this.timp + 160;
        s.faraCedare = (s.faraCedare || 0) + 160;
        // o sarcină pe nucleul 0 care nu cedează procesorul înfometează sarcina IDLE0: watchdog-ul se plânge la fiecare 5 s
        if (s.freertos && s.nucleu === 0 && s.faraCedare - (s.wdtRaportat || 0) > 5e6) {
          s.wdtRaportat = s.faraCedare;
          const ms = Math.floor(this.timp / 1000);
          this.emit('serial', { port: 0, text: 'E (' + ms + ') task_wdt: Task watchdog got triggered. The following tasks/users did not reset the watchdog in time:\r\nE (' + ms + ') task_wdt:  - IDLE0 (CPU 0)\r\nE (' + ms + ') task_wdt: Tasks currently running:\r\nE (' + ms + ') task_wdt: CPU 0: ' + s.nume + '\r\nE (' + ms + ') task_wdt: CPU 1: loopTask\r\n', baud: 115200, sistem: true });
          this.problema('wdt-' + s.nume, 'avertisment', 'Sarcina „' + s.nume + '” rulează pe nucleul 0 fără pauze (fără vTaskDelay / delay), așa că sarcina IDLE0 nu mai apucă să ruleze și watchdog-ul de sarcini se declanșează la fiecare 5 s. Pune vTaskDelay(1) (sau mai mult) în bucla ei.', { linie: this.R ? this.R.L : 0 });
        }
        if (this.cip && this.cip.platforma === 'esp8266' && s.principala && s.faraCedare > 3.2e6) {
          throw new M.EroareRulare('Soft WDT reset', 'Soft WDT reset', 'ESP8266 s-a resetat pentru că loop() a rulat mai mult de ~3 secunde fără delay() sau yield().');
        }
      } else if (y === BUCLA) { s.trezire = this.timp + 1; s.faraCedare = 0; s.wdtRaportat = 0; }
      else if (y && y.dorm !== undefined) { s.trezire = this.timp + Math.max(0, y.dorm); s.faraCedare = 0; s.wdtRaportat = 0; }
      else if (y && y.asteapta) {
        s.asteapta = y.asteapta; s.pana = y.pana === undefined ? Infinity : y.pana; s.laExpirare = y.laExpirare; s.pasAsteptare = y.pas || 500;
        s.trezire = this.timp + (y.pas || 20); s.faraCedare = 0;
      } else s.trezire = this.timp;
    }

    // ---------- program ----------
    static compileaza(cod, placaInfo) {
      return M.compilator.compileaza(cod, placaInfo);
    }
    porneste(program) {
      this.program = program;
      M.simCurenta = this;
      for (const d of this.disp.values()) if (d.start) { try { d.start(); } catch (e) { console.error(e); } }
      this.stare = 'ruleaza';
      this.reset('POWERON_RESET');
      this.emit('stare', this.stare);
    }
    reset(motiv) {
      M.simCurenta = this;
      this.motivReset = motiv;
      for (const st of this.stariPin.values()) {
        st.mod = 'INPUT'; st.nivel = 0; st.pwm = null; st.dac = null; st.ledc = null; st.eliberat = false;
      }
      this.rgbPlaca = null;
      this.circuit.murdarTot();
      this.sarcini = [];
      this.evenimente.filtreaza(e => e.p !== 'mcu');
      this.intreruperi = [];
      this.coadaIsr = [];
      this.wifiPornit = false;
      this.obiecte = M.api.creeazaObiecte(this);
      const R = Object.create(M.ajutoareR);
      R.b = 2000; R.L = 0;
      this.R = R;
      const A = { f: M.api.functii, o: this.obiecte, c: M.api.clase };
      let prog;
      try { prog = this.program.fabrica(A, R); } catch (e) { this.cadere(e); return; }
      this.prog = prog;
      for (const d of this.disp.values()) if (d.laResetMcu) { try { d.laResetMcu(); } catch (e) { console.error(e); } }
      // mesajele de pornire ale cipului (bootloader ROM)
      this.mesajePornire(motiv);
      const sim = this;
      const intarziere = this.cip && this.cip.platforma === 'avr' ? 60000 : (this.cip && this.cip.platforma === 'esp8266' ? 70000 : 120000);
      const principal = function* () {
        yield { dorm: intarziere };
        yield* prog.init();
        sim.inSetup = true;
        yield* prog.setup();
        sim.inSetup = false;
        for (;;) {
          yield* prog.loop();
          yield BUCLA;
        }
      };
      this.sarcinaNoua('loopTask', principal(), { principala: true, prioritate: 1, nucleu: 1 });
      this.emit('reset', motiv);
    }
    mesajePornire(motiv) {
      if (!this.cip) return;
      const pl = this.cip.platforma;
      const serial = this.obiecte && this.obiecte.Serial;
      if (!serial) return;
      let text;
      const coduri = { BROWNOUT: '0xf (RTCWDT_BROWN_OUT_RESET)', POWERON_RESET: '0x1 (POWERON_RESET)', SW_CPU_RESET: '0xc (SW_CPU_RESET)', DEEPSLEEP_RESET: '0x5 (DEEPSLEEP_RESET)', TG1WDT_SYS_RESET: '0x8 (TG1WDT_SYS_RESET)', PANIC: '0xc (SW_CPU_RESET)', RTCWDT_RTC_RESET: '0x10 (RTCWDT_RTC_RESET)' };
      if (pl === 'esp32') {
        text = 'ets Jul 29 2019 12:21:46\r\n\r\nrst:' + (coduri[motiv] || coduri.POWERON_RESET) + ',boot:0x13 (SPI_FAST_FLASH_BOOT)\r\nconfigsip: 0, SPIWP:0xee\r\nclk_drv:0x00,q_drv:0x00,d_drv:0x00,cs0_drv:0x00,hd_drv:0x00,wp_drv:0x00\r\nmode:DIO, clock div:1\r\nload:0x3fff0030,len:4916\r\nload:0x40078000,len:16436\r\nentry 0x40080418\r\n';
        if (this.cip.cip === 'ESP32-S3') text = 'ESP-ROM:esp32s3-20210327\r\nBuild:Mar 27 2021\r\nrst:' + (coduri[motiv] || coduri.POWERON_RESET) + ',boot:0x8 (SPI_FAST_FLASH_BOOT)\r\nSPIWP:0xee\r\nmode:DIO, clock div:1\r\nload:0x3fce3808,len:0x4bc\r\nentry 0x403c9908\r\n';
        if (this.cip.cip === 'ESP32-C3') text = 'ESP-ROM:esp32c3-api1-20210207\r\nBuild:Feb  7 2021\r\nrst:' + (coduri[motiv] || coduri.POWERON_RESET) + ',boot:0xc (SPI_FAST_FLASH_BOOT)\r\nload:0x3fcd5810,len:0x438\r\nentry 0x403ce90c\r\n';
        serial.iesireBrutaInitiala(text, 115200);
      } else if (pl === 'esp8266') {
        serial.iesireBrutaInitiala('\r\n ets Jan  8 2013,rst cause:2, boot mode:(3,6)\r\n\r\nload 0x4010f000, len 3424, room 16\r\n', 74880);
      }
    }
    cadere(e) {
      const R = this.R || {};
      const linie = R.L || 0;
      let tip, explicatie;
      if (e && e.esteCrash) { tip = e.tipPanica; explicatie = e.explicatie; }
      else if (e instanceof RangeError && /call stack/i.test(e.message)) { tip = 'Stack canary watchpoint triggered (loopTask)'; explicatie = 'Recursivitate prea adâncă: o funcție se apelează pe ea însăși de prea multe ori și stiva s-a umplut.'; }
      else if (e instanceof TypeError) { tip = 'LoadProhibited'; explicatie = 'Programul a folosit o valoare sau un obiect care nu există (' + e.message + ').'; }
      else { tip = 'IllegalInstruction'; explicatie = 'Eroare la rulare: ' + (e && e.message ? e.message : String(e)); }
      if (!(e && e.esteCrash)) console.error(e);
      const serial = this.obiecte && this.obiecte.Serial;
      if (this.cip && this.cip.platforma === 'esp32') {
        const text = '\r\nGuru Meditation Error: Core  1 panic\'ed (' + tip + '). Exception was unhandled.\r\n\r\nCore  1 register dump:\r\nPC      : 0x400d' + (0x1000 + linie * 4).toString(16).padStart(4, '0') + '  PS      : 0x00060830  A0      : 0x800d2f1c  A1      : 0x3ffb2270\r\n\r\nBacktrace: 0x400d' + (0x1000 + linie * 4).toString(16).padStart(4, '0') + ':0x3ffb2270 0x400d2f19:0x3ffb2290\r\n\r\nRebooting...\r\n';
        if (serial) serial.iesireBrutaInitiala(text, serial.baud || 115200);
      } else if (this.cip && this.cip.platforma === 'esp8266') {
        if (serial) serial.iesireBrutaInitiala('\r\n' + (tip === 'Soft WDT reset' ? 'Soft WDT reset' : 'Exception (' + (tip === 'IntegerDivideByZero' ? 0 : 28) + '):') + '\r\n\r\n>>>stack>>>\r\n<<<stack<<<\r\n', serial.baud || 115200);
      }
      this.problema('cadere', 'eroare', 'Placa s-a resetat' + (linie ? ' la linia ' + linie : '') + ': ' + explicatie, { linie, cadere: true });
      this.emit('cadere', { tip, explicatie, linie });
      this.sarcini = [];
      const acum = this.timp;
      this.resetariRecente = this.resetariRecente.filter(t => acum - t < 20e6);
      this.resetariRecente.push(acum);
      if (this.resetariRecente.length > 4) {
        this.stare = 'eroare';
        this.problema('cadere-repetata', 'eroare', 'Placa se resetează mereu (de ' + this.resetariRecente.length + ' ori). Am oprit simularea; corectează codul și pornește din nou.', { linie });
        this.emit('stare', this.stare);
        return;
      }
      this.evenimente.push({ t: this.timp + 300000, fn: () => this.reset('PANIC'), p: 'mcu' });
    }

    // căderea de tensiune care resetează placa (detectorul de brownout al ESP32)
    brownout(motiv) {
      if (this.stare !== 'ruleaza' || !this.cip || this.cip.platforma !== 'esp32') return;
      if (this.ultimBrownout !== undefined && this.timp - this.ultimBrownout < 400000) return;
      this.ultimBrownout = this.timp;
      const serial = this.obiecte && this.obiecte.Serial;
      if (serial) serial.iesireBrutaInitiala('\r\n\r\nBrownout detector was triggered\r\n\r\n', serial.baud || 115200);
      this.problema('brownout', 'eroare', 'Placa s-a resetat din cauza căderii de tensiune (brownout): ' + motiv + '. Alimentează motoarele dintr-o sursă separată, cu GND comun, și pune un condensator de 470–1000 µF lângă ele.', {});
      this.sarcini = [];
      const acum = this.timp;
      this.resetariRecente = this.resetariRecente.filter(t => acum - t < 20e6);
      this.resetariRecente.push(acum);
      if (this.resetariRecente.length > 4) {
        this.stare = 'eroare';
        this.problema('cadere-repetata', 'eroare', 'Placa se resetează mereu (de ' + this.resetariRecente.length + ' ori). Am oprit simularea; corectează montajul și pornește din nou.', {});
        this.emit('stare', this.stare);
        return;
      }
      this.evenimente.push({ t: this.timp + 200000, fn: () => this.reset('BROWNOUT'), p: 'mcu' });
    }

    // ---------- avansul simulării ----------
    avanseaza(dtMs) {
      if (this.stare !== 'ruleaza') return;
      M.simCurenta = this;
      const inceput = performance.now();
      const tStart = this.timp;
      const tinta = this.timp + Math.min(dtMs, 100) * 1000 * this.viteza;
      const limita = inceput + (this.opt.bugetCadruMs || 12);
      let pasi = 0;
      try {
        for (;;) {
          if ((++pasi & 15) === 0 && performance.now() > limita) break;
          const ev = this.evenimente.peek();
          const s = this.urmatoareaSarcina();
          const tEv = ev ? ev.t : Infinity;
          const tS = s ? s.trezire : Infinity;
          const t = Math.min(tEv, tS);
          if (t > tinta) { this.timp = Math.max(this.timp, tinta); break; }
          if (tEv <= tS) {
            this.evenimente.pop();
            if (ev.t > this.timp) this.timp = ev.t;
            ev.fn();
            // întreruperile declanșate de eveniment (un front pe un pin, un timer) rulează imediat, nu la pasul următor al unei sarcini
            if (this.coadaIsr.length && this.stare === 'ruleaza') this.ruleazaIsr();
            if (this.stare !== 'ruleaza') break;
            continue;
          }
          if (s.trezire > this.timp) this.timp = s.trezire;
          this.ruleazaSarcina(s);
          if (this.stare !== 'ruleaza') break;
        }
      } catch (e) {
        this.cadere(e);
      }
      const real = performance.now() - inceput;
      const avansat = (this.timp - (tinta - Math.min(dtMs, 100) * 1000 * this.viteza)) / 1000;
      const f = dtMs > 0 ? avansat / (Math.min(dtMs, 100) * this.viteza) : 1;
      this.statistici.factorReal = this.statistici.factorReal * 0.9 + Math.min(1, f) * 0.1;
      this.statistici.timpCod = real;
      for (const d of this.disp.values()) if (d.cadru) { try { d.cadru(this.timp); } catch (e) { console.error(e); } }
      if (M.sunet && this.stare === 'ruleaza') { try { M.sunet.cadru(this, tStart, this.timp); } catch (e) { console.error(e); } }
    }
    // pentru afișare: curenți medii, stări vizuale
    actualizeazaVizual() {
      try { this.circuit.rezolvaPentruAfisare(); } catch (e) { console.error(e); }
      this.verificaCurenti();
    }
    verificaCurenti() {
      // LED-uri și pini GPIO suprasolicitați
      for (const [g, st] of this.stariPin) {
        const el = st.element;
        if (!el) continue;
        const i = Math.abs(el.iMed !== undefined ? el.iMed : el.i);
        if (this.cip && this.cip.platforma !== 'avr' && i > 0.04) {
          this.problema('supracurent-' + g, 'eroare', 'Prin GPIO' + g + ' trec ' + (i * 1000).toFixed(0) + ' mA — peste limita de 40 mA a pinului. Pinul se poate strica; pune un rezistor sau un tranzistor.', { gpio: g });
        } else if (this.cip && this.cip.platforma === 'avr' && i > 0.04) {
          this.problema('supracurent-' + g, 'eroare', 'Prin pinul ' + g + ' trec ' + (i * 1000).toFixed(0) + ' mA — peste limita de 40 mA a ATmega328P.', { gpio: g });
        }
        if (this.cip && !this.cip.toleranta5V && st.element) {
          const net = this.gpioNet.get(g);
          if ((this.circuit.fix.has(net) ? this.circuit.fix.get(net) > 3.6 : (this.circuit.insulaNodului && this.circuit.insulaNodului[net] >= 0 && this.circuit.v[net] > 3.6)) && this.curentInjectat(g) > 0.001) {
            this.problema('5v-gpio-' + g, 'eroare', mesaj5V(this, g, this.circuit.fix.has(net) ? this.circuit.fix.get(net) : this.circuit.v[net]), { gpio: g });
          }
        }
      }
    }

    // ---------- probleme ----------
    problema(cheie, nivel, mesaj, extra) {
      const vechi = this.probleme.get(cheie);
      if (vechi && vechi.mesaj === mesaj) { vechi.nr++; return; }
      this.probleme.set(cheie, Object.assign({ cheie, nivel, mesaj, timp: this.timp, nr: 1, laRulare: true }, extra || {}));
      this.problemeSchimbate = true;
      this.emit('problema', this.probleme.get(cheie));
    }
    stergeProblema(cheie) { if (this.probleme.delete(cheie)) this.problemeSchimbate = true; }

    // ---------- control din interfață ----------
    control(inst, cheie, valoare) {
      inst.control = inst.control || {};
      inst.control[cheie] = valoare;
      const def = M.componente.def(inst.tip);
      const el = this.el.get(inst.id);
      if (def.laControl) def.laControl(inst, el, this, cheie, valoare);
      const d = this.disp.get(inst.id);
      if (d && d.laControl) d.laControl(cheie, valoare);
    }
    actiune(inst, act, faza, extra) {
      const def = M.componente.def(inst.tip);
      if (def.esteplaca && inst === this.placaInst) {
        if (act === 'en' && faza === 'jos') { this.stare = 'ruleaza'; this.resetariRecente = []; this.reset('POWERON_RESET'); this.emit('stare', this.stare); return; }
        if (act === 'boot') {
          const el = this.el.get(inst.id);
          if (el && el.boot) { el.boot.inchis = faza === 'jos'; this.murdarComponenta(inst); this.semnal(el.boot.a); }
          return;
        }
      }
      if (def.actiune) def.actiune(inst, act, faza, this.el.get(inst.id), this, this.disp.get(inst.id), extra);
    }
    opreste() {
      this.stare = 'oprita';
      for (const d of this.disp.values()) if (d.opreste) { try { d.opreste(); } catch (e) { console.error(e); } }
      if (M.sunet) M.sunet.opresteTot();
      if (M.simCurenta === this) M.simCurenta = null;
      this.emit('stare', this.stare);
    }
    pauza() { if (this.stare === 'ruleaza') { this.stare = 'pauza'; if (M.sunet) M.sunet.opresteTot(); this.emit('stare', this.stare); } }
    continua() { if (this.stare === 'pauza') { this.stare = 'ruleaza'; this.emit('stare', this.stare); } }

    // ---------- căutarea dispozitivelor ----------
    dispozitive(tipuri) {
      const r = [];
      for (const d of this.disp.values()) if (!tipuri || tipuri.includes(d.tip) || (d.familie && tipuri.includes(d.familie))) r.push(d);
      return r;
    }
    // dispozitivele de tipurile date al căror pin `pinId` e în aceeași rețea cu GPIO g
    cautaDupaPin(tipuri, pinId, g) {
      const net = this.netGPIO(g);
      if (net < 0) return [];
      return this.dispozitive(tipuri).filter(d => this.netPin(d.inst, pinId) === net);
    }
    // alimentarea unui modul: tensiunea dintre pinii vcc și gnd
    alimentare(inst, vcc, gnd) {
      const nv = this.netPin(inst, vcc || 'VCC'), ng = this.netPin(inst, gnd || 'GND');
      const legatV = this.retea.netPini[nv] && this.retea.piniReali(nv).length > 1;
      const legatG = this.retea.netPini[ng] && this.retea.piniReali(ng).length > 1;
      if (!legatV && !legatG) return { v: 0, motiv: 'VCC și GND nu sunt conectate' };
      if (!legatV) return { v: 0, motiv: 'pinul ' + (vcc || 'VCC') + ' nu e conectat' };
      if (!legatG) return { v: 0, motiv: 'pinul GND nu e conectat' };
      let v1 = this.circuit.tensiune(nv), v0 = this.circuit.tensiune(ng);
      if (isNaN(v1) || this.circuit.flotant(nv)) return { v: 0, motiv: 'pinul ' + (vcc || 'VCC') + ' nu primește tensiune' };
      if (isNaN(v0)) v0 = 0;
      return { v: v1 - v0 };
    }
    // verifică alimentarea și raportează problema; întoarce tensiunea sau 0
    verificaAlimentare(inst, vmin, vmax, vcc, gnd) {
      const a = this.alimentare(inst, vcc, gnd);
      const nume = inst.eticheta || inst.tip;
      const cheie = 'alim-' + inst.id;
      if (a.motiv) { this.problema(cheie, 'eroare', nume + ' nu e alimentat: ' + a.motiv + '.', { comp: inst.id }); return 0; }
      if (a.v < 0) { this.problema(cheie, 'eroare', nume + ' are alimentarea inversată (' + fmtV(a.v) + ')! În realitate modulul se poate arde.', { comp: inst.id }); return 0; }
      if (a.v > vmax + 0.3) { this.problema(cheie, 'eroare', nume + ' primește ' + fmtV(a.v) + ', dar suportă maximum ' + fmtV(vmax) + '. În realitate se poate arde.', { comp: inst.id }); return a.v; }
      if (a.v < vmin - 0.15) { this.problema(cheie, 'avertisment', nume + ' primește doar ' + fmtV(a.v) + ' (are nevoie de minimum ' + fmtV(vmin) + '). Poate funcționa greșit sau deloc.', { comp: inst.id }); return a.v; }
      this.stergeProblema(cheie);
      return a.v;
    }
    // dispozitivele I2C de pe magistrala formată din GPIO sda/scl
    magistralaI2C(sda, scl) {
      const nS = this.netGPIO(sda), nC = this.netGPIO(scl);
      const r = [];
      for (const d of this.disp.values()) {
        if (d.adresaI2C === undefined) continue;
        const ds = this.netPin(d.inst, d.pinSDA || 'SDA'), dc = this.netPin(d.inst, d.pinSCL || 'SCL');
        if (ds === nS && dc === nC && nS >= 0) r.push(d);
        else if (ds === nC && dc === nS && nS >= 0) {
          this.problema('i2c-inversat-' + d.inst.id, 'eroare', (d.inst.eticheta || d.tip) + ': SDA și SCL sunt inversate (SDA al modulului e pe GPIO' + scl + ', care e SCL).', { comp: d.inst.id });
        }
      }
      return r;
    }
  }

  function mesaj5V(sim, g, v) { return 'Pe GPIO' + g + ' ajung ' + fmtV(v) + '. ' + sim.cip.cip + ' suportă maximum 3,6 V pe pini — folosește un divizor de tensiune (ex. 1 kΩ + 2 kΩ) sau un convertor de nivel.'; }
  function fmtV(v) { return (Math.round(v * 100) / 100).toString().replace('.', ',') + ' V'; }

  M.Simulare = Simulare;
  M.fmtV = fmtV;
})(window.M = window.M || {});
