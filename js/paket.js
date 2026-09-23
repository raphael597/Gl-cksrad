/*
 * paket.js – Daten verpacken und wieder auspacken (ohne DOM, getestet).
 *
 *   - kodieren/dekodieren: JSON ⇄ Base64url, damit es in einen Link passt
 *   - Sicherung: aktuelles Rad, gespeicherte Räder und Einstellungen – für ein
 *     anderes Gerät oder als Backup, ausdrücklich ohne Admin, PIN und Verlauf.
 *   - Schummel-Link: aktuelles Rad, Spiel-Einstellungen und Admin-Regeln,
 *     aber niemals die PIN.
 *
 * Alles, was aus einem Link oder einer Datei kommt, ist fremde Eingabe und wird
 * streng geprüft, bevor es irgendwo landet.
 */
(function (root, fabrik) {
  const api = fabrik();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Paket = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const TYP = 'gluecksrad-sicherung';
  const SCHUMMEL_TYP = 'gluecksrad-schummel-link';
  const SCHUMMEL_VERSION = 2;
  const MAX_EINTRAEGE = 500;
  const MAX_LAENGE = 100;
  const MAX_RAEDER = 100;
  const MAX_TITEL = 60;
  const LINK_ENUMS = {
    dauer: ['kurz', 'normal', 'lang'],
    farben: ['bunt', 'pastell', 'neon', 'ozean', 'herbst'],
    design: ['dunkel', 'hell', 'system'],
    spielart: ['rad', 'slot', 'roulette'],
  };
  const LINK_VORGABEN = {
    dauer: 'normal', farben: 'bunt', design: 'dunkel', spielart: 'rad',
    autoEntfernen: false, konfetti: true, vorlesen: false, nichtDoppelt: false,
    anzahlZiehen: 1, ergebnisText: 'Das Rad hat entschieden:', nabeText: 'DREH!',
  };

  // ---------- Base64url ----------

  function kodieren(objekt) {
    const bytes = new TextEncoder().encode(JSON.stringify(objekt));
    let binaer = '';
    bytes.forEach((b) => (binaer += String.fromCharCode(b)));
    return btoa(binaer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function dekodieren(text) {
    let b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bytes = Uint8Array.from(atob(b64), (z) => z.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ---------- Prüfen ----------

  const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const text = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

  /** Nur Texte, ohne Leerzeilen, mit begrenzter Länge und Anzahl. */
  function eintraegePruefen(liste) {
    if (!Array.isArray(liste)) return [];
    return liste
      .filter((x) => typeof x === 'string')
      .map((x) => x.trim().slice(0, MAX_LAENGE))
      .filter(Boolean)
      .slice(0, MAX_EINTRAEGE);
  }

  /** Nur bekannte Einstellungen mit dem richtigen Typ übernehmen. */
  function einstellungenPruefen(roh, standard) {
    const ergebnis = {};
    if (!istObjekt(roh)) return ergebnis;
    for (const [schluessel, vorgabe] of Object.entries(standard)) {
      const wert = roh[schluessel];
      if (typeof wert !== typeof vorgabe) continue;
      if (typeof wert === 'string') ergebnis[schluessel] = wert.slice(0, schluessel === 'nabeText' ? 10 : MAX_TITEL);
      else if (typeof wert === 'number') {
        if (Number.isFinite(wert)) ergebnis[schluessel] = Math.min(10, Math.max(1, Math.round(wert)));
      } else ergebnis[schluessel] = wert;
    }
    return ergebnis;
  }

  function raederPruefen(liste) {
    if (!Array.isArray(liste)) return [];
    return liste
      .filter(istObjekt)
      .slice(0, MAX_RAEDER)
      .map((r) => ({
        name: text(r.name, MAX_TITEL),
        eintraege: eintraegePruefen(r.eintraege),
        zeit: Number.isFinite(r.zeit) ? r.zeit : Date.now(),
      }))
      .filter((r) => r.name);
  }

  // ---------- Sicherung ----------

  /** Aktuelles Rad, gespeicherte Räder und Einstellungen – ohne Admin, PIN und Verlauf. */
  function sicherungErstellen(daten) {
    return {
      typ: TYP,
      v: VERSION,
      titel: daten.titel || '',
      eintraege: daten.eintraege || [],
      gespeichert: daten.gespeichert || [],
      einstellungen: daten.einstellungen || {},
      ton: daten.ton !== false,
    };
  }

  /**
   * Prüft eine Sicherung aus Link oder Datei. Unbekannte Felder (auch solche, die
   * wie Admin-Einstellungen aussehen) werden verworfen. Wirft bei ungültigen Daten.
   */
  function sicherungPruefen(roh, standardEinstellungen) {
    if (!istObjekt(roh) || roh.typ !== TYP || roh.v !== VERSION) {
      throw new Error('Keine gültige Sicherung');
    }
    return {
      typ: TYP,
      v: VERSION,
      titel: text(roh.titel, MAX_TITEL),
      eintraege: eintraegePruefen(roh.eintraege),
      gespeichert: raederPruefen(roh.gespeichert),
      einstellungen: einstellungenPruefen(roh.einstellungen, standardEinstellungen),
      ton: roh.ton !== false,
    };
  }

  /** Kurze Beschreibung für die Rückfrage vor dem Einspielen. */
  function beschreiben(sicherung) {
    const rad = sicherung.titel ? `Rad „${sicherung.titel}“` : 'Rad';
    const n = sicherung.gespeichert.length;
    return `${rad} mit ${sicherung.eintraege.length} Einträgen und ${n} ${n === 1 ? 'gespeichertes Rad' : 'gespeicherte Räder'}`;
  }

  // ---------- Schummel-Link ----------

  /**
   * Aktuelles Rad, Spiel-Einstellungen und wirksame Admin-Regeln.
   * PIN, Verlauf und gespeicherte Räder gehören nicht in einen geteilten Link.
   */
  function schummelLinkErstellen(daten, admin) {
    const namen = new Set(daten.eintraege.map((name) => String(name).trim().toLowerCase()));
    const gewichte = Object.fromEntries(
      Object.entries(admin.gewichte || {}).filter(([name]) => namen.has(name))
    );
    const naechster = admin.naechster || '';
    return schummelLinkPruefen({
      typ: SCHUMMEL_TYP,
      v: SCHUMMEL_VERSION,
      titel: daten.titel,
      eintraege: daten.eintraege,
      einstellungen: { ...LINK_VORGABEN, ...daten.einstellungen },
      ton: daten.ton !== false,
      admin: {
        aktiv: admin.aktiv,
        gewichte,
        naechster,
        naechsterDauerhaft: admin.naechsterDauerhaft,
        reihenfolge: admin.reihenfolge || [],
        reihenfolgeEinmal: admin.reihenfolgeEinmal === true,
      },
    });
  }

  /** Fremde Link-Daten streng prüfen und nur die erlaubten Felder zurückgeben. */
  function schummelLinkPruefen(roh) {
    if (!istObjekt(roh) || roh.typ !== SCHUMMEL_TYP || ![VERSION, SCHUMMEL_VERSION].includes(roh.v) ||
        typeof roh.titel !== 'string' || roh.titel.length > MAX_TITEL ||
        !Array.isArray(roh.eintraege) || roh.eintraege.length < 1 || roh.eintraege.length > MAX_EINTRAEGE ||
        !roh.eintraege.every((name) => typeof name === 'string' && name.trim() && name.length <= MAX_LAENGE) ||
        !istObjekt(roh.admin) || typeof roh.admin.aktiv !== 'boolean' ||
        typeof roh.admin.naechster !== 'string' || typeof roh.admin.naechsterDauerhaft !== 'boolean' ||
        !istObjekt(roh.admin.gewichte)) {
      throw new Error('Kein gültiger Schummel-Link');
    }

    const eintraege = roh.eintraege.map((name) => name.trim());
    const namen = new Set(eintraege.map((name) => name.toLowerCase()));
    const gewichte = Object.fromEntries(Object.entries(roh.admin.gewichte).map(([name, wert]) => {
      if (name !== name.trim().toLowerCase() || !namen.has(name) ||
          !Number.isInteger(wert) || wert < 0 || wert > 10) {
        throw new Error('Ungültiges Gewicht im Schummel-Link');
      }
      return [name, wert];
    }));
    const neu = roh.v === SCHUMMEL_VERSION;
    const naechster = roh.admin.naechster.trim();
    if (naechster.length > MAX_LAENGE || (naechster && !neu && !namen.has(naechster.toLowerCase()))) {
      throw new Error('Festgelegter Gewinner fehlt im Rad');
    }
    let reihenfolge;
    let einstellungen;
    if (neu) {
      if (!Array.isArray(roh.admin.reihenfolge) || roh.admin.reihenfolge.length > 50 ||
          !roh.admin.reihenfolge.every((name) => typeof name === 'string' &&
            name.length <= MAX_LAENGE && name === name.trim()) ||
          typeof roh.admin.reihenfolgeEinmal !== 'boolean') {
        throw new Error('Ungültige Reihenfolge im Schummel-Link');
      }
      reihenfolge = roh.admin.reihenfolge.slice();
      if (roh.admin.reihenfolgeEinmal) {
        const personen = reihenfolge.filter(Boolean).map((name) => name.toLowerCase());
        if (new Set(personen).size !== personen.length) throw new Error('Doppelte Reihenfolge im Schummel-Link');
      }
      if (!istObjekt(roh.einstellungen) || typeof roh.ton !== 'boolean') {
        throw new Error('Ungültige Spiel-Einstellungen im Schummel-Link');
      }
      einstellungen = {};
      for (const [feld, werte] of Object.entries(LINK_ENUMS)) {
        if (!werte.includes(roh.einstellungen[feld])) throw new Error('Ungültige Spiel-Einstellungen im Schummel-Link');
        einstellungen[feld] = roh.einstellungen[feld];
      }
      for (const feld of ['autoEntfernen', 'konfetti', 'vorlesen', 'nichtDoppelt']) {
        if (typeof roh.einstellungen[feld] !== 'boolean') throw new Error('Ungültige Spiel-Einstellungen im Schummel-Link');
        einstellungen[feld] = roh.einstellungen[feld];
      }
      if (!Number.isInteger(roh.einstellungen.anzahlZiehen) ||
          roh.einstellungen.anzahlZiehen < 1 || roh.einstellungen.anzahlZiehen > 10 ||
          typeof roh.einstellungen.ergebnisText !== 'string' || roh.einstellungen.ergebnisText.length > MAX_TITEL ||
          typeof roh.einstellungen.nabeText !== 'string' || roh.einstellungen.nabeText.length > 10) {
        throw new Error('Ungültige Spiel-Einstellungen im Schummel-Link');
      }
      einstellungen.anzahlZiehen = roh.einstellungen.anzahlZiehen;
      einstellungen.ergebnisText = roh.einstellungen.ergebnisText;
      einstellungen.nabeText = roh.einstellungen.nabeText;
    }
    return {
      typ: SCHUMMEL_TYP,
      v: roh.v,
      titel: roh.titel.trim(),
      eintraege,
      ...(neu ? { einstellungen, ton: roh.ton } : {}),
      admin: {
        aktiv: roh.admin.aktiv,
        gewichte,
        naechster,
        naechsterDauerhaft: roh.admin.naechsterDauerhaft,
        ...(neu ? { reihenfolge, reihenfolgeEinmal: roh.admin.reihenfolgeEinmal } : {}),
      },
    };
  }

  /**
   * Kompaktes, versioniertes Link-Format: UTF-8-Texte und Zahlen statt JSON-Feldnamen.
   * Gewichte und der nächste Gewinner verweisen auf die Eintragsliste. Die Daten
   * sind nur kodiert, nicht verschlüsselt oder gegen Änderungen geschützt.
   */
  function schummelKurzKodieren(roh) {
    const paket = schummelLinkPruefen(roh);
    if (paket.v !== SCHUMMEL_VERSION) throw new Error('Altes Link-Format kann nicht neu erzeugt werden');
    const e = paket.einstellungen;
    const flags =
      (paket.admin.aktiv ? 1 : 0) |
      (paket.admin.naechsterDauerhaft ? 2 : 0) |
      (paket.admin.reihenfolgeEinmal ? 4 : 0) |
      (paket.ton ? 8 : 0) |
      (e.autoEntfernen ? 16 : 0) |
      (e.konfetti ? 32 : 0) |
      (e.vorlesen ? 64 : 0) |
      (e.nichtDoppelt ? 128 : 0);
    const bytes = [3, flags];
    const zahl = (wert) => {
      do {
        bytes.push((wert & 127) | (wert >= 128 ? 128 : 0));
        wert = Math.floor(wert / 128);
      } while (wert);
    };
    const wort = (wert) => {
      const utf8 = new TextEncoder().encode(wert);
      zahl(utf8.length);
      bytes.push(...utf8);
    };
    wort(paket.titel);
    zahl(paket.eintraege.length);
    paket.eintraege.forEach(wort);

    const index = new Map(paket.eintraege.map((name, i) => [name.toLowerCase(), i]));
    const gewichte = Object.entries(paket.admin.gewichte).filter(([, wert]) => wert !== 1);
    zahl(gewichte.length);
    gewichte.forEach(([name, wert]) => {
      zahl(index.get(name));
      bytes.push(wert);
    });
    // 0 = kein Gewinner, 1..n = Eintrag; n+1 = ein derzeit fehlender Name.
    const genauerIndex = new Map(paket.eintraege.map((name, i) => [name, i]));
    if (!paket.admin.naechster) zahl(0);
    else if (genauerIndex.has(paket.admin.naechster)) zahl(genauerIndex.get(paket.admin.naechster) + 1);
    else {
      zahl(paket.eintraege.length + 1);
      wort(paket.admin.naechster);
    }

    // Dieselben Codes für die geplante Reihenfolge; 0 steht dort für Zufall.
    zahl(paket.admin.reihenfolge.length);
    for (const name of paket.admin.reihenfolge) {
      if (name === '') zahl(0);
      else if (genauerIndex.has(name)) zahl(genauerIndex.get(name) + 1);
      else {
        zahl(paket.eintraege.length + 1);
        wort(name);
      }
    }
    for (const [feld, werte] of Object.entries(LINK_ENUMS)) bytes.push(werte.indexOf(e[feld]));
    bytes.push(e.anzahlZiehen);
    const textFlags = (e.ergebnisText !== LINK_VORGABEN.ergebnisText ? 1 : 0) |
      (e.nabeText !== LINK_VORGABEN.nabeText ? 2 : 0);
    bytes.push(textFlags);
    if (textFlags & 1) wort(e.ergebnisText);
    if (textFlags & 2) wort(e.nabeText);

    let binaer = '';
    bytes.forEach((b) => (binaer += String.fromCharCode(b)));
    return btoa(binaer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** Kompakten Link lesen; Grenzwerte und Restbytes strikt prüfen. */
  function schummelKurzDekodieren(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length > 340000) {
      throw new Error('Kein gültiger Rad-Link');
    }
    let binaer;
    try {
      binaer = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    } catch (e) {
      throw new Error('Kein gültiger Rad-Link');
    }
    if (binaer.length > 250000) throw new Error('Rad-Link ist zu lang');
    const bytes = Uint8Array.from(binaer, (z) => z.charCodeAt(0));
    let pos = 0;
    const byte = () => {
      if (pos >= bytes.length) throw new Error('Unvollständiger Rad-Link');
      return bytes[pos++];
    };
    const zahl = () => {
      let wert = 0;
      for (let i = 0; i < 4; i++) {
        const teil = byte();
        wert += (teil & 127) * (2 ** (i * 7));
        if (!(teil & 128)) return wert;
      }
      throw new Error('Ungültige Zahl im Rad-Link');
    };
    const wort = (max) => {
      const laenge = zahl();
      if (laenge > max || pos + laenge > bytes.length) throw new Error('Ungültiger Text im Rad-Link');
      const wert = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(pos, pos + laenge));
      pos += laenge;
      return wert;
    };

    const format = byte();
    if (format !== 2 && format !== 3) throw new Error('Unbekannte Rad-Link-Version');
    const flags = byte();
    if (format === 2 && flags & ~3) throw new Error('Ungültige Regeln im Rad-Link');
    const titel = wort(MAX_TITEL * 4);
    const anzahl = zahl();
    if (anzahl < 1 || anzahl > MAX_EINTRAEGE) throw new Error('Ungültige Eintragszahl im Rad-Link');
    const eintraege = Array.from({ length: anzahl }, () => wort(MAX_LAENGE * 4));
    const gewichtAnzahl = zahl();
    if (gewichtAnzahl > anzahl) throw new Error('Zu viele Gewichte im Rad-Link');
    const gewichte = [];
    const gesehen = new Set();
    for (let i = 0; i < gewichtAnzahl; i++) {
      const index = zahl();
      const wert = byte();
      if (index >= anzahl || wert > 10 || gesehen.has(eintraege[index].toLowerCase())) {
        throw new Error('Ungültiges Gewicht im Rad-Link');
      }
      gesehen.add(eintraege[index].toLowerCase());
      gewichte.push([eintraege[index].toLowerCase(), wert]);
    }
    const naechsterIndex = zahl();
    if (naechsterIndex > anzahl + (format === 3 ? 1 : 0)) throw new Error('Ungültiger Gewinner im Rad-Link');
    const naechster = format === 3 && naechsterIndex === anzahl + 1
      ? wort(MAX_LAENGE * 4)
      : naechsterIndex ? eintraege[naechsterIndex - 1] : '';
    let reihenfolge;
    let einstellungen;
    if (format === 3) {
      const anzahlReihe = zahl();
      if (anzahlReihe > 50) throw new Error('Zu lange Reihenfolge im Rad-Link');
      reihenfolge = [];
      for (let i = 0; i < anzahlReihe; i++) {
        const code = zahl();
        if (code > anzahl + 1) throw new Error('Ungültige Reihenfolge im Rad-Link');
        reihenfolge.push(code === 0 ? '' : code === anzahl + 1 ? wort(MAX_LAENGE * 4) : eintraege[code - 1]);
      }
      einstellungen = {};
      for (const [feld, werte] of Object.entries(LINK_ENUMS)) {
        const index = byte();
        if (index >= werte.length) throw new Error('Ungültige Spiel-Einstellungen im Rad-Link');
        einstellungen[feld] = werte[index];
      }
      einstellungen.anzahlZiehen = byte();
      const textFlags = byte();
      if (textFlags & ~3) throw new Error('Ungültige Texte im Rad-Link');
      einstellungen.ergebnisText = textFlags & 1 ? wort(MAX_TITEL * 4) : LINK_VORGABEN.ergebnisText;
      einstellungen.nabeText = textFlags & 2 ? wort(40) : LINK_VORGABEN.nabeText;
      einstellungen.autoEntfernen = !!(flags & 16);
      einstellungen.konfetti = !!(flags & 32);
      einstellungen.vorlesen = !!(flags & 64);
      einstellungen.nichtDoppelt = !!(flags & 128);
    }
    if (pos !== bytes.length) throw new Error('Ungültiges Ende des Rad-Links');
    return schummelLinkPruefen({
      typ: SCHUMMEL_TYP,
      v: format === 3 ? SCHUMMEL_VERSION : VERSION,
      titel,
      eintraege,
      ...(format === 3 ? { einstellungen, ton: !!(flags & 8) } : {}),
      admin: {
        aktiv: !!(flags & 1),
        gewichte: Object.fromEntries(gewichte),
        naechster,
        naechsterDauerhaft: !!(flags & 2),
        ...(format === 3 ? { reihenfolge, reihenfolgeEinmal: !!(flags & 4) } : {}),
      },
    });
  }

  /** Regeln des verlinkten Rads ersetzen, andere Gewichte und die lokale PIN behalten. */
  function adminRegelnUebernehmen(bisher, paket) {
    const namen = new Set(paket.eintraege.map((name) => name.toLowerCase()));
    const andereGewichte = Object.entries(bisher.gewichte || {}).filter(([name]) => !namen.has(name));
    return {
      ...bisher,
      ...paket.admin,
      reihenfolge: paket.admin.reihenfolge || [],
      reihenfolgeEinmal: paket.admin.reihenfolgeEinmal === true,
      gewichte: Object.fromEntries(andereGewichte.concat(Object.entries(paket.admin.gewichte))),
    };
  }

  return {
    kodieren, dekodieren, eintraegePruefen, sicherungErstellen, sicherungPruefen, beschreiben,
    schummelLinkErstellen, schummelLinkPruefen, schummelKurzKodieren,
    schummelKurzDekodieren, adminRegelnUebernehmen,
  };
});
