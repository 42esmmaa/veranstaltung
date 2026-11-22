# Veranstaltungs-API

Hono-Appserver mit TypeScript, Drizzle ORM und PostgreSQL. Der fachliche Aufbau ist im GitHub-Projektplan in einzelne Issues gegliedert.

## Voraussetzungen

- Node.js `^24.0.0`
- pnpm `12.19.0`
- Docker Desktop für die lokale PostgreSQL-Datenbank

## Lokal starten

```powershell
pnpm install
Copy-Item .env.example .env
```

Die Beispiel-Zugangsdaten in `.env.example` sind ausschließlich für lokale Entwicklung vorgesehen. `.env` wird nicht eingecheckt.
Unter Bash lautet der Kopierbefehl `cp .env.example .env`. PostgreSQL ist am Host nur über Loopback erreichbar.

PostgreSQL starten und Schema-Migrationen anwenden:

```powershell
docker compose up -d --wait postgres
pnpm db:migrate
```

Appserver im Watch-Modus starten:

```powershell
pnpm dev
```

`PORT` ist standardmäßig `3000`. Für den Start ohne Watch-Modus zuerst `pnpm build` und danach `pnpm start` ausführen.

`pnpm db:generate` wird bei Änderungen am Drizzle-Schema verwendet. Die erzeugte SQL-Migration vor dem Anwenden prüfen.
`pnpm test` prüft die HTTP-Routen und Access-Tokens. Für `pnpm test:db` zuerst
`DATABASE_URL` auf eine separate Testdatenbank setzen und `pnpm db:migrate` ausführen.

## Datenmodell

- `Veranstaltung`: Titel, Datum, Kategorie als Enum, Schlagwörter als JSON-Array, Preis und Veranstalter-ID aus dem OIDC-Token.
- `Ort`: pro Veranstaltung höchstens ein Ort; die eindeutige Veranstaltungs-ID sichert die 1:1-Beziehung.
- `Ticket`: beliebig viele Tickets pro Veranstaltung (1:n).

Veranstaltungsstarts werden als Zeitpunkte gespeichert. Bisherige Kalendertage werden als
Mitternacht UTC übernommen. Der Audit-Wert `aktualisiert` wird bei Drizzle-Updates automatisch gesetzt.

## REST-API

Lesezugriffe sind öffentlich. Schreibzugriffe benötigen `Authorization: Bearer <access-token>`.
Setze dazu `OIDC_ISSUER`, `OIDC_AUDIENCE` und `OIDC_JWKS_URL` gemeinsam.
Der Verifier erwartet RS256 und einen HTTPS-JWKS-Endpunkt. Die Veranstalter-ID stammt aus `sub`.
Ohne OIDC-Konfiguration sind Schreibzugriffe deaktiviert.

| Methode | URL | Erfolg |
|---|---|---|
| GET | `/veranstaltungen` | 200, Liste |
| POST | `/veranstaltungen` | 201, Veranstaltung und Location |
| GET, PUT, DELETE | `/veranstaltungen/:id` | 200, 200, 204 |
| GET, PUT, DELETE | `/veranstaltungen/:id/ort` | 200, 201 beim Anlegen oder 200 beim Ersetzen, 204 |
| GET, POST | `/veranstaltungen/:id/tickets` | 200, 201 mit Location |
| GET, PUT, DELETE | `/veranstaltungen/:id/tickets/:ticketId` | 200, 200, 204 |

Listen unterstützen `limit` (Standard 20, maximal 100) und `offset` (Standard 0).
Veranstaltungen lassen sich zusätzlich nach `q` (Titel), `kategorie`, `ab` (Zeitpunkt) und
`schlagwort` filtern. Beispiel: `GET /veranstaltungen?kategorie=KONZERT&q=Jazz&limit=10`.

POST und PUT erwarten `Content-Type: application/json`. PUT ersetzt die bearbeitbaren Felder.
Beispielkörper für eine Veranstaltung, einen Ort und ein Ticket:

```json
{"titel":"Jazzabend","datum":"2027-02-01T19:00:00+01:00","kategorie":"KONZERT","preis":"12.50","schlagwoerter":["jazz"]}
```

```json
{"name":"Stadthalle","strasse":"Markt 1","plz":"12345","stadt":"Beispielstadt"}
```

```json
{"bezeichnung":"Standard","preis":"12.50","kontingent":25,"aktiv":true}
```

Die Veranstaltungsantwort ergänzt beispielsweise `"id":1`, `"veranstalterId":"user-42"`,
`"erstellt":"2027-01-02T10:00:00.000Z"` und `"aktualisiert":"2027-01-02T10:00:00.000Z"`.
Zeitpunkte werden in UTC ausgegeben. Preise bleiben Dezimalstrings.

Fehler liefern JSON wie `{"error":"Ressource nicht gefunden."}`.
Validierungsfehler enthalten pro Feld einen Eintrag in `details`, zum Beispiel
`{"error":"Ungültige Eingaben.","details":[{"feld":"preis","nachricht":"Dezimalstring mit bis zu zwei Nachkommastellen erwartet."}]}`.
Ungültige Eingaben liefern 400, fehlende oder ungültige Tokens 401 und fehlende oder
fremde Ressourcen bei Schreibzugriffen 404. Zu große Bodies liefern 413 und ein
falscher Content-Type liefert 415. DELETE liefert bei Erfolg keinen Body.
