#!/usr/bin/env node
/**
 * Inventario de la web inglesa de Ullswater (Google Sites).
 *
 * Recorre todas las páginas del sitio y saca la lista de enlaces externos:
 *  - desenvuelve los enlaces de Google Sites (https://www.google.com/url?q=...),
 *  - incluye los de los bloques «Insertar código» (su HTML va escapado en el atributo data-code),
 *  - incluye los que esos bloques cargan por JavaScript desde fuentes de datos
 *    (p. ej. el Worker de convocatorias), que no aparecen en el HTML,
 *  - normaliza, deduplica y clasifica cada enlace (tipo y tratamiento propuesto).
 *
 * Uso:
 *   node scripts/inventario.mjs               inventario sin visitar los enlaces externos
 *   node scripts/inventario.mjs --verificar   además visita cada enlace externo: estado, tipo real,
 *                                             idioma y si existe versión oficial en español
 * Opciones: --base <url>   --salida <carpeta>   --max-paginas <n>
 *
 * Resultado (por defecto en data/inventario/):
 *   paginas.json / paginas.csv     una fila por página del sitio
 *   enlaces.json / enlaces.csv     una fila por enlace externo único
 *   datos-dinamicos.json           fuentes de datos que cargan los bloques insertados
 *   resumen.md                     resumen legible
 * Los CSV usan «;» y BOM UTF-8 para que Excel en español los abra bien.
 *
 * Sin dependencias. Requiere Node 22 o superior.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: opciones } = parseArgs({
  options: {
    base: { type: 'string', default: 'https://www.ullswaterinvestments.com/' },
    salida: { type: 'string', default: path.join(RAIZ, 'data', 'inventario') },
    'max-paginas': { type: 'string', default: '200' },
    verificar: { type: 'boolean', default: false },
  },
});

const BASE = new URL(opciones.base);
const HOST = BASE.hostname;
const SALIDA = path.resolve(opciones.salida);
const MAX_PAGINAS = Number(opciones['max-paginas']) || 200;
const UA = 'UllswaterInventario/1.0 (+https://www.ullswaterinvestments.com)';
const PAUSA_PAGINAS_MS = 400; // entre páginas del sitio
const PAUSA_HOST_MS = 700; // entre peticiones al mismo dominio externo (--verificar)
const CONCURRENCIA = 4;
const TIMEOUT_MS = 20000;

// Node prueba cada IP del servidor solo 250 ms por defecto; con conexiones lentas (p. ej. Cloudflare
// a ~400 ms) todas las IP fallan con ETIMEDOUT aunque el servidor responda. Se amplía el margen.
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);

const ZONAS_PLANTILLA = new Set(['menu', 'cabecera', 'pie']); // se repiten en todas las páginas

const ORDEN_TIPOS = ['portal-ft', 'ue-oficial', 'ue-organismo', 'pdf', 'documento', 'es-oficial', 'otro', 'propio', 'google', 'funcional', 'redes'];
const DESCRIPCION_TIPO = {
  'portal-ft': 'fichas del portal Funding & Tenders (aplicación JavaScript: hay que usar su API)',
  'ue-oficial': 'webs de la UE (europa.eu)',
  'ue-organismo': 'organismos de la UE fuera de europa.eu (BEI, FEI)',
  pdf: 'documentos PDF',
  documento: 'otros documentos descargables',
  'es-oficial': 'organismos públicos españoles',
  otro: 'otras webs (prensa, empresas, asociaciones…)',
  propio: 'otros sitios de Ullswater',
  google: 'recursos en Google (Docs, Drive, Sites…)',
  funcional: 'correo, teléfono, agenda de reuniones',
  redes: 'redes sociales',
};

const SOCIALES = /(^|\.)(linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be|tiktok\.com|bsky\.app)$/;
const FUNCIONALES = /(^|\.)(calendar\.google\.com|meet\.google\.com|calendly\.com|zoom\.us|teams\.microsoft\.com|wa\.me|whatsapp\.com)$/;
const GOOGLE = /(^|\.)(docs\.google\.com|drive\.google\.com|sites\.google\.com|forms\.google\.com|forms\.gle|goo\.gl)$/;
const ES_OFICIAL = /(^|\.)(gob\.es|cdti\.es|enisa\.es|red\.es|boe\.es|icex\.es|idae\.es|isciii\.es|ico\.es|fecyt\.es|horizonteeuropa\.es)$/;
const PARAMS_SEGUIMIENTO = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi)$/i;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Utilidades de HTML
// ---------------------------------------------------------------------------
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodifica entidades HTML en una sola pasada (sin decodificar dos veces). */
function decodificar(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** Sustituye <script> y <style> por espacios para no alterar las posiciones del texto. */
const blanquear = (html) => html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, (m) => ' '.repeat(m.length));

