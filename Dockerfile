# Glücksrad – Seite mit nginx ausliefern, dazu der kleine Live-Server für die Handy-Fernbedienung.
# In Coolify: Build Pack "Dockerfile", Port 3100 (siehe README, Abschnitt "Deployment mit Coolify").

FROM nginx:stable-alpine

# Node.js für den Live-Server (server/live.js, ohne weitere Pakete)
RUN apk add --no-cache nodejs

# Eigene Server-Konfiguration statt der Standardseite
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Live-Server: startet vor nginx im Hintergrund und lauscht nur auf 127.0.0.1:3101
COPY server/live.js /opt/gluecksrad/server/live.js
COPY deploy/live-server.sh /docker-entrypoint.d/90-live-server.sh
RUN chmod 755 /docker-entrypoint.d/90-live-server.sh

# Nur das, was der Browser braucht – keine Tests, kein README, kein package.json
COPY index.html impressum.html datenschutz.html fernbedienung.html manifest.webmanifest sw.js /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY icons/ /usr/share/nginx/html/icons/

# Cloudflare kann JavaScript mehrere Stunden im Browser cachen. Jede Änderung
# an den Assets bekommt deshalb beim Build eine neue URL im HTML.
RUN set -eu; \
    version="$(sha256sum /usr/share/nginx/html/js/*.js /usr/share/nginx/html/css/*.css /usr/share/nginx/html/sw.js | sha256sum | cut -c 1-12)"; \
    sed -i "s/__ASSET_VERSION__/$version/g" /usr/share/nginx/html/index.html /usr/share/nginx/html/fernbedienung.html

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3100/healthz && wget -q -O /dev/null http://127.0.0.1:3100/api/live/healthz || exit 1
