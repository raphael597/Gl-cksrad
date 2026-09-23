# Glücksrad – statische Seite mit nginx ausliefern.
# In Coolify: Build Pack "Dockerfile", Port 3100 (siehe README, Abschnitt "Deployment mit Coolify").

FROM nginx:stable-alpine

# Eigene Server-Konfiguration statt der Standardseite
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Nur das, was der Browser braucht – keine Tests, kein README, kein package.json
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3100/healthz || exit 1
