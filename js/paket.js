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
    schummelLinkErstellen, schummelLinkPruefen, adminRegelnUebernehmen,
  };
});
