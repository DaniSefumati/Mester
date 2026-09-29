/* Meșter — exemplu cu instrumentele de măsură: osciloscop și multimetru pe un LED cu PWM. */
(function (M) {
  'use strict';
  const E = M.exemple;
  const NEGRU = '#1f1f1f', GALBEN = '#fdd835', ALBASTRU = '#1e88e5', ROSU = '#e53935', VERDE = '#43a047';

  E.exemplu({
    id: 'instrumente-pwm', nume: 'Instrumente: PWM pe osciloscop și multimetru', etichete: ['instrumente', 'PWM', 'osciloscop', 'multimetru'],
    descriere: 'LED-ul de pe GPIO27 „respiră” cu PWM. Osciloscopul arată impulsurile (CH1 la pin, CH2 pe LED): lățimea lor crește și scade, frecvența rămâne 1 kHz. Multimetrul arată tensiunea medie la pin, care urcă și coboară odată cu luminozitatea. Schimbă timpul și volții pe diviziune cu butoanele osciloscopului sau modul multimetrului.',
    construieste() {
      const k = E.constructor('Instrumente de măsură');
      k.piesa('bb', 'breadboard', 0, 0, { marime: 'completa' });
      E.devkitPeBreadboard(k, 22);
      E.alimentareDevkit(k, 22);
      // rezistorul c39–c44, LED-ul e44 (+) / e45 (−), catodul la GND
      k.inGaura('r1', 'rezistor', 'c', 39, { valoare: 220, pas: '5' });
      k.inGaura('led1', 'led', 'e', 44, { culoare: 'verde' });
      k.fir('bb:a45', 'bb:' + k.sina(2, 45), NEGRU);
      k.fir('bb:a13', 'bb:a39', VERDE, [[k.gaura('a', 13).x, 40], [k.gaura('a', 39).x, 40]]);    // GPIO27 -> rezistor
      // osciloscopul deasupra: sondele coboară drept în găuri
      Object.assign(k.piesa('osc', 'osciloscop', 380, -60, {}).control, { baza: 2, volti: 2 });
      k.fir('osc:CH1', 'bb:b39', GALBEN);
      k.fir('osc:CH2', 'bb:a44', ALBASTRU);
      k.fir('osc:GND', 'bb:' + k.sina(2, 49), NEGRU);
      // multimetrul: tensiunea medie la pin
      k.piesa('mm', 'multimetru', 290, -60, {}).control.mod = 0;
      k.fir('mm:COM', 'bb:' + k.sina(2, 28), NEGRU);
      k.fir('mm:V', 'bb:e39', ROSU, [[320, -24], [k.gaura('e', 39).x - 6, -24], [k.gaura('e', 39).x - 6, k.gaura('e', 39).y]]);
      k.cod(`
// Instrumente de măsură: LED-ul „respiră” cu PWM pe GPIO27 (1 kHz).
// Osciloscopul arată impulsurile: lățimea lor crește și scade.
// Multimetrul arată tensiunea medie la pin (3,3 V × umplerea).

const int PIN_LED = 27;

void setup() {
  pinMode(PIN_LED, OUTPUT);
}

void loop() {
  for (int i = 0; i <= 255; i += 5) { analogWrite(PIN_LED, i); delay(40); }
  for (int i = 255; i >= 0; i -= 5) { analogWrite(PIN_LED, i); delay(40); }
}
`);
      return k.p;
    }
  });
})(window.M = window.M || {});
