/* Meșter — proiecte exemplu gata montate pe breadboard, cu codul scris și comentat în română. */
(function (M) {
  'use strict';

  // Ajutor pentru construirea proiectelor: breadboard la (0,0), găuri „a12”, șine „S1_5”
  function constructor(nume) {
    const p = M.proiect.nou(nume);
    const ids = {};
    const api = {
      p,
      piesa(id, tip, x, y, prop, extra) {
        const c = M.proiect.adaugaComponenta(p, tip, x, y, prop, extra);
        ids[id] = c;
        return c;
      },
      // poziția unei găuri a breadboard-ului principal (coloana 1..63, rândul a–j)
      gaura(r, col, bb) {
        const b = bb || ids.bb;
        const g = M.breadboard.geometrie(b.prop.marime);
        return { x: b.x + (col - 1) * 10 + 20, y: b.y + M.breadboard.yRand(g, r) };
      },
      // indexul găurii de pe șină pentru o coloană (șinele au grupe de câte 5)
      sina(nr, col, bb) {
        const b = bb || ids.bb;
        const g = M.breadboard.geometrie(b.prop.marime);
        let k = 0;
        for (let gr = 0; gr < g.grupe; gr++) for (let q = 0; q < 5; q++) { k++; if (g.primaSina + gr * 6 + q === col) return 'S' + nr + '_' + k; }
        // cea mai apropiată gaură
        let best = 1, bd = 1e9; k = 0;
        for (let gr = 0; gr < g.grupe; gr++) for (let q = 0; q < 5; q++) { k++; const d = Math.abs(g.primaSina + gr * 6 + q - col); if (d < bd) { bd = d; best = k; } }
        return 'S' + nr + '_' + best;
      },
      // pune o piesă cu pinul `pin` în gaura dată
      inGaura(id, tip, r, col, prop, rot) {
        const g = api.gaura(r, col);
        const c = api.piesa(id, tip, g.x, g.y, prop, { rot: rot || 0 });
        return c;
      },
      fir(a, b, culoare, puncte) {
        const ref = (s) => { const [c, pin] = s.split(':'); return { c: ids[c] ? ids[c].id : c, p: pin }; };
        return M.proiect.adaugaFir(p, ref(a), ref(b), culoare, puncte || []);
      },
      cod(t) { p.cod = t.replace(/^\n/, ''); },
      ids
    };
    return api;
  }
  // ESP32 DevKit V1 pe breadboard, peste șanțul din mijloc: pinii din stânga pe rândul b, cei din dreapta pe rândul j
  function devkitPeBreadboard(k, colPrimulPin) {
    const g = k.gaura('b', colPrimulPin);
    return k.piesa('esp', 'esp32-devkit-v1', g.x, g.y, {}, { rot: 90 });
  }
  // coloana unui pin al DevKit-ului pus cu devkitPeBreadboard (EN/D23 sunt pe coloana primului pin)
  function colDevkit(col0, pin) {
    const st = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND2', 'VIN'];
    const dr = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND1', '3V3'];
    let i = st.indexOf(pin); if (i >= 0) return { col: col0 - i, rand: 'a' };
    i = dr.indexOf(pin); return { col: col0 - i, rand: null };
  }
  // alimentare: 3V3 pe șina + de jos, GND pe ambele șine −
  function alimentareDevkit(k, col0) {
    const c3 = colDevkit(col0, '3V3').col, cg = colDevkit(col0, 'GND1').col, cg2 = colDevkit(col0, 'GND2').col;
    k.fir('esp:3V3', 'bb:' + k.sina(3, c3 + 1), '#e53935', [[k.gaura('j', c3).x, 176], [k.gaura('j', c3 + 1).x, 176]]);
    k.fir('esp:GND1', 'bb:' + k.sina(4, cg + 3), '#1f1f1f', [[k.gaura('j', cg).x, 182], [k.gaura('j', cg + 3).x, 182]]);
    k.fir('bb:a' + cg2, 'bb:' + k.sina(2, cg2 + 3), '#1f1f1f', [[k.gaura('a', cg2).x, 36], [k.gaura('a', cg2 + 3).x, 36]]);
  }

  const lista = [];
  function exemplu(e) { lista.push(e); }

  exemplu({
    id: 'bun-venit', nume: 'Bun venit: LED și buton', etichete: ['începători', 'digitalRead', 'INPUT_PULLUP'],
    descriere: 'Un buton aprinde și stinge un LED. Arată cum se pune ESP32-ul pe breadboard, cum se leagă un LED cu rezistor și un buton cu rezistența internă de pull-up.',
    construieste() {
      const k = constructor('Bun venit: LED și buton');
      k.piesa('bb', 'breadboard', 0, 0, { marime: 'completa' });
      const col0 = 22;
      devkitPeBreadboard(k, col0);
      alimentareDevkit(k, col0);
      // rezistor 220 Ω de pe coloana 36 pe coloana 40, LED cu anodul pe 40 și catodul pe 41
      k.inGaura('r1', 'rezistor', 'c', 36, { valoare: 220, pas: '4' });
      k.inGaura('led1', 'led', 'e', 40, { culoare: 'rosu' });
      k.fir('bb:a41', 'bb:' + k.sina(2, 41), '#1f1f1f');
      k.fir('esp:D23', 'bb:j36', '#43a047', [[k.gaura('j', 22).x, 176], [k.gaura('j', 36).x, 176]]);
      k.fir('bb:f36', 'bb:e36', '#43a047');
      // buton peste șanț: coloanele 50 și 52
      k.inGaura('b1', 'buton', 'e', 50, { culoare: 'albastru' });
      k.fir('esp:D4', 'bb:j50', '#1e88e5', [[k.gaura('j', 12).x, 170], [k.gaura('j', 50).x, 170]]);
      k.fir('bb:j52', 'bb:' + k.sina(4, 53), '#1f1f1f');
      k.cod(`
// Bun venit în Meșter!
// Butonul de pe GPIO4 aprinde și stinge LED-ul de pe GPIO23.

const int PIN_LED = 23;
const int PIN_BUTON = 4;

bool ledAprins = false;
bool butonAnterior = HIGH;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  // Butonul leagă pinul la GND când e apăsat.
  // INPUT_PULLUP ține pinul pe HIGH când butonul e liber.
  pinMode(PIN_BUTON, INPUT_PULLUP);
  Serial.println("Apasă butonul albastru!");
}

void loop() {
  bool buton = digitalRead(PIN_BUTON);

  // reacționăm doar în momentul apăsării (trecerea din HIGH în LOW)
  if (butonAnterior == HIGH && buton == LOW) {
    ledAprins = !ledAprins;
    digitalWrite(PIN_LED, ledAprins ? HIGH : LOW);
    Serial.print("LED: ");
    Serial.println(ledAprins ? "aprins" : "stins");
  }
  butonAnterior = buton;
  delay(20);  // mică pauză împotriva vibrațiilor contactului
}
`);
      k.p.vedere = null;
      return k.p;
    }
  });

  M.exemple = { lista, constructor, devkitPeBreadboard, colDevkit, alimentareDevkit, exemplu };
})(window.M = window.M || {});
