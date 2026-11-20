import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from '../src/db/client.js';
import { ownerScope } from '../src/db/ownership.js';
import { ort, ticket, veranstaltung } from '../src/db/schema.js';

test('Migration, Relationen, Eigentümer und Kaskaden', async () => {
  try {
    await db.transaction(async (tx) => {
      const datum = new Date('2027-01-03T18:30:00+01:00');
      const [event] = await tx.insert(veranstaltung).values({
        titel: 'Test', datum, kategorie: 'KONZERT', preis: '12.50', veranstalterId: 'owner',
        schlagwoerter: ['musik'], aktualisiert: new Date('2020-01-01T00:00:00Z'),
      }).returning();
      const address = { name: 'Halle', strasse: 'Weg 1', plz: '12345', stadt: 'Ort', veranstaltungId: event.id };
      const [place] = await tx.insert(ort).values(address).returning();
      const [entry] = await tx.insert(ticket).values({
        bezeichnung: 'Standard', preis: '12.50', kontingent: 10, veranstaltungId: event.id,
      }).returning();

      await assert.rejects(tx.transaction(async (savepoint) => {
        await savepoint.insert(ort).values(address);
      }), (error: unknown) => error instanceof Error && (
        ('code' in error && error.code === '23505') ||
        (error.cause instanceof Error && 'code' in error.cause && error.cause.code === '23505')
      ));

      const foreign = ownerScope(tx, { subject: 'foreign' });
      assert.equal((await tx.update(veranstaltung).set({ titel: 'Fremd' }).where(foreign.veranstaltung(event.id)).returning()).length, 0);
      assert.equal((await tx.delete(ort).where(foreign.ort(place.id)).returning()).length, 0);
      assert.equal((await tx.delete(ticket).where(foreign.ticket(entry.id)).returning()).length, 0);

      const owner = ownerScope(tx, { subject: 'owner' });
      const [updated] = await tx.update(veranstaltung).set({ titel: 'Neu' }).where(owner.veranstaltung(event.id)).returning();
      assert.ok(updated.aktualisiert > event.aktualisiert);
      const result = await tx.query.veranstaltung.findFirst({
        where: { id: event.id }, with: { ort: true, tickets: true },
      });
      assert.equal(result?.datum.toISOString(), datum.toISOString());
      assert.equal(result?.ort?.id, place.id);
      assert.deepEqual(result?.tickets.map(({ id }) => id), [entry.id]);

      await tx.delete(veranstaltung).where(owner.veranstaltung(event.id));
      assert.equal(await tx.query.ort.findFirst({ where: { id: place.id } }), undefined);
      assert.equal(await tx.query.ticket.findFirst({ where: { id: entry.id } }), undefined);
    });
  } finally {
    await db.$client.end();
  }
});
