/* Meșter — monitorul serial și plotterul serial (ca în Arduino IDE), cu viteză de transmisie reală:
   dacă viteza din monitor nu coincide cu Serial.begin(), textul apare deformat, exact ca pe placă. */
(function (M) {
  'use strict';
  const { $, el, esc } = M.u;
  const VITEZE = [9600, 19200, 38400, 57600, 74880, 115200, 230400, 460800, 921600];
  const CULORI_PLOT = ['#5fd4a6', '#f0a868', '#7eb8f5', '#f07aa8', '#e8e37a', '#b98cf5', '#8ee0f0', '#f5f5f5'];

  M.Serial = class {
    constructor(app) {
      this.app = app;
      this.iesire = $('#iesire-serial');
      this.baud = M.u.memorie.citeste('baud', 115200);
      this.terminator = M.u.memorie.citeste('terminator', '\n');
      this.autoDerulare = true;
      this.cuTimp = false;
      // două canale: portul USB al plăcii și telefonul conectat prin Bluetooth
      this.canale = { usb: { linii: [], linieCurenta: '', octetiCurenti: '' }, bt: { linii: [], linieCurenta: '', octetiCurenti: '' } };
      this.canal = 'usb';
      this.inAsteptare = false;
      this.modPlot = false;
      this.serii = new Map();
      this.maxPuncte = 400;
      this.construiesteBara();
      $('#form-serial').addEventListener('submit', (e) => { e.preventDefault(); this.trimite(); });
      this.iesire.addEventListener('scroll', () => {
        const jos = this.iesire.scrollHeight - this.iesire.scrollTop - this.iesire.clientHeight < 30;
        this.autoDerulare = jos;
      });
      this.gol();
    }
    // liniile canalului afișat
    get linii() { return this.canale[this.canal].linii; }
    set linii(v) { this.canale[this.canal].linii = v; }
    get linieCurenta() { return this.canale[this.canal].linieCurenta; }
    set linieCurenta(v) { this.canale[this.canal].linieCurenta = v; }
    alegeCanal(c) {
      this.canal = c;
      this.selPort.value = c;
      this.btnBt.classList.toggle('ascuns', c !== 'bt');
      this.selBaud.classList.toggle('ascuns', c === 'bt');
      this.btnPlot.classList.toggle('ascuns', c === 'bt');
      if (c === 'bt' && this.modPlot) this.comutaPlot();
      $('#intrare-serial').placeholder = c === 'bt' ? 'Trimite text de pe telefon (Bluetooth)…' : 'Trimite text către placă…';
      this.actualizeazaBT();
      this.randeazaTot();
    }
    actualizeazaBT() {
      if (!this.btnBt) return;
      const sim = this.app.sim;
      const con = sim && M.bluetooth ? M.bluetooth.conectat(sim) : null;
      const lista = sim && M.bluetooth ? M.bluetooth.lista(sim) : [];
      this.btnBt.textContent = con ? 'Deconectează (' + con + ')' : lista.length ? 'Conectează la ' + lista[0] : 'Niciun dispozitiv Bluetooth';
      this.btnBt.disabled = !con && !lista.length;
    }
    construiesteBara() {
      const b = $('#bara-serial');
      b.innerHTML = '';
      this.selPort = el('select', { class: 'camp', title: 'Ce se afișează: portul USB al plăcii sau telefonul conectat prin Bluetooth', on: { change: (e) => this.alegeCanal(e.target.value) } });
      for (const [v, n] of [['usb', 'USB (Serial)'], ['bt', 'Telefon (Bluetooth)']]) this.selPort.append(el('option', { value: v, text: n }));
      this.btnBt = el('button', { class: 'btn ascuns', text: 'Conectează', on: { click: () => {
        const sim = this.app.sim;
        if (!sim || !this.app.simuleaza) { M.dialog.notifica('Pornește simularea ca să conectezi telefonul.'); return; }
        if (M.bluetooth.conectat(sim)) M.bluetooth.deconecteaza(sim); else if (!M.bluetooth.conecteaza(sim, 0)) M.dialog.notifica('Niciun dispozitiv Bluetooth pornit: folosește SerialBT.begin("nume") sau un modul HC-05.');
        this.actualizeazaBT();
      } } });
      b.append(this.selPort, this.btnBt);
      const selBaud = this.selBaud = el('select', { class: 'camp', title: 'Viteza (baud) — trebuie să fie aceeași ca în Serial.begin()', on: { change: (e) => { this.baud = +e.target.value; M.u.memorie.scrie('baud', this.baud); } } });
      for (const v of VITEZE) selBaud.append(el('option', { value: v, text: v + ' baud', selected: v === this.baud }));
      const selTerm = el('select', { class: 'camp', title: 'Ce se adaugă la sfârșitul textului trimis', on: { change: (e) => { this.terminator = e.target.value; M.u.memorie.scrie('terminator', this.terminator); } } });
      for (const [v, n] of [['', 'Fără sfârșit de linie'], ['\n', 'Linie nouă'], ['\r', 'Retur de car'], ['\r\n', 'NL și CR']]) selTerm.append(el('option', { value: v, text: n, selected: v === this.terminator }));
      this.btnPlot = el('button', { class: 'btn', title: 'Plotter serial: desenează numerele primite', html: M.icon('grafic') + '<span>Grafic</span>', on: { click: () => this.comutaPlot() } });
      const btnTimp = el('button', { class: 'btn', title: 'Arată ora fiecărei linii', html: '<span>Oră</span>', on: { click: () => { this.cuTimp = !this.cuTimp; btnTimp.classList.toggle('activ', this.cuTimp); this.randeazaTot(); } } });
      b.append(selBaud, selTerm, this.btnPlot, btnTimp,
        el('button', { class: 'btn', title: 'Copiază tot textul', html: M.icon('copiaza'), on: { click: async () => { const ok = await M.u.copiaza(this.linii.map(l => l.text).join('\n') + this.linieCurenta); M.dialog.notifica(ok ? 'Text copiat.' : 'Nu am putut copia.'); } } }),
        el('button', { class: 'btn', title: 'Golește monitorul', html: M.icon('goleste'), on: { click: () => this.goleste() } }));
    }
    gol() {
      if (!this.linii.length && !this.linieCurenta) this.iesire.innerHTML = this.canal === 'bt'
        ? '<span class="gol">Aici e telefonul: vezi ce trimite placa prin Bluetooth (SerialBT.print() sau un HC-05) și îi poți scrie. Apasă „Conectează”.</span>'
        : '<span class="gol">Aici apare ce trimite placa prin Serial.print(). Pornește simularea.</span>';
    }
    goleste() {
      for (const c of Object.values(this.canale)) { c.linii = []; c.linieCurenta = ''; c.octetiCurenti = ''; }
      this.serii.clear();
      this.iesire.innerHTML = '';
      this.gol();
      this.deseneazaPlot();
    }
    // text primit de la placă (octeți ca șir); canal = 'usb' sau 'bt' (telefonul)
    primeste(d, canal) {
      const c = this.canale[canal || 'usb'];
      let text = d.text;
      if (!text) return;
      if (d.baud && d.baud !== this.baud && c === this.canale.usb) text = deformeaza(text, d.baud, this.baud);
      // decodăm UTF-8 pe bucăți întregi
      c.octetiCurenti += text;
      let bun = c.octetiCurenti.length;
      // nu tăiem o secvență UTF-8 la jumătate
      for (let i = Math.max(0, c.octetiCurenti.length - 3); i < c.octetiCurenti.length; i++) {
        const k = c.octetiCurenti.charCodeAt(i);
        if (k >= 0xC0) { const lung = k >= 0xF0 ? 4 : k >= 0xE0 ? 3 : 2; if (i + lung > c.octetiCurenti.length) { bun = i; break; } }
      }
      const dec = M.utf8.decodeaza(c.octetiCurenti.slice(0, bun));
      c.octetiCurenti = c.octetiCurenti.slice(bun);
      const bucati = dec.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      for (let i = 0; i < bucati.length; i++) {
        c.linieCurenta += bucati[i];
        if (i < bucati.length - 1) {
          c.linii.push({ t: this.app.sim ? this.app.sim.timp : 0, text: c.linieCurenta, sistem: !!d.sistem });
          if (c === this.canale.usb) this.adaugaLaPlot(c.linieCurenta);
          c.linieCurenta = '';
        }
      }
      if (c.linii.length > 3000) c.linii.splice(0, c.linii.length - 2500);
      if (canal === 'bt') this.actualizeazaBT();
      if (c === this.canale[this.canal]) this.programeazaRandare();
    }
    programeazaRandare() {
      if (this.inAsteptare) return;
      this.inAsteptare = true;
      requestAnimationFrame(() => { this.inAsteptare = false; this.randeazaTot(); if (this.modPlot) this.deseneazaPlot(); });
    }
    randeazaTot() {
      if (!this.linii.length && !this.linieCurenta) { this.gol(); return; }
      const ultime = this.linii.slice(-1500);
      const f = (l) => (this.cuTimp ? '<span class="timp">' + M.u.numar(l.t / 1e6, 3) + '</span>' : '') + (l.sistem ? '<span class="sistem">' + esc(l.text) + '</span>' : esc(l.text));
      this.iesire.innerHTML = ultime.map(f).join('\n') + (this.linieCurenta ? '\n' + esc(this.linieCurenta) : '');
      if (this.autoDerulare) this.iesire.scrollTop = this.iesire.scrollHeight;
      M.bus.emit('serial-nou');
    }
    trimite() {
      const inp = $('#intrare-serial');
      const t = inp.value;
      const sim = this.app.sim;
      if (!sim || !this.app.simuleaza) { M.dialog.notifica('Pornește simularea ca să trimiți text plăcii.'); return; }
      if (this.canal === 'bt') {
        if (!M.bluetooth.dinTelefon(sim, M.utf8.codifica(t + this.terminator))) { M.dialog.notifica('Niciun dispozitiv Bluetooth pornit: folosește SerialBT.begin("nume") sau un modul HC-05.'); return; }
        this.canale.bt.linii.push({ t: sim.timp, text: '> ' + t, sistem: true });
        this.actualizeazaBT();
        this.programeazaRandare();
      } else sim.obiecte.Serial.primeste(M.utf8.codifica(t + this.terminator));
      inp.value = '';
    }
    // ---------- plotter ----------
    comutaPlot() {
      this.modPlot = !this.modPlot;
      this.btnPlot.classList.toggle('activ', this.modPlot);
      $('#plotter').classList.toggle('ascuns', !this.modPlot);
      this.iesire.classList.toggle('ascuns', this.modPlot);
      if (this.modPlot) this.deseneazaPlot();
    }
    adaugaLaPlot(linie) {
      // formate acceptate: „12 34”, „12,34”, „temp:23.5,umid:40”
      const parti = linie.trim().split(/[\s,;\t]+/).filter(Boolean);
      let i = 0;
      for (const p of parti) {
        let nume, v;
        const m = /^([^:]+):(-?[\d.]+(?:e[-+]?\d+)?)$/i.exec(p);
        if (m) { nume = m[1]; v = parseFloat(m[2]); }
        else if (/^-?[\d.]+(?:e[-+]?\d+)?$/i.test(p)) { nume = 'valoare ' + (i + 1); v = parseFloat(p); }
        else continue;
        if (isNaN(v)) continue;
        i++;
        if (!this.serii.has(nume)) this.serii.set(nume, []);
        const s = this.serii.get(nume);
        s.push(v);
        if (s.length > this.maxPuncte) s.shift();
      }
    }
    deseneazaPlot() {
      const cv = $('#canvas-plotter');
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(10, r.width * dpr); cv.height = Math.max(10, r.height * dpr);
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = r.width, H = r.height;
      ctx.clearRect(0, 0, W, H);
      const leg = $('#legenda-plotter');
      if (!this.serii.size) { leg.innerHTML = '<span style="color:#6f8f82">Trimite numere cu Serial.println(valoare) sau „nume:valoare,nume2:valoare”.</span>'; return; }
      let min = Infinity, max = -Infinity;
      for (const s of this.serii.values()) for (const v of s) { if (v < min) min = v; if (v > max) max = v; }
      if (min === max) { min -= 1; max += 1; }
      const pad = (max - min) * 0.08; min -= pad; max += pad;
      const sus = 30, jos = 18, st = 48, dr = 10;
      ctx.font = '11px ' + getComputedStyle(document.body).getPropertyValue('--font-cod');
      ctx.fillStyle = 'rgba(207,232,220,.55)';
      ctx.strokeStyle = 'rgba(207,232,220,.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const v = min + (max - min) * i / 4;
        const y = H - jos - (H - sus - jos) * i / 4;
        ctx.beginPath(); ctx.moveTo(st, y); ctx.lineTo(W - dr, y); ctx.stroke();
        ctx.fillText(Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(Math.abs(v) < 10 ? 2 : 1), 4, y + 4);
      }
      let idx = 0;
      leg.innerHTML = '';
      for (const [nume, s] of this.serii) {
        const cul = CULORI_PLOT[idx++ % CULORI_PLOT.length];
        ctx.strokeStyle = cul; ctx.lineWidth = 1.6; ctx.beginPath();
        s.forEach((v, i) => {
          const x = st + (W - st - dr) * (i + this.maxPuncte - s.length) / (this.maxPuncte - 1);
          const y = H - jos - (H - sus - jos) * (v - min) / (max - min);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        const sp = el('span', { style: { color: cul }, text: nume + ' ' + (s.length ? M.u.numar(s[s.length - 1], 2) : '') });
        leg.append(sp);
      }
    }
  };

  // textul primit la o viteză greșită devine caractere fără sens
  function deformeaza(text, baudPlaca, baudMonitor) {
    const gunoi = 'ÿþàø\u0080¤ß¸ãÄ¿ð\u0098°';
    let r = '';
    let s = (baudPlaca * 31 + baudMonitor) | 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 10 && Math.random() < 0.5) { r += '\n'; continue; }
      s = (s * 1103515245 + 12345 + c) & 0x7fffffff;
      if ((s >> 8) % 3 === 0) continue;
      r += gunoi[(s >> 4) % gunoi.length];
    }
    return M.utf8.codifica(r);
  }
})(window.M = window.M || {});