function textoPlano(html = '') {
  // Las etiquetas en línea no separan palabras (Google Sites parte el texto en varios <span>).
  const sinEnLinea = blanquear(html).replace(/<\/?(?:span|a|b|i|em|strong|u|s|small|sub|sup|font|mark|abbr|code)\b[^>]*>/gi, '');
  return decodificar(sinEnLinea.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function atributo(attrs, nombre) {
  const m = attrs.match(new RegExp(`(?:^|\\s)${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodificar(m[1] ?? m[2] ?? m[3]) : null;
}

const recortar = (t, n = 140) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t || '');

function textoEnlace(attrs, inner) {
  let t = textoPlano(inner);
  if (!t) {
    const alt = inner.match(/<img\b[^>]*?\salt\s*=\s*"([^"]*)"/i)?.[1];
    if (alt) t = `[imagen] ${decodificar(alt)}`;
  }
  if (!t) t = atributo(attrs, 'aria-label') || atributo(attrs, 'title') || '';
  return recortar(t);
}

/** URLs de fuentes de datos que usa el JavaScript de un bloque insertado. */
function detectarFuentesDatos(js) {
  const urls = new Set();
  for (const m of js.matchAll(/https?:\/\/[^\s'"`<>()\\]+/g)) {
    const u = m[0].replace(/[.,;]+$/, '');
    const enFetch = new RegExp(`fetch\\(\\s*['"\`]${escaparRe(u)}`).test(js);
    if (enFetch || /\.workers\.dev\b|\/api\/|\.json(\?|$)/i.test(u)) urls.add(u);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Utilidades de URL
// ---------------------------------------------------------------------------
/** Quita el envoltorio de Google Sites: https://www.google.com/url?q=<URL_REAL>&sa=D... */
function desenvolver(u) {
  for (let i = 0; i < 3; i++) {
    if (!(/^(www\.)?google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url')) break;
    const q = u.searchParams.get('q') || u.searchParams.get('url');
    if (!q) break;
    try {
      u = new URL(q);
    } catch {
      break;
    }
  }
  return u;
}

function rutaInterna(u) {
  let p;
  try {
    p = decodeURIComponent(u.pathname);
  } catch {
    p = u.pathname;
  }
  p = p.replace(/\/+$/, '') || '/';
  return p === '/' ? '/home' : p;
}

const esPagina = (ruta) => !/\.[a-z0-9]{2,5}$/i.test(ruta) && !ruta.startsWith('/_/');

function clasificarHref(crudo, base) {
  const href = (crudo || '').trim();
  if (!href || /^javascript:/i.test(href)) return null;
  if (href.startsWith('#')) return { clase: 'ancla' };
  let u;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  u = desenvolver(u);
  if (u.protocol === 'mailto:' || u.protocol === 'tel:') return { clase: 'externo', url: u };
  if (!/^https?:$/.test(u.protocol)) return null;
  if (u.hostname === HOST) return { clase: 'interno', ruta: rutaInterna(u) };
  return { clase: 'externo', url: u };
}

const esPortalFT = (u) => u.hostname === 'ec.europa.eu' && u.pathname.startsWith('/info/funding-tenders/opportunities/portal');

/** URL normalizada y clave de deduplicación (sin esquema, sin «www.», sin parámetros de seguimiento). */
function normalizar(u) {
  const n = new URL(u.href);
  if (n.protocol === 'mailto:' || n.protocol === 'tel:') return { url: n.href, clave: n.href.toLowerCase() };
  const quitar = [...n.searchParams.keys()].filter((k) => PARAMS_SEGUIMIENTO.test(k));
  for (const k of quitar) n.searchParams.delete(k);
  if (!n.hash.startsWith('#/')) n.hash = ''; // solo se conservan las rutas de aplicaciones (#/...)
  if (n.pathname.length > 1 && n.pathname.endsWith('/')) n.pathname = n.pathname.replace(/\/+$/, '');
  if (esPortalFT(n)) n.pathname = n.pathname.toLowerCase(); // el código de convocatoria no distingue mayúsculas
  return { url: n.href, clave: `${n.hostname.replace(/^www\./, '')}${n.pathname}${n.search}${n.hash}` };
}

function dominioDe(u) {
  if (u.protocol === 'mailto:') return '(correo)';
  if (u.protocol === 'tel:') return '(teléfono)';
  return u.hostname.replace(/^www\./, '');
}

function tipoDe(u) {
  if (u.protocol === 'mailto:' || u.protocol === 'tel:') return 'funcional';
  const h = u.hostname.replace(/^www\./, '');
  const p = u.pathname.toLowerCase();
  if (h === 'ullswaterinvestments.com' || h.endsWith('.ullswaterinvestments.com')) return 'propio';
  if (esPortalFT(u)) return 'portal-ft';
  if (p.endsWith('.pdf')) return 'pdf';
  if (/\.(docx?|xlsx?|pptx?|odt|ods|odp|csv|zip)$/.test(p)) return 'documento';
  if (SOCIALES.test(h)) return 'redes';
  if (FUNCIONALES.test(h)) return 'funcional';
  if (GOOGLE.test(h)) return 'google';
  if (h === 'europa.eu' || h.endsWith('.europa.eu')) return 'ue-oficial';
  if (/(^|\.)(eif\.org|eib\.org)$/.test(h)) return 'ue-organismo';
  if (ES_OFICIAL.test(h)) return 'es-oficial';
  return 'otro';
}

function tratamientoDe(e) {
  const v = e.verificacion;
  const enEspanol = /^es\b/i.test(v?.idioma || '');
  switch (e.tipo) {
    case 'portal-ft':
      return 'Copiar vía API del portal (CC BY 4.0)';
    case 'ue-oficial':
      if (enEspanol) return 'Enlazar directamente (ya está en español)';
      return v?.version_es ? 'Enlazar la versión oficial en español' : 'Copiar y traducir (CC BY 4.0)';
    case 'ue-organismo':
      return 'Revisar licencia antes de copiar';
    case 'pdf':
    case 'documento':
      return 'Resumen en español + enlace al original';
    case 'es-oficial':
      return 'Enlazar directamente (ya está en español)';
    case 'propio':
      return 'Versión propia en español (decidir)';
    case 'google':
      return 'Revisar caso a caso (recurso propio)';
    case 'redes':
    case 'funcional':
      return 'Excluir: no es una fuente';
    default:
      return enEspanol ? 'Enlazar directamente (ya está en español)' : 'Resumen propio + cita (revisar licencia)';
  }
}

/** Sustituye el último sufijo de idioma de una ruta europa.eu (…_en → …_es). */
function varianteIdioma(pathname, de, a) {
  let ultimo = -1;
  for (const m of pathname.matchAll(new RegExp(`_${de}(?=$|[/.])`, 'g'))) ultimo = m.index;
  return ultimo < 0 ? null : `${pathname.slice(0, ultimo)}_${a}${pathname.slice(ultimo + de.length + 1)}`;
}

const idiomaDe = (html) => html.match(/<html\b[^>]*?\slang\s*=\s*["']?([a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)*)/i)?.[1] || null;

// ---------------------------------------------------------------------------
// Red
// ---------------------------------------------------------------------------
function descargar(url, aceptar = 'text/html,application/xhtml+xml') {
  return fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: aceptar },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// ---------------------------------------------------------------------------
// Análisis de una página de Google Sites
// ---------------------------------------------------------------------------
function analizarPagina(html) {
  const limpio = blanquear(html);
  const h1 = textoPlano(limpio.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  const titulo = h1 || textoPlano(limpio.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');

  // Zonas de plantilla (menú de escritorio y móvil, cabecera, pie): se repiten en todas las páginas.
  const zonas = [];
  for (const [re, zona] of [
    [/<nav\b[\s\S]*?<\/nav>/gi, 'menu'],
    [/<header\b[\s\S]*?<\/header>/gi, 'cabecera'],
    [/<footer\b[\s\S]*?<\/footer>/gi, 'pie'],
  ]) {
    for (const m of limpio.matchAll(re)) zonas.push({ ini: m.index, fin: m.index + m[0].length, zona });
  }
  const zonaEn = (i) => zonas.find((z) => i >= z.ini && i < z.fin)?.zona || 'contenido';

  const enlaces = [];
  for (const m of limpio.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = atributo(m[1], 'href');
    if (href) enlaces.push({ href, texto: textoEnlace(m[1], m[2]), zona: zonaEn(m.index) });
  }

  // Bloques «Insertar código»: el HTML va escapado dentro de data-code="…".
  const bloques = [];
  const fuentesDatos = new Set();
  for (const m of limpio.matchAll(/\sdata-code="([^"]*)"/g)) {
    const codigo = decodificar(m[1]);
    const zonaBloque = ZONAS_PLANTILLA.has(zonaEn(m.index)) ? zonaEn(m.index) : 'insertado';
    const js = [...codigo.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((s) => s[1]).join('\n');
    let n = 0;
    for (const a of blanquear(codigo).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = atributo(a[1], 'href');
      if (!href) continue;
      enlaces.push({ href, texto: textoEnlace(a[1], a[2]), zona: zonaBloque });
      n++;
    }
    const fuentes = detectarFuentesDatos(js);
    for (const f of fuentes) fuentesDatos.add(f);
    bloques.push({
      titulo: textoPlano(codigo.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '') || null,
      enlaces: n,
      fuentes_datos: [...fuentes],
    });
  }
  return { titulo, enlaces, bloques, fuentesDatos: [...fuentesDatos] };
}

// ---------------------------------------------------------------------------
// Registro de enlaces externos
// ---------------------------------------------------------------------------
const enlaces = new Map(); // clave → registro

function registrar(u, { ruta = null, zona, texto, origen }) {
  const { url, clave } = normalizar(u);
  let e = enlaces.get(clave);
  if (!e) {
    const un = new URL(url);
    e = {
      url,
      clave,
      dominio: dominioDe(un),
      tipo: tipoDe(un),
      paginas: new Set(),
      plantilla: false,
      zonas: new Set(),
      textos: new Set(),
      origenes: new Set(),
    };
    enlaces.set(clave, e);
  }
  if (ZONAS_PLANTILLA.has(zona)) e.plantilla = true;
  else if (ruta) e.paginas.add(ruta);
  e.zonas.add(zona);
  if (texto && e.textos.size < 5) e.textos.add(recortar(texto));
  e.origenes.add(origen);
  return clave;
}

/** Lee una fuente de datos JSON y devuelve las URLs que contiene (con su código/título como texto). */
async function leerFuenteDatos(url) {
  const res = await descargar(url, 'application/json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const datos = await res.json();
  const urls = [];
  const visitar = (v) => {
    if (Array.isArray(v)) return v.forEach(visitar);
    if (!v || typeof v !== 'object') return;
    const texto = [v.codigo ?? v.id ?? v.code, v.titulo ?? v.title ?? v.nombre ?? v.name].filter(Boolean).join(' · ');
    for (const x of Object.values(v)) {
      if (typeof x === 'string' && /^https?:\/\//i.test(x) && !/\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(x)) urls.push({ url: x, texto });
      else if (x && typeof x === 'object') visitar(x);
    }
  };
  visitar(datos);
  const meta = {};
  if (datos && typeof datos === 'object' && !Array.isArray(datos)) {
    for (const [k, x] of Object.entries(datos)) if (x === null || typeof x !== 'object') meta[k] = x;
  }
  return { urls, meta };
}

// ---------------------------------------------------------------------------
// Verificación de enlaces externos (--verificar)
// ---------------------------------------------------------------------------
// Las redirecciones a una página de inicio de sesión llevan un identificador distinto en cada
// visita (p. ej., ECAS de la Comisión: …/cas/login?loginRequestId=ECAS_LR-…). Se guardan sin la
// consulta; si no, el inventario cambiaría en cada ejecución y el Vigía avisaría a diario.
function urlFinalEstable(url) {
  try {
    const u = new URL(url);
    if (/\/login\b/i.test(u.pathname)) {
      u.search = '';
      u.hash = '';
    }
    return u.href;
  } catch {
    return url;
  }
}

async function verificarEnlace(e, turno) {
  const r = { estado: null, url_final: null, tipo_contenido: null, idioma: null, version_es: null, version_es_automatica: null, error: null };
  try {
    await turno(new URL(e.url).hostname);
    const res = await descargar(e.url, 'text/html,application/xhtml+xml,*/*;q=0.8');
    r.estado = res.status;
    if (res.url && res.url !== e.url) r.url_final = urlFinalEstable(res.url);
    r.tipo_contenido = (res.headers.get('content-type') || '').split(';')[0].trim() || null;
    if (/html/i.test(r.tipo_contenido || '')) r.idioma = idiomaDe(await res.text()) || res.headers.get('content-language');
    else {
      await res.body?.cancel();
      r.idioma = res.headers.get('content-language');
    }
    // ¿Existe versión oficial en español? Convención de europa.eu: …_en → …_es
    const destino = new URL(res.url || e.url);
    const rutaEs = varianteIdioma(destino.pathname, 'en', 'es');
    if (res.ok && /(^|\.)europa\.eu$/.test(destino.hostname) && rutaEs) {
      const es = new URL(destino.href);
      es.pathname = rutaEs;
      await turno(es.hostname);
      const res2 = await descargar(es.href);
      if (res2.ok && /_es(?=$|[/.])/.test(new URL(res2.url).pathname)) {
        const html2 = await res2.text();
        if (/^es\b/i.test(idiomaDe(html2) || '')) {
          r.version_es = res2.url;
          r.version_es_automatica = /traducci[oó]n autom[aá]tica|machine[- ]translat|eTranslation/i.test(html2);
        }
      } else await res2.body?.cancel();
    }
  } catch (err) {
    r.error = err?.name === 'TimeoutError' ? 'tiempo agotado' : String(err?.cause?.code || err?.message || err);
  }
  return r;
}

async function verificarTodos(lista) {
  const proximoPorHost = new Map();
  const turno = async (host) => {
    const ahora = Date.now();
    const libre = Math.max(ahora, (proximoPorHost.get(host) || 0) + PAUSA_HOST_MS);
    proximoPorHost.set(host, libre);
    if (libre > ahora) await espera(libre - ahora);
  };
  let i = 0;
  let hechos = 0;
  const trabajador = async () => {
    while (i < lista.length) {
      const e = lista[i++];
      e.verificacion = await verificarEnlace(e, turno);
      hechos++;
      if (hechos % 10 === 0 || hechos === lista.length) process.stdout.write(`  verificados ${hechos}/${lista.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------
function celda(v) {
  let s = v == null ? '' : Array.isArray(v) ? v.join(' | ') : String(v);
  if (/^[=+@]/.test(s)) s = `'${s}`; // evita que Excel lo interprete como fórmula
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(filas, columnas) {
  const lineas = [columnas.map(([titulo]) => titulo).join(';')];
  for (const f of filas) lineas.push(columnas.map(([, valor]) => celda(valor(f))).join(';'));
  return `﻿${lineas.join('\r\n')}\r\n`;
}

function contar(lista, clave) {
  const m = new Map();
  for (const x of lista) m.set(clave(x), (m.get(clave(x)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function resumenMd({ fecha, paginas, lista, fuentes, verificado }) {
  const L = [];
  const errores = paginas.filter((p) => p.error || (p.estado && p.estado >= 400)).length;
  const totalBloques = paginas.reduce((s, p) => s + p.bloques_insertados, 0);
  L.push('# Inventario de la web inglesa', '', `*${fecha} · ${BASE.href}*`, '');
  L.push(`- **Páginas recorridas:** ${paginas.length}${errores ? ` (${errores} con error)` : ''}`);
  L.push(`- **Enlaces externos únicos:** ${lista.length}`);
  L.push(`- **Bloques «Insertar código»:** ${totalBloques}`);
  L.push(`- **Fuentes de datos cargadas por JavaScript:** ${fuentes.length}`);
  L.push(
    verificado
      ? '- **Enlaces visitados** para comprobar estado, idioma y versión oficial en español: sí'
      : '- **Enlaces visitados:** no (ejecutar con `--verificar` para comprobar estado, idioma y versión oficial en español)',
  );

  L.push('', '## Enlaces por tipo', '');
  for (const [tipo, n] of contar(lista, (e) => e.tipo).sort((a, b) => ORDEN_TIPOS.indexOf(a[0]) - ORDEN_TIPOS.indexOf(b[0]))) {
    L.push(`- **${tipo}: ${n}** — ${DESCRIPCION_TIPO[tipo] || ''}`);
  }

  L.push('', '## Tratamiento propuesto', '');
  for (const [t, n] of contar(lista, (e) => e.tratamiento)) L.push(`- **${n}** · ${t}`);

  L.push('', '## Dominios con más enlaces', '');
  for (const [d, n] of contar(lista, (e) => e.dominio).slice(0, 15)) L.push(`- ${d}: ${n}`);

  if (fuentes.length) {
    L.push('', '## Fuentes de datos dinámicas', '');
    for (const f of fuentes) {
      L.push(`- **${f.url}**`);
      if (f.error) L.push(`  - Error al leerla: ${f.error}`);
      for (const [k, v] of Object.entries(f.meta || {})) L.push(`  - ${k}: ${v}`);
      L.push(`  - Enlaces que contiene: ${f.enlaces}`);
      L.push(`  - La cargan ${f.paginas.length} páginas: ${f.paginas.join(', ')}`);
    }
  }

  if (verificado) {
    const conVersionEs = lista.filter((e) => e.verificacion?.version_es);
    const rotos = lista.filter((e) => e.verificacion && (e.verificacion.error || e.verificacion.estado >= 400));
    L.push('', '## Resultado de la verificación', '');
    L.push(`- Con versión oficial en español: ${conVersionEs.length}`);
    for (const [idioma, n] of contar(lista.filter((e) => e.verificacion), (e) => e.verificacion.idioma || '(sin dato)')) {
      L.push(`- Idioma ${idioma}: ${n}`);
    }
    L.push(`- Con error o caídos: ${rotos.length}`);
    for (const e of rotos.slice(0, 20)) L.push(`  - ${e.url} → ${e.verificacion.error || `HTTP ${e.verificacion.estado}`}`);
  }

  L.push('', '## Páginas', '');
  for (const p of paginas) {
    const extra = [p.bloques_insertados ? `${p.bloques_insertados} bloques insertados` : '', p.fuentes_datos.length ? 'carga datos dinámicos' : '']
      .filter(Boolean)
      .join(', ');
    L.push(`- \`${p.ruta}\` — ${p.titulo || '(sin título)'}: ${p.enlaces_externos} enlaces externos${extra ? ` (${extra})` : ''}${p.error || p.estado >= 400 ? ` — ERROR ${p.error || p.estado}` : ''}`);
  }

  L.push('', '## Notas', '');
  L.push('- Los tipos y tratamientos son una propuesta automática a partir de la URL: hay que validarlos.');
  L.push('- Los enlaces de menú, cabecera y pie se cuentan una vez («en_plantilla»), no en cada página.');
  if (fuentes.length) {
    L.push('- Los enlaces de «datos dinámicos» no están en el HTML: el navegador los carga desde la fuente de datos. Cada página de convocatorias muestra solo una parte, filtrada por el JavaScript del bloque.');
  }
  return `${L.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------
async function main() {
  const inicio = new Date();
  console.log(`Inventario de ${BASE.href}`);

  // 1. Recorrido de las páginas del sitio
  const paginas = new Map();
  const cola = ['/home'];
  const vistas = new Set(cola);
  const fuentesDatos = new Map(); // url → Set(rutas)

  while (cola.length && paginas.size < MAX_PAGINAS) {
    const ruta = cola.shift();
    const url = new URL(ruta, BASE).href;
    const info = { ruta, url, estado: null, error: null, titulo: '', enlaces_externos: 0, enlaces_internos: 0, bloques_insertados: 0, fuentes_datos: [] };
    paginas.set(ruta, info);
    let html = '';
    try {
      const res = await descargar(url);
      info.estado = res.status;
      html = res.ok ? await res.text() : '';
      if (!res.ok) await res.body?.cancel();
    } catch (err) {
      info.error = err?.name === 'TimeoutError' ? 'tiempo agotado' : String(err?.message || err);
    }
    if (html) {
      const r = analizarPagina(html);
      info.titulo = r.titulo;
      info.bloques_insertados = r.bloques.length;
      info.fuentes_datos = r.fuentesDatos;
      const externos = new Set();
      const internos = new Set();
      for (const a of r.enlaces) {
        const c = clasificarHref(a.href, url);
        if (!c || c.clase === 'ancla') continue;
        if (c.clase === 'interno') {
          internos.add(c.ruta);
          if (esPagina(c.ruta) && !vistas.has(c.ruta)) {
            vistas.add(c.ruta);
            cola.push(c.ruta);
          }
        } else {
          const clave = registrar(c.url, { ruta, zona: a.zona, texto: a.texto, origen: a.zona === 'insertado' ? 'bloque insertado' : 'html' });
          if (!ZONAS_PLANTILLA.has(a.zona)) externos.add(clave);
        }
      }
      info.enlaces_externos = externos.size;
      info.enlaces_internos = internos.size;
      for (const f of r.fuentesDatos) {
        if (!fuentesDatos.has(f)) fuentesDatos.set(f, new Set());
        fuentesDatos.get(f).add(ruta);
      }
    }
    console.log(`  ${String(paginas.size).padStart(3)}  ${ruta}  ${info.error || info.estado}`);
    await espera(PAUSA_PAGINAS_MS);
  }

  // 2. Fuentes de datos dinámicas (p. ej. el Worker de convocatorias)
  const fuentes = [];
  for (const [url, rutas] of fuentesDatos) {
    const f = { url, paginas: [...rutas], meta: {}, enlaces: 0, error: null };
    try {
      const { urls, meta } = await leerFuenteDatos(url);
      f.meta = meta;
      const claves = new Set();
      const origen = `datos dinámicos (${new URL(url).hostname})`;
      for (const x of urls) {
        try {
          claves.add(registrar(new URL(x.url), { zona: 'datos-dinamicos', texto: x.texto, origen }));
        } catch {
          /* URL no válida en los datos: se ignora */
        }
      }
      f.enlaces = claves.size;
    } catch (err) {
      f.error = String(err?.message || err);
    }
    fuentes.push(f);
    console.log(`  datos dinámicos: ${url} → ${f.error || `${f.enlaces} enlaces`}`);
  }

  // 3. Verificación opcional de los enlaces externos
  const lista = [...enlaces.values()];
  if (opciones.verificar) {
    const aVerificar = lista.filter((e) => !['portal-ft', 'redes', 'funcional', 'google'].includes(e.tipo));
    console.log(`Verificando ${aVerificar.length} enlaces externos (se omiten portal F&T, redes, Google y enlaces funcionales)…`);
    await verificarTodos(aVerificar);
    for (const e of aVerificar) {
      const ct = e.verificacion?.tipo_contenido || '';
      if (ct === 'application/pdf') e.tipo = 'pdf';
      else if (/officedocument|msword|ms-excel|opendocument|zip/.test(ct)) e.tipo = 'documento';
    }
  }
  for (const e of lista) e.tratamiento = tratamientoDe(e);
  lista.sort(
    (a, b) =>
      ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) || a.dominio.localeCompare(b.dominio) || a.url.localeCompare(b.url),
  );

  // 4. Escritura de resultados
  await mkdir(SALIDA, { recursive: true });
  const listaPaginas = [...paginas.values()];
  const enlacesJson = lista.map((e) => ({
    url: e.url,
    dominio: e.dominio,
    tipo: e.tipo,
    tratamiento_propuesto: e.tratamiento,
    n_paginas: e.paginas.size,
    paginas: [...e.paginas],
    en_plantilla: e.plantilla,
    zonas: [...e.zonas],
    origen: [...e.origenes],
    textos: [...e.textos],
    ...(e.verificacion ? { verificacion: e.verificacion } : {}),
  }));
  const columnasEnlaces = [
    ['url', (e) => e.url],
    ['dominio', (e) => e.dominio],
    ['tipo', (e) => e.tipo],
    ['tratamiento_propuesto', (e) => e.tratamiento_propuesto],
    ['n_paginas', (e) => e.n_paginas],
    ['paginas', (e) => e.paginas],
    ['en_plantilla', (e) => (e.en_plantilla ? 'sí' : '')],
    ['zonas', (e) => e.zonas],
    ['origen', (e) => e.origen],
    ['textos', (e) => e.textos],
  ];
  if (opciones.verificar) {
    columnasEnlaces.push(
      ['estado_http', (e) => e.verificacion?.estado],
      ['tipo_contenido', (e) => e.verificacion?.tipo_contenido],
      ['idioma', (e) => e.verificacion?.idioma],
      ['version_es_oficial', (e) => e.verificacion?.version_es],
      ['version_es_menciona_traduccion_automatica', (e) => (e.verificacion?.version_es ? (e.verificacion.version_es_automatica ? 'sí' : 'no') : '')],
      ['url_final', (e) => e.verificacion?.url_final],
      ['error', (e) => e.verificacion?.error],
    );
  }
  const columnasPaginas = [
    ['ruta', (p) => p.ruta],
    ['url', (p) => p.url],
    ['titulo', (p) => p.titulo],
    ['estado', (p) => p.error || p.estado],
    ['enlaces_externos', (p) => p.enlaces_externos],
    ['enlaces_internos', (p) => p.enlaces_internos],
    ['bloques_insertados', (p) => p.bloques_insertados],
    ['fuentes_datos', (p) => p.fuentes_datos],
  ];
  const fecha = inicio.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' });
  const meta = { generado: inicio.toISOString(), base: BASE.href, verificado: opciones.verificar };

  await writeFile(path.join(SALIDA, 'paginas.json'), `${JSON.stringify({ ...meta, paginas: listaPaginas }, null, 2)}\n`);
  await writeFile(path.join(SALIDA, 'paginas.csv'), csv(listaPaginas, columnasPaginas));
  await writeFile(path.join(SALIDA, 'enlaces.json'), `${JSON.stringify({ ...meta, enlaces: enlacesJson }, null, 2)}\n`);
  await writeFile(path.join(SALIDA, 'enlaces.csv'), csv(enlacesJson, columnasEnlaces));
  await writeFile(path.join(SALIDA, 'datos-dinamicos.json'), `${JSON.stringify({ ...meta, fuentes }, null, 2)}\n`);
  const resumen = resumenMd({ fecha, paginas: listaPaginas, lista, fuentes, verificado: opciones.verificar });
  await writeFile(path.join(SALIDA, 'resumen.md'), resumen);

  console.log(`\n${resumen}`);
  console.log(`Resultados en ${path.relative(process.cwd(), SALIDA) || SALIDA}/ (${((Date.now() - inicio) / 1000).toFixed(0)} s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
