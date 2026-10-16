// Módulo 2 · Recursos tecnológicos: equipos, préstamos y devoluciones.
// "Prestado" se deriva de la existencia de un préstamo activo (índice único
// en la base), nunca de una columna que pueda contradecirlo.

import { enTransaccion } from '../db/conexion.js';
import { ESTADOS_EQUIPO } from '../reglas/catalogos.js';
import { crearValidador, NoEncontradoError, ReglaNegocioError } from '../reglas/errores.js';
import {
  validarCambioEstadoEquipo,
  validarDevolucion,
  validarEquipoPrestable,
  validarFechasPrestamo,
} from '../reglas/reglasEquipos.js';
import { ahoraLocal, normalizarFechaHora } from '../utilidades/fechas.js';
import { esIdentificadorValido, limpiarTexto } from '../utilidades/texto.js';
import { diferencias, listarMovimientos, registrarMovimiento } from './auditoria.js';

function validarDatosEquipo(datos, { parcial = false } = {}) {
  const v = crearValidador();
  const limpio = {};
  if (!parcial) {
    limpio.id = limpiarTexto(datos.id, 40);
    v.exigir(esIdentificadorValido(limpio.id), 'El código del equipo es obligatorio y solo admite letras, números, guion, punto y guion bajo.');
  }
  if (!parcial || datos.nombre !== undefined) {
    limpio.nombre = limpiarTexto(datos.nombre, 120);
    v.exigir(limpio.nombre.length >= 2, 'El nombre del equipo es obligatorio.');
  }
  if (!parcial || datos.tipo !== undefined) {
    limpio.tipo = limpiarTexto(datos.tipo, 60).toLowerCase();
    v.exigir(limpio.tipo.length >= 2, 'El tipo de equipo es obligatorio (p. ej. portátil, proyector).');
  }
  if (!parcial || datos.estado !== undefined) {
    limpio.estado = datos.estado ?? 'operativo';
    v.exigir(ESTADOS_EQUIPO.includes(limpio.estado), `El estado debe ser uno de: ${ESTADOS_EQUIPO.join(', ')}.`);
  }
  if (datos.marca !== undefined) limpio.marca = limpiarTexto(datos.marca, 60) || null;
  if (datos.serial !== undefined) limpio.serial = limpiarTexto(datos.serial, 80) || null;
  if (datos.ubicacion !== undefined) limpio.ubicacion = limpiarTexto(datos.ubicacion, 120) || null;
  v.lanzarSiHayProblemas();
  return limpio;
}

// El índice único de la base es la última barrera ante dos préstamos simultáneos.
function traducirErrorDeBase(error) {
  const mensaje = String(error?.message ?? '');
  if (mensaje.includes('ux_un_prestamo_activo_por_equipo') || mensaje.includes('prestamos.equipo_id')) {
    return new ReglaNegocioError('R4_DISPONIBILIDAD_EQUIPO', 'El equipo ya tiene un préstamo activo.');
  }
  if (mensaje.includes('equipos.serial')) {
    return new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', 'Ya existe otro equipo con ese número de serie.');
  }
  return error;
}

