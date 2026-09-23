// Tests für server/live.js – ausführen mit:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { erstelleServer } = require('../server/live.js');

const RAUM = 'TestRaum_0123456789abcdef';

function starten(optionen = {}) {
  const server = erstelleServer({ protokoll: { error() {} }, ...optionen });
  return new Promise((fertig) => {
    server.listen(0, '127.0.0.1', () => fertig({ server, basis: `http://127.0.0.1:${server.address().port}` }));
  });
}

function stoppen(server) {
  server.alleTrennen();
  return new Promise((fertig) => server.close(fertig));
}

/** Öffnet einen Ereignisstrom und sammelt die Ereignisse. */
function lauschen(basis, raum, rolle) {
  return new Promise((fertig, fehler) => {
    const ereignisse = [];
    const wartende = [];
    let puffer = '';
    const req = http.get(`${basis}/api/live/${raum}/ereignisse?rolle=${rolle}`, (res) => {
      res.setEncoding('utf8');
      res.on('data', (teil) => {
        puffer += teil;
        let ende;
        while ((ende = puffer.indexOf('\n\n')) >= 0) {
          const block = puffer.slice(0, ende);
          puffer = puffer.slice(ende + 2);
          const typ = (block.match(/^event: (.*)$/m) || [])[1];
          const daten = (block.match(/^data: (.*)$/m) || [])[1];
          if (!typ) continue;
          ereignisse.push({ typ, daten: JSON.parse(daten) });
          wartende.splice(0).forEach((w) => w());
        }
      });
      fertig({
        res,
        ereignisse,
        /** Wartet auf das nächste Ereignis dieses Typs (ab Index `ab`). */
        async naechstes(typ, ab = 0, passt = () => true) {
          for (let versuch = 0; versuch < 50; versuch++) {
            const treffer = ereignisse.slice(ab).find((e) => e.typ === typ && passt(e.daten));
            if (treffer) return treffer.daten;
            await new Promise((weiter) => {
              wartende.push(weiter);
              setTimeout(weiter, 40);
            });
          }
          throw new Error(`kein Ereignis „${typ}“`);
        },
        schliessen: () => req.destroy(),
      });
    });
    req.on('error', fehler);
  });
}

function senden(basis, raum, art, koerper, typ = 'application/json') {
  return new Promise((fertig, fehler) => {
    const text = typeof koerper === 'string' ? koerper : JSON.stringify(koerper);
    const req = http.request(`${basis}/api/live/${raum}/${art}`, {
      method: 'POST',
      headers: { 'Content-Type': typ, 'Content-Length': Buffer.byteLength(text) },
    }, (res) => {
      let antwort = '';
      res.on('data', (teil) => (antwort += teil));
      res.on('end', () => fertig({ status: res.statusCode, text: antwort }));
    });
    req.on('error', fehler);
    req.end(text);
  });
}

test('Rad und Handy treffen sich im Raum und tauschen Stand und Befehle aus', async () => {
  const { server, basis } = await starten();
  try {
    const rad = await lauschen(basis, RAUM, 'anzeige');
    assert.deepEqual((await rad.naechstes('hallo')).praesenz, { anzeigen: 1, steuerungen: 0 });

    const stand = { titel: 'Klassen', eintraege: ['5a', '6b'], text: 'Zeile 1\nZeile 2' };
    assert.equal((await senden(basis, RAUM, 'zustand', stand)).status, 204);

    // Ein später verbundenes Handy bekommt sofort den letzten Stand.
    const handy = await lauschen(basis, RAUM, 'steuerung');
    const hallo = await handy.naechstes('hallo');
    assert.deepEqual(hallo.zustand, stand);
    assert.deepEqual(hallo.praesenz, { anzeigen: 1, steuerungen: 1 });

    // Das Rad erfährt, dass ein Handy da ist.
    const praesenz = await rad.naechstes('praesenz', 0, (p) => p.steuerungen === 1);
    assert.equal(praesenz.anzeigen, 1);

    // Befehl vom Handy kommt beim Rad an.
    const antwort = await senden(basis, RAUM, 'befehl', { typ: 'drehen', nr: 1 });
    assert.equal(antwort.status, 202);
    assert.deepEqual(await rad.naechstes('befehl'), { typ: 'drehen', nr: 1 });

    // Neuer Stand vom Rad kommt beim Handy an.
    const ab = handy.ereignisse.length;
    await senden(basis, RAUM, 'zustand', { titel: 'Neu' });
    assert.deepEqual(await handy.naechstes('zustand', ab), { titel: 'Neu' });

    rad.schliessen();
    handy.schliessen();
  } finally {
    await stoppen(server);
  }
});

