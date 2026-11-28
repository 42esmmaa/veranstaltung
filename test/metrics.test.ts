import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { test } from 'vitest';
import { createMetrics } from '../src/monitoring/metrics.mts';

test('Prometheus-Metriken zählen Statusklassen und verwenden nur Routenmuster', async () => {
  const app = new Hono();
  const { track, scrape } = createMetrics();
  app.use('*', track);
  app.get('/metrics', scrape);
  app.get('/health', (c) => c.text('ok'));
  app.get('/veranstaltungen/:id', (c) => c.text('ok'));
  app.post('/graphql', () => {
    throw new Error('Testfehler');
  });
  app.onError((_error, c) => c.text('Interner Fehler', 500));

  assert.equal((await app.request('/metrics')).status, 200);
  assert.equal((await app.request('/health')).status, 200);
  assert.equal((await app.request('/veranstaltungen/13579?q=vertraulicher-wert')).status, 200);
  assert.equal((await app.request('/veranstaltungen/24680')).status, 200);
  assert.equal((await app.request('/nicht-registriert')).status, 404);
  assert.equal((await app.request('/graphql', { method: 'POST' })).status, 500);

  const response = await app.request('/metrics');
  assert.equal(response.headers.get('Content-Type'), 'text/plain; version=0.0.4; charset=utf-8');
  const lines = (await response.text()).split('\n');
  const event = 'method="GET",route="/veranstaltungen/:id"';
  assert.ok(lines.includes(`veranstaltung_http_requests_total{${event},status_class="2xx"} 2`));
  assert.ok(
    lines.includes(
      'veranstaltung_http_requests_total{method="GET",route="unmatched",status_class="4xx"} 1',
    ),
  );
  assert.ok(
    lines.includes(
      'veranstaltung_http_requests_total{method="POST",route="/graphql",status_class="5xx"} 1',
    ),
  );
  assert.ok(lines.includes(`veranstaltung_http_request_duration_seconds_count{${event}} 2`));
  assert.ok(
    lines.includes(`veranstaltung_http_request_duration_seconds_bucket{${event},le="+Inf"} 2`),
  );
  assert.ok(
    !lines.some((line) =>
      /13579|24680|vertraulicher-wert|nicht-registriert|\/metrics|\/health/.test(line),
    ),
  );
});
