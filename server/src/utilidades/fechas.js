// Todas las fechas del sistema se guardan como texto local 'YYYY-MM-DDTHH:MM'.
// Decisión de diseño: el campus opera en una sola zona horaria (Colombia) y el
// formulario del navegador (<input type="datetime-local">) entrega ese mismo
// formato. Al ser texto de ancho fijo, comparar dos fechas con < y > en JS o en
// SQL da el mismo resultado que comparar instantes, sin conversiones de zona.

const dosDigitos = (n) => String(n).padStart(2, '0');

export function formatearLocal(fecha) {
  return (
    `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    `T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  );
}

export function ahoraLocal() {
  return formatearLocal(new Date());
}

export function inicioDelDia(fechaLocal = ahoraLocal()) {
  return `${fechaLocal.slice(0, 10)}T00:00`;
}

export function finDelDia(fechaLocal = ahoraLocal()) {
  return `${fechaLocal.slice(0, 10)}T23:59`;
}

// Acepta los formatos que suelen venir en archivos y formularios y devuelve
// 'YYYY-MM-DDTHH:MM', o null si el texto no es una fecha válida.
//   2026-10-16 14:00 | 2026-10-16T14:00:00 | 16/10/2026 14:00 | 2026-10-16 (sin hora)
export function normalizarFechaHora(valor, horaPorDefecto = '00:00') {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;

  let anio, mes, dia, hora, minuto;
  let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    [, anio, mes, dia, hora, minuto] = m;
  } else {
    m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
    if (!m) return null;
    [, dia, mes, anio, hora, minuto] = m;
  }
  if (hora === undefined) [hora, minuto] = horaPorDefecto.split(':');

  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto));
  // new Date corrige silenciosamente 31/02 a 03/03; se rechaza si cambió algún componente.
  if (
    fecha.getFullYear() !== Number(anio) ||
    fecha.getMonth() !== Number(mes) - 1 ||
    fecha.getDate() !== Number(dia) ||
    fecha.getHours() !== Number(hora) ||
    fecha.getMinutes() !== Number(minuto)
  ) {
    return null;
  }
  return formatearLocal(fecha);
}

export function normalizarHora(valor) {
  const m = String(valor ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${dosDigitos(Number(m[1]))}:${m[2]}`;
}
