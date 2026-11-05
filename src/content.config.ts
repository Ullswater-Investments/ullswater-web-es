import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Páginas de la web española (adaptadas a partir de la web inglesa).
const paginas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/paginas' }),
  schema: z.object({
    titulo: z.string(),
    descripcion: z.string(),
    // Página de la web inglesa de la que procede (fuente única).
    origen: z.string().url(),
    orden: z.number().default(100),
    actualizado: z.coerce.date(),
    borrador: z.boolean().default(false),
    // Si se indica, debajo del texto se muestra el listado de convocatorias que cierran
    // ese año, generado a partir de data/convocatorias.json.
    listadoConvocatorias: z.object({ anioCierre: z.number().int() }).optional(),
  }),
});

// Noticias de financiación UE generadas por agentes (una landing por noticia).
const noticias = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/noticias' }),
  schema: z.object({
    titulo: z.string(),
    resumen: z.string(),
    fecha: z.coerce.date(),
    programa: z.string(),
    fuente: z.string().url(),
    borrador: z.boolean().default(false),
  }),
});

// Páginas fuente traducidas. En producción vivirán en el repo de fuentes.
// (subdominio fuentes.), aquí están solo para probar la plantilla.
const fuentes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/fuentes' }),
  schema: z.object({
    titulo: z.string(),
    tituloOriginal: z.string(),
    organismo: z.string(),
    urlOriginal: z.string().url(),
    // Enlace donde se presenta la solicitud (botón destacado).
    urlSolicitud: z.string().url().optional(),
    fechaCopia: z.coerce.date(),
    // reutilizable: copia traducida (p. ej. CC BY 4.0 de la Comisión)
    // resumen: solo resumen propio + cita (fuentes que no permiten reutilizar)
    tratamiento: z.enum(['reutilizable', 'resumen']),
    licencia: z.string().optional(),
    // Datos críticos copiados tal cual del original (los revisa el Revisor).
    datos: z
      .array(z.object({ etiqueta: z.string(), valor: z.string() }))
      .default([]),
    borrador: z.boolean().default(false),
  }),
});

export const collections = { paginas, noticias, fuentes };
