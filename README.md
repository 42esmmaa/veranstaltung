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

Der Server stellt `GET /` und `GET /health` bereit. REST- und GraphQL-Mutationen sind noch nicht registriert.
Künftige Mutationen verwenden denselben Access-Token-Verifier und dieselben Eigentümerbedingungen.
Der Verifier ist für einen konfigurierten Issuer vorgesehen. Die Veranstalter-ID stammt aus dessen `sub`-Claim.
Bei Updates und Deletes begrenzt die Anwendung die Mutation selbst mit `ownerScope`.
Neue Veranstaltungen übernehmen den verifizierten Subject. Neue Orte und Tickets werden mit
einem `INSERT ... SELECT` aus den auf den Eigentümer begrenzten Veranstaltungen angelegt.

Veranstaltungsstarts werden als Zeitpunkte gespeichert. Bisherige Kalendertage werden als
Mitternacht UTC übernommen. Der Audit-Wert `aktualisiert` wird bei Drizzle-Updates automatisch gesetzt.
