# Meșter ESP32

Atelier de electronică în browser: montezi circuite pe un breadboard virtual cu plăci ESP32, scrii cod Arduino și îl rulezi în simulare. Merge pe telefon și pe calculator.

**Site-ul:** https://danisefumati.github.io/Mester/

## Ce are

- Breadboard, plăci ESP32 / ESP32-S3 / ESP32-C3 / ESP8266 / Arduino Nano și zeci de piese (LED-uri, senzori, afișaje, motoare, sunet, comunicații, instrumente de măsură).
- Editor de cod Arduino, compilare cu erori explicate în română și simulare care rulează codul.
- Monitor serial, plotter, pagini web servite de placă (WiFi, WebServer, WebSocket), verificarea schemei.
- Asistent AI care vede schema și codul și poate lucra în proiect: adaugă și leagă piese, scrie codul, rulează simularea.

## Asistentul AI (gratuit, cu cheia ta)

1. Fă-ți o cheie gratuită la [Google AI Studio](https://aistudio.google.com/apikey) (recomandat) sau la [Groq](https://console.groq.com/keys).
2. În site, deschide fila **Asistent** → **Configurează asistentul**, alege serviciul și lipește cheia.

Cheia rămâne doar în browserul tău (nu e salvată în acest depozit și nu ajunge la nimeni altcineva decât la serviciul ales). Nu pune niciodată cheia în cod sau în fișierele de aici.

## Cum e organizat

| Folder | Ce conține |
| --- | --- |
| `ai/` | legătura cu serviciile de AI (Gemini, Groq, alte servicii compatibile OpenAI) |
| `cod/` | exemplele de proiecte și generatorul de cod |
| `componente/` | piesele: desen, pini, comportament electric |
| `electric/` | rețeaua de fire și calculul tensiunilor și curenților |
| `interfata/` | ecranele aplicației: planșa, editorul, monitorul serial, asistentul |
| `nucleu/` | utilitare, proiectul și salvarea lui |
| `simulare/` | traducerea codului Arduino și bibliotecile simulate (`simulare/api/`) |
| `stil/` | aspectul (CSS) |

Proiectele se salvează automat în browserul în care lucrezi. Le poți exporta ca arhivă `.zip` (pentru Arduino IDE) sau `.json` din meniu.
