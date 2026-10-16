// Catálogos del dominio: único lugar donde se definen estados, categorías,
// prioridades y áreas. Las reglas de negocio, el importador, la IA y la
// interfaz (vía GET /api/catalogos) leen de aquí, así que un cambio en vivo
// durante la sustentación se hace en este archivo y se propaga a todo.

export const TIPOS_ESPACIO = ['aula', 'cubiculo'];

// Regla 3: solo 'disponible' admite reservas.
export const ESTADOS_ESPACIO = ['disponible', 'mantenimiento', 'inhabilitado'];

// Regla 4: solo 'operativo' admite préstamos. "Prestado" no es un estado del
// equipo sino un hecho derivado de tener un préstamo activo (ver
// reglasEquipos.js); así no pueden existir dos fuentes de verdad contradictorias.
export const ESTADOS_EQUIPO = ['operativo', 'danado', 'mantenimiento', 'inhabilitado'];

// Regla 6: ciclo de vida de una incidencia.
export const ESTADOS_INCIDENCIA = ['abierta', 'en_progreso', 'resuelta', 'cerrada', 'cancelada'];
export const ESTADOS_FINALES_INCIDENCIA = ['cerrada', 'cancelada'];
export const TRANSICIONES_INCIDENCIA = {
  abierta: ['en_progreso', 'cancelada'],
  en_progreso: ['resuelta', 'abierta', 'cancelada'],
  resuelta: ['cerrada', 'en_progreso'],
  cerrada: [],
  cancelada: [],
};

export const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];

export const AREAS = [
  'soporte_ti',
  'mantenimiento',
  'servicios_generales',
  'seguridad',
  'coordinacion_academica',
];

// Cada categoría declara qué áreas pueden atenderla. Asignar o reasignar una
// incidencia a un área fuera de esta lista es "información incompatible"
// (regla 6), venga la propuesta de una persona o de la IA.
export const CATEGORIAS = {
  hardware: { etiqueta: 'Hardware / equipos', areas: ['soporte_ti'] },
  software: { etiqueta: 'Software y cuentas', areas: ['soporte_ti'] },
  red: { etiqueta: 'Red e internet', areas: ['soporte_ti'] },
  electrico: { etiqueta: 'Eléctrico', areas: ['mantenimiento'] },
  infraestructura: { etiqueta: 'Infraestructura física', areas: ['mantenimiento'] },
  mobiliario: { etiqueta: 'Mobiliario', areas: ['mantenimiento', 'servicios_generales'] },
  aseo: { etiqueta: 'Aseo y limpieza', areas: ['servicios_generales'] },
  seguridad: { etiqueta: 'Seguridad y acceso', areas: ['seguridad'] },
  academico: { etiqueta: 'Solicitud académica', areas: ['coordinacion_academica'] },
  otro: { etiqueta: 'Otro', areas: [...AREAS] },
};
export const LISTA_CATEGORIAS = Object.keys(CATEGORIAS);

export const ETIQUETAS = {
  aula: 'Aula',
  cubiculo: 'Cubículo',
  disponible: 'Disponible',
  mantenimiento: 'Mantenimiento',
  inhabilitado: 'Inhabilitado',
  operativo: 'Operativo',
  danado: 'Dañado',
  abierta: 'Abierta',
  en_progreso: 'En progreso',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
  soporte_ti: 'Soporte TI',
  servicios_generales: 'Servicios generales',
  seguridad: 'Seguridad',
  coordinacion_academica: 'Coordinación académica',
  // Disponibilidad derivada y estados de reservas/préstamos/sugerencias.
  libre: 'Libre',
  ocupado: 'Ocupado',
  no_disponible: 'No disponible',
  prestado: 'Prestado',
  activa: 'Activa',
  activo: 'Activo',
  devuelto: 'Devuelto',
  pendiente: 'Pendiente de revisión',
  aceptada: 'Aceptada',
  editada: 'Editada',
  descartada: 'Descartada',
  // Entidades (trazabilidad).
  espacio: 'Espacio',
  reserva: 'Reserva',
  equipo: 'Equipo',
  incidencia: 'Incidencia',
  importacion: 'Importación',
};

