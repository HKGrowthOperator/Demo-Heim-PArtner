# Demo, Angebote und Online-Vertrag für Heim & Partner.
# Node-Server liefert site/ aus und nimmt Unterschriften entgegen: Vertrag und Anzahlungsrechnung
# als PDF (Chromium), Ablage unter /data, Versand per E-Mail (Resend).
# In Coolify: Build Pack "Dockerfile", Port 80, Persistent Storage nach /data.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    CHROMIUM_PATH=/usr/bin/chromium \
    DATA_DIR=/data \
    PORT=80

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY site ./site

VOLUME /data
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server.mjs"]
