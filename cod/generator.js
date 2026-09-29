/* Meșter — „Cod din schemă”: citește piesele și firele, află la ce pini ai plăcii e legată fiecare piesă
   și scrie un program de pornire comentat (constante pentru pini, inițializări în setup(), o demonstrație
   în loop()). Știe și lista de biblioteci de instalat în Arduino IDE pentru un program dat. */
(function (M) {
  'use strict';

  // ---------- analiza schemei ----------
  function analizeaza(proiect) {
    const placa = proiect.componente.find(c => { const d = M.componente.def(c.tip); return d && d.esteplaca; });
    if (!placa) return null;
    const info = M.placi.info(placa);
    const retea = M.retea.construieste(proiect);
    const netGpio = new Map(), netPutere = new Map();
    for (const pin of M.componente.pini(placa)) {
      const n = retea.net(placa.id, pin.id);
      if (n < 0) continue;
      if (pin.gpio !== undefined && !netGpio.has(n)) netGpio.set(n, { gpio: pin.gpio, pin });
      else if (pin.tip === 'gnd' || pin.tip === '3v3' || pin.tip === '5v') netPutere.set(n, pin.tip);
    }
    // sursele externe (baterie, sursă de laborator) dau și ele GND / V+
    for (const c of proiect.componente) {
      if (c.tip === 'baterie' || c.tip === 'sursa-laborator') { const n = retea.net(c.id, 'MINUS'); if (n >= 0 && !netPutere.has(n)) netPutere.set(n, 'gnd'); }
      if (c.tip === 'usb-5v') { const n = retea.net(c.id, 'GND'); if (n >= 0 && !netPutere.has(n)) netPutere.set(n, 'gnd'); }
    }
    const piniDin = (c, id) => retea.net(c.id, id);
    // GPIO-ul la care duce un pin: direct sau printr-un rezistor în serie
    function gpio(c, id, prinRezistor) {
      const n = piniDin(c, id);
      if (n < 0) return null;
      if (netGpio.has(n)) return netGpio.get(n);
      if (prinRezistor) {
        for (const i of retea.netPini[n]) {
          const pi = retea.pinInfo[i];
          if (pi.comp === c || pi.comp.tip !== 'rezistor') continue;
          const alt = retea.net(pi.comp.id, pi.pin.id === '1' ? '2' : '1');
          if (netGpio.has(alt)) return Object.assign({ prinRezistor: pi.comp }, netGpio.get(alt));
        }
      }
      return null;
    }
    const putere = (c, id) => { const n = piniDin(c, id); return n >= 0 ? netPutere.get(n) || null : null; };
    // un pin legat la pinul altei piese (ex. LED -> tranzistor)
    const legatDe = (c, id) => { const n = piniDin(c, id); if (n < 0) return []; return retea.piniReali(n).map(i => retea.pinInfo[i]).filter(pi => pi.comp !== c); };
    return { placa, info, retea, gpio, putere, legatDe, platforma: info.cip.platforma, cip: info.cip, constante: info.constante || {} };
  }

  // ---------- scrierea programului ----------
  function Program(A) {
    const P = {
      incl: [], glob: [], set: [], loop: [], per: [], fn: [], note: [], folosite: new Set(), numeFolosite: new Set(), rolDe: {}, nrDemo: 0,
      include(h) { if (!P.incl.includes(h)) P.incl.push(h); },
      global(...l) { P.glob.push(...l); },
      setup(...l) { P.set.push(...l); },
      bucla(...l) { P.loop.push(...l); },
      periodic(...l) { P.per.push(...l); },   // rulează o dată pe secundă
      functie(t) { P.fn.push(t); },
      nota(t) { P.note.push(t); },
      // nume de variabilă din eticheta piesei: LED1 -> led1
      nume(c, suf) {
        let n = String(c.eticheta || c.tip).replace(/[^A-Za-z0-9_]/g, '').replace(/^(\d)/, '_$1');
        n = /^[A-Z0-9_]+$/.test(n) ? n.toLowerCase() : n.charAt(0).toLowerCase() + n.slice(1);
        if (suf) n += suf;
        let k = n, i = 2;
        while (P.numeFolosite.has(k)) k = n + i++;
        P.numeFolosite.add(k);
        return k;
      },
      // constanta pentru un pin: const int PIN_LED1 = 27;
      pin(c, g, suf) {
        const et = String(c.eticheta || c.tip).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        const nume = 'PIN_' + et + (suf ? '_' + suf : '');
        if (!P.folosite.has(nume)) {
          P.folosite.add(nume);
          P.global('const int ' + nume + ' = ' + numePin(A, g.gpio) + ';' + comentariuPin(A, g));
        }
        return nume;
      }
    };
    return P;
  }
  // pe ESP8266 și Nano folosim numele de pe placă (D5, A0)
  function numePin(A, gpio) {
    const k = A.constante || {};
    if (A.platforma === 'esp8266') { for (const n of ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']) if (k[n] === gpio) return n; if (gpio === 17) return 'A0'; }
    if (A.platforma === 'avr') { for (let i = 0; i < 8; i++) if (k['A' + i] === gpio) return 'A' + i; }
    return String(gpio);
  }
  function comentariuPin(A, g) {
    const c = A.cip, x = [];
    if (A.platforma === 'esp32') {
      if (c.strapping && c.strapping.includes(g.gpio)) x.push('pin de pornire: atenție ce legi aici');
      if (c.doarIntrare && c.doarIntrare.includes(g.gpio)) x.push('doar intrare');
    }
    if (g.prinRezistor) x.push('prin ' + (g.prinRezistor.eticheta || 'rezistor'));
    return x.length ? '   // ' + x.join('; ') : '';
  }
  const esteAdc = (A, g) => {
    if (A.platforma === 'avr') return g >= 14 && g <= 21;
    if (A.platforma === 'esp8266') return g === 17;
    const c = A.cip;
    return (c.adc1 && c.adc1.includes(g)) || (c.adc2 && c.adc2.includes(g));
  };
  const faraDiacritice = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[„”“]/g, '"');

  // ---------- piesele ----------
  // fiecare funcție primește (c, A, P, toate) și scrie în program; întoarce false dacă piesa nu e legată
  const T = {};
  const nelegat = (P, c, ce) => { P.nota(c.eticheta + ': ' + (ce || 'nu e legat la niciun pin GPIO') + ' — nu am scris cod pentru el.'); return false; };

  T.led = (c, A, P, x) => {
    let g = A.gpio(c, 'A', true), inv = false;
    if (!g) { g = A.gpio(c, 'K', true); inv = !!g; }
    if (!g) return nelegat(P, c, 'LED-ul nu e legat la un GPIO (direct sau printr-un rezistor)');
    const pin = P.pin(c, g);
    P.setup('pinMode(' + pin + ', OUTPUT);');
    x.leduri.push({ c, pin, inv });
    return true;
  };
  T['led-rgb'] = (c, A, P, x) => {
    const r = A.gpio(c, 'R', true), g = A.gpio(c, 'G', true), b = A.gpio(c, 'B', true);
    if (!r && !g && !b) return nelegat(P, c);
    const an = (c.prop || {}).comun === 'anod';
    const pini = [['R', r], ['G', g], ['B', b]].filter(z => z[1]).map(([k, gg]) => P.pin(c, gg, k));
    const f = P.nume(c, 'Culoare');
    P.functie('// ' + c.eticheta + ': culoarea din trei valori 0..255' + (an ? ' (anod comun: 255 = stins)' : '') + '\nvoid ' + f + '(int r, int g, int b) {\n' +
      [['r', r, 'R'], ['g', g, 'G'], ['b', b, 'B']].filter(z => z[1]).map(([v, gg, k]) => '  analogWrite(' + P.pin(c, gg, k) + ', ' + (an ? '255 - ' + v : v) + ');').join('\n') + '\n}');
    void pini;
    P.bucla('// ' + c.eticheta + ': curcubeu lent', '{', '  float u = (millis() % 6000) / 6000.0 * TWO_PI;', '  ' + f + '(127 + 127 * sin(u), 127 + 127 * sin(u + 2.09), 127 + 127 * sin(u + 4.19));', '}');
    return true;
  };
  T.ws2812 = (c, A, P) => {
    const g = A.gpio(c, 'DIN', true);
    if (!g) return nelegat(P, c);
    const n = +((c.prop || {}).numar) || 8;
    const pin = P.pin(c, g);
    const v = P.nume(c);
    P.include('Adafruit_NeoPixel.h');
    P.global('Adafruit_NeoPixel ' + v + '(' + n + ', ' + pin + ', NEO_GRB + NEO_KHZ800);');
    P.setup(v + '.begin();', v + '.setBrightness(60);');
    P.bucla('// ' + c.eticheta + ': curcubeu care se rotește', v + '.rainbow((millis() * 20) & 0xFFFF);', v + '.show();');
    return true;
  };
  T.bec = (c, A, P) => nelegat(P, c, 'becul se comandă printr-un tranzistor sau releu');

  // intrări digitale
  function intrareButon(c, A, P, x, gA, gB, eticheta) {
    let g = gA ? A.gpio(c, gA) : null, altul = gB;
    if (!g && gB) { g = A.gpio(c, gB); altul = gA; }
    if (!g) return nelegat(P, c);
    const p2 = altul ? A.putere(c, altul) : null;
    const pin = P.pin(c, g);
    const mod = p2 === 'gnd' || !p2 ? 'INPUT_PULLUP' : (A.platforma === 'esp32' ? 'INPUT_PULLDOWN' : 'INPUT');
    const apasat = mod === 'INPUT_PULLUP' ? 'LOW' : 'HIGH';
    P.setup('pinMode(' + pin + ', ' + mod + ');' + (mod === 'INPUT_PULLUP' && !p2 ? '   // celălalt capăt trebuie legat la GND' : ''));
    x.butoane.push({ c, pin, apasat, eticheta: eticheta || c.eticheta });
    return true;
  }
  T.buton = (c, A, P, x) => intrareButon(c, A, P, x, 'A1', 'B1');
  T.comutator = (c, A, P, x) => intrareButon(c, A, P, x, 'C', A.putere(c, '1') ? '1' : '2');
  T.limitator = (c, A, P, x) => intrareButon(c, A, P, x, 'NO', 'COM') || intrareButon(c, A, P, x, 'COM', 'NO');
  T.ttp223 = (c, A, P, x) => { const g = A.gpio(c, 'SIG'); if (!g) return nelegat(P, c); const pin = P.pin(c, g); P.setup('pinMode(' + pin + ', INPUT);'); x.butoane.push({ c, pin, apasat: 'HIGH', eticheta: c.eticheta }); return true; };
  function senzorDigital(c, A, P, x, pinId, text, activ) {
    const g = A.gpio(c, pinId);
    if (!g) return nelegat(P, c);
    const pin = P.pin(c, g);
    const v = P.nume(c, 'Vechi');
    P.setup('pinMode(' + pin + ', INPUT);');
    P.global('int ' + v + ' = -1;');
    P.bucla('// ' + c.eticheta + ': anunță când se schimbă ieșirea', '{', '  int s = digitalRead(' + pin + ');', '  if (s != ' + v + ') {', '    ' + v + ' = s;', '    Serial.println(s == ' + (activ || 'HIGH') + ' ? "' + c.eticheta + ': ' + text[0] + '" : "' + c.eticheta + ': ' + text[1] + '");', '  }', '}');
    return true;
  }
  T.pir = (c, A, P, x) => senzorDigital(c, A, P, x, 'OUT', ['miscare detectata', 'liniste'], 'HIGH');
  T['obstacol-ir'] = (c, A, P, x) => senzorDigital(c, A, P, x, 'DO', ['obstacol in fata', 'drum liber'], 'LOW');
  T.hall = (c, A, P, x) => senzorDigital(c, A, P, x, 'DO', ['magnet aproape', 'fara magnet'], 'LOW');
  T.inclinare = (c, A, P, x) => senzorDigital(c, A, P, x, 'DO', ['inclinat', 'drept'], 'HIGH');
  T.vibratii = (c, A, P, x) => senzorDigital(c, A, P, x, 'DO', ['vibratii', 'liniste'], 'HIGH');
  T.pad_tactil = null;
  T['pad-tactil'] = (c, A, P) => {
    const g = A.gpio(c, 'P');
    if (!g) return nelegat(P, c);
    if (A.platforma !== 'esp32' || !A.cip.touch || A.cip.touch[g.gpio] === undefined) return nelegat(P, c, 'pinul nu e tactil (pe ESP32: T0–T9)');
    const pin = P.pin(c, g);
    P.periodic('Serial.printf("' + c.eticheta + ' (atingere): %d\\n", touchRead(' + pin + '));   // scade când îl atingi');
    return true;
  };

  // intrări analogice
  function analogic(c, A, P, x, pinId, eticheta, calc) {
    const g = A.gpio(c, pinId);
    if (!g) return nelegat(P, c);
    const pin = P.pin(c, g);
    if (!esteAdc(A, g.gpio)) P.nota(c.eticheta + ': GPIO' + g.gpio + ' nu are convertor analogic (ADC). Mută firul pe un pin ADC.');
    const v = P.nume(c);
    P.global('int ' + v + ' = 0;');
    P.periodic(v + ' = analogRead(' + pin + ');', calc ? calc(v, pin) : 'Serial.printf("' + (eticheta || c.eticheta) + ': %d\\n", ' + v + ');');
    x.analogice.push({ c, v, pin });
    return true;
  }
  T.potentiometru = (c, A, P, x) => analogic(c, A, P, x, 'W', c.eticheta + ' (pozitie)');
  T.fotorezistor = (c, A, P, x) => { const p = A.gpio(c, '1') ? '1' : '2'; return analogic(c, A, P, x, p, c.eticheta + ' (lumina)'); };
  // senzori de temperatură analogici: o funcție care dă gradele, folosită și de afișaje
  function temperaturaAnalogica(c, A, P, x, pinId, corp) {
    const g = A.gpio(c, pinId);
    if (!g) return nelegat(P, c);
    const pin = P.pin(c, g);
    if (!esteAdc(A, g.gpio)) P.nota(c.eticheta + ': GPIO' + g.gpio + ' nu are convertor analogic (ADC). Mută firul pe un pin ADC.');
    const f = P.nume(c, 'Temperatura');
    P.functie('// ' + c.eticheta + ': temperatura în °C\nfloat ' + f + '() {\n' + corp(pin).map(l => '  ' + l).join('\n') + '\n}');
    P.periodic('Serial.printf("' + c.eticheta + ': %.1f C\\n", ' + f + '());');
    x.valori.push({ nume: 'Temp', expr: f + '()', fmt: '%.1f C' });
    return true;
  }
  T.ntc = (c, A, P, x) => {
    const p = A.gpio(c, '1') ? '1' : '2';
    const r25 = +((c.prop || {}).r25) || 10000, beta = +((c.prop || {}).beta) || 3950;
    const maxAdc = A.platforma === 'esp32' ? 4095 : 1023;
    const laGnd = A.putere(c, p === '1' ? '2' : '1') === 'gnd';
    return temperaturaAnalogica(c, A, P, x, p, (pin) => [
      'int v = analogRead(' + pin + ');',
      '// divizor cu un rezistor de ' + r25 + ' Ω; termistorul e ' + (laGnd ? 'spre GND' : 'spre 3,3 V'),
      'float r = ' + (laGnd ? r25 + '.0 * v / max(' + maxAdc + ' - v, 1)' : r25 + '.0 * (' + maxAdc + ' - v) / max(v, 1)') + ';',
      'return 1.0 / (1.0 / 298.15 + log(r / ' + r25 + '.0) / ' + beta + '.0) - 273.15;   // ecuația Beta'
    ]);
  };
  T.lm35 = (c, A, P, x) => temperaturaAnalogica(c, A, P, x, 'OUT', (pin) => [A.platforma === 'esp32' ? 'return analogReadMilliVolts(' + pin + ') / 10.0;   // 10 mV pe grad' : 'return analogRead(' + pin + ') * 500.0 / 1023.0;']);
  T.tmp36 = (c, A, P, x) => temperaturaAnalogica(c, A, P, x, 'OUT', (pin) => [A.platforma === 'esp32' ? 'return (analogReadMilliVolts(' + pin + ') - 500) / 10.0;   // 500 mV la 0 °C, 10 mV pe grad' : 'return (analogRead(' + pin + ') * 5000.0 / 1023.0 - 500) / 10.0;']);
  T.acs712 = (c, A, P, x) => analogic(c, A, P, x, 'OUT', null, (v, pin) => A.platforma === 'esp32' ? 'Serial.printf("' + c.eticheta + ': %.2f A\\n", (analogReadMilliVolts(' + pin + ') - 2500) / ' + ({ 5: 185, 20: 100, 30: 66 }[(c.prop || {}).varianta] || 185) + '.0);   // atenție: ieșirea merge până la 5 V' : 'Serial.println(' + v + ');');
  function analogSiDigital(c, A, P, x, nume) {
    const ga = A.gpio(c, 'AO'), gd = A.gpio(c, 'DO');
    if (!ga && !gd) return nelegat(P, c);
    if (ga) analogic(c, A, P, x, 'AO', c.eticheta + ' (' + nume + ', analogic)');
    if (gd) { const pin = P.pin(c, gd, 'DO'); P.setup('pinMode(' + pin + ', INPUT);'); P.periodic('Serial.printf("' + c.eticheta + ' prag depasit: %s\\n", digitalRead(' + pin + ') == LOW ? "da" : "nu");'); }
    return true;
  }
  T['umiditate-sol'] = (c, A, P, x) => analogSiDigital(c, A, P, x, 'umiditate sol');
  T.ploaie = (c, A, P, x) => analogSiDigital(c, A, P, x, 'ploaie');
  T.mq2 = (c, A, P, x) => analogSiDigital(c, A, P, x, 'gaz');
  T.mq135 = (c, A, P, x) => analogSiDigital(c, A, P, x, 'calitatea aerului');
  T.sunet = (c, A, P, x) => analogSiDigital(c, A, P, x, 'sunet');
  T.flacara = (c, A, P, x) => analogSiDigital(c, A, P, x, 'flacara');
  T['nivel-apa'] = (c, A, P, x) => analogic(c, A, P, x, 'AO', c.eticheta + ' (nivel apa)');
  T.joystick = (c, A, P, x) => {
    const gx = A.gpio(c, 'VRx'), gy = A.gpio(c, 'VRy'), gs = A.gpio(c, 'SW');
    if (!gx && !gy && !gs) return nelegat(P, c);
    const px = gx ? P.pin(c, gx, 'X') : null, py = gy ? P.pin(c, gy, 'Y') : null, ps = gs ? P.pin(c, gs, 'SW') : null;
    if (ps) P.setup('pinMode(' + ps + ', INPUT_PULLUP);');
    P.periodic('Serial.printf("' + c.eticheta + ': x=%d y=%d buton=%s\\n", ' + (px ? 'analogRead(' + px + ')' : '0') + ', ' + (py ? 'analogRead(' + py + ')' : '0') + ', ' + (ps ? 'digitalRead(' + ps + ') == LOW ? "apasat" : "liber"' : '"-"') + ');');
    return true;
  };
  T.encoder = (c, A, P) => {
    const ga = A.gpio(c, 'CLK'), gb = A.gpio(c, 'DT'), gs = A.gpio(c, 'SW');
    if (!ga || !gb) return nelegat(P, c, 'CLK și DT trebuie legate la GPIO');
    const pa = P.pin(c, ga, 'CLK'), pb = P.pin(c, gb, 'DT'), ps = gs ? P.pin(c, gs, 'SW') : null;
    const v = P.nume(c, 'Pozitie'), u = P.nume(c, 'Clk');
    P.global('int ' + v + ' = 0;', 'int ' + u + ' = HIGH;');
    P.setup('pinMode(' + pa + ', INPUT_PULLUP);', 'pinMode(' + pb + ', INPUT_PULLUP);');
    if (ps) P.setup('pinMode(' + ps + ', INPUT_PULLUP);');
    P.bucla('// ' + c.eticheta + ': la fiecare front al lui CLK, DT spune sensul', '{', '  int clk = digitalRead(' + pa + ');', '  if (clk != ' + u + ' && clk == LOW) {', '    ' + v + ' += digitalRead(' + pb + ') != clk ? 1 : -1;', '    Serial.printf("' + c.eticheta + ': %d\\n", ' + v + ');', '  }', '  ' + u + ' = clk;', ps ? '  if (digitalRead(' + ps + ') == LOW) { ' + v + ' = 0; }' : '', '}');
    return true;
  };
  T.tastatura = (c, A, P) => {
    const n = (c.prop || {}).marime === '4x3' ? 3 : 4;
    const r = [1, 2, 3, 4].map(i => A.gpio(c, 'R' + i)), k = [1, 2, 3, 4].slice(0, n).map(i => A.gpio(c, 'C' + i));
    if (r.some(z => !z) || k.some(z => !z)) return nelegat(P, c, 'toate rândurile și coloanele tastaturii trebuie legate la GPIO');
    const pr = r.map((g, i) => P.pin(c, g, 'R' + (i + 1))), pc = k.map((g, i) => P.pin(c, g, 'C' + (i + 1)));
    const t = n === 3 ? '{"123", "456", "789", "*0#"}' : '{"123A", "456B", "789C", "*0#D"}';
    P.global('const int RANDURI_' + c.eticheta.toUpperCase() + '[4] = {' + pr.join(', ') + '};', 'const int COLOANE_' + c.eticheta.toUpperCase() + '[' + n + '] = {' + pc.join(', ') + '};', 'const char TASTE_' + c.eticheta.toUpperCase() + '[4][' + (n + 1) + '] = ' + t + ';');
    const f = P.nume(c, 'Tasta');
    const R = 'RANDURI_' + c.eticheta.toUpperCase(), C = 'COLOANE_' + c.eticheta.toUpperCase(), K = 'TASTE_' + c.eticheta.toUpperCase();
    P.functie('// ' + c.eticheta + ': coloanele au pull-up, rândurile se pun pe rând la LOW\nchar ' + f + '() {\n  for (int r = 0; r < 4; r++) {\n    digitalWrite(' + R + '[r], LOW);\n    for (int k = 0; k < ' + n + '; k++) {\n      if (digitalRead(' + C + '[k]) == LOW) {\n        while (digitalRead(' + C + '[k]) == LOW) delay(5);   // așteaptă eliberarea\n        digitalWrite(' + R + '[r], HIGH);\n        return ' + K + '[r][k];\n      }\n    }\n    digitalWrite(' + R + '[r], HIGH);\n  }\n  return 0;\n}');
    P.setup('for (int i = 0; i < 4; i++) { pinMode(' + R + '[i], OUTPUT); digitalWrite(' + R + '[i], HIGH); }', 'for (int i = 0; i < ' + n + '; i++) pinMode(' + C + '[i], INPUT_PULLUP);');
    P.bucla('{', '  char t = ' + f + '();', '  if (t) Serial.printf("' + c.eticheta + ': tasta %c\\n", t);', '}');
    return true;
  };

  // senzori cu biblioteci
  T.dht = (c, A, P, x) => {
    const g = A.gpio(c, 'DATA');
    if (!g) return nelegat(P, c);
    const pin = P.pin(c, g);
    const v = P.nume(c);
    P.include('DHT.h');
    P.global('DHT ' + v + '(' + pin + ', ' + ((c.prop || {}).model === 'dht11' ? 'DHT11' : 'DHT22') + ');');
    P.setup(v + '.begin();');
    P.periodic('{', '  float t = ' + v + '.readTemperature(), u = ' + v + '.readHumidity();', '  if (isnan(t)) Serial.println("' + c.eticheta + ': nu raspunde (verifica firul de date)");', '  else Serial.printf("' + c.eticheta + ': %.1f C, %.0f%%\\n", t, u);', '}');
    x.valori.push({ nume: 'Temp', expr: v + '.readTemperature()', fmt: '%.1f C' });
    return true;
  };
  T.ds18b20 = (c, A, P, x) => {
    const g = A.gpio(c, 'DQ');
    if (!g) return nelegat(P, c);
    const pin = P.pin(c, g);
    const v = P.nume(c);
    P.include('OneWire.h'); P.include('DallasTemperature.h');
    P.global('OneWire ' + v + 'Fir(' + pin + ');', 'DallasTemperature ' + v + '(&' + v + 'Fir);   // are nevoie de un rezistor de 4,7 kΩ între DQ și 3,3 V');
    P.setup(v + '.begin();');
    P.periodic(v + '.requestTemperatures();', 'Serial.printf("' + c.eticheta + ': %.2f C\\n", ' + v + '.getTempCByIndex(0));');
    x.valori.push({ nume: 'Temp', expr: v + '.getTempCByIndex(0)', fmt: '%.1f C' });
    return true;
  };
  T.hcsr04 = (c, A, P, x) => {
    const gt = A.gpio(c, 'TRIG'), ge = A.gpio(c, 'ECHO');
    if (!gt || !ge) return nelegat(P, c, 'TRIG și ECHO trebuie legate la GPIO');
    const pt = P.pin(c, gt, 'TRIG'), pe = P.pin(c, ge, 'ECHO');
    const f = P.nume(c, 'Distanta');
    P.setup('pinMode(' + pt + ', OUTPUT);', 'pinMode(' + pe + ', INPUT);');
    P.functie('// ' + c.eticheta + ': impuls de 10 µs pe TRIG, apoi durata ecoului (sunetul merge dus-întors)\nfloat ' + f + '() {\n  digitalWrite(' + pt + ', LOW);\n  delayMicroseconds(2);\n  digitalWrite(' + pt + ', HIGH);\n  delayMicroseconds(10);\n  digitalWrite(' + pt + ', LOW);\n  long us = pulseIn(' + pe + ', HIGH, 30000);\n  return us * 0.0343 / 2;   // cm\n}');
    P.periodic('Serial.printf("' + c.eticheta + ': %.1f cm\\n", ' + f + '());');
    x.valori.push({ nume: 'Dist', expr: f + '()', fmt: '%.0f cm' });
    if (A.platforma !== 'avr') P.nota(c.eticheta + ': ECHO dă 5 V; pe ESP folosește un divizor de tensiune (ex. 1 kΩ + 2 kΩ).');
    return true;
  };
  function i2c(A, P) {
    P.include('Wire.h');
    if (!P.i2cPornit) {
      P.i2cPornit = true;
      const k = A.constante;
      P.setup('Wire.begin();   // SDA = ' + (k.SDA !== undefined ? k.SDA : '?') + ', SCL = ' + (k.SCL !== undefined ? k.SCL : '?'));
    }
  }
  function verificaI2c(c, A, P, sda, scl) {
    const gs = A.gpio(c, sda || 'SDA'), gc = A.gpio(c, scl || 'SCL');
    const k = A.constante;
    if (!gs || !gc) { nelegat(P, c, 'SDA și SCL nu sunt legate la placă'); return false; }
    if (gs.gpio !== k.SDA || gc.gpio !== k.SCL) {
      if (!P.i2cPornit) { P.i2cPornit = true; P.include('Wire.h'); P.setup('Wire.begin(' + gs.gpio + ', ' + gc.gpio + ');   // SDA, SCL pe pinii din schemă'); }
      return true;
    }
    i2c(A, P);
    return true;
  }
  T.bme280 = (c, A, P, x) => {
    if (!verificaI2c(c, A, P)) return false;
    const bmp = (c.prop || {}).cip === 'bmp280';
    const v = P.nume(c);
    const adr = (c.prop || {}).adresa || '0x76';
    P.include('Adafruit_Sensor.h'); P.include(bmp ? 'Adafruit_BMP280.h' : 'Adafruit_BME280.h');
    P.global((bmp ? 'Adafruit_BMP280 ' : 'Adafruit_BME280 ') + v + ';');
    P.setup('if (!' + v + '.begin(' + adr + ')) Serial.println("' + c.eticheta + ' nu raspunde la adresa ' + adr + '");');
    P.periodic('Serial.printf("' + c.eticheta + ': %.1f C, %.0f hPa' + (bmp ? '' : ', %.0f%%') + '\\n", ' + v + '.readTemperature(), ' + v + '.readPressure() / 100.0' + (bmp ? '' : ', ' + v + '.readHumidity()') + ');');
    x.valori.push({ nume: 'Temp', expr: v + '.readTemperature()', fmt: '%.1f C' });
    return true;
  };
  T.mpu6050 = (c, A, P) => {
    if (!verificaI2c(c, A, P)) return false;
    const v = P.nume(c);
    P.include('Adafruit_MPU6050.h'); P.include('Adafruit_Sensor.h');
    P.global('Adafruit_MPU6050 ' + v + ';');
    P.setup('if (!' + v + '.begin()) Serial.println("' + c.eticheta + ' nu raspunde");');
    P.periodic('{', '  sensors_event_t a, g, t;', '  ' + v + '.getEvent(&a, &g, &t);', '  Serial.printf("' + c.eticheta + ': acc %.2f %.2f %.2f m/s2, gir %.2f %.2f %.2f rad/s\\n", a.acceleration.x, a.acceleration.y, a.acceleration.z, g.gyro.x, g.gyro.y, g.gyro.z);', '}');
    return true;
  };
  T.bh1750 = (c, A, P, x) => {
    if (!verificaI2c(c, A, P)) return false;
    const v = P.nume(c);
    P.include('BH1750.h');
    P.global('BH1750 ' + v + ';');
    P.setup(v + '.begin();');
    P.periodic('Serial.printf("' + c.eticheta + ': %.0f lx\\n", ' + v + '.readLightLevel());');
    x.valori.push({ nume: 'Lumina', expr: v + '.readLightLevel()', fmt: '%.0f lx' });
    return true;
  };
  T.hx711 = (c, A, P) => {
    const gd = A.gpio(c, 'DT'), gc = A.gpio(c, 'SCK');
    if (!gd || !gc) return nelegat(P, c);
    const pd = P.pin(c, gd, 'DT'), pc = P.pin(c, gc, 'SCK');
    const v = P.nume(c);
    P.include('HX711.h');
    P.global('HX711 ' + v + ';');
    P.setup(v + '.begin(' + pd + ', ' + pc + ');', v + '.set_scale(420.0);   // factorul de calibrare: se află cu o greutate cunoscută', v + '.tare();');
    P.periodic('Serial.printf("' + c.eticheta + ': %.1f g\\n", ' + v + '.get_units(5));');
    return true;
  };

  // ieșiri
  T.buzzer_activ = null;
  T['buzzer-activ'] = (c, A, P, x) => { const g = A.gpio(c, 'P', true) || A.gpio(c, 'N', true); if (!g) return nelegat(P, c); const pin = P.pin(c, g); P.setup('pinMode(' + pin + ', OUTPUT);'); x.bipuri.push({ c, pin, activ: true }); return true; };
  T['buzzer-pasiv'] = (c, A, P, x) => { const g = A.gpio(c, 'P', true) || A.gpio(c, 'N', true); if (!g) return nelegat(P, c); const pin = P.pin(c, g); x.bipuri.push({ c, pin, activ: false }); return true; };
  T.difuzor = T['buzzer-pasiv'];
  T.releu = (c, A, P, x) => {
    const g = A.gpio(c, 'IN');
    if (!g) return nelegat(P, c);
    const pin = P.pin(c, g);
    const low = (c.prop || {}).declansare !== 'high';
    P.setup('pinMode(' + pin + ', OUTPUT);', 'digitalWrite(' + pin + ', ' + (low ? 'HIGH' : 'LOW') + ');   // releul pornește oprit' + (low ? ' (modulul se declanșează pe LOW)' : ''));
    x.relee.push({ c, pin, on: low ? 'LOW' : 'HIGH', off: low ? 'HIGH' : 'LOW' });
    return true;
  };
  T['modul-mosfet'] = (c, A, P, x) => { const g = A.gpio(c, 'SIG'); if (!g) return nelegat(P, c); const pin = P.pin(c, g); x.pwm.push({ c, pin }); return true; };
  T.mosfet = (c, A, P, x) => { const g = A.gpio(c, 'G', true); if (!g) return nelegat(P, c, 'poarta nu e legată la un GPIO'); const pin = P.pin(c, g); x.pwm.push({ c, pin }); return true; };
  T.tranzistor = (c, A, P, x) => { const g = A.gpio(c, 'B', true); if (!g) return nelegat(P, c, 'baza nu e legată la un GPIO (prin rezistor)'); const pin = P.pin(c, g); P.setup('pinMode(' + pin + ', OUTPUT);'); x.relee.push({ c, pin, on: 'HIGH', off: 'LOW' }); return true; };
  T.servo = (c, A, P, x) => {
    const g = A.gpio(c, 'SIG');
    if (!g) return nelegat(P, c);
    const pin = P.pin(c, g);
    const v = P.nume(c);
    P.include(A.platforma === 'esp32' ? 'ESP32Servo.h' : 'Servo.h');
    P.global('Servo ' + v + ';');
    P.setup(v + '.attach(' + pin + ');');
    x.servo.push({ c, v });
    return true;
  };
  T['stepper-28byj'] = (c, A, P) => {
    const g = [1, 2, 3, 4].map(i => A.gpio(c, 'IN' + i));
    if (g.some(z => !z)) return nelegat(P, c, 'IN1–IN4 trebuie legate la GPIO');
    const p = g.map((z, i) => P.pin(c, z, 'IN' + (i + 1)));
    const v = P.nume(c);
    P.include('Stepper.h');
    P.global('// ordinea IN1, IN3, IN2, IN4 e cea corectă pentru 28BYJ-48 cu biblioteca Stepper', 'Stepper ' + v + '(2048, ' + p[0] + ', ' + p[2] + ', ' + p[1] + ', ' + p[3] + ');');
    P.setup(v + '.setSpeed(10);   // rotații pe minut');
    P.bucla('// ' + c.eticheta + ': o jumătate de tură într-un sens, apoi înapoi', v + '.step(1024);', v + '.step(-1024);');
    return true;
  };
  T.a4988 = (c, A, P) => {
    const gs = A.gpio(c, 'STEP'), gd = A.gpio(c, 'DIR');
    if (!gs || !gd) return nelegat(P, c, 'STEP și DIR trebuie legate la GPIO');
    const ps = P.pin(c, gs, 'STEP'), pd = P.pin(c, gd, 'DIR');
    const v = P.nume(c);
    P.include('AccelStepper.h');
    P.global('AccelStepper ' + v + '(AccelStepper::DRIVER, ' + ps + ', ' + pd + ');');
    P.setup(v + '.setMaxSpeed(800);', v + '.setAcceleration(400);', v + '.moveTo(1600);');
    P.bucla('// ' + c.eticheta + ': dus-întors, cu accelerație', 'if (' + v + '.distanceToGo() == 0) ' + v + '.moveTo(-' + v + '.currentPosition());', v + '.run();');
    return true;
  };
  T.l298n = (c, A, P, x) => {
    let ok = false;
    for (const [en, i1, i2, jp, lit] of [['ENA', 'IN1', 'IN2', 'jumperA', 'A'], ['ENB', 'IN3', 'IN4', 'jumperB', 'B']]) {
      const g1 = A.gpio(c, i1), g2 = A.gpio(c, i2), ge = (c.prop || {})[jp] === 'da' ? null : A.gpio(c, en);
      if (!g1 || !g2) continue;
      ok = true;
      const p1 = P.pin(c, g1, i1), p2 = P.pin(c, g2, i2), pe = ge ? P.pin(c, ge, en) : null;
      P.setup('pinMode(' + p1 + ', OUTPUT);', 'pinMode(' + p2 + ', OUTPUT);');
      const f = P.nume(c, 'Motor' + lit);
      P.functie('// ' + c.eticheta + ' motorul ' + lit + ': viteza -255..255 (semnul dă sensul)' + (pe ? '' : '; cu jumperul pe ' + en + ' merge doar la viteză maximă') + '\nvoid ' + f + '(int viteza) {\n  digitalWrite(' + p1 + ', viteza > 0 ? HIGH : LOW);\n  digitalWrite(' + p2 + ', viteza < 0 ? HIGH : LOW);\n' + (pe ? '  analogWrite(' + pe + ', abs(viteza));\n' : '') + '}');
      x.motoare.push({ c, f });
    }
    return ok || nelegat(P, c, 'IN1/IN2 (sau IN3/IN4) nu sunt legate la GPIO');
  };

  // afișaje
  function textAfisaj(x) {
    // ce arată afișajele: prima valoare măsurată sau timpul de la pornire
    const v = x.valori[0];
    return v ? { eticheta: v.nume, expr: v.expr, fmt: v.fmt } : null;
  }
  T['oled-128x64'] = (c, A, P, x) => {
    if (!verificaI2c(c, A, P)) return false;
    const h = c.tip === 'oled-128x32' ? 32 : 64;
    const v = P.nume(c);
    const sh = c.tip === 'oled-sh1106';
    P.include('Adafruit_GFX.h'); P.include(sh ? 'Adafruit_SH110X.h' : 'Adafruit_SSD1306.h');
    P.global(sh ? 'Adafruit_SH1106G ' + v + '(128, 64, &Wire, -1);' : 'Adafruit_SSD1306 ' + v + '(128, ' + h + ', &Wire, -1);');
    P.setup(sh ? v + '.begin(' + ((c.prop || {}).adresa || '0x3C') + ', true);' : 'if (!' + v + '.begin(SSD1306_SWITCHCAPVCC, ' + ((c.prop || {}).adresa || '0x3C') + ')) Serial.println("' + c.eticheta + ' nu raspunde");');
    const alb = sh ? 'SH110X_WHITE' : 'SSD1306_WHITE';
    x.afisaje.push({ c, cod: (t) => [v + '.clearDisplay();', v + '.setTextColor(' + alb + ');', v + '.setTextSize(1);', v + '.setCursor(0, 0);', v + '.println("' + faraDiacritice(A.numeProiect).slice(0, 20) + '");', v + '.setTextSize(2);', v + '.setCursor(0, ' + (h === 32 ? 12 : 24) + ');', t ? v + '.printf("' + t.fmt + '", ' + t.expr + ');' : v + '.printf("%lus", millis() / 1000);', v + '.display();'] });
    return true;
  };
  T['oled-128x32'] = T['oled-128x64'];
  T['oled-sh1106'] = T['oled-128x64'];
  T['lcd-16x2-i2c'] = (c, A, P, x) => {
    if (!verificaI2c(c, A, P)) return false;
    const mare = c.tip === 'lcd-20x4-i2c';
    const v = P.nume(c);
    P.include('LiquidCrystal_I2C.h');
    P.global('LiquidCrystal_I2C ' + v + '(' + ((c.prop || {}).adresa || '0x27') + ', ' + (mare ? '20, 4' : '16, 2') + ');');
    P.setup(v + '.init();', v + '.backlight();', v + '.print("' + faraDiacritice(A.numeProiect).slice(0, mare ? 20 : 16) + '");');
    x.afisaje.push({ c, cod: (t) => [v + '.setCursor(0, 1);', t ? v + '.printf("' + t.eticheta + ' ' + t.fmt + '   ", ' + t.expr + ');' : v + '.printf("%lu s      ", millis() / 1000);'] });
    return true;
  };
  T['lcd-20x4-i2c'] = T['lcd-16x2-i2c'];
  T['lcd-16x2'] = (c, A, P, x) => {
    const g = ['RS', 'E', 'D4', 'D5', 'D6', 'D7'].map(p => A.gpio(c, p));
    if (g.some(z => !z)) return nelegat(P, c, 'RS, E și D4–D7 trebuie legate la GPIO');
    const p = g.map((z, i) => P.pin(c, z, ['RS', 'E', 'D4', 'D5', 'D6', 'D7'][i]));
    const v = P.nume(c);
    P.include('LiquidCrystal.h');
    P.global('LiquidCrystal ' + v + '(' + p.join(', ') + ');');
    P.setup(v + '.begin(16, 2);', v + '.print("' + faraDiacritice(A.numeProiect).slice(0, 16) + '");');
    x.afisaje.push({ c, cod: (t) => [v + '.setCursor(0, 1);', t ? v + '.print(' + t.expr + ');' : v + '.print(millis() / 1000);'] });
    return true;
  };
  T.tft = (c, A, P, x) => {
    const gc = A.gpio(c, 'CS'), gd = A.gpio(c, 'DC'), gr = A.gpio(c, 'RST');
    if (!gc || !gd) return nelegat(P, c, 'CS și DC trebuie legate la GPIO');
    const model = (c.prop || {}).model || 'ili9341';
    const cls = { ili9341: 'Adafruit_ILI9341', st7789: 'Adafruit_ST7789', st7735: 'Adafruit_ST7735', ili9488: 'Adafruit_ILI9488', gc9a01: 'Adafruit_GC9A01A' }[model] || 'Adafruit_ILI9341';
    const pc = P.pin(c, gc, 'CS'), pd = P.pin(c, gd, 'DC'), pr = gr ? P.pin(c, gr, 'RST') : '-1';
    const v = P.nume(c);
    P.include('SPI.h'); P.include('Adafruit_GFX.h'); P.include(cls + '.h');
    P.global(cls + ' ' + v + '(' + pc + ', ' + pd + ', ' + pr + ');');
    P.setup(v + '.begin();', v + '.fillScreen(0x0000);', v + '.setTextColor(0xFFFF, 0x0000);', v + '.setTextSize(2);', v + '.setCursor(10, 10);', v + '.print("' + faraDiacritice(A.numeProiect).slice(0, 18) + '");');
    x.afisaje.push({ c, cod: (t) => [v + '.setCursor(10, 50);', v + '.setTextSize(3);', t ? v + '.printf("' + t.fmt + '  ", ' + t.expr + ');' : v + '.printf("%lu s  ", millis() / 1000);'] });
    return true;
  };
  T.tm1637 = (c, A, P, x) => {
    const gc = A.gpio(c, 'CLK'), gd = A.gpio(c, 'DIO');
    if (!gc || !gd) return nelegat(P, c);
    const v = P.nume(c);
    P.include('TM1637Display.h');
    P.global('TM1637Display ' + v + '(' + P.pin(c, gc, 'CLK') + ', ' + P.pin(c, gd, 'DIO') + ');');
    P.setup(v + '.setBrightness(5);');
    x.afisaje.push({ c, cod: (t) => [t ? v + '.showNumberDec((int)(' + t.expr + '));' : v + '.showNumberDecEx((millis() / 1000 / 60) * 100 + (millis() / 1000) % 60, 0b01000000, true);   // mm:ss'] });
    return true;
  };
  T.max7219 = (c, A, P) => {
    const gd = A.gpio(c, 'DIN'), gc = A.gpio(c, 'CLK'), gs = A.gpio(c, 'CS');
    if (!gd || !gc || !gs) return nelegat(P, c);
    const v = P.nume(c);
    P.include('LedControl.h');
    P.global('LedControl ' + v + ' = LedControl(' + P.pin(c, gd, 'DIN') + ', ' + P.pin(c, gc, 'CLK') + ', ' + P.pin(c, gs, 'CS') + ', 1);');
    P.setup(v + '.shutdown(0, false);', v + '.setIntensity(0, 4);', v + '.clearDisplay(0);');
    P.bucla('// ' + c.eticheta + ': un punct care se plimbă pe matrice', '{', '  static int k = 0;', '  static unsigned long t = 0;', '  if (millis() - t > 80) {', '    t = millis();', '    ' + v + '.setLed(0, k / 8, k % 8, false);', '    k = (k + 1) % 64;', '    ' + v + '.setLed(0, k / 8, k % 8, true);', '  }', '}');
    return true;
  };
  T['sapte-segmente'] = (c, A, P) => {
    const seg = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(s => A.gpio(c, s, true));
    if (seg.some(z => !z)) return nelegat(P, c, 'segmentele A–G trebuie legate la GPIO (prin rezistoare)');
    const p = seg.map((z, i) => P.pin(c, z, 'ABCDEFG'[i]));
    const an = (c.prop || {}).comun === 'anod';
    const n = c.eticheta.toUpperCase();
    P.global('const int SEGMENTE_' + n + '[7] = {' + p.join(', ') + '};', '// ce segmente (a..g) se aprind pentru cifrele 0..9', 'const byte CIFRE_' + n + '[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};');
    P.setup('for (int i = 0; i < 7; i++) pinMode(SEGMENTE_' + n + '[i], OUTPUT);');
    P.bucla('// ' + c.eticheta + ': numără secundele (0..9)', '{', '  byte m = CIFRE_' + n + '[(millis() / 1000) % 10];', '  for (int i = 0; i < 7; i++) digitalWrite(SEGMENTE_' + n + '[i], ((m >> i) & 1) ' + (an ? '? LOW : HIGH' : '? HIGH : LOW') + ');', '}');
    return true;
  };

  // comunicații
  function serial2(c, A, P, rx, tx, baud) {
    // RX-ul plăcii se leagă la TX-ul modulului și invers
    const gr = A.gpio(c, tx), gt = A.gpio(c, rx);
    if (!gr) return null;
    if (A.platforma === 'esp32') {
      const pr = P.pin(c, gr, 'TX'), pt = gt ? P.pin(c, gt, 'RX') : '-1';
      P.setup('Serial2.begin(' + baud + ', SERIAL_8N1, ' + pr + ', ' + pt + ');   // RX-ul plăcii la TX-ul modulului');
      return 'Serial2';
    }
    P.include('SoftwareSerial.h');
    const v = P.nume(c, 'Serial');
    P.global('SoftwareSerial ' + v + '(' + P.pin(c, gr, 'TX') + ', ' + (gt ? P.pin(c, gt, 'RX') : '-1') + ');');
    P.setup(v + '.begin(' + baud + ');');
    return v;
  }
  T.rtc = (c, A, P) => {
    if (!verificaI2c(c, A, P)) return false;
    const ds1307 = (c.prop || {}).model === 'ds1307';
    const v = P.nume(c);
    P.include('RTClib.h');
    P.global((ds1307 ? 'RTC_DS1307 ' : 'RTC_DS3231 ') + v + ';');
    P.setup('if (!' + v + '.begin()) Serial.println("' + c.eticheta + ' nu raspunde");', ds1307 ? 'if (!' + v + '.isrunning()) ' + v + '.adjust(DateTime(F(__DATE__), F(__TIME__)));' : 'if (' + v + '.lostPower()) ' + v + '.adjust(DateTime(F(__DATE__), F(__TIME__)));   // ora compilării');
    P.periodic('{', '  DateTime acum = ' + v + '.now();', '  Serial.printf("' + c.eticheta + ': %02d.%02d.%04d %02d:%02d:%02d\\n", acum.day(), acum.month(), acum.year(), acum.hour(), acum.minute(), acum.second());', '}');
    return true;
  };
  T.rc522 = (c, A, P) => {
    const gs = A.gpio(c, 'SDA'), gr = A.gpio(c, 'RST');
    if (!gs) return nelegat(P, c, 'SDA (CS) trebuie legat la un GPIO; SCK/MOSI/MISO la pinii SPI');
    const v = P.nume(c);
    P.include('SPI.h'); P.include('MFRC522.h');
    P.global('MFRC522 ' + v + '(' + P.pin(c, gs, 'SS') + ', ' + (gr ? P.pin(c, gr, 'RST') : '-1') + ');');
    P.setup('SPI.begin();', v + '.PCD_Init();');
    P.bucla('// ' + c.eticheta + ': arată UID-ul fiecărui card apropiat', 'if (' + v + '.PICC_IsNewCardPresent() && ' + v + '.PICC_ReadCardSerial()) {', '  Serial.print("' + c.eticheta + ' card:");', '  for (byte i = 0; i < ' + v + '.uid.size; i++) Serial.printf(" %02X", ' + v + '.uid.uidByte[i]);', '  Serial.println();', '  ' + v + '.PICC_HaltA();', '}');
    return true;
  };
  T['ir-receptor'] = (c, A, P) => {
    const g = A.gpio(c, 'OUT');
    if (!g) return nelegat(P, c);
    const pin = P.pin(c, g);
    P.include('IRremote.hpp');
    P.setup('IrReceiver.begin(' + pin + ', ENABLE_LED_FEEDBACK);');
    P.bucla('// ' + c.eticheta + ': codurile tastelor telecomenzii (protocol NEC)', 'if (IrReceiver.decode()) {', '  if (!(IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT)) Serial.printf("' + c.eticheta + ': tasta 0x%02X\\n", IrReceiver.decodedIRData.command);', '  IrReceiver.resume();', '}');
    return true;
  };
  T['gps-neo6m'] = (c, A, P) => {
    const s = serial2(c, A, P, 'RX', 'TX', 9600);
    if (!s) return nelegat(P, c, 'TX-ul GPS-ului trebuie legat la un GPIO (RX-ul plăcii)');
    const v = P.nume(c);
    P.include('TinyGPS++.h');
    P.global('TinyGPSPlus ' + v + ';');
    P.bucla('while (' + s + '.available()) ' + v + '.encode(' + s + '.read());   // ' + c.eticheta + ': citește propozițiile NMEA');
    P.periodic('if (' + v + '.location.isValid()) Serial.printf("' + c.eticheta + ': %.6f, %.6f, %d sateliti\\n", ' + v + '.location.lat(), ' + v + '.location.lng(), (int)' + v + '.satellites.value());', 'else Serial.printf("' + c.eticheta + ': fara pozitie (%lu caractere primite)\\n", ' + v + '.charsProcessed());');
    return true;
  };
  T.hc05 = (c, A, P) => {
    const s = serial2(c, A, P, 'RXD', 'TXD', 9600);
    if (!s) return nelegat(P, c, 'TXD-ul modulului trebuie legat la un GPIO (RX-ul plăcii)');
    P.bucla('// ' + c.eticheta + ': ce vine de pe telefon apare în monitorul serial și invers', 'while (' + s + '.available()) Serial.write(' + s + '.read());', 'while (Serial.available()) ' + s + '.write(Serial.read());');
    return true;
  };
  T.dfplayer = (c, A, P) => {
    const s = serial2(c, A, P, 'RX', 'TX', 9600);
    if (!s) return nelegat(P, c, 'TX-ul modulului trebuie legat la un GPIO (RX-ul plăcii)');
    const v = P.nume(c);
    P.include('DFRobotDFPlayerMini.h');
    P.global('DFRobotDFPlayerMini ' + v + ';');
    P.setup('if (' + v + '.begin(' + s + ')) {', '  ' + v + '.volume(20);   // 0..30', '  ' + v + '.play(1);      // prima piesă de pe card', '} else Serial.println("' + c.eticheta + ' nu raspunde (card, fire RX/TX)");');
    return true;
  };
  T['card-sd'] = (c, A, P) => {
    const g = A.gpio(c, 'CS');
    if (!g) return nelegat(P, c, 'CS trebuie legat la un GPIO; SCK/MOSI/MISO la pinii SPI');
    const pin = P.pin(c, g);
    P.include('SPI.h'); P.include('SD.h');
    P.setup('if (!SD.begin(' + pin + ')) Serial.println("' + c.eticheta + ': cardul nu raspunde");');
    P.periodic('{', '  File f = SD.open("/jurnal.txt", FILE_APPEND);   // se păstrează pe card', '  if (f) { f.printf("%lu\\n", millis() / 1000); f.close(); }', '}');
    return true;
  };
  T.max98357 = (c, A, P) => { P.nota(c.eticheta + ': amplificatorul I2S are nevoie de un program cu i2s_write (vezi exemplul „Sintetizator I2S”).'); return false; };
  T.inmp441 = (c, A, P) => { P.nota(c.eticheta + ': microfonul I2S se citește cu i2s_read (vezi exemplul „VU-metru cu INMP441”).'); return false; };
  T.max9814 = (c, A, P, x) => analogic(c, A, P, x, 'OUT', c.eticheta + ' (microfon)');

  // ---------- asamblarea ----------
  function genereaza(proiect) {
    const A = analizeaza(proiect);
    if (!A) return '// Adaugă o placă (ESP32) în schemă ca să pot scrie codul.\n\nvoid setup() {\n}\n\nvoid loop() {\n}\n';
    A.numeProiect = proiect.nume || 'Proiect';
    const P = Program(A);
    const x = { leduri: [], butoane: [], analogice: [], valori: [], afisaje: [], bipuri: [], relee: [], pwm: [], servo: [], motoare: [] };
    const ordine = (c) => { const d = M.componente.def(c.tip); const cat = d ? d.categorie : ''; return ['senzori', 'intrari', 'lumini', 'semiconductoare', 'motoare', 'sunet', 'afisaje', 'comunicatii'].indexOf(cat); };
    const piese = proiect.componente.filter(c => c !== A.placa && T[c.tip]).sort((a, b) => ordine(a) - ordine(b));
    const tratate = [];
    for (const c of piese) {
      const inainte = P.glob.length;
      try { if (T[c.tip](c, A, P, x)) tratate.push(c); }
      catch (e) { console.error('generator', c.tip, e); P.nota(c.eticheta + ': nu am putut scrie codul (' + e.message + ').'); }
      // fiecare piesă își are grupul ei de declarații, cu un titlu
      if (P.glob.length > inainte) P.glob.splice(inainte, 0, (inainte ? '\n' : '') + '// ' + c.eticheta + ' — ' + M.componente.def(c.tip).nume);
    }
    // legăturile dintre piese: butonul comandă LED-ul/releul, potențiometrul comandă servo-ul sau luminozitatea
    const comenzi = x.leduri.concat(x.relee.map(r => ({ c: r.c, pin: r.pin, releu: r })));
    if (x.butoane.length && comenzi.length) {
      x.butoane.forEach((b, i) => {
        const t = comenzi[i % comenzi.length];
        const st = P.nume(b.c, 'Aprins'), ult = P.nume(b.c, 'Ultim');
        P.global('', '// starea comandată de ' + b.eticheta, 'bool ' + st + ' = false;', 'int ' + ult + ' = HIGH;');
        const scrie = t.releu ? 'digitalWrite(' + t.pin + ', ' + st + ' ? ' + t.releu.on + ' : ' + t.releu.off + ');' : 'digitalWrite(' + t.pin + ', ' + st + (t.inv ? ' ? LOW : HIGH' : ' ? HIGH : LOW') + ');';
        P.bucla('// ' + b.eticheta + ' comută ' + t.c.eticheta + ' la fiecare apăsare', '{', '  int s = digitalRead(' + b.pin + ');', '  if (s == ' + b.apasat + ' && ' + ult + ' != ' + b.apasat + ') {', '    ' + st + ' = !' + st + ';', '    ' + scrie, '    Serial.println(' + st + ' ? "' + t.c.eticheta + ' pornit" : "' + t.c.eticheta + ' oprit");', '    delay(30);   // trec vibrațiile contactului', '  }', '  ' + ult + ' = s;', '}');
        t.folosit = true;
      });
    } else if (x.butoane.length) {
      for (const b of x.butoane) {
        const ult = P.nume(b.c, 'Ultim');
        P.global('int ' + ult + ' = HIGH;');
        P.bucla('{', '  int s = digitalRead(' + b.pin + ');', '  if (s != ' + ult + ') {', '    ' + ult + ' = s;', '    Serial.println(s == ' + b.apasat + ' ? "' + b.eticheta + ' apasat" : "' + b.eticheta + ' eliberat");', '    delay(30);', '  }', '}');
      }
    }
    const pot = x.analogice.find(a => a.c.tip === 'potentiometru' || a.c.tip === 'joystick');
    const maxAdc = A.platforma === 'esp32' ? 4095 : 1023;
    for (const s of x.servo) {
      if (pot) P.bucla('// ' + s.c.eticheta + ' urmărește ' + pot.c.eticheta, s.v + '.write(map(analogRead(' + pot.pin + '), 0, ' + maxAdc + ', 0, 180));');
      else P.bucla('// ' + s.c.eticheta + ': se rotește încet dus-întors', s.v + '.write(90 + 80 * sin(millis() / 1500.0));');
    }
    const libere = comenzi.filter(t => !t.folosit);
    const lumini = libere.filter(t => !t.releu);
    if (lumini.length) {
      if (pot && !x.butoane.length) {
        for (const t of lumini) P.bucla('// luminozitatea lui ' + t.c.eticheta + ' după ' + pot.c.eticheta, 'analogWrite(' + t.pin + ', ' + (t.inv ? '255 - ' : '') + 'map(analogRead(' + pot.pin + '), 0, ' + maxAdc + ', 0, 255));');
      } else if (lumini.length === 1) {
        const t = lumini[0];
        P.bucla('// ' + t.c.eticheta + ' clipește: 0,5 s aprins, 0,5 s stins', 'digitalWrite(' + t.pin + ', (millis() / 500) % 2 ' + (t.inv ? '? LOW : HIGH' : '? HIGH : LOW') + ');');
      } else {
        P.bucla('// lumini care aleargă: ' + lumini.map(t => t.c.eticheta).join(', '), '{', '  int k = (millis() / 250) % ' + lumini.length + ';', ...lumini.map((t, i) => '  digitalWrite(' + t.pin + ', k == ' + i + (t.inv ? ' ? LOW : HIGH' : ' ? HIGH : LOW') + ');'), '}');
      }
    }
    for (const r of x.relee.filter(r => !comenzi.find(t => t.releu === r && t.folosit))) {
      P.bucla('// ' + r.c.eticheta + ': pornit 2 s, oprit 2 s', 'digitalWrite(' + r.pin + ', (millis() / 2000) % 2 ? ' + r.on + ' : ' + r.off + ');');
    }
    for (const m of x.pwm) P.bucla('// ' + m.c.eticheta + ': putere care crește și scade (PWM)', 'analogWrite(' + m.pin + ', 127 + 127 * sin(millis() / 1000.0));');
    for (const m of x.motoare) P.bucla('// ' + m.c.eticheta + ': înainte, apoi înapoi', m.f + '((millis() / 3000) % 2 ? 200 : -200);');
    for (const b of x.bipuri) {
      if (b.activ) P.bucla('// ' + b.c.eticheta + ': un bip scurt la fiecare 3 secunde', 'digitalWrite(' + b.pin + ', millis() % 3000 < 100 ? HIGH : LOW);');
      else P.bucla('// ' + b.c.eticheta + ': o notă scurtă la fiecare 3 secunde', 'if (millis() % 3000 < 20) tone(' + b.pin + ', 880, 150);');
    }
    const txtAfis = textAfisaj(x);
    for (const a of x.afisaje) P.periodic(...a.cod(txtAfis));

    // textul programului
    const L = [];
    const numeCip = A.platforma === 'esp32' ? A.cip.cip || 'ESP32' : A.platforma === 'esp8266' ? 'ESP8266' : 'Arduino Nano';
    L.push('// ' + (proiect.nume || 'Proiect') + ' — cod scris din schemă (' + numeCip + ').');
    if (tratate.length) L.push('// Piese: ' + tratate.map(c => c.eticheta).join(', ') + '.');
    L.push('// E un punct de plecare: citește comentariile și schimbă ce ai nevoie.');
    if (P.note.length) { L.push('//'); for (const n of P.note) L.push('// Atenție — ' + n); }
    L.push('');
    for (const h of P.incl) L.push('#include <' + h + '>');
    if (P.incl.length) L.push('');
    if (P.glob.length) { L.push(...P.glob); L.push(''); }
    if (P.per.length) { L.push('unsigned long ultimaCitire = 0;'); L.push(''); }
    for (const f of P.fn) { L.push(f); L.push(''); }
    L.push('void setup() {');
    L.push('  Serial.begin(115200);');
    for (const l of P.set) L.push('  ' + l);
    L.push('  Serial.println("Pornit.");');
    L.push('}');
    L.push('');
    L.push('void loop() {');
    for (const l of P.loop) L.push(l === '' ? '' : '  ' + l);
    if (P.per.length) {
      if (P.loop.length) L.push('');
      L.push('  // o dată pe secundă: citirile și afișajele');
      L.push('  if (millis() - ultimaCitire >= 1000) {');
      L.push('    ultimaCitire = millis();');
      for (const l of P.per) L.push('    ' + l.replace(/\n/g, '\n    '));
      L.push('  }');
    }
    L.push('  delay(' + (P.loop.length ? 5 : 10) + ');');
    L.push('}');
    return L.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n') + '\n';
  }

  // ---------- bibliotecile de instalat ----------
  const BIBLIOTECI = {
    'DHT.h': ['DHT sensor library (Adafruit)', 'Adafruit Unified Sensor'], 'DHT_U.h': ['DHT sensor library (Adafruit)'], 'DHTesp.h': ['DHT sensor library for ESPx (beegee_tokyo)'],
    'Adafruit_SSD1306.h': ['Adafruit SSD1306', 'Adafruit GFX Library'], 'Adafruit_SH110X.h': ['Adafruit SH110X', 'Adafruit GFX Library'], 'Adafruit_GFX.h': ['Adafruit GFX Library'],
    'Adafruit_ILI9341.h': ['Adafruit ILI9341'], 'Adafruit_ST7789.h': ['Adafruit ST7735 and ST7789 Library'], 'Adafruit_ST7735.h': ['Adafruit ST7735 and ST7789 Library'], 'Adafruit_GC9A01A.h': ['Adafruit GC9A01A'], 'Adafruit_ILI9488.h': ['ILI9488 (jaretburkett)'],
    'TFT_eSPI.h': ['TFT_eSPI (Bodmer) — pinii se setează în User_Setup.h'], 'U8g2lib.h': ['U8g2 (olikraus)'], 'U8x8lib.h': ['U8g2 (olikraus)'],
    'LiquidCrystal_I2C.h': ['LiquidCrystal I2C (Frank de Brabander)'], 'TM1637Display.h': ['TM1637 (Avishay Orpaz)'], 'LedControl.h': ['LedControl (Eberhard Fahle)'],
    'Adafruit_NeoPixel.h': ['Adafruit NeoPixel'], 'FastLED.h': ['FastLED'],
    'ESP32Servo.h': ['ESP32Servo (Kevin Harrington)'], 'AccelStepper.h': ['AccelStepper (Mike McCauley)'],
    'OneWire.h': ['OneWire'], 'DallasTemperature.h': ['DallasTemperature (Miles Burton)'],
    'Adafruit_BME280.h': ['Adafruit BME280 Library', 'Adafruit Unified Sensor'], 'Adafruit_BMP280.h': ['Adafruit BMP280 Library', 'Adafruit Unified Sensor'], 'Adafruit_MPU6050.h': ['Adafruit MPU6050', 'Adafruit Unified Sensor'],
    'MPU6050_light.h': ['MPU6050_light (rfetick)'], 'MPU6050.h': ['MPU6050 (Electronic Cats)'], 'BH1750.h': ['BH1750 (Christopher Laws)'], 'HX711.h': ['HX711 Arduino Library (Bogdan Necula)'], 'NewPing.h': ['NewPing (Tim Eckel)'],
    'RTClib.h': ['RTClib (Adafruit)'], 'MFRC522.h': ['MFRC522 (GithubCommunity)'], 'IRremote.hpp': ['IRremote (Armin Joachimsmeyer)'], 'IRremote.h': ['IRremote (Armin Joachimsmeyer)'], 'IRremoteESP8266.h': ['IRremoteESP8266'],
    'TinyGPS++.h': ['TinyGPSPlus (Mikal Hart)'], 'TinyGPSPlus.h': ['TinyGPSPlus (Mikal Hart)'], 'DFRobotDFPlayerMini.h': ['DFRobotDFPlayerMini'],
    'ArduinoJson.h': ['ArduinoJson (Benoît Blanchon)'], 'Arduino_JSON.h': ['Arduino_JSON (Arduino)'], 'ESPAsyncWebServer.h': ['ESP Async WebServer (ESP32Async)', 'Async TCP (ESP32Async)'], 'AsyncTCP.h': ['Async TCP (ESP32Async)'],
    'NTPClient.h': ['NTPClient (Fabrice Weinberg)']
  };
  function biblioteci(cod) {
    const r = [];
    for (const m of String(cod || '').matchAll(/#\s*include\s*[<"]([^>"]+)[>"]/g)) for (const b of (BIBLIOTECI[m[1]] || [])) if (!r.includes(b)) r.push(b);
    if (!r.length) r.push('niciuna în plus (doar ce vine cu pachetul plăcii)');
    return r;
  }

  M.generatorCod = { genereaza, biblioteci, analizeaza };
})(window.M = window.M || {});
