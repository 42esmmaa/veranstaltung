# Veranstaltungs-API

Kleine Hono-API für Veranstaltungen mit PostgreSQL und Drizzle ORM.

## Datenmodell (erster Schritt)

- `Veranstaltung`: Titel, Datum, Kategorie, Schlagwörter, Preis und Veranstalter-ID.
- `Ort`: pro Veranstaltung genau ein Ort (eindeutige `veranstaltung_id`).
- `Ticket`: mehrere Ticketarten pro Veranstaltung.
- `veranstalter_id` speichert die `sub`-Kennung aus dem Login-Token. So kann die API bei Änderungen die Veranstaltung dem eingeloggten User zuordnen.

Die Kategorien sind zunächst `KONZERT`, `SPORT`, `THEATER`, `WORKSHOP` und `SONSTIGES`.

## Start

```powershell
pnpm install
pnpm dev
```

Der erste Server stellt `GET /` und `GET /health` bereit. Datenbankverbindung und Migrationen kommen als nächster Schritt.
