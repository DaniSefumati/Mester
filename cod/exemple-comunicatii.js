/* Meșter — exemple cu module de comunicație și memorie: ceas cu DS3231 și LCD, control de acces RFID,
   LED-uri comandate cu telecomanda IR, LED comandat de pe telefon prin Bluetooth, jurnal de temperatură
   pe card microSD și poziția de la GPS. */
(function (M) {
  'use strict';
  const E = M.exemple;
  const ROSU = '#e53935', NEGRU = '#1f1f1f', GALBEN = '#fdd835', ALBASTRU = '#1e88e5', VERDE = '#43a047', PORTOCALIU = '#fb8c00', MOV = '#8e24aa', ALB = '#eceff1', GRI = '#78909c', MARO = '#795548';

  function baza(nume) {
    const k = E.constructor(nume);
    k.piesa('bb', 'breadboard', 0, 0, { marime: 'completa' });
    E.devkitPeBreadboard(k, 22);
    E.alimentareDevkit(k, 22);
    return k;
  }
  const sina5V = (k) => k.fir('bb:a8', 'bb:' + k.sina(1, 9), ROSU, [[90, 30], [100, 30]]);
  const punte3V3 = (k) => k.fir('bb:' + k.sina(3, 3), 'bb:' + k.sina(1, 3), ROSU);
  function poz(k, ref) {
    const [c, p] = ref.split(':');
    const inst = k.ids[c];
    const pin = M.componente.pini(inst).find(q => q.id === p);
    return M.retea.transforma(inst, pin.x, pin.y);
  }
  const prinBanda = (k, a, b, culoare, y) => { const A = poz(k, a), B = poz(k, b); return k.fir(a, b, culoare, [[A.x, y], [B.x, y]]); };
  // LED cu rezistor pe jumătatea de sus: rezistorul din coloana c până în c+4, LED-ul cu anodul în c+4 și catodul în c+5 la GND
  function ledCuRezistor(k, id, col, culoare) {
    k.inGaura('r' + id, 'rezistor', 'c', col, { valoare: 220, pas: '4' });
    k.inGaura('led' + id, 'led', 'e', col + 4, { culoare });
    k.fir('bb:a' + (col + 5), 'bb:' + k.sina(2, col + 5), NEGRU);
  }

  // ---------- ceas cu DS3231 și LCD ----------
  E.exemplu({
    id: 'ceas-rtc-lcd', nume: 'Ceas cu DS3231 și LCD I2C', etichete: ['comunicații', 'RTC', 'I2C', 'LCD'],
    descriere: 'Ceasul DS3231 și LCD-ul 16×2 stau pe aceeași magistrală I2C (SDA = GPIO21, SCL = GPIO22), fiecare cu adresa lui (0x68 și 0x27). La prima pornire ora e nesetată, așa că programul o setează la ora compilării. Arată data, ora și temperatura din cip.',
    construieste() {
      const k = baza('Ceas cu DS3231 și LCD');
      sina5V(k);
      k.piesa('l1', 'lcd-16x2-i2c', 740, 260, {});
      k.piesa('r1', 'rtc', 470, 290, { model: 'ds3231', ora: 'nesetata' });
      prinBanda(k, 'esp:D21', 'l1:SDA', ALBASTRU, 240);
      prinBanda(k, 'esp:D22', 'l1:SCL', GALBEN, 232);
      prinBanda(k, 'r1:SDA', 'l1:SDA', ALBASTRU, 300);
      prinBanda(k, 'r1:SCL', 'l1:SCL', GALBEN, 306);
      k.fir('l1:GND', 'bb:' + k.sina(4, 61), NEGRU, [[706, 248], [640, 248], [640, 200]]);
      k.fir('l1:VCC', 'bb:' + k.sina(1, 61), ROSU, [[716, 252], [680, 252], [680, 10]]);
      k.fir('r1:VCC', 'bb:' + k.sina(3, 51), ROSU, [[510, 312], [590, 312], [590, 190]]);
      k.fir('r1:GND', 'bb:' + k.sina(4, 55), NEGRU, [[520, 318], [600, 318], [600, 200]]);
      k.cod(`
// Ceas: DS3231 (RTC) + LCD 16x2, amândouă pe I2C (SDA = 21, SCL = 22).

#include <Wire.h>
#include <RTClib.h>
#include <LiquidCrystal_I2C.h>

RTC_DS3231 rtc;
LiquidCrystal_I2C lcd(0x27, 16, 2);
const char zile[7][4] = {"Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sam"};

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  if (!rtc.begin()) {
    lcd.print("RTC lipsa!");
    Serial.println("Nu gasesc DS3231: verifica SDA/SCL si alimentarea.");
    while (true) delay(100);
  }
  if (rtc.lostPower()) {
    // modul nou sau baterie scoasă: punem ora de la compilare
    Serial.println("Ora era pierduta; o setez la ora compilarii.");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
}

void loop() {
  DateTime acum = rtc.now();
  char rand1[17], rand2[17];
  snprintf(rand1, sizeof(rand1), "%s %02d.%02d.%04d", zile[acum.dayOfTheWeek()], acum.day(), acum.month(), acum.year());
  snprintf(rand2, sizeof(rand2), "%02d:%02d:%02d %4.1fC", acum.hour(), acum.minute(), acum.second(), rtc.getTemperature());
  lcd.setCursor(0, 0); lcd.print(rand1);
  lcd.setCursor(0, 1); lcd.print(rand2);
  Serial.println(acum.timestamp());
  delay(1000);
}
`);
      return k.p;
    }
  });

  // ---------- control de acces RFID ----------
  E.exemplu({
    id: 'rfid-acces', nume: 'Control de acces cu RFID RC522', etichete: ['comunicații', 'RFID', 'SPI'],
    descriere: 'Cititorul RC522 e pe SPI (SS = GPIO5, SCK = 18, MOSI = 23, MISO = 19, RST = 22) și 3,3 V. Doar cardul alb (UID DE AD BE EF) are acces: LED verde. Orice alt card aprinde LED-ul roșu și piuie buzzerul. Alege cardul din panoul cititorului și apasă pe antenă.',
    construieste() {
      const k = baza('Acces RFID');
      ledCuRezistor(k, 'v', 30, 'verde');
      ledCuRezistor(k, 'r', 38, 'rosu');
      prinBanda(k, 'bb:a14', 'bb:a30', VERDE, 42);                 // GPIO26 -> LED verde
      prinBanda(k, 'bb:a13', 'bb:a38', ROSU, 38);                  // GPIO27 -> LED roșu
      k.inGaura('bz', 'buzzer-activ', 'c', 50, { model: 'simplu' });
      prinBanda(k, 'bb:a15', 'bb:a50', PORTOCALIU, 34);            // GPIO25 -> buzzer
      k.fir('bb:a51', 'bb:' + k.sina(2, 51), NEGRU);
      k.piesa('f1', 'rc522', 290, 350, {});
      prinBanda(k, 'esp:D5', 'f1:SDA', GALBEN, 226);
      prinBanda(k, 'esp:D18', 'f1:SCK', VERDE, 230);
      prinBanda(k, 'esp:D23', 'f1:MOSI', ALBASTRU, 234);
      prinBanda(k, 'esp:D19', 'f1:MISO', MOV, 238);
      prinBanda(k, 'esp:D22', 'f1:RST', GRI, 242);
      k.fir('f1:GND', 'bb:' + k.sina(4, 35), NEGRU, [[340, 250], [350, 250], [350, 200]]);
      k.fir('f1:3V3', 'bb:' + k.sina(3, 39), ROSU, [[360, 256], [390, 256], [390, 190]]);
      k.cod(`
// Control de acces cu RFID: doar cardul cunoscut aprinde LED-ul verde.

#include <SPI.h>
#include <MFRC522.h>

#define PIN_SS   5
#define PIN_RST  22
#define LED_VERDE 26
#define LED_ROSU  27
#define BUZZER    25

MFRC522 cititor(PIN_SS, PIN_RST);
byte cardPermis[4] = {0xDE, 0xAD, 0xBE, 0xEF};

bool esteCardPermis() {
  if (cititor.uid.size != 4) return false;
  for (byte i = 0; i < 4; i++)
    if (cititor.uid.uidByte[i] != cardPermis[i]) return false;
  return true;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_ROSU, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  SPI.begin();            // SCK 18, MISO 19, MOSI 23
  cititor.PCD_Init();
  cititor.PCD_DumpVersionToSerial();
  Serial.println("Apropie un card de cititor...");
}

void loop() {
  if (!cititor.PICC_IsNewCardPresent()) return;   // niciun card nou
  if (!cititor.PICC_ReadCardSerial()) return;     // n-am putut citi UID-ul

  Serial.print("Card:");
  for (byte i = 0; i < cititor.uid.size; i++) {
    Serial.print(cititor.uid.uidByte[i] < 0x10 ? " 0" : " ");
    Serial.print(cititor.uid.uidByte[i], HEX);
  }
  if (esteCardPermis()) {
    Serial.println("  -> acces permis");
    digitalWrite(LED_VERDE, HIGH);
    delay(1500);
    digitalWrite(LED_VERDE, LOW);
  } else {
    Serial.println("  -> acces interzis");
    digitalWrite(LED_ROSU, HIGH);
    digitalWrite(BUZZER, HIGH);
    delay(600);
    digitalWrite(BUZZER, LOW);
    delay(900);
    digitalWrite(LED_ROSU, LOW);
  }
  cititor.PICC_HaltA();       // cardul tace până e îndepărtat și apropiat din nou
  cititor.PCD_StopCrypto1();
}
`);
      return k.p;
    }
  });

  // ---------- LED-uri cu telecomanda IR ----------
  E.exemplu({
    id: 'telecomanda-leduri', nume: 'LED-uri comandate cu telecomanda IR', etichete: ['comunicații', 'IR', 'IRremote'],
    descriere: 'Receptorul IR VS1838B (OUT pe GPIO35) primește codurile NEC ale telecomenzii. Tastele 1, 2, 3 aprind și sting LED-urile roșu, verde și albastru (GPIO27, 26, 25), OK le stinge pe toate, * le aprinde pe toate. Apasă tastele telecomenzii din dreapta.',
    construieste() {
      const k = baza('Telecomandă IR și LED-uri');
      punte3V3(k);
      ledCuRezistor(k, '1', 26, 'rosu');
      ledCuRezistor(k, '2', 33, 'verde');
      ledCuRezistor(k, '3', 40, 'albastru');
      prinBanda(k, 'bb:a13', 'bb:a26', ROSU, 42);
      prinBanda(k, 'bb:a14', 'bb:a33', VERDE, 38);
      prinBanda(k, 'bb:a15', 'bb:a40', ALBASTRU, 34);
      k.inGaura('ir1', 'ir-receptor', 'c', 52, { model: 'vs1838b' });     // OUT 52, GND 53, VCC 54
      prinBanda(k, 'bb:a18', 'bb:a52', GALBEN, 30);                         // GPIO35 -> OUT
      k.fir('bb:a53', 'bb:' + k.sina(2, 53), NEGRU);
      k.fir('bb:a54', 'bb:' + k.sina(1, 55), ROSU);
      k.piesa('t1', 'telecomanda-ir', 700, 30, {});
      k.cod(`
// LED-uri comandate cu o telecomandă IR (protocol NEC).
// 1, 2, 3 = comută LED-urile; OK = toate stinse; * = toate aprinse.

#include <IRremote.hpp>

#define PIN_IR 35
const int leduri[3] = {27, 26, 25};
bool aprins[3] = {false, false, false};

void aplica() {
  for (int i = 0; i < 3; i++) digitalWrite(leduri[i], aprins[i] ? HIGH : LOW);
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 3; i++) pinMode(leduri[i], OUTPUT);
  IrReceiver.begin(PIN_IR, ENABLE_LED_FEEDBACK);
  Serial.println("Apasa tastele telecomenzii (1, 2, 3, OK, *).");
}

void loop() {
  if (!IrReceiver.decode()) return;
  uint16_t cod = IrReceiver.decodedIRData.command;
  bool repetare = IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT;
  IrReceiver.resume();                 // gata pentru codul următor
  if (repetare) return;                // tasta ținută apăsată: ignorăm repetările

  Serial.print("Cod primit: 0x");
  Serial.println(cod, HEX);
  switch (cod) {
    case 0x45: aprins[0] = !aprins[0]; break;   // 1
    case 0x46: aprins[1] = !aprins[1]; break;   // 2
    case 0x47: aprins[2] = !aprins[2]; break;   // 3
    case 0x1C: for (int i = 0; i < 3; i++) aprins[i] = false; break;  // OK
    case 0x16: for (int i = 0; i < 3; i++) aprins[i] = true; break;   // *
  }
  aplica();
}
`);
      return k.p;
    }
  });

  // ---------- Bluetooth: LED comandat de pe telefon ----------
  E.exemplu({
    id: 'bluetooth-led', nume: 'LED comandat de pe telefon (Bluetooth)', etichete: ['comunicații', 'Bluetooth', 'BluetoothSerial'],
    descriere: 'ESP32 pornește Bluetooth-ul cu numele „ESP32-Mester”. În Monitor serial alege „Telefon (Bluetooth)”, apasă Conectează și scrie comenzi: aprinde, stinge, clipeste, stare. LED-ul e cel albastru de pe placă (GPIO2).',
    construieste() {
      const k = E.constructor('LED prin Bluetooth');
      k.piesa('bb', 'breadboard', 0, 0, { marime: 'completa' });
      E.devkitPeBreadboard(k, 22);
      k.cod(`
// LED comandat de pe telefon prin Bluetooth clasic (doar ESP32 „simplu” are Bluetooth clasic).
// Comenzi: aprinde, stinge, clipeste, stare

#include "BluetoothSerial.h"

BluetoothSerial SerialBT;
const int PIN_LED = 2;      // LED-ul albastru de pe placă
bool clipeste = false;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  SerialBT.begin("ESP32-Mester");
  Serial.println("Bluetooth pornit: conecteaza telefonul la ESP32-Mester.");
}

void loop() {
  if (SerialBT.available()) {
    String comanda = SerialBT.readStringUntil('\\n');
    comanda.trim();
    comanda.toLowerCase();
    Serial.println("Telefonul a trimis: " + comanda);
    if (comanda == "aprinde") { clipeste = false; digitalWrite(PIN_LED, HIGH); SerialBT.println("LED aprins"); }
    else if (comanda == "stinge") { clipeste = false; digitalWrite(PIN_LED, LOW); SerialBT.println("LED stins"); }
    else if (comanda == "clipeste") { clipeste = true; SerialBT.println("LED-ul clipeste"); }
    else if (comanda == "stare") { SerialBT.println(digitalRead(PIN_LED) ? "LED-ul e aprins" : "LED-ul e stins"); }
    else SerialBT.println("Nu stiu comanda: " + comanda + " (aprinde / stinge / clipeste / stare)");
  }
  if (clipeste) {
    static unsigned long t = 0;
    if (millis() - t > 300) { t = millis(); digitalWrite(PIN_LED, !digitalRead(PIN_LED)); }
  }
  delay(10);
}
`);
      return k.p;
    }
  });

  // ---------- jurnal pe card microSD ----------
  E.exemplu({
    id: 'sd-jurnal-dht', nume: 'Jurnal de temperatură pe card microSD', etichete: ['comunicații', 'SD', 'SPI', 'DHT22'],
    descriere: 'La fiecare 2 secunde, temperatura și umiditatea de la un DHT22 (GPIO27) se adaugă în fișierul /jurnal.csv de pe cardul microSD (CS = GPIO5, SCK = 18, MOSI = 23, MISO = 19). Modulul SD are regulator, deci e alimentat din 5 V. Fișierul se vede și se descarcă din panoul modulului SD.',
    construieste() {
      const k = baza('Jurnal pe card SD');
      sina5V(k);
      const d = k.piesa('d1', 'dht', 300, -20, { model: 'dht22', forma: 'modul' });
      d.control.temperatura = 22.4;
      k.fir('d1:VCC', 'bb:' + k.sina(1, 29), ROSU);
      k.fir('d1:GND', 'bb:' + k.sina(2, 33), NEGRU);
      prinBanda(k, 'd1:DATA', 'bb:a13', VERDE, 36);                        // GPIO27
      k.piesa('s1', 'card-sd', 300, 330, { model: 'regulator' });
      prinBanda(k, 'esp:D5', 's1:CS', GALBEN, 226);
      prinBanda(k, 'esp:D18', 's1:SCK', VERDE, 230);
      prinBanda(k, 'esp:D23', 's1:MOSI', ALBASTRU, 234);
      prinBanda(k, 'esp:D19', 's1:MISO', MOV, 238);
      k.fir('s1:VCC', 'bb:' + k.sina(1, 61), ROSU, [[340, 250], [680, 250], [680, 10]]);
      k.fir('s1:GND', 'bb:' + k.sina(4, 37), NEGRU, [[350, 256], [380, 256], [380, 200]]);
      k.cod(`
// Jurnal: DHT22 măsoară, cardul microSD păstrează măsurătorile în /jurnal.csv.

#include <SPI.h>
#include <SD.h>
#include <DHT.h>

#define PIN_SD_CS 5
#define PIN_DHT   27

DHT dht(PIN_DHT, DHT22);

void setup() {
  Serial.begin(115200);
  dht.begin();
  if (!SD.begin(PIN_SD_CS)) {
    Serial.println("Cardul SD nu porneste: verifica firele, alimentarea (5 V) si cardul.");
    while (true) delay(100);
  }
  Serial.printf("Card de %llu MB\\n", SD.cardSize() / (1024 * 1024));
  if (!SD.exists("/jurnal.csv")) {
    File f = SD.open("/jurnal.csv", FILE_WRITE);   // FILE_WRITE golește fișierul
    f.println("secunde,temperatura,umiditate");
    f.close();
  }
}

void loop() {
  float t = dht.readTemperature();
  float u = dht.readHumidity();
  if (isnan(t) || isnan(u)) {
    Serial.println("Nu pot citi DHT22");
  } else {
    File f = SD.open("/jurnal.csv", FILE_APPEND);  // FILE_APPEND adaugă la sfârșit
    if (f) {
      f.printf("%lu,%.1f,%.1f\\n", millis() / 1000, t, u);
      f.close();                                   // fără close() datele pot rămâne nescrise
      Serial.printf("Salvat: %.1f C, %.1f %%\\n", t, u);
    }
  }
  delay(2000);
}
`);
      return k.p;
    }
  });

  // ---------- GPS ----------
  E.exemplu({
    id: 'gps-pozitie', nume: 'Poziția de la GPS NEO-6M', etichete: ['comunicații', 'GPS', 'UART', 'TinyGPS++'],
    descriere: 'GPS-ul trimite propoziții NMEA pe Serial2 (TX-ul modulului la GPIO16, RX-ul la GPIO17), iar TinyGPS++ le descifrează. În monitorul serial apar coordonatele, ora UTC, sateliții și distanța până la Cluj. Primul „fix” vine după câteva secunde; din panoul GPS-ului poți muta antena în casă sau schimba poziția.',
    construieste() {
      const k = baza('Poziție GPS');
      sina5V(k);
      k.piesa('g1', 'gps-neo6m', 330, 330, {});
      prinBanda(k, 'esp:RX2', 'g1:TX', VERDE, 226);
      prinBanda(k, 'esp:TX2', 'g1:RX', GALBEN, 232);
      k.fir('g1:VCC', 'bb:' + k.sina(1, 61), ROSU, [[330, 244], [680, 244], [680, 10]]);
      k.fir('g1:GND', 'bb:' + k.sina(4, 39), NEGRU, [[360, 250], [390, 250], [390, 200]]);
      k.cod(`
// GPS NEO-6M pe Serial2, citit cu TinyGPS++.

#include <TinyGPS++.h>

TinyGPSPlus gps;
const double CLUJ_LAT = 46.7712, CLUJ_LNG = 23.6236;

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, 16, 17);   // RX = 16, TX = 17
  Serial.println("Astept semnal GPS...");
}

void loop() {
  // citim tot ce a venit, des — altfel bufferul serial se umple și se pierd date
  while (Serial2.available() > 0) gps.encode(Serial2.read());

  static unsigned long ultim = 0;
  if (millis() - ultim < 1000) return;
  ultim = millis();

  if (gps.location.isValid()) {
    Serial.printf("Lat %.6f  Lng %.6f  sateliti %d  ora UTC %02d:%02d:%02d\\n",
                  gps.location.lat(), gps.location.lng(), (int)gps.satellites.value(),
                  gps.time.hour(), gps.time.minute(), gps.time.second());
    double km = TinyGPSPlus::distanceBetween(gps.location.lat(), gps.location.lng(), CLUJ_LAT, CLUJ_LNG) / 1000.0;
    Serial.printf("  pana la Cluj: %.1f km, viteza %.1f km/h\\n", km, gps.speed.kmph());
  } else {
    Serial.printf("Fara pozitie inca (caractere primite: %lu)\\n", gps.charsProcessed());
    if (millis() > 5000 && gps.charsProcessed() < 10) Serial.println("  Nu vine nimic de la GPS: verifica firele TX/RX.");
  }
}
`);
      return k.p;
    }
  });
})(window.M = window.M || {});
