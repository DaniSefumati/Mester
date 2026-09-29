/* Meșter — sunet: buzzer activ și pasiv, difuzoare, amplificatoarele PAM8403, LM386 și MAX98357A (I2S),
   playerul DFPlayer Mini și microfoanele MAX9814 (analogic, cu AGC) și INMP441 (I2S).
   Toate se aud în browser: tensiunea de pe bornele lor e urmărită în timp (vezi simulare/sunet.js),
   deci contează montajul — un difuzor pe un pin sună încet (pinul nu dă curent), un buzzer activ pe PWM
   bâzâie, un amplificator primește semnal prea mare de la DAC și distorsionează etc. */
(function (M) {
  'use strict';
  const D = M.desen;
  const fv = D.formatValoare;
  const tensiuneModul = (sim, inst, vcc, gnd) => M.tensiuneModul ? M.tensiuneModul(sim, inst, vcc, gnd) : 0;
  const ctl = (inst, k, implicit) => inst.control && inst.control[k] !== undefined ? +inst.control[k] : implicit;
  const SN = () => M.sunet;
  const antete = (pini, dy) => { let s = ''; for (const p of pini) { s += D.pinAntet(p.x, p.y); if (p.eticheta) s += D.text(p.x, p.y + (dy === undefined ? 5.5 : dy), p.eticheta, { m: 2.3, c: 'var(--text-2)' }); } return s; };
  const unde = (x, y, k) => `<g data-r="unde" opacity="0">` + [1, 2, 3].map(i => `<path d="M${x + 3 * i * k} ${y - 4 * i * k} q${3 * k} ${4 * i * k} 0 ${8 * i * k}" stroke="#4fb6ff" stroke-width="${0.9 * k}" fill="none" stroke-linecap="round" opacity="${1 - i * 0.22}"/>`).join('') + `</g>`;
  const arataUnde = (g, disp) => { const u = g.querySelector('[data-r="unde"]'); if (u) u.setAttribute('opacity', disp && disp.nivelSunet ? Math.min(1, 0.25 + disp.nivelSunet * 3).toFixed(2) : 0); };
  const hashId = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return (h % 1000) / 1000; };

  // ieșire de amplificator în punte (BTL): ambele borne stau la VCC/2, semnalul e între ele
  function iesiriPunte(ctx, sim, inst, pini, vccPin, gndPin) {
    const r = {};
    for (const p of pini) r['o' + p] = ctx.iesire(p, () => { const v = tensiuneModul(sim, inst, vccPin, gndPin); return v > 2.2 ? { v: v / 2, r: 0.3 } : null; });
    return r;
  }
  function verificaPunte(sim, inst, el, pini, numeAmp) {
    for (const p of pini) {
      const e = el['o' + p];
      if (e && Math.abs(e.i) > 0.25) {
        sim.problema('btl-' + inst.id, 'eroare', inst.eticheta + ': ieșirile ' + numeAmp + ' sunt în punte (BTL) — difuzorul se leagă între „+” și „−” ale aceluiași canal, niciodată la GND sau la alt canal. Acum prin ieșire trec ' + Math.round(Math.abs(e.i) * 1000) + ' mA și amplificatorul se încălzește sau se oprește.', { comp: inst.id });
        return true;
      }
    }
    return false;
  }

  // ---------- buzzer activ ----------
  const MODELE_BA = {
    simplu: { nume: 'Buzzer activ (2 pini)' },
    'modul-low': { nume: 'Modul buzzer activ, pornește pe LOW (tranzistor PNP)', modul: true, pnp: true },
    'modul-high': { nume: 'Modul buzzer activ, pornește pe HIGH (tranzistor NPN)', modul: true, pnp: false }
  };
  M.componente.defineste({
    tip: 'buzzer-activ', nume: 'Buzzer activ', categorie: 'sunet', eticheta: 'BZ',
    cauta: 'buzzer activ sonerie beep piuit alarma ky-012 generator',
    descriere: 'Are oscilatorul în el: piuie (~2,3 kHz) cât timp primește tensiune — digitalWrite(HIGH) e de ajuns. Nu poate cânta note: tone() pe el doar îl face să bâzâie. Are polaritate: piciorul lung (+) la semnal. Modulele cu 3 pini au tranzistor; cele cu PNP pornesc pe LOW.',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(MODELE_BA).map(k => [k, MODELE_BA[k].nume]), implicit: 'simplu' }],
    pini: (p) => (MODELE_BA[p.model] || MODELE_BA.simplu).modul
      ? [{ id: 'IO', x: 0, y: 0, eticheta: 'I/O', tip: 'intrare', descriere: 'Semnalul de comandă' }, { id: 'VCC', x: 10, y: 0, eticheta: 'VCC', tip: 'vcc', descriere: '3,3–5 V' }, { id: 'GND', x: 20, y: 0, eticheta: 'GND', tip: 'gnd' }]
      : [{ id: 'P', x: 0, y: 0, eticheta: '+', tip: 'intrare', descriere: 'Piciorul lung (+)' }, { id: 'N', x: 10, y: 0, eticheta: '−', tip: 'gnd', descriere: 'Piciorul scurt (−)' }],
    cutie: (p) => (MODELE_BA[p.model] || MODELE_BA.simplu).modul ? { x: -7, y: -44, w: 38, h: 47 } : { x: -10, y: -34, w: 30, h: 37 },
    desen(p) {
      const m = MODELE_BA[p.model] || MODELE_BA.simplu;
      let s = '';
      if (m.modul) {
        s += D.pcb(-6, -42, 36, 38, { culoare: '#1d5aa6', gauri: 2.4 });
        s += `<circle cx="10" cy="-26" r="11" fill="#17191c" stroke="#000" stroke-width="0.5"/><circle cx="10" cy="-26" r="9.5" fill="#22252a"/><circle cx="10" cy="-26" r="2.2" fill="#0b0c0e"/>`;
        s += D.text(10, -33, '+', { m: 3, c: '#9aa0a8' });
        s += D.cip(22, -12, 5, 4, { eticheta: '', culoare: '#111' }) + D.text(24.5, -15.5, m.pnp ? '8550' : '8050', { m: 1.6 });
        s += unde(22, -34, 0.8);
        s += antete(this.pini(p));
      } else {
        s += D.picior(0, 0, 1, -12) + D.picior(10, 0, 9, -12);
        s += `<circle cx="5" cy="-20" r="12" fill="#17191c" stroke="#000" stroke-width="0.5"/><circle cx="5" cy="-20" r="10.5" fill="#22252a"/><circle cx="5" cy="-20" r="2.4" fill="#0b0c0e"/>`;
        s += `<rect x="-2" y="-26.5" width="14" height="3" rx="0.6" fill="#f4f4ef" opacity="0.9"/>` + D.text(5, -25, '+ REMOVE', { m: 1.7, c: '#333', g: 700 });
        s += unde(17, -24, 0.8);
      }
      return s;
    },
    electric(ctx, inst) {
      const m = MODELE_BA[inst.prop.model] || MODELE_BA.simplu;
      const el = {};
      if (!m.modul) {
        const k = ctx.nodNou();
        el.d = ctx.D('P', k, '1n4148'); el.r = ctx.R(k, 'N', 150);
        el.sonda = [ctx.net('P'), ctx.net('N')];
      } else if (m.pnp) {
        const nb = ctx.nodNou(), nc = ctx.nodNou(), nk = ctx.nodNou();
        el.rb = ctx.R('IO', nb, 1000);
        el.q = ctx.Q(nc, nb, 'VCC', true, 120);
        el.d = ctx.D(nc, nk, '1n4148'); el.r = ctx.R(nk, 'GND', 150);
        el.sonda = [nc, ctx.net('GND')];
      } else {
        const nb = ctx.nodNou(), nc = ctx.nodNou(), nk = ctx.nodNou();
        el.rb = ctx.R('IO', nb, 1000); el.rp = ctx.R(nb, 'GND', 10000);
        el.d = ctx.D('VCC', nk, '1n4148'); el.r = ctx.R(nk, nc, 150);
        el.q = ctx.Q(nc, nb, 'GND', false, 120);
        el.sonda = [ctx.net('VCC'), nc];
      }
      return el;
    },
    dispozitiv(inst, sim, el) {
      const m = MODELE_BA[inst.prop.model] || MODELE_BA.simplu;
      const f0 = 2300 + (hashId(inst.id) - 0.5) * 260;
      return {
        familie: 'buzzer', faza: 0, anv: 0, v: 0,
        start() { this.intrare = new (SN().Intrare)(sim, el.sonda[0], el.sonda[1], this); },
        sunet(t0, t1, n, rata) {
          if (!this.intrare) return null;
          const v = this.intrare.randeaza(t0, t1, n);
          let activ = false, suma = 0, invers = 0;
          const pas = 2 * Math.PI * f0 / rata, k = 1 - Math.exp(-1 / (0.0007 * rata));
          for (let i = 0; i < n; i++) {
            const x = v[i]; suma += x; if (x < -1.5) invers++;
            const tinta = Math.max(0, Math.min(1, (x - 1.9) / 2.6));
            this.anv += (tinta - this.anv) * k;
            if (this.anv > 1e-3) activ = true;
            this.faza += pas; if (this.faza > 6.283185307) this.faza -= 6.283185307;
            v[i] = this.anv * (0.72 * Math.sin(this.faza) + 0.28 * Math.sin(3 * this.faza)) * 0.42;
          }
          this.v = suma / n;
          if (!m.modul && invers > n / 2) sim.problema('bz-invers-' + inst.id, 'avertisment', inst.eticheta + ' e montat invers: buzzerul activ are polaritate (piciorul lung „+” la semnal, cel scurt la GND). Invers nu scoate niciun sunet.', { comp: inst.id });
          if (m.modul && m.pnp && activ) {
            // un modul PNP alimentat la 5 V nu se oprește cu HIGH-ul de 3,3 V al ESP32
            const net = sim.netPin(inst, 'IO');
            const g = sim.gpioLaNet(net).map(x => sim.stariPin.get(x)).find(st => st && st.mod === 'OUTPUT');
            if (g && g.nivel && !g.pwm && tensiuneModul(sim, inst) > 4) sim.problema('bz-pnp-' + inst.id, 'avertisment', inst.eticheta + ' sună deși I/O e pe HIGH: modulul pornește pe LOW și e alimentat la ' + M.fmtV(tensiuneModul(sim, inst)) + ', iar 3,3 V nu închide tranzistorul PNP. Alimentează modulul din 3,3 V sau folosește unul care pornește pe HIGH.', { comp: inst.id });
          }
          return activ ? v : null;
        }
      };
    },
    vizual(g, inst, sim, el, disp) { arataUnde(g, disp); },
    masura(el, inst, sim, disp) { return disp ? [['Tensiune pe buzzer', M.fmtV(disp.v || 0)], ['Sunet', disp.nivelSunet > 0.01 ? 'piuie (~' + Math.round((disp.frecventaSunet || 2300) / 10) * 10 + ' Hz)' : 'liniște']] : []; }
  });

  // ---------- buzzer pasiv ----------
  const MODELE_BP = {
    magnetic: { nume: 'Buzzer pasiv magnetic (16 Ω)', R: 16, f0: 2700, q: 1.6, sens: 0.6 },
    piezo: { nume: 'Disc piezo (traductor)', R: 1e6, f0: 4000, q: 2.4, sens: 0.32 }
  };
  M.componente.defineste({
    tip: 'buzzer-pasiv', nume: 'Buzzer pasiv / piezo', categorie: 'sunet', eticheta: 'BZ',
    cauta: 'buzzer pasiv piezo difuzor tone note melodie ky-006 sonerie',
    descriere: 'N-are oscilator: scoate exact frecvența pe care o primește, deci cântă note cu tone(pin, frecvență). Pe HIGH continuu doar face „clic”. Cel magnetic are 16 Ω și cere mult curent — pe un pin sună, dar depășește limita pinului; cu un tranzistor NPN sună tare și sigur. Cel mai tare sună în jur de 2,7 kHz.',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(MODELE_BP).map(k => [k, MODELE_BP[k].nume]), implicit: 'magnetic' }],
    pini: () => [{ id: 'P', x: 0, y: 0, eticheta: '+', tip: 'intrare' }, { id: 'N', x: 10, y: 0, eticheta: '−', tip: 'gnd' }],
    cutie: (p) => p.model === 'piezo' ? { x: -12, y: -36, w: 34, h: 39 } : { x: -10, y: -34, w: 30, h: 37 },
    desen(p) {
      let s = '';
      if (p.model === 'piezo') {
        s += `<path d="M0 0 C0 -6 2 -10 3 -14" stroke="#d32f2f" stroke-width="1" fill="none"/><path d="M10 0 C10 -6 8 -10 7 -14" stroke="#222" stroke-width="1" fill="none"/>`;
        s += `<circle cx="5" cy="-22" r="15" fill="#c9a64b" stroke="#8a6b3a" stroke-width="0.6"/><circle cx="5" cy="-22" r="10" fill="#e8e6df" stroke="#b9b6ad" stroke-width="0.5"/><circle cx="3" cy="-17" r="1.3" fill="#999"/><circle cx="7" cy="-17" r="1.3" fill="#999"/>`;
        s += unde(21, -26, 0.8);
      } else {
        s += D.picior(0, 0, 1, -12) + D.picior(10, 0, 9, -12);
        s += `<circle cx="5" cy="-20" r="12" fill="#17191c" stroke="#000" stroke-width="0.5"/><circle cx="5" cy="-20" r="10.5" fill="#2a2d33"/><circle cx="5" cy="-20" r="2.4" fill="#0b0c0e"/>`;
        s += `<rect x="-3" y="-8.6" width="16" height="1.2" fill="#1f5b2a"/>` + D.text(5, -12.5, 'PASIV', { m: 1.8, c: '#9aa0a8' });
        s += unde(17, -24, 0.8);
      }
      return s;
    },
    electric(ctx, inst) {
      const m = MODELE_BP[inst.prop.model] || MODELE_BP.magnetic;
      return { bobina: ctx.R('P', 'N', m.R), sonda: [ctx.net('P'), ctx.net('N')] };
    },
    dispozitiv(inst, sim, el) {
      const m = MODELE_BP[inst.prop.model] || MODELE_BP.magnetic;
      return {
        familie: 'buzzer', v: 0,
        start() { this.intrare = new (SN().Intrare)(sim, el.sonda[0], el.sonda[1], this); this.ts = new (SN().TreceSus)(90); this.rez = new (SN().Rezonator)(m.f0, m.q); },
        sunet(t0, t1, n, rata) {
          if (!this.intrare) return null;
          const v = this.intrare.randeaza(t0, t1, n);
          let s = 0; for (let i = 0; i < n; i++) s += v[i];
          this.v = s / n;
          this.ts.proceseaza(v, rata);
          const r = this.rez.proceseaza(v.slice(), rata);
          let max = 0;
          for (let i = 0; i < n; i++) { v[i] = (v[i] * 0.3 + r[i] * 0.9) * m.sens / 3.3; const a = Math.abs(v[i]); if (a > max) max = a; }
          return max > 1e-4 ? v : null;
        }
      };
    },
    vizual(g, inst, sim, el, disp) { arataUnde(g, disp); },
    masura(el, inst, sim, disp) { return disp ? [['Frecvență', disp.nivelSunet > 0.005 ? Math.round(disp.frecventaSunet || 0) + ' Hz' : '—'], ['Curent', fv(Math.abs(el.bobina ? el.bobina.i : 0), 'A')]] : []; }
  });

  // ---------- difuzor ----------
  const MODELE_DF = {
    '8-05': { nume: 'Difuzor 8 Ω 0,5 W (Ø 40 mm)', R: 8, P: 0.5, fc: 220, d: 40 },
    '8-2': { nume: 'Difuzor 8 Ω 2 W (Ø 57 mm)', R: 8, P: 2, fc: 140, d: 57 },
    '4-3': { nume: 'Difuzor 4 Ω 3 W (Ø 77 mm)', R: 4, P: 3, fc: 90, d: 77 }
  };
  M.componente.defineste({
    tip: 'difuzor', nume: 'Difuzor', categorie: 'sunet', eticheta: 'SPK',
    cauta: 'difuzor speaker boxa 8 ohm 4 ohm audio sunet',
    descriere: 'Are doar 4–8 Ω, deci legat direct la un pin sună foarte încet și suprasolicită pinul. Pune-l după un amplificator (PAM8403, LM386, MAX98357A) sau după un tranzistor. Nu-i da curent continuu: bobina se încălzește degeaba.',
    prop: [{ cheie: 'model', eticheta: 'Model', tip: 'alegere', optiuni: Object.keys(MODELE_DF).map(k => [k, MODELE_DF[k].nume]), implicit: '8-05' }],
    pini: () => [{ id: 'P', x: 0, y: 0, eticheta: '+', tip: 'intrare' }, { id: 'N', x: 10, y: 0, eticheta: '−', tip: 'gnd' }],
    cutie: (p) => { const r = (MODELE_DF[p.model] || MODELE_DF['8-05']).d * 0.42; return { x: 5 - r - 1, y: -14 - 2 * r - 1, w: 2 * r + 2, h: 2 * r + 17 }; },
    desen(p) {
      const m = MODELE_DF[p.model] || MODELE_DF['8-05'];
      const r = m.d * 0.42, cy = -14 - r;
      let s = `<path d="M0 0 C0 -6 2 -10 3 -14" stroke="#d32f2f" stroke-width="1" fill="none"/><path d="M10 0 C10 -6 8 -10 7 -14" stroke="#222" stroke-width="1" fill="none"/>`;
      s += `<circle cx="5" cy="${cy}" r="${r}" fill="#2a2d33" stroke="#111" stroke-width="0.8"/>`;
      s += `<circle cx="5" cy="${cy}" r="${r * 0.9}" fill="#3a3d44"/>`;
      s += `<g data-r="con"><circle cx="5" cy="${cy}" r="${r * 0.78}" fill="#1f2125"/>`;
      for (let i = 1; i <= 3; i++) s += `<circle cx="5" cy="${cy}" r="${r * 0.78 * i / 4}" fill="none" stroke="#2c2f35" stroke-width="0.5"/>`;
      s += `<circle cx="5" cy="${cy}" r="${r * 0.26}" fill="#15171a" stroke="#3a3d44" stroke-width="0.5"/></g>`;
      s += D.text(5, cy + r * 0.55, m.R + ' Ω ' + String(m.P).replace('.', ',') + ' W', { m: Math.max(2, r * 0.13), c: '#8a9099' });
      return s;
    },
    electric(ctx, inst) {
      const m = MODELE_DF[inst.prop.model] || MODELE_DF['8-05'];
      return { bobina: ctx.R('P', 'N', m.R), sonda: [ctx.net('P'), ctx.net('N')] };
    },
    dispozitiv(inst, sim, el) {
      const m = MODELE_DF[inst.prop.model] || MODELE_DF['8-05'];
      const fs = 1 / Math.sqrt(2 * m.R * m.P);
      return {
        familie: 'difuzor', putere: 0, cald: 0, pDC: 0,
        start() { this.intrare = new (SN().Intrare)(sim, el.sonda[0], el.sonda[1], this); this.ts = new (SN().TreceSus)(m.fc); this.tj = new (SN().TreceJos)(7500); },
        sunet(t0, t1, n, rata) {
          if (!this.intrare) return null;
          const v = this.intrare.randeaza(t0, t1, n);
          let s = 0, s2 = 0;
          for (let i = 0; i < n; i++) { s += v[i]; s2 += v[i] * v[i]; }
          const medie = s / n;
          this.putere = s2 / n / m.R; this.pDC = medie * medie / m.R;
          const dt = (t1 - t0) / 1e6;
          this.cald = Math.max(0, this.cald + (this.putere - m.P * 1.3) * dt);
          if (this.cald > m.P * 1.5) sim.problema('spk-cald-' + inst.id, 'avertisment', inst.eticheta + ' primește ' + fv(this.putere, 'W') + ', peste cei ' + String(m.P).replace('.', ',') + ' W suportați' + (this.pDC > this.putere * 0.4 ? ' — mare parte e curent continuu, care doar încălzește bobina. Pune un condensator de 100–470 µF în serie cu difuzorul' : '') + '. În realitate bobina se poate arde.', { comp: inst.id });
          this.ts.proceseaza(v, rata); this.tj.proceseaza(v, rata);
          let max = 0;
          for (let i = 0; i < n; i++) { v[i] = SN().saturatie(v[i] * fs * 0.95, 1.1); const a = Math.abs(v[i]); if (a > max) max = a; }
          return max > 1e-4 ? v : null;
        }
      };
    },
    vizual(g, inst, sim, el, disp) {
      const c = g.querySelector('[data-r="con"]');
      if (!c) return;
      const m = MODELE_DF[inst.prop.model] || MODELE_DF['8-05'];
      const cy = -14 - m.d * 0.42;
      const k = 1 + Math.min(0.12, (disp && disp.nivelSunet || 0) * 0.25) * (Math.random() * 0.6 + 0.4);
      c.setAttribute('transform', k > 1.001 ? `translate(5 ${cy}) scale(${k.toFixed(3)}) translate(-5 ${-cy})` : '');
    },
    masura(el, inst, sim, disp) { return disp ? [['Putere', fv(disp.putere || 0, 'W')], ['Curent', fv(Math.abs(el.bobina ? el.bobina.i : 0), 'A')]] : []; }
  });

  // ---------- amplificator PAM8403 (2 × 3 W, clasa D) ----------
  M.componente.defineste({
    tip: 'pam8403', nume: 'Amplificator PAM8403 (2×3 W)', categorie: 'sunet', eticheta: 'AMP',
    cauta: 'pam8403 amplificator audio clasa d stereo 3w difuzor volum',
    descriere: 'Amplificator stereo de 5 V cu amplificare fixă de ~24 dB: la intrare vrea semnal mic (sub ~0,3 V vârf) — DAC-ul ESP32 (0–3,3 V) îl saturează și sunetul se distorsionează. Ieșirile sunt în punte (BTL): fiecare difuzor între L+ și L− (sau R+ și R−), niciodată la GND.',
    prop: [{ cheie: 'volum', eticheta: 'Potențiometru de volum', tip: 'alegere', optiuni: [['nu', 'Fără (modulul mic)'], ['da', 'Cu potențiometru']], implicit: 'nu' }],
    control: [{ cheie: 'volum', eticheta: 'Volum (potențiometrul)', min: 0, max: 100, pas: 1, unitate: '%', implicit: 60 }],
    alimentare: { min: 2.5, max: 5.5 },
    pini: () => [
      { id: 'L', x: 0, y: 0, eticheta: 'L', tip: 'intrare', descriere: 'Intrare canal stâng' }, { id: 'G', x: 10, y: 0, eticheta: 'G', tip: 'gnd', descriere: 'Masa intrării (legată intern cu GND)', legatCu: 'GND' }, { id: 'R', x: 20, y: 0, eticheta: 'R', tip: 'intrare', descriere: 'Intrare canal drept' },
      { id: 'VCC', x: 40, y: 0, eticheta: '5V', tip: 'vcc', descriere: '2,5–5,5 V' }, { id: 'GND', x: 50, y: 0, eticheta: 'GND', tip: 'gnd' },
      { id: 'LP', x: 0, y: -40, eticheta: 'L+', tip: 'iesire' }, { id: 'LN', x: 10, y: -40, eticheta: 'L−', tip: 'iesire' }, { id: 'RN', x: 40, y: -40, eticheta: 'R−', tip: 'iesire' }, { id: 'RP', x: 50, y: -40, eticheta: 'R+', tip: 'iesire' }
    ],
    cutie: () => ({ x: -6, y: -46, w: 62, h: 52 }),
    desen(p) {
      let s = D.pcb(-5, -45, 60, 50, { culoare: '#1a6b3a', gauri: false });
      s += D.cip(17, -24, 16, 9, { eticheta: 'PAM8403', m: 2, picioare: 8, pasPicioare: 1.8 });
      s += `<rect x="36" y="-28" width="8" height="5" rx="0.6" fill="#8b6c3a"/><rect x="6" y="-28" width="8" height="5" rx="0.6" fill="#8b6c3a"/>`;
      if (p.volum === 'da') s += `<g><circle cx="25" cy="-9" r="5" fill="#2a2d33"/><circle cx="25" cy="-9" r="3.2" fill="#6a6f78"/><rect x="24.4" y="-12.4" width="1.2" height="3.4" fill="#ddd"/></g>`;
      s += `<circle cx="47" cy="-12" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="47" cy="-12" r="1.2" fill="#ff3b2f" opacity="0.15" data-r="led"/>`;
      for (const pin of this.pini(p)) {
        if (pin.y === 0) { s += D.pinAntet(pin.x, pin.y); s += D.text(pin.x, 5.2, pin.eticheta, { m: 2.2, c: 'var(--text-2)' }); }
        else { s += D.pad(pin.x, pin.y, { r: 2.3 }); s += D.text(pin.x, pin.y + 5.5, pin.eticheta, { m: 2.3 }); }
      }
      return s;
    },
    electric(ctx, inst, sim) {
      const r = { consum: ctx.R('VCC', 'GND', 420), inL: ctx.R('L', 'G', 20000), inR: ctx.R('R', 'G', 20000), g: ctx.R('G', 'GND', 0.05) };
      return Object.assign(r, iesiriPunte(ctx, sim, inst, ['LP', 'LN', 'RP', 'RN'], 'VCC', 'GND'));
    },
    dispozitiv(inst, sim, el) {
      const CASTIG = Math.pow(10, 24 / 20);
      return {
        familie: 'amplificator', iesiriAudio: ['LP', 'LN', 'RP', 'RN'], vcc: 0, satur: 0,
        start() {
          const I = SN().Intrare;
          this.inL = new I(sim, sim.netPin(inst, 'L'), sim.netPin(inst, 'G'), this);
          this.inR = new I(sim, sim.netPin(inst, 'R'), sim.netPin(inst, 'G'), this);
          this.tsL = new (SN().TreceSus)(17); this.tsR = new (SN().TreceSus)(17);
        },
        randeaza(t0, t1, n, rata) {
          if (this.cache && this.cache.t0 === t0 && this.cache.t1 === t1 && this.cache.n === n) return this.cache;
          const vcc = tensiuneModul(sim, inst);
          this.vcc = vcc;
          const L = new Float32Array(n), R = new Float32Array(n);
          this.cache = { t0, t1, n, L, R };
          if (!this.inL || vcc < 2.4) return this.cache;
          const vol = inst.prop.volum === 'da' ? Math.pow(ctl(inst, 'volum', 60) / 100, 2) : 1;
          const lim = Math.max(0.2, vcc - 0.4);
          let varf = 0;
          for (const [intr, ts, out] of [[this.inL, this.tsL, L], [this.inR, this.tsR, R]]) {
            const v = ts.proceseaza(intr.randeaza(t0, t1, n), rata || SN().RATA);
            for (let i = 0; i < n; i++) { const x = v[i] * vol * CASTIG; if (Math.abs(x) > varf) varf = Math.abs(x); out[i] = SN().saturatie(x, lim); }
          }
          if (varf > lim * 1.6) {
            this.satur++;
            if (this.satur > 8) sim.problema('pam-satur-' + inst.id, 'info', inst.eticheta + ' e suprasaturat: semnalul de la intrare ar cere ' + M.fmtV(varf) + ' la ieșire, dar amplificatorul dă cel mult ~' + M.fmtV(lim) + ', așa că sunetul se distorsionează. Micșorează semnalul (divizor 10 kΩ + 1 kΩ, sau volumul din cod / potențiometru).', { comp: inst.id });
          } else this.satur = 0;
          verificaPunte(sim, inst, el, ['LP', 'LN', 'RP', 'RN'], 'PAM8403');
          return this.cache;
        },
        semnalAudio(pin, t0, t1, n) {
          const c = this.randeaza(t0, t1, n);
          const x = pin[0] === 'L' ? c.L : c.R, semn = pin[1] === 'P' ? 0.5 : -0.5, b = this.vcc > 2.4 ? this.vcc / 2 : 0;
          const out = new Float32Array(n);
          for (let i = 0; i < n; i++) out[i] = b + semn * x[i];
          return out;
        }
      };
    },
    laControl(inst, el, sim) { },
    vizual(g, inst, sim) { const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('opacity', sim && tensiuneModul(sim, inst) > 2.4 ? 0.95 : 0.15); }
  });

  // ---------- amplificator LM386 ----------
  M.componente.defineste({
    tip: 'lm386', nume: 'Amplificator LM386 (mono)', categorie: 'sunet', eticheta: 'AMP',
    cauta: 'lm386 amplificator audio mono difuzor volum 20 200',
    descriere: 'Amplificator mono simplu (4–12 V) cu potențiometru de volum la intrare. Amplifică de 20 de ori (sau de 200 cu jumper-ul pus). Ieșirea are condensator de cuplaj: difuzorul se leagă între OUT și GND.',
    prop: [{ cheie: 'castig', eticheta: 'Amplificare', tip: 'alegere', optiuni: [['20', '×20 (fără jumper)'], ['200', '×200 (jumper pus)']], implicit: '20' }],
    control: [{ cheie: 'volum', eticheta: 'Volum (potențiometrul)', min: 0, max: 100, pas: 1, unitate: '%', implicit: 50 }],
    alimentare: { min: 4, max: 12 },
    pini: () => [
      { id: 'VCC', x: 0, y: 0, eticheta: 'VCC', tip: 'vcc', descriere: '4–12 V' }, { id: 'IN', x: 10, y: 0, eticheta: 'IN', tip: 'intrare' }, { id: 'GI', x: 20, y: 0, eticheta: 'GND', tip: 'gnd', legatCu: 'GND' }, { id: 'GND', x: 30, y: 0, eticheta: 'GND', tip: 'gnd' },
      { id: 'OUT', x: 0, y: -44, eticheta: 'OUT', tip: 'iesire' }, { id: 'OG', x: 10, y: -44, eticheta: 'GND', tip: 'gnd', legatCu: 'GND' }
    ],
    cutie: () => ({ x: -6, y: -50, w: 44, h: 56 }),
    desen(p) {
      let s = D.pcb(-5, -49, 42, 45, { culoare: '#1f5fa8', gauri: 2.3 });
      s += D.cip(14, -30, 12, 8, { eticheta: 'LM386', m: 2, picioare: 4, pasPicioare: 2.2 });
      s += `<circle cx="27" cy="-14" r="5.5" fill="#1f63c4"/><circle cx="27" cy="-14" r="3.6" fill="#f1f1ea"/><rect x="26.4" y="-17.6" width="1.2" height="3.6" fill="#666"/>`;
      s += `<circle cx="7" cy="-24" r="4" fill="#1d1f22"/><circle cx="7" cy="-24" r="3.4" fill="#2a2d33"/>` + D.text(7, -24, '220µ', { m: 1.4, c: '#9aa0a8' });
      if (p.castig === '200') s += `<rect x="29" y="-38" width="6" height="4" fill="#1d1f22"/>`;
      s += `<rect x="-6" y="-49" width="18" height="10" rx="1" fill="#2f7fd8"/>`;
      for (const pin of this.pini(p)) {
        if (pin.y === 0) { s += D.pinAntet(pin.x, pin.y); s += D.text(pin.x, 5.2, pin.eticheta, { m: 2.2, c: 'var(--text-2)' }); }
        else { s += D.pad(pin.x, pin.y, { r: 2.2 }); s += D.text(pin.x, pin.y + 5.8, pin.eticheta, { m: 2.1 }); }
      }
      return s;
    },
    electric(ctx, inst, sim) {
      return { consum: ctx.R('VCC', 'GND', 1200), intrare: ctx.R('IN', 'GI', 10000), g1: ctx.R('GI', 'GND', 0.05), g2: ctx.R('OG', 'GND', 0.05), out: ctx.iesire('OUT', () => tensiuneModul(sim, inst) > 3.5 ? { v: 0, r: 0.5 } : null) };
    },
    dispozitiv(inst, sim, el) {
      return {
        familie: 'amplificator', iesiriAudio: ['OUT'], satur: 0,
        start() { this.intr = new (SN().Intrare)(sim, sim.netPin(inst, 'IN'), sim.netPin(inst, 'GI'), this); this.ts = new (SN().TreceSus)(30); this.tsO = new (SN().TreceSus)(40); },
        semnalAudio(pin, t0, t1, n) {
          if (this.cache && this.cache.t0 === t0 && this.cache.t1 === t1 && this.cache.n === n) return this.cache.v.slice();
          const vcc = tensiuneModul(sim, inst);
          let v = new Float32Array(n);
          if (this.intr && vcc > 3.5) {
            v = this.ts.proceseaza(this.intr.randeaza(t0, t1, n), SN().RATA);
            const g = (inst.prop.castig === '200' ? 200 : 20) * Math.pow(ctl(inst, 'volum', 50) / 100, 2);
            const lim = Math.max(0.3, vcc / 2 - 0.9);
            let varf = 0;
            for (let i = 0; i < n; i++) { const x = v[i] * g; if (Math.abs(x) > varf) varf = Math.abs(x); v[i] = SN().saturatie(x, lim); }
            this.tsO.proceseaza(v, SN().RATA);
            if (varf > lim * 1.6) { if (++this.satur > 8) sim.problema('lm386-satur-' + inst.id, 'info', inst.eticheta + ' e suprasaturat (ieșirea ar trebui să urce la ' + M.fmtV(varf) + ', dar poate doar ~' + M.fmtV(lim) + '). Dă volumul mai jos din potențiometru.', { comp: inst.id }); } else this.satur = 0;
          }
          this.cache = { t0, t1, n, v: v.slice() };
          return v;
        }
      };
    },
    laControl() { }
  });

  // ---------- MAX98357A (amplificator I2S) ----------
  M.componente.defineste({
    tip: 'max98357', nume: 'Amplificator I2S MAX98357A', categorie: 'sunet', eticheta: 'AMP',
    cauta: 'max98357 max98357a i2s amplificator dac audio difuzor 3w',
    descriere: 'Primește sunetul digital pe I2S (BCLK, LRC, DIN) și are amplificator de 3 W: difuzorul direct pe + și −. GAIN liber = 9 dB (la GND 12 dB, la VIN 6 dB). SD liber = redă media canalelor (L+R)/2; la 3,3 V doar stângul; la GND e oprit.',
    prop: [],
    alimentare: { vcc: 'VIN', min: 2.5, max: 5.5 },
    pini: () => [
      { id: 'LRC', x: 0, y: 0, eticheta: 'LRC', tip: 'intrare', descriere: 'Selecție stânga/dreapta (WS)' }, { id: 'BCLK', x: 10, y: 0, eticheta: 'BCLK', tip: 'intrare', descriere: 'Ceasul de biți' },
      { id: 'DIN', x: 20, y: 0, eticheta: 'DIN', tip: 'intrare', descriere: 'Datele audio' }, { id: 'GAIN', x: 30, y: 0, eticheta: 'GAIN', tip: 'intrare' }, { id: 'SD', x: 40, y: 0, eticheta: 'SD', tip: 'intrare' },
      { id: 'GND', x: 50, y: 0, eticheta: 'GND', tip: 'gnd' }, { id: 'VIN', x: 60, y: 0, eticheta: 'Vin', tip: 'vcc', descriere: '2,5–5,5 V' },
      { id: 'SP', x: 20, y: -38, eticheta: '+', tip: 'iesire' }, { id: 'SN', x: 40, y: -38, eticheta: '−', tip: 'iesire' }
    ],
    cutie: () => ({ x: -6, y: -46, w: 72, h: 52 }),
    desen(p) {
      let s = D.pcb(-5, -45, 70, 41, { culoare: '#1a1c20', gauri: 2.4 });
      s += D.cip(26, -26, 9, 9, { eticheta: '98357', m: 1.6 });
      s += `<rect x="13" y="-44" width="34" height="11" rx="1" fill="#2f7fd8"/>`;
      s += D.text(30, -12, 'I2S AMP', { m: 2.4 });
      for (const pin of this.pini(p)) {
        if (pin.y === 0) { s += D.pinAntet(pin.x, pin.y); s += D.text(pin.x, 5.2, pin.eticheta, { m: 2.1, c: 'var(--text-2)' }); }
        else { s += `<circle cx="${pin.x}" cy="${pin.y}" r="2.6" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.5"/><path d="M${pin.x - 1.6} ${pin.y} h3.2" stroke="#555" stroke-width="0.7"/>`; s += D.text(pin.x, pin.y + 6, pin.eticheta, { m: 3 }); }
      }
      return s;
    },
    electric(ctx, inst, sim) {
      const r = { consum: ctx.R('VIN', 'GND', 2000), sdSus: ctx.R('SD', 'VIN', 1e6), sdJos: ctx.R('SD', 'GND', 1e5) };
      return Object.assign(r, iesiriPunte(ctx, sim, inst, ['SP', 'SN'], 'VIN', 'GND'));
    },
    dispozitiv(inst, sim, el) {
      const net = (p) => sim.netPin(inst, p);
      return {
        familie: 'amplificator', iesiriAudio: ['SP', 'SN'], vin: 0, mod: 'mix',
        semnalAudio(pin, t0, t1, n) {
          if (!this.cache || this.cache.t0 !== t0 || this.cache.t1 !== t1 || this.cache.n !== n) this.cache = { t0, t1, n, x: this.randeaza(t0, t1, n) };
          const b = this.vin > 2.4 ? this.vin / 2 : 0, semn = pin === 'SP' ? 0.5 : -0.5, x = this.cache.x;
          const out = new Float32Array(n);
          for (let i = 0; i < n; i++) out[i] = b + semn * x[i];
          return out;
        },
        randeaza(t0, t1, n) {
          const x = new Float32Array(n);
          const vin = this.vin = tensiuneModul(sim, inst, 'VIN', 'GND');
          if (vin < 2.4) return x;
          const vsd = sim.circuit.tensiune(net('SD'));
          this.mod = vsd < 0.16 ? 'oprit' : vsd < 0.77 ? 'mix' : vsd < 1.4 ? 'dreapta' : 'stanga';
          if (this.mod === 'oprit') { sim.problema('max-sd-' + inst.id, 'info', inst.eticheta + ': pinul SD e la GND, deci amplificatorul e oprit (shutdown). Lasă SD liber sau pune-l la 3,3 V.', { comp: inst.id }); return x; }
          const em = M.i2s ? M.i2s.emitator(sim, net('BCLK'), net('LRC'), net('DIN')) : null;
          if (!em) {
            const alt = M.i2s ? M.i2s.porturi(sim).find(p => p.tx && p.pornit) : null;
            if (alt && alt.pini.dout >= 0) sim.problema('max-pini-' + inst.id, 'eroare', 'I2S trimite pe BCLK=GPIO' + alt.pini.bclk + ', WS=GPIO' + alt.pini.ws + ', DOUT=GPIO' + alt.pini.dout + ', dar DIN-ul lui ' + inst.eticheta + ' nu e legat la GPIO' + alt.pini.dout + '. Pinii din cod trebuie să fie cei din schemă.', { comp: inst.id });
            return x;
          }
          if (!em.bclk || !em.ws) {
            sim.problema('max-ceas-' + inst.id, 'eroare', inst.eticheta + ': ' + (em.inversat ? 'BCLK și LRC sunt inversate' : 'BCLK sau LRC nu e legat la pinii din cod (BCLK=GPIO' + em.port.pini.bclk + ', WS=GPIO' + em.port.pini.ws + ')') + ', așa că amplificatorul nu se sincronizează și se aude doar zgomot.', { comp: inst.id });
            for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * 0.3;
            return x;
          }
          const { L, R } = em.port.randeaza(t0, t1, n);
          const nG = net('GAIN');
          let g = 9;
          if (!sim.flotant(nG)) { const vg = sim.circuit.tensiune(nG); g = vg < 0.5 ? 12 : vg > vin - 0.5 ? 6 : 9; }
          const vfs = 3.2 * Math.pow(10, (g - 9) / 20), lim = Math.max(0.3, vin - 0.2);
          for (let i = 0; i < n; i++) {
            const s = this.mod === 'mix' ? (L[i] + R[i]) / 2 : this.mod === 'stanga' ? L[i] : R[i];
            x[i] = SN().saturatie(s * vfs, lim);
          }
          verificaPunte(sim, inst, el, ['SP', 'SN'], 'MAX98357A');
          return x;
        }
      };
    },
    masura(el, inst, sim, disp) { return disp ? [['Canal redat', ({ mix: '(L+R)/2', stanga: 'stânga', dreapta: 'dreapta', oprit: 'oprit (SD la GND)' })[disp.mod] || '—']] : []; }
  });

  // ---------- DFPlayer Mini ----------
  // „cardul SD”: melodii sintetizate, ca să se poată asculta fără fișiere reale
  const PISTE = [
    { nume: '0001.mp3 — Melodie (Oda bucuriei)', durata: 7.8, gen: (s) => {
      const note = [330, 330, 349, 392, 392, 349, 330, 294, 262, 262, 294, 330, 330, 294, 294];
      const lung = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 0.5, 2];
      let t = s / 0.42, i = 0;
      while (i < note.length && t >= lung[i]) { t -= lung[i]; i++; }
      if (i >= note.length) return 0;
      const f = note[i], anv = Math.min(1, t * 20) * Math.exp(-t * 1.6);
      const p = (s * f) % 1;
      return anv * (0.6 * Math.sin(2 * Math.PI * p) + 0.25 * Math.sin(4 * Math.PI * p) + 0.15 * (p < 0.5 ? 1 : -1));
    } },
    { nume: '0002.mp3 — Sonerie (ding-dong)', durata: 2.4, gen: (s) => {
      const clopot = (t, f) => t < 0 ? 0 : Math.exp(-t * 2.2) * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 4) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 7));
      return 0.6 * (clopot(s, 659.25) + clopot(s - 0.6, 523.25));
    } },
    { nume: '0003.mp3 — Alarmă', durata: 3, gen: (s) => ((s * 5) % 1 < 0.55 ? 1 : 0) * (Math.sin(2 * Math.PI * 1000 * s) > 0 ? 0.55 : -0.55) },
    { nume: '0004.mp3 — Voce', durata: 2.2, gen: (s) => M.sunet.voce(s + 0.12) * 1.3 },
    { nume: '0005.mp3 — Muzică de fundal', durata: 12, gen: (s) => M.sunet.muzica(s) * 0.9 }
  ];
  M.componente.defineste({
    tip: 'dfplayer', nume: 'DFPlayer Mini (MP3)', categorie: 'sunet', eticheta: 'MP3',
    cauta: 'dfplayer mini mp3 player sd card melodii serial df player',
    descriere: 'Player MP3 cu card microSD și amplificator de 3 W: difuzorul direct între SPK1 și SPK2. Se comandă pe serial la 9600 baud (biblioteca DFRobotDFPlayerMini): TX-ul modulului la RX-ul plăcii și invers. Pe card (simulat) sunt 5 piste: 1 melodie, 2 sonerie, 3 alarmă, 4 voce, 5 muzică. BUSY e LOW cât cântă.',
    prop: [{ cheie: 'card', eticheta: 'Card microSD', tip: 'alegere', optiuni: [['da', 'Introdus (5 piste)'], ['nu', 'Lipsă']], implicit: 'da' }],
    alimentare: { min: 3.2, max: 5.5 },
    pini: () => {
      const jos = ['VCC', 'RX', 'TX', 'DAC_R', 'DAC_L', 'SPK1', 'GND', 'SPK2'];
      const sus = ['BUSY', 'USB-', 'USB+', 'ADK2', 'ADK1', 'IO2', 'GND2', 'IO1'];
      const tip = { VCC: 'vcc', GND: 'gnd', GND2: 'gnd', RX: 'intrare', TX: 'iesire', BUSY: 'iesire' };
      const desc = { VCC: '3,2–5 V', RX: 'Primește comenzi (la TX-ul plăcii)', TX: 'Trimite răspunsuri (la RX-ul plăcii)', BUSY: 'LOW cât timp cântă', SPK1: 'Difuzor (+)', SPK2: 'Difuzor (−)', DAC_L: 'Ieșire de linie stânga (spre un amplificator)', DAC_R: 'Ieșire de linie dreapta' };
      return jos.map((id, i) => ({ id, x: i * 10, y: 0, eticheta: id.replace('_', ''), tip: tip[id] || 'iesire', descriere: desc[id] }))
        .concat(sus.map((id, i) => Object.assign({ id, x: 70 - i * 10, y: -60, eticheta: id === 'GND2' ? 'GND' : id, tip: tip[id] || 'intrare', descriere: desc[id] }, id === 'GND2' ? { legatCu: 'GND', descriere: 'Legat intern cu celălalt GND' } : {})));
    },
    cutie: () => ({ x: -6, y: -66, w: 82, h: 72 }),
    desen(p) {
      let s = D.pcb(-5, -64, 80, 68, { culoare: '#1c1f24', gauri: false });
      s += `<rect x="12" y="-56" width="46" height="30" rx="1.5" fill="#b9bec6" stroke="#8a9099" stroke-width="0.6"/><rect x="15" y="-53" width="40" height="24" rx="1" fill="#cfd3d9"/>`;
      s += D.text(35, -45, 'microSD', { m: 3, c: '#555' });
      if (p.card !== 'nu') s += `<rect x="18" y="-35" width="34" height="8" rx="0.8" fill="#16181b"/>` + D.text(35, -31, 'SD 8GB', { m: 2.2, c: '#9aa0a8' });
      s += D.cip(24, -20, 12, 8, { eticheta: 'MH2024K', m: 1.6 }) + D.cip(44, -20, 8, 6, { eticheta: '8002', m: 1.4 });
      s += `<circle cx="8" cy="-17" r="1.5" fill="rgba(0,0,0,.4)"/><circle cx="8" cy="-17" r="1.2" fill="#ff3b2f" opacity="0.15" data-r="led"/>`;
      s += D.text(62, -14, 'DFPlayer', { m: 2.6 });
      for (const pin of this.pini(p)) {
        s += D.pinAntet(pin.x, pin.y);
        s += D.text(pin.x, pin.y + (pin.y === 0 ? 5.3 : -5.3), pin.eticheta, { m: 1.9, c: 'var(--text-2)' });
      }
      return s;
    },
    electric(ctx, inst, sim) {
      const d = () => sim && sim.disp.get(inst.id);
      return {
        consum: ctx.R('VCC', 'GND', 250), g2: ctx.R('GND2', 'GND', 0.05),
        tx: ctx.iesire('TX', () => tensiuneModul(sim, inst) > 3 ? { v: 3.3, r: 600 } : null),
        busy: ctx.iesire('BUSY', () => { if (tensiuneModul(sim, inst) < 3) return null; const x = d(); return x && x.canta && !x.pauza ? { v: 0, r: 200 } : { v: 3.3, r: 10000 }; }),
        spk1: ctx.iesire('SPK1', () => tensiuneModul(sim, inst) > 3 ? { v: tensiuneModul(sim, inst) / 2, r: 0.4 } : null),
        spk2: ctx.iesire('SPK2', () => tensiuneModul(sim, inst) > 3 ? { v: tensiuneModul(sim, inst) / 2, r: 0.4 } : null)
      };
    },
    dispozitiv(inst, sim, el) {
      const cadru = (cmd, param) => String.fromCharCode(...M.dfplayer.cadru(cmd, param, false));
      return {
        familie: 'dfplayer', uart: { tx: 'TX', rx: 'RX', baud: 9600 }, iesiriAudio: ['SPK1', 'SPK2', 'DAC_L', 'DAC_R'],
        volum: 25, eq: 0, pista: 1, canta: false, pauza: false, poz: 0, tPornire: 0, bucla: false, buclaTot: false, aleator: false, dac: true, tampon: '', token: 0, pregatit: false,
        alimentat() { return tensiuneModul(sim, inst) > 3.0; },
        card() { return inst.prop.card !== 'nu'; },
        start() { this.pornire(900000); },
        pornire(us) {
          this.pregatit = false; this.canta = false; this.pauza = false; this.token++;
          const tk = this.token;
          sim.programeaza(us, () => {
            if (tk !== this.token || !this.alimentat()) return;
            this.pregatit = true;
            if (this.card()) this.raspunde(0x3F, 0x0002, 0);
            else { this.raspunde(0x40, 0x0001, 0); sim.problema('df-card-' + inst.id, 'avertisment', inst.eticheta + ' nu are card microSD (sau cardul nu e formatat FAT32), deci nu pornește și begin() întoarce false.', { comp: inst.id }); }
          });
        },
        raspunde(cmd, param, us) { sim.programeaza(us === undefined ? 20000 : us, () => { if (this.uartSpre && this.alimentat()) this.uartSpre(cadru(cmd, param)); }); },
        uartPrimeste(t) {
          if (!this.alimentat()) return;
          this.tampon += t;
          for (;;) {
            const i = this.tampon.indexOf('\x7E');
            if (i < 0) { this.tampon = ''; return; }
            if (this.tampon.length - i < 10) { this.tampon = this.tampon.slice(i); return; }
            const b = []; for (let k = 0; k < 10; k++) b.push(this.tampon.charCodeAt(i + k) & 255);
            this.tampon = this.tampon.slice(i + 10);
            if (b[1] !== 0xFF || b[2] !== 0x06 || b[9] !== 0xEF) continue;
            this.executa(b[3], b[4], (b[5] << 8) | b[6], b[5], b[6]);
          }
        },
        executa(cmd, ack, param, ph, pl) {
          if (ack) this.raspunde(0x41, 0, 12000);
          const n = PISTE.length;
          const interogare = (v) => this.raspunde(cmd, v, 30000);
          if (!this.pregatit && cmd !== 0x0C && cmd !== 0x3F) { this.raspunde(0x40, 0x0001, 20000); return; }
          switch (cmd) {
            case 0x01: this.reda(this.pista % n + 1); break;
            case 0x02: this.reda((this.pista + n - 2) % n + 1); break;
            case 0x03: case 0x12: this.reda(param); break;
            case 0x0F: this.reda((pl - 1) % n + 1); break;
            case 0x14: this.reda(((param & 0x0FFF) - 1) % n + 1); break;
            case 0x04: this.volum = Math.min(30, this.volum + 1); break;
            case 0x05: this.volum = Math.max(0, this.volum - 1); break;
            case 0x06: this.volum = Math.max(0, Math.min(30, param)); break;
            case 0x07: this.eq = param; break;
            case 0x08: this.bucla = true; this.reda(param); break;
            case 0x0C: this.opreste(); this.pornire(900000); break;
            case 0x0D: if (this.pauza) { this.pauza = false; this.tPornire = sim.timp; this.programeazaSfarsit(); } else if (!this.canta) this.reda(this.pista); break;
            case 0x0E: if (this.canta && !this.pauza) { this.poz += (sim.timp - this.tPornire) / 1e6; this.pauza = true; this.token++; } break;
            case 0x11: this.buclaTot = param === 1; if (this.buclaTot && !this.canta) this.reda(1); break;
            case 0x16: this.opreste(); break;
            case 0x18: this.aleator = true; this.reda(1 + Math.floor(Math.random() * n)); break;
            case 0x19: this.bucla = param === 0; break;
            case 0x1A: this.dac = param === 0; break;
            case 0x42: interogare(0x0200 | (this.canta ? (this.pauza ? 2 : 1) : 0)); break;
            case 0x43: interogare(this.volum); break;
            case 0x44: interogare(this.eq); break;
            case 0x46: interogare(8); break;
            case 0x48: case 0x4E: interogare(this.card() ? n : 0); break;
            case 0x4C: interogare(this.pista); break;
            case 0x4F: interogare(1); break;
            default: break;
          }
          sim.murdarComponenta(inst);
        },
        reda(nr) {
          if (!this.card()) { this.raspunde(0x40, 0x0006, 25000); return; }
          if (!(nr >= 1 && nr <= PISTE.length)) { this.raspunde(0x40, 0x0006, 25000); sim.problema('df-pista-' + inst.id, 'avertisment', inst.eticheta + ': pista ' + nr + ' nu există pe card (sunt ' + PISTE.length + ').', { comp: inst.id }); return; }
          this.pista = nr; this.canta = true; this.pauza = false; this.poz = 0; this.tPornire = sim.timp + 30000;
          this.programeazaSfarsit();
          sim.murdarComponenta(inst);
        },
        programeazaSfarsit() {
          const tk = ++this.token;
          const rest = (PISTE[this.pista - 1].durata - this.poz) * 1e6 + (this.tPornire - sim.timp);
          sim.programeaza(Math.max(1000, rest), () => {
            if (tk !== this.token || !this.canta) return;
            const terminata = this.pista;
            this.canta = false;
            sim.murdarComponenta(inst);
            // modulul real trimite mesajul „pistă terminată” de două ori
            this.raspunde(0x3D, terminata, 5000); this.raspunde(0x3D, terminata, 120000);
            if (this.bucla) this.reda(terminata);
            else if (this.buclaTot || this.aleator) this.reda(this.aleator ? 1 + Math.floor(Math.random() * PISTE.length) : terminata % PISTE.length + 1);
          });
        },
        opreste() { this.canta = false; this.pauza = false; this.token++; sim.murdarComponenta(inst); },
        // sunetul pistei curente (−1…1, fără volum)
        randeaza(t0, t1, n) {
          if (this.cache && this.cache.t0 === t0 && this.cache.t1 === t1 && this.cache.n === n) return this.cache;
          const x = new Float32Array(n);
          this.cache = { t0, t1, n, x, vcc: tensiuneModul(sim, inst) };
          if (!this.canta || this.pauza || !this.alimentat()) return this.cache;
          const p = PISTE[this.pista - 1];
          const a = this.volum === 0 ? 0 : Math.pow(10, (this.volum - 30) * 1.25 / 20);
          const dt = (t1 - t0) / n;
          for (let i = 0; i < n; i++) {
            const t = t0 + i * dt;
            if (t < this.tPornire) continue;
            const s = this.poz + (t - this.tPornire) / 1e6;
            if (s < p.durata) x[i] = p.gen(s) * a;
          }
          if (this.cache.vcc < 4.2 && this.volum > 18) sim.problema('df-3v3-' + inst.id, 'avertisment', inst.eticheta + ' e alimentat la ' + M.fmtV(this.cache.vcc) + ': amplificatorul lui intern sună încet și distorsionat la volum mare. Alimentează-l din 5 V (VIN).', { comp: inst.id });
          return this.cache;
        },
        semnalAudio(pin, t0, t1, n) {
          const c = this.randeaza(t0, t1, n);
          const out = new Float32Array(n);
          if (c.vcc < 3) return out;
          if (pin === 'SPK1' || pin === 'SPK2') {
            const semn = pin === 'SPK1' ? 0.5 : -0.5, lim = Math.max(0.3, c.vcc - 0.7);
            for (let i = 0; i < n; i++) out[i] = c.vcc / 2 + semn * SN().saturatie(c.x[i] * c.vcc * 1.1, lim);
          } else if (this.dac) for (let i = 0; i < n; i++) out[i] = 1.2 + c.x[i] * 0.9;
          return out;
        }
      };
    },
    vizual(g, inst, sim, el, disp) { const l = g.querySelector('[data-r="led"]'); if (l) l.setAttribute('opacity', disp && disp.canta && !disp.pauza ? (0.5 + 0.45 * Math.sin(Date.now() / 90)).toFixed(2) : 0.15); },
    masura(el, inst, sim, disp) { return disp ? [['Stare', disp.canta ? (disp.pauza ? 'pauză' : 'cântă pista ' + disp.pista) : 'oprit'], ['Volum', disp.volum + ' / 30'], ['Pistă', (PISTE[disp.pista - 1] || {}).nume || '—']] : []; }
  });

  // ---------- MAX9814 (microfon cu amplificare automată) ----------
  M.componente.defineste({
    tip: 'max9814', nume: 'Microfon MAX9814 (AGC)', categorie: 'sunet', eticheta: 'MIC',
    cauta: 'max9814 microfon electret amplificator agc analog sunet audio',
    descriere: 'Microfon electret cu amplificator și control automat al amplificării: OUT e sunetul, în jurul a 1,25 V, cu maximum ~2 V vârf la vârf. GAIN liber = 60 dB, la GND = 50 dB, la VDD = 40 dB. Citește-l cu analogRead() de multe ori pe secundă ca să prinzi forma undei.',
    control: M.sunet.controaleMicrofon(60),
    alimentare: { vcc: 'VDD', min: 2.7, max: 5.5 },
    pini: () => [{ id: 'AR', x: 0, y: 0, eticheta: 'AR', tip: 'intrare' }, { id: 'OUT', x: 10, y: 0, eticheta: 'OUT', tip: 'iesire-analogica', descriere: 'Semnalul audio (1,25 V ± 1 V)' }, { id: 'GAIN', x: 20, y: 0, eticheta: 'GAIN', tip: 'intrare' }, { id: 'VDD', x: 30, y: 0, eticheta: 'VDD', tip: 'vcc' }, { id: 'GND', x: 40, y: 0, eticheta: 'GND', tip: 'gnd' }],
    cutie: () => ({ x: -6, y: -40, w: 52, h: 46 }),
    desen(p) {
      let s = D.pcb(-5, -38, 50, 35, { culoare: '#1a1c20', gauri: 2.4 });
      s += `<g data-act="aplauze" class="interactiv"><circle cx="20" cy="-22" r="10" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.6"/><circle cx="20" cy="-22" r="7.8" fill="#2a2d31"/><circle cx="20" cy="-22" r="7.8" fill="none" stroke="#50555c" stroke-width="0.4" stroke-dasharray="0.6 0.6"/></g>`;
      s += D.cip(34, -14, 7, 5, { eticheta: '9814', m: 1.3 });
      s += antete(this.pini(p));
      return s;
    },
    electric(ctx, inst, sim) {
      const r = { consum: ctx.R('VDD', 'GND', 1100) };
      r.out = ctx.iesire('OUT', () => {
        const vdd = tensiuneModul(sim, inst, 'VDD', 'GND');
        if (vdd < 2.4 || !sim) return null;
        const d = sim.disp.get(inst.id);
        return { v: d ? d.iesire(sim.timp, vdd) : 1.25, r: 50 };
      });
      r.out.dinamic = true;
      return r;
    },
    dispozitiv(inst, sim) {
      return {
        familie: 'microfon', aplauzaPana: 0, cadruGain: -1, gdb: 60,
        castig() {
          if (this.cadruGain === sim.timp) return this.gdb;
          this.cadruGain = sim.timp;
          const n = sim.netPin(inst, 'GAIN');
          if (sim.flotant(n)) this.gdb = 60;
          else { const v = sim.circuit.tensiune(n); this.gdb = v < 0.6 ? 50 : 40; }
          return this.gdb;
        },
        iesire(t, vdd) {
          const G = Math.pow(10, this.castig() / 20);
          const volti = (p) => p * 0.0398; // 6,3 mV/Pa, 1 unitate = 6,3 Pa (110 dB)
          const varfAsteptat = volti(SN().nivelAsteptat(sim, inst)) * 1.6;
          const g = Math.min(G, Math.max(G / 10, 0.9 / Math.max(1e-6, varfAsteptat)));
          const x = SN().saturatie(volti(SN().presiune(sim, inst, t)) * g, 1.0);
          return Math.max(0.05, Math.min(vdd - 0.1, 1.25 + x + (Math.random() - 0.5) * 0.004));
        }
      };
    },
    actiune(inst, act, faza, el, sim, disp) { if (act === 'aplauze' && faza === 'jos' && disp) { disp.aplauzaPana = sim.timp + 60000; sim.murdarComponenta(inst); } },
    masura(el, inst, sim, disp) { return disp ? [['Amplificare', disp.gdb + ' dB (maxim)'], ['OUT', M.fmtV(el.out && sim ? sim.tensiunePin(inst, 'OUT') : 0)]] : []; }
  });

  // ---------- INMP441 (microfon I2S) ----------
  M.componente.defineste({
    tip: 'inmp441', nume: 'Microfon I2S INMP441', categorie: 'sunet', eticheta: 'MIC',
    cauta: 'inmp441 microfon i2s digital mems sunet audio',
    descriere: 'Microfon MEMS digital: trimite sunetul pe I2S (SCK = BCLK, WS, SD = date), eșantioane de 24 de biți în cuvinte de 32. L/R alege canalul: la GND = stânga, la VDD = dreapta. Doar 3,3 V (maximum 3,6 V).',
    control: M.sunet.controaleMicrofon(60),
    alimentare: { vcc: 'VDD', min: 1.62, max: 3.63 },
    pini: () => [{ id: 'SCK', x: 0, y: 0, eticheta: 'SCK', tip: 'intrare', descriere: 'Ceasul de biți (BCLK)' }, { id: 'WS', x: 10, y: 0, eticheta: 'WS', tip: 'intrare', descriere: 'Selecția cuvântului (LRCLK)' }, { id: 'LR', x: 20, y: 0, eticheta: 'L/R', tip: 'intrare', descriere: 'GND = canal stâng, VDD = canal drept' },
      { id: 'SD', x: 30, y: 0, eticheta: 'SD', tip: 'iesire', descriere: 'Datele audio' }, { id: 'VDD', x: 40, y: 0, eticheta: 'VDD', tip: 'vcc', descriere: '1,8–3,3 V' }, { id: 'GND', x: 50, y: 0, eticheta: 'GND', tip: 'gnd' }],
    cutie: () => ({ x: -6, y: -40, w: 62, h: 46 }),
    desen(p) {
      let s = `<circle cx="25" cy="-19" r="19" fill="#2c1f5c" stroke="rgba(0,0,0,.45)" stroke-width="0.6"/>`;
      s += `<rect x="-5" y="-9" width="60" height="7" rx="2" fill="#2c1f5c"/>`;
      s += `<g data-act="aplauze" class="interactiv"><rect x="20" y="-26" width="10" height="8" rx="1" fill="#c9ccd1" stroke="#8a9099" stroke-width="0.5"/><circle cx="25" cy="-22" r="1.2" fill="#333"/></g>`;
      s += D.text(25, -32, 'INMP441', { m: 2.6 });
      s += antete(this.pini(p));
      return s;
    },
    electric(ctx) { return { consum: ctx.R('VDD', 'GND', 2400) }; },
    dispozitiv(inst, sim) {
      return {
        familie: 'microfon', microfonI2S: { sck: 'SCK', ws: 'WS', sd: 'SD' }, aplauzaPana: 0,
        canalI2S() {
          const n = sim.netPin(inst, 'LR');
          if (sim.flotant(n)) {
            sim.problema('inmp-lr-' + inst.id, 'avertisment', inst.eticheta + ': pinul L/R e în aer. Leagă-l la GND (canalul stâng) sau la VDD (canalul drept) — liber, microfonul alege la întâmplare.', { comp: inst.id });
            return 'L';
          }
          const v = sim.circuit.tensiune(n), vdd = tensiuneModul(sim, inst, 'VDD', 'GND');
          return v > vdd * 0.5 ? 'R' : 'L';
        },
        esantionI2S(t) {
          const vdd = tensiuneModul(sim, inst, 'VDD', 'GND');
          if (vdd < 1.6 || vdd > 3.9) return 0;
          const x = SN().presiune(sim, inst, t) * 0.316 + (Math.random() - 0.5) * 1e-4;
          return Math.max(-1, Math.min(0.99999, x));
        }
      };
    },
    actiune(inst, act, faza, el, sim, disp) { if (act === 'aplauze' && faza === 'jos' && disp) disp.aplauzaPana = sim.timp + 60000; }
  });
})(window.M = window.M || {});
