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

## Appserver und PostgreSQL mit Docker Compose

Das Profil `app` startet den Appserver und PostgreSQL gemeinsam. Ergänze bei einer
bereits vorhandenen `.env` die Variable `DOCKER_DATABASE_URL` aus `.env.example`.
Sie verwendet den Compose-Dienstnamen `postgres` und den internen Port `5432`;
`DATABASE_URL` mit `localhost` ist für den Start auf dem Host vorgesehen.
Benutzer, Passwort und Datenbank müssen zu `POSTGRES_USER`, `POSTGRES_PASSWORD` und
`POSTGRES_DB` passen. Sonderzeichen in Benutzername und Passwort müssen in beiden
Verbindungs-URLs URL-kodiert sein.

```powershell
docker compose --profile app up -d --build --wait
docker compose --profile app ps -a
```

Der Dienst `migrate` wartet auf eine gesunde Datenbank und wendet die versionierten
Drizzle-Migrationen an. Erst nach seinem erfolgreichen Abschluss startet der Appserver.
`migrate` beendet sich dabei mit Status `0`; `app` und `postgres` laufen weiter.
Bei späteren Starts werden bereits angewendete Migrationen nicht erneut ausgeführt.

Der Appserver ist unter `http://localhost:3000` erreichbar; `PORT` ändert den Host-Port.
`POSTGRES_PORT` ändert den auf dem Host veröffentlichten Datenbankport. Im Compose-Netz
bleiben die Ports `3000` und `5432` bestehen. Ein bereits lokal laufender Appserver darf
nicht denselben Host-Port belegen.

Status, Logs und das Beenden des Stacks:

```powershell
docker compose --profile app logs app migrate
docker compose --profile app down
```

Die Datenbankdaten bleiben im benannten Volume erhalten. Die Healthchecks prüfen
PostgreSQL und den HTTP-Endpunkt `/health` des Appservers.
Das mehrstufige `Dockerfile` erstellt getrennte Images für Migration und Appserver.
Das App-Image enthält die übersetzte Anwendung und Produktionsabhängigkeiten und läuft
als Benutzer `node`. Die `.dockerignore` begrenzt den Build-Kontext auf die benötigten
Dateien; `.env` und lokale Zugangsdaten werden nicht ins Image kopiert.

Die OIDC-Variablen werden zur Laufzeit an den Appcontainer weitergegeben. Issuer und
JWKS müssen von dort aus über HTTPS erreichbar sein. Die unten beschriebene lokale
HTTP-Konfiguration mit `127.0.0.1` ist für den Appstart mit `pnpm dev` vorgesehen.
Mit leeren OIDC-Variablen funktionieren öffentliche Lesezugriffe; Schreibzugriffe sind
deaktiviert.

## Prüfungen und GitHub Actions

Die Abhängigkeiten mit dem versionierten Lockfile installieren:

```powershell
pnpm install --frozen-lockfile
```

Die TypeScript-Konfiguration übernimmt die strengen Prüfungen aus der Dozentenvorlage
(`@tsconfig/strictest` und `@tsconfig/node-ts`) als explizite Optionen. Dazu gehören
geprüfte Array-Zugriffe, genaue optionale Eigenschaften und das Erkennen unbenutzten Codes.
Die Node.js-24-Konfiguration unseres Projekts bleibt erhalten.

Diese Prüfungen benötigen keine laufenden Dienste:

| Befehl | Prüfung |
|---|---|
| `pnpm fmt:check` | Einheitliche Formatierung mit Oxfmt |
| `pnpm lint` | Statische Codeanalyse mit Oxlint |
| `pnpm typecheck` | TypeScript-Typprüfung einschließlich der Tests |
| `pnpm build` | Übersetzung des Appservers nach `dist` |
| `pnpm test` | REST-/GraphQL-Validierung, Tokenprüfung und Berechtigungsfehler mit Vitest |

Oxlint verwendet `oxlint.config.mts`. Aktiv sind die Kategorien `correctness` und
`suspicious` sowie die dort ergänzten Regeln, beispielsweise für geschweifte Klammern
und Typimporte. Oxfmt verwendet `oxfmt.config.mts`; Markdown-Dateien, bestehende
Migrationen, der Keycloak-Export und das Lockfile sind von der Formatierung ausgenommen.

