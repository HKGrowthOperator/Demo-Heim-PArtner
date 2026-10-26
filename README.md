# Demo Heim & Partner

Klickbare Plattform-Demo und drei Angebote (Start, Komplett, Premium) für Heim & Partner.
Statische Seiten, ausgeliefert mit nginx. Alle Namen, Firmen und Zahlen in der Demo sind Beispieldaten.

| Pfad | Inhalt |
|---|---|
| `/` | Plattform-Demo (Demo-Führung oben rechts) |
| `/angebot/` | Auswahl der drei Angebote |
| `/angebot/start/`, `/angebot/komplett/`, `/angebot/premium/` | die Angebote |
| `/website/` | Entwurf der neuen Website heimundpartner.com |

Die KI-Funktionen laufen hier im Demo-Modus mit festen Beispielergebnissen.
Die Live-KI gibt es nur in der Fassung bei claude.ai.

## Deployment mit Coolify

1. Neue Anwendung aus diesem Repo, Build Pack **Dockerfile**, Port **80**, Branch nach Wunsch.
2. Domain eintragen, Coolify holt das Zertifikat.
3. Die Seiten enthalten Preise. Für Passwortschutz in Coolify unter *Environment Variables* setzen:
   - `BASIC_AUTH_USER`
   - `BASIC_AUTH_PASSWORD`

   Ohne diese beiden Variablen ist alles offen erreichbar (aber `noindex`, auch `robots.txt` sperrt Suchmaschinen).
4. Health Check: `/healthz`.

Lokal prüfen:

```bash
docker build -t demo-heim-partner .
docker run --rm -p 8080:80 -e BASIC_AUTH_USER=hp -e BASIC_AUTH_PASSWORD=geheim demo-heim-partner
```

## Aufbau

- `site/` die auszuliefernden Dateien (Demo und Angebote sind je eine in sich geschlossene HTML-Datei)
- `source/app.src.html` Quelltext der Demo, bevor die Icons eingebettet werden. Der Platzhalter
  `/*ICONS_JSON*/{}` wird beim Bauen durch die benötigten Phosphor-Icons (`@phosphor-icons/core` 2.1.1) ersetzt.
- `nginx.conf`, `Dockerfile`, `docker-entrypoint.d/` Auslieferung und optionaler Passwortschutz

Nicht in diesem Repo: der interne Spielplan mit Kalkulation und Verhandlungsgrenzen.
