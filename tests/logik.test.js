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

// ---------- Umlenken während der Drehung (Live-Steuerung) ----------

/** Simuliert eine Drehung bis zum Zeitpunkt t (0 … 1) und lenkt dann um. */
function umlenkenBei(t, { weg = 40, dauer = 6000, index, anzahl = 8, seed = 1 }) {
  const rotation = weg * Logik.ausrollen(t);
  const restweg = weg * Math.pow(1 - t, 4);
  const restzeit = dauer * (1 - t);
  const plan = Logik.umlenkPlan({ rotation, restweg, restzeit, index, anzahl, zufall: zufallMitSeed(seed) });
  return { plan, rotation, restweg, restzeit };
}

test('Umlenken landet genau auf dem neuen Feld', () => {
  for (let index = 0; index < 8; index++) {
    for (const t of [0.05, 0.2, 0.35]) {
      const { plan, rotation } = umlenkenBei(t, { index, seed: index + 1 });
      assert.ok(plan, `Plan für Feld ${index} bei t=${t}`);
      assert.equal(Logik.indexUnterZeiger(rotation + plan.weg, 8), index);
    }
  }
});

test('Umlenken hält die Geschwindigkeit (kein Ruck)', () => {
  const { plan, restweg, restzeit } = umlenkenBei(0.2, { index: 3 });
  // Geschwindigkeit der Bremskurve am Anfang: 4 · Weg / Dauer
  assert.ok(Math.abs((4 * plan.weg) / plan.dauer - (4 * restweg) / restzeit) < 1e-9);
});

test('Umlenken ändert die Restdauer nur maßvoll', () => {
  for (let index = 0; index < 8; index++) {
    const { plan, restzeit } = umlenkenBei(0.1, { index, seed: 7 + index });
    const faktor = plan.dauer / restzeit;
    assert.ok(faktor >= 0.6 && faktor <= 1.7, `Faktor ${faktor}`);
  }
});

test('mit genug Restweg klappt Umlenken auf jedes Feld', () => {
  // Restweg knapp über der sicheren Grenze, verschiedene Stellungen des Rads
  for (let r = 0; r < 20; r++) {
    for (let index = 0; index < 12; index++) {
      const plan = Logik.umlenkPlan({
        rotation: r * 0.37,
        restweg: Logik.UMLENKEN_SICHER + 0.01,
        restzeit: 1500,
        index,
        anzahl: 12,
        zufall: zufallMitSeed(r * 12 + index),
      });
      assert.ok(plan, `Rotation ${r}, Feld ${index}`);
    }
  }
});

test('kurz vor dem Stillstand wird nicht mehr umgelenkt', () => {
  // Das Rad steht fast: Restweg 0,05 rad, das Zielfeld liegt eine halbe Umdrehung entfernt.
  const plan = Logik.umlenkPlan({ rotation: 0, restweg: 0.05, restzeit: 200, index: 4, anzahl: 8, zufall: () => 0.5 });
  assert.equal(plan, null);
  assert.equal(Logik.umlenkPlan({ rotation: 0, restweg: 0, restzeit: 0, index: 1, anzahl: 8 }), null);
  assert.equal(Logik.umlenkPlan({ rotation: 0, restweg: 10, restzeit: 1000, index: 9, anzahl: 8 }), null);
});

test('Roulette-Kugel: Umlenken endet genau auf dem neuen Feld, ohne Tempowechsel', () => {
  const anzahl = 8;
  for (let index = 0; index < anzahl; index++) {
    const position = 3.4; // Kugel zwischen Feld 3 und 4
    const rest = 20; // noch 20 Felder bis zum bisherigen Ziel
    const plan = Logik.umlenkSchritte({ position, rest, restzeit: 3000, index, anzahl });
    assert.ok(plan, `Feld ${index}`);
    const ende = position + plan.schritte;
    assert.ok(Math.abs(ende - Math.round(ende)) < 1e-9, 'endet auf einem ganzen Feld');
    assert.equal(Logik.mod(Math.round(ende), anzahl), index);
    // Geschwindigkeit der Bremskurve 1 − (1 − t)³ am Anfang: 3 · Rest / Restzeit
    assert.ok(Math.abs((3 * plan.schritte) / plan.dauer - (3 * rest) / 3000) < 1e-9);
  }
});

