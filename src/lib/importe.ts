// Importes en formato español a partir del texto que trae el servicio de datos.
// Solo cambia la notación; las cifras son exactamente las mismas (se trabaja con el texto,
// sin pasar por números con decimales, para no introducir redondeos):
//
//   «€22.4M (total topic)»       → «22,4 M€ en total»
//   «≈ €6.8M / proyecto»         → «≈ 6,8 M€ por proyecto»
//   «≈ €2M–€4M / proyecto»       → «≈ 2–4 M€ por proyecto»
//   «€300k (total topic)»        → «300 000 € en total»
//   «≈ €500k–€1M / proyecto»     → «≈ 500 000 € – 1 M€ por proyecto»
//
// Criterio RAE: coma decimal, símbolo detrás de la cifra y separado por un espacio, y las
// cifras de cinco o más dígitos agrupadas de tres en tres con espacios (1884 / 300 000).
// Los espacios son de no separación para que la cifra no se parta al final de una línea.
//
// Si el texto no tiene uno de estos formatos, devuelve null: quien llama muestra el texto
// original (y `npm run revisar` lo señala) en vez de arriesgarse a mostrar una cifra mal.

const NBSP = ' ';

const CANTIDAD = String.raw`€(\d+(?:\.\d+)?)([Mk])`;
// Formato estricto a propósito: cualquier variación (otra unidad, otra etiqueta) se muestra
// tal cual y se revisa, en lugar de interpretarla.
const FORMATO = new RegExp(
  String.raw`^(≈\s*)?${CANTIDAD}(?:\s*[–-]\s*${CANTIDAD})?\s*(\(total topic\)|/\s*proyecto)$`,
);

type Unidad = 'M' | 'k';

/** Agrupa la parte entera: sin separador hasta cuatro cifras; con cinco o más, de tres en tres. */
function agrupar(entero: string): string {
  return entero.length <= 4 ? entero : entero.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** «22.4» (M) → «22,4» · «300» (k) → «300 000» · «2.5» (k) → «2500». */
function cifra(texto: string, unidad: Unidad): string {
  let [entero, decimales = ''] = texto.split('.');
  if (unidad === 'k') {
    // Miles → euros: la coma decimal se desplaza tres posiciones a la derecha.
    entero = (entero + decimales.padEnd(3, '0').slice(0, 3)).replace(/^0+(?=\d)/, '');
    decimales = decimales.slice(3);
  }
  return agrupar(entero) + (decimales ? `,${decimales}` : '');
}

const simbolo = (unidad: Unidad) => (unidad === 'M' ? 'M€' : '€');

/** Importe con notación española, o null si el texto no tiene un formato conocido. */
export function importeEs(texto: string | null | undefined): string | null {
  const m = texto?.trim().match(FORMATO);
  if (!m) return null;
  const [, aprox, cifra1, u1, cifra2, u2, alcance] = m;
  const unidad1 = u1 as Unidad;
  const unidad2 = u2 as Unidad;

  let importe: string;
  if (!cifra2) {
    importe = `${cifra(cifra1, unidad1)}${NBSP}${simbolo(unidad1)}`;
  } else if (unidad1 === unidad2) {
    // Misma unidad en los dos extremos: «2–4 M€».
    importe = `${cifra(cifra1, unidad1)}–${cifra(cifra2, unidad2)}${NBSP}${simbolo(unidad2)}`;
  } else {
    // Unidades distintas: cada extremo con la suya, «500 000 € – 1 M€».
    importe = `${cifra(cifra1, unidad1)}${NBSP}${simbolo(unidad1)}${NBSP}– ${cifra(cifra2, unidad2)}${NBSP}${simbolo(unidad2)}`;
  }

  const total = alcance.startsWith('(');
  return `${aprox ? `≈${NBSP}` : ''}${importe} ${total ? 'en total' : 'por proyecto'}`;
}
