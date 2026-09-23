#!/bin/sh
# Startet den Live-Server für die Handy-Fernbedienung (server/live.js) im Hintergrund.
# Das nginx-Image führt Skripte aus /docker-entrypoint.d/ vor dem Start von nginx aus;
# nginx leitet danach /api/live/ an 127.0.0.1:3101 weiter (siehe deploy/nginx.conf).
# Stürzt der Server ab, wird er nach zwei Sekunden neu gestartet.
set -eu

(
  while true; do
    PORT=3101 HOST=127.0.0.1 STATISCH=0 BENUTZER=nginx node /opt/gluecksrad/server/live.js || true
    echo "Live-Server beendet – Neustart in 2 s" >&2
    sleep 2
  done
) &
