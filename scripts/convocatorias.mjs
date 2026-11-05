#!/usr/bin/env node
/**
 * Descarga los datos de convocatorias que usa la web inglesa y guarda una copia en
 * data/convocatorias.json.
 *
 * La web española se genera a partir de esa copia y nunca directamente del servicio:
 * así cualquier cambio en las convocatorias llega como un Pull Request que una persona
 * revisa antes de publicarse.
 *
 * Origen: el Worker de Cloudflare que alimenta www.ullswaterinvestments.com, que a su vez
 * consulta la API del portal Funding & Tenders de la Comisión Europea (SEDIA).
 *
 * Si las convocatorias no han cambiado, el fichero no se toca (aunque el servicio
 * haya cambiado su fecha de actualización), para no abrir PR vacíos.
 *
 * Uso: npm run convocatorias
 * Sin dependencias. Requiere Node 22 o superior.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Node solo espera 250 ms por cada IP al conectar; desde algunas redes el saludo TCP con
// Cloudflare tarda más y fetch falla con «fetch failed» aunque curl funcione.
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);

const URL_DATOS = 'https://fh-topics.emilio-mulet.workers.dev/';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'data', 'convocatorias.json');
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const respuesta = await fetch(URL_DATOS, {
  headers: { 'user-agent': 'UllswaterES/1.0 (+https://www.ullswaterinvestments.com)', accept: 'application/json' },
  signal: AbortSignal.timeout(30_000),
});
if (!respuesta.ok) throw new Error(`${URL_DATOS} respondió HTTP ${respuesta.status}`);
const datos = await respuesta.json();

// Comprobaciones mínimas: si fallan, no se sobrescribe la copia buena.
// (La validación completa, campo a campo, la hace el build en src/lib/convocatorias.ts).
if (!Array.isArray(datos.topics) || datos.topics.length === 0) {
  throw new Error('La respuesta no trae convocatorias (topics vacío o ausente).');
}
const problemas = datos.topics.filter((t) => !t?.codigo || !FECHA.test(t?.cierre ?? ''));
if (problemas.length) {
  throw new Error(`${problemas.length} convocatorias sin código o sin fecha de cierre AAAA-MM-DD; p. ej. ${JSON.stringify(problemas[0]).slice(0, 200)}`);
}
const codigos = new Set(datos.topics.map((t) => t.codigo));
if (codigos.size !== datos.topics.length) throw new Error('Hay códigos de convocatoria repetidos.');

// Orden estable para que el diff del PR muestre solo lo que cambia de verdad.
const topics = [...datos.topics].sort((a, b) => a.codigo.localeCompare(b.codigo));
const nuevo = { source: datos.source, updated: datos.updated, total: topics.length, topics };

let anterior = null;
try {
  anterior = JSON.parse(await readFile(SALIDA, 'utf8'));
} catch {
  // Primera descarga: no hay copia anterior.
}
if (anterior && JSON.stringify(anterior.topics) === JSON.stringify(topics)) {
  console.log(`Sin cambios: ${topics.length} convocatorias, igual que la copia del ${anterior.updated}.`);
} else {
  await mkdir(path.dirname(SALIDA), { recursive: true });
  await writeFile(SALIDA, `${JSON.stringify(nuevo, null, 2)}\n`);
  const antes = new Set((anterior?.topics ?? []).map((t) => t.codigo));
  const altas = topics.filter((t) => !antes.has(t.codigo)).length;
  const bajas = [...antes].filter((c) => !codigos.has(c)).length;
  console.log(`${topics.length} convocatorias (datos del ${datos.updated}) → ${path.relative(process.cwd(), SALIDA)}`);
  if (anterior) console.log(`  ${altas} nuevas, ${bajas} retiradas respecto a la copia anterior.`);
}
