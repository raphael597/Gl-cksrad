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

  /*
   * Reihenfolge (admin.reihenfolge): vorab festgelegt, wer nacheinander drankommt.
   * Jeder Dreh nimmt den ersten Eintrag, der gerade gezogen werden kann – einen Namen,
   * der im Rad steht, oder '' für „Zufall“ (dann gelten die Gewichte). Einträge davor,
   * die nicht im Rad stehen, werden übersprungen und nach dem Dreh mit gestrichen.
   */
  const MAX_REIHENFOLGE = 50;

  /** Der Eintrag der Reihenfolge, der beim nächsten Dreh gilt: { pos, name } oder null. */
  function reihenfolgeKopf(eintraege, admin) {
    const liste = admin && Array.isArray(admin.reihenfolge) ? admin.reihenfolge : [];
    const imRad = new Set(eintraege.map(schluessel));
    for (let pos = 0; pos < liste.length; pos++) {
      const name = liste[pos];
      if (typeof name === 'string' && (name === '' || imRad.has(schluessel(name)))) return { pos, name };
    }
    return null;
  }

  /** Jede Person nur beim ersten Vorkommen behalten („Zufall“ darf mehrfach). */
  function ohneDoppelte(liste) {
    const gesehen = new Set();
    return liste.filter((name) => {
      if (name === '') return true;
      const k = schluessel(name);
      if (gesehen.has(k)) return false;
      gesehen.add(k);
      return true;
    });
  }

  /**
   * Reihenfolge ändern – als Liste kleiner Schritte, damit sich Handy und Rechner
   * nicht gegenseitig überschreiben: { plus: name } hängt an ('' = Zufall),
   * { minus: pos, name } streicht, { leeren: true } leert, { einmal: true|false }
   * schaltet „jede Person nur einmal“ (beim Einschalten fallen Doppelte weg).
   * Nimmt { reihenfolge, reihenfolgeEinmal } und liefert beides neu zurück.
   */
  function reihenfolgeAendern(regeln, schritte) {
    const alt = regeln && Array.isArray(regeln.reihenfolge) ? regeln.reihenfolge : [];
    let neu = alt.filter((x) => typeof x === 'string');
    let einmal = !!(regeln && regeln.reihenfolgeEinmal === true);
    const schonDrin = (name) => name !== '' && neu.some((n) => schluessel(n) === schluessel(name));
    for (const s of Array.isArray(schritte) ? schritte.slice(0, 100) : []) {
      if (!s || typeof s !== 'object') continue;
      if (typeof s.einmal === 'boolean') {
        einmal = s.einmal;
        if (einmal) neu = ohneDoppelte(neu);
      } else if (s.leeren === true) {
        neu = [];
      } else if (typeof s.plus === 'string') {
        const name = s.plus.trim().slice(0, 100);
        if (neu.length < MAX_REIHENFOLGE && !(einmal && schonDrin(name))) neu.push(name);
      } else if (Number.isInteger(s.minus) && typeof s.name === 'string') {
        const k = schluessel(s.name);
        const pos = s.minus >= 0 && s.minus < neu.length && schluessel(neu[s.minus]) === k
          ? s.minus
          : neu.findIndex((n) => schluessel(n) === k);
        if (pos >= 0) neu.splice(pos, 1);
      }
    }
    return { reihenfolge: neu, reihenfolgeEinmal: einmal };
  }

  /** Nach dem Dreh: den benutzten Eintrag und übersprungene davor streichen. */
  function reihenfolgeVerbrauchen(liste, pos, name) {
    const neu = Array.isArray(liste) ? liste.slice() : [];
    const k = schluessel(name);
    const i = pos >= 0 && pos < neu.length && schluessel(neu[pos]) === k ? pos : neu.findIndex((n) => schluessel(n) === k);
    if (i >= 0) neu.splice(0, i + 1);
    return neu;
  }

  /**
   * Berechnet die echte Gewinnchance jedes Feldes.
   *
   * Rückgabe: { wahrscheinlichkeiten: number[], modus, quelle, reihenfolgePos }
   *   modus = 'fair'       – alle gleich wahrscheinlich
   *           'gewichtet'  – Admin-Gewichte werden angewendet
   *           'erzwungen'  – der nächste Gewinner ist festgelegt
   *           'notfall'    – alle Gewichte 0, deshalb doch fair
   *   quelle = 'naechster' (festgelegter Gewinner), 'reihenfolge' (Eintrag reihenfolgePos
   *            der Reihenfolge, auch „Zufall“) oder '' (nur Gewichte)
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
    return Object.assign({}, ergebnis, { wahrscheinlichkeiten: p.map((w) => w / summe) });
  }

  /** Chancen nur aus den Admin-Einstellungen (ohne weitere Optionen). */
  function grundAnalyse(eintraege, admin) {
    const n = eintraege.length;
    const ohneQuelle = { quelle: '', reihenfolgePos: -1 };
    if (n === 0) return { wahrscheinlichkeiten: [], modus: 'fair', ...ohneQuelle };

    const fair = () => eintraege.map(() => 1 / n);
    if (!admin || !admin.aktiv) return { wahrscheinlichkeiten: fair(), modus: 'fair', ...ohneQuelle };

    /** Alle Felder mit diesem Namen teilen sich die Chance – oder null, wenn er fehlt. */
    const erzwingen = (name) => {
      const ziel = schluessel(name);
      const treffer = [];
      eintraege.forEach((eintrag, i) => {
        if (schluessel(eintrag) === ziel) treffer.push(i);
      });
      if (treffer.length === 0) return null;
      return { wahrscheinlichkeiten: eintraege.map((_, i) => (treffer.includes(i) ? 1 / treffer.length : 0)), modus: 'erzwungen' };
    };

    // 1. Festgelegter nächster Gewinner schlägt alles andere.
    const fest = admin.naechster ? erzwingen(admin.naechster) : null;
    if (fest) return { ...fest, quelle: 'naechster', reihenfolgePos: -1 };

    // 2. Nächster Eintrag der Reihenfolge („Zufall“ = weiter mit den Gewichten).
    const kopf = reihenfolgeKopf(eintraege, admin);
    const ausReihe = kopf ? { quelle: 'reihenfolge', reihenfolgePos: kopf.pos } : ohneQuelle;
    if (kopf && kopf.name) return { ...erzwingen(kopf.name), ...ausReihe };

    // 3. Gewichte anwenden.
    const gewichte = eintraege.map((name) => gewichtVon(name, admin));
    const summe = gewichte.reduce((a, b) => a + b, 0);

    // Irgendwo muss das Rad stehen bleiben – sind alle gesperrt, wird fair gezogen.
    if (summe <= 0) return { wahrscheinlichkeiten: fair(), modus: 'notfall', ...ausReihe };

    const alleGleich = gewichte.every((g) => g === gewichte[0]);
    return {
      wahrscheinlichkeiten: gewichte.map((g) => g / summe),
      modus: alleGleich ? 'fair' : 'gewichtet',
      ...ausReihe,
    };
  }

  /**
   * Wählt den Gewinner-Index aus.
   * `zufall` ist austauschbar, damit die Tests reproduzierbar sind.
   */
  function waehleGewinner(eintraege, admin, zufall = Math.random, optionen = {}) {
    const { wahrscheinlichkeiten, modus, quelle, reihenfolgePos } = analyse(eintraege, admin, optionen);
    const ergebnis = (index) => ({ index, modus, quelle, reihenfolgePos });
    if (wahrscheinlichkeiten.length === 0) return ergebnis(-1);

    let rest = zufall();
    for (let i = 0; i < wahrscheinlichkeiten.length; i++) {
      rest -= wahrscheinlichkeiten[i];
      if (rest < 0) return ergebnis(i);
    }
    // Rundungsfehler: letztes Feld nehmen, das überhaupt eine Chance hat.
    for (let i = wahrscheinlichkeiten.length - 1; i >= 0; i--) {
      if (wahrscheinlichkeiten[i] > 0) return ergebnis(i);
    }
    return ergebnis(0);
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

  /*
   * Umlenken während der Drehung (Live-Steuerung):
   *   Das Rad läuft nach der Bremskurve aus. Ab jedem Zeitpunkt gilt:
   *   Geschwindigkeit = 4 · Restweg / Restzeit. Für ein neues Ziel wird ein neuer
   *   Restweg gewählt und die Restzeit so angepasst, dass die Geschwindigkeit im
   *   Moment des Umlenkens gleich bleibt – das Rad ruckelt also nicht, es bremst
   *   nur etwas früher oder später. Weicht der neue Restweg zu stark ab (kurz vor
   *   dem Stillstand), wird nicht umgelenkt.
   */
  const UMLENKEN_MIN = 0.6; // neuer Restweg mindestens 60 % …
  const UMLENKEN_MAX = 1.7; // … und höchstens 170 % des bisherigen

  /** Ab diesem Restweg (Radiant) klappt das Umlenken auf jedes Feld sicher. */
  const UMLENKEN_SICHER = Math.PI / Math.min(1 - UMLENKEN_MIN, UMLENKEN_MAX - 1);

  /**
   * Plant das Umlenken auf Feld `index`.
   * Rückgabe: { weg, dauer } (neuer Restweg in Radiant, neue Restzeit) oder null.
   */
  function umlenkPlan({ rotation, restweg, restzeit, index, anzahl, zufall = Math.random, randAbstand = 0.12 }) {
    if (!(anzahl > 0) || !(index >= 0 && index < anzahl) || !(restweg > 1e-6) || !(restzeit > 0)) return null;
    const feld = VOLLKREIS / anzahl;

    /** Nächster passender Restweg für eine Stelle im Feld (0 … 1). */
    const planFuer = (stelle) => {
      const basis = mod(-(index + stelle) * feld - rotation, VOLLKREIS);
      const k = Math.round((restweg - basis) / VOLLKREIS);
      let bester = null;
      for (const kk of [k - 1, k, k + 1]) {
        const weg = basis + Math.max(0, kk) * VOLLKREIS;
        const faktor = weg / restweg;
        if (weg <= 1e-6 || faktor < UMLENKEN_MIN || faktor > UMLENKEN_MAX) continue;
        if (!bester || Math.abs(Math.log(faktor)) < Math.abs(Math.log(bester.faktor))) bester = { weg, faktor };
      }
      return bester && { weg: bester.weg, dauer: restzeit * bester.faktor };
    };

    // Zuerst eine zufällige Stelle im Feld (wirkt natürlich) …
    const zufaellig = planFuer(randAbstand + zufall() * (1 - 2 * randAbstand));
    if (zufaellig) return zufaellig;

    // … kurz vor dem Stillstand die Stelle, die am wenigsten auffällt.
    let bester = null;
    for (let i = 0; i <= 16; i++) {
      const plan = planFuer(randAbstand + (i / 16) * (1 - 2 * randAbstand));
      if (plan && (!bester || Math.abs(Math.log(plan.weg / restweg)) < Math.abs(Math.log(bester.weg / restweg)))) bester = plan;
    }
    return bester;
  }

  /**
   * Blind-Modus der Fernbedienung: Wer steht in welcher Ecke?
   * `wunsch` = gewählte Person je Ecke (Name, '' = Zufall, null = automatisch),
   * `zuletzt` = was zuletzt angezeigt wurde. Man tippt nach Gefühl – deshalb ändert sich
   * nur eine Ecke, deren Person gerade fehlt:
   *   1. Gewählte Personen, die im Rad stehen, bekommen ihre Ecke (auch nach einer Rückkehr).
   *   2. Sonst bleibt, wer zuletzt dort stand, solange er noch im Rad ist.
   *   3. Übrige Ecken bekommen der Reihe nach Namen, die noch in keiner Ecke stehen,
   *      und wenn keiner mehr übrig ist, „Zufall“ ('').
   */
  function eckenBelegen(wunsch, namen, anzahl = 4, zuletzt = []) {
    const imRad = new Map();
    for (const n of namen) if (!imRad.has(schluessel(n))) imRad.set(schluessel(n), n);
    const vergeben = new Set();
    const nehmen = (name) => {
      const k = typeof name === 'string' && name !== '' ? schluessel(name) : null;
      if (k === null || !imRad.has(k) || vergeben.has(k)) return null;
      vergeben.add(k);
      return imRad.get(k);
    };
    const eintrag = (liste, i) => (Array.isArray(liste) ? liste[i] : null);
    const belegt = Array.from({ length: anzahl }, (_, i) => (eintrag(wunsch, i) === '' ? '' : nehmen(eintrag(wunsch, i))));
    belegt.forEach((b, i) => {
      if (b === null) belegt[i] = nehmen(eintrag(zuletzt, i));
    });
    const frei = [...imRad.entries()].filter(([k]) => !vergeben.has(k)).map(([, n]) => n);
    return belegt.map((b) => (b === null ? frei.shift() || '' : b));
  }

  /*
   * Dasselbe für schrittweise Anzeigen (Roulette-Kugel läuft von Feld zu Feld):
   * Die Kugel steht bei `position` (Felder, mit Nachkommastellen) und hat nach der
   * Bremskurve 1 − (1 − t)³ noch `rest` Felder vor sich. Geschwindigkeit = 3 · Rest /
   * Restzeit bleibt beim Umlenken gleich. Einzelne Felder fallen weniger auf als ein
   * bremsendes Rad, deshalb ist der Spielraum hier größer.
   */
  const SCHRITTE_MIN = 0.5;
  const SCHRITTE_MAX = 2;

  /** Ab so vielen restlichen Feldern klappt das Umlenken auf jedes Feld sicher. */
  function umlenkSchritteSicher(anzahl) {
    return anzahl / 2 / Math.min(1 - SCHRITTE_MIN, SCHRITTE_MAX - 1);
  }

  /** Rückgabe: { schritte, dauer } (neuer Rest in Feldern, neue Restzeit) oder null. */
  function umlenkSchritte({ position, rest, restzeit, index, anzahl }) {
    if (!(anzahl > 0) || !(index >= 0 && index < anzahl) || !(rest > 1e-6) || !(restzeit > 0)) return null;
    // Endpunkte sind ganze Zahlen K mit K mod anzahl = index – der nächste zum bisherigen Ende gewinnt.
    const k = Math.round((position + rest - index) / anzahl);
    let bester = null;
    for (const kk of [k - 1, k, k + 1]) {
      const schritte = kk * anzahl + index - position;
      const faktor = schritte / rest;
      if (schritte <= 1e-6 || faktor < SCHRITTE_MIN || faktor > SCHRITTE_MAX) continue;
      if (!bester || Math.abs(Math.log(faktor)) < Math.abs(Math.log(bester.faktor))) bester = { schritte, faktor };
    }
    return bester && { schritte: bester.schritte, dauer: restzeit * bester.faktor };
  }

  return {
    VOLLKREIS,
    UMLENKEN_SICHER,
    MAX_REIHENFOLGE,
    reihenfolgeKopf,
    reihenfolgeAendern,
    reihenfolgeVerbrauchen,
    eckenBelegen,
    umlenkSchritte,
    umlenkSchritteSicher,
    schluessel,
    mod,
    gewichtVon,
    analyse,
    waehleGewinner,
    indexUnterZeiger,
    zielRotation,
    ausrollen,
    umlenkPlan,
  };
});