export function crearServicioEquipos(db, { reloj = ahoraLocal } = {}) {
  const sentencias = {
    equipo: db.prepare('SELECT * FROM equipos WHERE id = ?'),
    prestamoActivo: db.prepare(`SELECT * FROM prestamos WHERE equipo_id = ? AND estado = 'activo'`),
    prestamo: db.prepare('SELECT * FROM prestamos WHERE id = ?'),
  };

  function exigirEquipo(id) {
    const equipo = sentencias.equipo.get(id);
    if (!equipo) throw new NoEncontradoError('el equipo', id);
    return equipo;
  }

  function conDisponibilidad(equipo, ahora) {
    const prestamo = sentencias.prestamoActivo.get(equipo.id) ?? null;
    const disponibilidad = prestamo ? 'prestado' : equipo.estado === 'operativo' ? 'disponible' : 'no_disponible';
    return {
      ...equipo,
      disponibilidad,
      prestamo_activo: prestamo ? { ...prestamo, vencido: Boolean(prestamo.devolucion_prevista) && prestamo.devolucion_prevista < ahora } : null,
    };
  }

  return {
    listar({ busqueda, tipo, estado, disponibilidad } = {}) {
      const ahora = reloj();
      const texto = limpiarTexto(busqueda).toLowerCase();
      return db
        .prepare('SELECT * FROM equipos ORDER BY tipo, nombre')
        .all()
        .map((e) => conDisponibilidad(e, ahora))
        .filter(
          (e) =>
            (!texto ||
              `${e.id} ${e.nombre} ${e.marca ?? ''} ${e.serial ?? ''} ${e.prestamo_activo?.responsable ?? ''}`
                .toLowerCase()
                .includes(texto)) &&
            (!tipo || e.tipo === tipo) &&
            (!estado || e.estado === estado) &&
            (!disponibilidad || e.disponibilidad === disponibilidad),
        );
    },

    obtener(id) {
      const ahora = reloj();
      const equipo = conDisponibilidad(exigirEquipo(id), ahora);
      const prestamos = db.prepare('SELECT * FROM prestamos WHERE equipo_id = ? ORDER BY id DESC LIMIT 50').all(id);
      return { ...equipo, prestamos, movimientos: listarMovimientos(db, { entidad: 'equipo', entidadId: id, limite: 30 }) };
    },

    crear(datos, operador) {
      const limpio = validarDatosEquipo(datos);
      return enTransaccion(db, () => {
        if (sentencias.equipo.get(limpio.id)) {
          throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', `Ya existe un equipo con el código "${limpio.id}".`);
        }
        const ahora = reloj();
        try {
          db.prepare(
            `INSERT INTO equipos (id, nombre, tipo, marca, serial, estado, ubicacion, origen, creado_en, actualizado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
          ).run(limpio.id, limpio.nombre, limpio.tipo, limpio.marca ?? null, limpio.serial ?? null, limpio.estado, limpio.ubicacion ?? null, ahora, ahora);
        } catch (error) {
          throw traducirErrorDeBase(error);
        }
        registrarMovimiento(db, { entidad: 'equipo', entidadId: limpio.id, accion: 'creado', detalle: limpio, operador });
        return sentencias.equipo.get(limpio.id);
      });
    },

    actualizar(id, datos, operador) {
      const cambios = validarDatosEquipo(datos, { parcial: true });
      return enTransaccion(db, () => {
        const actual = exigirEquipo(id);
        validarCambioEstadoEquipo(actual, cambios.estado, sentencias.prestamoActivo.get(id));
        const nuevo = { ...actual, ...cambios };
        try {
          db.prepare(
            'UPDATE equipos SET nombre = ?, tipo = ?, marca = ?, serial = ?, estado = ?, ubicacion = ?, actualizado_en = ? WHERE id = ?',
          ).run(nuevo.nombre, nuevo.tipo, nuevo.marca ?? null, nuevo.serial ?? null, nuevo.estado, nuevo.ubicacion ?? null, reloj(), id);
        } catch (error) {
          throw traducirErrorDeBase(error);
        }
        const detalle = diferencias(actual, cambios, ['nombre', 'tipo', 'marca', 'serial', 'estado', 'ubicacion']);
        if (Object.keys(detalle).length) {
          registrarMovimiento(db, {
            entidad: 'equipo',
            entidadId: id,
            accion: detalle.estado ? 'cambio_estado' : 'actualizado',
            detalle,
            operador,
          });
        }
        return sentencias.equipo.get(id);
      });
    },

    // Préstamo: R4 (equipo operativo y libre) + R5 (fechas coherentes).
    prestar(equipoId, datos, operador) {
      const v = crearValidador();
      const responsable = limpiarTexto(datos.responsable, 120);
      const devolucionPrevista = normalizarFechaHora(datos.devolucion_prevista);
      v.exigir(responsable.length >= 2, 'Indica la persona que recibe el equipo.');
      v.exigir(devolucionPrevista, 'La fecha prevista de devolución no es válida.');
      v.lanzarSiHayProblemas();

      return enTransaccion(db, () => {
        const equipo = exigirEquipo(equipoId);
        const fechaPrestamo = reloj();
        validarEquipoPrestable(equipo, sentencias.prestamoActivo.get(equipoId));
        validarFechasPrestamo({ fechaPrestamo, devolucionPrevista });
        let resultado;
        try {
          resultado = db
            .prepare(
              `INSERT INTO prestamos (equipo_id, responsable, documento, fecha_prestamo, devolucion_prevista, estado, observaciones, origen)
               VALUES (?, ?, ?, ?, ?, 'activo', ?, 'manual')`,
            )
            .run(
              equipoId,
              responsable,
              limpiarTexto(datos.documento, 30) || null,
              fechaPrestamo,
              devolucionPrevista,
              limpiarTexto(datos.observaciones, 300) || null,
            );
        } catch (error) {
          throw traducirErrorDeBase(error);
        }
        const detalle = { prestamo_id: Number(resultado.lastInsertRowid), responsable, devolucion_prevista: devolucionPrevista };
        registrarMovimiento(db, { entidad: 'equipo', entidadId: equipoId, accion: 'prestado', detalle, operador });
        return sentencias.prestamo.get(resultado.lastInsertRowid);
      });
    },

    // Devolución: cierra el préstamo activo y, si el equipo vuelve dañado,
    // actualiza su estado en la misma transacción (R5: sin registros contradictorios).
    devolver(equipoId, datos = {}, operador) {
      const estadoAlDevolver = datos.estado_al_devolver ?? 'operativo';
      if (!['operativo', 'danado'].includes(estadoAlDevolver)) {
        throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', 'El estado al devolver debe ser "operativo" o "danado".');
      }
      const observaciones = limpiarTexto(datos.observaciones, 300) || null;
      if (estadoAlDevolver === 'danado' && !observaciones) {
        throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', 'Describe el daño en las observaciones de la devolución.');
      }
      return enTransaccion(db, () => {
        const equipo = exigirEquipo(equipoId);
        const prestamo = sentencias.prestamoActivo.get(equipoId);
        validarDevolucion(prestamo);
        const ahora = reloj();
        db.prepare(
          `UPDATE prestamos SET estado = 'devuelto', fecha_devolucion = ?, estado_al_devolver = ?,
           observaciones = COALESCE(?, observaciones) WHERE id = ?`,
        ).run(ahora, estadoAlDevolver, observaciones, prestamo.id);
        if (estadoAlDevolver !== equipo.estado) {
          db.prepare('UPDATE equipos SET estado = ?, actualizado_en = ? WHERE id = ?').run(estadoAlDevolver, ahora, equipoId);
        }
        registrarMovimiento(db, {
          entidad: 'equipo',
          entidadId: equipoId,
          accion: 'devuelto',
          detalle: {
            prestamo_id: prestamo.id,
            responsable: prestamo.responsable,
            estado_al_devolver: estadoAlDevolver,
            con_retraso: Boolean(prestamo.devolucion_prevista) && prestamo.devolucion_prevista < ahora,
            observaciones,
          },
          operador,
        });
        return sentencias.prestamo.get(prestamo.id);
      });
    },

    listarPrestamos({ estado } = {}) {
      const ahora = reloj();
      const filas = db
        .prepare(
          `SELECT p.*, e.nombre AS equipo_nombre, e.tipo AS equipo_tipo FROM prestamos p
           JOIN equipos e ON e.id = p.equipo_id ${estado ? 'WHERE p.estado = ?' : ''} ORDER BY p.id DESC LIMIT 500`,
        )
        .all(...(estado ? [estado] : []));
      return filas.map((p) => ({ ...p, vencido: p.estado === 'activo' && Boolean(p.devolucion_prevista) && p.devolucion_prevista < ahora }));
    },

    resumen() {
      const equipos = this.listar();
      return {
        total: equipos.length,
        disponibles: equipos.filter((e) => e.disponibilidad === 'disponible').length,
        prestados: equipos.filter((e) => e.disponibilidad === 'prestado').length,
        vencidos: equipos.filter((e) => e.prestamo_activo?.vencido).length,
        danados: equipos.filter((e) => e.estado === 'danado').length,
        no_disponibles: equipos.filter((e) => e.disponibilidad === 'no_disponible').length,
      };
    },
  };
}
