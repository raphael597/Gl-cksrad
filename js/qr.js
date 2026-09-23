/*
 * qr.js – kleiner QR-Code-Erzeuger (Byte-Modus, Fehlerkorrektur M, Version 1–20).
 *
 * Gebraucht für den Handy-Link im Admin-Bereich: QR-Code abscannen statt Link abtippen.
 * Ohne Bibliotheken und ohne Netz (die Content-Security-Policy erlaubt nur eigene Skripte).
 * Aufbau nach ISO/IEC 18004; läuft im Browser (als globales `QR`) und in Node (Tests).
 */
(function (root, fabrik) {
  const api = fabrik();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QR = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Fehlerkorrektur-Stufe M (15 %): Korrektur-Bytes pro Block und Anzahl Blöcke je Version.
  const KORREKTUR_PRO_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const BLOECKE = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  const MAX_VERSION = 20;
  const FORMAT_M = 0; // Bits der Stufe M im Formatfeld

  // ---------- Rechnen im Galois-Feld GF(256) ----------

  function gfMal(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsTeiler(grad) {
    const ergebnis = new Array(grad).fill(0);
    ergebnis[grad - 1] = 1;
    let wurzel = 1;
    for (let i = 0; i < grad; i++) {
      for (let j = 0; j < grad; j++) {
        ergebnis[j] = gfMal(ergebnis[j], wurzel);
        if (j + 1 < grad) ergebnis[j] ^= ergebnis[j + 1];
      }
      wurzel = gfMal(wurzel, 0x02);
    }
    return ergebnis;
  }

  /** Reed-Solomon-Korrekturbytes für einen Datenblock. */
  function rsRest(daten, grad) {
    const teiler = rsTeiler(grad);
    const rest = new Array(grad).fill(0);
    for (const b of daten) {
      const faktor = b ^ rest.shift();
      rest.push(0);
      for (let i = 0; i < grad; i++) rest[i] ^= gfMal(teiler[i], faktor);
    }
    return rest;
  }

  // ---------- Größen ----------

  /** Anzahl Module, die für Daten + Korrektur übrig bleiben. */
  function rohModule(version) {
    let n = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const ausrichtung = Math.floor(version / 7) + 2;
      n -= (25 * ausrichtung - 10) * ausrichtung - 55;
      if (version >= 7) n -= 36;
    }
    return n;
  }

  const datenBytes = (version) => Math.floor(rohModule(version) / 8) - KORREKTUR_PRO_BLOCK[version] * BLOECKE[version];

  function ausrichtungsPositionen(version) {
    if (version === 1) return [];
    const anzahl = Math.floor(version / 7) + 2;
    const abstand = Math.ceil((version * 4 + 4) / (anzahl * 2 - 2)) * 2;
    const positionen = [6];
    for (let pos = version * 4 + 10; positionen.length < anzahl; pos -= abstand) positionen.splice(1, 0, pos);
    return positionen;
  }

  // ---------- Daten kodieren ----------

  function datenKodieren(bytes, version) {
    const bits = [];
    const anhaengen = (wert, laenge) => {
      for (let i = laenge - 1; i >= 0; i--) bits.push((wert >>> i) & 1);
    };
    anhaengen(0b0100, 4); // Byte-Modus
    anhaengen(bytes.length, version < 10 ? 8 : 16);
    for (const b of bytes) anhaengen(b, 8);

    const kapazitaet = datenBytes(version) * 8;
    anhaengen(0, Math.min(4, kapazitaet - bits.length)); // Endmarke
    anhaengen(0, (8 - (bits.length % 8)) % 8);
    const daten = [];
    for (let i = 0; i < bits.length; i += 8) daten.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let fuell = 0xec; daten.length < kapazitaet / 8; fuell ^= 0xec ^ 0x11) daten.push(fuell);
    return daten;
  }

  /** Daten auf Blöcke verteilen, Korrekturbytes anhängen und verschachteln. */
  function mitKorrektur(daten, version) {
    const anzahlBloecke = BLOECKE[version];
    const korrektur = KORREKTUR_PRO_BLOCK[version];
    const gesamt = Math.floor(rohModule(version) / 8);
    const kurzeBloecke = anzahlBloecke - (gesamt % anzahlBloecke);
    const kurzLaenge = Math.floor(gesamt / anzahlBloecke);

    const bloecke = [];
    for (let i = 0, k = 0; i < anzahlBloecke; i++) {
      const laenge = kurzLaenge - korrektur + (i < kurzeBloecke ? 0 : 1);
      const block = daten.slice(k, k + laenge);
      k += laenge;
      const rest = rsRest(block, korrektur);
      if (i < kurzeBloecke) block.push(0); // Platzhalter, damit alle Blöcke gleich lang sind
      bloecke.push(block.concat(rest));
    }

    const ergebnis = [];
    for (let i = 0; i < bloecke[0].length; i++) {
      bloecke.forEach((block, j) => {
        if (i !== kurzLaenge - korrektur || j >= kurzeBloecke) ergebnis.push(block[i]);
      });
    }
    return ergebnis;
  }

  // ---------- Matrix ----------

  const MASKEN = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  function matrixBauen(version, codewoerter, maske) {
    const n = version * 4 + 17;
    const module = Array.from({ length: n }, () => new Array(n).fill(false));
    const fest = Array.from({ length: n }, () => new Array(n).fill(false));
    const setzen = (x, y, dunkel) => {
      module[y][x] = dunkel;
      fest[y][x] = true;
    };

    // Taktlinien
    for (let i = 0; i < n; i++) {
      setzen(6, i, i % 2 === 0);
      setzen(i, 6, i % 2 === 0);
    }
    // Suchmuster in drei Ecken (mit hellem Rand)
    for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const abstand = Math.max(Math.abs(dx), Math.abs(dy));
          if (x >= 0 && x < n && y >= 0 && y < n) setzen(x, y, abstand !== 2 && abstand !== 4);
        }
      }
    }
    // Ausrichtungsmuster
    const pos = ausrichtungsPositionen(version);
    pos.forEach((y, i) => {
      pos.forEach((x, j) => {
        const ecke = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
        if (ecke) return;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) setzen(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      });
    });
    formatSetzen(setzen, n, maske);
    // Versionsinformation (ab Version 7)
    if (version >= 7) {
      let rest = version;
      for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
      const bits = (version << 12) | rest;
      for (let i = 0; i < 18; i++) {
        const dunkel = ((bits >>> i) & 1) === 1;
        const a = n - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setzen(a, b, dunkel);
        setzen(b, a, dunkel);
      }
    }

    // Daten im Zickzack von unten rechts einfüllen
    let i = 0;
    for (let rechts = n - 1; rechts >= 1; rechts -= 2) {
      if (rechts === 6) rechts = 5;
      for (let schritt = 0; schritt < n; schritt++) {
        for (let j = 0; j < 2; j++) {
          const x = rechts - j;
          const aufwaerts = ((rechts + 1) & 2) === 0;
          const y = aufwaerts ? n - 1 - schritt : schritt;
          if (fest[y][x]) continue;
          if (i < codewoerter.length * 8) {
            module[y][x] = ((codewoerter[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
          if (MASKEN[maske](x, y)) module[y][x] = !module[y][x];
        }
      }
    }
    return module;
  }

  function formatSetzen(setzen, n, maske) {
    const daten = (FORMAT_M << 3) | maske;
    let rest = daten;
    for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const bits = ((daten << 10) | rest) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) === 1;

    for (let i = 0; i <= 5; i++) setzen(8, i, bit(i));
    setzen(8, 7, bit(6));
    setzen(8, 8, bit(7));
    setzen(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setzen(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setzen(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setzen(8, n - 15 + i, bit(i));
    setzen(8, n - 8, true); // immer dunkles Modul
  }

  /** Strafpunkte nach Norm – die Maske mit den wenigsten ist am besten lesbar. */
  function strafpunkte(module) {
    const n = module.length;
    let punkte = 0;
    const zeileOderSpalte = (lesen) => {
      let lauf = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && lesen(i) === lesen(i - 1)) {
          lauf++;
        } else {
          if (lauf >= 5) punkte += lauf - 2;
          lauf = 1;
        }
      }
      // Muster ähnlich einem Suchmuster: 1011101 mit 4 hellen Modulen davor oder danach
      for (let i = 0; i + 11 <= n; i++) {
        const muster = Array.from({ length: 11 }, (_, k) => (lesen(i + k) ? 1 : 0)).join('');
        if (muster === '10111010000' || muster === '00001011101') punkte += 40;
      }
    };
    for (let y = 0; y < n; y++) zeileOderSpalte((x) => module[y][x]);
    for (let x = 0; x < n; x++) zeileOderSpalte((y) => module[y][x]);

    let dunkel = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (module[y][x]) dunkel++;
        if (x < n - 1 && y < n - 1) {
          const f = module[y][x];
          if (f === module[y][x + 1] && f === module[y + 1][x] && f === module[y + 1][x + 1]) punkte += 3;
        }
      }
    }
    const k = Math.ceil(Math.abs(dunkel * 20 - n * n * 10) / (n * n)) - 1;
    return punkte + Math.max(0, k) * 10;
  }

  /**
   * Erzeugt den QR-Code für `text`.
   * Rückgabe: { version, groesse, module } – module[y][x] = true heißt dunkel.
   */
  function erzeugen(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let version = 1;
    while (version <= MAX_VERSION && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > datenBytes(version) * 8) version++;
    if (version > MAX_VERSION) throw new Error('Text zu lang für einen QR-Code');

    const codewoerter = mitKorrektur(datenKodieren(bytes, version), version);
    let beste = null;
    for (let maske = 0; maske < 8; maske++) {
      const module = matrixBauen(version, codewoerter, maske);
      const punkte = strafpunkte(module);
      if (!beste || punkte < beste.punkte) beste = { module, punkte };
    }
    return { version, groesse: beste.module.length, module: beste.module };
  }

  /** SVG-Pfad (ein <path>) für die dunklen Module, mit `rand` Modulen Ruhezone. */
  function svgPfad(qr, rand = 4) {
    const teile = [];
    qr.module.forEach((zeile, y) => {
      zeile.forEach((dunkel, x) => {
        if (dunkel) teile.push(`M${x + rand} ${y + rand}h1v1h-1z`);
      });
    });
    return teile.join('');
  }

  return { erzeugen, svgPfad, rsRest };
});
