/* Meșter — verificarea schemei înainte de rulare (ca un electronist care se uită peste montaj):
   scurtcircuite, LED-uri fără rezistor, pini greșiți, alimentări greșite, TX/RX inversate, pini de pornire. */
(function (M) {
  'use strict';

  function ruleaza(proiect, cod) {
    const probleme = [];
    const adauga = (nivel, mesaj, extra) => probleme.push(Object.assign({ nivel, mesaj, cheie: 'st-' + probleme.length }, extra || {}));
    const placi = proiect.componente.filter(c => { const d = M.componente.def(c.tip); return d && d.esteplaca; });
    if (!proiect.componente.length) return probleme;
    if (!placi.length) adauga('info', 'Nu există nicio placă în schemă. Adaugă un ESP32 din „Plăci de dezvoltare” ca să rulezi codul.');
    if (placi.length > 1) adauga('info', 'Ai ' + placi.length + ' plăci. Codul rulează doar pe ' + placi[0].eticheta + ' (prima adăugată).', { comp: placi[1].id });
    let sim;
    try { sim = new M.Simulare(proiect, { static: true }); } catch (e) { console.error(e); return probleme; }
    const retea = sim.retea;
    const circ = sim.circuit;
    // probleme detectate la construirea circuitului (scurtcircuite)
    for (const p of sim.probleme.values()) adauga(p.nivel, p.mesaj, { comp: p.comp, net: p.net });
    const placa = sim.placaInst;
    const cip = sim.cip;
    const numePin = (g) => cip && cip.platforma === 'avr' ? 'pinul ' + g : 'GPIO' + g;
    // componente complet neconectate
    for (const c of proiect.componente) {
      const def = M.componente.def(c.tip);
      if (!def || def.esteBreadboard || def.esteplaca || def.faraConexiuni) continue;
      const pini = M.componente.pini(c);
      const legati = pini.filter(p => retea.piniReali(retea.net(c.id, p.id)).length > 1 || arePeBreadboardLegat(retea, c, p));
      if (!legati.length) adauga('info', c.eticheta + ' (' + def.nume + ') nu e legat la nimic încă.', { comp: c.id });
      else {
        const conectat = (p) => retea.piniReali(retea.net(c.id, p.id)).length > 1;
        for (const p of pini) {
          const t = (p.tip || '').toLowerCase();
          // pini legați intern cu altul (ex. al doilea GND al unui modul): ajunge să fie legat celălalt
          if (p.legatCu && pini.some(q => q.id === p.legatCu && conectat(q))) continue;
          if ((t === 'vcc' || t === 'gnd') && !conectat(p)) {
            adauga('avertisment', c.eticheta + ': pinul ' + (p.eticheta || p.id) + ' nu e conectat — modulul nu va funcționa fără ' + (t === 'gnd' ? 'masă (GND)' : 'alimentare') + '.', { comp: c.id });
          }
        }
      }
      // ambele picioare pe aceeași bandă de breadboard
      if (pini.length === 2 && !def.faraVerificareScurt) {
        const n1 = retea.net(c.id, pini[0].id), n2 = retea.net(c.id, pini[1].id);
        if (n1 === n2 && legati.length) adauga('avertisment', c.eticheta + ' are ambele picioare pe același nod (aceeași coloană de breadboard sau același fir) — e scurtcircuitat și nu face nimic.', { comp: c.id });
      }
    }
    // alimentarea modulelor
    for (const c of proiect.componente) {
      const def = M.componente.def(c.tip);
      if (!def || !def.alimentare) continue;
      const a = def.alimentare;
      const nv = retea.net(c.id, a.vcc || 'VCC'), ng = retea.net(c.id, a.gnd || 'GND');
      if (!circ.fix.has(nv)) continue;
      const v = circ.fix.get(nv) - (circ.fix.has(ng) ? circ.fix.get(ng) : 0);
      if (v > a.max + 0.3) adauga('eroare', c.eticheta + ' (' + def.nume + ') e alimentat la ' + M.fmtV(v) + ', dar suportă maximum ' + M.fmtV(a.max) + '. În realitate se arde — leagă-l la ' + (a.max < 4 ? '3V3' : '5V') + '.', { comp: c.id });
      else if (v < a.min - 0.15 && v > 0) adauga('avertisment', c.eticheta + ' (' + def.nume + ') primește ' + M.fmtV(v) + ', dar are nevoie de cel puțin ' + M.fmtV(a.min) + (a.min > 4 ? ' — leagă VCC la 5V/VIN.' : '.'), { comp: c.id });
    }
    if (placa && cip) {
      // pini ai plăcii
      for (const [g, net] of sim.gpioNet) {
        const altii = retea.piniReali(net).filter(i => retea.pinInfo[i].comp !== placa);
        if (!altii.length) continue;
        const folosit = altii.map(i => retea.pinInfo[i].comp.eticheta).filter((x, i, a) => a.indexOf(x) === i).join(', ');
        if (circ.fix.has(net)) {
          const v = circ.fix.get(net);
          if (!cip.toleranta5V && v > 3.6) adauga('eroare', numePin(g) + ' e legat direct la ' + M.fmtV(v) + '. Pinii ' + cip.cip + ' suportă maximum 3,6 V — placa se poate strica.', { comp: placa.id, gpio: g });
          else if (Math.abs(v) < 0.01) adauga('avertisment', numePin(g) + ' e legat direct la GND. Dacă îl faci ieșire HIGH, va fi scurtcircuit.', { comp: placa.id, gpio: g });
          else adauga('avertisment', numePin(g) + ' e legat direct la ' + M.fmtV(v) + '. Ca ieșire LOW ar face scurtcircuit.', { comp: placa.id, gpio: g });
        }
        if (cip.flash.includes(g)) adauga('eroare', numePin(g) + ' e folosit de memoria flash a modulului — placa nu va porni corect. Mută legătura (' + folosit + ') pe alt pin.', { comp: placa.id, gpio: g });
        if (cip.psram.includes(g)) adauga('eroare', 'GPIO' + g + ' e ocupat de PSRAM pe modulul ' + (placa.prop.modul || 'N16R8') + '. Mută ' + folosit + ' pe alt pin.', { comp: placa.id, gpio: g });
        if (cip.strapping.includes(g)) {
          let explicatie = 'e pin de pornire (strapping): ce e legat aici poate împiedica pornirea sau programarea plăcii';
          if (cip.cip === 'ESP32' && g === 12) explicatie = 'e pin de pornire (MTDI): dacă e HIGH la pornire, flash-ul primește 1,8 V și placa nu pornește';
          if (cip.cip === 'ESP32' && g === 0) explicatie = 'e pinul BOOT: dacă e LOW la pornire, placa intră în modul de programare';
          if (cip.cip === 'ESP32' && g === 2) explicatie = 'e pin de pornire: trebuie să fie LOW sau liber la programare (LED-ul de pe placă e aici)';
          if (!(cip.cip === 'ESP32' && g === 2 && altii.every(i => retea.pinInfo[i].def.tip === 'led' || retea.pinInfo[i].def.tip === 'rezistor'))) {
            adauga('info', numePin(g) + ' ' + explicatie + '. Legat la: ' + folosit + '.', { comp: placa.id, gpio: g });
          }
        }
        if (cip.uart0.includes(g) && cip.platforma !== 'avr') adauga('info', numePin(g) + ' este ' + (g === cip.uart0[0] ? 'TX' : 'RX') + ' al portului Serial (USB). Dacă folosești Serial.print, nu lega alte piese aici.', { comp: placa.id, gpio: g });
        if (cip.usb && cip.usb.includes(g)) adauga('avertisment', 'GPIO' + g + ' e folosit de USB-ul nativ al ' + cip.cip + '. Dacă legi ceva aici, se pierde portul Serial/USB.', { comp: placa.id, gpio: g });
        // pini doar-intrare care comandă sarcini
        if (cip.doarIntrare.includes(g)) {
          for (const i of altii) {
            const pi = retea.pinInfo[i];
            if (pi.def.tip === 'led' || (pi.pin.tip === 'intrare' && ['DIN', 'IN', 'SIG', 'TRIG', 'PWM', 'IN1', 'IN2', 'IN3', 'IN4', 'S'].includes(pi.pin.id))) {
              adauga('eroare', numePin(g) + ' poate fi doar intrare pe ' + cip.cip + ', deci nu poate comanda ' + pi.comp.eticheta + ' (' + (pi.pin.eticheta || pi.pin.id) + '). Folosește alt pin.', { comp: pi.comp.id, gpio: g });
              break;
            }
          }
        }
      }
      // TX/RX inversate
      for (const d of proiect.componente) {
        const def = M.componente.def(d.tip);
        if (!def || !def.uart) continue;
        const ntx = retea.net(d.id, def.uart.tx), nrx = retea.net(d.id, def.uart.rx);
        for (const [g, net] of sim.gpioNet) {
          const rolPlaca = cip.uart0[0] === g ? 'TX' : cip.uart0[1] === g ? 'RX' : null;
          if (net === ntx && rolPlaca === 'TX') adauga('eroare', d.eticheta + ': TX-ul modulului e legat la TX-ul plăcii. Leagă TX → RX și RX → TX (se încrucișează).', { comp: d.id });
          if (net === nrx && rolPlaca === 'RX') adauga('eroare', d.eticheta + ': RX-ul modulului e legat la RX-ul plăcii. Leagă TX → RX și RX → TX.', { comp: d.id });
        }
        if (def.uart.tensiune5V && cip && !cip.toleranta5V) {
          const alim = retea.net(d.id, 'VCC');
          if (circ.fix.has(alim) && circ.fix.get(alim) > 4) adauga('info', d.eticheta + ' alimentat la 5 V trimite semnal de 5 V pe TX. Pentru ' + cip.cip + ' pune un divizor (1 kΩ / 2 kΩ) pe linia spre RX.', { comp: d.id });
        }
      }
    }
    // LED-uri fără rezistor
    for (const c of proiect.componente) {
      if (c.tip !== 'led') continue;
      const na = retea.net(c.id, 'A'), nk = retea.net(c.id, 'K');
      const gpioA = sim.gpioLaNet(na), gpioK = sim.gpioLaNet(nk);
      const fixA = circ.fix.has(na), fixK = circ.fix.has(nk);
      if (fixA && fixK) {
        const v = circ.fix.get(na) - circ.fix.get(nk);
        if (v > 1.6) adauga('eroare', c.eticheta + ' e legat direct între ' + M.fmtV(circ.fix.get(na)) + ' și ' + M.fmtV(circ.fix.get(nk)) + ' fără rezistor — se arde imediat. Pune un rezistor de 220 Ω în serie.', { comp: c.id });
        else if (v < -1) adauga('info', c.eticheta + ' e montat invers (plusul spre tensiunea mai mică) — nu se va aprinde.', { comp: c.id });
      } else if ((gpioA.length && fixK) || (gpioK.length && fixA)) {
        adauga('avertisment', c.eticheta + ' e legat direct la ' + numePin((gpioA[0] !== undefined ? gpioA : gpioK)[0]) + ' fără rezistor. Curentul va fi prea mare (peste 30 mA) — pune 220 Ω în serie.', { comp: c.id });
      }
      if (gpioA.length === 0 && gpioK.length && fixK) { /* ambele capete la același pin? */ }
    }
    // condensatoare electrolitice invers
    for (const c of proiect.componente) {
      if (c.tip !== 'electrolitic') continue;
      const np = retea.net(c.id, '+'), nm = retea.net(c.id, '-');
      if (circ.fix.has(np) && circ.fix.has(nm) && circ.fix.get(np) < circ.fix.get(nm) - 0.2) adauga('eroare', c.eticheta + ' (electrolitic) e montat invers: plusul e la ' + M.fmtV(circ.fix.get(np)) + ' și minusul la ' + M.fmtV(circ.fix.get(nm)) + '. Se poate umfla sau exploda.', { comp: c.id });
      if (circ.fix.has(np) && circ.fix.has(nm)) {
        const v = Math.abs(circ.fix.get(np) - circ.fix.get(nm));
        if (v > +(c.prop.tensiune || 16)) adauga('eroare', c.eticheta + ' e la ' + M.fmtV(v) + ', peste tensiunea lui maximă (' + c.prop.tensiune + ' V).', { comp: c.id });
      }
    }
    // verificări specifice componentelor
    for (const c of proiect.componente) {
      const def = M.componente.def(c.tip);
      if (def && def.verifica) {
        try { def.verifica(c, { retea, circ, sim, adauga, cod: cod || '' }); } catch (e) { console.error(e); }
      }
    }
    // WiFi + ADC2
    if (cod && placa && cip && cip.platforma === 'esp32' && /WiFi\.(begin|softAP)/.test(cod)) {
      const m = cod.matchAll(/analogRead\s*\(\s*(\w+)\s*\)/g);
      const k = Object.assign({}, M.api.constantePlatforma.esp32, sim.placa.constante);
      for (const x of m) {
        const g = /^\d+$/.test(x[1]) ? +x[1] : k[x[1]];
        if (g !== undefined && cip.adc2.includes(g)) adauga('eroare', 'Codul folosește WiFi și citește analogic de pe GPIO' + g + ' (ADC2). Cât timp WiFi e pornit, ADC2 nu funcționează. Folosește un pin ADC1: ' + cip.adc1.slice(0, 6).join(', ') + '.', { gpio: g });
      }
    }
    return probleme;
  }
  function arePeBreadboardLegat(retea, c, p) {
    // pinul stă într-o gaură de breadboard, iar în aceeași bandă mai e ceva
    const net = retea.net(c.id, p.id);
    return retea.piniReali(net).length > 1;
  }

  M.verificari = { ruleaza };
})(window.M = window.M || {});
