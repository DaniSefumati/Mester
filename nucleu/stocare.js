/* Meșter — salvarea proiectelor: local (în browser) și în cont (sincronizat între telefon și calculator),
   plus exportul ca arhivă .zip (schiță Arduino organizată pe foldere) și .json. */
(function (M) {
  'use strict';
  const mem = M.u.memorie;

  const stocare = {
    nor: null,        // namespace db
    uid: null,
    descarcari: null, // namespace downloads
    norDisponibil: false,
    ultimaScriereNor: 0,

    // ---------- local ----------
    listaLocala() { return mem.citeste('index', []); },
    salveazaLocal(p) {
      const idx = this.listaLocala().filter(x => x.id !== p.id);
      idx.unshift({ id: p.id, nume: p.nume, modificat: p.modificat, componente: p.componente.length });
      const ok = mem.scrie('proiect.' + p.id, p);
      mem.scrie('index', idx.slice(0, 200));
      mem.scrie('curent', p.id);
      return ok;
    },
    incarcaLocal(id) { return mem.citeste('proiect.' + id, null); },
    stergeLocal(id) {
      mem.sterge('proiect.' + id);
      mem.scrie('index', this.listaLocala().filter(x => x.id !== id));
    },
    curentLocal() { const id = mem.citeste('curent', null); return id ? this.incarcaLocal(id) : null; },

    // ---------- în cont (capabilitatea db) ----------
    async initNor() {
      if (!window.claude || typeof window.claude.use !== 'function') return false;
      try {
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        if (!db || !user) return false;
        const uid = await user.id();
        if (!uid) return false;
        this.nor = db; this.uid = uid; this.norDisponibil = true;
        M.bus.emit('nor', true);
        return true;
      } catch (e) { return false; }
    },
    colectie() { return this.nor.collection('data/users/' + this.uid); },
    async listaNor() {
      if (!this.norDisponibil) return [];
      try {
        const snap = await this.colectie().get();
        return snap.docs.filter(d => d.exists).map(d => { const x = d.data(); return { id: d.id, nume: x.nume, modificat: x.modificat, componente: x.nrComponente || 0 }; });
      } catch (e) { return []; }
    },
    async incarcaNor(id) {
      if (!this.norDisponibil) return null;
      try { const d = await this.colectie().doc(id).get(); return d.exists ? JSON.parse(JSON.stringify(d.data().proiect)) : null; } catch (e) { return null; }
    },
    async salveazaNor(p) {
      if (!this.norDisponibil) return false;
      if (this.inScriere) { this.inAsteptare = p; return false; }
      this.inScriere = true;
      try {
        const corp = { nume: p.nume, modificat: p.modificat, nrComponente: p.componente.length, proiect: JSON.parse(JSON.stringify(p)) };
        const marime = JSON.stringify(corp).length;
        if (marime > 250000) { M.bus.emit('nor-eroare', 'Proiectul e prea mare pentru salvarea în cont (' + Math.round(marime / 1024) + ' KB). Rămâne salvat local.'); return false; }
        await this.colectie().doc(p.id).set(corp);
        this.ultimaScriereNor = Date.now();
        M.bus.emit('nor-salvat', p.id);
        return true;
      } catch (e) {
        M.bus.emit('nor-eroare', e && e.code === 'quota_exceeded' ? 'Spațiul din cont e plin — șterge proiecte vechi.' : 'Nu am putut salva în cont acum; proiectul e salvat local.');
        return false;
      } finally {
        this.inScriere = false;
        if (this.inAsteptare) { const q = this.inAsteptare; this.inAsteptare = null; this.salveazaNor(q); }
      }
    },
    async stergeNor(id) { if (!this.norDisponibil) return; try { await this.colectie().doc(id).delete(); } catch (e) { /* nimic */ } },

    // ---------- descărcări ----------
    async initDescarcari() {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      try { this.descarcari = await window.claude.use('downloads'); } catch (e) { this.descarcari = null; }
    },
    async descarca(nume, date) {
      if (this.descarcari) {
        try { await this.descarcari.save({ filename: nume, data: date }); return 'salvat'; }
        catch (e) { if (e && e.code === 'declined') return 'refuzat'; }
        return 'indisponibil';
      }
      // în afara lui Claude (de ex. pe site-ul de pe GitHub): descărcare obișnuită din browser
      if (window.claude && typeof window.claude.use === 'function') return 'indisponibil';
      try {
        const blob = date instanceof Blob ? date : new Blob([date], { type: /\.json$/i.test(nume) ? 'application/json' : 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nume; a.style.display = 'none';
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return 'salvat';
      } catch (e) { return 'indisponibil'; }
    },

    // ---------- arhivă ZIP (fără compresie) ----------
    zip(fisiere) {
      const enc = new TextEncoder();
      const parti = [], central = [];
      let offset = 0;
      const crcT = crcTabel();
      const acum = new Date();
      const timpDos = ((acum.getHours() << 11) | (acum.getMinutes() << 5) | (acum.getSeconds() >> 1)) & 0xFFFF;
      const dataDos = (((acum.getFullYear() - 1980) << 9) | ((acum.getMonth() + 1) << 5) | acum.getDate()) & 0xFFFF;
      for (const f of fisiere) {
        const nume = enc.encode(f.nume);
        const date = typeof f.date === 'string' ? enc.encode(f.date) : f.date;
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < date.length; i++) crc = crcT[(crc ^ date[i]) & 0xFF] ^ (crc >>> 8);
        crc = (crc ^ 0xFFFFFFFF) >>> 0;
        const loc = new DataView(new ArrayBuffer(30));
        loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
        loc.setUint16(10, timpDos, true); loc.setUint16(12, dataDos, true); loc.setUint32(14, crc, true);
        loc.setUint32(18, date.length, true); loc.setUint32(22, date.length, true); loc.setUint16(26, nume.length, true); loc.setUint16(28, 0, true);
        parti.push(new Uint8Array(loc.buffer), nume, date);
        const cen = new DataView(new ArrayBuffer(46));
        cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
        cen.setUint16(12, timpDos, true); cen.setUint16(14, dataDos, true); cen.setUint32(16, crc, true); cen.setUint32(20, date.length, true); cen.setUint32(24, date.length, true);
        cen.setUint16(28, nume.length, true); cen.setUint32(42, offset, true);
        central.push(new Uint8Array(cen.buffer), nume);
        offset += 30 + nume.length + date.length;
      }
      let lungCentral = 0; for (const c of central) lungCentral += c.length;
      const sf = new DataView(new ArrayBuffer(22));
      sf.setUint32(0, 0x06054b50, true); sf.setUint16(8, fisiere.length, true); sf.setUint16(10, fisiere.length, true);
      sf.setUint32(12, lungCentral, true); sf.setUint32(16, offset, true);
      return new Blob([...parti, ...central, new Uint8Array(sf.buffer)], { type: 'application/zip' });
    },
    numeFisier(nume) {
      const s = String(nume || 'proiect').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      return (/^[0-9]/.test(s) ? 'p_' + s : s) || 'proiect';
    }
  };
  function crcTabel() {
    if (crcTabel.t) return crcTabel.t;
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return (crcTabel.t = t);
  }

  M.stocare = stocare;
})(window.M = window.M || {});
