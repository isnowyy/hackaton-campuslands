// Mapeo de los archivos oficiales al modelo del sistema.
//
// Como la estructura real de los datos de Campuslands se conoce el día de la
// competencia, cada campo declara los nombres de columna aceptados (alias).
// Si un archivo trae una columna con otro nombre, basta con agregar el alias
// aquí: el reporte de importación lista las columnas no reconocidas para
// saber exactamente cuál falta. Nada se adivina: un valor que no encaja con el
// catálogo se reporta como error o advertencia, nunca se inventa.

import { CATEGORIAS, SINONIMOS } from '../reglas/catalogos.js';
import { normalizarFechaHora, normalizarHora } from '../utilidades/fechas.js';
import { claveNormalizada, esIdentificadorValido, limpiarTexto, limpiarTextoLargo } from '../utilidades/texto.js';

// El orden importa: "reservas_espacios" debe detectarse como reservas, no como espacios.
export const ENTIDADES = {
  reservas: {
    etiqueta: 'Reservas',
    patrones: ['reserva', 'asignacion', 'agendamiento', 'agenda'],
    alias: {
      id: ['id', 'id_reserva', 'codigo', 'codigo_reserva'],
      espacio_id: ['espacio_id', 'id_espacio', 'codigo_espacio', 'espacio', 'aula', 'cubiculo', 'salon', 'sala'],
      responsable: ['responsable', 'solicitante', 'reservado_por', 'usuario', 'docente', 'trainer', 'persona', 'grupo', 'nombre'],
      motivo: ['motivo', 'actividad', 'proposito', 'descripcion', 'clase', 'curso', 'observaciones'],
      personas: ['personas', 'asistentes', 'numero_personas', 'n_personas', 'cantidad', 'cantidad_personas', 'participantes', 'estudiantes'],
      inicio: ['inicio', 'fecha_inicio', 'fecha_hora_inicio', 'desde', 'start', 'hora_inicio'],
      fin: ['fin', 'fecha_fin', 'fecha_hora_fin', 'hasta', 'end', 'hora_fin'],
      fecha: ['fecha', 'dia', 'date'],
      estado: ['estado', 'status'],
    },
  },
  prestamos: {
    etiqueta: 'Préstamos',
    patrones: ['prestamo', 'loan'],
    alias: {
      id: ['id', 'id_prestamo', 'codigo', 'codigo_prestamo'],
      equipo_id: ['equipo_id', 'id_equipo', 'codigo_equipo', 'equipo', 'recurso', 'recurso_id'],
      responsable: ['responsable', 'prestado_a', 'solicitante', 'usuario', 'persona', 'nombre', 'estudiante', 'camper'],
      documento: ['documento', 'cedula', 'identificacion', 'documento_identidad', 'doc'],
      fecha_prestamo: ['fecha_prestamo', 'fecha_salida', 'fecha_entrega_equipo', 'fecha', 'inicio', 'desde'],
      devolucion_prevista: ['devolucion_prevista', 'fecha_devolucion_prevista', 'fecha_limite', 'vence', 'fecha_vencimiento', 'hasta'],
      fecha_devolucion: ['fecha_devolucion', 'fecha_devolucion_real', 'devuelto_en', 'fecha_retorno'],
      estado: ['estado', 'status'],
      observaciones: ['observaciones', 'notas', 'comentarios'],
    },
  },
  incidencias: {
    etiqueta: 'Incidencias',
    patrones: ['incidencia', 'incidente', 'solicitud', 'ticket', 'novedad', 'reporte', 'pqr'],
    alias: {
      id: ['id', 'id_incidencia', 'codigo', 'ticket', 'numero', 'radicado', 'id_solicitud'],
      titulo: ['titulo', 'asunto', 'title', 'resumen'],
      descripcion: ['descripcion', 'detalle', 'description', 'mensaje', 'observacion', 'observaciones'],
      categoria: ['categoria', 'tipo', 'tipo_incidencia', 'clasificacion'],
      prioridad: ['prioridad', 'priority', 'urgencia', 'nivel'],
      area_responsable: ['area_responsable', 'area', 'area_asignada', 'dependencia', 'responsable_area'],
      estado: ['estado', 'status'],
      espacio_id: ['espacio_id', 'id_espacio', 'espacio', 'aula', 'cubiculo', 'salon'],
      equipo_id: ['equipo_id', 'id_equipo', 'equipo', 'recurso'],
      reportado_por: ['reportado_por', 'reporta', 'solicitante', 'usuario', 'creado_por'],
      asignado_a: ['asignado_a', 'tecnico', 'responsable', 'atendido_por'],
      solucion: ['solucion', 'resolucion', 'respuesta'],
      fecha: ['fecha', 'fecha_creacion', 'fecha_reporte', 'creado_en', 'created_at'],
    },
  },
  espacios: {
    etiqueta: 'Espacios',
    patrones: ['espacio', 'aula', 'cubiculo', 'salon', 'sala', 'ambiente'],
    alias: {
      id: ['id', 'codigo', 'id_espacio', 'codigo_espacio', 'espacio_id', 'cod'],
      nombre: ['nombre', 'nombre_espacio', 'name', 'espacio', 'descripcion'],
      tipo: ['tipo', 'tipo_espacio', 'type', 'clase', 'categoria'],
      capacidad: ['capacidad', 'aforo', 'capacity', 'cupo', 'capacidad_maxima', 'max_personas'],
      estado: ['estado', 'estado_espacio', 'status', 'condicion'],
      ubicacion: ['ubicacion', 'location', 'sede', 'bloque', 'piso', 'edificio'],
    },
  },
  equipos: {
    etiqueta: 'Equipos',
    patrones: ['equipo', 'recurso', 'dispositivo', 'inventario', 'tecnolog', 'computador', 'portatil'],
    alias: {
      id: ['id', 'codigo', 'id_equipo', 'codigo_equipo', 'equipo_id', 'placa', 'codigo_inventario'],
      nombre: ['nombre', 'nombre_equipo', 'name', 'equipo', 'descripcion', 'modelo'],
      tipo: ['tipo', 'tipo_equipo', 'type', 'categoria', 'clase'],
      marca: ['marca', 'brand', 'fabricante'],
      serial: ['serial', 'serie', 'numero_serie', 'no_serie', 'sn', 'serial_number'],
      estado: ['estado', 'estado_operativo', 'status', 'condicion'],
      ubicacion: ['ubicacion', 'location', 'sede', 'bloque', 'espacio'],
      prestado_a: ['prestado_a', 'asignado_a', 'responsable_prestamo'],
    },
  },
};