test('Roulette-Kugel: mit genug Restweg immer, kurz vor Schluss nicht mehr', () => {
  const anzahl = 12;
  const sicher = Logik.umlenkSchritteSicher(anzahl);
  for (let index = 0; index < anzahl; index++) {
    for (let p = 0; p < 12; p++) {
      assert.ok(Logik.umlenkSchritte({ position: p + 0.3, rest: sicher + 0.01, restzeit: 900, index, anzahl }));
    }
  }
  // Nur noch ein halbes Feld übrig, Ziel liegt ein halbes Brett entfernt
  assert.equal(Logik.umlenkSchritte({ position: 5.5, rest: 0.5, restzeit: 100, index: 11, anzahl }), null);
});

// ---------- Reihenfolge ----------

test('Reihenfolge: der erste Eintrag, der im Rad steht, wird erzwungen', () => {
  const admin = { aktiv: true, gewichte: { '7b': 0 }, reihenfolge: ['9z', '7b', '5a'] };
  const a = Logik.analyse(KLASSEN, admin);
  assert.equal(a.modus, 'erzwungen');
  assert.equal(a.quelle, 'reihenfolge');
  assert.equal(a.reihenfolgePos, 1); // „9z“ steht nicht im Rad → übersprungen
  assert.equal(KLASSEN[Logik.waehleGewinner(KLASSEN, admin, Math.random).index], '7b'); // schlägt auch Gewicht 0
});

test('Reihenfolge: festgelegter nächster Gewinner hat Vorrang, ausgeschaltet gilt nichts', () => {
  const admin = { aktiv: true, naechster: '6a', reihenfolge: ['7b'] };
  assert.equal(Logik.analyse(KLASSEN, admin).quelle, 'naechster');
  assert.equal(KLASSEN[Logik.waehleGewinner(KLASSEN, admin, Math.random).index], '6a');
  const aus = Logik.analyse(KLASSEN, { ...admin, aktiv: false });
  assert.equal(aus.modus, 'fair');
  assert.equal(aus.quelle, '');
});

test('Reihenfolge: „Zufall“-Eintrag lässt die Gewichte entscheiden', () => {
  const admin = { aktiv: true, gewichte: { '5a': 0 }, reihenfolge: ['', '7b'] };
  const a = Logik.analyse(KLASSEN, admin);
  assert.equal(a.modus, 'gewichtet');
  assert.equal(a.quelle, 'reihenfolge');
  assert.equal(a.reihenfolgePos, 0);
  assert.equal(a.wahrscheinlichkeiten[0], 0);
});

test('Reihenfolge ändern: anhängen, streichen, leeren, Grenzen', () => {
  let liste = Logik.reihenfolgeAendern([], [{ plus: ' 7b ' }, { plus: '' }, { plus: '5a' }, { plus: '7b' }]);
  assert.deepEqual(liste, ['7b', '', '5a', '7b']);
  liste = Logik.reihenfolgeAendern(liste, [{ minus: 3, name: '7B' }]);
  assert.deepEqual(liste, ['7b', '', '5a']);
  // Position passt nicht mehr (z. B. schon verbraucht) → erster passender Name
  liste = Logik.reihenfolgeAendern(liste, [{ minus: 0, name: '5a' }]);
  assert.deepEqual(liste, ['7b', '']);
  assert.deepEqual(Logik.reihenfolgeAendern(liste, [{ leeren: true }, { plus: '8a' }]), ['8a']);
  assert.deepEqual(Logik.reihenfolgeAendern(['x'], [null, 5, { minus: 'a' }, { plus: 3 }]), ['x']);
  const voll = Logik.reihenfolgeAendern([], Array.from({ length: 80 }, (_, i) => ({ plus: String(i) })));
  assert.equal(voll.length, Logik.MAX_REIHENFOLGE);
});

test('Reihenfolge verbrauchen: benutzten Eintrag und übersprungene davor streichen', () => {
  assert.deepEqual(Logik.reihenfolgeVerbrauchen(['9z', '7b', '5a'], 1, '7b'), ['5a']);
  assert.deepEqual(Logik.reihenfolgeVerbrauchen(['', '7b'], 0, ''), ['7b']);
  // Während der Drehung umsortiert: nach Namen suchen
  assert.deepEqual(Logik.reihenfolgeVerbrauchen(['5a', '7b', '8a'], 0, '7b'), ['8a']);
  // Inzwischen gelöscht: nichts tun
  assert.deepEqual(Logik.reihenfolgeVerbrauchen(['5a'], 0, '7b'), ['5a']);
});
