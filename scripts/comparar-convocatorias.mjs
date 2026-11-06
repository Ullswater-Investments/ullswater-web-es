#!/usr/bin/env node
// Compara los datos de convocatorias recién descargados (data/convocatorias.json) con los que
// están publicados (la versión del último commit) y decide si el Vigía puede publicarlos solo.
//
// Se publican solos si no hay nada raro. Se paran y los revisa una persona si:
//  - el número de convocatorias cae más de un 20 % de golpe, o
//  - desaparecen más de 10 convocatorias cuyo plazo todavía no ha vencido.
// Que una convocatoria desaparezca el día de su cierre es lo normal: el servicio de datos las
// retira ese día.
//
// Uso (lo llama .github/workflows/inventario.yml):
//   node scripts/comparar-convocatorias.mjs [--resumen <f.md>] [--commit <f.txt>] [--salida <f>]
//   --resumen  resumen de los cambios en Markdown (resumen del job, aviso de revisión)
//   --commit   mensaje del commit de publicación
//   --salida   fichero de salidas de GitHub Actions: añade «anomalia=true|false»
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const CAIDA_MAXIMA = 0.2;
const MAX_RETIRADAS_ANTES_DE_CIERRE = 10;

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? null : process.argv[i + 1];
};

const ruta = new URL('../data/convocatorias.json', import.meta.url);
const nuevo = JSON.parse(readFileSync(ruta, 'utf8'));
let publicado = null;
try {
  publicado = JSON.parse(execFileSync('git', ['show', 'HEAD:data/convocatorias.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch {
  // Sin versión publicada (primer commit): nada con que comparar.
}

// Hoy en la España peninsular, AAAA-MM-DD (la misma regla que usa la web para ocultar las vencidas).
const partes = Object.fromEntries(
  new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
    .map((p) => [p.type, p.value]),
);
const hoy = `${partes.year}-${partes.month}-${partes.day}`;

const antes = new Map((publicado?.topics ?? []).map((t) => [t.codigo, t]));
const ahora = new Map(nuevo.topics.map((t) => [t.codigo, t]));
const nuevas = [...ahora.values()].filter((t) => !antes.has(t.codigo));
const retiradas = [...antes.values()].filter((t) => !ahora.has(t.codigo));
const retiradasAntesDeCierre = retiradas.filter((t) => t.cierre > hoy);
const comunes = [...ahora.values()].filter((t) => antes.has(t.codigo));
const cambian = (campo) => comunes.filter((t) => JSON.stringify(t[campo]) !== JSON.stringify(antes.get(t.codigo)[campo]));
const plazos = cambian('cierre');
const importes = cambian('presupuesto');
const titulos = cambian('titulo');

const motivos = [];
if (publicado && nuevo.topics.length < antes.size * (1 - CAIDA_MAXIMA)) {
  motivos.push(`el número de convocatorias cae de ${antes.size} a ${nuevo.topics.length} (más de un ${CAIDA_MAXIMA * 100} %)`);
}
if (retiradasAntesDeCierre.length > MAX_RETIRADAS_ANTES_DE_CIERRE) {
  motivos.push(`desaparecen ${retiradasAntesDeCierre.length} convocatorias cuyo plazo aún no ha vencido`);
}
const anomalia = motivos.length > 0;

// «1 nueva», «2 nuevas»; «1 cambio», «2 cambios».
const n = (cantidad, singular, plural) => `${cantidad} ${cantidad === 1 ? singular : plural}`;
const cifras = () =>
  `${n(nuevas.length, 'nueva', 'nuevas')}, ${n(retiradas.length, 'retirada', 'retiradas')} (${retiradasAntesDeCierre.length} antes de su cierre), ` +
  `${n(plazos.length, 'cambio', 'cambios')} de plazo, ${importes.length} de importe y ${titulos.length} de título`;

const lista = (titulo, items, detalle) => {
  if (!items.length) return [];
  const filas = items.slice(0, 40).map((t) => `- \`${t.codigo}\` ${detalle(t)}`);
  if (items.length > 40) filas.push(`- … y ${items.length - 40} más`);
  return [`### ${titulo} (${items.length})`, '', ...filas, ''];
};
const importe = (p) => p?.es ?? 'sin importe';
const resumen = [
  '## Cambios en las convocatorias',
  '',
  publicado
    ? `${antes.size} → ${nuevo.topics.length} convocatorias: ${cifras()}.`
    : `${nuevo.topics.length} convocatorias (primera copia).`,
  '',
  anomalia
    ? `**No se publica automáticamente:** ${motivos.join('; ')}. Revisarlo antes de publicar.`
    : 'Sin anomalías: se publican automáticamente.',
  '',
  ...lista('Nuevas', nuevas, (t) => `${t.titulo} (cierre: ${t.cierre})`),
  ...lista('Retiradas antes de su cierre', retiradasAntesDeCierre, (t) => `${t.titulo} (cierre: ${t.cierre})`),
  ...lista('Cambios de plazo', plazos, (t) => `${antes.get(t.codigo).cierre} → ${t.cierre}`),
  ...lista('Cambios de importe', importes, (t) => `${importe(antes.get(t.codigo).presupuesto)} → ${importe(t.presupuesto)}`),
  ...lista('Cambios de título (su traducción queda pendiente de revisar)', titulos, (t) => `${antes.get(t.codigo).titulo} → ${t.titulo}`),
].join('\n');

const fecha = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
const mensaje = [
  `Vigía: datos del ${fecha}`,
  '',
  publicado
    ? `Convocatorias: ${antes.size} → ${nuevo.topics.length} (${cifras()}).`
    : `Convocatorias: ${nuevo.topics.length}.`,
  'Inventario de la web inglesa actualizado. Publicado automáticamente tras pasar las comprobaciones.',
  '',
].join('\n');

process.stdout.write(`${resumen}\n`);
if (arg('--resumen')) writeFileSync(arg('--resumen'), `${resumen}\n`);
if (arg('--commit')) writeFileSync(arg('--commit'), mensaje);
if (arg('--salida')) appendFileSync(arg('--salida'), `anomalia=${anomalia}\n`);