Automatische Korrekturen und Formatierung ausführen:

```powershell
pnpm lint:fix
pnpm fmt
```

Anschließend die Änderungen mit `git diff` ansehen und `pnpm lint` sowie
`pnpm fmt:check` erneut ausführen.

`pnpm test:db` prüft Relationen, Eigentümerschaft sowie REST- und GraphQL-Zugriffe mit
PostgreSQL. Dafür `DATABASE_URL` in der aktuellen Shell auf eine separate Testdatenbank
setzen, zuerst `pnpm db:migrate` und danach `pnpm test:db` ausführen.
Die Tests legen eigene Datensätze an und löschen sie wieder. Ein laufender Appserver
oder Keycloak ist für diese Tests nicht erforderlich; die HTTP-Aufrufe laufen innerhalb
der Hono-App. Der tatsächliche Keycloak-Login wird wie unten beschrieben separat geprüft.

Der Workflow `.github/workflows/ci.yml` läuft bei Pushes und Pull Requests. Er verwendet
Node.js 24 und die in `package.json` festgelegte pnpm-Version, installiert mit
`--frozen-lockfile` und führt die fünf Prüfungen aus der Tabelle aus. Für Migrationen
und `pnpm test:db` stellt er eine eigene PostgreSQL-Instanz bereit. Schlägt eine Prüfung
fehl, schlägt der CI-Job fehl; auch Oxlint und die Oxfmt-Formatprüfung sind Pflichtschritte.

## Datenmodell

- `Veranstaltung`: Titel, Datum, Kategorie als Enum, Schlagwörter als JSON-Array, Preis und Veranstalter-ID aus dem OIDC-Token.
- `Ort`: pro Veranstaltung höchstens ein Ort; die eindeutige Veranstaltungs-ID sichert die 1:1-Beziehung.
- `Ticket`: beliebig viele Tickets pro Veranstaltung (1:n).

Veranstaltungsstarts werden als Zeitpunkte gespeichert. Bisherige Kalendertage werden als
Mitternacht UTC übernommen. Der Audit-Wert `aktualisiert` wird bei Drizzle-Updates automatisch gesetzt.

## REST-API

Lesezugriffe sind öffentlich. Schreibzugriffe benötigen `Authorization: Bearer <access-token>`.
Setze dazu `OIDC_ISSUER`, `OIDC_AUDIENCE` und `OIDC_JWKS_URL` gemeinsam.
Der Verifier erwartet ein Keycloak-Access-Token mit RS256, API-Audience und der Realm-Rolle
`veranstalter`. Die Veranstalter-ID stammt aus `sub`. In regulären Umgebungen verwenden
Issuer und JWKS HTTPS.
Ohne OIDC-Konfiguration sind Schreibzugriffe deaktiviert.

| Methode | URL | Erfolg |
|---|---|---|
| GET | `/veranstaltungen` | 200, Seite mit `content` und `page` |
| POST | `/veranstaltungen` | 201 mit Location |
| GET, PUT, DELETE | `/veranstaltungen/:id` | 200, 204, 204 |
| GET, PUT, DELETE | `/veranstaltungen/:id/ort` | 200, 201 beim Anlegen oder 204 beim Ersetzen, 204 |
| GET, POST | `/veranstaltungen/:id/tickets` | 200, 201 mit Location |
| GET, PUT, DELETE | `/veranstaltungen/:id/tickets/:ticketId` | 200, 204, 204 |

Die Veranstaltungssuche unterstützt wie die Dozentenvorlage `page` (erste Seite: 1)
und `size` (Standard 5, maximal 100). Fehlende oder ungültige Werte verwenden die
Standardwerte; ein Offset außerhalb des PostgreSQL-Integerbereichs führt zur ersten Seite.
Die Antwort enthält `content` und `page` mit `number` (ab 0), `size`, `totalElements`
und `totalPages`. Die Trefferzahl berücksichtigt alle Suchfilter, auch bei einer leeren Seite.
Veranstaltungen lassen sich nach `q` (Titel), `kategorie`, `ab` (Zeitpunkt) und
`schlagwort` filtern. Beispiel: `GET /veranstaltungen?kategorie=KONZERT&q=Jazz&page=1&size=10`.
Die bisherigen Parameter `limit` und `offset` werden für diese REST-Suche durch `size`
und `page` ersetzt. Ticketlisten verwenden weiterhin `limit` (Standard 20, maximal 100)
und `offset` (Standard 0) und liefern ein Array.

