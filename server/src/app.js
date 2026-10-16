// Construcción de la aplicación Express. Separada de index.js para poder
// crearla en las pruebas con una base en memoria.

import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ_PROYECTO } from './db/conexion.js';
import { estadoPublicoIA, leerConfiguracionIA } from './ia/configuracion.js';
import { IAError } from './ia/errores.js';
import { crearTriaje, recordarSugerencia } from './ia/triaje.js';
import { analizarDatosOficiales, DIRECTORIO_OFICIAL, importarDatosOficiales, ultimaImportacion } from './importacion/importador.js';
import {
  AREAS,
  CATEGORIAS,
  ESTADOS_EQUIPO,
  ESTADOS_ESPACIO,
  ESTADOS_INCIDENCIA,
  ETIQUETAS,
  PRIORIDADES,
  TIPOS_ESPACIO,
  TRANSICIONES_INCIDENCIA,
} from './reglas/catalogos.js';
import { NoEncontradoError, ReglaNegocioError, ValidacionError } from './reglas/errores.js';
import { listarMovimientos, registrarMovimiento } from './servicios/auditoria.js';
import { crearServicioEquipos } from './servicios/equipos.js';
import { crearServicioEspacios } from './servicios/espacios.js';
import { crearServicioIncidencias } from './servicios/incidencias.js';
import { limpiarTexto, limpiarTextoLargo } from './utilidades/texto.js';

// Quién opera la interfaz (campo "Operador" de la barra superior). Sirve para
// la trazabilidad; en este MVP no hay autenticación (ver README, "Seguridad").
// La interfaz lo envía codificado (encodeURIComponent) para admitir tildes.
function operadorDe(req) {
  let valor = req.get('x-operador') ?? '';
  try {
    valor = decodeURIComponent(valor);
  } catch {
    // Valor sin codificar (p. ej. desde curl): se usa tal cual.
  }
  return limpiarTexto(valor, 60) || 'anónimo';
}

// Envuelve un manejador para que los errores (también los async) lleguen al
// manejador central y, si es una regla incumplida, quede en la trazabilidad.
function manejar(db, entidad, fn) {
  return async (req, res, next) => {
    try {
      const resultado = await fn(req, res);
      if (!res.headersSent) res.json(resultado ?? { ok: true });
    } catch (error) {
      if (error instanceof ReglaNegocioError && entidad) {
        try {
          registrarMovimiento(db, {
            entidad,
            entidadId: req.params.id ?? req.body?.id ?? '-',
            accion: 'operacion_rechazada',
            detalle: { regla: error.nombreRegla, mensaje: error.message, ruta: `${req.method} ${req.baseUrl}${req.route?.path ?? ''}` },
            operador: operadorDe(req),
          });
        } catch {
          // La trazabilidad del rechazo nunca debe ocultar el error original.
        }
      }
      next(error);
    }
  };
}

