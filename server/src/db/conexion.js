// Persistencia en SQLite con el módulo nativo node:sqlite (Node >= 22.13).
// Decisión de diseño: evita dependencias nativas que haya que compilar
// (better-sqlite3) y deja toda la operación en un único archivo data/campus.db.
// Los archivos oficiales de data/oficial nunca se escriben: el importador los
// lee y vuelca su contenido validado en esta base.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
export const RAIZ_PROYECTO = resolve(aqui, '../../..');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS espacios (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  tipo           TEXT NOT NULL,
  capacidad      INTEGER NOT NULL CHECK (capacidad > 0),
  estado         TEXT NOT NULL,
  ubicacion      TEXT,
  origen         TEXT NOT NULL DEFAULT 'manual',
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  espacio_id         TEXT NOT NULL REFERENCES espacios(id),
  responsable        TEXT NOT NULL,
  motivo             TEXT,
  personas           INTEGER NOT NULL CHECK (personas > 0),
  inicio             TEXT NOT NULL,
  fin                TEXT NOT NULL,
  estado             TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cancelada')),
  motivo_cancelacion TEXT,
  id_origen          TEXT,
  origen             TEXT NOT NULL DEFAULT 'manual',
  creado_en          TEXT NOT NULL,
  CHECK (fin > inicio)
);
CREATE INDEX IF NOT EXISTS ix_reservas_espacio ON reservas(espacio_id, estado, inicio);

CREATE TABLE IF NOT EXISTS equipos (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  tipo           TEXT NOT NULL,
  marca          TEXT,
  serial         TEXT UNIQUE,
  estado         TEXT NOT NULL,
  ubicacion      TEXT,
  origen         TEXT NOT NULL DEFAULT 'manual',
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prestamos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id           TEXT NOT NULL REFERENCES equipos(id),
  responsable         TEXT NOT NULL,
  documento           TEXT,
  fecha_prestamo      TEXT NOT NULL,
  -- Puede faltar solo en préstamos importados cuyo archivo oficial no la trae;
  -- el servicio la exige en todo préstamo nuevo.
  devolucion_prevista TEXT,
  fecha_devolucion    TEXT,
  estado              TEXT NOT NULL CHECK (estado IN ('activo', 'devuelto')),
  estado_al_devolver  TEXT,
  observaciones       TEXT,
  id_origen           TEXT,
  origen              TEXT NOT NULL DEFAULT 'manual',
  -- Un préstamo activo no tiene fecha de devolución y uno devuelto sí: nunca ambos.
  CHECK ((estado = 'activo' AND fecha_devolucion IS NULL) OR (estado = 'devuelto' AND fecha_devolucion IS NOT NULL))
);
-- R4/R5 reforzada en la base: como máximo un préstamo activo por equipo,
-- aunque dos peticiones lleguen al mismo tiempo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_un_prestamo_activo_por_equipo
  ON prestamos(equipo_id) WHERE estado = 'activo';

CREATE TABLE IF NOT EXISTS incidencias (
  id                   TEXT PRIMARY KEY,
  titulo               TEXT NOT NULL,
  descripcion          TEXT NOT NULL,
  categoria            TEXT,
  prioridad            TEXT,
  area_responsable     TEXT,
  estado               TEXT NOT NULL,
  espacio_id           TEXT REFERENCES espacios(id),
  equipo_id            TEXT REFERENCES equipos(id),
  reportado_por        TEXT,
  asignado_a           TEXT,
  solucion             TEXT,
  motivo_cancelacion   TEXT,
  origen_clasificacion TEXT,
  ia_sugerencia        TEXT,
  ia_modelo            TEXT,
  ia_generada_en       TEXT,
  ia_decision          TEXT,
  origen               TEXT NOT NULL DEFAULT 'manual',
  creado_en            TEXT NOT NULL,
  actualizado_en       TEXT NOT NULL,
  cerrado_en           TEXT
);

-- Trazabilidad: cada operación (y cada intento rechazado por una regla) queda aquí.
CREATE TABLE IF NOT EXISTS movimientos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha      TEXT NOT NULL,
  entidad    TEXT NOT NULL,
  entidad_id TEXT NOT NULL,
  accion     TEXT NOT NULL,
  detalle    TEXT,
  operador   TEXT
);
CREATE INDEX IF NOT EXISTS ix_movimientos_entidad ON movimientos(entidad, entidad_id);

CREATE TABLE IF NOT EXISTS importaciones (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha   TEXT NOT NULL,
  modo    TEXT NOT NULL,
  reporte TEXT NOT NULL
);
`;

export function abrirBaseDeDatos(ruta = process.env.DB_PATH || resolve(RAIZ_PROYECTO, 'data/campus.db')) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  db.exec(ESQUEMA);
  return db;
}

// Ejecuta fn dentro de una transacción: o se guardan todos los cambios de la
// operación (p. ej. préstamo + movimiento de auditoría) o ninguno.
export function enTransaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