POST und PUT erwarten `Content-Type: application/json`. PUT ersetzt die bearbeitbaren Felder.
Erfolgreiche Schreibzugriffe liefern keinen Antwortkörper. Beim Anlegen verweist der
absolute `Location`-Header auf die neue Ressource. Deren Daten können anschließend mit
GET abgerufen werden. Aktualisierungen liefern 204; das erstmalige Anlegen eines Orts
per PUT liefert 201 mit `Location`.
Beim Anlegen, Lesen und Aktualisieren einer einzelnen Veranstaltung liefert REST deren `ETag`.
Für `PUT /veranstaltungen/:id` muss der Client den zuletzt gelesenen ETag als `If-Match`
mitsenden, zum Beispiel `If-Match: "0"`. Ein fehlender Header ergibt 428, ein ungültiger
Wert 400 und eine veraltete Version 412. Nach einem Konflikt die Veranstaltung erneut laden.

Bei `GET /veranstaltungen/:id` kann der Client den zuletzt erhaltenen ETag mit
`If-None-Match` mitsenden. Bei Übereinstimmung antwortet die API mit 304 ohne Body und
dem aktuellen ETag; bei einer Änderung mit 200 und den neuen Daten. Auch schwache Tags
wie `W/"0"`, eine Liste von ETags und `*` für eine vorhandene Veranstaltung werden
berücksichtigt, entsprechend [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2).

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

Die GET-Antwort einer Veranstaltung ergänzt beispielsweise `"id":1`, `"version":0`, `"veranstalterId":"user-42"`,
`"erstellt":"2027-01-02T10:00:00.000Z"` und `"aktualisiert":"2027-01-02T10:00:00.000Z"`.
Zeitpunkte werden in UTC ausgegeben. Preise bleiben Dezimalstrings.

REST-Fehler verwenden `Content-Type: application/problem+json` nach
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html). Beispiel:

```json
{"type":"about:blank","title":"Not Found","status":404,"detail":"Ressource nicht gefunden."}
```

`status` entspricht dem HTTP-Statuscode, `title` beschreibt die Fehlerart und
`detail` den konkreten Fehler. Fachlich ungültige JSON-Inhalte liefern 422 und
enthalten Feldfehler zusätzlich unter `errors`:

```json
{"type":"about:blank","title":"Unprocessable Content","status":422,"detail":"Ungültige Eingaben.","errors":[{"feld":"preis","nachricht":"Dezimalstring mit bis zu zwei Nachkommastellen erwartet."}]}
```

Fehlerhaftes JSON sowie ungültige Pfad- und Query-Parameter liefern 400, fehlende oder
ungültige Tokens 401, eine fehlende Veranstalterrolle 403 und fehlende oder fremde
Ressourcen bei Schreibzugriffen 404. Zu große Bodies liefern 413, ein falscher
Content-Type 415, fehlendes `If-Match` 428 und veraltete Versionen 412.
Interne Fehler liefern 500 mit einer allgemeinen Meldung. DELETE liefert bei Erfolg
keinen Body. GraphQL verwendet das unter GraphQL beschriebene `errors`-Format.

## GraphQL

`POST /graphql` bietet öffentliche Leseabfragen über GraphQL Yoga. Beispiel für den JSON-Body:

```json
{"query":"{ veranstaltungen(input: { kategorie: KONZERT, limit: 10 }) { id titel datum preis ort { name stadt } tickets(limit: 5) { id bezeichnung preis } } }"}
```

Eine einzelne Veranstaltung wird mit `veranstaltung(id: "1")` abgefragt. Die Suchfilter
entsprechen REST; GraphQL liefert weiterhin Listen und verwendet `limit` (Standard 20,
maximal 100) und `offset` (Standard 0) als Zahlen. Preise werden als
Dezimalstrings und Zeitpunkte in UTC ausgegeben. Ein fehlender Ort ergibt `null`.