export function detectarEntidad(nombreColeccion) {
  const clave = claveNormalizada(nombreColeccion);
  return Object.keys(ENTIDADES).find((entidad) => ENTIDADES[entidad].patrones.some((p) => clave.includes(p))) ?? null;
}

// Construye un accesor que, para cada campo del modelo, encuentra la columna
// del archivo que corresponde según los alias (comparando sin tildes ni mayúsculas).
export function crearMapeo(entidad, columnas) {
  const { alias } = ENTIDADES[entidad];
  const porClave = new Map(columnas.map((c) => [claveNormalizada(c), c]));
  const mapeo = {};
  const usadas = new Set();
  for (const [campo, nombres] of Object.entries(alias)) {
    const encontrada = nombres.map((n) => porClave.get(n)).find((c) => c !== undefined && !usadas.has(c));
    if (encontrada !== undefined) {
      mapeo[campo] = encontrada;
      usadas.add(encontrada);
    }
  }
  const noReconocidas = columnas.filter((c) => !usadas.has(c));
  return { mapeo, noReconocidas };
}

function valorDe(datos, mapeo, campo) {
  const columna = mapeo[campo];
  if (columna === undefined) return undefined;
  const valor = datos[columna];
  if (valor === null || valor === undefined) return undefined;
  const texto = String(valor).trim();
  return texto === '' ? undefined : texto;
}

function desdeCatalogo(valor, sinonimos) {
  if (valor === undefined) return undefined;
  return sinonimos[claveNormalizada(valor)] ?? null; // null = desconocido
}

function entero(valor) {
  if (valor === undefined) return undefined;
  return /^\d+$/.test(valor) ? Number(valor) : (/^\d+\.0+$/.test(valor) ? Number.parseInt(valor, 10) : null);
}

