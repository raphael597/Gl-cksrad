// Tests für js/qr.js – ausführen mit:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../js/qr.js');

test('Reed-Solomon stimmt mit dem Beispiel aus der Norm-Literatur überein', () => {
  // „HELLO WORLD“, Version 1-M (bekanntes Beispiel, z. B. thonky.com QR-Tutorial)
  const daten = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(QR.rsRest(daten, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('Version wächst mit der Textlänge', () => {
  assert.equal(QR.erzeugen('a'.repeat(14)).version, 1); // 1-M: 14 Bytes
  assert.equal(QR.erzeugen('a'.repeat(15)).version, 2);
  const link = 'https://gluecksrad.deine-domain.de/fernbedienung.html#k=AbCdEfGhIjKlMnOpQrStUv';
  const qr = QR.erzeugen(link);
  assert.equal(qr.version, 5);
  assert.equal(qr.groesse, 37);
  assert.throws(() => QR.erzeugen('x'.repeat(700)));
});

test('Suchmuster, Taktlinien und dunkles Modul sitzen an der richtigen Stelle', () => {
  const { module, groesse: n } = QR.erzeugen('Glücksrad');
  const suchmuster = (x0, y0) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const rand = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        assert.equal(module[y0 + y][x0 + x], rand !== 2, `Suchmuster bei ${x0 + x}/${y0 + y}`);
      }
    }
  };
  suchmuster(0, 0);
  suchmuster(n - 7, 0);
  suchmuster(0, n - 7);
  for (let i = 8; i < n - 8; i++) {
    assert.equal(module[6][i], i % 2 === 0);
    assert.equal(module[i][6], i % 2 === 0);
  }
  assert.equal(module[n - 8][8], true);
});

test('Formatinformation ist doppelt und gültig vorhanden', () => {
  const { module, groesse: n } = QR.erzeugen('https://example.org/');
  let oben = 0;
  let unten = 0;
  const bitsOben = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  bitsOben.forEach(([x, y], i) => (oben |= (module[y][x] ? 1 : 0) << i));
  for (let i = 0; i < 8; i++) unten |= (module[8][n - 1 - i] ? 1 : 0) << i;
  for (let i = 8; i < 15; i++) unten |= (module[n - 15 + i][8] ? 1 : 0) << i;
  assert.equal(oben, unten);
  const roh = oben ^ 0x5412;
  assert.equal(roh >>> 13, 0, 'Fehlerkorrektur-Stufe M');
  // BCH-Prüfung: Rest der Division durch das Generatorpolynom muss 0 sein
  let rest = roh;
  for (let i = 14; i >= 10; i--) if ((rest >>> i) & 1) rest ^= 0x537 << (i - 10);
  assert.equal(rest, 0);
});

test('SVG-Pfad enthält ein Rechteck pro dunklem Modul', () => {
  const qr = QR.erzeugen('Test');
  const dunkel = qr.module.flat().filter(Boolean).length;
  assert.equal((QR.svgPfad(qr).match(/M/g) || []).length, dunkel);
});
