// Formato de fecha español para las fechas de los .md (p. ej. 2026-11-05 → «5 de noviembre de 2026»).
//
// Las fechas AAAA-MM-DD se leen como medianoche UTC. Si se formatean con la zona horaria
// del ordenador que compila, al oeste de UTC salen un día antes (en America/Caracas,
// 2026-11-05 aparecía como «4 de noviembre»). Por eso se formatean siempre en UTC.
export function fechaLarga(fecha: Date): string {
  return fecha.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Fecha AAAA-MM-DD tal como viene en los datos de convocatorias → «24 de noviembre de 2026».
export function fechaIso(iso: string): string {
  return fechaLarga(new Date(`${iso}T00:00:00Z`));
}

// Mes AAAA-MM → «noviembre de 2026».
export function mesLargo(anioMes: string): string {
  return new Date(`${anioMes}-01T00:00:00Z`).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Momento exacto en hora peninsular española (la misma que la de Bruselas):
// «5 de noviembre de 2026, 21:14».
export function fechaHoraPeninsular(fecha: Date): string {
  return fecha.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });
}

// Fecha de hoy en hora peninsular, como AAAA-MM-DD, para compararla con las de los datos.
export function hoyPeninsular(): string {
  const partes = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
