#!/usr/bin/env node
// Revisión automática de los datos de convocatorias antes de publicar (parte del agente Revisor).
//
// Informa, en Markdown, de lo que una persona debe mirar en el Pull Request:
//  - convocatorias sin título en español (la web muestra el oficial, en inglés);
//  - traducciones desfasadas: el portal cambió el título oficial desde que se tradujo;
//  - importes con un formato que la web no sabe pasar a notación española (la ficha remite a la
//    oficial en lugar de mostrar una cifra que se podría leer mal).
// No modifica nada y siempre termina bien: es un informe, no un bloqueo.
//
// Uso:
//   npm run revisar                          → informe completo por pantalla
//   node scripts/revisar.mjs --informe <f>   → además lo guarda en <f>, con las tablas recortadas
//                                              para que quepa en el cuerpo del PR del Vigía
import { readFileSync, writeFileSync } from 'node:fs';
import { importeEs } from '../src/lib/importe.ts';

const leer = (ruta) => JSON.parse(readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8'));
const datos = leer('data/convocatorias.json');
const { titulos } = leer('data/titulos-es.json');

const normalizar = (s) => s.replace(/\s+/g, ' ').trim();
const celda = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const MAX_FILAS_PR = 60; // el cuerpo de un PR admite unos 65 000 caracteres

const convocatorias = [...datos.topics].sort((a, b) => a.cierre.localeCompare(b.cierre) || a.codigo.localeCompare(b.codigo));
const sinTraducir = [];
const desfasadas = [];
const importesDesconocidos = [];
for (const c of convocatorias) {
  const t = titulos[c.codigo];
  if (!t || !t.es?.trim()) sinTraducir.push(c);
  else if (normalizar(t.en ?? '') !== normalizar(c.titulo)) desfasadas.push({ c, t });
  const importe = c.presupuesto?.es?.trim();
  if (importe && importeEs(importe) === null) importesDesconocidos.push(c);
}
const codigos = new Set(convocatorias.map((c) => c.codigo));
const sobrantes = Object.keys(titulos).filter((codigo) => !codigos.has(codigo));
const conImporte = convocatorias.filter((c) => c.presupuesto?.es?.trim()).length;

function generar(maxFilas) {
  const lineas = [];
  const tabla = (cabecera, filas) => {
    lineas.push(`| ${cabecera.join(' | ')} |`, `|${cabecera.map(() => '---').join('|')}|`);
    for (const fila of filas.slice(0, maxFilas)) lineas.push(`| ${fila.map(celda).join(' | ')} |`);
    if (filas.length > maxFilas) lineas.push('', `… y ${filas.length - maxFilas} más (lista completa: \`npm run revisar\`).`);
    lineas.push('');
  };

  lineas.push(
    '## Revisión automática',
    '',
    `- **Títulos:** ${convocatorias.length} convocatorias; ${convocatorias.length - sinTraducir.length - desfasadas.length} con título en español, ${sinTraducir.length} sin traducir y ${desfasadas.length} con la traducción desfasada.`,
    `- **Importes:** ${conImporte - importesDesconocidos.length} de ${conImporte} en formato español; ${importesDesconocidos.length} con un formato desconocido (la ficha muestra «Ver ficha oficial»).`,
    '',
  );
  if (sinTraducir.length) {
    lineas.push(
      '### Títulos sin traducir',
      '',
      'Se muestran en inglés hasta que se añada su traducción a `data/titulos-es.json`.',
      '',
    );
    tabla(['Cierre', 'Código', 'Título oficial'], sinTraducir.map((c) => [c.cierre, `\`${c.codigo}\``, c.titulo]));
  }
  if (desfasadas.length) {
    lineas.push(
      '### Traducciones desfasadas',
      '',
      'El portal ha cambiado el título oficial. Hasta que se revise la traducción, la web muestra el oficial.',
      '',
    );
    tabla(
      ['Código', 'Título oficial ahora', 'Título que se tradujo', 'Traducción'],
      desfasadas.map(({ c, t }) => [`\`${c.codigo}\``, c.titulo, t.en, t.es]),
    );
  }
  if (importesDesconocidos.length) {
    lineas.push(
      '### Importes con formato desconocido',
      '',
      'La web no sabe pasarlos a notación española y la ficha muestra «Ver ficha oficial». Hay que ampliar `src/lib/importe.ts`.',
      '',
    );
    tabla(['Código', 'Importe en los datos'], importesDesconocidos.map((c) => [`\`${c.codigo}\``, c.presupuesto.es]));
  }
  if (sobrantes.length) {
    lineas.push(
      sobrantes.length === 1
        ? 'Hay 1 traducción de una convocatoria que ya no está en los datos (cerrada o retirada). No se muestra; se conserva por si vuelve a aparecer.'
        : `Hay ${sobrantes.length} traducciones de convocatorias que ya no están en los datos (cerradas o retiradas). No se muestran; se conservan por si vuelven a aparecer.`,
      '',
    );
  }
  if (!sinTraducir.length && !desfasadas.length && !importesDesconocidos.length) {
    lineas.push('Nada pendiente: todos los títulos tienen traducción y todos los importes están en formato español.', '');
  }

  return lineas.join('\n');
}

const i = process.argv.indexOf('--informe');
const ruta = i === -1 ? null : process.argv[i + 1];
if (i !== -1 && !ruta) {
  console.error('Falta la ruta del fichero después de --informe');
  process.exit(2);
}
process.stdout.write(generar(Infinity));
if (ruta) writeFileSync(ruta, generar(MAX_FILAS_PR));
