/* Meșter — proiectele mele (local și în cont), exemplele, exportul pentru Arduino IDE și importul. */
(function (M) {
  'use strict';
  const { el, esc } = M.u;

  M.Proiecte = class {
    constructor(app) { this.app = app; }

    async arata() {
      const cont = el('div', { class: 'lista-proiecte' });
      const dlg = M.dialog.deschide({
        titlu: 'Proiectele mele', continut: cont, lat: false,
        butoane: [
          { text: 'Deschide din fișier…', actiune: () => { this.importa(); } },
          { text: 'Proiect nou', clasa: 'principal', actiune: () => { this.proiectNou(); } }
        ]
      });
      const randeaza = async () => {
        cont.innerHTML = '';
        const local = M.stocare.listaLocala();
        const nor = await M.stocare.listaNor();
        const toate = new Map();
        for (const p of local) toate.set(p.id, Object.assign({ local: true }, p));
        for (const p of nor) { const x = toate.get(p.id); toate.set(p.id, Object.assign({}, x || {}, p, { nor: true, local: !!x, modificat: Math.max(p.modificat || 0, x ? x.modificat : 0) })); }
        const lista = [...toate.values()].sort((a, b) => b.modificat - a.modificat);
        if (M.stocare.norDisponibil) cont.append(el('p', { style: { fontSize: '13px' }, html: M.icon('nor').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;margin-right:4px"') + 'Proiectele se salvează în contul tău și le găsești și pe telefon, și pe calculator.' }));
        else cont.append(el('p', { style: { fontSize: '13px' }, text: 'Proiectele sunt salvate în acest browser. Ca să le muți pe alt dispozitiv, folosește „Descarcă proiectul (.json)”.' }));
        if (!lista.length) cont.append(el('p', { text: 'Nu ai încă proiecte salvate.' }));
        for (const p of lista) {
          const rand = el('div', { class: 'rand-proiect' + (p.id === this.app.proiect.id ? ' curent' : '') });
          const info = el('div', { style: { minWidth: 0 } }, el('div', { class: 'n', text: p.nume || 'Fără nume' }), el('div', { class: 'd', text: M.u.dataRo(p.modificat) + ' · ' + (p.componente || 0) + ' piese' + (p.nor ? ' · în cont' : '') + (p.local && !p.nor ? ' · doar aici' : '') }));
          const act = el('div', { class: 'act' });
          if (p.id !== this.app.proiect.id) act.append(el('button', { class: 'btn principal', text: 'Deschide', on: { click: async () => { const pr = await this.incarca(p); if (pr) { this.app.incarcaProiect(pr); dlg.inchide(); } } } }));
          else act.append(el('span', { class: 'd', text: 'deschis acum' }));
          act.append(el('button', { class: 'btn icon', title: 'Duplică', html: M.icon('duplica'), on: { click: async () => { const pr = await this.incarca(p); if (!pr) return; pr.id = M.u.id('p'); pr.nume = pr.nume + ' (copie)'; pr.modificat = Date.now(); M.stocare.salveazaLocal(pr); if (M.stocare.norDisponibil) await M.stocare.salveazaNor(pr); randeaza(); } } }));
          act.append(el('button', { class: 'btn icon pericol', title: 'Șterge', html: M.icon('sterge'), on: { click: async () => {
            if (!await M.dialog.confirma('Ștergi definitiv proiectul „' + (p.nume || '') + '”?', { titlu: 'Ștergere', da: 'Șterge', pericol: true })) return;
            M.stocare.stergeLocal(p.id); await M.stocare.stergeNor(p.id);
            if (p.id === this.app.proiect.id) this.proiectNou(true);
            randeaza();
          } } }));
          rand.append(info, act);
          cont.append(rand);
        }
      };
      randeaza();
    }
    async incarca(p) {
      let pr = M.stocare.incarcaLocal(p.id);
      if (p.nor && (!pr || (p.modificat > (pr.modificat || 0)))) { const n = await M.stocare.incarcaNor(p.id); if (n) pr = n; }
      return pr ? M.proiect.normalizeaza(pr) : null;
    }
    proiectNou(tacut) {
      const p = M.proiect.nou('Proiect nou');
      // o placă pusă pe breadboard, gata de lucru
      const bb = M.proiect.adaugaComponenta(p, 'breadboard', 0, 0, { marime: 'completa' });
      const esp = M.proiect.adaugaComponenta(p, 'esp32-devkit-v1', 230, 60, {});
      esp.rot = 90;
      void bb;
      this.app.incarcaProiect(p);
      if (!tacut) M.dialog.notifica('Proiect nou creat. Adaugă piese din listă.');
    }
    arataExemple() {
      const grila = el('div', { class: 'grila-exemple' });
      const dlg = M.dialog.deschide({ titlu: 'Exemple gata montate', continut: el('div', {}, el('p', { text: 'Fiecare exemplu vine cu schema montată și codul scris. Apasă „Pornește” după ce îl deschizi.' }), grila), lat: true });
      for (const ex of M.exemple.lista) {
        const b = el('button', { class: 'exemplu' });
        b.append(el('h3', { text: ex.nume }), el('p', { text: ex.descriere }));
        const et = el('div', { class: 'etichete' });
        for (const t of ex.etichete || []) et.append(el('span', { text: t }));
        b.append(et);
        b.addEventListener('click', () => {
          const p = M.proiect.normalizeaza(ex.construieste());
          p.id = M.u.id('p');
          p.creat = p.modificat = Date.now();
          this.app.incarcaProiect(p);
          dlg.inchide();
          M.dialog.notifica('Exemplu deschis: ' + ex.nume + '. Apasă „Pornește”.', 3200);
        });
        grila.append(b);
      }
    }
    textLegaturi() {
      const p = this.app.proiect;
      const retea = M.retea.construieste(p);
      const linii = [];
      const vazute = new Set();
      for (let n = 0; n < retea.n; n++) {
        const reali = retea.piniReali(n);
        if (reali.length < 2) continue;
        const nume = reali.map(i => { const pi = retea.pinInfo[i]; return pi.comp.eticheta + '.' + (pi.pin.eticheta || pi.pin.id); });
        const cheie = nume.slice().sort().join('|');
        if (vazute.has(cheie)) continue;
        vazute.add(cheie);
        linii.push('• ' + nume.join('  ↔  '));
      }
      return linii;
    }
    textPiese() {
      const p = this.app.proiect;
      const grup = new Map();
      for (const c of p.componente) {
        const def = M.componente.def(c.tip);
        let n = def.nume;
        if (def.etichetaValoare) n += ' ' + def.etichetaValoare(M.componente.prop(c));
        else if (c.prop && c.prop.culoare && def.prop.find(x => x.cheie === 'culoare')) n += ' (' + def.prop.find(x => x.cheie === 'culoare').optiuni.find(o => o[0] === c.prop.culoare)[1].toLowerCase() + ')';
        if (!grup.has(n)) grup.set(n, []);
        grup.get(n).push(c.eticheta);
      }
      return [...grup].map(([n, e]) => '• ' + e.length + ' × ' + n + '  (' + e.join(', ') + ')');
    }
    arataListaPiese() {
      const c = el('div');
      c.append(el('h3', { style: { margin: '0', fontSize: '14px' }, text: 'Piese' }), el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '12.5px', margin: 0 }, text: this.textPiese().join('\n') || '—' }));
      c.append(el('h3', { style: { margin: '8px 0 0', fontSize: '14px' }, text: 'Legături' }), el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '12.5px', margin: 0 }, text: this.textLegaturi().join('\n') || '—' }));
      M.dialog.deschide({ titlu: 'Piese și legături', continut: c, butoane: [{ text: 'Copiază lista', actiune: async () => { await M.u.copiaza('PIESE\n' + this.textPiese().join('\n') + '\n\nLEGĂTURI\n' + this.textLegaturi().join('\n')); M.dialog.notifica('Listă copiată.'); return false; } }, { text: 'Închide', clasa: 'principal' }] });
    }
    fisiereArhiva() {
      const p = this.app.proiect;
      const nume = M.stocare.numeFisier(p.nume);
      const placa = this.app.infoPlaca() || 'ESP32 Dev Module';
      const citeste = [
        p.nume, '='.repeat(Math.max(4, p.nume.length)), '',
        'Proiect creat în Meșter.', '',
        'Cum îl urci pe placă:',
        '1. Deschide ' + nume + '/' + nume + '.ino în Arduino IDE.',
        '2. Alege placa: Unelte → Placă → „' + placa + '”.',
        '3. Instalează bibliotecile din lista de mai jos (Unelte → Gestionează biblioteci).',
        '4. Leagă piesele ca în lista de legături, apoi apasă Încarcă.', '',
        'Biblioteci folosite:', ...(M.generatorCod ? M.generatorCod.biblioteci(p.cod) : []).map(b => '• ' + b), '',
        'PIESE', ...this.textPiese(), '',
        'LEGĂTURI', ...this.textLegaturi(), ''
      ].join('\r\n');
      return [
        { nume: nume + '/' + nume + '.ino', date: p.cod.replace(/\r?\n/g, '\r\n') },
        { nume: nume + '/documentatie/CITESTE.txt', date: citeste },
        { nume: nume + '/schema/' + nume + '.mester.json', date: JSON.stringify(p, null, 1) }
      ];
    }
    async exportaZip() {
      const p = this.app.proiect;
      const nume = M.stocare.numeFisier(p.nume);
      const blob = M.stocare.zip(this.fisiereArhiva());
      const r = await M.stocare.descarca(nume + '.zip', blob);
      if (r === 'salvat') M.dialog.notifica('Arhiva ' + nume + '.zip a fost salvată.');
      else if (r === 'indisponibil') this.fallbackText('Descărcarea nu e disponibilă aici', 'Copiază codul de mai jos în Arduino IDE (fișier nou, apoi lipește).', p.cod);
    }
    async exportaJson() {
      const p = this.app.proiect;
      const r = await M.stocare.descarca(M.stocare.numeFisier(p.nume) + '.mester.json', JSON.stringify(p, null, 1));
      if (r === 'salvat') M.dialog.notifica('Proiect salvat ca fișier .json.');
      else if (r === 'indisponibil') this.fallbackText('Descărcarea nu e disponibilă aici', 'Copiază textul de mai jos și păstrează-l; îl poți lipi înapoi cu „Deschide un proiect”.', JSON.stringify(p));
    }
    fallbackText(titlu, info, text) {
      const ta = el('textarea', { class: 'camp', readonly: true });
      ta.value = text;
      M.dialog.deschide({ titlu, continut: el('div', {}, el('p', { text: info }), ta), butoane: [{ text: 'Copiază', clasa: 'principal', actiune: async () => { const ok = await M.u.copiaza(text); M.dialog.notifica(ok ? 'Copiat.' : 'Selectează textul și copiază-l.'); return false; } }, { text: 'Închide' }] });
    }
    importa() {
      const inp = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      const ta = el('textarea', { class: 'camp', placeholder: 'sau lipește aici textul unui proiect (.json)' });
      const deschide = (text) => {
        try {
          const p = M.proiect.normalizeaza(JSON.parse(text));
          if (!p.componente) throw new Error('fără componente');
          if (M.stocare.incarcaLocal(p.id)) p.id = M.u.id('p');
          p.modificat = Date.now();
          this.app.incarcaProiect(p);
          M.dialog.notifica('Proiect deschis: ' + p.nume);
          return true;
        } catch (e) { M.dialog.notifica('Fișierul nu pare un proiect Meșter valid.'); return false; }
      };
      const dlg = M.dialog.deschide({
        titlu: 'Deschide un proiect',
        continut: el('div', {}, el('p', { text: 'Alege un fișier .json salvat din Meșter.' }), el('button', { class: 'btn', html: M.icon('incarca') + 'Alege fișierul…', on: { click: () => inp.click() } }), inp, ta),
        butoane: [{ text: 'Renunță' }, { text: 'Deschide textul lipit', clasa: 'principal', actiune: () => deschide(ta.value) }]
      });
      inp.addEventListener('change', () => {
        const f = inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { if (deschide(r.result)) dlg.inchide(); };
        r.readAsText(f);
      });
    }
  };
})(window.M = window.M || {});
