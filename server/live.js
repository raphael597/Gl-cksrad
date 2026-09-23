#!/usr/bin/env node
/*
 * live.js – kleiner Live-Server für die Handy-Fernbedienung (ohne Abhängigkeiten).
 *
 * Das Rad (Rechner/Beamer) und die Fernbedienung (Handy) treffen sich in einem
 * „Raum“. Der Raum-Schlüssel ist ein langer Zufallswert aus dem Admin-Bereich und
 * steckt im Handy-Link – wer ihn nicht kennt, kommt nicht hinein.
 *
 *   GET  /api/live/<raum>/ereignisse?rolle=anzeige|steuerung   Server-Sent Events
 *   POST /api/live/<raum>/zustand   Rad → Server: aktueller Stand (an alle Handys)
 *   POST /api/live/<raum>/befehl    Handy → Server: Befehl (an das Rad)
 *   GET  /api/live/healthz          „ok“
 *
 * Der Server ist nur ein Vermittler: Er speichert nichts auf der Festplatte,
 * behält pro Raum nur den letzten Stand im Arbeitsspeicher und vergisst den Raum
 * kurz nachdem das letzte Gerät die Verbindung getrennt hat.
 *
 * Lokal ausprobieren:  npm start  → http://localhost:8000 (liefert auch die Seite aus)
 * Im Docker-Image liefert nginx die Seite aus und leitet nur /api/live/ hierher weiter.
 *
 * Umgebungsvariablen: PORT (8000), HOST (0.0.0.0), STATISCH=0 (Seite nicht ausliefern),
 *                     BENUTZER (nach dem Start zu diesem Benutzer wechseln, z. B. nginx)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAUM_MUSTER = /^[A-Za-z0-9_-]{22,64}$/;
const MAX_KOERPER = 512 * 1024; // 500 Einträge à 100 Zeichen passen bequem hinein
const MAX_RAEUME = 200;
const MAX_VERBINDUNGEN_PRO_RAUM = 12;
const MAX_VERBINDUNGEN = 2000;
const RAUM_VERGESSEN_MS = 10 * 60 * 1000; // nach der letzten Verbindung
const PING_MS = 20 * 1000; // hält Proxys (Coolify, Cloudflare) die Verbindung offen
const NACHRICHTEN_PRO_SEKUNDE = 20;
const NACHRICHTEN_SPITZE = 60;

const ROLLEN = ['anzeige', 'steuerung'];

// Gleiche Sicherheits-Header wie in deploy/nginx.conf – nur für npm start.
// Im Docker-Image setzt nginx sie selbst (sonst stünden sie doppelt da).
const SICHERHEIT = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
};
// Nur Dateien, die auch das Docker-Image ausliefert (keine Tests, kein server/).
const STATISCH_ERLAUBT = /^\/(?:[\w-]+\.(?:html|webmanifest)|sw\.js|(?:css|js|icons)\/[\w.-]+)$/;

function erstelleServer({ statisch = null, protokoll = console } = {}) {
  const raeume = new Map();
  const sicherheit = statisch ? SICHERHEIT : {};
  let verbindungen = 0;

  // ---------- Räume ----------

  function raumHolen(schluessel, anlegen) {
    let raum = raeume.get(schluessel);
    if (!raum && anlegen) {
      if (raeume.size >= MAX_RAEUME) aufraeumen(true);
      if (raeume.size >= MAX_RAEUME) return null;
      raum = { anzeige: new Set(), steuerung: new Set(), zustand: null, zuletzt: Date.now(), eimer: NACHRICHTEN_SPITZE, eimerZeit: Date.now() };
      raeume.set(schluessel, raum);
    }
    return raum || null;
  }

  const verbunden = (raum) => raum.anzeige.size + raum.steuerung.size;

  /** Räume ohne Verbindung vergessen (sofort = auch frisch verlassene Räume). */
  function aufraeumen(sofort = false) {
    const grenze = Date.now() - (sofort ? 0 : RAUM_VERGESSEN_MS);
    for (const [schluessel, raum] of raeume) {
      if (verbunden(raum) === 0 && raum.zuletzt <= grenze) raeume.delete(schluessel);
    }
  }

  /** Einfache Bremse gegen Überflutung: höchstens ~20 Nachrichten pro Sekunde und Raum. */
  function darfSenden(raum) {
    const jetzt = Date.now();
    raum.eimer = Math.min(NACHRICHTEN_SPITZE, raum.eimer + ((jetzt - raum.eimerZeit) / 1000) * NACHRICHTEN_PRO_SEKUNDE);
    raum.eimerZeit = jetzt;
    if (raum.eimer < 1) return false;
    raum.eimer -= 1;
    return true;
  }

  function senden(antworten, ereignis, json) {
    const nachricht = `event: ${ereignis}\ndata: ${json}\n\n`;
    for (const res of antworten) res.write(nachricht);
  }

  function praesenz(raum) {
    return { anzeigen: raum.anzeige.size, steuerungen: raum.steuerung.size };
  }

  function praesenzMelden(raum) {
    const json = JSON.stringify(praesenz(raum));
    senden(raum.anzeige, 'praesenz', json);
    senden(raum.steuerung, 'praesenz', json);
  }

  // ---------- Antworten ----------

  function json(res, status, objekt, zusatz = {}) {
    const text = JSON.stringify(objekt);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...sicherheit, ...zusatz });
    res.end(text);
  }

  /** JSON-Objekt aus dem Anfragekörper lesen (mit Größenbegrenzung). */
  function koerperLesen(req) {
    return new Promise((fertig, fehler) => {
      const laenge = Number(req.headers['content-length']);
      if (laenge > MAX_KOERPER) return fehler(Object.assign(new Error('zu groß'), { status: 413 }));
      const teile = [];
      let groesse = 0;
      req.on('data', (teil) => {
        groesse += teil.length;
        if (groesse > MAX_KOERPER) {
          req.pause();
          fehler(Object.assign(new Error('zu groß'), { status: 413 }));
          return;
        }
        teile.push(teil);
      });
      req.on('end', () => {
        try {
          const objekt = JSON.parse(Buffer.concat(teile).toString('utf8'));
          if (objekt === null || typeof objekt !== 'object' || Array.isArray(objekt)) throw new Error('kein Objekt');
          fertig(objekt);
        } catch (e) {
          fehler(Object.assign(new Error('ungültiges JSON'), { status: 400 }));
        }
      });
      req.on('error', fehler);
    });
  }

  // ---------- Endpunkte ----------

  function ereignisse(req, res, schluessel, rolle) {
    if (!ROLLEN.includes(rolle)) return json(res, 400, { fehler: 'rolle' });
    if (verbindungen >= MAX_VERBINDUNGEN) return json(res, 503, { fehler: 'voll' });
    const raum = raumHolen(schluessel, true);
    if (!raum) return json(res, 503, { fehler: 'voll' });
    if (verbunden(raum) >= MAX_VERBINDUNGEN_PRO_RAUM) return json(res, 429, { fehler: 'zu-viele-geraete' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // nginx: nicht puffern
      ...sicherheit,
    });
    res.socket.setNoDelay(true);
    res.write('retry: 3000\n\n');

    verbindungen++;
    raum[rolle].add(res);
    raum.zuletzt = Date.now();
    const zustand = rolle === 'steuerung' && raum.zustand ? raum.zustand : 'null';
    res.write(`event: hallo\ndata: {"praesenz":${JSON.stringify(praesenz(raum))},"zustand":${zustand}}\n\n`);
    praesenzMelden(raum);

    res.on('close', () => {
      verbindungen--;
      raum[rolle].delete(res);
      raum.zuletzt = Date.now();
      praesenzMelden(raum);
    });
  }

  async function empfangen(req, res, schluessel, art) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(res, 415, { fehler: 'json' });
    let objekt;
    try {
      objekt = await koerperLesen(req);
    } catch (e) {
      if (e.status !== 413) return json(res, e.status || 400, { fehler: e.message });
      // Rest des zu großen Körpers nicht mehr lesen: antworten und Verbindung schließen.
      res.on('finish', () => req.destroy());
      return json(res, 413, { fehler: 'zu-gross' }, { Connection: 'close' });
    }
    const raum = raumHolen(schluessel, art === 'zustand');
    if (!raum) return json(res, art === 'zustand' ? 503 : 409, { fehler: art === 'zustand' ? 'voll' : 'offline' });
    if (!darfSenden(raum)) return json(res, 429, { fehler: 'langsamer' });
    raum.zuletzt = Date.now();
    // Neu serialisieren: garantiert einzeiliges JSON ohne Tricks im Ereignisstrom.
    const text = JSON.stringify(objekt);

    if (art === 'zustand') {
      raum.zustand = text;
      senden(raum.steuerung, 'zustand', text);
      res.writeHead(204, sicherheit);
      return res.end();
    }
    if (raum.anzeige.size === 0) return json(res, 409, { fehler: 'offline' });
    senden(raum.anzeige, 'befehl', text);
    return json(res, 202, { anzeigen: raum.anzeige.size });
  }

  function dateiAusliefern(req, res, pfadname) {
    if (pfadname === '/') pfadname = '/index.html';
    if (!STATISCH_ERLAUBT.test(pfadname)) return nichtGefunden(res);
    const datei = path.join(statisch, pfadname);
    if (!datei.startsWith(statisch + path.sep)) return nichtGefunden(res);
    fs.readFile(datei, (fehler, inhalt) => {
      if (fehler) return nichtGefunden(res);
      res.writeHead(200, {
        'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        ...sicherheit,
      });
      res.end(req.method === 'HEAD' ? undefined : inhalt);
    });
  }

  function nichtGefunden(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...sicherheit });
    res.end('Nicht gefunden\n');
  }

  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch (e) {
      return nichtGefunden(res);
    }
    const teile = url.pathname.split('/'); // ['', 'api', 'live', raum, aktion]

    if (url.pathname === '/api/live/healthz' || url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('ok\n');
    }

    if (teile[1] === 'api' && teile[2] === 'live' && teile.length === 5) {
      const [, , , schluessel, aktion] = teile;
      if (!RAUM_MUSTER.test(schluessel)) return json(res, 404, { fehler: 'raum' });
      if (req.method === 'GET' && aktion === 'ereignisse') return ereignisse(req, res, schluessel, url.searchParams.get('rolle'));
      if (req.method === 'POST' && (aktion === 'zustand' || aktion === 'befehl')) {
        empfangen(req, res, schluessel, aktion).catch((fehler) => {
          protokoll.error('Live-Server:', fehler);
          if (!res.headersSent) json(res, 500, { fehler: 'intern' });
        });
        return undefined;
      }
      return json(res, 405, { fehler: 'methode' });
    }

    if (statisch && (req.method === 'GET' || req.method === 'HEAD')) return dateiAusliefern(req, res, url.pathname);
    return nichtGefunden(res);
  });

  const pingTimer = setInterval(() => {
    for (const raum of raeume.values()) {
      for (const res of raum.anzeige) res.write(': ping\n\n');
      for (const res of raum.steuerung) res.write(': ping\n\n');
    }
  }, PING_MS);
  const aufraeumTimer = setInterval(() => aufraeumen(), 60 * 1000);
  pingTimer.unref();
  aufraeumTimer.unref();

  server.on('close', () => {
    clearInterval(pingTimer);
    clearInterval(aufraeumTimer);
  });

  /** Alle offenen Ereignis-Verbindungen beenden (vor server.close()). */
  server.alleTrennen = () => {
    for (const raum of raeume.values()) {
      for (const res of [...raum.anzeige, ...raum.steuerung]) res.end();
    }
  };
  server.raeume = raeume; // für Tests

  return server;
}

module.exports = { erstelleServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8000;
  const host = process.env.HOST || '0.0.0.0';
  const statisch = process.env.STATISCH === '0' ? null : path.resolve(__dirname, '..');
  const server = erstelleServer({ statisch });

  server.listen(port, host, () => {
    const benutzer = process.env.BENUTZER;
    if (benutzer && typeof process.getuid === 'function' && process.getuid() === 0) {
      process.setgid(benutzer);
      process.setuid(benutzer);
    }
    console.log(`Live-Server läuft auf http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${statisch ? ' (mit Seite)' : ''}`);
  });

  const beenden = () => {
    server.alleTrennen();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', beenden);
  process.on('SIGINT', beenden);
}