export function crearApp(db, { reloj, triaje = crearTriaje(), entorno = process.env } = {}) {
  const espacios = crearServicioEspacios(db, { reloj });
  const equipos = crearServicioEquipos(db, { reloj });
  const incidencias = crearServicioIncidencias(db, { reloj, triaje });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'",
    });
    next();
  });

  const api = express.Router();

  // --- Panel y catálogos ------------------------------------------------------
  api.get('/salud', (req, res) => res.json({ ok: true }));

  api.get('/catalogos', (req, res) =>
    res.json({
      tipos_espacio: TIPOS_ESPACIO,
      estados_espacio: ESTADOS_ESPACIO,
      estados_equipo: ESTADOS_EQUIPO,
      estados_incidencia: ESTADOS_INCIDENCIA,
      transiciones_incidencia: TRANSICIONES_INCIDENCIA,
      prioridades: PRIORIDADES,
      areas: AREAS,
      categorias: CATEGORIAS,
      etiquetas: ETIQUETAS,
    }),
  );

  api.get(
    '/panel',
    manejar(db, null, () => {
      const importacion = ultimaImportacion(db);
      return {
        espacios: espacios.resumen(),
        equipos: equipos.resumen(),
        incidencias: incidencias.resumen(),
        ia: estadoPublicoIA(leerConfiguracionIA(entorno)),
        ultima_importacion: importacion
          ? {
              fecha: importacion.fecha,
              total_leidos: importacion.reporte.total_leidos,
              total_validos: importacion.reporte.total_validos,
              total_con_errores: importacion.reporte.total_con_errores,
            }
          : null,
        movimientos: listarMovimientos(db, { limite: 12 }),
      };
    }),
  );

  api.get('/movimientos', manejar(db, null, (req) => listarMovimientos(db, {
    entidad: req.query.entidad, entidadId: req.query.entidad_id, accion: req.query.accion, limite: req.query.limite,
  })));

  // --- Módulo 1: espacios y reservas -------------------------------------------
  api.get('/espacios', manejar(db, null, (req) => espacios.listar(req.query)));
  api.get('/espacios/sugerencias', manejar(db, null, (req) => espacios.sugerir(req.query)));
  api.get('/espacios/:id', manejar(db, null, (req) => espacios.obtener(req.params.id)));
  api.post('/espacios', manejar(db, 'espacio', (req, res) => {
    res.status(201);
    return espacios.crear(req.body, operadorDe(req));
  }));
  api.patch('/espacios/:id', manejar(db, 'espacio', (req) => espacios.actualizar(req.params.id, req.body, operadorDe(req))));
  api.post('/espacios/:id/reservas', manejar(db, 'espacio', (req, res) => {
    res.status(201);
    return espacios.reservar(req.params.id, req.body, operadorDe(req));
  }));
  api.get('/reservas', manejar(db, null, (req) => espacios.listarReservas({
    espacioId: req.query.espacio_id, desde: req.query.desde, hasta: req.query.hasta, estado: req.query.estado,
  })));
  api.post('/reservas/:id/cancelar', manejar(db, 'reserva', (req) => espacios.cancelarReserva(Number(req.params.id), req.body, operadorDe(req))));

  // --- Módulo 2: equipos y préstamos -------------------------------------------
  api.get('/equipos', manejar(db, null, (req) => equipos.listar(req.query)));
  api.get('/equipos/:id', manejar(db, null, (req) => equipos.obtener(req.params.id)));
  api.post('/equipos', manejar(db, 'equipo', (req, res) => {
    res.status(201);
    return equipos.crear(req.body, operadorDe(req));
  }));
  api.patch('/equipos/:id', manejar(db, 'equipo', (req) => equipos.actualizar(req.params.id, req.body, operadorDe(req))));
  api.post('/equipos/:id/prestamos', manejar(db, 'equipo', (req, res) => {
    res.status(201);
    return equipos.prestar(req.params.id, req.body, operadorDe(req));
  }));
  api.post('/equipos/:id/devolucion', manejar(db, 'equipo', (req) => equipos.devolver(req.params.id, req.body, operadorDe(req))));
  api.get('/prestamos', manejar(db, null, (req) => equipos.listarPrestamos(req.query)));

  // --- Módulo 3: incidencias e IA ----------------------------------------------
  api.get('/incidencias', manejar(db, null, (req) => incidencias.listar(req.query)));
  api.get('/incidencias/:id', manejar(db, null, (req) => incidencias.obtener(req.params.id)));
  api.post('/incidencias', manejar(db, 'incidencia', (req, res) => {
    res.status(201);
    return incidencias.crear(req.body, operadorDe(req));
  }));
  api.patch('/incidencias/:id', manejar(db, 'incidencia', (req) => incidencias.actualizar(req.params.id, req.body, operadorDe(req))));
  api.post('/incidencias/:id/clasificacion', manejar(db, 'incidencia', (req) => incidencias.clasificar(req.params.id, req.body, operadorDe(req))));
  api.post('/incidencias/:id/estado', manejar(db, 'incidencia', (req) => incidencias.cambiarEstado(req.params.id, req.body, operadorDe(req))));
  api.post('/incidencias/:id/ia', manejar(db, 'incidencia', (req) => incidencias.analizarConIA(req.params.id, operadorDe(req))));
  api.post('/incidencias/:id/ia/descartar', manejar(db, 'incidencia', (req) => incidencias.descartarSugerencia(req.params.id, operadorDe(req))));

  api.get('/ia/estado', (req, res) => res.json(estadoPublicoIA(leerConfiguracionIA(entorno))));
  // Triaje sin registro previo (formulario "Nueva incidencia"). La sugerencia
  // se recuerda en el servidor para enlazarla cuando se cree la incidencia.
  api.post('/ia/triaje', manejar(db, null, async (req) => {
    const titulo = limpiarTexto(req.body?.titulo, 120);
    const descripcion = limpiarTextoLargo(req.body?.descripcion, 4000);
    if (titulo.length < 3 || descripcion.length < 10) {
      throw new ValidacionError('Escribe título (3+ caracteres) y descripción (10+ caracteres) antes de pedir la sugerencia.');
    }
    const espacio = req.body?.espacio_id ? db.prepare('SELECT * FROM espacios WHERE id = ?').get(req.body.espacio_id) : null;
    const equipo = req.body?.equipo_id ? db.prepare('SELECT * FROM equipos WHERE id = ?').get(req.body.equipo_id) : null;
    const resultado = await triaje.analizar({ titulo, descripcion, espacio, equipo });
    recordarSugerencia(resultado);
    return resultado;
  }));

  // --- Datos oficiales ----------------------------------------------------------
  api.get('/importacion', manejar(db, null, () => ({
    directorio: DIRECTORIO_OFICIAL,
    vista_previa: analizarDatosOficiales().reporte,
    ultima: ultimaImportacion(db),
  })));
  api.post('/importacion', manejar(db, 'importacion', (req) => {
    if (req.body?.confirmar !== true) {
      throw new ValidacionError('La importación reemplaza los datos operativos actuales: envía { "confirmar": true }.');
    }
    return importarDatosOficiales(db, { operador: operadorDe(req) });
  }));

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'no_encontrado', mensaje: `Ruta ${req.method} ${req.originalUrl} no existe.` }));

  // En producción (npm start) el mismo servidor entrega la interfaz compilada.
  const distribucion = join(RAIZ_PROYECTO, 'client/dist');
  if (existsSync(distribucion)) {
    app.use(express.static(distribucion));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(join(distribucion, 'index.html')));
  }

  // Manejador central de errores: respuestas uniformes y sin filtrar detalles internos.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof ReglaNegocioError) {
      return res.status(409).json({ error: 'regla_negocio', regla: error.regla, nombre_regla: error.nombreRegla, mensaje: error.message, detalles: error.detalles });
    }
    if (error instanceof ValidacionError) {
      return res.status(422).json({ error: 'validacion', mensaje: error.message, problemas: error.problemas });
    }
    if (error instanceof NoEncontradoError) return res.status(404).json({ error: 'no_encontrado', mensaje: error.message });
    if (error instanceof IAError) {
      return res.status(error.status).json({ error: 'ia', codigo: error.codigo, mensaje: error.message, ...error.extra });
    }
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'json_invalido', mensaje: 'El cuerpo de la petición no es JSON válido.' });
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'muy_grande', mensaje: 'La petición es demasiado grande.' });
    console.error(error);
    return res.status(500).json({ error: 'interno', mensaje: 'Error interno del servidor. La operación no se aplicó.' });
  });

  return app;
}
