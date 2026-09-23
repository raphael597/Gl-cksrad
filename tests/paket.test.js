// Tests für js/paket.js – ausführen mit:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Paket = require('../js/paket.js');

const STANDARD = {
  dauer: 'normal', farben: 'bunt', design: 'dunkel', autoEntfernen: false, konfetti: true,
  ergebnisText: 'Das Rad hat entschieden:', nabeText: 'DREH!', vorlesen: false, nichtDoppelt: false, anzahlZiehen: 1,
};

const DATEN = {
  titel: 'Klassen',
  eintraege: ['5a', '6b', '7b', 'Zoë „Z“'],
  gespeichert: [{ name: 'Namen', eintraege: ['Anna', 'Ben'], zeit: 1700000000000 }],
  einstellungen: { ...STANDARD, dauer: 'kurz', anzahlZiehen: 3 },
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
