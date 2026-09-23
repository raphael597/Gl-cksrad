// Tests für js/logik.js – ausführen mit:  npm test   (oder: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const Logik = require('../js/logik.js');

/** Reproduzierbarer Zufallsgenerator (mulberry32), damit Tests nicht flackern. */
function zufallMitSeed(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KLASSEN = ['5a', '5b', '6a', '6b', '7a', '7b'];

function ziehen(eintraege, admin, runden = 5000, seed = 42) {
  const zufall = zufallMitSeed(seed);
  const zaehler = {};
  for (let i = 0; i < runden; i++) {
    const { index } = Logik.waehleGewinner(eintraege, admin, zufall);
    zaehler[eintraege[index]] = (zaehler[eintraege[index]] || 0) + 1;
  }
  return zaehler;
}

test('ohne Admin-Einstellungen ist das Rad fair', () => {
  const { wahrscheinlichkeiten, modus } = Logik.analyse(KLASSEN, null);
  assert.equal(modus, 'fair');
  for (const p of wahrscheinlichkeiten) assert.ok(Math.abs(p - 1 / 6) < 1e-12);
});

test('ausgeschaltete Manipulation ignoriert Gewichte', () => {
  const admin = { aktiv: false, gewichte: { '7b': 0 }, naechster: '5a' };
  assert.equal(Logik.analyse(KLASSEN, admin).modus, 'fair');
  assert.ok(ziehen(KLASSEN, admin)['7b'] > 0);
});

test('Gewicht 0 kommt nie dran', () => {
  const admin = { aktiv: true, gewichte: { '7b': 0, '6a': 0 } };
  const zaehler = ziehen(KLASSEN, admin);
  assert.equal(zaehler['7b'], undefined);
  assert.equal(zaehler['6a'], undefined);
  assert.equal(Object.keys(zaehler).length, 4);
});

test('Namen werden unabhängig von Groß-/Kleinschreibung und Leerzeichen erkannt', () => {
  const admin = { aktiv: true, gewichte: { '7b': 0 } };
  const eintraege = ['5a', ' 7B ', '8c'];
  assert.equal(ziehen(eintraege, admin)[' 7B '], undefined);
});

test('höheres Gewicht wird entsprechend häufiger gezogen', () => {
  const admin = { aktiv: true, gewichte: { '5a': 3 } }; // 3 von 8 Anteilen
  const anteil = ziehen(KLASSEN, admin, 20000)['5a'] / 20000;
  assert.ok(Math.abs(anteil - 3 / 8) < 0.02, `Anteil war ${anteil}`);
});

test('festgelegter Gewinner schlägt alle Gewichte', () => {
  const admin = { aktiv: true, gewichte: { '6b': 0 }, naechster: '6b' };
  assert.equal(Logik.analyse(KLASSEN, admin).modus, 'erzwungen');
  assert.deepEqual(Object.keys(ziehen(KLASSEN, admin, 500)), ['6b']);
});

test('festgelegter Gewinner, der nicht im Rad steht, wird ignoriert', () => {
  const admin = { aktiv: true, gewichte: {}, naechster: '9z' };
  assert.equal(Logik.analyse(KLASSEN, admin).modus, 'fair');
});

test('sind alle gesperrt, wird im Notfall fair gezogen', () => {
  const gewichte = Object.fromEntries(KLASSEN.map((k) => [k, 0]));
  const { modus, wahrscheinlichkeiten } = Logik.analyse(KLASSEN, { aktiv: true, gewichte });
  assert.equal(modus, 'notfall');
  assert.ok(wahrscheinlichkeiten.every((p) => p > 0));
});

test('leeres Rad liefert Index -1', () => {
  assert.equal(Logik.waehleGewinner([], { aktiv: true }).index, -1);
});

test('zielRotation landet immer auf dem gewünschten Feld – nie knapp am Rand', () => {
  const zufall = zufallMitSeed(7);
  for (let durchlauf = 0; durchlauf < 2000; durchlauf++) {
    const anzahl = 1 + Math.floor(zufall() * 40);
    const index = Math.floor(zufall() * anzahl);
    const aktuell = (zufall() - 0.5) * 100;
    const ziel = Logik.zielRotation(aktuell, index, anzahl, zufall);

    assert.equal(Logik.indexUnterZeiger(ziel, anzahl), index);
    // mindestens 5 volle Umdrehungen, damit es nach echtem Drehen aussieht
    assert.ok(ziel - aktuell >= 5 * Logik.VOLLKREIS);

    // Position im Feld liegt zwischen 12 % und 88 %
    const feld = Logik.VOLLKREIS / anzahl;
    const stelle = (Logik.mod(-ziel, Logik.VOLLKREIS) / feld) % 1;
    assert.ok(stelle > 0.11 && stelle < 0.89, `Stelle ${stelle}`);
  }
});

test('indexUnterZeiger: ungedreht zeigt der Zeiger auf Feld 0', () => {
  assert.equal(Logik.indexUnterZeiger(0, 8), 0);
  // Ein kleines Stück im Uhrzeigersinn gedreht → der Zeiger steht auf dem letzten Feld.
  assert.equal(Logik.indexUnterZeiger(0.01, 8), 7);
});

test('„nicht zweimal hintereinander“: der letzte Gewinner wird ausgelassen', () => {
  const zaehler = {};
  const zufall = zufallMitSeed(3);
  for (let i = 0; i < 3000; i++) {
    const { index } = Logik.waehleGewinner(KLASSEN, null, zufall, { ausschliessen: ['6A'] });
    zaehler[KLASSEN[index]] = (zaehler[KLASSEN[index]] || 0) + 1;
  }
  assert.equal(zaehler['6a'], undefined);
  assert.equal(Object.keys(zaehler).length, 5);
});

test('Ausschluss wird ignoriert, wenn sonst nichts übrig bliebe', () => {
  // Nur ein Eintrag im Rad
  assert.equal(Logik.waehleGewinner(['7b'], null, Math.random, { ausschliessen: ['7b'] }).index, 0);
  // Alle anderen sind per Admin gesperrt → Admin-Sperre hat Vorrang
  const admin = { aktiv: true, gewichte: { '5a': 0, '5b': 0 } };
  const { wahrscheinlichkeiten } = Logik.analyse(['5a', '5b', '6a'], admin, { ausschliessen: ['6a'] });
  assert.deepEqual(wahrscheinlichkeiten, [0, 0, 1]);
});

test('ein festgelegter Gewinner schlägt „nicht zweimal hintereinander“', () => {
  const admin = { aktiv: true, gewichte: {}, naechster: '8a' };
  const { modus, wahrscheinlichkeiten } = Logik.analyse(['5a', '8a'], admin, { ausschliessen: ['8a'] });
  assert.equal(modus, 'erzwungen');
  assert.deepEqual(wahrscheinlichkeiten, [0, 1]);
});

test('Ausschluss und Admin-Gewichte wirken zusammen', () => {
  const admin = { aktiv: true, gewichte: { '7b': 0 } };
  const { wahrscheinlichkeiten } = Logik.analyse(['5a', '6a', '7b'], admin, { ausschliessen: ['5a'] });
  assert.deepEqual(wahrscheinlichkeiten, [0, 1, 0]);
});
