import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'reports/docs');
const asciidoctorPackage = process.env['ASCIIDOCTOR_PACKAGE'];
const plantumlJar = process.env['PLANTUML_JAR'];

if (!plantumlJar) {
  throw new Error('PLANTUML_JAR auf die lokale PlantUML-JAR setzen. Siehe README.md.');
}

const require = createRequire(import.meta.url);
const { convert } = require(
  asciidoctorPackage
    ? resolve(asciidoctorPackage)
    : resolve(root, 'reports/docs-tools/node_modules/@asciidoctor/core'),
);

const diagrams = resolve(output, 'diagramme');
mkdirSync(diagrams, { recursive: true });

for (const name of ['systemuebersicht', 'komponenten', 'datenmodell']) {
  const source = readFileSync(resolve(root, 'docs/diagramme', `${name}.puml`));
  const rendered = spawnSync(
    'java',
    ['-jar', resolve(plantumlJar), '-charset', 'UTF-8', '-tsvg', '-pipe'],
    {
      input: source,
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    },
  );
  if (rendered.error || rendered.status !== 0 || !rendered.stdout?.includes('<svg')) {
    throw new Error(`PlantUML konnte ${name} nicht rendern. ${rendered.stderr ?? ''}`, {
      cause: rendered.error,
    });
  }
  writeFileSync(resolve(diagrams, `${name}.svg`), rendered.stdout);
}

const html = resolve(output, 'projekthandbuch.html');
const handbook = readFileSync(resolve(root, 'docs/projekthandbuch.adoc'), 'utf8');
writeFileSync(html, await convert(handbook, { safe: 'secure', standalone: true }));
console.log(html);