test('Befehl ohne verbundenes Rad meldet „offline“', async () => {
  const { server, basis } = await starten();
  try {
    const antwort = await senden(basis, RAUM, 'befehl', { typ: 'drehen' });
    assert.equal(antwort.status, 409);
    assert.match(antwort.text, /offline/);
  } finally {
    await stoppen(server);
  }
});

test('Räume sind voneinander getrennt', async () => {
  const { server, basis } = await starten();
  try {
    const rad = await lauschen(basis, RAUM, 'anzeige');
    await rad.naechstes('hallo');
    const fremd = await senden(basis, 'AndererRaum_0123456789ab', 'befehl', { typ: 'drehen' });
    assert.equal(fremd.status, 409);
    await new Promise((weiter) => setTimeout(weiter, 50));
    assert.equal(rad.ereignisse.filter((e) => e.typ === 'befehl').length, 0);
    rad.schliessen();
  } finally {
    await stoppen(server);
  }
});

test('ungültige Anfragen werden abgelehnt', async () => {
  const { server, basis } = await starten();
  try {
    assert.equal((await senden(basis, 'kurz', 'zustand', {})).status, 404);
    assert.equal((await senden(basis, RAUM, 'zustand', '{kaputt')).status, 400);
    assert.equal((await senden(basis, RAUM, 'zustand', '[1,2]')).status, 400);
    assert.equal((await senden(basis, RAUM, 'zustand', '{}', 'text/plain')).status, 415);
    assert.equal((await senden(basis, RAUM, 'zustand', { x: 'y'.repeat(600 * 1024) })).status, 413);
    const falscheRolle = await new Promise((fertig) => http.get(`${basis}/api/live/${RAUM}/ereignisse?rolle=chef`, fertig));
    assert.equal(falscheRolle.statusCode, 400);
    falscheRolle.resume();
  } finally {
    await stoppen(server);
  }
});

test('zu viele Nachrichten werden gebremst', async () => {
  const { server, basis } = await starten();
  try {
    const status = [];
    for (let i = 0; i < 80; i++) status.push((await senden(basis, RAUM, 'zustand', { i })).status);
    assert.ok(status.includes(429));
    assert.equal(status[0], 204);
  } finally {
    await stoppen(server);
  }
});

test('getrennte Geräte werden abgemeldet', async () => {
  const { server, basis } = await starten();
  try {
    const handy = await lauschen(basis, RAUM, 'steuerung');
    await handy.naechstes('hallo');
    assert.equal(server.raeume.size, 1);
    handy.schliessen();
    await new Promise((weiter) => setTimeout(weiter, 50));
    assert.equal(server.raeume.get(RAUM).steuerung.size, 0);
  } finally {
    await stoppen(server);
  }
});

test('npm start liefert nur die Seite aus, keine Server- oder Testdateien', async () => {
  const { server, basis } = await starten({ statisch: path.resolve(__dirname, '..') });
  const holen = (pfad) => new Promise((fertig) => http.get(basis + pfad, (res) => {
    res.resume();
    fertig(res);
  }));
  try {
    const start = await holen('/');
    assert.equal(start.statusCode, 200);
    assert.match(start.headers['content-type'], /text\/html/);
    assert.match(start.headers['content-security-policy'], /script-src 'self'/);
    assert.equal((await holen('/fernbedienung.html')).statusCode, 200);
    assert.equal((await holen('/js/app.js')).statusCode, 200);
    for (const pfad of ['/server/live.js', '/tests/qr.test.js', '/package.json', '/../etc/passwd', '/js/../server/live.js', '/.git/config', '/%2e%2e/etc/passwd']) {
      assert.equal((await holen(pfad)).statusCode, 404, pfad);
    }
  } finally {
    await stoppen(server);
  }
});
