import { defineConfig } from 'astro/config';

// SITE y BASE se pueden sobrescribir desde GitHub Actions (variables del repo).
// - Pruebas (sin dominio): SITE=https://ullswater-investments.github.io  BASE=/ullswater-web-es
//   Con cualquier SITE que no sea el dominio oficial, las páginas llevan «noindex».
// - Producción (con dominio en Cloudflare): SITE=https://es.ullswaterinvestments.com  BASE=/
export default defineConfig({
  site: process.env.SITE ?? 'https://es.ullswaterinvestments.com',
  base: process.env.BASE ?? '/',
  trailingSlash: 'ignore',
});