Die Mutationen `create(input: VeranstaltungInput!)`,
`update(id: ID!, version: Int!, input: VeranstaltungInput!)`
und `delete(id: ID!)` benötigen denselben Bearer-Token und dieselbe Veranstalterrolle wie REST.
`create` und `update` liefern die Veranstaltung zurück; `delete` liefert `{ success: true }`.
`update` ersetzt die bearbeitbaren Felder vollständig. Die erwartete `version` kann in der
Veranstaltungsabfrage mit ausgewählt werden. Eine veraltete Version ergibt `CONFLICT`.
Beispiel für den JSON-Body:

```json
{"query":"mutation($input: VeranstaltungInput!) { create(input: $input) { id titel } }","variables":{"input":{"titel":"Jazzabend","datum":"2027-02-01T19:00:00+01:00","kategorie":"KONZERT","preis":"12.50"}}}
```

Die Veranstalter-ID stammt aus dem Token. Änderungen und Löschungen sind auf eigene
Veranstaltungen beschränkt. Fehler werden im GraphQL-Feld `errors` zurückgegeben:
`UNAUTHENTICATED` bei fehlendem oder ungültigem Token, `FORBIDDEN` bei fehlender Rolle,
`SERVICE_UNAVAILABLE` ohne OIDC-Konfiguration und `BAD_USER_INPUT` bei ungültigen Eingaben
oder fehlenden beziehungsweise fremden Veranstaltungen.

Das vollständige GraphQL-Schema steht in
[`src/veranstaltung/graphql/schema.ts`](src/veranstaltung/graphql/schema.ts).
Orte und Tickets können ebenfalls mit Veranstalterrolle bearbeitet werden:

| Mutation | Verhalten |
|---|---|
| `updateOrt(veranstaltungId: ID!, input: OrtInput!)` | Ort anlegen oder vollständig ersetzen; liefert den Ort |
| `deleteOrt(veranstaltungId: ID!)` | Ort löschen; liefert `{ success: true }` |
| `createTicket(veranstaltungId: ID!, input: TicketInput!)` | Ticket anlegen; liefert das Ticket |
| `updateTicket(veranstaltungId: ID!, id: ID!, input: TicketInput!)` | Ticket vollständig ersetzen; liefert das Ticket |
| `deleteTicket(veranstaltungId: ID!, id: ID!)` | Ticket löschen; liefert `{ success: true }` |

`veranstaltungId` bezeichnet jeweils die eigene Veranstaltung, `id` bei Tickets die Ticket-ID.
Die Eingabefelder entsprechen den REST-Beispielen. Beispielkörper für einen Ort und ein Ticket:

```json
{"query":"mutation($input: OrtInput!) { updateOrt(veranstaltungId: \"1\", input: $input) { id name } }","variables":{"input":{"name":"Stadthalle","strasse":"Markt 1","plz":"12345","stadt":"Beispielstadt"}}}
```

```json
{"query":"mutation($input: TicketInput!) { createTicket(veranstaltungId: \"1\", input: $input) { id bezeichnung aktiv } }","variables":{"input":{"bezeichnung":"Standard","preis":"12.50","kontingent":25}}}
```

Ein einzelnes Ticket lässt sich innerhalb seiner Veranstaltung abfragen:
`{ veranstaltung(id: "1") { ticket(id: "2") { id bezeichnung preis } } }`.
Eine falsche Zuordnung von Ticket und Veranstaltung wird wie eine fehlende Ressource behandelt.

## Lokal mit Keycloak anmelden

Trage eigene lokale Zugangsdaten für `KC_BOOTSTRAP_ADMIN_USERNAME` und
`KC_BOOTSTRAP_ADMIN_PASSWORD` in deine ignorierte `.env` ein. Ergänze außerdem:

```dotenv
OIDC_ISSUER=http://127.0.0.1:8080/realms/veranstaltung
OIDC_AUDIENCE=veranstaltungs-api
OIDC_JWKS_URL=http://127.0.0.1:8080/realms/veranstaltung/protocol/openid-connect/certs
OIDC_ALLOW_LOOPBACK_HTTP=true
```

```powershell
docker compose --profile oidc up -d postgres keycloak
pnpm db:migrate
pnpm dev
```

Warte, bis die Keycloak-Konsole unter `http://127.0.0.1:8080/admin/` erreichbar ist.
Melde dich als lokaler Admin an, wähle den Realm **veranstaltung** und lege zwei
Testnutzer an. Setze unter **Credentials** je ein lokales Passwort und weise
beiden unter **Role mapping** die Realm-Rolle **veranstalter** zu.
Für den 403-Fall kannst du einen weiteren Nutzer ohne diese Rolle anlegen.
Keycloak speichert den Realm und die Nutzer im eigenen Volume. Beim Neustart
wird ein vorhandener Realm nicht erneut importiert.

