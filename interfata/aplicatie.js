/* Meșter — pornirea aplicației: leagă planșa, piesele, inspectorul, editorul, monitorul serial,
   verificarea și asistentul; rulează bucla de simulare, salvarea automată și scurtăturile. */
(function (M) {
  'use strict';
  const { $, $$, el, esc } = M.u;

  const FILE = [
    { id: 'cod', nume: 'Cod', icon: 'cod' },
    { id: 'serial', nume: 'Serial', titlu: 'Monitor serial', icon: 'serial' },
    { id: 'verificare', nume: 'Verificare', icon: 'verificare' },
    // apare doar când codul folosește rețeaua
    { id: 'web', nume: 'Web', icon: 'glob', cuRetea: true },
    { id: 'asistent', nume: 'Asistent', icon: 'asistent' }
  ];

  class Aplicatie {
    constructor() {
      M.aplicatie = this;
      this.simuleaza = false;
      this.sim = null;
      this.fila = M.u.memorie.citeste('fila', 'cod');
      this.aplicaTema(M.u.memorie.citeste('tema', 'sistem'));
      this.proiect = this.proiectInitial();
      this.istoric = new M.proiect.Istoric(
        () => ({ componente: this.proiect.componente, fire: this.proiect.fire }),
        (s) => { this.proiect.componente = s.componente; this.proiect.fire = s.fire; this.spatiu.selectie = null; M.bus.emit('selectie', null); this.spatiu.randeazaTot(); this.schimbare('schema'); }
      );
      this.spatiu = new M.Spatiu(this);
      this.piese = new M.Piese(this);
      this.inspector = new M.Inspector(this);
      this.editor = new M.Editor(this);
      this.serial = new M.Serial(this);
      this.browser = new M.Browser(this);
      this.verificare = new M.Verificare(this);
      this.asistent = M.Asistent ? new M.Asistent(this) : null;
      this.proiecte = new M.Proiecte(this);
      this.salveazaIntarziat = M.u.debounce(() => this.salveaza(), 700);
      this.salveazaNorIntarziat = M.u.debounce(() => M.stocare.salveazaNor(this.proiect), 3500);
      this.construiesteInterfata();
      this.actualizeazaFileRetea();
      M.bus.on('compilare', () => this.actualizeazaFileRetea());
      this.spatiu.randeazaTot();
      this.aplicaVedereInitiala();
      this.editor.verifica();
      this.verificare.verificaSchema();
      this.arataFila(this.fila);
      this.ultimCadru = performance.now();
      requestAnimationFrame((t) => this.bucla(t));
      this.initAsincron();
    }
    proiectInitial() {
      const local = M.stocare.curentLocal();
      if (local) return M.proiect.normalizeaza(local);
      const primul = M.exemple && M.exemple.lista[0];
      return M.proiect.normalizeaza(primul ? primul.construieste() : M.proiect.nou());
    }
    async initAsincron() {
      M.stocare.initDescarcari();
      const ok = await M.stocare.initNor();
      if (!ok) return;
      this.actualizeazaStareSalvare();
      // dacă în cont e o versiune mai nouă a proiectului deschis, o încărcăm
      const lista = await M.stocare.listaNor();
      const aici = lista.find(x => x.id === this.proiect.id);
      if (aici && aici.modificat > this.proiect.modificat + 1000) {
        const p = await M.stocare.incarcaNor(aici.id);
        if (p) { this.incarcaProiect(M.proiect.normalizeaza(p)); M.dialog.notifica('Am încărcat versiunea mai nouă din cont.'); }
      } else if (!aici && !M.stocare.listaLocala().length && lista.length) {
        const ultim = lista.sort((a, b) => b.modificat - a.modificat)[0];
        const p = await M.stocare.incarcaNor(ultim.id);
        if (p) { this.incarcaProiect(M.proiect.normalizeaza(p)); M.dialog.notifica('Am deschis ultimul proiect din cont: ' + p.nume); }
      } else {
        this.salveazaNorIntarziat();
      }
    }

    // ---------- interfață ----------
    construiesteInterfata() {
      $('#btn-porneste').addEventListener('click', () => this.comutaSimulare());
      $('#btn-pauza').innerHTML = M.icon('pauza');
      $('#btn-pauza').addEventListener('click', () => this.comutaPauza());
      const sunet = $('#btn-sunet');
      const arataSunet = () => {
        const on = !M.sunet || M.sunet.activ;
        sunet.innerHTML = M.icon(on ? 'sunet' : 'mut');
        sunet.title = on ? 'Sunetul simulării: pornit (apasă ca să-l oprești)' : 'Sunetul simulării: oprit (apasă ca să-l pornești)';
        sunet.setAttribute('aria-pressed', on ? 'true' : 'false');
      };
      sunet.addEventListener('click', () => { if (M.sunet) M.sunet.comuta(); arataSunet(); });
      arataSunet();
      $('#btn-anuleaza').innerHTML = M.icon('anuleaza');
      $('#btn-refa').innerHTML = M.icon('refa');
      $('#btn-anuleaza').addEventListener('click', () => this.anuleaza());
      $('#btn-refa').addEventListener('click', () => this.refa());
      $('#btn-meniu').innerHTML = M.icon('meniu');
      $('#btn-meniu').addEventListener('click', (e) => { e.stopPropagation(); this.comutaMeniu(); });
      document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.meniu-buton')) this.comutaMeniu(false); });
      $('#btn-zoom-plus').innerHTML = M.icon('plus');
      $('#btn-zoom-minus').innerHTML = M.icon('minus');
      $('#btn-zoom-tot').innerHTML = M.icon('tot');
      $('#btn-zoom-plus').addEventListener('click', () => this.spatiu.zoom(1.25));
      $('#btn-zoom-minus').addEventListener('click', () => this.spatiu.zoom(0.8));
      $('#btn-zoom-tot').addEventListener('click', () => this.spatiu.arataTot());
      $('#btn-deschide-piese').innerHTML = M.icon('plus') + '<span>Piese</span>';
      $('#btn-deschide-piese').addEventListener('click', () => this.comutaPiese());
      $('#btn-inchide-piese').innerHTML = M.icon('inchide');
      $('#btn-inchide-piese').addEventListener('click', () => this.inchidePiese());
      $('#btn-gol-exemple').addEventListener('click', () => this.proiecte.arataExemple());
      $('#btn-gol-piese').addEventListener('click', () => this.deschidePiese());
      const nume = $('#nume-proiect');
      nume.value = this.proiect.nume;
      nume.addEventListener('change', () => { this.proiect.nume = nume.value.trim() || 'Proiect fără nume'; nume.value = this.proiect.nume; this.schimbare('nume'); });
      nume.addEventListener('keydown', (e) => { if (e.key === 'Enter') nume.blur(); });
      // file
      const file = $('#file');
      for (const f of FILE) {
        file.append(el('button', { class: 'fila', role: 'tab', 'data-fila': f.id, title: f.titlu || f.nume, html: M.icon(f.icon) + '<span>' + esc(f.nume) + '</span>' + (f.id === 'verificare' ? '<span class="insigna" data-insigna></span>' : ''), on: { click: () => this.arataFila(f.id) } }));
      }
      // navigare telefon
      const nav = $('#navigare-jos');
      for (const v of [{ id: 'schema', nume: 'Schemă', icon: 'cip' }].concat(FILE.map(f => ({ id: f.id, nume: f.scurt || f.nume, icon: f.icon })))) {
        nav.append(el('button', { 'data-vedere': v.id, html: M.icon(v.icon) + '<span>' + esc(v.nume) + '</span>' + (v.id === 'verificare' ? '<span class="insigna" data-insigna hidden></span>' : ''), on: { click: () => this.arataVedere(v.id) } }));
      }
      this.construiesteMeniu();
      this.actualizeazaButoaneSim();
      M.bus.on('istoric', () => this.actualizeazaIstoric());
      this.actualizeazaIstoric();
      M.bus.on('nor-salvat', () => this.actualizeazaStareSalvare());
      M.bus.on('nor-eroare', (m) => { M.dialog.notifica(m, 4000); this.actualizeazaStareSalvare(); });
      document.addEventListener('keydown', (e) => this.tasta(e));
      window.addEventListener('resize', M.u.debounce(() => { this.editor.reimprospateaza(); }, 150));
      window.addEventListener('beforeunload', () => { this.salveazaIntarziat.acum(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.salveazaIntarziat.acum(); });
    }
    construiesteMeniu() {
      const m = $('#meniu-principal');
      m.innerHTML = '';
      const item = (icon, text, f, scurt) => m.append(el('button', { role: 'menuitem', html: M.icon(icon) + '<span>' + esc(text) + '</span>' + (scurt ? '<span class="scurtatura">' + scurt + '</span>' : ''), on: { click: () => { this.comutaMeniu(false); f(); } } }));
      item('nou', 'Proiect nou', () => this.proiecte.proiectNou());
      item('dosar', 'Proiectele mele', () => this.proiecte.arata());
      item('carte', 'Exemple gata montate', () => this.proiecte.arataExemple());
      m.append(el('hr'));
      item('descarca', 'Descarcă pentru Arduino IDE (.zip)', () => this.proiecte.exportaZip());
      item('salveaza', 'Descarcă proiectul (.json)', () => this.proiecte.exportaJson());
      item('incarca', 'Deschide un proiect (.json)', () => this.proiecte.importa());
      item('lista', 'Lista de piese și legături', () => this.proiecte.arataListaPiese());
      m.append(el('hr'));
      item('asistent', 'Asistent', () => this.arataFila('asistent'));
      item(document.documentElement.dataset.theme === 'dark' ? 'soare' : 'luna', 'Schimbă tema (' + ({ sistem: 'după sistem', light: 'luminoasă', dark: 'întunecată' })[M.u.memorie.citeste('tema', 'sistem')] + ')', () => {
        const ord = ['sistem', 'light', 'dark'];
        const t = ord[(ord.indexOf(M.u.memorie.citeste('tema', 'sistem')) + 1) % 3];
        M.u.memorie.scrie('tema', t); this.aplicaTema(t); this.construiesteMeniu();
        M.dialog.notifica('Temă: ' + ({ sistem: 'după sistem', light: 'luminoasă', dark: 'întunecată' })[t]);
      });
      item('info', 'Scurtături și ajutor', () => this.arataAjutor());
    }
    aplicaTema(t) {
      if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
      else delete document.documentElement.dataset.theme;
    }
    comutaMeniu(stare) {
      const m = $('#meniu-principal');
      const des = stare === undefined ? m.classList.contains('ascuns') : stare;
      m.classList.toggle('ascuns', !des);
      $('#btn-meniu').setAttribute('aria-expanded', des ? 'true' : 'false');
    }
    arataFila(id) {
      this.fila = id;
      M.u.memorie.scrie('fila', id);
      for (const b of $$('.fila')) b.classList.toggle('activa', b.dataset.fila === id);
      for (const p of $$('.pagina')) p.classList.toggle('ascuns', p.dataset.pagina !== id);
      const app = $('#aplicatie');
      app.classList.remove('fara-dreapta');
      if (window.innerWidth <= 760) this.arataVedere(id, true);
      if (id === 'cod') this.editor.reimprospateaza();
      if (id === 'serial') { this.serial.randeazaTot(); if (this.serial.modPlot) this.serial.deseneazaPlot(); }
      if (id === 'verificare') this.verificare.randeaza();
      if (id === 'asistent' && this.asistent) this.asistent.laArata();
      if (id === 'web') this.browser.laArata();
    }
    // fila Web se vede când codul include biblioteci de rețea (sau când e deja deschisă)
    actualizeazaFileRetea() {
      const cuRetea = /#\s*include\s*[<"](WiFi|ESP8266WiFi|WebServer|ESP8266WebServer|ESPAsyncWebServer|HTTPClient|ESP8266HTTPClient|WiFiClient|WiFiServer|AsyncTCP|WebSocketsServer|NTPClient|WiFiMulti|ESPmDNS)\b/.test(this.proiect.cod || '');
      for (const f of FILE) if (f.cuRetea) for (const b of document.querySelectorAll('[data-fila="' + f.id + '"], [data-vedere="' + f.id + '"]')) b.classList.toggle('ascuns', !cuRetea);
      if (!cuRetea && this.fila === 'web') this.arataFila('cod');
    }
    arataVedere(v, dinFila) {
      const app = $('#aplicatie');
      app.dataset.vedere = v;
      for (const b of $$('#navigare-jos button')) b.classList.toggle('activ', b.dataset.vedere === v);
      if (v !== 'schema' && !dinFila) this.arataFila(v);
      if (v === 'schema') { this.inchidePiese(); requestAnimationFrame(() => { if (!this.vedereAplicata) this.aplicaVedereInitiala(); }); }
    }
    comutaPiese() { $('#aplicatie').classList.toggle('piese-deschise'); if (window.innerWidth > 960) { $('#aplicatie').classList.toggle('fara-piese', !$('#aplicatie').classList.contains('fara-piese')); $('#aplicatie').classList.remove('piese-deschise'); } }
    deschidePiese() { if (window.innerWidth <= 960) $('#aplicatie').classList.add('piese-deschise'); else $('#aplicatie').classList.remove('fara-piese'); setTimeout(() => $('#cauta-piese').focus({ preventScroll: true }), 50); }
    inchidePiese() { $('#aplicatie').classList.remove('piese-deschise'); }
    actualizeazaInsigne(n) {
      for (const i of $$('[data-insigna]')) {
        const nr = n.eroare || n.avertisment;
        i.textContent = nr || '';
        i.hidden = !nr;
        i.className = 'insigna' + (n.eroare ? ' eroare' : n.avertisment ? ' avert' : '');
      }
    }
    aplicaVedereInitiala() {
      const r = $('#scena').getBoundingClientRect();
      if (r.width < 10) return;
      this.vedereAplicata = true;
      const v = this.proiect.vedere;
      if (v && isFinite(v.x) && isFinite(v.k)) { this.spatiu.vedere = { x: v.x, y: v.y, k: v.k }; this.spatiu.aplicaVedere(); }
      else this.spatiu.arataTot();
    }
    centreazaPe(id) {
      const c = this.proiect.componente.find(x => x.id === id);
      if (!c) return;
      const b = this.spatiu.cutieLume(c);
      const r = $('#scena').getBoundingClientRect();
      const v = this.spatiu.vedere;
      v.x = r.width / 2 - (b.x + b.w / 2) * v.k;
      v.y = r.height / 2 - (b.y + b.h / 2) * v.k;
      this.spatiu.aplicaVedere();
    }
    arataAjutor() {
      const c = el('div');
      c.innerHTML = `<p><b>Planșa:</b> atinge o piesă din listă ca s-o adaugi. Trage de ea ca s-o muți; pinii se prind singuri în găurile breadboard-ului. Atinge un pin (sau o gaură), apoi alt pin, ca să tragi un fir. Atinge planșa între ele ca să faci colțuri.</p>
        <p><b>Simularea:</b> „Pornește” compilează codul și îl rulează. Apasă butoanele desenate, rotește potențiometrele și mută glisoarele senzorilor din panoul piesei selectate.</p>
        <p><b>Pe calculator:</b> <span class="mono">R</span> rotește · <span class="mono">Delete</span> șterge · <span class="mono">Ctrl+D</span> duplică · <span class="mono">Ctrl+Z / Ctrl+Y</span> anulează / refă · <span class="mono">Săgeți</span> mută · <span class="mono">F5</span> sau <span class="mono">Ctrl+Enter</span> pornește/oprește · rotița mouse-ului face zoom · <span class="mono">Esc</span> renunță la fir.</p>
        <p><b>Pe telefon:</b> două degete pentru zoom și deplasare. Codul, monitorul serial și verificarea sunt în bara de jos.</p>
        <p><b>Pe placa reală:</b> „Descarcă pentru Arduino IDE” îți dă schița în folderul ei, cu lista de legături; în Arduino IDE alege placa „${esc(this.infoPlaca() || 'ESP32 Dev Module')}”.</p>`;
      M.dialog.deschide({ titlu: 'Cum se folosește', continut: c, butoane: [{ text: 'Am înțeles', clasa: 'principal' }] });
    }
    infoPlaca() {
      const placa = this.proiect.componente.find(c => { const d = M.componente.def(c.tip); return d && d.esteplaca; });
      return placa ? M.placi.info(placa).nume : null;
    }
    infoCompilare() {
      const placa = this.proiect.componente.find(c => { const d = M.componente.def(c.tip); return d && d.esteplaca; });
      if (!placa) return M.api.infoCompilare(M.placi.info({ tip: 'esp32-devkit-v1', prop: {} }));
      return M.api.infoCompilare(M.placi.info(placa));
    }

    // ---------- proiect ----------
    schimbare(tip) {
      this.proiect.modificat = Date.now();
      if (tip === 'schema' || tip === 'schema-vizual') {
        this.verificare.ruleazaIntarziat();
        this.editor.actualizeazaInfo();
        $('#plansa-goala').classList.toggle('ascuns', this.proiect.componente.length > 0);
      }
      this.marcheazaNesalvat();
      this.salveazaIntarziat();
    }
    marcheazaNesalvat() { $('#stare-salvare').textContent = 'Se salvează…'; }
    salveaza() {
      const ok = M.stocare.salveazaLocal(this.proiect);
      if (M.stocare.norDisponibil) this.salveazaNorIntarziat();
      this.actualizeazaStareSalvare(ok);
    }
    actualizeazaStareSalvare(okLocal) {
      const s = $('#stare-salvare');
      if (okLocal === false) { s.textContent = 'Nesalvat (memoria browserului e plină)'; return; }
      s.textContent = M.stocare.norDisponibil ? (M.stocare.ultimaScriereNor ? 'Salvat în cont' : 'Salvat') : 'Salvat pe acest dispozitiv';
      s.title = M.stocare.norDisponibil ? 'Proiectul se sincronizează între telefon și calculator.' : 'Proiectul e salvat în acest browser.';
    }
    incarcaProiect(p) {
      if (this.simuleaza) this.opreste();
      this.salveazaIntarziat.acum();
      this.proiect = p;
      this.istoric.goleste();
      this.spatiu.selectie = null;
      M.bus.emit('selectie', null);
      $('#nume-proiect').value = p.nume;
      this.spatiu.randeazaTot();
      this.vedereAplicata = false;
      this.aplicaVedereInitiala();
      this.editor.seteaza(p.cod);
      this.editor.actualizeazaInfo();
      this.serial.goleste();
      this.verificare.verificaSchema();
      this.salveaza();
    }
    anuleaza() { if (this.simuleaza) { M.dialog.notifica('Oprește simularea ca să modifici schema.'); return; } this.istoric.anuleaza(); }
    refa() { if (this.simuleaza) return; this.istoric.refa(); }
    actualizeazaIstoric() {
      $('#btn-anuleaza').disabled = !this.istoric.inapoi.length || this.simuleaza;
      $('#btn-refa').disabled = !this.istoric.inainte.length || this.simuleaza;
    }
    async genereazaCod() {
      if (!M.generatorCod) return;
      const cod = M.generatorCod.genereaza(this.proiect);
      const actual = this.editor.valoare().trim();
      const eImplicit = !actual || actual === M.proiect.COD_IMPLICIT.trim();
      if (!eImplicit) {
        const da = await M.dialog.confirma('Codul din editor va fi înlocuit cu un program scris pe baza pieselor din schemă. Vrei să continui?', { titlu: 'Cod din schemă', da: 'Înlocuiește codul' });
        if (!da) return;
      }
      this.editor.inlocuiesteCuIstoric(cod);
      this.arataFila('cod');
      M.dialog.notifica('Am scris codul pentru piesele din schemă.');
    }

    // ---------- simulare ----------
    comutaSimulare() { if (this.simuleaza) this.opreste(); else this.porneste(); }
    porneste(opt) {
      opt = opt || {};
      if (this.simuleaza) return true;
      const placa = this.proiect.componente.find(c => { const d = M.componente.def(c.tip); return d && d.esteplaca; });
      if (!placa) { if (opt.ramaiPeLoc) return false; M.dialog.notifica('Adaugă o placă (ESP32) în schemă ca să rulezi codul.', 3500); this.deschidePiese(); return false; }
      const prog = this.editor.verifica();
      if (!prog) {
        if (opt.ramaiPeLoc) return false;
        this.arataFila('cod');
        const e = this.eroareCompilare;
        M.dialog.notifica('Codul are o eroare' + (e && e.linie ? ' la linia ' + e.linie : '') + ' — corectează și încearcă din nou.', 3500);
        return false;
      }
      M.sunet && M.sunet.deblocheaza();
      this.salveazaIntarziat.acum();
      let sim;
      try { sim = new M.Simulare(this.proiect, {}); }
      catch (e) { console.error(e); M.dialog.notifica('Nu am putut construi circuitul: ' + e.message, 4000); return false; }
      this.sim = sim;
      sim.on('serial', (d) => this.serial.primeste(d));
      sim.on('bluetooth', (d) => this.serial.primeste(d, 'bt'));
      sim.on('bluetooth-lista', () => this.serial.actualizeazaBT());
      sim.on('problema', () => { this.problemeNoi = true; });
      sim.on('stare', (s) => { this.actualizeazaButoaneSim(); if (s === 'eroare') M.dialog.notifica('Simularea s-a oprit: placa se reseta mereu.', 4000); });
      sim.on('cadere', (c) => { M.dialog.notifica('Placa s-a resetat' + (c.linie ? ' (linia ' + c.linie + ')' : '') + ': ' + c.explicatie, 5000); });
      sim.on('memorie', () => this.salveazaIntarziat());
      this.browser.laSimNoua(sim);
      this.serial.goleste();
      this.simuleaza = true;
      $('#scena').classList.add('simuleaza');
      sim.porneste(prog);
      this.spatiu.selectie && M.bus.emit('selectie', this.spatiu.selectie);
      this.spatiu.anuleazaFir();
      this.actualizeazaButoaneSim();
      this.actualizeazaIstoric();
      this.verificare.randeaza();
      if (window.innerWidth <= 760 && $('#aplicatie').dataset.vedere !== 'schema' && !opt.ramaiPeLoc) this.arataVedere('schema');
      return true;
    }
    opreste() {
      if (!this.sim) return;
      this.sim.opreste();
      this.simuleaza = false;
      this.browser.laOprire();
      $('#scena').classList.remove('simuleaza');
      this.spatiu.actualizeazaVizual();
      this.spatiu.reseteazaEcrane();
      this.actualizeazaButoaneSim();
      this.actualizeazaIstoric();
      M.bus.emit('selectie', this.spatiu.selectie);
      this.verificare.randeaza();
    }
    comutaPauza() {
      if (!this.sim) return;
      if (this.sim.stare === 'ruleaza') this.sim.pauza(); else if (this.sim.stare === 'pauza') this.sim.continua();
      this.actualizeazaButoaneSim();
    }
    actualizeazaButoaneSim() {
      const b = $('#btn-porneste');
      const st = this.sim ? this.sim.stare : 'oprita';
      b.classList.toggle('ruleaza', this.simuleaza);
      b.innerHTML = this.simuleaza ? M.icon('opreste') + '<span>Oprește</span>' : M.icon('porneste') + '<span>Pornește</span>';
      b.title = this.simuleaza ? 'Oprește simularea (F5)' : 'Pornește simularea (F5)';
      b.setAttribute('aria-label', this.simuleaza ? 'Oprește simularea' : 'Pornește simularea');
      $('#btn-pauza').disabled = !this.simuleaza || st === 'eroare';
      $('#btn-pauza').innerHTML = st === 'pauza' ? M.icon('porneste') : M.icon('pauza');
      $('#btn-pauza').title = st === 'pauza' ? 'Continuă' : 'Pauză';
      const et = $('#eticheta-mod');
      et.className = 'eticheta-mod' + (this.simuleaza ? (st === 'pauza' ? ' pauza' : st === 'eroare' ? ' eroare' : ' ruleaza') : '');
      $('#text-mod').textContent = !this.simuleaza ? 'Editare' : st === 'pauza' ? 'Pauză' : st === 'eroare' ? 'Oprită (eroare)' : 'Simulare';
    }
    bucla(t) {
      const dt = Math.min(100, t - this.ultimCadru);
      this.ultimCadru = t;
      if (this.simuleaza && this.sim) {
        if (this.sim.stare === 'ruleaza') {
          this.sim.avanseaza(dt);
          this.sim.actualizeazaVizual();
        }
        this.spatiu.actualizeazaVizual();
        this.contorTimp = (this.contorTimp || 0) + dt;
        if (this.contorTimp > 120) {
          this.contorTimp = 0;
          $('#timp-sim').textContent = M.u.formatTimp(this.sim.timp);
          const f = this.sim.statistici.factorReal;
          $('#indicator-sim').title = f < 0.95 ? 'Simularea rulează la ' + Math.round(f * 100) + '% din viteza reală' : 'Simularea rulează în timp real';
        }
        if (this.problemeNoi) {
          this.contorProbleme = (this.contorProbleme || 0) + dt;
          if (this.contorProbleme > 400) { this.contorProbleme = 0; this.problemeNoi = false; this.verificare.randeaza(); }
        }
      }
      requestAnimationFrame((x) => this.bucla(x));
    }
    tasta(e) {
      const tinta = e.target;
      const inCamp = tinta && (tinta.closest('input, textarea, select, [contenteditable="true"], .CodeMirror'));
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'F5' || (ctrl && e.key === 'Enter')) { e.preventDefault(); this.comutaSimulare(); return; }
      if (inCamp) return;
      if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) this.refa(); else this.anuleaza(); return; }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); this.refa(); return; }
      if (ctrl && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); this.spatiu.duplicaSelectia(); return; }
      if (ctrl && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.salveazaIntarziat.acum(); M.dialog.notifica('Proiect salvat.'); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (this.spatiu.selectie) { e.preventDefault(); this.spatiu.stergeSelectia(); } return; }
      if (e.key === 'Escape') { if (this.spatiu.firInCurs) this.spatiu.anuleazaFir(); else this.spatiu.selecteaza(null); this.comutaMeniu(false); return; }
      if (e.key === 'r' || e.key === 'R') { this.spatiu.rotesteSelectia(e.shiftKey ? -90 : 90); return; }
      const pas = e.shiftKey ? 50 : 10;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.spatiu.mutaSelectia(-pas, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.spatiu.mutaSelectia(pas, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.spatiu.mutaSelectia(0, -pas); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.spatiu.mutaSelectia(0, pas); }
      if (e.key === '+' || e.key === '=') this.spatiu.zoom(1.2);
      if (e.key === '-') this.spatiu.zoom(1 / 1.2);
      if (e.key === '0') this.spatiu.arataTot();
    }
  }

  function porneste() {
    try { new Aplicatie(); }
    catch (e) {
      console.error(e);
      document.body.innerHTML = '<div style="padding:24px;font-family:system-ui"><h2>Meșter nu a putut porni</h2><p>' + esc(e.message) + '</p></div>';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', porneste);
  else porneste();
})(window.M = window.M || {});
