import { check, fail, sleep } from 'k6';
import http, { type Response } from 'k6/http';
import type { Options } from 'k6/options';

const baseUrl = (__ENV['K6_BASE_URL'] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(baseUrl)) {
  throw new Error('K6_BASE_URL muss auf einen lokalen Testserver zeigen.');
}
const accessToken = __ENV['K6_ACCESS_TOKEN'];
if (!accessToken) {
  throw new Error('K6_ACCESS_TOKEN eines lokalen Test-Veranstalters erforderlich.');
}

const restUrl = `${baseUrl}/veranstaltungen`;
const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
};
const event = {
  titel: 'k6 Jazzabend',
  datum: '2027-02-01T19:00:00+01:00',
  kategorie: 'KONZERT',
  preis: '12.50',
  schlagwoerter: ['k6'],
};
type TestData = { readonly id: string; readonly etag: string };

const stages = [
  { duration: '5s', target: 1 },
  { duration: '22s', target: 1 },
  { duration: '3s', target: 0 },
];
const scenario = (exec: string, users: number) => ({
  executor: 'ramping-vus' as const,
  exec,
  startVUs: 0,
  stages: stages.map(({ duration, target }) => ({ duration, target: target * users })),
  gracefulRampDown: '5s',
});

export const options: Options = {
  scenarios: {
    get_id: scenario('getById', 2),
    get_id_not_modified: scenario('getByIdNotModified', 2),
    get_titel: scenario('getByTitel', 5),
    query_veranstaltungen: scenario('queryVeranstaltungen', 3),
    write_veranstaltung: scenario('writeVeranstaltung', 1),
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate==1'],
  },
};

function requireStatus(response: Response, expected: number, name: string) {
  if (!check(response, { [name]: (result) => result.status === expected })) {
    fail(`${name}: HTTP ${response.status} statt ${expected}.`);
  }
}

function insertedId(response: Response): string {
  const location = response.headers['Location'];
  const id =
    typeof location === 'string' ? /\/veranstaltungen\/(\d+)$/.exec(location)?.[1] : undefined;
  if (id === undefined) {
    fail('Location mit Veranstaltungs-ID fehlt.');
  }
  return id;
}

export function setup(): TestData {
  const response = http.post(restUrl, JSON.stringify(event), {
    headers,
    tags: { name: 'POST /veranstaltungen (setup)' },
  });
  requireStatus(response, 201, 'Testveranstaltung angelegt');
  const id = insertedId(response);
  const etag = response.headers['Etag'];
  if (typeof etag !== 'string') {
    http.del(`${restUrl}/${id}`, null, { headers });
    fail('ETag der Testveranstaltung fehlt.');
  }
  return { id, etag };
}

export function getById({ id }: TestData) {
  const response = http.get(`${restUrl}/${id}`, { tags: { name: 'GET /veranstaltungen/:id' } });
  requireStatus(response, 200, 'Veranstaltung gelesen');
  check(response, { 'Richtige Veranstaltungs-ID': (result) => String(result.json('id')) === id });
  sleep(1);
}

export function getByIdNotModified({ id, etag }: TestData) {
  const response = http.get(`${restUrl}/${id}`, {
    headers: { 'If-None-Match': etag },
    tags: { name: 'GET /veranstaltungen/:id (ETag)' },
  });
  requireStatus(response, 304, 'ETag unverändert');
  sleep(1);
}

export function getByTitel() {
  const response = http.get(`${restUrl}?q=k6&schlagwort=k6&page=1&size=5`, {
    tags: { name: 'GET /veranstaltungen (Suche)' },
  });
  requireStatus(response, 200, 'Suchseite gelesen');
  check(response, {
    'Seiteninhalt ist eine Liste': (result) => Array.isArray(result.json('content')),
  });
  sleep(1);
}

export function queryVeranstaltungen() {
  const response = http.post(
    `${baseUrl}/graphql`,
    JSON.stringify({
      query: '{ veranstaltungen(input: { schlagwort: "k6", limit: 5 }) { id titel version } }',
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'POST /graphql (Suche)' } },
  );
  requireStatus(response, 200, 'GraphQL HTTP 200');
  check(response, {
    'GraphQL ohne Fehler': (result) => result.json('errors') === undefined,
    'GraphQL-Treffer sind eine Liste': (result) =>
      Array.isArray(result.json('data.veranstaltungen')),
  });
  sleep(1);
}

export function writeVeranstaltung() {
  const created = http.post(restUrl, JSON.stringify(event), {
    headers,
    tags: { name: 'POST /veranstaltungen' },
  });
  requireStatus(created, 201, 'Veranstaltung angelegt');
  const id = insertedId(created);
  try {
    const etag = created.headers['Etag'];
    if (typeof etag !== 'string') {
      fail('ETag der neuen Veranstaltung fehlt.');
    }
    const updated = http.put(
      `${restUrl}/${id}`,
      JSON.stringify({ ...event, titel: 'k6 Jazzabend aktualisiert' }),
      { headers: { ...headers, 'If-Match': etag }, tags: { name: 'PUT /veranstaltungen/:id' } },
    );
    requireStatus(updated, 204, 'Veranstaltung geändert');
  } finally {
    const deleted = http.del(`${restUrl}/${id}`, null, {
      headers,
      tags: { name: 'DELETE /veranstaltungen/:id' },
    });
    requireStatus(deleted, 204, 'Veranstaltung gelöscht');
  }
  sleep(1);
}

export function teardown({ id }: TestData) {
  const response = http.del(`${restUrl}/${id}`, null, {
    headers,
    tags: { name: 'DELETE /veranstaltungen/:id (teardown)' },
  });
  requireStatus(response, 204, 'Testveranstaltung gelöscht');
}
