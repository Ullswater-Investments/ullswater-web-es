// Convocatorias europeas: se leen de data/convocatorias.json, la copia que descarga
// `npm run convocatorias` y que solo cambia mediante Pull Request (aprobación humana).
//
// Los datos se validan al compilar: si el formato cambia o falta un campo, el build falla
// en lugar de publicar una página con datos incompletos.
//
// Regla de exactitud: plazos, importes y códigos salen de los datos sin cambiar ninguna cifra;
// los importes solo cambian de notación (importe.ts). Los títulos se muestran en español
// (data/titulos-es.json, traducción revisada) junto al título oficial en inglés.
import { z } from 'astro/zod';
import datos from '../../data/convocatorias.json';
import titulos from '../../data/titulos-es.json';
import { hoyPeninsular } from './fecha';
import { importeEs } from './importe';

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha AAAA-MM-DD');

const esquemaConvocatoria = z.object({
  codigo: z.string().min(1),
  // Título oficial, en inglés (el portal de la Comisión solo lo publica en inglés).
  titulo: z.string().min(1),
  programa: z.string().min(1),
  estado: z.enum(['Abierta', 'Próxima']),
  apertura: fechaIso.nullable(),
  cierre: fechaIso,
  presupuesto: z.object({ es: z.string().nullable(), en: z.string().nullable() }).nullable(),
  // Ficha oficial en el portal Funding & Tenders (donde se presenta la solicitud).
  enlace: z.string().url(),
});

const esquemaDatos = z.object({
  source: z.string(),
  updated: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'fecha de actualización no válida'),
  topics: z.array(esquemaConvocatoria).min(1),
});

// Traducciones de los títulos: código → { en: título oficial que se tradujo, es: traducción }.
const esquemaTitulos = z.object({
  descripcion: z.string().optional(),
  titulos: z.record(z.string(), z.object({ en: z.string().trim().min(1), es: z.string().trim().min(1) })),
});

export type Convocatoria = z.infer<typeof esquemaConvocatoria>;

const validados = esquemaDatos.parse(datos);
const traducciones = esquemaTitulos.parse(titulos).titulos;

/** Momento en que el servicio de origen actualizó los datos. */
export const datosActualizados = new Date(validados.updated);
export const convocatorias: Convocatoria[] = validados.topics;

const porCierre = (a: Convocatoria, b: Convocatoria) =>
  a.cierre.localeCompare(b.cierre) || a.codigo.localeCompare(b.codigo);

/** Convocatorias cuyo plazo vence en ese año y aún no ha pasado, por fecha de cierre. */
export function queCierranEn(anio: number): Convocatoria[] {
  const hoy = hoyPeninsular();
  return convocatorias.filter((c) => c.cierre.startsWith(`${anio}-`) && c.cierre >= hoy).sort(porCierre);
}

/** Las `n` convocatorias con el plazo más cercano que aún no ha pasado. */
export function proximosCierres(n: number): Convocatoria[] {
  const hoy = hoyPeninsular();
  return convocatorias.filter((c) => c.cierre >= hoy).sort(porCierre).slice(0, n);
}

/**
 * Estado a día de hoy. La web se recompila cada noche con los datos ya aprobados: una
 * convocatoria «Próxima» cuya fecha oficial de apertura ya ha llegado se muestra como abierta.
 */
export function estadoHoy(c: Convocatoria): Convocatoria['estado'] {
  return c.estado === 'Próxima' && c.apertura !== null && c.apertura <= hoyPeninsular() ? 'Abierta' : c.estado;
}

// Nombre oficial en español de cada valor del campo «programa».
const PROGRAMAS: Record<string, string> = {
  he: 'Horizonte Europa',
  eic: 'Consejo Europeo de Innovación (EIC)',
  digital: 'Programa Europa Digital',
  edf: 'Fondo Europeo de Defensa',
  cef: 'Mecanismo «Conectar Europa»',
  erasmus: 'Erasmus+',
  otros: 'Otros programas de la UE',
};
export const nombrePrograma = (programa: string) => PROGRAMAS[programa] ?? programa;

const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Título en español, si hay traducción del título oficial vigente. Devuelve null si no la hay
 * o si el portal ha cambiado el título desde que se tradujo: entonces se muestra el oficial.
 */
export function tituloEs(c: Convocatoria): string | null {
  const t = traducciones[c.codigo];
  return t && normalizar(t.en) === normalizar(c.titulo) ? t.es : null;
}

/**
 * Importe en formato español, con las mismas cifras (detalles en importe.ts):
 * «€21M (total topic)» → «21 M€ en total» · «≈ €6.8M / proyecto» → «≈ 6,8 M€ por proyecto».
 * Devuelve null si los datos no traen importe o si su formato no es conocido: entonces la
 * ficha remite a la oficial. Mostrar una cifra en notación inglesa en una página en español
 * se prestaría a error («€1,500M» se leería como 1,5 millones); `npm run revisar` lo señala.
 */
export function financiacion(c: Convocatoria): string | null {
  return importeEs(c.presupuesto?.es);
}
