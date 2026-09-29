/* Meșter — exemple cu sunet: melodie pe buzzer pasiv (prin tranzistor), sintetizator I2S cu MAX98357A,
   VU-metru cu microfonul I2S INMP441 și inel NeoPixel, player MP3 DFPlayer Mini cu butoane.
   Toate se aud în browser în timpul simulării (butonul cu difuzor din bara de sus oprește sunetul). */
(function (M) {
  'use strict';
  const E = M.exemple;
  const ROSU = '#e53935', NEGRU = '#1f1f1f', GALBEN = '#fdd835', ALBASTRU = '#1e88e5', VERDE = '#43a047', PORTOCALIU = '#fb8c00', MOV = '#8e24aa', ALB = '#eceff1';

  function baza(nume) {
    const k = E.constructor(nume);
    k.piesa('bb', 'breadboard', 0, 0, { marime: 'completa' });
    E.devkitPeBreadboard(k, 22);
    E.alimentareDevkit(k, 22);
    return k;
  }
  const sina5V = (k) => k.fir('bb:a8', 'bb:' + k.sina(1, 9), ROSU, [[90, 30], [100, 30]]);
  // poziția în lume a unui pin („comp:pin”, inclusiv găurile breadboard-ului)
  function poz(k, ref) {
    const [c, p] = ref.split(':');
    const inst = k.ids[c];
    const pin = M.componente.pini(inst).find(q => q.id === p);
    return M.retea.transforma(inst, pin.x, pin.y);
  }
  // fir care coboară/urcă până la banda y, merge pe orizontală și apoi ajunge la celălalt capăt
  function prinBanda(k, a, b, culoare, y) {
    const A = poz(k, a), B = poz(k, b);
    return k.fir(a, b, culoare, [[A.x, y], [B.x, y]]);
  }
  // fir cu puncte date explicit
  const traseu = (k, a, b, culoare, puncte) => k.fir(a, b, culoare, puncte);

  // ---------- melodie pe buzzer pasiv ----------
  E.exemplu({
    id: 'buzzer-melodie', nume: 'Melodie pe buzzer pasiv (cu tranzistor)', etichete: ['sunet', 'tone()', 'tranzistor'],
    descriere: 'Un buzzer pasiv magnetic cântă „Oda bucuriei” cu tone(). E comandat printr-un tranzistor NPN 2N2222 (bază prin 1 kΩ de la GPIO25) și alimentat din 5 V, pentru că direct pe pin ar trage prea mult curent. Butonul de pe GPIO4 pornește melodia din nou.',
    construieste() {
      const k = baza('Melodie pe buzzer pasiv');
      sina5V(k);
      k.inGaura('q1', 'tranzistor', 'e', 44, { model: '2n2222' });        // E = 44, B = 45, C = 46
      k.inGaura('r1', 'rezistor', 'c', 41, { valoare: 1000, pas: '4' });   // de pe coloana 41 pe baza (45)
      k.inGaura('bz1', 'buzzer-pasiv', 'c', 49, { model: 'magnetic' });   // + pe 49, − pe 50
      prinBanda(k, 'bb:a15', 'bb:a41', VERDE, 40);                         // GPIO25 -> rezistorul bazei
      k.fir('bb:a44', 'bb:' + k.sina(2, 44), NEGRU);                       // emitorul la GND
      prinBanda(k, 'bb:a50', 'bb:a46', PORTOCALIU, 42);                    // − buzzer -> colector
      k.fir('bb:a49', 'bb:' + k.sina(1, 49), ROSU);                        // + buzzer -> 5 V
      k.inGaura('b1', 'buton', 'e', 55, { culoare: 'verde' });
      k.fir('esp:D4', 'bb:j55', ALBASTRU, [[130, 170], [560, 170]]);
      k.fir('bb:j57', 'bb:' + k.sina(4, 58), NEGRU);
      k.cod(`
// Melodie pe un buzzer pasiv, comandat printr-un tranzistor NPN.
// Buzzerul pasiv scoate exact frecvența primită de la tone().
// Apasă butonul verde ca s-o asculți din nou.

const int PIN_BUZZER = 25;
const int PIN_BUTON = 4;

// frecvențele notelor, în Hz (octava a 4-a)
#define DO   262
#define RE   294
#define MI   330
#define FA   349
#define SOL  392

// „Oda bucuriei” (Beethoven): notele și durata fiecăreia în milisecunde
int note[]   = { MI, MI, FA, SOL, SOL, FA, MI, RE, DO, DO, RE, MI, MI,  RE,  RE,
                 MI, MI, FA, SOL, SOL, FA, MI, RE, DO, DO, RE, MI, RE,  DO,  DO };
int durate[] = { 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 600, 200, 800,
                 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 600, 200, 800 };
const int NR_NOTE = sizeof(note) / sizeof(note[0]);

void canta() {
  for (int i = 0; i < NR_NOTE; i++) {
    tone(PIN_BUZZER, note[i], durate[i] * 0.9);   // o mică pauză între note
    delay(durate[i]);
  }
  noTone(PIN_BUZZER);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTON, INPUT_PULLUP);
  Serial.println("Canta...");
  canta();
  Serial.println("Apasa butonul verde ca sa cante din nou.");
}

void loop() {
  if (digitalRead(PIN_BUTON) == LOW) {
    Serial.println("Canta...");
    canta();
  }
  delay(20);
}
`);
      return k.p;
    }
  });

  // ---------- sintetizator I2S cu MAX98357A ----------
  E.exemplu({
    id: 'i2s-sintetizator', nume: 'Sunet digital I2S: MAX98357A și difuzor', etichete: ['sunet', 'I2S', 'ESP_I2S'],
    descriere: 'ESP32 calculează singur sunetul (arpegii cu notele care se sting) și îl trimite pe I2S la un amplificator MAX98357A, cu difuzorul legat direct pe + și −. BCLK = GPIO26, LRC = GPIO25, DIN = GPIO22.',
    construieste() {
      const k = baza('Sintetizator I2S');
      sina5V(k);
      k.piesa('a1', 'max98357', 300, -30, {});
      k.piesa('s1', 'difuzor', 470, -30, { model: '8-2' });
      prinBanda(k, 'bb:a15', 'a1:LRC', GALBEN, -8);                       // GPIO25 -> LRC
      prinBanda(k, 'bb:a14', 'a1:BCLK', MOV, -14);                        // GPIO26 -> BCLK
      traseu(k, 'esp:D22', 'a1:DIN', VERDE, [[220, 226], [680, 226], [680, -20], [320, -20]]);  // GPIO22 -> DIN
      k.fir('a1:GND', 'bb:' + k.sina(2, 34), NEGRU);
      k.fir('a1:VIN', 'bb:' + k.sina(1, 35), ROSU);
      traseu(k, 'a1:SP', 's1:P', ROSU, [[320, -80], [460, -80], [460, -24], [470, -24]]);
      traseu(k, 'a1:SN', 's1:N', NEGRU, [[340, -76], [455, -76], [455, -20], [480, -20]]);
      k.cod(`
// Sintetizator: ESP32 calculează eșantioanele și le trimite pe I2S
// la amplificatorul MAX98357A, care are difuzorul legat pe + și −.

#include <ESP_I2S.h>

const int PIN_BCLK = 26;
const int PIN_LRC  = 25;
const int PIN_DIN  = 22;
const int RATA = 22050;          // eșantioane pe secundă

I2SClass i2s;
int16_t buf[256];                // 128 de cadre stereo (stânga, dreapta)

// arpegiu Do major, patru note pe secundă
float note[] = { 261.63, 329.63, 392.00, 523.25, 392.00, 329.63 };
float faza = 0;
unsigned long cadre = 0;

void setup() {
  Serial.begin(115200);
  i2s.setPins(PIN_BCLK, PIN_LRC, PIN_DIN);
  if (!i2s.begin(I2S_MODE_STD, RATA, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO)) {
    Serial.println("I2S nu a pornit!");
    while (true) delay(100);
  }
  Serial.println("Sunet pe I2S pornit.");
}

void loop() {
  const int CADRE_PE_NOTA = RATA / 4;
  float f = note[(cadre / CADRE_PE_NOTA) % 6];
  for (int i = 0; i < 128; i++) {
    // fiecare notă începe tare și se stinge
    float anvelopa = 1.0 - (float)((cadre + i) % CADRE_PE_NOTA) / CADRE_PE_NOTA;
    int16_t s = (int16_t)((sin(faza) + 0.3 * sin(2 * faza)) * 14000 * anvelopa);
    faza += 2 * PI * f / RATA;
    if (faza > 2 * PI) faza -= 2 * PI;
    buf[2 * i] = s;       // stânga
    buf[2 * i + 1] = s;   // dreapta
  }
  cadre += 128;
  // write() așteaptă cât timp bufferele DMA sunt pline — ritmul vine de la I2S
  i2s.write((uint8_t *)buf, sizeof(buf));
}
`);
      return k.p;
    }
  });

  // ---------- VU-metru cu INMP441 și inel NeoPixel ----------
  E.exemplu({
    id: 'vu-metru-inmp441', nume: 'VU-metru: microfon I2S INMP441 și inel NeoPixel', etichete: ['sunet', 'microfon', 'I2S', 'LED-uri'],
    descriere: 'Microfonul digital INMP441 (SCK = GPIO32, WS = GPIO25, SD = GPIO33, L/R la GND) măsoară cât de tare e sunetul, iar inelul NeoPixel de pe GPIO27 îl arată: verde, galben, roșu. Schimbă din microfon ce se aude și cât de tare, sau apasă pe el ca să bați din palme.',
    construieste() {
      const k = baza('VU-metru cu INMP441');
      sina5V(k);
      const mic = k.piesa('m1', 'inmp441', 180, -30, {});
      mic.control.sursa = 2; mic.control.nivel = 72;
      k.fir('m1:SCK', 'bb:a17', MOV);                                       // GPIO32
      traseu(k, 'm1:WS', 'bb:a15', GALBEN, [[190, -8], [160, -8]]);          // GPIO25
      traseu(k, 'm1:SD', 'bb:a16', VERDE, [[210, -2], [170, -2]]);           // GPIO33
      k.fir('m1:LR', 'bb:' + k.sina(2, 19), NEGRU);                         // L/R la GND: canalul stâng
      k.fir('m1:GND', 'bb:' + k.sina(2, 22), NEGRU);
      traseu(k, 'm1:VDD', 'bb:' + k.sina(3, 3), PORTOCALIU, [[220, -40], [10, -40], [10, 190]]);  // 3,3 V de pe șina de jos
      k.piesa('n1', 'ws2812', 460, -30, { forma: 'inel', numar: 12 });
      k.fir('n1:VCC', 'bb:' + k.sina(1, 45), ROSU);
      k.fir('n1:GND', 'bb:' + k.sina(2, 47), NEGRU);
      traseu(k, 'n1:DIN', 'bb:a13', ALBASTRU, [[470, -16], [140, -16]]);    // GPIO27
      k.cod(`
// VU-metru: microfonul I2S INMP441 măsoară nivelul sunetului,
// inelul NeoPixel îl arată (verde -> galben -> roșu).

#include <ESP_I2S.h>
#include <Adafruit_NeoPixel.h>

#define PIN_SCK 32
#define PIN_WS  25
#define PIN_SD  33
#define PIN_LED 27
#define NR_LED  12

I2SClass mic;
Adafruit_NeoPixel inel(NR_LED, PIN_LED, NEO_GRB + NEO_KHZ800);
int16_t esantioane[256];
float nivel = 0;   // nivelul netezit, în dB

void setup() {
  Serial.begin(115200);
  inel.begin();
  inel.setBrightness(60);
  inel.show();
  mic.setPins(PIN_SCK, PIN_WS, -1, PIN_SD);   // BCLK, WS, fără ieșire, intrare de date
  if (!mic.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    Serial.println("Microfonul nu porneste!");
    while (true) delay(100);
  }
}

void loop() {
  size_t n = mic.readBytes((char *)esantioane, sizeof(esantioane)) / 2;
  if (n == 0) return;

  // valoarea efectivă (RMS) a sunetului
  double suma = 0;
  for (size_t i = 0; i < n; i++) suma += (double)esantioane[i] * esantioane[i];
  float rms = sqrt(suma / n);
  // INMP441: 94 dB SPL dau -26 dBFS, deci dB SPL ≈ dBFS + 120
  float db = 20.0 * log10(rms / 32768.0 + 1e-9) + 120;
  nivel = 0.8 * nivel + 0.2 * db;

  int aprinse = constrain(map((int)nivel, 40, 90, 0, NR_LED), 0, NR_LED);
  for (int i = 0; i < NR_LED; i++) {
    uint32_t c = 0;
    if (i < aprinse) {
      if (i < 7) c = inel.Color(0, 180, 0);          // verde
      else if (i < 10) c = inel.Color(200, 140, 0);  // galben
      else c = inel.Color(255, 0, 0);                // roșu
    }
    inel.setPixelColor(i, c);
  }
  inel.show();

  static unsigned long t = 0;
  if (millis() - t > 500) {
    t = millis();
    Serial.printf("Nivel: %.0f dB\\n", nivel);
  }
}
`);
      return k.p;
    }
  });

  // ---------- DFPlayer Mini cu butoane ----------
  E.exemplu({
    id: 'dfplayer-butoane', nume: 'Player MP3: DFPlayer Mini cu butoane', etichete: ['sunet', 'MP3', 'Serial2', 'UART'],
    descriere: 'DFPlayer Mini pe Serial2 (TX-ul modulului la GPIO16, RX-ul la GPIO17), alimentat din 5 V, cu difuzorul pe SPK1/SPK2. Butonul de pe GPIO18 trece la piesa următoare, cel de pe GPIO19 schimbă volumul. BUSY (GPIO4) spune dacă modulul cântă.',
    construieste() {
      const k = baza('Player MP3 cu DFPlayer');
      sina5V(k);
      k.piesa('df', 'dfplayer', 720, 150, {});
      k.piesa('s1', 'difuzor', 840, 150, { model: '8-2' });
      traseu(k, 'esp:RX2', 'df:TX', VERDE, [[140, 226], [740, 226]]);        // modul TX -> GPIO16 (RX2)
      traseu(k, 'esp:TX2', 'df:RX', GALBEN, [[150, 232], [730, 232]]);       // modul RX -> GPIO17 (TX2)
      traseu(k, 'bb:' + k.sina(1, 61), 'df:VCC', ROSU, [[620, 4], [700, 4], [700, 166], [720, 166]]);
      traseu(k, 'bb:' + k.sina(4, 61), 'df:GND', NEGRU, [[620, 212], [780, 212]]);
      traseu(k, 'df:SPK1', 's1:P', ROSU, [[770, 172], [840, 172]]);
      traseu(k, 'df:SPK2', 's1:N', NEGRU, [[790, 178], [850, 178]]);
      traseu(k, 'esp:D4', 'df:BUSY', ALBASTRU, [[130, 238], [812, 238], [812, 80], [790, 80]]);
      k.inGaura('b1', 'buton', 'e', 48, { culoare: 'verde' });
      k.fir('esp:D18', 'bb:j48', VERDE, [[170, 172], [470, 172]]);
      k.fir('bb:j50', 'bb:' + k.sina(4, 51), NEGRU);
      k.inGaura('b2', 'buton', 'e', 54, { culoare: 'albastru' });
      k.fir('esp:D19', 'bb:j54', ALBASTRU, [[180, 178], [530, 178]]);
      k.fir('bb:j56', 'bb:' + k.sina(4, 57), NEGRU);
      k.cod(`
// Player MP3 cu DFPlayer Mini (biblioteca DFRobotDFPlayerMini).
// Pe card: 0001.mp3 ... 0005.mp3. Butonul verde = piesa următoare,
// butonul albastru = volumul (10, 15, 20, 25, 30).

#include <DFRobotDFPlayerMini.h>

HardwareSerial mp3Serial(2);       // UART2
DFRobotDFPlayerMini player;

const int PIN_URMATOAREA = 18;
const int PIN_VOLUM = 19;
const int PIN_BUSY = 4;            // LOW cât timp cântă

int volum = 20;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_URMATOAREA, INPUT_PULLUP);
  pinMode(PIN_VOLUM, INPUT_PULLUP);
  pinMode(PIN_BUSY, INPUT);

  // RX = GPIO16 (la TX-ul modulului), TX = GPIO17 (la RX-ul modulului)
  mp3Serial.begin(9600, SERIAL_8N1, 16, 17);
  Serial.println("Pornesc DFPlayer-ul...");
  if (!player.begin(mp3Serial)) {
    Serial.println("DFPlayer nu raspunde: verifica firele TX/RX si cardul SD.");
    while (true) delay(100);
  }
  Serial.println("DFPlayer gata.");
  player.volume(volum);   // 0 ... 30
  player.play(1);
}

void loop() {
  if (digitalRead(PIN_URMATOAREA) == LOW) {
    player.next();
    Serial.println("Piesa urmatoare");
    delay(300);
  }
  if (digitalRead(PIN_VOLUM) == LOW) {
    volum = volum >= 30 ? 10 : volum + 5;
    player.volume(volum);
    Serial.print("Volum: ");
    Serial.println(volum);
    delay(300);
  }

  // mesajele modulului (atenție: „piesă terminată” vine de două ori)
  if (player.available() && player.readType() == DFPlayerPlayFinished) {
    Serial.print("S-a terminat piesa ");
    Serial.println(player.read());
  }

  static bool cantaInainte = false;
  bool canta = digitalRead(PIN_BUSY) == LOW;
  if (canta != cantaInainte) {
    Serial.println(canta ? "Canta" : "Liniste");
    cantaInainte = canta;
  }
  delay(10);
}
`);
      return k.p;
    }
  });
})(window.M = window.M || {});
