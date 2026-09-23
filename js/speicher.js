/*
 * speicher.js – Laden und Speichern im localStorage des Browsers.
 *
 * Zwei getrennte Bereiche:
 *   - Raddaten (Einträge, Verlauf, gespeicherte Räder, Einstellungen) – das, was alle sehen
 *   - Admin-Einstellungen (Gewichte, festgelegter Gewinner, PIN)
 */
(function (global) {
  'use strict';

  const SCHLUESSEL_RAD = 'gluecksrad.daten';
  const SCHLUESSEL_ADMIN = 'gluecksrad.admin';

  const STANDARD_EINSTELLUNGEN = {
    dauer: 'normal', // 'kurz' | 'normal' | 'lang'
    farben: 'bunt', // Schlüssel aus Rad.FARBSCHEMEN
    design: 'dunkel', // 'dunkel' | 'hell' | 'system'
    autoEntfernen: false,
    konfetti: true,
    ergebnisText: 'Das Rad hat entschieden:',
    nabeText: 'DREH!', // Text in der Radmitte
    vorlesen: false, // Gewinner per Sprachausgabe ansagen
    nichtDoppelt: false, // denselben Eintrag nicht zweimal hintereinander ziehen
    anzahlZiehen: 1, // wie viele Gewinner pro Durchgang
  };

  const STANDARD_RAD = {
    titel: 'Klassen',
    eintraege: ['5a', '5b', '6a', '6b', '7a', '7b', '8a', '8b'],
    entfernt: [], // gezogene und entfernte Einträge – zum Zurückholen
    verlauf: [], // [{ name, zeit }] – neueste zuerst
    gespeichert: [], // [{ name, eintraege, zeit }] – "Meine Räder"
    ton: true,
    einstellungen: STANDARD_EINSTELLUNGEN,
  };

  const STANDARD_ADMIN = {
    aktiv: true,
    // Nur ein Sichtschutz! Alles liegt im Browser und ist für Technikkundige lesbar.
    pin: '1234',
    gewichte: {}, // { "7b": 0, "8a": 3 } – Schlüssel siehe Logik.schluessel()
    naechster: '', // Name des festgelegten nächsten Gewinners
    naechsterDauerhaft: false,
  };

  const kopie = (wert) => JSON.parse(JSON.stringify(wert));

  function lesen(schluessel, standard) {
    try {
      const roh = localStorage.getItem(schluessel);
      if (!roh) return kopie(standard);
      return Object.assign(kopie(standard), JSON.parse(roh));
    } catch (e) {
      return kopie(standard);
    }
  }

  function schreiben(schluessel, wert) {
    try {
      localStorage.setItem(schluessel, JSON.stringify(wert));
    } catch (e) {
      // Privater Modus o. Ä.: dann eben nur bis zum Neuladen.
    }
  }

  function ladeRad() {
    const daten = lesen(SCHLUESSEL_RAD, STANDARD_RAD);
    // Neue Einstellungen ergänzen, falls ältere Daten gespeichert sind.
    daten.einstellungen = Object.assign(kopie(STANDARD_EINSTELLUNGEN), daten.einstellungen);
    return daten;
  }

  global.Speicher = {
    SCHLUESSEL_RAD,
    SCHLUESSEL_ADMIN,
    STANDARD_EINSTELLUNGEN,
    ladeRad,
    speichereRad: (daten) => schreiben(SCHLUESSEL_RAD, daten),
    ladeAdmin: () => lesen(SCHLUESSEL_ADMIN, STANDARD_ADMIN),
    speichereAdmin: (admin) => schreiben(SCHLUESSEL_ADMIN, admin),
    adminZuruecksetzen: () => {
      // PIN behalten, alles andere auf Standard.
      const pin = lesen(SCHLUESSEL_ADMIN, STANDARD_ADMIN).pin;
      schreiben(SCHLUESSEL_ADMIN, Object.assign(kopie(STANDARD_ADMIN), { pin }));
    },
  };
})(window);