// Sinónimos que pueden aparecer en los archivos oficiales. Se comparan ya
// normalizados (minúsculas, sin tildes, espacios -> _). Un valor que no esté
// aquí ni en el catálogo se reporta como "estado desconocido": nunca se adivina.
export const SINONIMOS = {
  tipoEspacio: {
    aula: 'aula', salon: 'aula', salon_de_clase: 'aula', sala: 'aula', laboratorio: 'aula',
    cubiculo: 'cubiculo', sala_de_estudio: 'cubiculo', box: 'cubiculo',
  },
  estadoEspacio: {
    disponible: 'disponible', activo: 'disponible', activa: 'disponible', habilitado: 'disponible',
    habilitada: 'disponible', libre: 'disponible', operativo: 'disponible', ok: 'disponible',
    mantenimiento: 'mantenimiento', en_mantenimiento: 'mantenimiento', reparacion: 'mantenimiento',
    en_reparacion: 'mantenimiento',
    inhabilitado: 'inhabilitado', inhabilitada: 'inhabilitado', deshabilitado: 'inhabilitado',
    deshabilitada: 'inhabilitado', fuera_de_servicio: 'inhabilitado', cerrado: 'inhabilitado',
    inactivo: 'inhabilitado', inactiva: 'inhabilitado', bloqueado: 'inhabilitado',
  },
  estadoEquipo: {
    operativo: 'operativo', disponible: 'operativo', funcional: 'operativo', activo: 'operativo',
    bueno: 'operativo', ok: 'operativo', habilitado: 'operativo',
    danado: 'danado', averiado: 'danado', roto: 'danado', defectuoso: 'danado',
    mantenimiento: 'mantenimiento', en_mantenimiento: 'mantenimiento', en_reparacion: 'mantenimiento',
    reparacion: 'mantenimiento',
    inhabilitado: 'inhabilitado', deshabilitado: 'inhabilitado', fuera_de_servicio: 'inhabilitado',
    dado_de_baja: 'inhabilitado', baja: 'inhabilitado', inactivo: 'inhabilitado',
    // Un archivo puede marcar el equipo como prestado. Se importa como operativo
    // y el importador lo reporta, porque el préstamo debe existir como registro.
    prestado: 'prestado', en_prestamo: 'prestado', asignado: 'prestado',
  },
  estadoIncidencia: {
    abierta: 'abierta', abierto: 'abierta', nueva: 'abierta', nuevo: 'abierta', pendiente: 'abierta',
    reportada: 'abierta', registrada: 'abierta',
    en_progreso: 'en_progreso', en_proceso: 'en_progreso', en_curso: 'en_progreso',
    asignada: 'en_progreso', en_atencion: 'en_progreso',
    resuelta: 'resuelta', resuelto: 'resuelta', solucionada: 'resuelta', solucionado: 'resuelta',
    cerrada: 'cerrada', cerrado: 'cerrada', finalizada: 'cerrada',
    cancelada: 'cancelada', cancelado: 'cancelada', anulada: 'cancelada', descartada: 'cancelada',
  },
  prioridad: {
    baja: 'baja', low: 'baja', '1': 'baja',
    media: 'media', normal: 'media', medium: 'media', '2': 'media',
    alta: 'alta', high: 'alta', '3': 'alta',
    critica: 'critica', urgente: 'critica', critical: 'critica', '4': 'critica',
  },
  area: {
    soporte_ti: 'soporte_ti', ti: 'soporte_ti', tic: 'soporte_ti', sistemas: 'soporte_ti',
    soporte: 'soporte_ti', soporte_tecnico: 'soporte_ti', tecnologia: 'soporte_ti',
    mantenimiento: 'mantenimiento', infraestructura: 'mantenimiento', planta_fisica: 'mantenimiento',
    servicios_generales: 'servicios_generales', aseo: 'servicios_generales', logistica: 'servicios_generales',
    seguridad: 'seguridad', vigilancia: 'seguridad',
    coordinacion_academica: 'coordinacion_academica', academico: 'coordinacion_academica',
    academica: 'coordinacion_academica', coordinacion: 'coordinacion_academica',
  },
  categoria: {
    hardware: 'hardware', equipo: 'hardware', equipos: 'hardware', computador: 'hardware',
    software: 'software', aplicacion: 'software', cuenta: 'software', cuentas: 'software',
    red: 'red', internet: 'red', wifi: 'red', conectividad: 'red',
    electrico: 'electrico', electricidad: 'electrico', energia: 'electrico',
    infraestructura: 'infraestructura', planta_fisica: 'infraestructura', locativo: 'infraestructura',
    mobiliario: 'mobiliario', muebles: 'mobiliario',
    aseo: 'aseo', limpieza: 'aseo',
    seguridad: 'seguridad', acceso: 'seguridad',
    academico: 'academico', academica: 'academico', solicitud_academica: 'academico',
    otro: 'otro', otros: 'otro', general: 'otro',
  },
};
