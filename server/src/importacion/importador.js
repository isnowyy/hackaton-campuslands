// Importador de datos oficiales.
//
// 1. analizar(): lee data/oficial, normaliza cada registro, detecta duplicados,
//    campos faltantes, identificadores inválidos, estados desconocidos y
//    referencias rotas, y aplica las mismas reglas de negocio (aforo, cruces,
//    un préstamo activo por equipo). No escribe nada: sirve como vista previa.
// 2. importar(): ejecuta el análisis y guarda SOLO los registros válidos en
//    una transacción, reemplazando los datos operativos anteriores.
// Los archivos originales nunca se modifican; se guarda su huella SHA-256 en
// el reporte para demostrar que son los mismos que se entregaron.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { enTransaccion, RAIZ_PROYECTO } from '../db/conexion.js';
import { seSuperponen } from '../reglas/reglasEspacios.js';
import { registrarMovimiento } from '../servicios/auditoria.js';
import { ahoraLocal } from '../utilidades/fechas.js';
import { claveNormalizada } from '../utilidades/texto.js';
import { crearMapeo, detectarEntidad, ENTIDADES, NORMALIZADORES } from './esquemas.js';
import { EXTENSIONES_SOPORTADAS, leerArchivo } from './lectores.js';

export const DIRECTORIO_OFICIAL = resolve(process.env.DATOS_OFICIALES_DIR || join(RAIZ_PROYECTO, 'data/oficial'));
const MAXIMO_ERRORES_EN_REPORTE = 1000;

export function listarArchivosOficiales(directorio = DIRECTORIO_OFICIAL) {
  if (!existsSync(directorio)) return [];
  return readdirSync(directorio)
    .filter((nombre) => !nombre.startsWith('.') && !/^leeme|^readme/i.test(nombre))
    .map((nombre) => join(directorio, nombre))
    .filter((ruta) => statSync(ruta).isFile());
}

