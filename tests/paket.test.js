// Tests für js/paket.js – ausführen mit:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Paket = require('../js/paket.js');
const Logik = require('../js/logik.js');

const STANDARD = {
  dauer: 'normal', farben: 'bunt', design: 'dunkel', autoEntfernen: false, konfetti: true,
  ergebnisText: 'Das Rad hat entschieden:', nabeText: 'DREH!', vorlesen: false, nichtDoppelt: false, anzahlZiehen: 1,
  spielart: 'rad',
};

const DATEN = {
  titel: 'Klassen',
  eintraege: ['5a', '6b', '7b', 'Zoë „Z“'],
  gespeichert: [{ name: 'Namen', eintraege: ['Anna', 'Ben'], zeit: 1700000000000 }],
  einstellungen: { ...STANDARD, dauer: 'kurz', anzahlZiehen: 3, spielart: 'roulette' },
  ton: false,
  verlauf: [{ name: '5a', zeit: 1 }],
  entfernt: ['8a'],
};

test('kodieren/dekodieren überstehen Umlaute und Sonderzeichen', () => {
  const objekt = { text: 'Zoë „Z“ – 7b ✓', liste: [1, 2, 3] };
  const kodiert = Paket.kodieren(objekt);
  assert.match(kodiert, /^[A-Za-z0-9_-]+$/); // linktauglich
  assert.deepEqual(Paket.dekodieren(kodiert), objekt);
});

test('Sicherung enthält Rad, Räder und Einstellungen – ohne Verlauf', () => {
  const sicherung = Paket.sicherungErstellen(DATEN);
  assert.equal(sicherung.verlauf, undefined);
  assert.equal(sicherung.entfernt, undefined);
  const zurueck = Paket.sicherungPruefen(Paket.dekodieren(Paket.kodieren(sicherung)), STANDARD);
  assert.equal(zurueck.titel, 'Klassen');
  assert.deepEqual(zurueck.eintraege, DATEN.eintraege);
  assert.equal(zurueck.gespeichert[0].name, 'Namen');
  assert.equal(zurueck.einstellungen.dauer, 'kurz');
  assert.equal(zurueck.einstellungen.anzahlZiehen, 3);
  assert.equal(zurueck.einstellungen.spielart, 'roulette');
  assert.equal(zurueck.ton, false);
});

test('Admin-Felder werden beim Einspielen verworfen', () => {
  const roh = { ...Paket.sicherungErstellen(DATEN), admin: { aktiv: true, gewichte: { '7b': 0 } }, gewichte: { '7b': 0 }, naechster: '6b', pin: '1234' };
  const geprueft = Paket.sicherungPruefen(roh, STANDARD);
  assert.deepEqual(Object.keys(geprueft).sort(), ['einstellungen', 'eintraege', 'gespeichert', 'titel', 'ton', 'typ', 'v']);
  assert.ok(!JSON.stringify(geprueft).includes('gewichte'));
});

test('fremde oder kaputte Daten werden abgelehnt', () => {
  assert.throws(() => Paket.sicherungPruefen(null, STANDARD));
  assert.throws(() => Paket.sicherungPruefen({ typ: 'etwas-anderes', v: 1 }, STANDARD));
  assert.throws(() => Paket.sicherungPruefen({ typ: 'gluecksrad-sicherung', v: 99 }, STANDARD));
  assert.throws(() => Paket.dekodieren('%%%kein-base64%%%'));
});

test('manipulierte Werte werden bereinigt', () => {
  const boese = {
    typ: 'gluecksrad-sicherung',
    v: 1,
    titel: 'x'.repeat(500),
    eintraege: ['ok', 42, null, { a: 1 }, '   ', 'y'.repeat(300)].concat(Array(1000).fill('z')),
    gespeichert: [{ name: 'A', eintraege: 'kein Array' }, 'Müll', { name: '', eintraege: [] }],
    einstellungen: { dauer: 5, farben: 'neon', anzahlZiehen: 999, unbekannt: 'weg', konfetti: 'ja', nabeText: 'VIEL ZU LANGER TEXT' },
    ton: 'egal',
  };
  const p = Paket.sicherungPruefen(boese, STANDARD);
  assert.equal(p.titel.length, 60);
  assert.equal(p.eintraege.length, 500);
  assert.equal(p.eintraege[0], 'ok');
  assert.equal(p.eintraege[1].length, 100);
  assert.deepEqual(p.gespeichert, [{ name: 'A', eintraege: [], zeit: p.gespeichert[0].zeit }]);
  assert.deepEqual(p.einstellungen, { farben: 'neon', anzahlZiehen: 10, nabeText: 'VIEL ZU LA' });
});

test('Beschreibung für die Rückfrage', () => {
  const p = Paket.sicherungPruefen(Paket.sicherungErstellen(DATEN), STANDARD);
  assert.equal(Paket.beschreiben(p), 'Rad „Klassen“ mit 4 Einträgen und 1 gespeichertes Rad');
});

