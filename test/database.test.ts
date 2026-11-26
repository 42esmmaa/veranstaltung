import assert from 'node:assert/strict';
import { test } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.mts';
import { db } from '../src/db/client.js';
import { ownerScope } from '../src/db/ownership.js';
import { ort, ticket, veranstaltung } from '../src/db/schema.js';

async function testRest() {
  const app = createApp(db, async (authorization) => {
    if (authorization === 'Bearer owner') {
      return { subject: 'rest-owner' };
    }
    if (authorization === 'Bearer foreign') {
      return { subject: 'rest-foreign' };
    }
    throw new Error('Ungültig');
  });
  const query = (value: string, variables: object = {}) =>
    app.request('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: value, variables }),
    });
  const request = (path: string, method: string, body?: object, token = 'owner', etag?: string) =>
    app.request(path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(etag === undefined ? {} : { 'If-Match': etag }),
      },
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
    assert.equal(createdEvent.version, 0);
    assert.equal(created.headers.get('ETag'), '"0"');
    const searchPath = path + '?q=Jazz_%25&schlagwort=rest-jazz&kategorie=KONZERT';
    const list = await app.request(searchPath);
    assert.equal(list.status, 200);
    assert.ok((await list.json()).some((row: { id: number }) => row.id === id));
    for (const suffix of ['&ab=2027-02-02T00:00:00Z', '&limit=1&offset=1']) {
      const empty = await app.request(searchPath + suffix);
      assert.equal(empty.status, 200);
      assert.deepEqual(await empty.json(), []);
    }
    const found = await app.request(eventPath);
    assert.equal(found.status, 200);
    const foundEvent = await found.json();
    assert.equal(foundEvent.id, id);
    assert.equal(foundEvent.titel, event.titel);
    assert.equal(foundEvent.datum, '2027-02-01T18:00:00.000Z');
    const etag = found.headers.get('ETag');
    assert.equal(etag, '"0"');
    for (const tag of [etag, `W/${etag}`, `"99", ${etag}`, '*']) {
      const cached = await app.request(eventPath, { headers: { 'If-None-Match': tag } });
      assert.equal(cached.status, 304);
      assert.equal(cached.headers.get('ETag'), etag);
      assert.equal(await cached.text(), '');
    }
    const head = await app.request(eventPath, {
      method: 'HEAD',
      headers: { 'If-None-Match': etag },
    });
    assert.equal(head.status, 304);
    assert.equal(head.headers.get('ETag'), etag);
    assert.equal(await head.text(), '');
    const differentTag = await app.request(eventPath, { headers: { 'If-None-Match': '"99"' } });
    assert.equal(differentTag.status, 200);
    assert.deepEqual(await differentTag.json(), foundEvent);
    assert.equal((await request(eventPath, 'PUT', event, 'foreign', etag)).status, 404);
    assert.equal((await request(eventPath, 'PUT', event, 'foreign', '"9"')).status, 404);
    assert.equal((await request(eventPath, 'DELETE', undefined, 'foreign')).status, 404);
    assert.equal((await (await app.request(eventPath)).json()).titel, event.titel);
    const titles = ['Neuer Titel A', 'Neuer Titel B'];
    const edits = await Promise.all(
      titles.map((titel) => request(eventPath, 'PUT', { ...event, titel }, 'owner', etag)),
    );
    assert.deepEqual(edits.map(({ status }) => status).sort(), [200, 412]);
    const winner = edits.findIndex(({ status }) => status === 200);
    assert.equal(edits[winner].headers.get('ETag'), '"1"');
    const updatedEvent = await edits[winner].json();
    assert.equal(updatedEvent.id, id);
    assert.equal(updatedEvent.titel, titles[winner]);
    assert.equal(updatedEvent.version, 1);
    assert.equal(updatedEvent.veranstalterId, 'rest-owner');
    assert.deepEqual(await (await app.request(eventPath)).json(), updatedEvent);
    const changedResponse = await app.request(eventPath, { headers: { 'If-None-Match': etag } });
    assert.equal(changedResponse.status, 200);
    assert.equal(changedResponse.headers.get('ETag'), '"1"');
    assert.deepEqual(await changedResponse.json(), updatedEvent);
    const unchanged = await app.request(eventPath, { headers: { 'If-None-Match': '"1"' } });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.get('ETag'), '"1"');
    assert.equal(await unchanged.text(), '');

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

    const graphqlEvent = await query(
      `query($id: ID!) {
        veranstaltung(id: $id) {
          id titel datum preis schlagwoerter
          ort { name }
          tickets(limit: 1) { id preis kontingent }
        }
      }`,
      { id: String(id) },
    );
    assert.equal(graphqlEvent.status, 200);
    assert.deepEqual(await graphqlEvent.json(), {
      data: {
        veranstaltung: {
          id: String(id),
          titel: updatedEvent.titel,
          datum: '2027-02-01T18:00:00.000Z',
          preis: '12.50',
          schlagwoerter: ['rest-jazz'],
          ort: { name: 'Neue Halle' },
          tickets: [{ id: String(createdTicket.id), preis: '12.50', kontingent: 10 }],
        },
      },
    });
    const graphqlSearch =
      'query($input: SuchParameterInput) { veranstaltungen(input: $input) { id } }';
    const filter = { q: null, kategorie: 'KONZERT', schlagwort: 'rest-jazz', limit: 1 };
    const graphqlList = await query(graphqlSearch, { input: filter });
    assert.deepEqual(await graphqlList.json(), { data: { veranstaltungen: [{ id: String(id) }] } });
    const graphqlEmpty = await query(graphqlSearch, { input: { ...filter, offset: 1 } });
    assert.deepEqual(await graphqlEmpty.json(), { data: { veranstaltungen: [] } });

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
    const graphqlRelations = await query(
      'query($id: ID!) { veranstaltung(id: $id) { ort { id } tickets { id } } }',
      { id: String(id) },
    );
    assert.deepEqual(await graphqlRelations.json(), {
      data: { veranstaltung: { ort: null, tickets: [] } },
    });
    const deleted = await request(eventPath, 'DELETE');
    assert.equal(deleted.status, 204);
    assert.equal(await deleted.text(), '');
    const missing = await app.request(eventPath);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Ressource nicht gefunden.' });
    const missingCached = await app.request(eventPath, { headers: { 'If-None-Match': '*' } });
    assert.equal(missingCached.status, 404);
    const graphqlMissing = await query('query($id: ID!) { veranstaltung(id: $id) { id } }', {
      id: String(id),
    });
    const graphqlMissingBody = await graphqlMissing.json();
    assert.deepEqual(graphqlMissingBody.data, { veranstaltung: null });
    assert.equal(graphqlMissingBody.errors[0].extensions.code, 'BAD_USER_INPUT');
    assert.equal((await request(placePath, 'PUT', place)).status, 404);
    assert.equal((await app.request(ticketsPath)).status, 404);
    assert.equal((await request(ticketsPath, 'POST', entry)).status, 404);
    for (const method of ['PUT', 'DELETE']) {
      const missingWrite = await request(
        eventPath,
        method,
        method === 'PUT' ? event : undefined,
        'owner',
        '"1"',
      );
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

async function testGraphqlMutations() {
  const graphql = createApp(db, async (authorization) => {
    if (authorization === 'Bearer owner') {
      return { subject: 'graphql-owner' };
    }
    if (authorization === 'Bearer foreign') {
      return { subject: 'graphql-foreign' };
    }
    throw new Error('Ungültig');
  });
  const query = async (value: string, variables: object, token = 'owner') => {
    const response = await graphql.request('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ query: value, variables }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const input = {
    titel: ' GraphQL Jazz ',
    datum: '2027-02-01T19:00:00+01:00',
    kategorie: 'KONZERT',
    preis: '12.50',
  };
  const fields = 'id version titel datum preis schlagwoerter veranstalterId';
  const create = `mutation($input: VeranstaltungInput!) { create(input: $input) { ${fields} } }`;
  const update = `mutation($id: ID!, $version: Int!, $input: VeranstaltungInput!) {
    update(id: $id, version: $version, input: $input) { ${fields} }
  }`;
  const remove = 'mutation($id: ID!) { delete(id: $id) { success } }';
  const read = `query($id: ID!) { veranstaltung(id: $id) { ${fields} } }`;
  const createdResult = await query(create, { input });
  assert.equal(createdResult.errors, undefined);
  const created = createdResult.data.create;
  const id: string = created.id;
  let otherEventId: string | undefined;
  try {
    assert.deepEqual(created, {
      id,
      version: 0,
      titel: 'GraphQL Jazz',
      datum: '2027-02-01T18:00:00.000Z',
      preis: '12.50',
      schlagwoerter: [],
      veranstalterId: 'graphql-owner',
    });

    const writePlace =
      'mutation($veranstaltungId: ID!, $input: OrtInput!) { updateOrt(veranstaltungId: $veranstaltungId, input: $input) { id name strasse plz stadt veranstaltungId } }';
    const removePlace =
      'mutation($veranstaltungId: ID!) { deleteOrt(veranstaltungId: $veranstaltungId) { success } }';
    const ticketFields = 'id bezeichnung preis kontingent aktiv veranstaltungId';
    const createTicket = `mutation($veranstaltungId: ID!, $input: TicketInput!) { createTicket(veranstaltungId: $veranstaltungId, input: $input) { ${ticketFields} } }`;
    const updateTicket = `mutation($veranstaltungId: ID!, $ticketId: ID!, $input: TicketInput!) { updateTicket(veranstaltungId: $veranstaltungId, id: $ticketId, input: $input) { ${ticketFields} } }`;
    const removeTicket =
      'mutation($veranstaltungId: ID!, $ticketId: ID!) { deleteTicket(veranstaltungId: $veranstaltungId, id: $ticketId) { success } }';
    const placeInput = { name: ' Halle ', strasse: 'Weg 1', plz: '12345', stadt: 'Ort' };
    const ticketInput = { bezeichnung: 'Standard', preis: '12.50', kontingent: 10 };
    const placeResult = await query(writePlace, { veranstaltungId: id, input: placeInput });
    assert.equal(placeResult.errors, undefined);
    const place = placeResult.data.updateOrt;
    assert.deepEqual(place, { ...placeInput, name: 'Halle', id: place.id, veranstaltungId: id });
    const ticketResult = await query(createTicket, { veranstaltungId: id, input: ticketInput });
    assert.equal(ticketResult.errors, undefined);
    const createdTicket = ticketResult.data.createTicket;
    assert.deepEqual(createdTicket, {
      ...ticketInput,
      id: createdTicket.id,
      aktiv: true,
      veranstaltungId: id,
    });
    for (const [operation, variables] of [
      [writePlace, { veranstaltungId: id, input: { ...placeInput, name: 'Fremd' } }],
      [removePlace, { veranstaltungId: id }],
      [createTicket, { veranstaltungId: id, input: ticketInput }],
      [
        updateTicket,
        {
          veranstaltungId: id,
          ticketId: createdTicket.id,
          input: { ...ticketInput, kontingent: 99 },
        },
      ],
      [removeTicket, { veranstaltungId: id, ticketId: createdTicket.id }],
    ] as const) {
      const foreign = await query(operation, variables, 'foreign');
      assert.equal(foreign.errors[0].extensions.code, 'BAD_USER_INPUT');
    }
    const readRelations =
      'query($id: ID!, $ticketId: ID!) { veranstaltung(id: $id) { ort { name } tickets { id kontingent } ticket(id: $ticketId) { id kontingent } } }';
    assert.deepEqual(await query(readRelations, { id, ticketId: createdTicket.id }), {
      data: {
        veranstaltung: {
          ort: { name: 'Halle' },
          tickets: [{ id: createdTicket.id, kontingent: 10 }],
          ticket: { id: createdTicket.id, kontingent: 10 },
        },
      },
    });
    const replacedPlace = await query(writePlace, {
      veranstaltungId: id,
      input: { ...placeInput, name: 'Neue Halle' },
    });
    assert.deepEqual(replacedPlace, { data: { updateOrt: { ...place, name: 'Neue Halle' } } });
    const updatedTicket = await query(updateTicket, {
      veranstaltungId: id,
      ticketId: createdTicket.id,
      input: { ...ticketInput, kontingent: 5 },
    });
    assert.deepEqual(updatedTicket, {
      data: { updateTicket: { ...createdTicket, kontingent: 5 } },
    });

    const otherEvent = await query(create, { input: { ...input, titel: 'Andere Veranstaltung' } });
    assert.equal(otherEvent.errors, undefined);
    otherEventId = otherEvent.data.create.id;
    const wrongParent = await query(
      'query($id: ID!, $ticketId: ID!) { veranstaltung(id: $id) { ticket(id: $ticketId) { id } } }',
      { id: otherEventId, ticketId: createdTicket.id },
    );
    assert.equal(wrongParent.errors[0].extensions.code, 'BAD_USER_INPUT');
    for (const operation of [updateTicket, removeTicket]) {
      const wrongWrite = await query(operation, {
        veranstaltungId: otherEventId,
        ticketId: createdTicket.id,
        input: ticketInput,
      });
      assert.equal(wrongWrite.errors[0].extensions.code, 'BAD_USER_INPUT');
    }
    const afterWrongParent = await query(readRelations, { id, ticketId: createdTicket.id });
    assert.equal(afterWrongParent.data.veranstaltung.ticket.kontingent, 5);
    for (const [operation, variables, field] of [
      [removePlace, { veranstaltungId: id }, 'deleteOrt'],
      [removeTicket, { veranstaltungId: id, ticketId: createdTicket.id }, 'deleteTicket'],
    ] as const) {
      assert.deepEqual(await query(operation, variables), { data: { [field]: { success: true } } });
      const missingRelation = await query(operation, variables);
      assert.equal(missingRelation.errors[0].extensions.code, 'BAD_USER_INPUT');
    }
    const emptyRelations = await query(
      'query($id: ID!) { veranstaltung(id: $id) { ort { id } tickets { id } } }',
      { id },
    );
    assert.deepEqual(emptyRelations, { data: { veranstaltung: { ort: null, tickets: [] } } });

    const changed = { ...input, titel: 'Neuer GraphQL-Titel', preis: '15.00' };
    for (const [operation, variables] of [
      [update, { id, version: created.version, input: changed }],
      [remove, { id }],
    ] as const) {
      const foreign = await query(operation, variables, 'foreign');
      assert.equal(foreign.errors[0].extensions.code, 'BAD_USER_INPUT');
    }
    assert.deepEqual(await query(read, { id }), { data: { veranstaltung: created } });
    const updated = await query(update, { id, version: created.version, input: changed });
    assert.deepEqual(updated, {
      data: { update: { ...created, version: 1, titel: changed.titel, preis: changed.preis } },
    });
    const stale = await query(update, { id, version: created.version, input });
    assert.deepEqual(stale.data, { update: null });
    assert.equal(stale.errors[0].extensions.code, 'CONFLICT');
    assert.deepEqual(await query(read, { id }), { data: { veranstaltung: updated.data.update } });
    assert.deepEqual(await query(remove, { id }), { data: { delete: { success: true } } });
    const missing = await query(read, { id });
    assert.deepEqual(missing.data, { veranstaltung: null });
    assert.equal(missing.errors[0].extensions.code, 'BAD_USER_INPUT');
    const missingDelete = await query(remove, { id });
    assert.equal(missingDelete.errors[0].extensions.code, 'BAD_USER_INPUT');
    for (const [operation, relationInput] of [
      [writePlace, placeInput],
      [createTicket, ticketInput],
    ] as const) {
      const missingParent = await query(operation, { veranstaltungId: id, input: relationInput });
      assert.equal(missingParent.errors[0].extensions.code, 'BAD_USER_INPUT');
    }
  } finally {
    if (otherEventId !== undefined) {
      await db.delete(veranstaltung).where(eq(veranstaltung.id, Number(otherEventId)));
    }
    await db.delete(veranstaltung).where(eq(veranstaltung.id, Number(id)));
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
    await testGraphqlMutations();
  } finally {
    await db.$client.end();
  }
});
