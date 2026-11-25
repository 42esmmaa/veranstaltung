import assert from 'node:assert/strict';
import { test } from 'vitest';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../src/db/client.js';
import { ownerScope } from '../src/db/ownership.js';
import { ort, ticket, veranstaltung } from '../src/db/schema.js';
import { createEventRoutes } from '../src/rest/routes.js';

async function testRest() {
  const app = new Hono().route(
    '/veranstaltungen',
    createEventRoutes(db, async (authorization) => {
      if (authorization === 'Bearer owner') {
        return { subject: 'rest-owner' };
      }
      if (authorization === 'Bearer foreign') {
        return { subject: 'rest-foreign' };
      }
      throw new Error('Ungültig');
    }),
  );
  const request = (path: string, method: string, body?: object, token = 'owner') =>
    app.request(path, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const path = '/veranstaltungen';
  const event = {
    titel: 'REST Jazz_%',
    datum: '2027-02-01T19:00:00+01:00',
    kategorie: 'KONZERT',
    preis: '12.50',
    schlagwoerter: ['rest-jazz'],
    veranstalterId: 'spoofed',
  };
  const created = await request(path, 'POST', event);
  assert.equal(created.status, 201);
  const createdEvent = await created.json();
  const id: number = createdEvent.id;
  let otherEventId: number | undefined;
  try {
    assert.equal(createdEvent.veranstalterId, 'rest-owner');
    const eventPath = `${path}/${id}`;
    assert.equal(created.headers.get('Location'), eventPath);
    const searchPath = path + '?q=Jazz_%25&schlagwort=rest-jazz&kategorie=KONZERT';
    const list = await app.request(searchPath);
    assert.equal(list.status, 200);
    assert.ok((await list.json()).some((row: { id: number }) => row.id === id));
    for (const query of ['&ab=2027-02-02T00:00:00Z', '&limit=1&offset=1']) {
      const empty = await app.request(searchPath + query);
      assert.equal(empty.status, 200);
      assert.deepEqual(await empty.json(), []);
    }
    const found = await app.request(eventPath);
    assert.equal(found.status, 200);
    const foundEvent = await found.json();
    assert.equal(foundEvent.id, id);
    assert.equal(foundEvent.titel, event.titel);
    assert.equal(foundEvent.datum, '2027-02-01T18:00:00.000Z');
    assert.equal((await request(eventPath, 'PUT', event, 'foreign')).status, 404);
    assert.equal((await request(eventPath, 'DELETE', undefined, 'foreign')).status, 404);
    assert.equal((await (await app.request(eventPath)).json()).titel, event.titel);
    const updated = await request(eventPath, 'PUT', { ...event, titel: 'Neuer Titel' });
    assert.equal(updated.status, 200);
    const updatedEvent = await updated.json();
    assert.equal(updatedEvent.id, id);
    assert.equal(updatedEvent.titel, 'Neuer Titel');
    assert.equal(updatedEvent.veranstalterId, 'rest-owner');

    const placePath = eventPath + '/ort';
    const place = { name: 'Halle', strasse: 'Weg 1', plz: '12345', stadt: 'Ort' };
    assert.equal((await app.request(placePath)).status, 404);
    assert.equal((await request(placePath, 'PUT', place, 'foreign')).status, 404);
    assert.equal((await app.request(placePath)).status, 404);
    const createdPlaceResponse = await request(placePath, 'PUT', place);
    assert.equal(createdPlaceResponse.status, 201);
    assert.equal(createdPlaceResponse.headers.get('Location'), placePath);
    const createdPlace = await createdPlaceResponse.json();
    assert.equal(createdPlace.veranstaltungId, id);
    const changedPlace = { ...place, name: 'Neue Halle' };
    const updatedPlaceResponse = await request(placePath, 'PUT', changedPlace);
    assert.equal(updatedPlaceResponse.status, 200);
    assert.equal(updatedPlaceResponse.headers.get('Location'), null);
    const updatedPlace = await updatedPlaceResponse.json();
    assert.equal(updatedPlace.id, createdPlace.id);
    assert.equal(updatedPlace.name, changedPlace.name);
    assert.equal((await request(placePath, 'PUT', place, 'foreign')).status, 404);
    assert.equal((await request(placePath, 'DELETE', undefined, 'foreign')).status, 404);
    const foundPlace = await app.request(placePath);
    assert.equal(foundPlace.status, 200);
    assert.deepEqual(await foundPlace.json(), updatedPlace);

    const ticketsPath = eventPath + '/tickets';
    const entry = { bezeichnung: 'Standard', preis: '12.50', kontingent: 10 };
    const emptyTickets = await app.request(ticketsPath);
    assert.equal(emptyTickets.status, 200);
    assert.deepEqual(await emptyTickets.json(), []);
    assert.equal((await request(ticketsPath, 'POST', entry, 'foreign')).status, 404);
    const ticketResponse = await request(ticketsPath, 'POST', entry);
    assert.equal(ticketResponse.status, 201);
    const createdTicket = await ticketResponse.json();
    assert.equal(createdTicket.veranstaltungId, id);
    assert.equal(createdTicket.aktiv, true);
    const ticketPath = `${ticketsPath}/${createdTicket.id}`;
    assert.equal(ticketResponse.headers.get('Location'), ticketPath);
    const ticketList = await app.request(ticketsPath + '?limit=1');
    assert.equal(ticketList.status, 200);
    assert.deepEqual(await ticketList.json(), [createdTicket]);
    assert.deepEqual(await (await app.request(ticketsPath + '?limit=1&offset=1')).json(), []);
    const foundTicket = await app.request(ticketPath);
    assert.equal(foundTicket.status, 200);
    assert.deepEqual(await foundTicket.json(), createdTicket);

    const otherEventResponse = await request(path, 'POST', {
      ...event,
      titel: 'Andere Veranstaltung',
    });
    assert.equal(otherEventResponse.status, 201);
    otherEventId = (await otherEventResponse.json()).id;
    const wrongTicketPath = `${path}/${otherEventId}/tickets/${createdTicket.id}`;
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const wrongParent = await request(
        wrongTicketPath,
        method,
        method === 'PUT' ? entry : undefined,
      );
      assert.equal(wrongParent.status, 404);
    }
    assert.equal((await request(ticketPath, 'PUT', entry, 'foreign')).status, 404);
    assert.equal((await request(ticketPath, 'DELETE', undefined, 'foreign')).status, 404);
    assert.deepEqual(await (await app.request(ticketPath)).json(), createdTicket);
    const updatedTicketResponse = await request(ticketPath, 'PUT', { ...entry, kontingent: 5 });
    assert.equal(updatedTicketResponse.status, 200);
    assert.deepEqual(await updatedTicketResponse.json(), { ...createdTicket, kontingent: 5 });
    const deletedTicket = await request(ticketPath, 'DELETE');
    assert.equal(deletedTicket.status, 204);
    assert.equal(await deletedTicket.text(), '');
    assert.equal((await app.request(ticketPath)).status, 404);
    assert.equal((await request(ticketPath, 'PUT', entry)).status, 404);
    assert.equal((await request(ticketPath, 'DELETE')).status, 404);
    assert.equal((await request(placePath, 'DELETE')).status, 204);
    assert.equal((await app.request(placePath)).status, 404);
    assert.equal((await request(placePath, 'DELETE')).status, 404);
    const deleted = await request(eventPath, 'DELETE');
    assert.equal(deleted.status, 204);
    assert.equal(await deleted.text(), '');
    const missing = await app.request(eventPath);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Ressource nicht gefunden.' });
    assert.equal((await request(placePath, 'PUT', place)).status, 404);
    assert.equal((await app.request(ticketsPath)).status, 404);
    assert.equal((await request(ticketsPath, 'POST', entry)).status, 404);
    for (const method of ['PUT', 'DELETE']) {
      const missingWrite = await request(eventPath, method, method === 'PUT' ? event : undefined);
      assert.equal(missingWrite.status, 404);
      assert.deepEqual(await missingWrite.json(), { error: 'Ressource nicht gefunden.' });
    }
  } finally {
    if (otherEventId !== undefined) {
      await db.delete(veranstaltung).where(eq(veranstaltung.id, otherEventId));
    }
    await db.delete(veranstaltung).where(eq(veranstaltung.id, id));
  }
}

