// Pruebas de integración: servicios + base SQLite en memoria + reloj fijo.
// Demuestran que las reglas se aplican de verdad en las operaciones y que la
// base queda coherente (sin registros contradictorios) tras cada rechazo.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { crearApp } from '../src/app.js';
import { ReglaNegocioError } from '../src/reglas/errores.js';
import { crearServicioEspacios } from '../src/servicios/espacios.js';
import { crearServicioEquipos } from '../src/servicios/equipos.js';
import { crearServicioIncidencias } from '../src/servicios/incidencias.js';
import { crearTriaje } from '../src/ia/triaje.js';
import { IAError } from '../src/ia/errores.js';

const reloj = () => '2030-01-10T07:00';
const incumple = (regla) => (e) => e instanceof ReglaNegocioError && e.regla === regla;

describe('Espacios y reservas (R1, R2, R3, R5)', () => {
  const db = abrirBaseDeDatos(':memory:');
  const espacios = crearServicioEspacios(db, { reloj });

  before(() => {
    espacios.crear({ id: 'A-101', nombre: 'Aula 101', tipo: 'aula', capacidad: 30 }, 'prueba');
    espacios.crear({ id: 'C-01', nombre: 'Cubículo 1', tipo: 'cubiculo', capacidad: 4 }, 'prueba');
    espacios.crear({ id: 'A-102', nombre: 'Aula 102', tipo: 'aula', capacidad: 40, estado: 'mantenimiento' }, 'prueba');
  });

  test('reserva válida y luego una que se cruza', () => {
    const r = espacios.reservar('A-101', { responsable: 'Grupo P1', personas: 25, inicio: '2030-01-10T08:00', fin: '2030-01-10T10:00' }, 'prueba');
    assert.equal(r.estado, 'activa');
    assert.throws(
      () => espacios.reservar('A-101', { responsable: 'Grupo P2', personas: 10, inicio: '2030-01-10T09:30', fin: '2030-01-10T11:00' }, 'prueba'),
      incumple('R2_CRUCE_HORARIO'),
    );
    // La reserva rechazada no quedó guardada.
    assert.equal(db.prepare('SELECT COUNT(*) n FROM reservas').get().n, 1);
  });

  test('aforo excedido en cubículo', () =>
    assert.throws(
      () => espacios.reservar('C-01', { responsable: 'Equipo X', personas: 6, inicio: '2030-01-10T08:00', fin: '2030-01-10T09:00' }, 'prueba'),
      incumple('R1_AFORO'),
    ));

  test('espacio en mantenimiento no admite reservas', () =>
    assert.throws(
      () => espacios.reservar('A-102', { responsable: 'Grupo P3', personas: 10, inicio: '2030-01-10T08:00', fin: '2030-01-10T09:00' }, 'prueba'),
      incumple('R3_ESTADO_ESPACIO'),
    ));

  test('no se pasa a mantenimiento un espacio con reservas futuras; tras cancelarlas sí', () => {
    assert.throws(() => espacios.actualizar('A-101', { estado: 'mantenimiento' }, 'prueba'), incumple('R5_INTEGRIDAD_OPERACIONES'));
    const [reserva] = espacios.listarReservas({ espacioId: 'A-101', estado: 'activa' });
    espacios.cancelarReserva(reserva.id, { motivo: 'Cambio de horario del grupo' }, 'prueba');
    assert.equal(espacios.actualizar('A-101', { estado: 'mantenimiento' }, 'prueba').estado, 'mantenimiento');
    assert.throws(() => espacios.cancelarReserva(reserva.id, { motivo: 'otra vez' }, 'prueba'), incumple('R5_INTEGRIDAD_OPERACIONES'));
  });

  test('asistente de asignación descarta por aforo y estado', () => {
    const { compatibles, descartados } = espacios.sugerir({ personas: 5, inicio: '2030-01-10T12:00', fin: '2030-01-10T13:00' });
    assert.deepEqual(compatibles.map((e) => e.id), []);
    assert.deepEqual(descartados.map((d) => [d.id, d.regla]).sort(), [
      ['A-101', 'R3_ESTADO_ESPACIO'],
      ['A-102', 'R3_ESTADO_ESPACIO'],
      ['C-01', 'R1_AFORO'],
    ]);
  });

  test('trazabilidad: cada operación quedó registrada', () => {
    const acciones = db.prepare(`SELECT accion FROM movimientos ORDER BY id`).all().map((m) => m.accion);
    assert.deepEqual(acciones, ['creado', 'creado', 'creado', 'creada', 'cancelada', 'cambio_estado']);
  });
});

