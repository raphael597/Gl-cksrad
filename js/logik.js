/*
 * logik.js – reine Rechenfunktionen des Glücksrads (kein DOM, kein Speicher).
 *
 * Läuft im Browser (als globales `Logik`) und in Node (für die Tests).
 *
 * Idee der Manipulation:
 *   Das Rad zeigt alle Einträge immer gleich groß an. Der Gewinner wird aber
 *   VOR dem Drehen nach den Admin-Gewichten ausgewählt. Danach wird nur noch
 *   ausgerechnet, wie weit das Rad drehen muss, damit es genau auf diesem
 *   Feld stehen bleibt – an einer zufälligen Stelle innerhalb des Feldes.
 */
(function (root, fabrik) {
  const api = fabrik();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logik = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VOLLKREIS = Math.PI * 2;

  /** Namen vergleichbar machen: Leerzeichen am Rand weg, Groß/Klein egal. */
  function schluessel(name) {
    return String(name).trim().toLowerCase();
  }

  /** Positiver Rest – JavaScripts `%` liefert bei negativen Zahlen negative Werte. */
  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  /** Gewicht eines Eintrags laut Admin-Einstellungen (fehlend = 1 = normal). */
  function gewichtVon(name, admin) {
    const g = admin && admin.gewichte ? admin.gewichte[schluessel(name)] : undefined;
    return typeof g === 'number' && isFinite(g) && g >= 0 ? g : 1;
  }

  /**
   * Berechnet die echte Gewinnchance jedes Feldes.
   *
   * Rückgabe: { wahrscheinlichkeiten: number[], modus }
   *   modus = 'fair'       – alle gleich wahrscheinlich
   *           'gewichtet'  – Admin-Gewichte werden angewendet
   *           'erzwungen'  – der nächste Gewinner ist festgelegt
   *           'notfall'    – alle Gewichte 0, deshalb doch fair
   *
   * optionen.ausschliessen: Namen, die diesmal nicht gezogen werden sollen
   *   (z. B. der letzte Gewinner bei „nicht zweimal hintereinander“).
   *   Ein festgelegter Gewinner und Admin-Sperren haben Vorrang.
   */
  function analyse(eintraege, admin, optionen = {}) {
    const ergebnis = grundAnalyse(eintraege, admin);
    const aus = (optionen.ausschliessen || []).map(schluessel);
    if (ergebnis.modus === 'erzwungen' || aus.length === 0) return ergebnis;

    const p = ergebnis.wahrscheinlichkeiten.map((w, i) => (aus.includes(schluessel(eintraege[i])) ? 0 : w));
    const summe = p.reduce((a, b) => a + b, 0);
    // Bliebe sonst nichts übrig (z. B. nur ein Eintrag), wird der Ausschluss ignoriert.
    if (summe <= 0) return ergebnis;
    return { wahrscheinlichkeiten: p.map((w) => w / summe), modus: ergebnis.modus };
  }

  /** Chancen nur aus den Admin-Einstellungen (ohne weitere Optionen). */
  function grundAnalyse(eintraege, admin) {
    const n = eintraege.length;
    if (n === 0) return { wahrscheinlichkeiten: [], modus: 'fair' };

    const fair = () => eintraege.map(() => 1 / n);
    if (!admin || !admin.aktiv) return { wahrscheinlichkeiten: fair(), modus: 'fair' };

    // 1. Festgelegter nächster Gewinner schlägt alles andere.
    if (admin.naechster) {
      const ziel = schluessel(admin.naechster);
      const treffer = [];
      eintraege.forEach((name, i) => {
        if (schluessel(name) === ziel) treffer.push(i);
      });
      if (treffer.length > 0) {
        return {
          wahrscheinlichkeiten: eintraege.map((_, i) => (treffer.includes(i) ? 1 / treffer.length : 0)),
          modus: 'erzwungen',
        };
      }
    }

    // 2. Gewichte anwenden.
    const gewichte = eintraege.map((name) => gewichtVon(name, admin));
    const summe = gewichte.reduce((a, b) => a + b, 0);

    // Irgendwo muss das Rad stehen bleiben – sind alle gesperrt, wird fair gezogen.
    if (summe <= 0) return { wahrscheinlichkeiten: fair(), modus: 'notfall' };

    const alleGleich = gewichte.every((g) => g === gewichte[0]);
    return {
      wahrscheinlichkeiten: gewichte.map((g) => g / summe),
      modus: alleGleich ? 'fair' : 'gewichtet',
    };
  }

  /**
   * Wählt den Gewinner-Index aus.
   * `zufall` ist austauschbar, damit die Tests reproduzierbar sind.
   */
  function waehleGewinner(eintraege, admin, zufall = Math.random, optionen = {}) {
    const { wahrscheinlichkeiten, modus } = analyse(eintraege, admin, optionen);
    if (wahrscheinlichkeiten.length === 0) return { index: -1, modus };

    let rest = zufall();
    for (let i = 0; i < wahrscheinlichkeiten.length; i++) {
      rest -= wahrscheinlichkeiten[i];
      if (rest < 0) return { index: i, modus };
    }
    // Rundungsfehler: letztes Feld nehmen, das überhaupt eine Chance hat.
    for (let i = wahrscheinlichkeiten.length - 1; i >= 0; i--) {
      if (wahrscheinlichkeiten[i] > 0) return { index: i, modus };
    }
    return { index: 0, modus };
  }

  /*
   * Geometrie:
   *   Feld i belegt die Winkel [i·s, (i+1)·s) – gemessen im Uhrzeigersinn ab
   *   "oben", wenn das Rad nicht gedreht ist (s = 360° / Anzahl).
   *   Der Zeiger sitzt oben. Ist das Rad um `rotation` (im Uhrzeigersinn)
   *   gedreht, zeigt der Zeiger auf den Radwinkel  -rotation.
   */

  /** Welches Feld steht bei dieser Drehung unter dem Zeiger? */
  function indexUnterZeiger(rotation, anzahl) {
    if (anzahl <= 0) return -1;
    const feld = VOLLKREIS / anzahl;
    return Math.floor(mod(-rotation, VOLLKREIS) / feld) % anzahl;
  }

  /**
   * Endwinkel, bei dem das Rad auf Feld `index` stehen bleibt.
   * Damit es echt wirkt: zufällig viele Umdrehungen und eine zufällige Stelle
   * im Feld (mit etwas Abstand zu den Rändern, damit es nie knapp aussieht).
   */
  function zielRotation(aktuell, index, anzahl, zufall = Math.random, optionen = {}) {
    const { minUmdrehungen = 5, maxUmdrehungen = 8, randAbstand = 0.12 } = optionen;
    const feld = VOLLKREIS / anzahl;
    const stelleImFeld = randAbstand + zufall() * (1 - 2 * randAbstand);
    const zielWinkel = (index + stelleImFeld) * feld;
    const restweg = mod(-zielWinkel - aktuell, VOLLKREIS);
    const umdrehungen = minUmdrehungen + Math.floor(zufall() * (maxUmdrehungen - minUmdrehungen + 1));
    return aktuell + umdrehungen * VOLLKREIS + restweg;
  }

  /** Bremskurve: schnell los, lange auslaufen – wie ein echtes Rad. */
  function ausrollen(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  return {
    VOLLKREIS,
    schluessel,
    mod,
    gewichtVon,
    analyse,
    waehleGewinner,
    indexUnterZeiger,
    zielRotation,
    ausrollen,
  };
});