// Cada normalizador devuelve { valor, errores, advertencias } para un registro.
export const NORMALIZADORES = {
  espacios(datos, mapeo, { nombreColeccion }) {
    const errores = [];
    const advertencias = [];
    const id = valorDe(datos, mapeo, 'id');
    const nombre = limpiarTexto(valorDe(datos, mapeo, 'nombre'), 120);
    const tipoCrudo = valorDe(datos, mapeo, 'tipo');
    let tipo = desdeCatalogo(tipoCrudo, SINONIMOS.tipoEspacio);
    const capacidadCruda = valorDe(datos, mapeo, 'capacidad');
    const capacidad = entero(capacidadCruda);
    const estadoCrudo = valorDe(datos, mapeo, 'estado');
    const estado = desdeCatalogo(estadoCrudo, SINONIMOS.estadoEspacio);

    if (id === undefined) errores.push('Falta el identificador.');
    else if (!esIdentificadorValido(id)) errores.push(`Identificador inválido: "${id}".`);
    if (!nombre) errores.push('Falta el nombre.');
    if (tipoCrudo === undefined) {
      // Se infiere solo si el propio nombre o el nombre del archivo lo dice explícitamente.
      const pista = claveNormalizada(`${nombre} ${nombreColeccion}`);
      const enPista = ['cubiculo', 'aula'].filter((t) => pista.includes(t));
      if (enPista.length === 1) {
        tipo = enPista[0];
        advertencias.push(`Sin columna de tipo: se tomó "${tipo}" del nombre.`);
      } else errores.push('Falta el tipo (aula o cubículo).');
    } else if (tipo === null) errores.push(`Tipo desconocido: "${tipoCrudo}".`);
    if (capacidadCruda === undefined) errores.push('Falta la capacidad.');
    else if (!(capacidad > 0)) errores.push(`Capacidad inválida: "${capacidadCruda}".`);
    if (estadoCrudo === undefined) errores.push('Falta el estado.');
    else if (estado === null) errores.push(`Estado desconocido: "${estadoCrudo}".`);

    return {
      valor: { id, nombre, tipo, capacidad, estado, ubicacion: limpiarTexto(valorDe(datos, mapeo, 'ubicacion'), 120) || null },
      errores,
      advertencias,
    };
  },

  equipos(datos, mapeo) {
    const errores = [];
    const advertencias = [];
    const id = valorDe(datos, mapeo, 'id');
    const nombre = limpiarTexto(valorDe(datos, mapeo, 'nombre'), 120);
    let tipo = limpiarTexto(valorDe(datos, mapeo, 'tipo'), 60).toLowerCase();
    const estadoCrudo = valorDe(datos, mapeo, 'estado');
    let estado = desdeCatalogo(estadoCrudo, SINONIMOS.estadoEquipo);
    let marcadoPrestado = false;

    if (id === undefined) errores.push('Falta el identificador.');
    else if (!esIdentificadorValido(id)) errores.push(`Identificador inválido: "${id}".`);
    if (!nombre) errores.push('Falta el nombre.');
    if (!tipo) {
      tipo = 'sin clasificar';
      advertencias.push('Sin tipo de equipo: quedó como "sin clasificar".');
    }
    if (estadoCrudo === undefined) errores.push('Falta el estado operativo.');
    else if (estado === null) errores.push(`Estado desconocido: "${estadoCrudo}".`);
    else if (estado === 'prestado') {
      estado = 'operativo';
      marcadoPrestado = true;
    }

    return {
      valor: {
        id,
        nombre,
        tipo,
        estado,
        marca: limpiarTexto(valorDe(datos, mapeo, 'marca'), 60) || null,
        serial: limpiarTexto(valorDe(datos, mapeo, 'serial'), 80) || null,
        ubicacion: limpiarTexto(valorDe(datos, mapeo, 'ubicacion'), 120) || null,
        marcadoPrestado,
        prestadoA: limpiarTexto(valorDe(datos, mapeo, 'prestado_a'), 120) || null,
      },
      errores,
      advertencias,
    };
  },

  reservas(datos, mapeo) {
    const errores = [];
    const advertencias = [];
    const fecha = valorDe(datos, mapeo, 'fecha');
    const combinar = (valor, horaDefecto) => {
      if (valor === undefined) return undefined;
      const completa = normalizarFechaHora(valor, horaDefecto);
      if (completa && !(fecha && /^\d{1,2}:\d{2}/.test(valor))) return completa;
      // Columna con solo la hora + columna de fecha aparte.
      const hora = normalizarHora(valor);
      const dia = fecha ? normalizarFechaHora(fecha) : null;
      return hora && dia ? `${dia.slice(0, 10)}T${hora}` : null;
    };
    const inicioCrudo = valorDe(datos, mapeo, 'inicio');
    const finCrudo = valorDe(datos, mapeo, 'fin');
    const inicio = combinar(inicioCrudo);
    const fin = combinar(finCrudo);
    const personasCrudo = valorDe(datos, mapeo, 'personas');
    const personas = entero(personasCrudo);
    const estadoCrudo = valorDe(datos, mapeo, 'estado');
    const sinonimosReserva = {
      activa: 'activa', activo: 'activa', confirmada: 'activa', aprobada: 'activa', vigente: 'activa',
      reservada: 'activa', finalizada: 'activa', completada: 'activa',
      cancelada: 'cancelada', cancelado: 'cancelada', anulada: 'cancelada', rechazada: 'cancelada',
    };
    const estado = estadoCrudo === undefined ? 'activa' : desdeCatalogo(estadoCrudo, sinonimosReserva);

    const espacio = valorDe(datos, mapeo, 'espacio_id');
    const responsable = limpiarTexto(valorDe(datos, mapeo, 'responsable'), 120);
    if (!espacio) errores.push('Falta el espacio.');
    if (!responsable) errores.push('Falta el responsable.');
    if (inicioCrudo === undefined) errores.push('Falta el inicio.');
    else if (!inicio) errores.push(`Inicio inválido: "${inicioCrudo}".`);
    if (finCrudo === undefined) errores.push('Falta el fin.');
    else if (!fin) errores.push(`Fin inválido: "${finCrudo}".`);
    if (inicio && fin && fin <= inicio) errores.push('El fin es anterior o igual al inicio.');
    if (personasCrudo === undefined) errores.push('Falta el número de personas.');
    else if (!(personas > 0)) errores.push(`Número de personas inválido: "${personasCrudo}".`);
    if (estado === null) errores.push(`Estado desconocido: "${estadoCrudo}".`);

    return {
      valor: {
        id_origen: valorDe(datos, mapeo, 'id') ?? null,
        espacio_ref: espacio,
        responsable,
        motivo: limpiarTexto(valorDe(datos, mapeo, 'motivo'), 200) || null,
        personas,
        inicio,
        fin,
        estado,
      },
      errores,
      advertencias,
    };
  },

  prestamos(datos, mapeo) {
    const errores = [];
    const advertencias = [];
    const equipo = valorDe(datos, mapeo, 'equipo_id');
    const responsable = limpiarTexto(valorDe(datos, mapeo, 'responsable'), 120);
    const fpCrudo = valorDe(datos, mapeo, 'fecha_prestamo');
    const dpCrudo = valorDe(datos, mapeo, 'devolucion_prevista');
    const fdCrudo = valorDe(datos, mapeo, 'fecha_devolucion');
    const fechaPrestamo = normalizarFechaHora(fpCrudo, '08:00');
    const devolucionPrevista = dpCrudo === undefined ? null : normalizarFechaHora(dpCrudo, '18:00');
    const fechaDevolucion = fdCrudo === undefined ? null : normalizarFechaHora(fdCrudo, '18:00');
    const estadoCrudo = valorDe(datos, mapeo, 'estado');
    const sinonimosPrestamo = {
      activo: 'activo', activa: 'activo', vigente: 'activo', prestado: 'activo', en_curso: 'activo', pendiente: 'activo',
      devuelto: 'devuelto', devuelta: 'devuelto', entregado: 'devuelto', cerrado: 'devuelto', finalizado: 'devuelto',
    };
    let estado = desdeCatalogo(estadoCrudo, sinonimosPrestamo);

    if (!equipo) errores.push('Falta el equipo.');
    if (!responsable) errores.push('Falta el responsable.');
    if (fpCrudo === undefined) errores.push('Falta la fecha del préstamo.');
    else if (!fechaPrestamo) errores.push(`Fecha de préstamo inválida: "${fpCrudo}".`);
    if (dpCrudo !== undefined && !devolucionPrevista) errores.push(`Devolución prevista inválida: "${dpCrudo}".`);
    if (fdCrudo !== undefined && !fechaDevolucion) errores.push(`Fecha de devolución inválida: "${fdCrudo}".`);
    if (estadoCrudo !== undefined && estado === null) errores.push(`Estado desconocido: "${estadoCrudo}".`);
    if (estadoCrudo === undefined) {
      estado = fechaDevolucion ? 'devuelto' : 'activo';
      advertencias.push(`Sin columna de estado: se dedujo "${estado}" por la fecha de devolución.`);
    }
    // R5: un registro no puede estar activo y devuelto a la vez.
    if (estado === 'activo' && fechaDevolucion) errores.push('Registro contradictorio: está activo pero tiene fecha de devolución.');
    if (estado === 'devuelto' && fdCrudo === undefined) errores.push('Registro contradictorio: está devuelto pero no tiene fecha de devolución.');
    if (fechaPrestamo && fechaDevolucion && fechaDevolucion < fechaPrestamo) errores.push('La devolución es anterior al préstamo.');
    if (fechaPrestamo && devolucionPrevista && devolucionPrevista <= fechaPrestamo) {
      errores.push('La devolución prevista es anterior o igual al préstamo.');
    }
    if (estado === 'activo' && dpCrudo === undefined) advertencias.push('Préstamo activo sin fecha prevista de devolución.');

    return {
      valor: {
        id_origen: valorDe(datos, mapeo, 'id') ?? null,
        equipo_ref: equipo,
        responsable,
        documento: limpiarTexto(valorDe(datos, mapeo, 'documento'), 30) || null,
        fecha_prestamo: fechaPrestamo,
        devolucion_prevista: devolucionPrevista,
        fecha_devolucion: estado === 'devuelto' ? fechaDevolucion : null,
        estado,
        observaciones: limpiarTexto(valorDe(datos, mapeo, 'observaciones'), 300) || null,
      },
      errores,
      advertencias,
    };
  },

  incidencias(datos, mapeo) {
    const errores = [];
    const advertencias = [];
    const id = valorDe(datos, mapeo, 'id');
    let titulo = limpiarTexto(valorDe(datos, mapeo, 'titulo'), 120);
    const descripcion = limpiarTextoLargo(valorDe(datos, mapeo, 'descripcion'), 4000);
    const estadoCrudo = valorDe(datos, mapeo, 'estado');
    const estado = estadoCrudo === undefined ? null : desdeCatalogo(estadoCrudo, SINONIMOS.estadoIncidencia);

    if (id !== undefined && !esIdentificadorValido(id)) errores.push(`Identificador inválido: "${id}".`);
    if (!descripcion && !titulo) errores.push('Falta la descripción.');
    if (!titulo && descripcion) {
      titulo = limpiarTexto(descripcion, 60);
      advertencias.push('Sin título: se usó el inicio de la descripción.');
    }
    if (estadoCrudo === undefined) errores.push('Falta el estado.');
    else if (estado === null) errores.push(`Estado desconocido: "${estadoCrudo}".`);

    // Clasificación: un valor fuera de catálogo no bloquea el registro; la
    // incidencia queda "sin clasificar" para revisarla (manualmente o con IA).
    const clasificacion = {};
    for (const [campo, sinonimos] of [
      ['categoria', SINONIMOS.categoria],
      ['prioridad', SINONIMOS.prioridad],
      ['area_responsable', SINONIMOS.area],
    ]) {
      const crudo = valorDe(datos, mapeo, campo);
      const valor = desdeCatalogo(crudo, sinonimos);
      if (crudo !== undefined && valor === null) advertencias.push(`${campo} desconocida: "${crudo}" (quedó sin clasificar).`);
      clasificacion[campo] = valor || null;
    }
    if (
      clasificacion.categoria &&
      clasificacion.area_responsable &&
      !CATEGORIAS[clasificacion.categoria].areas.includes(clasificacion.area_responsable)
    ) {
      advertencias.push(`Área "${clasificacion.area_responsable}" incompatible con la categoría "${clasificacion.categoria}": se dejó sin área.`);
      clasificacion.area_responsable = null;
    }

    const solucion = limpiarTextoLargo(valorDe(datos, mapeo, 'solucion'), 2000) || null;
    if ((estado === 'resuelta' || estado === 'cerrada') && !solucion) {
      advertencias.push(`Incidencia ${estado} sin solución registrada en el archivo.`);
    }
    const fechaCruda = valorDe(datos, mapeo, 'fecha');
    const fecha = fechaCruda === undefined ? null : normalizarFechaHora(fechaCruda);
    if (fechaCruda !== undefined && !fecha) advertencias.push(`Fecha inválida: "${fechaCruda}" (se usó la de importación).`);

    return {
      valor: {
        id: id ?? null,
        titulo,
        descripcion: descripcion || titulo,
        estado,
        ...clasificacion,
        espacio_ref: valorDe(datos, mapeo, 'espacio_id') ?? null,
        equipo_ref: valorDe(datos, mapeo, 'equipo_id') ?? null,
        reportado_por: limpiarTexto(valorDe(datos, mapeo, 'reportado_por'), 120) || null,
        asignado_a: limpiarTexto(valorDe(datos, mapeo, 'asignado_a'), 120) || null,
        solucion,
        fecha,
      },
      errores,
      advertencias,
    };
  },
};
