/* Meșter — bibliotecile pentru ieșiri mecanice: Servo / ESP32Servo, Stepper și AccelStepper.
   Toate comandă pinii exact ca bibliotecile reale (PWM de 50 Hz, secvențe pe patru fire, impulsuri STEP),
   iar motoarele din schemă reacționează la semnalele de pe fire. */
(function (M) {
  'use strict';
  const api = M.api;
  const S = () => M.simCurenta;
  const f = api.functii;
  const linie = () => { const s = S(); return s && s.R ? s.R.L : 0; };
  const MOD = (m) => { const pl = S().cip ? S().cip.platforma : 'esp32'; return ({ esp32: { in: 1, out: 3 }, esp8266: { in: 0, out: 1 }, avr: { in: 0, out: 1 } })[pl][m]; };

  // ---------- Servo (ESP32Servo și Servo pentru Arduino) ----------
  class Servo {
    constructor() { this.pin = -1; this.min = 544; this.max = 2400; this.us = 1500; this.frecventa = 50; }
    setPeriodHertz(hz) { this.frecventa = Math.max(1, hz | 0); if (this.pin >= 0) this._aplica(); }
    attach(pin, min, max) {
      const sim = S();
      const cip = sim.cip;
      if (cip && cip.doarIntrare && cip.doarIntrare.includes(pin)) { sim.problema('servo-pin-' + pin, 'eroare', 'servo.attach(' + pin + '): GPIO' + pin + ' e doar intrare și nu poate da semnal de servo.', { linie: linie() }); return 0; }
      this.pin = pin;
      if (min !== undefined) this.min = Math.max(200, min);
      if (max !== undefined) this.max = Math.min(3000, max);
      this._aplica();
      return 1;
    }
    _aplica() { if (this.pin >= 0) api.setPwm(this.pin, this.frecventa, this.us * this.frecventa / 1e6, 'servo'); }
    write(v) {
      // ca în biblioteca Arduino: valorile sub 544 sunt unghiuri, cele mai mari sunt microsecunde
      if (v < 544) { const a = Math.max(0, Math.min(180, v)); this.writeMicroseconds(Math.round(this.min + (this.max - this.min) * a / 180)); }
      else this.writeMicroseconds(v);
    }
    writeMicroseconds(us) { this.us = Math.max(this.min, Math.min(this.max, us | 0)); this._aplica(); }
    read() { return Math.round((this.us - this.min) * 180 / (this.max - this.min)); }
    readMicroseconds() { return this.us; }
    attached() { return this.pin >= 0; }
    detach() {
      const sim = S();
      if (this.pin < 0) return;
      const st = sim.pin(this.pin);
      if (st) { st.pwm = null; st.nivel = 0; sim.murdar(sim.netGPIO(this.pin)); sim.notificaNet(sim.netGPIO(this.pin), 0); }
      this.pin = -1;
    }
  }
  Servo.tipuri = { attach: 'int', read: 'int', readMicroseconds: 'int', attached: 'bool' };
  api.clasa('Servo', Servo);
  class ESP32PWM { static allocateTimer() { } allocateTimer() { } }
  api.clasa('ESP32PWM', ESP32PWM);
  Object.assign(api.constante, { MIN_PULSE_WIDTH: 544, MAX_PULSE_WIDTH: 2400, DEFAULT_PULSE_WIDTH: 1500 });

  // ---------- Stepper (biblioteca Arduino) ----------
  class Stepper {
    constructor(pasi, p1, p2, p3, p4) {
      this.pasiTura = Math.max(1, pasi | 0);
      this.pini = [p1, p2, p3, p4].filter(p => p !== undefined);
      this.pas = 0; this.intarziere = 0; this.ultim = 0;
      for (const p of this.pini) f.pinMode(p, MOD('out'));
    }
    setSpeed(rpm) { this.intarziere = rpm > 0 ? 60 * 1000 * 1000 / this.pasiTura / rpm : 0; }
    *step(n) {
      const sim = S();
      if (!this.intarziere) { sim.problema('stepper-viteza', 'avertisment', 'Stepper.step() fără setSpeed(): biblioteca nu așteaptă între pași și motorul nu ține pasul.', { linie: linie() }); }
      let ramase = Math.abs(n | 0);
      const sens = n > 0 ? 1 : -1;
      while (ramase > 0) {
        const asteapta = this.ultim + this.intarziere - sim.timp;
        if (asteapta > 0) yield { dorm: asteapta };
        this.ultim = sim.timp;
        this.pas = (this.pas + sens + this.pasiTura) % this.pasiTura;
        ramase--;
        this._scrie(this.pas % 4);
      }
    }
    _scrie(k) {
      const P = this.pini;
      if (P.length === 4) {
        const sec = [[1, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1]][k];
        for (let i = 0; i < 4; i++) f.digitalWrite(P[i], sec[i]);
      } else if (P.length === 2) {
        const sec = [[0, 1], [1, 1], [1, 0], [0, 0]][k];
        f.digitalWrite(P[0], sec[0]); f.digitalWrite(P[1], sec[1]);
      }
    }
    version() { return 5; }
  }
  Stepper.tipuri = { version: 'int' };
  api.clasa('Stepper', Stepper);

  // ---------- AccelStepper (algoritmul lui Mike McCauley) ----------
  const CW = 1, CCW = 0;
  class AccelStepper {
    constructor(interfata, p1, p2, p3, p4, activ) {
      this.interfata = interfata === undefined ? 4 : interfata;
      this.pini = [p1 === undefined ? 2 : p1, p2 === undefined ? 3 : p2, p3 === undefined ? 4 : p3, p4 === undefined ? 5 : p4];
      this.poz = 0; this.tinta = 0; this.viteza = 0; this.vitezaMax = 1; this.acc = 0; this.interval = 0; this.latimeImpuls = 1; this.ultimPas = 0;
      this.n = 0; this.c0 = 0; this.cn = 0; this.cmin = 1; this.directie = CCW; this.inversat = [false, false, false, false]; this.pinEn = 0xFF;
      if (activ === undefined || activ) this.enableOutputs();
      this.setAcceleration(1);
      this.setMaxSpeed(1);
    }
    _nrPini() { return ({ 1: 2, 2: 2, 3: 3, 4: 4, 6: 3, 8: 4 })[this.interfata] || 0; }
    enableOutputs() {
      if (!this.interfata) return;
      const n = this._nrPini();
      for (let i = 0; i < n; i++) f.pinMode(this.pini[i], MOD('out'));
      if (this.pinEn !== 0xFF) { f.pinMode(this.pinEn, MOD('out')); f.digitalWrite(this.pinEn, 1); }
    }
    disableOutputs() {
      if (!this.interfata) return;
      this._iesiri(0);
      if (this.pinEn !== 0xFF) { f.pinMode(this.pinEn, MOD('out')); f.digitalWrite(this.pinEn, 0); }
    }
    setEnablePin(p) { this.pinEn = p; if (p !== 0xFF) { f.pinMode(p, MOD('out')); f.digitalWrite(p, 1); } }
    setPinsInverted(dir, pas, en) { this.inversat[0] = !!dir; this.inversat[1] = !!pas; void en; }
    setMinPulseWidth(us) { this.latimeImpuls = us; }
    _iesiri(masca) {
      const n = this._nrPini();
      for (let i = 0; i < n; i++) f.digitalWrite(this.pini[i], ((masca >> i) & 1) ^ (this.inversat[i] ? 1 : 0));
    }
    _pas(pas) {
      const sim = S();
      switch (this.interfata) {
        case 1: // DRIVER: STEP + DIR
          f.digitalWrite(this.pini[1], this.directie ^ (this.inversat[0] ? 1 : 0));
          f.digitalWrite(this.pini[0], 1 ^ (this.inversat[1] ? 1 : 0));
          sim.consuma(this.latimeImpuls);
          f.digitalWrite(this.pini[0], 0 ^ (this.inversat[1] ? 1 : 0));
          break;
        case 2: this._iesiri([0b10, 0b11, 0b01, 0b00][pas & 3]); break;
        case 3: this._iesiri([0b100, 0b001, 0b010][((pas % 3) + 3) % 3]); break;
        case 4: this._iesiri([0b0101, 0b0110, 0b1010, 0b1001][pas & 3]); break;
        case 6: this._iesiri([0b100, 0b101, 0b001, 0b011, 0b010, 0b110][((pas % 6) + 6) % 6]); break;
        case 8: this._iesiri([0b0001, 0b0101, 0b0100, 0b0110, 0b0010, 0b1010, 0b1000, 0b1001][pas & 7]); break;
      }
    }
    _calculeaza() {
      const dist = this.distanceToGo();
      const pasiOprire = Math.trunc((this.viteza * this.viteza) / (2 * this.acc));
      if (dist === 0 && pasiOprire <= 1) { this.interval = 0; this.viteza = 0; this.n = 0; return 0; }
      if (dist > 0) {
        if (this.n > 0) { if (pasiOprire >= dist || this.directie === CCW) this.n = -pasiOprire; }
        else if (this.n < 0) { if (pasiOprire < dist && this.directie === CW) this.n = -this.n; }
      } else if (dist < 0) {
        if (this.n > 0) { if (pasiOprire >= -dist || this.directie === CW) this.n = -pasiOprire; }
        else if (this.n < 0) { if (pasiOprire < -dist && this.directie === CCW) this.n = -this.n; }
      }
      if (this.n === 0) { this.cn = this.c0; this.directie = dist > 0 ? CW : CCW; }
      else { this.cn = this.cn - (2 * this.cn) / (4 * this.n + 1); this.cn = Math.max(this.cn, this.cmin); }
      this.n++;
      this.interval = this.cn;
      this.viteza = 1e6 / this.cn;
      if (this.directie === CCW) this.viteza = -this.viteza;
      return this.interval;
    }
    moveTo(abs) { abs = Math.trunc(abs); if (this.tinta !== abs) { this.tinta = abs; this._calculeaza(); } }
    move(rel) { this.moveTo(this.poz + Math.trunc(rel)); }
    runSpeed() {
      if (!this.interval) return false;
      const t = Math.floor(S().timp);
      if (t - this.ultimPas >= this.interval) {
        if (this.directie === CW) this.poz += 1; else this.poz -= 1;
        this._pas(this.poz);
        this.ultimPas = t;
        return true;
      }
      return false;
    }
    run() { if (this.runSpeed()) this._calculeaza(); return this.viteza !== 0 || this.distanceToGo() !== 0; }
    *runToPosition() { while (this.run()) { const r = this.ultimPas + this.interval - S().timp; yield { dorm: Math.max(1, r) }; } }
    runSpeedToPosition() { if (this.tinta === this.poz) return false; this.directie = this.tinta > this.poz ? CW : CCW; return this.runSpeed(); }
    *runToNewPosition(p) { this.moveTo(p); yield* this.runToPosition(); }
    setMaxSpeed(v) {
      v = Math.abs(v);
      if (this.vitezaMax !== v) { this.vitezaMax = v; this.cmin = 1e6 / v; if (this.n > 0) { this.n = Math.trunc((this.viteza * this.viteza) / (2 * this.acc)); this._calculeaza(); } }
    }
    maxSpeed() { return this.vitezaMax; }
    setAcceleration(a) {
      if (a === 0) return;
      a = Math.abs(a);
      if (this.acc !== a) { this.n = this.n * (this.acc / a); this.c0 = 0.676 * Math.sqrt(2 / a) * 1e6; this.acc = a; this._calculeaza(); }
    }
    acceleration() { return this.acc; }
    setSpeed(v) {
      if (v === this.viteza) return;
      v = Math.max(-this.vitezaMax, Math.min(this.vitezaMax, v));
      if (v === 0) this.interval = 0; else { this.interval = Math.abs(1e6 / v); this.directie = v > 0 ? CW : CCW; }
      this.viteza = v;
    }
    speed() { return this.viteza; }
    distanceToGo() { return this.tinta - this.poz; }
    targetPosition() { return this.tinta; }
    currentPosition() { return this.poz; }
    setCurrentPosition(p) { this.tinta = this.poz = Math.trunc(p); this.n = 0; this.interval = 0; this.viteza = 0; }
    stop() { if (this.viteza !== 0) { const s = Math.trunc((this.viteza * this.viteza) / (2 * this.acc)) + 1; this.move(this.viteza > 0 ? s : -s); } }
    isRunning() { return !(this.viteza === 0 && this.tinta === this.poz); }
  }
  AccelStepper.tipuri = { runSpeed: 'bool', run: 'bool', runSpeedToPosition: 'bool', maxSpeed: 'float', acceleration: 'float', speed: 'float', distanceToGo: 'long', targetPosition: 'long', currentPosition: 'long', isRunning: 'bool' };
  AccelStepper.constanteStatice = { FUNCTION: 0, DRIVER: 1, FULL2WIRE: 2, FULL3WIRE: 3, FULL4WIRE: 4, HALF3WIRE: 6, HALF4WIRE: 8 };
  api.clasa('AccelStepper', AccelStepper);

  api.include('Servo.h', 'ESP32Servo.h', 'ESP32_Servo.h', 'Stepper.h', 'AccelStepper.h');
})(window.M = window.M || {});
