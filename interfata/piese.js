/* Meșter — biblioteca de piese: căutare, categorii, previzualizări; atinge sau trage pe planșă. */
(function (M) {
  'use strict';
  const { $, el, esc } = M.u;

  function normal(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function previzualizare(def) {
    const p = M.componente.propImplicite(def);
    const b = def.cutie(p, {});
    let markup = '';
    try { markup = def.desen.call(def, p, {}); } catch (e) { markup = ''; }
    markup = markup.replace(/(\s)(fill|stroke)="(var\([^"]+\))"/g, '$1style="$2:$3"');
    if (M.aplicatie && M.aplicatie.spatiu) M.aplicatie.spatiu.asiguraGradiente(markup);
    const m = 4;
    return `<svg viewBox="${b.x - m} ${b.y - m} ${b.w + 2 * m} ${b.h + 2 * m}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${markup}</svg>`;
  }

  M.Piese = class {
    constructor(app) {
      this.app = app;
      this.lista = $('#lista-piese');
      this.cautare = $('#cauta-piese');
      this.deschise = new Set(M.u.memorie.citeste('categoriiDeschise', ['placi', 'breadboard', 'lumini', 'pasive', 'intrari', 'senzori', 'afisaje']));
      $('#icon-cautare').innerHTML = M.icon('cauta');
      this.cautare.addEventListener('input', () => this.randeaza());
      this.randeaza();
    }
    randeaza() {
      const q = normal(this.cautare.value.trim());
      const toate = M.componente.toate();
      this.lista.innerHTML = '';
      let total = 0;
      for (const cat of M.componente.CATEGORII) {
        const defs = toate.filter(d => d.categorie === cat.id && (!q || normal(d.nume + ' ' + (d.cauta || '') + ' ' + d.tip).includes(q)));
        if (!defs.length) continue;
        total += defs.length;
        const det = el('details', { class: 'categorie-piese' });
        det.open = !!q || this.deschise.has(cat.id);
        det.addEventListener('toggle', () => {
          if (q) return;
          if (det.open) this.deschise.add(cat.id); else this.deschise.delete(cat.id);
          M.u.memorie.scrie('categoriiDeschise', [...this.deschise]);
        });
        det.append(el('summary', { html: M.icon('sageata') + '<span>' + esc(cat.nume) + '</span><span class="nr">' + defs.length + '</span>' }));
        const grila = el('div', { class: 'grila-piese' });
        for (const d of defs) {
          const b = el('button', { class: 'piesa', title: d.descriere || d.nume, draggable: true });
          b.innerHTML = '<span class="prev">' + previzualizare(d) + '</span><span class="nume">' + esc(d.nume) + '</span>';
          b.addEventListener('click', () => {
            this.app.spatiu.adauga(d.tip);
            this.app.inchidePiese();
            if (window.innerWidth <= 760) this.app.arataVedere('schema');
          });
          b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/mester-tip', d.tip); e.dataTransfer.effectAllowed = 'copy'; });
          grila.append(b);
        }
        det.append(grila);
        this.lista.append(det);
      }
      if (!total) this.lista.append(el('div', { class: 'fara-rezultate', text: 'Nicio piesă nu se potrivește cu „' + this.cautare.value + '”.' }));
    }
  };
})(window.M = window.M || {});