describe('Equipos y préstamos (R4, R5)', () => {
  const db = abrirBaseDeDatos(':memory:');
  const equipos = crearServicioEquipos(db, { reloj });

  before(() => {
    equipos.crear({ id: 'PC-01', nombre: 'Portátil Lenovo 01', tipo: 'portatil', serial: 'SN-1' }, 'prueba');
    equipos.crear({ id: 'PRY-01', nombre: 'Proyector Epson', tipo: 'proyector', estado: 'danado' }, 'prueba');
  });

  test('serial duplicado se rechaza', () =>
    assert.throws(() => equipos.crear({ id: 'PC-02', nombre: 'Portátil 02', tipo: 'portatil', serial: 'SN-1' }, 'prueba'), incumple('R5_INTEGRIDAD_OPERACIONES')));

  test('préstamo válido, segundo préstamo rechazado, devolución dañado bloquea nuevo préstamo', () => {
    equipos.prestar('PC-01', { responsable: 'Ana Gómez', devolucion_prevista: '2030-01-10T18:00' }, 'prueba');
    assert.equal(equipos.obtener('PC-01').disponibilidad, 'prestado');
    assert.throws(() => equipos.prestar('PC-01', { responsable: 'Luis', devolucion_prevista: '2030-01-10T18:00' }, 'prueba'), incumple('R4_DISPONIBILIDAD_EQUIPO'));
    assert.throws(() => equipos.actualizar('PC-01', { estado: 'inhabilitado' }, 'prueba'), incumple('R5_INTEGRIDAD_OPERACIONES'));
    equipos.devolver('PC-01', { estado_al_devolver: 'danado', observaciones: 'Pantalla rota' }, 'prueba');
    assert.equal(equipos.obtener('PC-01').estado, 'danado');
    assert.throws(() => equipos.devolver('PC-01', {}, 'prueba'), incumple('R5_INTEGRIDAD_OPERACIONES'));
    assert.throws(() => equipos.prestar('PC-01', { responsable: 'Luis', devolucion_prevista: '2030-01-10T18:00' }, 'prueba'), incumple('R4_DISPONIBILIDAD_EQUIPO'));
  });

  test('equipo dañado no se presta', () =>
    assert.throws(() => equipos.prestar('PRY-01', { responsable: 'Ana', devolucion_prevista: '2030-01-10T18:00' }, 'prueba'), incumple('R4_DISPONIBILIDAD_EQUIPO')));

  test('la base impide dos préstamos activos del mismo equipo aunque se salte el servicio', () => {
    equipos.actualizar('PC-01', { estado: 'operativo' }, 'prueba');
    equipos.prestar('PC-01', { responsable: 'Ana', devolucion_prevista: '2030-01-10T18:00' }, 'prueba');
    assert.throws(() =>
      db.prepare(`INSERT INTO prestamos (equipo_id, responsable, fecha_prestamo, devolucion_prevista, estado) VALUES ('PC-01', 'X', ?, ?, 'activo')`)
        .run('2030-01-10T07:00', '2030-01-10T09:00'),
    );
  });
});

