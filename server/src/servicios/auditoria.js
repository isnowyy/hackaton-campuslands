// Trazabilidad: registro inmutable de operaciones en la tabla movimientos.
// Los servicios lo llaman dentro de la misma transacción que la operación,
// así nunca queda una operación sin su registro ni un registro sin operación.

import { ahoraLocal } from '../utilidades/fechas.js';

export function registrarMovimiento(db, { entidad, entidadId, accion, detalle, operador }) {
  db.prepare(
    'INSERT INTO movimientos (fecha, entidad, entidad_id, accion, detalle, operador) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(ahoraLocal(), entidad, String(entidadId), accion, detalle ? JSON.stringify(detalle) : null, operador ?? 'sistema');
}

export function listarMovimientos(db, { entidad, entidadId, accion, limite = 100 } = {}) {
  const condiciones = [];
  const parametros = [];
  if (entidad) {
    condiciones.push('entidad = ?');
    parametros.push(entidad);
  }
  if (entidadId) {
    condiciones.push('entidad_id = ?');
    parametros.push(String(entidadId));
  }
  if (accion) {
    condiciones.push('accion = ?');
    parametros.push(accion);
  }
  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = db
    .prepare(`SELECT * FROM movimientos ${donde} ORDER BY id DESC LIMIT ?`)
    .all(...parametros, Math.min(Math.max(Number(limite) || 100, 1), 500));
  return filas.map((f) => ({ ...f, detalle: f.detalle ? JSON.parse(f.detalle) : null }));
}

// Devuelve los cambios entre dos versiones de un registro para guardarlos en el detalle.
export function diferencias(antes, despues, campos) {
  const cambios = {};
  for (const campo of campos) {
    if (despues[campo] !== undefined && despues[campo] !== antes[campo]) {
      cambios[campo] = { antes: antes[campo], despues: despues[campo] };
    }
  }
  return cambios;
}
