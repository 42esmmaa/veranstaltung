import { createMiddleware } from 'hono/factory';
import { routePath } from 'hono/route';

const bounds = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const requestMetric = 'veranstaltung_http_requests_total';
const durationMetric = 'veranstaltung_http_request_duration_seconds';

type Histogram = { count: number; sum: number; buckets: number[] };

export function createMetrics() {
  const requests = new Map<string, number>();
  const durations = new Map<string, Histogram>();

  const track = createMiddleware(async (c, next) => {
    const route = routePath(c, -1);
    if (route === '/metrics' || route === '/health') {
      await next();
      return;
    }

    const start = performance.now();
    await next();
    const elapsed = (performance.now() - start) / 1000;
    const method = methods.has(c.req.method) ? c.req.method : 'OTHER';
    // Nur registrierte Routenmuster und feste Platzhalter als Labels verwenden.
    const path = !route || route.endsWith('*') ? 'unmatched' : route;
    const labels = `method=${JSON.stringify(method)},route=${JSON.stringify(path)}`;
    const requestLabels = `${labels},status_class="${Math.floor(c.res.status / 100)}xx"`;
    requests.set(requestLabels, (requests.get(requestLabels) ?? 0) + 1);
    let histogram = durations.get(labels);
    if (!histogram) {
      histogram = { count: 0, sum: 0, buckets: bounds.map(() => 0) };
      durations.set(labels, histogram);
    }
    histogram.count++;
    histogram.sum += elapsed;
    for (const [index, bound] of bounds.entries()) {
      if (elapsed <= bound) {
        histogram.buckets[index] = (histogram.buckets[index] ?? 0) + 1;
      }
    }
  });

  function scrape() {
    const lines = [
      `# HELP ${requestMetric} Completed HTTP requests.`,
      `# TYPE ${requestMetric} counter`,
    ];
    for (const [labels, count] of requests) {
      lines.push(`${requestMetric}{${labels}} ${count}`);
    }
    lines.push(
      `# HELP ${durationMetric} HTTP response duration before streaming the body.`,
      `# TYPE ${durationMetric} histogram`,
    );
    for (const [labels, { buckets, count, sum }] of durations) {
      bounds.forEach((bound, index) => {
        lines.push(`${durationMetric}_bucket{${labels},le="${bound}"} ${buckets[index]}`);
      });
      lines.push(
        `${durationMetric}_bucket{${labels},le="+Inf"} ${count}`,
        `${durationMetric}_sum{${labels}} ${sum}`,
        `${durationMetric}_count{${labels}} ${count}`,
      );
    }

    return new Response(`${lines.join('\n')}\n`, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return { track, scrape };
}
