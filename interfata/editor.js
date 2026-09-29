/* Meșter — editorul de cod (CodeMirror 5, cu variantă simplă dacă biblioteca nu se încarcă):
   evidențiere Arduino, completare automată, verificare în timp ce scrii, marcaje de eroare. */
(function (M) {
  'use strict';
  const { $, el, esc } = M.u;

  const TIPURI_ARDUINO = 'String byte word boolean uint8_t int8_t uint16_t int16_t uint32_t int32_t uint64_t int64_t size_t TaskHandle_t QueueHandle_t SemaphoreHandle_t TickType_t BaseType_t IPAddress';

  function definesteMod() {
    if (!window.CodeMirror || definesteMod.gata) return;
    definesteMod.gata = true;
    const baza = window.CodeMirror.resolveMode('text/x-c++src');
    const tipuri = Object.assign({}, baza.types || {});
    for (const t of TIPURI_ARDUINO.split(' ')) tipuri[t] = true;
    for (const c of Object.keys(M.api.clase)) if (/^[A-Z]/.test(c)) tipuri[c] = true;
    const builtin = Object.assign({}, baza.builtin || {});
    for (const f of Object.keys(M.api.functii)) builtin[f] = true;
    for (const o of Object.keys(M.api.obiecte)) builtin[o] = true;
    const atomi = Object.assign({}, baza.atoms || {});
    for (const k of ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'RISING', 'FALLING', 'CHANGE', 'true', 'false', 'nullptr', 'NULL']) atomi[k] = true;
    window.CodeMirror.defineMIME('text/x-arduino', Object.assign({}, baza, { types: tipuri, builtin, atoms: atomi }));
  }

  M.Editor = class {
    constructor(app) {
      this.app = app;
      this.gazda = $('#gazda-editor');
      this.marcaje = [];
      definesteMod();
      if (window.CodeMirror) {
        this.cm = window.CodeMirror(this.gazda, {
          value: app.proiect.cod,
          mode: 'text/x-arduino', theme: 'mester', lineNumbers: true, matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true,
          indentUnit: 2, tabSize: 2, indentWithTabs: false, gutters: ['marcaj-gutter', 'CodeMirror-linenumbers'], lineWrapping: false,
          inputStyle: 'contenteditable', spellcheck: false, autocorrect: false, autocapitalize: false,
          extraKeys: {
            'Ctrl-Space': 'autocomplete', 'Cmd-/': 'toggleComment', 'Ctrl-/': 'toggleComment',
            Tab: (cm) => { if (cm.somethingSelected()) cm.indentSelection('add'); else cm.replaceSelection('  ', 'end'); },
            'Shift-Tab': (cm) => cm.indentSelection('subtract')
          }
        });
        this.cm.on('changes', () => this.laSchimbare());
        this.cm.on('inputRead', (cm, ch) => {
          if (ch.origin !== '+input' || !window.CodeMirror.showHint) return;
          const t = ch.text[0];
          if (/^[A-Za-z_.]$/.test(t)) {
            const cur = cm.getCursor();
            const cuv = cm.getLine(cur.line).slice(0, cur.ch).match(/[\w.]+$/);
            if (cuv && (cuv[0].length >= 3 || t === '.')) cm.showHint({ hint: (e) => this.sugestii(e), completeSingle: false });
          }
        });
        window.CodeMirror.commands.autocomplete = (cm) => cm.showHint({ hint: (e) => this.sugestii(e), completeSingle: false });
      } else {
        this.ta = el('textarea', { class: 'camp mono', spellcheck: false, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 0, resize: 'none', padding: '10px', fontSize: '13px', lineHeight: 1.55 } });
        this.ta.value = app.proiect.cod;
        this.ta.addEventListener('input', () => this.laSchimbare());
        this.gazda.append(this.ta);
      }
      this.verificaIntarziat = M.u.debounce(() => this.verifica(), 700);
      this.barei();
    }
    barei() {
      const b = $('#bara-cod');
      b.innerHTML = '';
      b.append(el('button', { class: 'btn', title: 'Scrie un program de pornire pe baza pieselor din schemă', html: M.icon('bagheta') + '<span>Cod din schemă</span>', on: { click: () => this.app.genereazaCod() } }));
      b.append(el('button', { class: 'btn', title: 'Copiază tot codul', html: M.icon('copiaza') + '<span>Copiază</span>', on: { click: async () => { const ok = await M.u.copiaza(this.valoare()); M.dialog.notifica(ok ? 'Codul a fost copiat. Lipește-l în Arduino IDE.' : 'Nu am putut copia automat — selectează textul și copiază-l.'); } } }));
      b.append(el('button', { class: 'btn', title: 'Descarcă proiectul ca arhivă .zip pentru Arduino IDE', html: M.icon('descarca') + '<span>.zip</span>', on: { click: () => this.app.proiecte.exportaZip() } }));
      this.infoPlaca = el('span', { class: 'info', style: { marginLeft: 'auto' } });
      b.append(this.infoPlaca);
      this.actualizeazaInfo();
    }
    actualizeazaInfo() {
      const placa = this.app.proiect.componente.find(c => { const d = M.componente.def(c.tip); return d && d.esteplaca; });
      this.infoPlaca.textContent = placa ? (M.placi.info(placa).nume) : 'Nicio placă în schemă';
    }
    valoare() { return this.cm ? this.cm.getValue() : this.ta.value; }
    seteaza(text) {
      if (this.cm) { this.cm.setValue(text); this.cm.clearHistory(); }
      else this.ta.value = text;
      this.verifica();
    }
    inlocuiesteCuIstoric(text) {
      if (this.cm) this.cm.setValue(text); else this.ta.value = text;
    }
    laSchimbare() {
      this.app.proiect.cod = this.valoare();
      this.app.schimbare('cod');
      this.verificaIntarziat();
    }
    reimprospateaza() { if (this.cm) setTimeout(() => this.cm.refresh(), 10); }
    // compilează în fundal ca să arate erorile imediat
    verifica() {
      const info = this.app.infoCompilare();
      const bara = $('#eroare-compilare');
      this.curataMarcaje();
      if (!info) { bara.classList.add('ascuns'); this.app.eroareCompilare = null; M.bus.emit('compilare', null); return null; }
      try {
        const r = M.compilator.compileaza(this.valoare(), info);
        bara.classList.add('ascuns');
        this.app.eroareCompilare = null;
        for (const a of r.avertismente) this.marcheaza(a.linie, 'avert', a.mesaj);
        this.app.avertismenteCod = r.avertismente;
        M.bus.emit('compilare', { ok: true, avertismente: r.avertismente });
        return r;
      } catch (e) {
        if (!e.esteCompilare) { console.error(e); e.linie = e.linie || 0; }
        this.app.eroareCompilare = { mesaj: e.message, linie: e.linie };
        this.app.avertismenteCod = [];
        bara.innerHTML = '';
        bara.append(el('b', { text: e.linie ? 'Linia ' + e.linie : 'Eroare' }), el('span', { text: e.message }));
        bara.classList.remove('ascuns');
        bara.onclick = () => this.mergiLa(e.linie);
        this.marcheaza(e.linie, 'eroare', e.message);
        M.bus.emit('compilare', { ok: false, eroare: this.app.eroareCompilare });
        return null;
      }
    }
    marcheaza(linie, tip, mesaj) {
      if (!this.cm || !linie) return;
      const l = linie - 1;
      if (l < 0 || l >= this.cm.lineCount()) return;
      const h = this.cm.addLineClass(l, 'background', tip === 'eroare' ? 'linie-eroare' : 'linie-avert');
      const m = el('div', { class: 'm ' + (tip === 'eroare' ? 'eroare' : 'avert'), title: mesaj });
      this.cm.setGutterMarker(l, 'marcaj-gutter', m);
      this.marcaje.push({ h, l });
    }
    curataMarcaje() {
      if (!this.cm) return;
      for (const m of this.marcaje) { this.cm.removeLineClass(m.h, 'background'); }
      this.cm.clearGutter('marcaj-gutter');
      this.marcaje = [];
    }
    mergiLa(linie) {
      this.app.arataFila('cod');
      if (!this.cm || !linie) return;
      setTimeout(() => {
        this.cm.focus();
        this.cm.setCursor({ line: linie - 1, ch: 0 });
        this.cm.scrollIntoView({ line: linie - 1, ch: 0 }, 80);
      }, 30);
    }
    sugestii(cm) {
      const cur = cm.getCursor();
      const linie = cm.getLine(cur.line);
      let start = cur.ch;
      while (start > 0 && /\w/.test(linie[start - 1])) start--;
      const cuv = linie.slice(start, cur.ch);
      let lista = [];
      if (linie[start - 1] === '.') {
        // metode după punct
        let s = start - 1;
        let b = s;
        while (b > 0 && /\w/.test(linie[b - 1])) b--;
        const obiect = linie.slice(b, s);
        const cls = this.clasaObiect(obiect);
        if (cls) {
          const nume = new Set();
          let p = cls.prototype;
          while (p && p !== Object.prototype) { for (const k of Object.getOwnPropertyNames(p)) if (!k.startsWith('_') && k !== 'constructor' && typeof p[k] === 'function') nume.add(k); p = Object.getPrototypeOf(p); }
          lista = [...nume];
        } else lista = ['length()', 'substring', 'indexOf', 'toInt()', 'toFloat()', 'trim()', 'c_str()', 'begin', 'print', 'println'];
      } else {
        const set = new Set([...Object.keys(M.api.functii).filter(k => !k.startsWith('__')), ...Object.keys(M.api.obiecte), ...Object.keys(M.api.clase).filter(k => /^[A-Z]/.test(k)),
          'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'void', 'int', 'float', 'bool', 'String', 'unsigned long', 'const', 'for', 'while', 'if', 'else', 'return', 'switch', 'case', 'break', '#include', '#define']);
        for (const m of cm.getValue().matchAll(/\b[A-Za-z_]\w{2,}\b/g)) set.add(m[0]);
        lista = [...set];
      }
      const q = cuv.toLowerCase();
      lista = lista.filter(x => x.toLowerCase().startsWith(q) && x !== cuv).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 40);
      return { list: lista, from: { line: cur.line, ch: start }, to: cur };
    }
    clasaObiect(nume) {
      if (M.api.obiecte[nume]) return M.api.clase[M.api.obiecte[nume]];
      // declarație de forma: Tip nume(...);
      const m = new RegExp('\\b([A-Z]\\w+)\\s+' + nume + '\\b').exec(this.valoare());
      if (m && M.api.clase[m[1]]) return M.api.clase[m[1]];
      return null;
    }
  };
})(window.M = window.M || {});
