// Casos válidos e inválidos de las seis reglas de negocio, probadas como
// funciones puras (sin base de datos). Ejecutar: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ReglaNegocioError } from '../src/reglas/errores.js';
import {
  seSuperponen,
  validarAforo,
  validarCambioEspacio,
  validarCancelacionReserva,
  validarEstadoEspacio,
  validarIntervaloReserva,
  validarSinCruceDeHorario,
} from '../src/reglas/reglasEspacios.js';
import {
  validarCambioEstadoEquipo,
  validarDevolucion,
  validarEquipoPrestable,
  validarFechasPrestamo,
} from '../src/reglas/reglasEquipos.js';
import {
  validarClasificacion,
  validarReclasificacion,
  validarTransicion,
} from '../src/reglas/reglasIncidencias.js';

const AHORA = '2030-01-10T07:00';
const aula = { id: 'A-101', nombre: 'Aula 101', tipo: 'aula', capacidad: 30, estado: 'disponible' };
const portatil = { id: 'PC-01', nombre: 'Portátil 01', estado: 'operativo' };

const incumple = (regla) => (error) => error instanceof ReglaNegocioError && error.regla === regla;

describe('R1 · Aforo', () => {
  test('válido: 30 personas en un aula de 30', () => assert.doesNotThrow(() => validarAforo(aula, 30)));
  test('inválido: 31 personas en un aula de 30', () => assert.throws(() => validarAforo(aula, 31), incumple('R1_AFORO')));
  test('inválido: reducir capacidad por debajo de una reserva futura', () =>
    assert.throws(
      () => validarCambioEspacio(aula, { capacidad: 20 }, [{ id: 1, responsable: 'P1', personas: 25 }]),
      incumple('R1_AFORO'),
    ));
});

describe('R2 · Conflictos de horario', () => {
  const existente = [{ id: 1, responsable: 'Grupo P1', inicio: '2030-01-10T08:00', fin: '2030-01-10T10:00' }];
  test('válido: reserva contigua (termina 10:00, empieza 10:00)', () =>
    assert.doesNotThrow(() => validarSinCruceDeHorario({ inicio: '2030-01-10T10:00', fin: '2030-01-10T12:00' }, existente)));
  test('inválido: reserva que se superpone parcialmente', () =>
    assert.throws(
      () => validarSinCruceDeHorario({ inicio: '2030-01-10T09:00', fin: '2030-01-10T11:00' }, existente),
      incumple('R2_CRUCE_HORARIO'),
    ));
  test('inválido: reserva contenida dentro de otra', () =>
    assert.throws(
      () => validarSinCruceDeHorario({ inicio: '2030-01-10T08:30', fin: '2030-01-10T09:00' }, existente),
      incumple('R2_CRUCE_HORARIO'),
    ));
  test('superposición es simétrica', () => {
    const a = { inicio: '2030-01-10T08:00', fin: '2030-01-10T10:00' };
    const b = { inicio: '2030-01-10T07:00', fin: '2030-01-10T12:00' };
    assert.equal(seSuperponen(a, b), true);
    assert.equal(seSuperponen(b, a), true);
  });
});

describe('R3 · Estado del espacio', () => {
  test('válido: espacio disponible', () => assert.doesNotThrow(() => validarEstadoEspacio(aula)));
  test('inválido: espacio en mantenimiento', () =>
    assert.throws(() => validarEstadoEspacio({ ...aula, estado: 'mantenimiento' }), incumple('R3_ESTADO_ESPACIO')));
  test('inválido: espacio inhabilitado', () =>
    assert.throws(() => validarEstadoEspacio({ ...aula, estado: 'inhabilitado' }), incumple('R3_ESTADO_ESPACIO')));
});

describe('R4 · Disponibilidad de equipos', () => {
  test('válido: equipo operativo sin préstamo', () => assert.doesNotThrow(() => validarEquipoPrestable(portatil, null)));
  test('inválido: equipo dañado', () =>
    assert.throws(() => validarEquipoPrestable({ ...portatil, estado: 'danado' }, null), incumple('R4_DISPONIBILIDAD_EQUIPO')));
  test('inválido: equipo inhabilitado', () =>
    assert.throws(() => validarEquipoPrestable({ ...portatil, estado: 'inhabilitado' }, null), incumple('R4_DISPONIBILIDAD_EQUIPO')));
  test('inválido: equipo ya prestado', () =>
    assert.throws(
      () => validarEquipoPrestable(portatil, { id: 7, responsable: 'Ana', fecha_prestamo: AHORA }),
      incumple('R4_DISPONIBILIDAD_EQUIPO'),
    ));
});

