// Módulo 1 · Gestión de espacios (aulas y cubículos) y sus reservas.
// El servicio consulta la base, delega la decisión en las reglas puras de
// reglas/reglasEspacios.js y guarda operación + trazabilidad en una transacción.

import { enTransaccion } from '../db/conexion.js';
import { ESTADOS_ESPACIO, TIPOS_ESPACIO } from '../reglas/catalogos.js';
import { crearValidador, NoEncontradoError, ReglaNegocioError } from '../reglas/errores.js';
import {
  validarCambioEspacio,
  validarCancelacionReserva,
  validarNuevaReserva,
} from '../reglas/reglasEspacios.js';
import { ahoraLocal, finDelDia, inicioDelDia, normalizarFechaHora } from '../utilidades/fechas.js';
import { esIdentificadorValido, limpiarTexto } from '../utilidades/texto.js';
import { diferencias, listarMovimientos, registrarMovimiento } from './auditoria.js';

const CAPACIDAD_MAXIMA = 1000;

function leerEntero(valor) {
  if (typeof valor === 'number') return Number.isInteger(valor) ? valor : NaN;
  if (typeof valor === 'string' && /^\s*\d+\s*$/.test(valor)) return Number(valor);
  return NaN;
}

// Valida forma y catálogo de los datos de un espacio. `parcial` permite
// actualizaciones que solo traen algunos campos.
function validarDatosEspacio(datos, { parcial = false } = {}) {
  const v = crearValidador();
  const limpio = {};
  if (!parcial) {
    limpio.id = limpiarTexto(datos.id, 40);
    v.exigir(esIdentificadorValido(limpio.id), 'El código del espacio es obligatorio y solo admite letras, números, guion, punto y guion bajo.');
  }
  if (!parcial || datos.nombre !== undefined) {
    limpio.nombre = limpiarTexto(datos.nombre, 120);
    v.exigir(limpio.nombre.length >= 2, 'El nombre del espacio es obligatorio.');
  }
  if (!parcial || datos.tipo !== undefined) {
    limpio.tipo = datos.tipo;
    v.exigir(TIPOS_ESPACIO.includes(datos.tipo), `El tipo debe ser uno de: ${TIPOS_ESPACIO.join(', ')}.`);
  }
  if (!parcial || datos.capacidad !== undefined) {
    limpio.capacidad = leerEntero(datos.capacidad);
    v.exigir(
      limpio.capacidad > 0 && limpio.capacidad <= CAPACIDAD_MAXIMA,
      `La capacidad debe ser un número entero entre 1 y ${CAPACIDAD_MAXIMA}.`,
    );
  }
  if (!parcial || datos.estado !== undefined) {
    limpio.estado = datos.estado ?? 'disponible';
    v.exigir(ESTADOS_ESPACIO.includes(limpio.estado), `El estado debe ser uno de: ${ESTADOS_ESPACIO.join(', ')}.`);
  }
  if (datos.ubicacion !== undefined) limpio.ubicacion = limpiarTexto(datos.ubicacion, 120) || null;
  v.lanzarSiHayProblemas();
  return limpio;
}

function validarDatosReserva(datos) {
  const v = crearValidador();
  const responsable = limpiarTexto(datos.responsable, 120);
  const personas = leerEntero(datos.personas);
  const inicio = normalizarFechaHora(datos.inicio);
  const fin = normalizarFechaHora(datos.fin);
  v.exigir(responsable.length >= 2, 'Indica la persona o grupo responsable de la reserva.');
  v.exigir(personas > 0, 'El número de personas debe ser un entero mayor que cero.');
  v.exigir(inicio, 'La fecha y hora de inicio no es válida.');
  v.exigir(fin, 'La fecha y hora de fin no es válida.');
  v.lanzarSiHayProblemas();
  return { responsable, personas, inicio, fin, motivo: limpiarTexto(datos.motivo, 200) || null };
}

