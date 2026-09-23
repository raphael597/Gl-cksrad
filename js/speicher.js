/*
 * speicher.js – Laden und Speichern im localStorage des Browsers.
 *
 * Zwei getrennte Bereiche:
 *   - Raddaten (Einträge, Verlauf, Ton) – das, was alle sehen
 *   - Admin-Einstellungen (Gewichte, festgelegter Gewinner, PIN)
 */
(function (global) {
  'use strict';

  const SCHLUESSEL_RAD = 'gluecksrad.daten';
  const SCHLUESSEL_ADMIN = 'gluecksrad.admin';

  const STANDARD_RAD = {
    eintraege: ['5a', '5b', '6a', '6b', '7a', '7b', '8a', '8b'],
    verlauf: [],
    ton: true,
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

  global.Speicher = {
    SCHLUESSEL_RAD,
    SCHLUESSEL_ADMIN,
    ladeRad: () => lesen(SCHLUESSEL_RAD, STANDARD_RAD),
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