export function analizarDatosOficiales(directorio = DIRECTORIO_OFICIAL, { ahora = ahoraLocal() } = {}) {
  const reporte = {
    directorio,
    analizado_en: ahora,
    archivos: [],
    entidades: Object.fromEntries(
      Object.keys(ENTIDADES).map((e) => [e, { etiqueta: ENTIDADES[e].etiqueta, leidos: 0, validos: 0, con_errores: 0, con_advertencias: 0 }]),
    ),
    errores: [],
    advertencias: [],
    errores_omitidos: 0,
  };
  const candidatos = Object.fromEntries(Object.keys(ENTIDADES).map((e) => [e, []]));

  const anotar = (lista, entrada) => {
    if (reporte.errores.length + reporte.advertencias.length < MAXIMO_ERRORES_EN_REPORTE) lista.push(entrada);
    else reporte.errores_omitidos++;
  };

  // --- 1. Lectura y normalización registro a registro -----------------------
  for (const ruta of listarArchivosOficiales(directorio)) {
    let lectura;
    try {
      lectura = leerArchivo(ruta);
    } catch (error) {
      reporte.archivos.push({ archivo: ruta.split('/').pop(), formato: 'desconocido', error: `No se pudo leer: ${error.message}`, colecciones: [] });
      continue;
    }
    const resumenArchivo = {
      archivo: lectura.archivo,
      formato: lectura.formato,
      codificacion: lectura.codificacion,
      separador: lectura.separador,
      bytes: lectura.bytes,
      sha256: lectura.sha256,
      error: lectura.error,
      colecciones: [],
    };
    reporte.archivos.push(resumenArchivo);

    for (const coleccion of lectura.colecciones) {
      const entidad = detectarEntidad(coleccion.coleccion) ?? detectarEntidad(lectura.archivo);
      const { mapeo, noReconocidas } = entidad ? crearMapeo(entidad, coleccion.columnas) : { mapeo: {}, noReconocidas: coleccion.columnas };
      resumenArchivo.colecciones.push({
        nombre: coleccion.ruta,
        entidad,
        registros: coleccion.registros.length,
        columnas: coleccion.columnas,
        mapeo,
        columnas_no_reconocidas: noReconocidas,
        aviso: entidad ? null : 'No se reconoció a qué entidad corresponde (renombra el archivo o agrega un patrón en importacion/esquemas.js).',
      });
      if (!entidad) continue;

      for (const registro of coleccion.registros) {
        const ubicacion = { archivo: lectura.archivo, coleccion: coleccion.ruta, fila: registro.fila, entidad };
        reporte.entidades[entidad].leidos++;
        if (registro.noEsObjeto) {
          candidatos[entidad].push({ ...ubicacion, valor: null, errores: ['El registro no es un objeto.'], advertencias: [] });
          continue;
        }
        const { valor, errores, advertencias } = NORMALIZADORES[entidad](registro.datos, mapeo, { nombreColeccion: coleccion.coleccion });
        if (registro.columnasDeMas) advertencias.push('La fila tiene más valores que encabezados (se ignoraron los sobrantes).');
        candidatos[entidad].push({ ...ubicacion, valor, errores, advertencias });
      }
    }
  }

  // --- 2. Validaciones entre registros (duplicados, referencias, reglas) ----
  const validos = (entidad) => candidatos[entidad].filter((c) => !c.errores.length);
  const marcarDuplicados = (entidad, clave, etiqueta) => {
    const vistos = new Map();
    for (const c of validos(entidad)) {
      const k = clave(c.valor);
      if (k === null || k === undefined) continue;
      if (vistos.has(k)) {
        const primero = vistos.get(k);
        c.errores.push(`${etiqueta} duplicado "${k}" (ya aparece en ${primero.archivo}, fila ${primero.fila}).`);
      } else vistos.set(k, c);
    }
  };

  marcarDuplicados('espacios', (v) => v.id.toLowerCase(), 'Identificador');
  marcarDuplicados('equipos', (v) => v.id.toLowerCase(), 'Identificador');
  marcarDuplicados('equipos', (v) => v.serial?.toLowerCase() ?? null, 'Serial');
  marcarDuplicados('incidencias', (v) => v.id?.toLowerCase() ?? null, 'Identificador');
  marcarDuplicados('reservas', (v) => v.id_origen?.toLowerCase() ?? null, 'Identificador');
  marcarDuplicados('prestamos', (v) => v.id_origen?.toLowerCase() ?? null, 'Identificador');

  // Índices para resolver referencias por código o, si no, por nombre exacto.
  const indice = (entidad) => {
    const porId = new Map();
    const porNombre = new Map();
    for (const c of validos(entidad)) {
      porId.set(c.valor.id.toLowerCase(), c.valor);
      const n = claveNormalizada(c.valor.nombre);
      porNombre.set(n, porNombre.has(n) ? 'ambiguo' : c.valor);
    }
    return (ref, c, etiqueta) => {
      if (!ref) return null;
      const porCodigo = porId.get(String(ref).toLowerCase());
      if (porCodigo) return porCodigo;
      const encontrado = porNombre.get(claveNormalizada(ref));
      if (encontrado && encontrado !== 'ambiguo') {
        c.advertencias.push(`${etiqueta} "${ref}" se identificó por nombre (${encontrado.id}).`);
        return encontrado;
      }
      c.errores.push(`${etiqueta} "${ref}" no existe en los datos válidos.`);
      return null;
    };
  };
  const buscarEspacio = indice('espacios');
  const buscarEquipo = indice('equipos');

  // Reservas: referencia, R1 aforo, R3 estado (si es futura) y R2 cruces.
  for (const c of validos('reservas')) {
    const espacio = buscarEspacio(c.valor.espacio_ref, c, 'El espacio');
    if (!espacio) continue;
    c.valor.espacio_id = espacio.id;
    if (c.valor.personas > espacio.capacidad) {
      c.errores.push(`R1 · Aforo: ${c.valor.personas} personas en "${espacio.nombre}" (capacidad ${espacio.capacidad}).`);
    }
    if (c.valor.estado === 'activa' && c.valor.fin > ahora && espacio.estado !== 'disponible') {
      c.errores.push(`R3 · Reserva futura en un espacio "${espacio.estado}".`);
    }
  }
  const aceptadasPorEspacio = new Map();
  for (const c of validos('reservas').filter((r) => r.valor.estado === 'activa').sort((a, b) => a.valor.inicio.localeCompare(b.valor.inicio))) {
    const lista = aceptadasPorEspacio.get(c.valor.espacio_id) ?? [];
    const cruce = lista.find((otra) => seSuperponen(c.valor, otra.valor));
    if (cruce) c.errores.push(`R2 · Se cruza con la reserva de ${cruce.archivo}, fila ${cruce.fila}.`);
    else {
      lista.push(c);
      aceptadasPorEspacio.set(c.valor.espacio_id, lista);
    }
  }

  // Préstamos: referencia y máximo un préstamo activo por equipo.
  const activosPorEquipo = new Map();
  for (const c of validos('prestamos')) {
    const equipo = buscarEquipo(c.valor.equipo_ref, c, 'El equipo');
    if (!equipo) continue;
    c.valor.equipo_id = equipo.id;
    if (c.valor.estado !== 'activo') continue;
    if (activosPorEquipo.has(equipo.id)) {
      const otro = activosPorEquipo.get(equipo.id);
      c.errores.push(`R4 · El equipo ya tiene un préstamo activo (${otro.archivo}, fila ${otro.fila}).`);
    } else {
      activosPorEquipo.set(equipo.id, c);
      if (equipo.estado !== 'operativo') c.advertencias.push(`Préstamo activo de un equipo en estado "${equipo.estado}".`);
    }
  }
  // Equipos marcados "prestado" sin préstamo en los archivos: se crea el
  // préstamo con los datos disponibles y se avisa, para que el equipo no
  // aparezca como disponible cuando físicamente no está.
  const prestamosDerivados = [];
  for (const c of validos('equipos').filter((e) => e.valor.marcadoPrestado)) {
    if (activosPorEquipo.has(c.valor.id)) continue;
    c.advertencias.push('Marcado como prestado sin préstamo en los archivos: se registró un préstamo activo sin fecha prevista.');
    prestamosDerivados.push({
      equipo_id: c.valor.id,
      responsable: c.valor.prestadoA ?? 'No indicado en el archivo oficial',
      fecha_prestamo: ahora,
      devolucion_prevista: null,
      estado: 'activo',
      observaciones: `Derivado del estado "prestado" en ${c.archivo}, fila ${c.fila}.`,
      id_origen: null,
    });
  }

  // Incidencias: referencias opcionales a espacio/equipo.
  for (const c of validos('incidencias')) {
    if (c.valor.espacio_ref) c.valor.espacio_id = buscarEspacio(c.valor.espacio_ref, c, 'El espacio')?.id ?? null;
    if (c.valor.equipo_ref) c.valor.equipo_id = buscarEquipo(c.valor.equipo_ref, c, 'El equipo')?.id ?? null;
  }

  // --- 3. Conteos y listado de problemas -----------------------------------
  for (const [entidad, lista] of Object.entries(candidatos)) {
    for (const c of lista) {
      const resumen = reporte.entidades[entidad];
      const base = { entidad, archivo: c.archivo, coleccion: c.coleccion, fila: c.fila, id: c.valor?.id ?? c.valor?.id_origen ?? null };
      if (c.errores.length) {
        resumen.con_errores++;
        anotar(reporte.errores, { ...base, problemas: c.errores });
      } else {
        resumen.validos++;
        if (c.advertencias.length) {
          resumen.con_advertencias++;
          anotar(reporte.advertencias, { ...base, problemas: c.advertencias });
        }
      }
    }
  }
  reporte.total_leidos = Object.values(reporte.entidades).reduce((s, e) => s + e.leidos, 0);
  reporte.total_validos = Object.values(reporte.entidades).reduce((s, e) => s + e.validos, 0);
  reporte.total_con_errores = Object.values(reporte.entidades).reduce((s, e) => s + e.con_errores, 0);
  reporte.prestamos_derivados = prestamosDerivados.length;
  reporte.extensiones_soportadas = EXTENSIONES_SOPORTADAS;

  const plan = Object.fromEntries(Object.keys(ENTIDADES).map((e) => [e, validos(e).map((c) => c.valor)]));
  plan.prestamosDerivados = prestamosDerivados;
  return { reporte, plan };
}