export function crearServicioEspacios(db, { reloj = ahoraLocal } = {}) {
  const sentencias = {
    espacio: db.prepare('SELECT * FROM espacios WHERE id = ?'),
    reserva: db.prepare('SELECT * FROM reservas WHERE id = ?'),
    // Reservas activas que se superponen con [inicio, fin) — candidatas a R2.
    cruces: db.prepare(
      `SELECT * FROM reservas WHERE espacio_id = ? AND estado = 'activa' AND inicio < ? AND fin > ? ORDER BY inicio`,
    ),
    futuras: db.prepare(`SELECT * FROM reservas WHERE espacio_id = ? AND estado = 'activa' AND fin > ? ORDER BY inicio`),
  };

  function exigirEspacio(id) {
    const espacio = sentencias.espacio.get(id);
    if (!espacio) throw new NoEncontradoError('el espacio', id);
    return espacio;
  }

  // Disponibilidad en este momento: libre, ocupado (reserva en curso) o no_disponible (por estado).
  function conDisponibilidad(espacio, ahora) {
    const actual = db
      .prepare(`SELECT id, responsable, inicio, fin, personas FROM reservas WHERE espacio_id = ? AND estado = 'activa' AND inicio <= ? AND fin > ? LIMIT 1`)
      .get(espacio.id, ahora, ahora);
    const proxima = db
      .prepare(`SELECT id, responsable, inicio, fin, personas FROM reservas WHERE espacio_id = ? AND estado = 'activa' AND inicio > ? ORDER BY inicio LIMIT 1`)
      .get(espacio.id, ahora);
    const disponibilidad = espacio.estado !== 'disponible' ? 'no_disponible' : actual ? 'ocupado' : 'libre';
    return { ...espacio, disponibilidad, reserva_actual: actual ?? null, proxima_reserva: proxima ?? null };
  }

  return {
    listar({ busqueda, tipo, estado, disponibilidad } = {}) {
      const ahora = reloj();
      const texto = limpiarTexto(busqueda).toLowerCase();
      return db
        .prepare('SELECT * FROM espacios ORDER BY tipo, nombre')
        .all()
        .map((e) => conDisponibilidad(e, ahora))
        .filter(
          (e) =>
            (!texto || `${e.id} ${e.nombre} ${e.ubicacion ?? ''}`.toLowerCase().includes(texto)) &&
            (!tipo || e.tipo === tipo) &&
            (!estado || e.estado === estado) &&
            (!disponibilidad || e.disponibilidad === disponibilidad),
        );
    },

    obtener(id) {
      const ahora = reloj();
      const espacio = conDisponibilidad(exigirEspacio(id), ahora);
      const reservas = db
        .prepare('SELECT * FROM reservas WHERE espacio_id = ? ORDER BY inicio DESC LIMIT 50')
        .all(id)
        .map((r) => ({ ...r, finalizada: r.fin <= ahora }));
      return { ...espacio, reservas, movimientos: listarMovimientos(db, { entidad: 'espacio', entidadId: id, limite: 30 }) };
    },

    crear(datos, operador) {
      const limpio = validarDatosEspacio(datos);
      return enTransaccion(db, () => {
        if (sentencias.espacio.get(limpio.id)) {
          throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', `Ya existe un espacio con el código "${limpio.id}".`);
        }
        const ahora = reloj();
        db.prepare(
          `INSERT INTO espacios (id, nombre, tipo, capacidad, estado, ubicacion, origen, creado_en, actualizado_en)
           VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
        ).run(limpio.id, limpio.nombre, limpio.tipo, limpio.capacidad, limpio.estado, limpio.ubicacion ?? null, ahora, ahora);
        registrarMovimiento(db, { entidad: 'espacio', entidadId: limpio.id, accion: 'creado', detalle: limpio, operador });
        return sentencias.espacio.get(limpio.id);
      });
    },

    actualizar(id, datos, operador) {
      const cambios = validarDatosEspacio(datos, { parcial: true });
      return enTransaccion(db, () => {
        const actual = exigirEspacio(id);
        const ahora = reloj();
        validarCambioEspacio(actual, cambios, sentencias.futuras.all(id, ahora));
        const nuevo = { ...actual, ...cambios };
        db.prepare(
          'UPDATE espacios SET nombre = ?, tipo = ?, capacidad = ?, estado = ?, ubicacion = ?, actualizado_en = ? WHERE id = ?',
        ).run(nuevo.nombre, nuevo.tipo, nuevo.capacidad, nuevo.estado, nuevo.ubicacion ?? null, ahora, id);
        const detalle = diferencias(actual, cambios, ['nombre', 'tipo', 'capacidad', 'estado', 'ubicacion']);
        if (Object.keys(detalle).length) {
          const accion = detalle.estado ? 'cambio_estado' : 'actualizado';
          registrarMovimiento(db, { entidad: 'espacio', entidadId: id, accion, detalle, operador });
        }
        return sentencias.espacio.get(id);
      });
    },

    // Asignación de un espacio: aplica R1, R2, R3 y R5 antes de insertar.
    reservar(espacioId, datos, operador) {
      const reserva = validarDatosReserva(datos);
      return enTransaccion(db, () => {
        const espacio = exigirEspacio(espacioId);
        validarNuevaReserva({
          espacio,
          ...reserva,
          reservasActivas: sentencias.cruces.all(espacioId, reserva.fin, reserva.inicio),
          ahora: reloj(),
        });
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO reservas (espacio_id, responsable, motivo, personas, inicio, fin, estado, origen, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, 'activa', 'manual', ?)`,
          )
          .run(espacioId, reserva.responsable, reserva.motivo, reserva.personas, reserva.inicio, reserva.fin, reloj());
        registrarMovimiento(db, {
          entidad: 'reserva',
          entidadId: lastInsertRowid,
          accion: 'creada',
          detalle: { espacio_id: espacioId, ...reserva },
          operador,
        });
        return sentencias.reserva.get(lastInsertRowid);
      });
    },

    cancelarReserva(reservaId, { motivo } = {}, operador) {
      const motivoLimpio = limpiarTexto(motivo, 200);
      if (motivoLimpio.length < 5) {
        throw new ReglaNegocioError('R5_INTEGRIDAD_OPERACIONES', 'Indica el motivo de la cancelación (mínimo 5 caracteres).');
      }
      return enTransaccion(db, () => {
        const reserva = sentencias.reserva.get(reservaId);
        if (!reserva) throw new NoEncontradoError('la reserva', reservaId);
        validarCancelacionReserva(reserva, reloj());
        db.prepare(`UPDATE reservas SET estado = 'cancelada', motivo_cancelacion = ? WHERE id = ?`).run(motivoLimpio, reservaId);
        registrarMovimiento(db, {
          entidad: 'reserva',
          entidadId: reservaId,
          accion: 'cancelada',
          detalle: { espacio_id: reserva.espacio_id, motivo: motivoLimpio },
          operador,
        });
        return sentencias.reserva.get(reservaId);
      });
    },

    listarReservas({ espacioId, desde, hasta, estado } = {}) {
      const ahora = reloj();
      const condiciones = [];
      const parametros = [];
      if (espacioId) {
        condiciones.push('r.espacio_id = ?');
        parametros.push(espacioId);
      }
      if (estado) {
        condiciones.push('r.estado = ?');
        parametros.push(estado);
      }
      const d = normalizarFechaHora(desde);
      const h = normalizarFechaHora(hasta, '23:59');
      if (d) {
        condiciones.push('r.fin > ?');
        parametros.push(d);
      }
      if (h) {
        condiciones.push('r.inicio < ?');
        parametros.push(h);
      }
      const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
      return db
        .prepare(
          `SELECT r.*, e.nombre AS espacio_nombre, e.tipo AS espacio_tipo FROM reservas r
           JOIN espacios e ON e.id = r.espacio_id ${donde} ORDER BY r.inicio LIMIT 500`,
        )
        .all(...parametros)
        .map((r) => ({ ...r, finalizada: r.fin <= ahora, en_curso: r.inicio <= ahora && r.fin > ahora }));
    },

    // Asistente de asignación: evalúa todos los espacios con las mismas reglas
    // que una reserva real y devuelve los compatibles (el más ajustado primero)
    // y los descartados con el motivo de cada uno.
    sugerir({ personas, inicio, fin, tipo }) {
      const pedido = validarDatosReserva({ responsable: 'consulta', personas, inicio, fin });
      const ahora = reloj();
      const compatibles = [];
      const descartados = [];
      for (const espacio of db.prepare('SELECT * FROM espacios ORDER BY capacidad, nombre').all()) {
        if (tipo && espacio.tipo !== tipo) continue;
        try {
          validarNuevaReserva({
            espacio,
            ...pedido,
            reservasActivas: sentencias.cruces.all(espacio.id, pedido.fin, pedido.inicio),
            ahora,
          });
          compatibles.push({ ...espacio, sobrantes: espacio.capacidad - pedido.personas });
        } catch (error) {
          if (!(error instanceof ReglaNegocioError)) throw error;
          descartados.push({ ...espacio, regla: error.regla, nombre_regla: error.nombreRegla, motivo: error.message });
        }
      }
      return { pedido, compatibles, descartados };
    },

    resumen() {
      const ahora = reloj();
      const espacios = this.listar();
      const reservasHoy = db
        .prepare(`SELECT COUNT(*) AS n FROM reservas WHERE estado = 'activa' AND inicio < ? AND fin > ?`)
        .get(finDelDia(ahora), inicioDelDia(ahora)).n;
      return {
        total: espacios.length,
        libres: espacios.filter((e) => e.disponibilidad === 'libre').length,
        ocupados: espacios.filter((e) => e.disponibilidad === 'ocupado').length,
        no_disponibles: espacios.filter((e) => e.disponibilidad === 'no_disponible').length,
        reservas_hoy: reservasHoy,
      };
    },
  };
}
