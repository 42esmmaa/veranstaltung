# Veranstaltungs-API

Hono-Appserver mit TypeScript, Drizzle ORM und PostgreSQL. Der fachliche Aufbau ist im GitHub-Projektplan in einzelne Issues gegliedert.

## Voraussetzungen

- Node.js `^26.13.0`
- pnpm `12.19.0`
- Docker Desktop für die lokale PostgreSQL-Datenbank

## Lokal starten

```powershell
pnpm install
Copy-Item .env.example .env
```

Die Beispiel-Zugangsdaten in `.env.example` sind ausschließlich für lokale Entwicklung vorgesehen. `.env` wird nicht eingecheckt.

PostgreSQL starten und Schema-Migrationen anwenden:

```powershell
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
```

Appserver im Watch-Modus starten:

```powershell
pnpm dev
```

`PORT` ist standardmäßig `3000`. Mit `pnpm start` wird der Server ohne Watch-Modus gestartet.

## Datenmodell

- `Veranstaltung`: Titel, Datum, Kategorie als Enum, Schlagwörter als JSON-Array, Preis und Veranstalter-ID aus dem OIDC-Token.
- `Ort`: pro Veranstaltung höchstens ein Ort; die eindeutige Veranstaltungs-ID sichert die 1:1-Beziehung.
- `Ticket`: beliebig viele Tickets pro Veranstaltung (1:n).

Der Server stellt `GET /` und `GET /health` bereit. Die REST- und GraphQL-Routen sowie die Eigentümerprüfung folgen in den zugehörigen Issues.