test('Migration, Relationen, Eigentümer und Kaskaden', async () => {
  try {
    await db.transaction(async (tx) => {
      const datum = new Date('2027-01-03T18:30:00+01:00');
      const [event] = await tx
        .insert(veranstaltung)
        .values({
          titel: 'Test',
          datum,
          kategorie: 'KONZERT',
          preis: '12.50',
          veranstalterId: 'owner',
          schlagwoerter: ['musik'],
          aktualisiert: new Date('2020-01-01T00:00:00Z'),
        })
        .returning();
      const address = {
        name: 'Halle',
        strasse: 'Weg 1',
        plz: '12345',
        stadt: 'Ort',
        veranstaltungId: event.id,
      };
      const [place] = await tx.insert(ort).values(address).returning();
      const [entry] = await tx
        .insert(ticket)
        .values({
          bezeichnung: 'Standard',
          preis: '12.50',
          kontingent: 10,
          veranstaltungId: event.id,
        })
        .returning();

      await assert.rejects(
        tx.transaction(async (savepoint) => {
          await savepoint.insert(ort).values(address);
        }),
        (error: unknown) =>
          error instanceof Error &&
          (('code' in error && error.code === '23505') ||
            (error.cause instanceof Error &&
              'code' in error.cause &&
              error.cause.code === '23505')),
      );

      const foreign = ownerScope(tx, { subject: 'foreign' });
      assert.equal(
        (
          await tx
            .update(veranstaltung)
            .set({ titel: 'Fremd' })
            .where(foreign.veranstaltung(event.id))
            .returning()
        ).length,
        0,
      );
      assert.equal((await tx.delete(ort).where(foreign.ort(place.id)).returning()).length, 0);
      assert.equal((await tx.delete(ticket).where(foreign.ticket(entry.id)).returning()).length, 0);

      const owner = ownerScope(tx, { subject: 'owner' });
      const [updated] = await tx
        .update(veranstaltung)
        .set({ titel: 'Neu' })
        .where(owner.veranstaltung(event.id))
        .returning();
      assert.ok(updated.aktualisiert > event.aktualisiert);
      const result = await tx.query.veranstaltung.findFirst({
        where: { id: event.id },
        with: { ort: true, tickets: true },
      });
      assert.equal(result?.datum.toISOString(), datum.toISOString());
      assert.equal(result?.ort?.id, place.id);
      assert.deepEqual(
        result?.tickets.map(({ id }) => id),
        [entry.id],
      );

      await tx.delete(veranstaltung).where(owner.veranstaltung(event.id));
      assert.equal(await tx.query.ort.findFirst({ where: { id: place.id } }), undefined);
      assert.equal(await tx.query.ticket.findFirst({ where: { id: entry.id } }), undefined);
    });
    await testRest();
  } finally {
    await db.$client.end();
  }
});
