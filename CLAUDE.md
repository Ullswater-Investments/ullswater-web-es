# Proyecto: Web de Ullswater Investments en español

## Contexto

Ullswater Investments S.L. (Madrid) es una consultora de financiación europea (Horizon Europe, EIC, Digital Europe, CDTI, ENISA, Red.es…).

- **Web actual (fuente única):** https://www.ullswaterinvestments.com — hecha con **Google Sites**, totalmente en inglés. Sus convocatorias, noticias y eventos ya se actualizan con agentes.
- **Ya existen** landing pages de noticias y eventos hechas con agentes + **GitHub Pages** + **Cloudflare** (p. ej. `events.ullswaterinvestments.com`). Modelo: el agente prepara un borrador, una persona responde «publica» y se pone en línea.
  - **Noticias:** repo público [`emiliomulet-commits/ullswater-news`](https://github.com/emiliomulet-commits/ullswater-news) (cuenta personal de Emilio). Generador en Python que escribe la web en `docs/`; GitHub Pages publica `main:/docs` con el dominio `news.ullswaterinvestments.com`. Un workflow diario descarga las convocatorias del mismo Worker, regenera y publica **sin PR**; las noticias se publican tras el OK de Emilio. Tiene una página por convocatoria (`/calls/<código>/`) y conserva las cerradas.
  - **Eventos:** no se ha localizado el repo (Cloudflare hace de proxy y no deja ver el origen).
- La propuesta viene del Socio Director (documento interno «La web de Ullswater en español», nov. 2026).

## Objetivo

1. **Web nueva en español** en `es.ullswaterinvestments.com`. No es una traducción literal: se redacta de nuevo para el lector español (tono propio, SEO en español, formato de fecha español).
2. **Páginas fuente traducidas** en `fuentes.ullswaterinvestments.com/<fuente>/<pagina>`: cada enlace externo de la web inglesa se convierte en una página propia con el contenido de la fuente traducido al español (opción A del documento: un único subdominio para todas las fuentes).
3. Todo se construye y mantiene con **agentes**, alojado en **GitHub Pages** (requisito obligatorio) y servido con **Cloudflare** (solo DNS/CDN/HTTPS).
4. **Ningún agente publica sin aprobación humana.**

## Los cinco agentes

| Agente | Qué hace | Implementación prevista |
|---|---|---|
| 1 · Vigía | Compara la web inglesa con la última versión y detecta páginas nuevas/cambiadas | Workflow con cron en GitHub Actions |
| 2 · Adaptador ES | Redacta en español el contenido nuevo o cambiado | Script que llama a la API de IA y escribe `.md` |
| 3 · Espejo de fuentes | Copia, traduce y genera las páginas fuente; vigila cambios en la fuente | Script en un segundo repo (`fuentes.`) |
| 4 · Revisor | Revisa cifras, fechas, enlaces rotos, licencias y calidad del español | Validaciones automáticas + revisión en el PR |
| 5 · Publicador | Publica lo aprobado | Merge del Pull Request → build y deploy a GitHub Pages |

El «publica» se implementará como **Pull Request**: los agentes abren un PR, una persona lo revisa y al hacer merge se publica.

## Stack

- **Astro** (sitio estático) con content collections. Cada `.md` → una página.
- **GitHub Actions**: un workflow de deploy a Pages y otro con cron para los agentes.
- **Node 24** en local y en GitHub Actions (mínimo 22.23.4, lo exige Astro 7.4; los scripts importan `.ts` directamente).
- **Inter** alojada en `src/assets/fonts/inter/` (licencia OFL). Sin Google Fonts, que envía la IP de cada visitante a Google (RGPD).
- La API key de la IA va en *GitHub Secrets*, nunca en el código.
- Dos repos: uno para `es.` y otro para `fuentes.` (GitHub Pages solo admite un dominio personalizado por repo).
- **Repo de `es.`:** https://github.com/Ullswater-Investments/ullswater-web-es — **público**, porque la organización está en el plan gratuito de GitHub y ahí Pages solo funciona con repos públicos (el resto de repos de la organización son privados). Web de pruebas: https://ullswater-investments.github.io/ullswater-web-es/ (variables del repo `SITE`/`BASE`). Con cualquier `SITE` distinto del dominio oficial, las páginas llevan `noindex`.
- Commits con la dirección `noreply` de GitHub de quien los hace, no con su correo personal: el repo es público.
- **La organización no deja que GitHub Actions abra PR** (ajuste de organización; solo lo cambia un propietario). Mientras siga así, el Vigía sube sus cambios a la rama `vigia/actualizacion` y abre o actualiza un issue con la etiqueta `vigia` y el enlace para crear el PR.

## Estructura sugerida (repo `es.`)

```
src/
  content/
    paginas/        ← páginas de la web adaptadas al español
    noticias/       ← noticias generadas por agentes
  layouts/
  pages/
    index.astro
    convocatorias/...
    noticias/index.astro
    noticias/[slug].astro
scripts/
  inventario.mjs    ← recorre la web inglesa y lista enlaces externos
  vigia.mjs
  adaptador.mjs
data/
  snapshot/         ← última versión descargada de la web inglesa
.github/workflows/
  deploy.yml
  agentes.yml
```

## Estructura de la web inglesa (menú actual)

- Home
- Calls: Calls for GenAI, EIC Pre-Accelerator, Calls 2026, Cascade Funding, Horizon Health, Horizon Society, Horizon Security, Horizon Digital, Horizon Climate & Energy, Horizon Food & Environment, Missions & Bridging, Science & Widening, Digital Europe & Defence, Other EU Programmes, International Cooperation
- Investment Readiness
- EU Fund Matching
- About
- Strategic Positioning
- EU Funding NEWS
- EU Funding EVENTS (externo: events.ullswaterinvestments.com)
- Courses (`/cursos`)

URLs: `https://www.ullswaterinvestments.com/<slug>` y `/calls/<slug>`.

## Detalles técnicos importantes

- **Google Sites no tiene API de contenido**: hay que descargar y parsear el HTML.
- **El contenido importante está en bloques «Insertar código»**: no aparece en el HTML visible, sino dentro del atributo `data-code` de un elemento (en `/calls/calls-2026` son ~150 KB). Hay que parsear ese atributo como HTML aparte. `scripts/inventario.mjs` ya lo hace.
- **Los enlaces externos de Google Sites vienen envueltos** como `https://www.google.com/url?q=<URL_REAL>&sa=D&...`. Hay que extraer el parámetro `q` y decodificarlo.
- El menú aparece duplicado en el HTML (navegación de escritorio y móvil): deduplicar enlaces.
- **Funding & Tenders Portal** es una SPA en JavaScript: no se puede copiar con un scraper simple; usar su API de búsqueda para convocatorias.
- **PDFs** (programas de trabajo, anexos): no copiarlos; resumen en español + enlace al original.
- La hora peninsular española es la misma que la de Bruselas (CET/CEST). Solo cambia el formato de fecha (y Canarias, una hora menos).
- **Datos de convocatorias**: la web inglesa los carga en el navegador desde un Worker de Cloudflare (`https://fh-topics.emilio-mulet.workers.dev/`, cuenta de Emilio Mulet) que consulta la API del portal (SEDIA). Campos: `codigo`, `titulo` (inglés), `programa`, `cluster`, `anio` (año del plazo), `estado` (`Abierta`/`Próxima`), `apertura` y `cierre` (AAAA-MM-DD), `presupuesto{es,en}`, `trl`, `resumen`, `palabrasClave`, `enlace`. Retira cada convocatoria el día en que vence. `npm run convocatorias` guarda una copia en `data/convocatorias.json` y la web se genera desde esa copia: cada cambio pasa por un PR.
- **Fallo conocido del Worker** (pendiente de corregir en origen): si un topic tiene varias variantes que comparten presupuesto, las suma. `HORIZON-MSCA-2026-DN-01-01` muestra €1884.1M, pero el portal da €628 033 846 en cada una de sus 3 variantes; `HORIZON-RAISE-2026-01-03` muestra €90M frente a 3 × €30 000 000. La web copia el importe tal cual. Los 68 plazos de 2026 se contrastaron con la API oficial el 5 nov. 2026 y coincidían todos.
- **API oficial del portal (SEDIA)**: `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text="<CÓDIGO>"&pageSize=10&pageNumber=1` → `results[].metadata` con `identifier`, `deadlineDate`, `startDate`, `deadlineModel` y `budgetOverview` (JSON con el presupuesto por variante y año).
- **`fetch` de Node contra Cloudflare**: desde algunas redes falla con «fetch failed» aunque curl funcione (Node solo espera 250 ms por IP). Los scripts usan `net.setDefaultAutoSelectFamilyAttemptTimeout(2500)`.
- **Fechas**: formatear siempre con `src/lib/fecha.ts`. Una fecha AAAA-MM-DD formateada con la zona horaria del ordenador sale un día antes al oeste de UTC.
- **Títulos de las convocatorias en español** (decisión del 5 nov. 2026): `data/titulos-es.json` guarda, por código, el título oficial que se tradujo (`en`) y la traducción (`es`). La ficha muestra el título en español y, debajo, «Título oficial:» en inglés (`lang="en"`). Si falta la traducción o el portal cambia el título oficial, la web muestra el oficial y `npm run revisar` lo lista (también en el PR del Vigía). Traducción hecha con el glosario común `data/glosario-titulos.json` (terminología oficial: IATE, Reglamento (UE) 2021/695 en español, horizonteeuropa.es, versiones españolas de los textos de la Comisión), revisada por lotes y verificada otra vez de forma independiente. Para títulos nuevos, seguir ese glosario. Ojo: el español del propio portal es traducción automática («COFUNDO MSCA»); no usarlo como referencia. «Apply AI» es oficialmente «Estrategia de Uso de la Inteligencia Artificial» (COM(2025) 723 final en español), no «Aplicar la IA».
- **Importes en formato español** (decisión del 5 nov. 2026): `src/lib/importe.ts` convierte «€22.4M (total topic)» en «22,4 M€ en total», «≈ €500k–€1M / proyecto» en «≈ 500 000 € – 1 M€ por proyecto». Trabaja sobre el texto, sin redondear; `npm test` comprueba con todos los datos que cada cifra vale exactamente lo mismo. Un formato desconocido se muestra tal cual y `npm run revisar` lo señala.
- **Astro 7 y los espacios**: si un enlace, `<strong>` o `<em>` empieza en la línea siguiente al texto, Astro elimina el espacio («la páginaHome»). Dejarlos en la misma línea que el texto anterior.

## Reglas de contenido

- **Exactitud**: plazos, importes, nombres oficiales y referencias se copian tal cual. Nunca inventar datos. Los importes solo cambian de notación (22,4 M€), nunca de cifra. Los títulos de convocatorias se traducen, pero el oficial en inglés se muestra siempre debajo.
- **Reutilización**: el contenido de la Comisión Europea se puede reutilizar bajo CC BY 4.0 (Decisión 2011/833/UE) citando la fuente e indicando los cambios. Logos, marcas y contenido de terceros quedan fuera. Fuentes que no lo permitan (prensa, webs privadas): resumen propio + cita, sin copiar texto.
- **Cada página fuente** debe incluir: fuente original, fecha de copia, que es una traducción de Ullswater, el aviso «En caso de discrepancia, prevalece la versión original», enlace al original y un **botón visible a la convocatoria oficial** (las solicitudes se presentan en el portal de la Comisión).
- **Contexto nacional** (CDTI, ENISA, Red.es): el documento lo pide «cuando proceda», pero esa información no está en la web inglesa. No generarlo con IA sin una fuente concreta. *Pendiente de decisión.*

## Diseño

Sistema de diseño aprobado: **azul marino del logo**, **acento dorado**, tipografía **Inter**. Responsive, mobile-first.

## Inventario de la web inglesa (5 nov. 2026)

Generado con `npm run inventario:verificar`; detalle en `data/inventario/` (`resumen.md`, `enlaces.csv`).

- 23 páginas internas y 36 bloques «Insertar código» (22 páginas los tienen; solo `/about` no).
- 17 páginas cargan por JavaScript los datos de convocatorias del Worker (ver «Detalles técnicos»).
- **546 enlaces externos únicos**:
  - 501 fichas del portal Funding & Tenders: 418 salen de los datos del Worker y 83 solo están escritas en el HTML (47 convocatorias en cascada `/competitive-calls-cs/<n>`, 35 fichas `topic-details` y la portada del portal).
  - 37 webs de la UE: 32 para copiar y traducir (CC BY 4.0) y 5 con versión oficial en español, que es la que se enlaza.
  - 1 organismo de la UE fuera de europa.eu (eif.org): revisar la licencia antes de copiar.
  - 2 fuentes españolas (horizonteeuropa.es, red.es): se enlazan directamente.
  - 1 sitio propio: events.ullswaterinvestments.com, que está **en inglés**.
  - 4 enlaces funcionales (correo, agenda de reuniones de Google): no son fuentes; se mantienen como enlace.
  - 0 PDFs enlazados directamente.
- Páginas con más enlaces: Calls 2026 (142), Horizon Climate & Energy (64), Missions (63), Food & Environment (61), Calls for GenAI (52).
- **7 enlaces rotos (HTTP 404)** en la web inglesa: 5 `…/data/topicDetails/<n>EN` en `/calls/international-cooperation`, `…/data/topicDetails/ERASMUS-EDU-2022-ECHE-CERT-FP.json` en `/calls/other-eu-programmes` y `https://ec.europa.eu/regional_policy/en/funding` en `/eu-fund-matching`.
- **Consecuencia**: el 92 % de las «páginas fuente» son fichas del portal. El Espejo de fuentes debe obtenerlas por la API del portal (SEDIA) a partir del código, no copiando la página. Las webs de la UE restantes son las candidatas naturales a copia o resumen en el piloto.

## Estado

**Hecho (5 nov. 2026):**
- Inventario real de la web inglesa: `scripts/inventario.mjs`, resultados en `data/inventario/`.
- Esqueleto Astro: layout, plantillas de página, noticia y página fuente (con `AvisoFuente`).
- **Inicio** (`/`) y **Convocatorias 2026** (`/convocatorias/2026/`) con contenido real. Los textos están adaptados de la web inglesa y las 42 convocatorias salen de los datos, copiadas tal cual.
- Copia de los datos de convocatorias: `scripts/convocatorias.mjs` → `data/convocatorias.json`, validada en el build (`src/lib/convocatorias.ts`).
- Letra Inter alojada en la propia web.
- Workflows `deploy.yml` (pruebas + GitHub Pages en cada push a `main` y cada noche, para retirar las convocatorias vencidas con los datos ya aprobados) e `inventario.yml` (Vigía diario: inventario, convocatorias, pruebas y build → PR con la revisión automática de `scripts/revisar.mjs`; no reescribe su rama si una persona le ha añadido commits).
- Títulos de las convocatorias en español (`data/titulos-es.json`) e importes en formato español (`src/lib/importe.ts`, con pruebas en `tests/`).
- Repo público en la organización y web de pruebas en GitHub Pages (ver «Stack»).
- La noticia y la ficha de fuente siguen siendo ejemplos de plantilla.

**Siguiente:**
1. Proponer las 10 páginas y las 20 fuentes del piloto a partir de `data/inventario/enlaces.csv`.
2. Las otras 14 páginas de convocatorias: el mismo listado, filtrado como en la web inglesa (por prefijo de código o por programa).
3. Vigía: guardar una copia del contenido (`data-code` + texto) y detectar cambios por página, no solo de enlaces.
4. Espejo de fuentes: fichas traducidas a partir de la API SEDIA.

**Bloqueado / pendiente del equipo:**
- Acceso al código del Worker de convocatorias y corrección de la suma de presupuestos (ver «Detalles técnicos»).
- Qué hacer con los enlaces a páginas que solo existen en inglés: servicios, eventos y portal de la Comisión.
- Que un propietario de la organización permita que GitHub Actions abra PR (ver «Stack»).
- Repo de eventos (el de noticias ya se ha visto: ver «Contexto»). Decidir si la web española sigue su modelo de publicación diaria automática de convocatorias o mantiene el PR (ahora: PR).
- Conectar `es.` y `fuentes.` al dominio en Cloudflare.
- Publicar en el dominio oficial.
- Activar agentes con IA automáticos (API de pago: requiere aprobación y clave).
- Elegir las 10 páginas y las 20 fuentes del piloto.
- Quién revisa y da el «publica».

## Próxima tarea

Punto 1 de «Siguiente»: proponer las 10 páginas y las 20 fuentes del piloto a partir de `data/inventario/enlaces.csv`.
