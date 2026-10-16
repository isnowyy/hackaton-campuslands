// Reglas de negocio deterministas para equipos y préstamos (funciones puras).

import { ReglaNegocioError } from './errores.js';
import { ETIQUETAS } from './catalogos.js';

// R4 · Disponibilidad: solo se presta un equipo operativo y sin préstamo activo.
export function validarEquipoPrestable(equipo, prestamoActivo) {
  if (prestamoActivo) {
    throw new ReglaNegocioError(
      'R4_DISPONIBILIDAD_EQUIPO',
      `El equipo "${equipo.nombre}" ya está prestado a ${prestamoActivo.responsable} desde ${prestamoActivo.fecha_prestamo.replace('T', ' ')}.`,
      { prestamo_id: prestamoActivo.id },
    );
  }
  if (equipo.estado !== 'operativo') {
    throw new ReglaNegocioError(
      'R4_DISPONIBILIDAD_EQUIPO',
      `El equipo "${equipo.nombre}" está "${ETIQUETAS[equipo.estado] ?? equipo.estado}" y no se puede prestar.`,
      { estado: equipo.estado },
    );
  }
}

// R5 · Integridad: fecha de devolución prevista posterior al momento del préstamo.
export function validarFechasPrestamo({ fechaPrestamo, devolucionPrevista }) {
  if (devolucionPrevista <= fechaPrestamo) {
    throw new ReglaNegocioError(
      'R5_INTEGRIDAD_OPERACIONES',
      'La devolución prevista debe ser posterior al momento del préstamo.',
    );
  }
}

// R5 · Integridad: solo se devuelve un préstamo que siga activo (evita doble devolución).
export function validarDevolucion(prestamo) {
  if (!prestamo || prestamo.estado !== 'activo') {
    throw new ReglaNegocioError(
      'R5_INTEGRIDAD_OPERACIONES',
      'El equipo no tiene un préstamo activo; no hay nada que devolver.',
    );
  }
}

// R5 · Integridad: el estado operativo de un equipo prestado no se cambia
// por fuera de la devolución. Si se dañó durante el préstamo, se registra la
// devolución indicando "dañado"; así la historia del equipo queda coherente.
export function validarCambioEstadoEquipo(equipo, nuevoEstado, prestamoActivo) {
  if (nuevoEstado && nuevoEstado !== equipo.estado && prestamoActivo) {
    throw new ReglaNegocioError(
      'R5_INTEGRIDAD_OPERACIONES',
      `"${equipo.nombre}" está prestado a ${prestamoActivo.responsable}. Registra la devolución (indicando su estado) antes de cambiarlo.`,
      { prestamo_id: prestamoActivo.id },
    );
  }
}