// Reemplaza los datos operativos por los registros válidos de los archivos oficiales.
export function importarDatosOficiales(db, { directorio = DIRECTORIO_OFICIAL, operador = 'sistema' } = {}) {
  const ahora = ahoraLocal();
  const { reporte, plan } = analizarDatosOficiales(directorio, { ahora });
  if (!reporte.archivos.length) {
    return { importado: false, motivo: `No hay archivos en ${directorio}.`, reporte };
  }

  enTransaccion(db, () => {
    for (const tabla of ['reservas', 'prestamos', 'incidencias', 'espacios', 'equipos']) db.exec(`DELETE FROM ${tabla}`);

    const insEspacio = db.prepare(
      `INSERT INTO espacios (id, nombre, tipo, capacidad, estado, ubicacion, origen, creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, 'oficial', ?, ?)`,
    );
    for (const e of plan.espacios) insEspacio.run(e.id, e.nombre, e.tipo, e.capacidad, e.estado, e.ubicacion, ahora, ahora);

    const insEquipo = db.prepare(
      `INSERT INTO equipos (id, nombre, tipo, marca, serial, estado, ubicacion, origen, creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, ?, 'oficial', ?, ?)`,
    );
    for (const e of plan.equipos) insEquipo.run(e.id, e.nombre, e.tipo, e.marca, e.serial, e.estado, e.ubicacion, ahora, ahora);

    const insReserva = db.prepare(
      `INSERT INTO reservas (espacio_id, responsable, motivo, personas, inicio, fin, estado, id_origen, origen, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'oficial', ?)`,
    );
    for (const r of plan.reservas) insReserva.run(r.espacio_id, r.responsable, r.motivo, r.personas, r.inicio, r.fin, r.estado, r.id_origen, ahora);

    const insPrestamo = db.prepare(
      `INSERT INTO prestamos (equipo_id, responsable, documento, fecha_prestamo, devolucion_prevista, fecha_devolucion, estado, observaciones, id_origen, origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'oficial')`,
    );
    for (const p of [...plan.prestamos, ...plan.prestamosDerivados]) {
      insPrestamo.run(p.equipo_id, p.responsable, p.documento ?? null, p.fecha_prestamo, p.devolucion_prevista, p.fecha_devolucion ?? null, p.estado, p.observaciones, p.id_origen);
    }

    const insIncidencia = db.prepare(
      `INSERT INTO incidencias (id, titulo, descripcion, categoria, prioridad, area_responsable, estado, espacio_id, equipo_id, reportado_por,
         asignado_a, solucion, origen_clasificacion, origen, creado_en, actualizado_en, cerrado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'oficial', ?, ?, ?)`,
    );
    // Incidencias sin código en el archivo: se numeran a continuación del mayor INC-xxxx.
    let consecutivo = plan.incidencias.reduce((m, i) => Math.max(m, /^INC-\d+$/i.test(i.id ?? '') ? Number(i.id.slice(4)) : 0), 0);
    for (const i of plan.incidencias) {
      const id = i.id ?? `INC-${String(++consecutivo).padStart(4, '0')}`;
      const creado = i.fecha ?? ahora;
      insIncidencia.run(
        id, i.titulo, i.descripcion, i.categoria, i.prioridad, i.area_responsable, i.estado, i.espacio_id ?? null, i.equipo_id ?? null,
        i.reportado_por, i.asignado_a, i.solucion, i.categoria ? 'oficial' : null, creado, creado,
        ['cerrada', 'cancelada'].includes(i.estado) ? creado : null,
      );
    }

    db.prepare('INSERT INTO importaciones (fecha, modo, reporte) VALUES (?, ?, ?)').run(ahora, 'reemplazar', JSON.stringify(reporte));
    registrarMovimiento(db, {
      entidad: 'importacion',
      entidadId: ahora,
      accion: 'datos_oficiales_importados',
      detalle: {
        archivos: reporte.archivos.map((a) => ({ archivo: a.archivo, sha256: a.sha256 })),
        validos: reporte.total_validos,
        con_errores: reporte.total_con_errores,
      },
      operador,
    });
  });

  return { importado: true, reporte };
}

export function ultimaImportacion(db) {
  const fila = db.prepare('SELECT * FROM importaciones ORDER BY id DESC LIMIT 1').get();
  return fila ? { ...fila, reporte: JSON.parse(fila.reporte) } : null;
}

export function baseVacia(db) {
  return ['espacios', 'equipos', 'incidencias'].every((t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n === 0);
}
