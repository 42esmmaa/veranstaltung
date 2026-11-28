import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const reportDir = resolve(projectDir, 'reports', 'dependency-check');
const inputDir = resolve(reportDir, 'input');
await mkdir(inputDir, { recursive: true });
for (const format of ['html', 'json']) {
  await rm(resolve(reportDir, `dependency-check-report.${format}`), { force: true });
}
for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
  await copyFile(resolve(projectDir, file), resolve(inputDir, file));
}

const containerScript = [
  'if [ -n "$NVD_API_KEY" ]; then',
  '  umask 077',
  '  printf "nvd.api.key=%s\\n" "$NVD_API_KEY" > /tmp/nvd.properties',
  '  set -- "$@" --propertyfile /tmp/nvd.properties',
  'fi',
  'exec /usr/share/dependency-check/bin/dependency-check.sh "$@"',
].join('\n');

const args = [
  'run',
  '--rm',
  '--env',
  'NVD_API_KEY',
  '--mount',
  `type=bind,source=${inputDir},target=/src,readonly`,
  '--mount',
  `type=bind,source=${reportDir},target=/report`,
  '--mount',
  'type=volume,source=veranstaltung_dependency_check_13_data,target=/usr/share/dependency-check/data',
  '--entrypoint',
  '/bin/sh',
  'owasp/dependency-check:13.0.0',
  '-c',
  containerScript,
  'dependency-check',
  '--project',
  'veranstaltung',
  '--scan',
  '/src/pnpm-lock.yaml',
  '--out',
  '/report',
  '--format',
  'HTML',
  '--format',
  'JSON',
  '--failOnCVSS',
  '7',
  '--disableOssIndex',
  '--disableRetireJs',
  '--nvdMaxRetryCount',
  '2',
];

if (!process.env['NVD_API_KEY']) {
  args.push(
    '--nvdDatafeed',
    'https://dependency-check.github.io/DependencyCheck_Builder/nvd_cache/nvdcve-{0}.json.gz',
  );
}

console.info(
  'OWASP Dependency Check 13.0.0: Scan des pnpm-Lockfiles einschließlich Entwicklungsabhängigkeiten.',
);
console.info('Berichte: reports/dependency-check/dependency-check-report.html und .json');
const child = spawn('docker', args, { cwd: projectDir, stdio: 'inherit' });
process.exitCode = await new Promise<number>((resolveExit) => {
  child.once('error', () => {
    console.error(
      'Dependency Check konnte nicht gestartet werden. Docker-Installation und Docker-Daemon prüfen.',
    );
    resolveExit(1);
  });
  child.once('exit', (code) => resolveExit(code ?? 1));
});

const reportSchema = z.object({
  dependencies: z.array(
    z.object({
      vulnerabilities: z.array(z.object({ severity: z.string() })).optional(),
    }),
  ),
});
try {
  const report = reportSchema.parse(
    JSON.parse(await readFile(resolve(reportDir, 'dependency-check-report.json'), 'utf8')),
  );
  const findings = report.dependencies.flatMap((dependency) => dependency.vulnerabilities ?? []);
  const high = findings.filter(({ severity }) =>
    ['HIGH', 'CRITICAL'].includes(severity.toUpperCase()),
  );
  console.info(
    `Dependency Check: ${findings.length} Hinweise, davon ${high.length} hoch oder kritisch.`,
  );
  // Registry-Advisories besitzen nicht immer einen numerischen CVSS-Score.
  if (high.length > 0) {
    process.exitCode ||= 1;
  }
} catch {
  console.error(
    'Kein auswertbarer aktueller JSON-Bericht vorhanden. Scanfehler prüfen; dies ist kein erfolgreicher Sicherheitscheck.',
  );
  process.exitCode ||= 1;
}