Der Client benötigt die Standard-Client-Scopes `basic` und `roles`. `basic` liefert
die Nutzerkennung `sub`, aus der die API den Veranstalter bestimmt; `roles` liefert
die Realm-Rollen. Siehe auch die [Keycloak-Upgradehinweise zum `basic`-Scope](https://www.keycloak.org/docs/26.7.4/upgrading/).
Bei einem bereits importierten Realm: Unter **Clients → veranstaltungs-cli → Client scopes**
den Scope **basic** mit Typ **Default** hinzufügen, falls er fehlt. Anschließend neu anmelden,
damit ein neues Token ausgestellt wird. Bestehende Daten und Nutzer müssen dafür nicht gelöscht werden.

In einer zweiten PowerShell kannst du über den OAuth-2-Gerätefluss ein Access-Token holen.
Der Client `veranstaltungs-cli` ist öffentlich und benötigt kein Client-Secret.

```powershell
$oidc = 'http://127.0.0.1:8080/realms/veranstaltung/protocol/openid-connect'
$device = Invoke-RestMethod -Method Post -Uri "$oidc/auth/device" -Body @{
  client_id = 'veranstaltungs-cli'
}
Start-Process $device.verification_uri_complete
```

Melde dich im Browser als Testnutzer an und bestätige den angezeigten Code.
Warte bei `authorization_pending` mindestens `$device.interval` Sekunden vor dem nächsten Versuch.

```powershell
$token = Invoke-RestMethod -Method Post -Uri "$oidc/token" -Body @{
  grant_type = 'urn:ietf:params:oauth:grant-type:device_code'
  client_id = 'veranstaltungs-cli'
  device_code = $device.device_code
}
$headers = @{ Authorization = "Bearer $($token.access_token)" }
$created = Invoke-WebRequest -Method Post -Uri 'http://localhost:3000/veranstaltungen' `
  -Headers $headers -ContentType 'application/json' `
  -Body '{"titel":"Keycloak-Test","datum":"2027-02-01T19:00:00+01:00","kategorie":"KONZERT","preis":"12.50"}'
$event = Invoke-RestMethod -Uri ([string]$created.Headers.Location)
```

Wiederhole den Gerätefluss als zweiter Veranstalter, bei Bedarf in einem privaten
Browserfenster. Ein `DELETE /veranstaltungen/$($event.id)` mit dessen Token muss
`404` liefern. Mit dem ursprünglichen Token liefert derselbe Aufruf `204`.
Ohne Token liefert er `401`.

Der lokale HTTP-Modus ist auf den explizit erlaubten Issuer und JWKS gleicher
Herkunft unter `127.0.0.1` beschränkt. Für GraphQL gilt
dieselbe Regel: Lesen ist öffentlich, Mutationen erfordern Veranstalterrolle
und bei bestehenden Ressourcen die Eigentümerschaft.

Am 27.11.2026 wurde zusätzlich ein isolierter Live-Test mit Keycloak 26.8.2,
frischer PostgreSQL-Datenbank und einem laufenden HTTP-Appserver durchgeführt.
Drei temporäre Nutzer meldeten sich über den Gerätefluss an; die API prüfte die
von Keycloak ausgestellten Tokens über dessen JWKS-Endpunkt. Geprüft wurden:

| Fall | REST | GraphQL |
|---|---|---|
| Kein oder ungültiges Token | 401 | `UNAUTHENTICATED` |
| Nutzer ohne Veranstalterrolle | 403 | `FORBIDDEN` |
| Veranstalter beim Anlegen | Nutzerkennung aus dem Token | Nutzerkennung aus dem Token |
| Fremde Veranstaltung ändern oder löschen | 404 | `BAD_USER_INPUT` |
| Eigene Veranstaltung anlegen, ändern und löschen | 201 / 204 / 204 | erfolgreiche Mutationen |

Dieser separate Live-Test ergänzt `pnpm test` und `pnpm test:db`; deren Aufrufe
starten keinen Keycloak und führen keine echte Anmeldung aus.
