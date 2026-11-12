# Demo Heim & Partner

Klickbare Plattform-Demo, die Angebote und der Online-Vertrag für Heim & Partner.
Ein kleiner Node-Server liefert die Seiten aus und nimmt Unterschriften für den Vertrag entgegen.
Alle Namen, Firmen und Zahlen in der Demo sind Beispieldaten.

| Pfad | Inhalt |
|---|---|
| `/` | Plattform-Demo (Demo-Führung oben rechts) |
| `/angebot/` | Aktuelles Angebot 79.900 € mit Add-ons und Knopf zum Vertrag (gleich `/angebot/gesamt-premium/`) |
| `/angebot/alle/` | Übersicht aller Angebote |
| `/vertrag` | Kurzlink, leitet auf `/angebot/vertrag/` weiter |
| `/angebot/vertrag/` | Vertrag zum Gesamtpaket Premium: Add-ons wählen, Vertrag lesen, online unterschreiben. Zahlung 50 % bei Auftragserteilung, 50 % nach Gesamtabnahme |
| `/vertrag-raten` | Notfall, nicht verlinkt: derselbe Vertrag mit 50 % bei Auftragserteilung und dem Rest in 3 oder 4 Monatsraten (leitet auf `/angebot/vertrag-raten/` weiter) |
| `/angebot/start/`, `/angebot/komplett/`, `/angebot/premium/`, `/angebot/gesamt/`, `/angebot/website/` | weitere Angebote |
| `/website/` | Entwurf der neuen Website heimundpartner.com |

## Online-Vertrag

1. Unter `/angebot/vertrag/` wählt Heim & Partner die Add-ons, liest den Vertrag (auch als PDF-Vorschau) und unterschreibt mit Maus, Finger oder Stift.
2. Der Server rechnet alle Preise selbst aus `server/vorlage/katalog.json` nach, erstellt
   - den **unterschriebenen Vertrag** als PDF mit Anlage 8 (gewählte Add-ons, Gesamtsumme, Zahlungsplan) und Prüfprotokoll (Zeitpunkt, IP, Browser, SHA-256),
   - die **Rechnung** mit fortlaufender Nummer `HKG-RE-<Jahr>-0001`: beim Standardvertrag die Anzahlungsrechnung über 50 % der Nettosumme zzgl. 19 % USt.,
     beim Ratenvertrag eine Rechnung über die ganze Summe mit Zahlungsplan (Anzahlung in 14 Tagen, Raten jeweils 1 bis 4 Monate nach Unterschrift),
3. legt beides unter `/data/vertraege/<Vertragsnummer>/` ab,
4. schickt beides per E-Mail an die unterzeichnende Person (und eine optionale Rechnungsadresse) und
5. schickt eine eigene interne Mail an `MAIL_COPY_TO` mit beiden PDFs und dem Link für die Schlussrechnung. Dieser Link geht nie an den Kunden.

## Schlussrechnung nach der Gesamtabnahme

Der Link aus der internen Mail (`/api/vertrag/schluss/<Vertragsnummer>?t=<Token>`) öffnet eine Seite mit Vertragssumme, bereits berechnetem Betrag und Zahlbetrag.
Dort das Datum der Gesamtabnahme wählen und auf „Schlussrechnung erstellen und senden“ klicken. Der Server erstellt die Schlussrechnung
mit der Gesamtsumme, zieht die erste Rechnung mit ihrer Umsatzsteuer ab (§ 14 Abs. 5 UStG) und schickt sie an den Kunden, in Kopie an `MAIL_COPY_TO`.
Beim Ratenvertrag ist der Zahlbetrag 0 €, die offenen Raten bleiben nach Plan fällig. Ein zweiter Klick erzeugt keine zweite Rechnung.

Ist der E-Mail-Versand nicht eingerichtet oder schlägt fehl, landet die Mail mit allen Angaben in `/data/outbox/`.
Die Seite bietet die PDFs dann sofort zum Herunterladen an und sagt, dass die Unterlagen manuell nachkommen.
Fehlen Steuer- oder Bankdaten, wird keine Rechnung erstellt: Der Vertrag geht trotzdem raus, die interne Mail an `MAIL_COPY_TO` nennt die fehlenden Angaben.

