# Statische Vorführung für Heim & Partner (Demo + Angebote), ausgeliefert mit nginx.
# Läuft auf Port 80. In Coolify: Build Pack "Dockerfile", Port 80.
FROM nginx:1.27-alpine

RUN apk add --no-cache apache2-utils

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-basic-auth.sh /docker-entrypoint.d/40-basic-auth.sh
RUN chmod +x /docker-entrypoint.d/40-basic-auth.sh && : > /etc/nginx/auth.conf
COPY site /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
