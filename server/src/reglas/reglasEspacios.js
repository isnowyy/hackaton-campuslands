// Reglas de negocio deterministas para espacios y reservas.
// Son funciones puras: reciben los datos ya consultados y lanzan
// ReglaNegocioError si la operación no se permite. No tocan la base de datos,
// así se prueban de forma aislada (test/reglas.test.js) y los servicios, el
// importador y el flujo de IA aplican exactamente las mismas reglas.

import { ReglaNegocioError } from './errores.js';
import { ETIQUETAS } from './catalogos.js';

// R1 · Aforo: la capacidad del espacio debe cubrir a todas las personas.
export function validarAforo(espacio, personas) {
  if (personas > espacio.capacidad) {
    throw new ReglaNegocioError(
      'R1_AFORO',
      `El espacio "${espacio.nombre}" tiene capacidad para ${espacio.capacidad} personas y la reserva es para ${personas}.`,
      { capacidad: espacio.capacidad, personas, faltan: personas - espacio.capacidad },
    );
  }
}

// R3 · Estado del espacio: solo un espacio disponible admite asignaciones.
export function validarEstadoEspacio(espacio) {
  if (espacio.estado !== 'disponible') {
    throw new ReglaNegocioError(
      'R3_ESTADO_ESPACIO',
      `El espacio "${espacio.nombre}" está en estado "${ETIQUETAS[espacio.estado] ?? espacio.estado}" y no admite reservas.`,
      { estado: espacio.estado },
    );
  }
}

// Intervalos semiabiertos [inicio, fin): una reserva que termina a las 10:00
// no choca con otra que empieza a las 10:00.
export function seSuperponen(a, b) {
  return a.inicio < b.fin && b.inicio < a.fin;
}

// R2 · Conflictos de horario: ninguna reserva activa del mismo espacio puede
// superponerse con el intervalo pedido.
export function validarSinCruceDeHorario(intervalo, reservasActivasDelEspacio) {
  const cruces = reservasActivasDelEspacio.filter((r) => seSuperponen(intervalo, r));
  if (cruces.length) {
    const primera = cruces[0];
    throw new ReglaNegocioError(
      'R2_CRUCE_HORARIO',
      `El horario se cruza con la reserva de ${primera.responsable} ` +
        `(${primera.inicio.replace('T', ' ')} a ${primera.fin.slice(11)}).`,
      { cruces: cruces.map(({ id, responsable, inicio, fin }) => ({ id, responsable, inicio, fin })) },
    );
  }
}

// R5 · Integridad: una reserva necesita un intervalo coherente y futuro.
export function validarIntervaloReserva({ inicio, fin }, ahora) {
  if (fin <= inicio) {
    throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', 'La hora de fin debe ser posterior a la hora de inicio.');
  }
  if (fin <= ahora) {
    throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', 'No se puede reservar un horario que ya terminó.', { ahora });
  }
}

// Validación completa de una reserva nueva. El orden es deliberado: primero
// lo que depende solo del espacio (estado, aforo) y después el horario.
export function validarNuevaReserva({ espacio, personas, inicio, fin, reservasActivas, ahora }) {
  validarIntervaloReserva({ inicio, fin }, ahora);
  validarEstadoEspacio(espacio);
  validarAforo(espacio, personas);
  validarSinCruceDeHorario({ inicio, fin }, reservasActivas);
}

// R5 · Integridad: no se puede dejar un espacio en un estado que contradiga
// reservas futuras ya aceptadas, ni reducir su capacidad por debajo de ellas.
export function validarCambioEspacio(espacioActual, cambios, reservasFuturas) {
  const nuevoEstado = cambios.estado ?? espacioActual.estado;
  if (nuevoEstado !== 'disponible' && reservasFuturas.length) {
    throw new ReglaNegocioError(
      'R5_INTEGRIDAD_OPERACIONES',
      `No se puede pasar "${espacioActual.nombre}" a "${ETIQUETAS[nuevoEstado] ?? nuevoEstado}": ` +
        `tiene ${reservasFuturas.length} reserva(s) activa(s) pendiente(s). Cancélalas primero.`,
      { reservas: reservasFuturas.map(({ id, responsable, inicio, fin }) => ({ id, responsable, inicio, fin })) },
    );
  }
  const nuevaCapacidad = cambios.capacidad ?? espacioActual.capacidad;
  const excedidas = reservasFuturas.filter((r) => r.personas > nuevaCapacidad);
  if (excedidas.length) {
    throw new ReglaNegocioError(
      'R1_AFORO',
      `No se puede reducir la capacidad a ${nuevaCapacidad}: hay ${excedidas.length} reserva(s) futura(s) con más personas.`,
      { reservas: excedidas.map(({ id, responsable, personas }) => ({ id, responsable, personas })) },
    );
  }
}

// R5 · Integridad: solo se cancela una reserva activa que aún no termina.
export function validarCancelacionReserva(reserva, ahora) {
  if (reserva.estado !== 'activa') {
    throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', `La reserva #${reserva.id} ya está ${reserva.estado}.`);
  }
  if (reserva.fin <= ahora) {
    throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', `La reserva #${reserva.id} ya finalizó; queda en el historial.`);
  }
}
