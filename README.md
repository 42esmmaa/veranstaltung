# Veranstaltungs-API

Hono-Appserver mit TypeScript. Die API wird schrittweise gemäß den Issues im GitHub-Projektplan aufgebaut.

## Voraussetzungen

- Node.js `^26.13.0`
- pnpm `12.19.0` (im Projekt festgelegt)

## Lokal starten

```powershell
pnpm install
Copy-Item .env.example .env
pnpm dev
```

Der Watch-Modus startet den Server nach Änderungen neu. Für den Start ohne Watch-Modus:

```powershell
pnpm start
```

`PORT` wird aus `.env` gelesen und ist standardmäßig `3000`. Die Datei `.env` enthält nur lokale Einstellungen und wird nicht eingecheckt.

## Erste Endpunkte

- `GET /` gibt eine kurze Statusmeldung zurück.
- `GET /health` gibt `{"status":"ok"}` zurück.

Die Datenbankintegration und das Veranstaltungsmodell mit Prisma/PostgreSQL sind im separaten Issue #3 geplant. Zod, Keycloak, GraphQL, Tests, Codeanalyse und weitere Abgabeanforderungen haben eigene Issues.
