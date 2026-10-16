// Módulo 3 · Incidencias y solicitudes con triaje de IA.
// Flujo: registrar -> (opcional) pedir sugerencia a la IA -> una persona la
// revisa y aplica, edita o descarta -> atender -> resolver -> cerrar.
// La clasificación final siempre pasa por validarReclasificacion (R6), sea
// cual sea su origen, y queda marcado si vino de la IA, de la IA editada o
// de una persona.

import { enTransaccion } from '../db/conexion.js';
import { ESTADOS_FINALES_INCIDENCIA } from '../reglas/catalogos.js';
import { crearValidador, NoEncontradoError, ReglaNegocioError } from '../reglas/errores.js';
import {
  validarClasificacion,
  validarIncidenciaModificable,
  validarReclasificacion,
  validarTransicion,
} from '../reglas/reglasIncidencias.js';
import { IAError } from '../ia/errores.js';
import { recuperarSugerencia } from '../ia/triaje.js';
import { ahoraLocal } from '../utilidades/fechas.js';
import { limpiarTexto, limpiarTextoLargo } from '../utilidades/texto.js';
import { diferencias, listarMovimientos, registrarMovimiento } from './auditoria.js';

const CAMPOS_CLASIFICACION = ['categoria', 'prioridad', 'area_responsable'];
const ORDEN_PRIORIDAD = { critica: 0, alta: 1, media: 2, baja: 3 };

// Compara la clasificación final con la sugerida para dejar constancia de si
// la persona aceptó la propuesta tal cual o la modificó.
function origenDeClasificacion(sugerencia, final) {
  if (!sugerencia) return { origen: 'manual', decision: null };
  const igual = CAMPOS_CLASIFICACION.every((campo) => sugerencia[campo] === final[campo]);
  return igual ? { origen: 'ia', decision: 'aceptada' } : { origen: 'ia_editada', decision: 'editada' };
}

function desdeFila(fila) {
  if (!fila) return fila;
  return { ...fila, ia_sugerencia: fila.ia_sugerencia ? JSON.parse(fila.ia_sugerencia) : null };
}