Der Vertrag verlangt Textform (§ 126b BGB). Die Unterschrift ist eine einfache elektronische Signatur.
Unterschreiben geht nur bis zum Ende der Angebotsfrist (27.11.2026, änderbar mit `OFFER_VALID_UNTIL`).

## Deployment mit Coolify

1. Anwendung aus diesem Repo, Build Pack **Dockerfile**, Port **80**.
2. **Persistent Storage**: ein Volume nach `/data` mounten. Ohne Volume gehen unterschriebene Verträge
   und der Rechnungszähler bei jedem Deploy verloren.
3. **Environment Variables**:

| Variable | Pflicht | Inhalt |
|---|---|---|
| `RESEND_API_KEY` | für E-Mail | API-Schlüssel von Resend (wie im Sales-Cockpit) |
| `EMAIL_FROM` | für E-Mail | Absender auf der bei Resend freigegebenen Domain, z. B. `HK Growth <vertrag@hk-growthoperator.de>` |
| `MAIL_COPY_TO` | nein | Empfänger der internen Mail mit dem Schlussrechnungs-Link und Kopie der Schlussrechnung, Standard `info@hk-growthoperator.de`, mehrere mit Komma |
| `HK_USTID` oder `HK_STEUERNR` | für Rechnung | USt-IdNr. oder Steuernummer der HK Growth UG |
| `HK_IBAN`, `HK_BANK` | für Rechnung | Bankverbindung für die Rechnung |
| `HK_BIC` | nein | BIC |
| `PUBLIC_BASE_URL` | empfohlen | Öffentliche Adresse, z. B. `https://demo.example.de`, für die Download-Links |
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` | empfohlen | Passwortschutz für alle Seiten (die Seiten enthalten Preise) |
| `DOWNLOAD_SECRET` | nein | Schlüssel für Download-Links, sonst wird einer in `/data` erzeugt |
| `INVOICE_PREFIX`, `INVOICE_START` | nein | Rechnungsnummern, Standard `HKG-RE-` und 1 |
| `OFFER_VALID_UNTIL` | nein | Ende der Angebotsfrist als `JJJJ-MM-TT` |

4. Health Check: `/healthz` (ohne Passwort).
5. Beim Start schreibt der Server ins Log, ob Passwortschutz, E-Mail und Rechnung aktiv sind.

Lokal prüfen:

```bash
docker build -t demo-heim-partner .
docker run --rm -p 8080:80 -v "$PWD/data:/data" -e BASIC_AUTH_USER=hp -e BASIC_AUTH_PASSWORD=geheim demo-heim-partner
```

## Aufbau

- `site/` die auszuliefernden Seiten (Demo und Angebote sind je eine in sich geschlossene HTML-Datei)
- `server/` Node-Server ohne Framework: `server.mjs` (Auslieferung, Passwortschutz, API), `preis.mjs` (Preise), `zahlung.mjs` (Zahlungsplan 50/50 oder Raten),
  `dokumente.mjs` (Vertrag, Rechnungen, E-Mails), `pdf.mjs` (Chromium), `mail.mjs` (Resend), `speicher.mjs` (Ablage)
- `server/vorlage/` Vertragsvorlage mit Platzhaltern und Preiskatalog, aus dem Vertrag und dem Angebot erzeugt
- `server/fonts/` Schrift Geist für die PDFs (SIL Open Font License)
- `source/app.src.html` Quelltext der Demo, bevor die Icons eingebettet werden

API: `GET /api/vertrag/katalog`, `GET /api/vertrag/text`, `POST /api/vertrag/vorschau`, `POST /api/vertrag/unterschreiben`,
`GET /api/vertrag/dokument/<Vertragsnummer>/<vertrag.pdf|rechnung.pdf|schlussrechnung.pdf>?t=<Token>`, `GET|POST /api/vertrag/schluss/<Vertragsnummer>?t=<Token>`.
`text`, `vorschau` und `unterschreiben` nehmen `variante=raten` und `raten=3|4` für den Ratenvertrag.

Nicht in diesem Repo: der interne Spielplan mit Kalkulation und Verhandlungsgrenzen.
