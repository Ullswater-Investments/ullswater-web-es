# Ullswater Investments · Web en español (piloto)

Sitio estático con [Astro](https://astro.build), publicado en GitHub Pages.
Contexto completo del proyecto en `CLAUDE.md`.

- **Repo:** https://github.com/Ullswater-Investments/ullswater-web-es
- **Web de pruebas:** https://ullswater-investments.github.io/ullswater-web-es/ (con «noindex»: los buscadores no la indexan)

## Arrancar en local

```bash
npm install
npm run dev                    # http://localhost:4321 (se queda en marcha; parar con: npx astro dev stop)
npm run build                  # genera dist/
npm test                       # pruebas (los importes en español tienen las mismas cifras que el original)
npm run convocatorias          # descarga los datos de convocatorias → data/convocatorias.json
npm run revisar                # qué falta por revisar: títulos sin traducir, importes con formato raro
npm run inventario             # recorre la web inglesa → data/inventario/ (resumen.md, enlaces.csv…)
npm run inventario:verificar   # lo mismo, visitando además cada enlace externo (~1 min)
```

Requiere Node 22.23.4 o superior (lo exige Astro 7.4; en local y en GitHub Actions se usa Node 24). Sin dependencias aparte de Astro.

## Dónde va cada cosa

| Carpeta | Qué contiene |
|---|---|
| `src/content/paginas/` | Páginas de la web española. Cada `.md` es una página (la subcarpeta forma la URL). Con `listadoConvocatorias: { anioCierre: 2026 }` en el frontmatter, la página añade el listado de convocatorias. |
| `src/content/noticias/` | Noticias. Cada `.md` genera su landing en `/noticias/<nombre>/`. |
| `src/content/fuentes/` | Páginas fuente traducidas (aquí solo para probar la plantilla; irán al repo de `fuentes.`). |
| `src/content.config.ts` | Campos obligatorios de cada tipo de contenido. Si un `.md` no los cumple, el build falla. |
| `src/pages/index.astro` | Portada (textos adaptados de la portada inglesa + próximos cierres). |
| `src/layouts/Base.astro` | Cabecera, menú, pie y etiquetas SEO (canonical, hreflang, Open Graph). |
| `src/components/` | `AvisoFuente` (aviso obligatorio de cada página fuente), `TarjetaConvocatoria` y `ListadoConvocatorias`. |
| `src/lib/convocatorias.ts` | Lee y valida `data/convocatorias.json`; filtros y nombres de programa en español. |
| `src/lib/importe.ts` | Importes en formato español (22,4 M€, 300 000 €) sin tocar las cifras. Lo comprueba `tests/importe.test.mjs` con todos los datos. |
| `src/lib/fecha.ts` | Formato de fecha español. Usarlo siempre: evita que las fechas salgan un día antes según la zona horaria. |
| `src/assets/fonts/inter/` | Letra Inter alojada en la propia web (licencia OFL), sin conexión a Google Fonts. |
| `data/convocatorias.json` | Copia de los datos de convocatorias. La web se genera desde aquí; solo cambia mediante PR. |
| `data/titulos-es.json` | Títulos de las convocatorias en español, por código, con el título oficial que se tradujo. Si falta uno o el portal cambia el original, la web muestra el oficial en inglés. |
| `data/glosario-titulos.json` | Glosario (246 términos) y normas de estilo con los que se tradujeron los títulos: terminología oficial de la UE en español. Usarlo para traducir los nuevos. |
| `data/inventario/` | Último inventario de la web inglesa: `resumen.md`, `enlaces.csv`, `paginas.csv` y sus `.json`. |
| `scripts/convocatorias.mjs` | Descarga los datos de convocatorias (no toca el fichero si no han cambiado). |
| `scripts/revisar.mjs` | Revisión automática para el PR: títulos sin traducir o desfasados e importes con formato desconocido. |
| `scripts/inventario.mjs` | Inventario de páginas y enlaces externos de la web inglesa, incluidos los bloques «Insertar código» y los datos que cargan. |
| `.github/workflows/deploy.yml` | Pruebas, build y publicación en GitHub Pages en cada push a `main`, y cada noche con los mismos datos (retira las convocatorias vencidas). |
| `.github/workflows/inventario.yml` | Vigía diario (días laborables): inventario + convocatorias + pruebas + build; si cambia algo, abre un PR con la revisión automática. |

Inicio y Convocatorias 2026 tienen contenido real. La noticia y la ficha de fuente siguen siendo ejemplos de plantilla, marcados como tales.

## Convocatorias nuevas: el título en español

Cuando el Vigía trae convocatorias nuevas, su PR (o su issue) lista las que no tienen título en
español; hasta que se traducen, la web muestra el título oficial en inglés. Para traducirlas,
añadirlas a `data/titulos-es.json` (código → `en`: título oficial tal cual, `es`: traducción) en
un **PR aparte contra `main`**, a mano o pidiéndoselo a Claude Code, siguiendo
`data/glosario-titulos.json`. No en la rama del Vigía: la
rehace cada día, y si una persona la edita deja de actualizarla hasta que se hace merge.
Cuando se apruebe la API de IA, lo hará el Adaptador ES.

## Configuración del repo en GitHub (ya aplicada)

El repo es público porque la organización está en el plan gratuito de GitHub, donde Pages solo
funciona con repos públicos. No contiene claves.

1. **Settings → Pages → Source:** «GitHub Actions».
2. **Settings → Secrets and variables → Actions → Variables:**
   - `SITE` = `https://ullswater-investments.github.io`
   - `BASE` = `/ullswater-web-es`
3. **Pendiente (lo tiene que hacer un propietario de la organización):** en los ajustes de la organización, **Actions → General → Workflow permissions**, marcar «Allow GitHub Actions to create and approve pull requests», y después lo mismo en los ajustes de este repo. Mientras tanto, el Vigía deja los cambios en la rama `vigia/actualizacion` y abre un issue (etiqueta `vigia`) con el enlace para crear el PR con un clic.
4. Cada push a `main` publica la web; también se puede lanzar «Publicar en GitHub Pages» a mano desde la pestaña Actions.

## Cuando se conecte el dominio (pendiente de aprobación)

1. En Cloudflare: registro `CNAME es → <usuario-u-org>.github.io`.
2. En GitHub: Settings → Pages → Custom domain: `es.ullswaterinvestments.com`, y activar «Enforce HTTPS».
3. Cambiar las variables: `SITE = https://es.ullswaterinvestments.com`, `BASE = /`.
