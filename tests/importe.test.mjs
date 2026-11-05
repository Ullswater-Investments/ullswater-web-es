// Pruebas del formato español de los importes (src/lib/importe.ts).
// Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importeEs } from '../src/lib/importe.ts';

const NBSP = ' ';
const sinNbsp = (s) => s?.replaceAll(NBSP, ' ');

test('convierte cada formato del servicio de datos', () => {
  const casos = [
    ['€40M (total topic)', '40 M€ en total'],
    ['€7.2M (total topic)', '7,2 M€ en total'],
    ['€1884.1M (total topic)', '1884,1 M€ en total'],
    ['€1938M (total topic)', '1938 M€ en total'],
    ['€300k (total topic)', '300 000 € en total'],
    ['≈ €6.8M / proyecto', '≈ 6,8 M€ por proyecto'],
    ['≈ €200k / proyecto', '≈ 200 000 € por proyecto'],
    ['≈ €2M–€4M / proyecto', '≈ 2–4 M€ por proyecto'],
    ['≈ €1.5M–€2.5M / proyecto', '≈ 1,5–2,5 M€ por proyecto'],
    ['≈ €20k–€50k / proyecto', '≈ 20 000–50 000 € por proyecto'],
    ['≈ €500k–€1M / proyecto', '≈ 500 000 € – 1 M€ por proyecto'],
    ['€2.5k (total topic)', '2500 € en total'],
    ['€0.5M (total topic)', '0,5 M€ en total'],
    ['  €21M (total topic) ', '21 M€ en total'],
  ];
  for (const [entrada, esperado] of casos) {
    assert.equal(sinNbsp(importeEs(entrada)), esperado, entrada);
  }
});

test('los espacios de dentro del importe no se parten al final de línea', () => {
  assert.equal(importeEs('≈ €500k–€1M / proyecto'), `≈${NBSP}500${NBSP}000${NBSP}€${NBSP}– 1${NBSP}M€ por proyecto`);
  assert.equal(importeEs('€22.4M (total topic)'), `22,4${NBSP}M€ en total`);
});

test('devuelve null si el formato no es conocido (se mostrará el texto original)', () => {
  for (const entrada of [null, undefined, '', '€5M', 'EUR 5M (total topic)', '€5m (total topic)', '≈ €5M / project', '€5B (total topic)', '€5,5M (total topic)']) {
    assert.equal(importeEs(entrada), null, String(entrada));
  }
});

// --- Comprobación con los datos reales -------------------------------------------------
// Para cada convocatoria, las cantidades del importe en español deben ser exactamente las
// del original (se comparan en céntimos, con enteros, sin redondeos).

/** «22.4» + 6 → 2240000000n (céntimos) */
function aCentimos(entero, decimales, exponente) {
  const escala = exponente + 2;
  assert.ok(decimales.length <= escala, `demasiados decimales: ${entero}.${decimales}`);
  return BigInt(entero + decimales.padEnd(escala, '0'));
}

function leerOrigen(texto) {
  const cantidades = [...texto.matchAll(/€(\d+)(?:\.(\d+))?([Mk])/g)].map(([, e, d = '', u]) =>
    aCentimos(e, d, u === 'M' ? 6 : 3),
  );
  const alcance = texto.includes('(total topic)') ? 'total' : texto.includes('/ proyecto') ? 'proyecto' : null;
  return { aprox: texto.trim().startsWith('≈'), alcance, cantidades };
}

const CIFRA = String.raw`(\d{1,3}(?: \d{3})+|\d{1,4})(?:,(\d+))?`;
function leerSalida(texto) {
  const aprox = texto.startsWith(`≈${NBSP}`);
  const alcance = texto.endsWith(' en total') ? 'total' : texto.endsWith(' por proyecto') ? 'proyecto' : null;
  const cuerpo = texto.replace(/^≈ /, '').replace(/ (en total|por proyecto)$/, '');
  let partes;
  let m;
  if ((m = cuerpo.match(new RegExp(`^${CIFRA} (M€|€) – ${CIFRA} (M€|€)$`)))) {
    partes = [[m[1], m[2], m[3]], [m[4], m[5], m[6]]];
  } else if ((m = cuerpo.match(new RegExp(`^${CIFRA}–${CIFRA} (M€|€)$`)))) {
    partes = [[m[1], m[2], m[5]], [m[3], m[4], m[5]]];
  } else if ((m = cuerpo.match(new RegExp(`^${CIFRA} (M€|€)$`)))) {
    partes = [[m[1], m[2], m[3]]];
  } else {
    assert.fail(`salida con un formato inesperado: «${texto}»`);
  }
  const cantidades = partes.map(([entero, decimales = '', simbolo]) => {
    const digitos = entero.replaceAll(NBSP, '');
    // RAE: hasta cuatro cifras sin separador; con cinco o más, agrupadas de tres en tres.
    assert.equal(digitos.length >= 5, entero.includes(NBSP), `agrupación incorrecta en «${texto}»`);
    return aCentimos(digitos, decimales, simbolo === 'M€' ? 6 : 0);
  });
  return { aprox, alcance, cantidades };
}

test('con los datos reales, cada importe en español vale exactamente lo mismo que el original', (t) => {
  const datos = JSON.parse(readFileSync(new URL('../data/convocatorias.json', import.meta.url), 'utf8'));
  let convertidos = 0;
  const desconocidos = [];
  for (const c of datos.topics) {
    const original = c.presupuesto?.es;
    if (!original) continue;
    const es = importeEs(original);
    if (es === null) {
      desconocidos.push(`${c.codigo}: ${original}`);
      continue;
    }
    assert.deepEqual(leerSalida(es), leerOrigen(original), `${c.codigo}: «${original}» → «${es}»`);
    convertidos++;
  }
  t.diagnostic(`${convertidos} importes convertidos y comprobados; ${desconocidos.length} con formato desconocido (la ficha muestra «Ver ficha oficial»)`);
  for (const d of desconocidos) t.diagnostic(`formato desconocido: ${d}`);
  assert.ok(convertidos > 0, 'no se ha convertido ningún importe');
});
