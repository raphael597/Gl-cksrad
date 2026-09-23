/*
 * paket.js – Daten verpacken und wieder auspacken (ohne DOM, getestet).
 *
 *   - kodieren/dekodieren: JSON ⇄ Base64url, damit es in einen Link passt
 *   - Sicherung: aktuelles Rad, gespeicherte Räder und Einstellungen – für ein
 *     anderes Gerät oder als Backup, ausdrücklich ohne Admin, PIN und Verlauf.
 *   - Schummel-Link: aktuelles Rad und Admin-Regeln, aber niemals die PIN.
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
  const MAX_EINTRAEGE = 500;
  const MAX_LAENGE = 100;
  const MAX_RAEDER = 100;
  const MAX_TITEL = 60;

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
   * Ein eigener Link-Typ: nur aktuelles Rad und wirksame Admin-Regeln.
   * Die PIN und Regeln für andere Räder gehören nicht in einen geteilten Link.
   */
  function schummelLinkErstellen(daten, admin) {
    const namen = new Set(daten.eintraege.map((name) => String(name).trim().toLowerCase()));
    const gewichte = Object.fromEntries(
      Object.entries(admin.gewichte || {}).filter(([name]) => namen.has(name))
    );
    const naechster = namen.has(String(admin.naechster || '').trim().toLowerCase())
      ? admin.naechster : '';
    return schummelLinkPruefen({
      typ: SCHUMMEL_TYP,
      v: VERSION,
      titel: daten.titel,
      eintraege: daten.eintraege,
      admin: {
        aktiv: admin.aktiv,
        gewichte,
        naechster,
        naechsterDauerhaft: admin.naechsterDauerhaft,
      },
    });
  }

  /** Fremde Link-Daten streng prüfen und nur die erlaubten Felder zurückgeben. */
  function schummelLinkPruefen(roh) {
    if (!istObjekt(roh) || roh.typ !== SCHUMMEL_TYP || roh.v !== VERSION ||
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
    const naechster = roh.admin.naechster.trim();
    if (naechster && !namen.has(naechster.toLowerCase())) {
      throw new Error('Festgelegter Gewinner fehlt im Rad');
    }
    return {
      typ: SCHUMMEL_TYP,
      v: VERSION,
      titel: roh.titel.trim(),
      eintraege,
      admin: {
        aktiv: roh.admin.aktiv,
        gewichte,
        naechster,
        naechsterDauerhaft: roh.admin.naechsterDauerhaft,
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
    const bytes = [2, (paket.admin.aktiv ? 1 : 0) | (paket.admin.naechsterDauerhaft ? 2 : 0)];
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
    zahl(paket.admin.naechster ? index.get(paket.admin.naechster.toLowerCase()) + 1 : 0);

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

    if (byte() !== 2) throw new Error('Unbekannte Rad-Link-Version');
    const flags = byte();
    if (flags & ~3) throw new Error('Ungültige Regeln im Rad-Link');
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
    if (naechsterIndex > anzahl || pos !== bytes.length) throw new Error('Ungültiges Ende des Rad-Links');
    return schummelLinkPruefen({
      typ: SCHUMMEL_TYP,
      v: VERSION,
      titel,
      eintraege,
      admin: {
        aktiv: !!(flags & 1),
        gewichte: Object.fromEntries(gewichte),
        naechster: naechsterIndex ? eintraege[naechsterIndex - 1] : '',
        naechsterDauerhaft: !!(flags & 2),
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
      gewichte: Object.fromEntries(andereGewichte.concat(Object.entries(paket.admin.gewichte))),
    };
  }

  return {
    kodieren, dekodieren, eintraegePruefen, sicherungErstellen, sicherungPruefen, beschreiben,
    schummelLinkErstellen, schummelLinkPruefen, schummelKurzKodieren,
    schummelKurzDekodieren, adminRegelnUebernehmen,
  };
});