describe('Incidencias con IA (R6 y separación IA / reglas)', () => {
  const db = abrirBaseDeDatos(':memory:');
  const entorno = { IA_PROVEEDOR: 'anthropic', IA_MODELO: 'modelo-de-prueba', IA_API_KEY: 'clave-de-prueba' };
  // Proveedor sustituido SOLO en pruebas para controlar la respuesta del modelo.
  let respuestaModelo = '';
  const triaje = crearTriaje({ entorno, solicitar: async () => ({ texto: respuestaModelo, modelo: 'modelo-de-prueba' }) });
  const incidencias = crearServicioIncidencias(db, { reloj, triaje });
  let id;

  before(() => {
    id = incidencias.crear({ titulo: 'Sin internet en aula 101', descripcion: 'El wifi del aula 101 no conecta desde la mañana.' }, 'prueba').id;
  });

  test('respuesta de IA con formato inválido -> error claro y la incidencia no cambia', async () => {
    respuestaModelo = 'Claro, te recomiendo revisar el router.';
    await assert.rejects(incidencias.analizarConIA(id, 'prueba'), (e) => e instanceof IAError && e.codigo === 'respuesta_invalida');
    respuestaModelo = JSON.stringify({ categoria: 'red', prioridad: 'altisima', area_responsable: 'soporte_ti' });
    await assert.rejects(incidencias.analizarConIA(id, 'prueba'), (e) => e instanceof IAError && e.codigo === 'respuesta_invalida');
    const inc = incidencias.obtener(id);
    assert.equal(inc.categoria, null);
    assert.ok(inc.movimientos.some((m) => m.accion === 'ia_fallo'));
  });

  test('sugerencia que incumple R6 se marca y no puede aplicarse', async () => {
    respuestaModelo = JSON.stringify({
      categoria: 'red', prioridad: 'alta', area_responsable: 'servicios_generales',
      justificacion: 'Falla de conectividad que afecta una clase.', acciones_recomendadas: ['Reiniciar el punto de acceso'],
      requiere_atencion_inmediata: false, confianza: 0.8,
    });
    const { resultado } = await incidencias.analizarConIA(id, 'prueba');
    assert.equal(resultado.validacion_reglas.cumple, false);
    assert.throws(() => incidencias.clasificar(id, resultado.sugerencia, 'prueba'), incumple('R6_INTEGRIDAD_INCIDENCIAS'));
  });

  test('sugerencia válida: se acepta y queda trazado que vino de la IA', async () => {
    respuestaModelo = JSON.stringify({
      categoria: 'red', prioridad: 'alta', area_responsable: 'soporte_ti',
      justificacion: 'Falla de conectividad que afecta una clase.', acciones_recomendadas: ['Revisar el punto de acceso'],
      requiere_atencion_inmediata: true, confianza: 0.9,
    });
    const { resultado } = await incidencias.analizarConIA(id, 'prueba');
    assert.equal(resultado.validacion_reglas.cumple, true);
    const inc = incidencias.clasificar(id, resultado.sugerencia, 'prueba');
    assert.equal(inc.origen_clasificacion, 'ia');
    assert.equal(inc.ia_decision, 'aceptada');
  });

  test('ciclo de vida completo y bloqueo tras cerrar', () => {
    assert.throws(() => incidencias.cambiarEstado(id, { estado: 'cerrada' }, 'prueba'), incumple('R6_INTEGRIDAD_INCIDENCIAS'));
    incidencias.cambiarEstado(id, { estado: 'en_progreso', asignado_a: 'Luis (TI)' }, 'prueba');
    incidencias.cambiarEstado(id, { estado: 'resuelta', solucion: 'Se reinició y reconfiguró el AP del aula.' }, 'prueba');
    const cerrada = incidencias.cambiarEstado(id, { estado: 'cerrada' }, 'prueba');
    assert.equal(cerrada.estado, 'cerrada');
    assert.ok(cerrada.cerrado_en);
    assert.throws(() => incidencias.clasificar(id, { categoria: 'red', prioridad: 'baja', area_responsable: 'soporte_ti' }, 'prueba'), incumple('R6_INTEGRIDAD_INCIDENCIAS'));
  });

  test('IA no configurada -> error "no_configurada" (procedimiento manual disponible)', async () => {
    const sinIA = crearTriaje({ entorno: {} });
    await assert.rejects(sinIA.analizar({ titulo: 'x', descripcion: 'y' }), (e) => e instanceof IAError && e.codigo === 'no_configurada');
    const manual = incidencias.crear(
      { titulo: 'Silla rota', descripcion: 'Silla rota en el cubículo 3', categoria: 'mobiliario', prioridad: 'baja', area_responsable: 'servicios_generales' },
      'prueba',
    );
    assert.equal(manual.origen_clasificacion, 'manual');
  });

  test('tiempo de espera agotado se reporta como tal', async () => {
    const lento = crearTriaje({
      entorno,
      solicitar: async () => {
        throw new IAError('tiempo_agotado');
      },
    });
    await assert.rejects(lento.analizar({ titulo: 'x', descripcion: 'y' }), (e) => e.codigo === 'tiempo_agotado' && e.status === 504);
  });
});

describe('API HTTP', () => {
  test('una regla incumplida responde 409 con el código de la regla y queda en la trazabilidad', async () => {
    const db = abrirBaseDeDatos(':memory:');
    const servidor = crearApp(db, { reloj, entorno: {} }).listen(0);
    const base = `http://127.0.0.1:${servidor.address().port}/api`;
    try {
      const json = { 'Content-Type': 'application/json', 'X-Operador': 'Jurado' };
      await fetch(`${base}/espacios`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'C-02', nombre: 'Cubículo 2', tipo: 'cubiculo', capacidad: 4 }) });
      const r = await fetch(`${base}/espacios/C-02/reservas`, {
        method: 'POST', headers: json, body: JSON.stringify({ responsable: 'Equipo', personas: 9, inicio: '2030-01-10T08:00', fin: '2030-01-10T09:00' }),
      });
      assert.equal(r.status, 409);
      assert.equal((await r.json()).regla, 'R1_AFORO');
      const movimientos = await (await fetch(`${base}/movimientos?accion=operacion_rechazada`)).json();
      assert.equal(movimientos[0].operador, 'Jurado');
      const invalido = await fetch(`${base}/espacios`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'mal id!', capacidad: -3 }) });
      assert.equal(invalido.status, 422);
      const ia = await fetch(`${base}/ia/triaje`, { method: 'POST', headers: json, body: JSON.stringify({ titulo: 'Proyector', descripcion: 'No enciende el proyector' }) });
      assert.equal(ia.status, 503);
      assert.equal((await ia.json()).codigo, 'no_configurada');
    } finally {
      servidor.close();
    }
  });
});