describe('R5 · Integridad de operaciones', () => {
  test('inválido: reserva con fin antes del inicio', () =>
    assert.throws(
      () => validarIntervaloReserva({ inicio: '2030-01-10T10:00', fin: '2030-01-10T09:00' }, AHORA),
      incumple('R5_INTEGRIDAD_OPERACIONES'),
    ));
  test('inválido: reserva en un horario que ya terminó', () =>
    assert.throws(
      () => validarIntervaloReserva({ inicio: '2030-01-09T08:00', fin: '2030-01-09T10:00' }, AHORA),
      incumple('R5_INTEGRIDAD_OPERACIONES'),
    ));
  test('válido: reserva futura bien formada', () =>
    assert.doesNotThrow(() => validarIntervaloReserva({ inicio: '2030-01-10T08:00', fin: '2030-01-10T10:00' }, AHORA)));
  test('inválido: pasar a mantenimiento un espacio con reservas futuras', () =>
    assert.throws(
      () => validarCambioEspacio(aula, { estado: 'mantenimiento' }, [{ id: 1, responsable: 'P1', personas: 10, inicio: '', fin: '' }]),
      incumple('R5_INTEGRIDAD_OPERACIONES'),
    ));
  test('válido: pasar a mantenimiento un espacio sin reservas futuras', () =>
    assert.doesNotThrow(() => validarCambioEspacio(aula, { estado: 'mantenimiento' }, [])));
  test('inválido: cancelar dos veces la misma reserva', () =>
    assert.throws(() => validarCancelacionReserva({ id: 1, estado: 'cancelada', fin: '2030-01-10T10:00' }, AHORA), incumple('R5_INTEGRIDAD_OPERACIONES')));
  test('inválido: devolver un equipo sin préstamo activo (doble devolución)', () =>
    assert.throws(() => validarDevolucion({ id: 1, estado: 'devuelto' }), incumple('R5_INTEGRIDAD_OPERACIONES')));
  test('inválido: devolución prevista anterior al préstamo', () =>
    assert.throws(
      () => validarFechasPrestamo({ fechaPrestamo: AHORA, devolucionPrevista: '2030-01-09T18:00' }),
      incumple('R5_INTEGRIDAD_OPERACIONES'),
    ));
  test('inválido: cambiar el estado de un equipo prestado sin registrar la devolución', () =>
    assert.throws(() => validarCambioEstadoEquipo(portatil, 'danado', { id: 3, responsable: 'Ana' }), incumple('R5_INTEGRIDAD_OPERACIONES')));
  test('válido: cambiar el estado de un equipo no prestado', () =>
    assert.doesNotThrow(() => validarCambioEstadoEquipo(portatil, 'mantenimiento', null)));
});

describe('R6 · Integridad de incidencias', () => {
  const abierta = { id: 'INC-0001', estado: 'abierta', categoria: 'red', prioridad: 'alta', area_responsable: 'soporte_ti' };

  test('válido: clasificación compatible (red -> soporte TI)', () =>
    assert.doesNotThrow(() => validarClasificacion({ categoria: 'red', prioridad: 'alta', area_responsable: 'soporte_ti' })));
  test('inválido: categoría incompatible con el área (red -> servicios generales)', () =>
    assert.throws(
      () => validarClasificacion({ categoria: 'red', prioridad: 'alta', area_responsable: 'servicios_generales' }),
      incumple('R6_INTEGRIDAD_INCIDENCIAS'),
    ));
  test('inválido: prioridad fuera del catálogo', () =>
    assert.throws(() => validarClasificacion({ categoria: 'red', prioridad: 'urgentisima', area_responsable: 'soporte_ti' }), incumple('R6_INTEGRIDAD_INCIDENCIAS')));
  test('inválido: cerrar una incidencia abierta (salta estados)', () =>
    assert.throws(() => validarTransicion(abierta, 'cerrada', { solucion: 'Se cambió el cable de red' }), incumple('R6_INTEGRIDAD_INCIDENCIAS')));
  test('inválido: poner en progreso sin persona asignada', () =>
    assert.throws(() => validarTransicion(abierta, 'en_progreso', {}), incumple('R6_INTEGRIDAD_INCIDENCIAS')));
  test('inválido: poner en progreso una incidencia sin clasificar', () =>
    assert.throws(
      () => validarTransicion({ ...abierta, categoria: null }, 'en_progreso', { asignado_a: 'Luis' }),
      incumple('R6_INTEGRIDAD_INCIDENCIAS'),
    ));
  test('válido: abierta -> en progreso con clasificación y persona asignada', () =>
    assert.doesNotThrow(() => validarTransicion(abierta, 'en_progreso', { asignado_a: 'Luis' })));
  test('inválido: resolver sin describir la solución', () =>
    assert.throws(() => validarTransicion({ ...abierta, estado: 'en_progreso' }, 'resuelta', { solucion: 'ok' }), incumple('R6_INTEGRIDAD_INCIDENCIAS')));
  test('válido: resuelta -> cerrada con solución registrada', () =>
    assert.doesNotThrow(() => validarTransicion({ ...abierta, estado: 'resuelta', solucion: 'Se reemplazó el switch del piso 2' }, 'cerrada')));
  test('inválido: modificar una incidencia cerrada', () =>
    assert.throws(() => validarTransicion({ ...abierta, estado: 'cerrada' }, 'en_progreso'), incumple('R6_INTEGRIDAD_INCIDENCIAS')));
  test('inválido: cancelar sin motivo', () =>
    assert.throws(() => validarTransicion(abierta, 'cancelada', {}), incumple('R6_INTEGRIDAD_INCIDENCIAS')));
  test('inválido: reasignar a otra área una incidencia en progreso sin nueva persona', () =>
    assert.throws(
      () =>
        validarReclasificacion(
          { ...abierta, estado: 'en_progreso', categoria: 'mobiliario', area_responsable: 'mantenimiento', asignado_a: 'Pedro' },
          { categoria: 'mobiliario', prioridad: 'media', area_responsable: 'servicios_generales' },
        ),
      incumple('R6_INTEGRIDAD_INCIDENCIAS'),
    ));
  test('válido: reasignar con nueva persona responsable', () =>
    assert.doesNotThrow(() =>
      validarReclasificacion(
        { ...abierta, estado: 'en_progreso', categoria: 'mobiliario', area_responsable: 'mantenimiento', asignado_a: 'Pedro' },
        { categoria: 'mobiliario', prioridad: 'media', area_responsable: 'servicios_generales', asignado_a: 'Marta' },
      ),
    ));
});