export function crearServicioIncidencias(db, { reloj = ahoraLocal, triaje } = {}) {
  const sentencias = {
    incidencia: db.prepare('SELECT * FROM incidencias WHERE id = ?'),
    espacio: db.prepare('SELECT * FROM espacios WHERE id = ?'),
    equipo: db.prepare('SELECT * FROM equipos WHERE id = ?'),
  };

  function exigirIncidencia(id) {
    const fila = sentencias.incidencia.get(id);
    if (!fila) throw new NoEncontradoError('la incidencia', id);
    return desdeFila(fila);
  }

  function siguienteId() {
    const maximo = db
      .prepare(`SELECT id FROM incidencias WHERE id LIKE 'INC-%'`)
      .all()
      .reduce((m, { id }) => Math.max(m, Number(id.slice(4)) || 0), 0);
    return `INC-${String(maximo + 1).padStart(4, '0')}`;
  }

  // Valida que las referencias a espacio/equipo existan (R5: sin referencias rotas).
  function validarReferencias(v, { espacio_id, equipo_id }) {
    if (espacio_id) v.exigir(sentencias.espacio.get(espacio_id), `El espacio "${espacio_id}" no existe.`);
    if (equipo_id) v.exigir(sentencias.equipo.get(equipo_id), `El equipo "${equipo_id}" no existe.`);
  }

  function guardarSugerencia(id, resultado, decision = 'pendiente') {
    db.prepare(
      'UPDATE incidencias SET ia_sugerencia = ?, ia_modelo = ?, ia_generada_en = ?, ia_decision = ?, actualizado_en = ? WHERE id = ?',
    ).run(
      JSON.stringify({ ...resultado.sugerencia, validacion_reglas: resultado.validacion_reglas, proveedor: resultado.proveedor }),
      resultado.modelo,
      resultado.generada_en,
      decision,
      reloj(),
      id,
    );
  }

  return {
    listar({ busqueda, estado, prioridad, categoria, area, pendientes } = {}) {
      const texto = limpiarTexto(busqueda).toLowerCase();
      return db
        .prepare('SELECT * FROM incidencias ORDER BY creado_en DESC')
        .all()
        .map(desdeFila)
        .filter(
          (i) =>
            (!texto ||
              `${i.id} ${i.titulo} ${i.descripcion} ${i.reportado_por ?? ''} ${i.asignado_a ?? ''}`.toLowerCase().includes(texto)) &&
            (!estado || i.estado === estado) &&
            (!prioridad || i.prioridad === prioridad) &&
            (!categoria || i.categoria === categoria) &&
            (!area || i.area_responsable === area) &&
            (!pendientes || !ESTADOS_FINALES_INCIDENCIA.includes(i.estado)),
        )
        .sort((a, b) => {
          // Pendientes primero, luego por prioridad, luego las más recientes.
          const finalA = ESTADOS_FINALES_INCIDENCIA.includes(a.estado) ? 1 : 0;
          const finalB = ESTADOS_FINALES_INCIDENCIA.includes(b.estado) ? 1 : 0;
          if (finalA !== finalB) return finalA - finalB;
          const pa = ORDEN_PRIORIDAD[a.prioridad] ?? 4;
          const pb = ORDEN_PRIORIDAD[b.prioridad] ?? 4;
          return pa - pb || b.creado_en.localeCompare(a.creado_en);
        });
    },

    obtener(id) {
      const incidencia = exigirIncidencia(id);
      return {
        ...incidencia,
        espacio: incidencia.espacio_id ? sentencias.espacio.get(incidencia.espacio_id) ?? null : null,
        equipo: incidencia.equipo_id ? sentencias.equipo.get(incidencia.equipo_id) ?? null : null,
        movimientos: listarMovimientos(db, { entidad: 'incidencia', entidadId: id, limite: 50 }),
      };
    },

    crear(datos, operador) {
      const v = crearValidador();
      const limpio = {
        titulo: limpiarTexto(datos.titulo, 120),
        descripcion: limpiarTextoLargo(datos.descripcion, 4000),
        espacio_id: limpiarTexto(datos.espacio_id, 40) || null,
        equipo_id: limpiarTexto(datos.equipo_id, 40) || null,
        reportado_por: limpiarTexto(datos.reportado_por, 120) || null,
      };
      v.exigir(limpio.titulo.length >= 3, 'El título es obligatorio (mínimo 3 caracteres).');
      v.exigir(limpio.descripcion.length >= 10, 'Describe la incidencia (mínimo 10 caracteres).');
      validarReferencias(v, limpio);
      v.lanzarSiHayProblemas();

      // Clasificación opcional al crear: si viene, se valida completa (R6).
      const clasificacion = Object.fromEntries(CAMPOS_CLASIFICACION.map((c) => [c, datos[c] || null]));
      const traeClasificacion = CAMPOS_CLASIFICACION.some((c) => clasificacion[c]);
      if (traeClasificacion) validarClasificacion(clasificacion);

      const sugerenciaIA = recuperarSugerencia(datos.sugerencia_id);
      const { origen, decision } = traeClasificacion
        ? origenDeClasificacion(sugerenciaIA?.sugerencia, clasificacion)
        : { origen: null, decision: sugerenciaIA ? 'pendiente' : null };

      return enTransaccion(db, () => {
        const id = siguienteId();
        const ahora = reloj();
        db.prepare(
          `INSERT INTO incidencias (id, titulo, descripcion, categoria, prioridad, area_responsable, estado, espacio_id,
             equipo_id, reportado_por, origen_clasificacion, origen, creado_en, actualizado_en)
           VALUES (?, ?, ?, ?, ?, ?, 'abierta', ?, ?, ?, ?, 'manual', ?, ?)`,
        ).run(
          id,
          limpio.titulo,
          limpio.descripcion,
          clasificacion.categoria,
          clasificacion.prioridad,
          clasificacion.area_responsable,
          limpio.espacio_id,
          limpio.equipo_id,
          limpio.reportado_por,
          origen,
          ahora,
          ahora,
        );
        if (sugerenciaIA) guardarSugerencia(id, sugerenciaIA, decision);
        registrarMovimiento(db, {
          entidad: 'incidencia',
          entidadId: id,
          accion: 'registrada',
          detalle: { titulo: limpio.titulo, ...(traeClasificacion ? { ...clasificacion, origen_clasificacion: origen } : {}) },
          operador,
        });
        return exigirIncidencia(id);
      });
    },

    actualizar(id, datos, operador) {
      return enTransaccion(db, () => {
        const actual = exigirIncidencia(id);
        validarIncidenciaModificable(actual);
        const v = crearValidador();
        const cambios = {};
        if (datos.titulo !== undefined) {
          cambios.titulo = limpiarTexto(datos.titulo, 120);
          v.exigir(cambios.titulo.length >= 3, 'El título es obligatorio (mínimo 3 caracteres).');
        }
        if (datos.descripcion !== undefined) {
          cambios.descripcion = limpiarTextoLargo(datos.descripcion, 4000);
          v.exigir(cambios.descripcion.length >= 10, 'Describe la incidencia (mínimo 10 caracteres).');
        }
        for (const campo of ['espacio_id', 'equipo_id', 'reportado_por']) {
          if (datos[campo] !== undefined) cambios[campo] = limpiarTexto(datos[campo], 120) || null;
        }
        validarReferencias(v, cambios);
        v.lanzarSiHayProblemas();
        const nuevo = { ...actual, ...cambios };
        db.prepare(
          'UPDATE incidencias SET titulo = ?, descripcion = ?, espacio_id = ?, equipo_id = ?, reportado_por = ?, actualizado_en = ? WHERE id = ?',
        ).run(nuevo.titulo, nuevo.descripcion, nuevo.espacio_id, nuevo.equipo_id, nuevo.reportado_por, reloj(), id);
        const detalle = diferencias(actual, cambios, ['titulo', 'descripcion', 'espacio_id', 'equipo_id', 'reportado_por']);
        if (Object.keys(detalle).length) {
          registrarMovimiento(db, { entidad: 'incidencia', entidadId: id, accion: 'actualizada', detalle, operador });
        }
        return exigirIncidencia(id);
      });
    },

    // Pide a la IA una sugerencia y la guarda como "pendiente de revisión".
    // No cambia la clasificación de la incidencia.
    async analizarConIA(id, operador) {
      const incidencia = exigirIncidencia(id);
      validarIncidenciaModificable(incidencia);
      if (!triaje) throw new IAError('no_configurada');
      let resultado;
      try {
        resultado = await triaje.analizar({
          titulo: incidencia.titulo,
          descripcion: incidencia.descripcion,
          espacio: incidencia.espacio_id ? sentencias.espacio.get(incidencia.espacio_id) : null,
          equipo: incidencia.equipo_id ? sentencias.equipo.get(incidencia.equipo_id) : null,
        });
      } catch (error) {
        if (error instanceof IAError) {
          registrarMovimiento(db, {
            entidad: 'incidencia',
            entidadId: id,
            accion: 'ia_fallo',
            detalle: { codigo: error.codigo, mensaje: error.message },
            operador,
          });
        }
        throw error;
      }
      enTransaccion(db, () => {
        guardarSugerencia(id, resultado);
        registrarMovimiento(db, {
          entidad: 'incidencia',
          entidadId: id,
          accion: 'ia_sugerencia',
          detalle: {
            modelo: resultado.modelo,
            categoria: resultado.sugerencia.categoria,
            prioridad: resultado.sugerencia.prioridad,
            area_responsable: resultado.sugerencia.area_responsable,
            confianza: resultado.sugerencia.confianza,
            cumple_reglas: resultado.validacion_reglas.cumple,
          },
          operador,
        });
      });
      return { incidencia: this.obtener(id), resultado };
    },

    descartarSugerencia(id, operador) {
      return enTransaccion(db, () => {
        const incidencia = exigirIncidencia(id);
        if (incidencia.ia_decision !== 'pendiente') {
          throw new ReglaNegocioError('R6_INTEGRIDAD_INCIDENCIAS', 'No hay una sugerencia de IA pendiente de revisión.');
        }
        db.prepare(`UPDATE incidencias SET ia_decision = 'descartada', actualizado_en = ? WHERE id = ?`).run(reloj(), id);
        registrarMovimiento(db, { entidad: 'incidencia', entidadId: id, accion: 'ia_descartada', operador });
        return exigirIncidencia(id);
      });
    },

    // Clasificar o reasignar (manual, aceptando la IA o editándola): R6 siempre.
    clasificar(id, datos, operador) {
      return enTransaccion(db, () => {
        const actual = exigirIncidencia(id);
        const nueva = {
          categoria: datos.categoria,
          prioridad: datos.prioridad,
          area_responsable: datos.area_responsable,
          asignado_a: limpiarTexto(datos.asignado_a, 120) || null,
        };
        validarReclasificacion(actual, nueva);
        const pendiente = actual.ia_decision === 'pendiente' ? actual.ia_sugerencia : null;
        const { origen, decision } = origenDeClasificacion(pendiente, nueva);
        const asignado = nueva.asignado_a ?? actual.asignado_a;
        db.prepare(
          `UPDATE incidencias SET categoria = ?, prioridad = ?, area_responsable = ?, asignado_a = ?,
             origen_clasificacion = ?, ia_decision = COALESCE(?, ia_decision), actualizado_en = ? WHERE id = ?`,
        ).run(nueva.categoria, nueva.prioridad, nueva.area_responsable, asignado, origen, decision, reloj(), id);
        registrarMovimiento(db, {
          entidad: 'incidencia',
          entidadId: id,
          accion: actual.area_responsable && actual.area_responsable !== nueva.area_responsable ? 'reasignada' : 'clasificada',
          detalle: { ...diferencias(actual, { ...nueva, asignado_a: asignado }, [...CAMPOS_CLASIFICACION, 'asignado_a']), origen_clasificacion: origen },
          operador,
        });
        return exigirIncidencia(id);
      });
    },

    cambiarEstado(id, datos, operador) {
      return enTransaccion(db, () => {
        const actual = exigirIncidencia(id);
        const nuevoEstado = datos.estado;
        const extra = {
          asignado_a: datos.asignado_a !== undefined ? limpiarTexto(datos.asignado_a, 120) || null : undefined,
          solucion: datos.solucion !== undefined ? limpiarTextoLargo(datos.solucion, 2000) || null : undefined,
          motivo: limpiarTexto(datos.motivo, 300) || undefined,
        };
        validarTransicion(actual, nuevoEstado, extra);
        const ahora = reloj();
        db.prepare(
          `UPDATE incidencias SET estado = ?, asignado_a = ?, solucion = ?, motivo_cancelacion = ?,
             cerrado_en = ?, actualizado_en = ? WHERE id = ?`,
        ).run(
          nuevoEstado,
          extra.asignado_a ?? actual.asignado_a,
          extra.solucion ?? actual.solucion,
          nuevoEstado === 'cancelada' ? extra.motivo : actual.motivo_cancelacion,
          ESTADOS_FINALES_INCIDENCIA.includes(nuevoEstado) ? ahora : null,
          ahora,
          id,
        );
        registrarMovimiento(db, {
          entidad: 'incidencia',
          entidadId: id,
          accion: 'cambio_estado',
          detalle: {
            estado: { antes: actual.estado, despues: nuevoEstado },
            ...(extra.asignado_a ? { asignado_a: extra.asignado_a } : {}),
            ...(extra.solucion ? { solucion: extra.solucion } : {}),
            ...(extra.motivo && nuevoEstado === 'cancelada' ? { motivo: extra.motivo } : {}),
          },
          operador,
        });
        return exigirIncidencia(id);
      });
    },

    resumen() {
      const filas = db.prepare('SELECT estado, prioridad, categoria, ia_decision FROM incidencias').all();
      const pendientes = filas.filter((f) => !ESTADOS_FINALES_INCIDENCIA.includes(f.estado));
      return {
        total: filas.length,
        pendientes: pendientes.length,
        abiertas: filas.filter((f) => f.estado === 'abierta').length,
        en_progreso: filas.filter((f) => f.estado === 'en_progreso').length,
        criticas_o_altas: pendientes.filter((f) => f.prioridad === 'critica' || f.prioridad === 'alta').length,
        sin_clasificar: pendientes.filter((f) => !f.categoria).length,
        sugerencias_por_revisar: pendientes.filter((f) => f.ia_decision === 'pendiente').length,
      };
    },
  };
}
