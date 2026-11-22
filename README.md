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
Der Verifier erwartet ein Keycloak-Access-Token mit RS256, API-Audience und der Realm-Rolle
`veranstalter`. Die Veranstalter-ID stammt aus `sub`. In regulären Umgebungen verwenden
Issuer und JWKS HTTPS.
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
Ungültige Eingaben liefern 400, fehlende oder ungültige Tokens 401, eine fehlende
Veranstalterrolle 403 und fehlende oder
fremde Ressourcen bei Schreibzugriffen 404. Zu große Bodies liefern 413 und ein
falscher Content-Type liefert 415. DELETE liefert bei Erfolg keinen Body.

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
$event = Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/veranstaltungen' `
  -Headers $headers -ContentType 'application/json' `
  -Body '{"titel":"Keycloak-Test","datum":"2027-02-01T19:00:00+01:00","kategorie":"KONZERT","preis":"12.50"}'
```

Wiederhole den Gerätefluss als zweiter Veranstalter, bei Bedarf in einem privaten
Browserfenster. Ein `DELETE /veranstaltungen/$($event.id)` mit dessen Token muss
`404` liefern. Mit dem ursprünglichen Token liefert derselbe Aufruf `204`.
Ohne Token liefert er `401`.

Der lokale HTTP-Modus ist auf den explizit erlaubten Issuer und JWKS gleicher
Herkunft unter `127.0.0.1` beschränkt. Für GraphQL gilt bei der späteren Umsetzung
dieselbe Regel: Lesen ist öffentlich, Mutationen erfordern Veranstalterrolle
und bei bestehenden Ressourcen die Eigentümerschaft.