test('Schummel-Link übernimmt Rad und wirksame Admin-Regeln ohne PIN', () => {
  const admin = {
    aktiv: true,
    pin: 'geheim-1234',
    gewichte: { '5a': 0, '7b': 8, fremdesrad: 10 },
    naechster: 'Zoë „Z“',
    naechsterDauerhaft: false,
  };
  const link = Paket.schummelLinkErstellen(DATEN, admin);
  const empfangen = Paket.schummelLinkPruefen(Paket.dekodieren(Paket.kodieren(link)));
  assert.equal(empfangen.titel, DATEN.titel);
  assert.deepEqual(empfangen.eintraege, DATEN.eintraege);
  assert.deepEqual(empfangen.admin, {
    aktiv: true,
    gewichte: { '5a': 0, '7b': 8 },
    naechster: 'Zoë „Z“',
    naechsterDauerhaft: false,
  });
  assert.ok(!JSON.stringify(link).includes('geheim-1234'));
  assert.equal(Logik.waehleGewinner(empfangen.eintraege, empfangen.admin, () => 0.5).index, 3);
  empfangen.admin.naechster = '';
  assert.equal(Logik.gewichtVon('5a', empfangen.admin), 0);
  assert.equal(Logik.gewichtVon('7b', empfangen.admin), 8);
  const uebernommen = Paket.adminRegelnUebernehmen({ pin: 'lokale-pin', gewichte: { '5a': 9, '6b': 0, fremdesrad: 3 } }, empfangen);
  assert.equal(uebernommen.pin, 'lokale-pin');
  assert.deepEqual(uebernommen.gewichte, { '5a': 0, '7b': 8, fremdesrad: 3 });
});

test('Schummel-Link verwirft fremde Felder und lehnt ungültige Regeln ab', () => {
  const link = Paket.schummelLinkErstellen(DATEN, { aktiv: true, gewichte: {}, naechster: '', naechsterDauerhaft: false });
  const mitPin = Paket.schummelLinkPruefen({ ...link, pin: 'falsch', admin: { ...link.admin, pin: 'falsch' } });
  assert.equal(mitPin.pin, undefined);
  assert.equal(mitPin.admin.pin, undefined);
  assert.throws(() => Paket.schummelLinkPruefen({ ...link, typ: 'gluecksrad-sicherung' }));
  assert.throws(() => Paket.schummelLinkPruefen({ ...link, admin: { ...link.admin, gewichte: { '5a': -1 } } }));
  assert.throws(() => Paket.schummelLinkPruefen({ ...link, admin: { ...link.admin, gewichte: { '5a': 11 } } }));
  assert.throws(() => Paket.schummelLinkPruefen({ ...link, admin: { ...link.admin, gewichte: { fremd: 10 } } }));
  assert.throws(() => Paket.schummelLinkPruefen({ ...link, admin: { ...link.admin, naechster: 'Fehlt' } }));
  assert.throws(() => Paket.schummelLinkPruefen({ ...link, eintraege: [] }));
  assert.throws(() => Paket.schummelLinkPruefen({ ...link, eintraege: ['x'.repeat(101)] }));
  const ohneFremdenGewinner = Paket.schummelLinkErstellen(DATEN, { aktiv: true, gewichte: {}, naechster: 'Fehlt', naechsterDauerhaft: true });
  assert.equal(ohneFremdenGewinner.admin.naechster, '');
});

test('kurzer Rad-Link übernimmt Unicode, Gewichte und festgelegten Gewinner', () => {
  const paket = Paket.schummelLinkErstellen(DATEN, {
    aktiv: true,
    gewichte: { '5a': 0, '7b': 8, '6b': 1 },
    naechster: 'Zoë „Z“',
    naechsterDauerhaft: true,
    pin: 'geheim',
  });
  const kurz = Paket.schummelKurzKodieren(paket);
  assert.match(kurz, /^[A-Za-z0-9_-]+$/);
  assert.ok(kurz.length < Paket.kodieren(paket).length / 2);
  assert.deepEqual(Paket.schummelKurzDekodieren(kurz), {
    ...paket,
    admin: { ...paket.admin, gewichte: { '5a': 0, '7b': 8 } },
  });
  assert.ok(!kurz.includes('geheim'));
});

test('kurzer Rad-Link lehnt beschädigte und fremde Daten ab', () => {
  const paket = Paket.schummelLinkErstellen(DATEN, {
    aktiv: false, gewichte: {}, naechster: '', naechsterDauerhaft: false,
  });
  const kurz = Paket.schummelKurzKodieren(paket);
  assert.deepEqual(Paket.schummelKurzDekodieren(kurz), paket);
  assert.throws(() => Paket.schummelKurzDekodieren('%%%'));
  assert.throws(() => Paket.schummelKurzDekodieren(kurz.slice(0, -2)));
  const bytes = Uint8Array.from(atob(kurz.replace(/-/g, '+').replace(/_/g, '/')), (z) => z.charCodeAt(0));
  bytes[0] = 99;
  assert.throws(() => Paket.schummelKurzDekodieren(btoa(String.fromCharCode(...bytes))));
  bytes[0] = 2;
  bytes[1] = 128;
  assert.throws(() => Paket.schummelKurzDekodieren(btoa(String.fromCharCode(...bytes))));
});

test('Rad mit vielen Einträgen bleibt im kurzen Link lesbar', () => {
  const daten = { titel: 'Große Liste', eintraege: Array.from({ length: 500 }, (_, i) => `Person ${i + 1}`) };
  const paket = Paket.schummelLinkErstellen(daten, {
    aktiv: true, gewichte: { 'person 500': 0 }, naechster: 'Person 500', naechsterDauerhaft: false,
  });
  assert.deepEqual(Paket.schummelKurzDekodieren(Paket.schummelKurzKodieren(paket)), paket);
});
