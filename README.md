# 🎡 Glücksrad

Ein Glücksrad für den Browser, das du selbst mit Einträgen füllst (z. B. Klassen oder Namen).
Dazu gibt es einen **versteckten Admin-Bereich**, in dem du das Ergebnis beeinflussen kannst:
Einträge sperren, bevorzugen oder den nächsten Gewinner direkt festlegen.
Nach außen sieht das Rad dabei ganz normal aus.

Reines HTML/CSS/JavaScript: kein Build, keine Bibliotheken, keine Internetverbindung nötig.

## Starten

`index.html` doppelklicken, fertig.

Optional über einen lokalen Server (praktisch, wenn du Hauptseite und Admin in zwei Fenstern nutzt):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Bedienung

| Was | Wie |
| --- | --- |
| Einträge bearbeiten | Rechts im Textfeld, ein Eintrag pro Zeile |
| Drehen | „Rad drehen“, auf die Mitte klicken oder **Leertaste** |
| Gewinner entfernen | Im Ergebnis-Fenster „Aus dem Rad entfernen“ |
| Vollbild (z. B. für den Beamer) | ⛶ oben rechts – zeigt dann nur das Rad |

Einträge, Verlauf und Einstellungen bleiben im Browser gespeichert (`localStorage`).

## Admin-Bereich

### Öffnen (unauffällig)

- irgendwo auf der Seite **`admin` tippen** (nicht im Textfeld), oder
- **5× schnell auf die Überschrift** „Glücksrad“ klicken (gut fürs Tablet), oder
- **`index.html#admin`** aufrufen

Standard-PIN: **`1234`** – im Admin-Bereich unter „PIN ändern“ anpassen.
Nach dem Entsperren bleibt der Bereich bis zum Schließen des Tabs offen; „🔒 Sperren“ verriegelt ihn sofort.

### Was du einstellen kannst

- **Manipulation aktiv**: Hauptschalter. Aus = das Rad ist komplett fair.
- **Gewichtung** pro Eintrag (Regler 0–10):
  - `0` bzw. 🚫 = kommt **nie** dran
  - `1` = normal
  - höher = entsprechend häufiger (Gewicht 3 = dreimal so oft wie ein normaler Eintrag)
- **Nächstes Ergebnis festlegen**: Das Rad landet garantiert auf diesem Eintrag,
  entweder nur beim nächsten Dreh oder (mit „dauerhaft“) bei jedem Dreh.
  Das schlägt die Gewichtung.
- **Chance / Simuliert**: zeigt die echten Wahrscheinlichkeiten. „1000× simulieren“
  probiert sie aus, ohne dass das Rad sich dreht.

Die Regeln hängen am **Namen** des Eintrags (Groß-/Kleinschreibung egal). Wenn du also „7b“
sperrst, aus dem Rad löschst und später wieder einträgst, ist sie weiterhin gesperrt.

### Zweites Fenster (Beamer + Laptop)

Öffne die Hauptseite auf dem Beamer und `index.html#admin` in einem zweiten Fenster auf dem Laptop.
Beide greifen auf denselben Speicher zu: Änderungen im Admin gelten sofort für den nächsten Dreh,
ohne dass auf dem Beamer etwas zu sehen ist.

### Warum es echt aussieht

- Alle Felder sind **immer gleich groß**. Die Gewichte sieht man nirgends auf dem Rad.
- Das Rad dreht jedes Mal **5–8 volle Umdrehungen**, 5–7,5 Sekunden lang, und rollt
  mit einer natürlichen Bremskurve aus.
- Es bleibt an einer **zufälligen Stelle innerhalb** des Zielfeldes stehen (nie knapp am Rand).
- Zeiger-Klackern, blinkende Lämpchen, Konfetti: alles wie bei einem normalen Rad.
- Auf der Hauptseite gibt es keinen sichtbaren Hinweis auf den Admin-Bereich.

### Grenzfälle

- Stehen **alle** Einträge auf 0, zieht das Rad fair (irgendwo muss es ja stehen bleiben).
  Der Admin-Bereich warnt dann.
- Ein festgelegter Gewinner, der gar nicht im Rad steht, wird ignoriert.

> **Hinweis:** Die PIN ist nur ein Sichtschutz. Alles läuft im Browser, und wer sich mit den
> Entwicklertools auskennt, kann die Einstellungen im `localStorage` lesen.

## So funktioniert es (für Neugierige)

Der Trick steckt in zwei Schritten (`js/logik.js`):

1. **Gewinner auswählen**, *bevor* sich das Rad dreht: gewichteter Zufall
   (`waehleGewinner`). Jeder Eintrag bekommt einen Anteil entsprechend seinem Gewicht.
2. **Zielwinkel ausrechnen** (`zielRotation`): Wie weit muss das Rad drehen, damit
   der Zeiger am Ende auf genau diesem Feld steht? Dazu kommen ein paar zufällige
   volle Umdrehungen.

Das Rad selbst (`js/rad.js`) weiß von alldem nichts. Es bekommt nur einen Endwinkel und rollt dorthin aus.
Das angezeigte Ergebnis wird danach aus der tatsächlichen Radstellung abgelesen.

## Projektstruktur

```
index.html        Seite mit Rad, Einträgen, Ergebnis- und Admin-Dialog
css/style.css     Aussehen
js/logik.js       Reine Rechenlogik (Gewichtung, Auswahl, Winkel), ohne DOM, getestet
js/speicher.js    Laden/Speichern im localStorage
js/rad.js         Zeichnen und Animieren des Rads (Canvas)
js/effekte.js     Ton (Web Audio) und Konfetti
js/admin.js       Admin-Bereich
js/app.js         Verbindet alles auf der Hauptseite
tests/            Tests für js/logik.js
```

## Tests

Benötigt Node.js ≥ 18 (keine Installation von Paketen nötig):

```bash
npm test
```
