// R6 · Integridad de incidencias (funciones puras).
// Estas reglas se aplican igual si la clasificación la propone una persona o
// la IA: la sugerencia del modelo nunca salta estas validaciones.

import { ReglaNegocioError } from './errores.js';
import {
  CATEGORIAS,
  ESTADOS_FINALES_INCIDENCIA,
  ESTADOS_INCIDENCIA,
  ETIQUETAS,
  PRIORIDADES,
  AREAS,
  TRANSICIONES_INCIDENCIA,
} from './catalogos.js';

const etiqueta = (valor) => ETIQUETAS[valor] ?? CATEGORIAS[valor]?.etiqueta ?? valor;
const tieneTexto = (valor, minimo) => typeof valor === 'string' && valor.trim().length >= minimo;

export const MINIMO_SOLUCION = 10;
export const MINIMO_MOTIVO = 5;

// Una incidencia cerrada o cancelada es histórica: no se edita ni se reasigna.
export function validarIncidenciaModificable(incidencia) {
  if (ESTADOS_FINALES_INCIDENCIA.includes(incidencia.estado)) {
    throw new ReglaNegocioError(
      'R6_INTEGRIDAD_INCIDENCIAS',
      `La incidencia ${incidencia.id} está ${etiqueta(incidencia.estado).toLowerCase()} y ya no se puede modificar.`,
    );
  }
}

// Categoría, prioridad y área deben existir en el catálogo y ser compatibles
// entre sí (p. ej. una falla de red no se asigna a Servicios generales).
export function validarClasificacion({ categoria, prioridad, area_responsable }) {
  const problemas = [];
  if (!CATEGORIAS[categoria]) problemas.push(`Categoría desconocida: "${categoria ?? ''}".`);
  if (!PRIORIDADES.includes(prioridad)) problemas.push(`Prioridad desconocida: "${prioridad ?? ''}".`);
  if (!AREAS.includes(area_responsable)) problemas.push(`Área desconocida: "${area_responsable ?? ''}".`);
  if (problemas.length) {
    throw new ReglaNegocioError('R6_INTEGRIDAD_INCIDENCIAS', problemas.join(' '), { problemas });
  }
  const areasPermitidas = CATEGORIAS[categoria].areas;
  if (!areasPermitidas.includes(area_responsable)) {
    throw new ReglaNegocioError(
      'R6_INTEGRIDAD_INCIDENCIAS',
      `Una incidencia de "${etiqueta(categoria)}" no puede asignarse a "${etiqueta(area_responsable)}". ` +
        `Áreas permitidas: ${areasPermitidas.map(etiqueta).join(', ')}.`,
      { areasPermitidas },
    );
  }
}

// Clasificar o reasignar exige una incidencia abierta o en progreso. Si ya
// está en progreso y cambia de área, la persona asignada pertenece al área
// anterior: hay que indicar quién la atiende ahora.
export function validarReclasificacion(incidencia, nueva) {
  validarIncidenciaModificable(incidencia);
  if (incidencia.estado === 'resuelta') {
    throw new ReglaNegocioError(
      'R6_INTEGRIDAD_INCIDENCIAS',
      `La incidencia ${incidencia.id} ya está resuelta. Reábrela (en progreso) antes de reclasificarla.`,
    );
  }
  validarClasificacion(nueva);
  const cambiaArea = incidencia.area_responsable && nueva.area_responsable !== incidencia.area_responsable;
  if (incidencia.estado === 'en_progreso' && cambiaArea && !tieneTexto(nueva.asignado_a, 2)) {
    throw new ReglaNegocioError(
      'R6_INTEGRIDAD_INCIDENCIAS',
      `Al reasignar a "${etiqueta(nueva.area_responsable)}" una incidencia en progreso, indica la persona que la atenderá.`,
    );
  }
}

// Máquina de estados: valida que la transición exista y que la incidencia
// tenga la información que el nuevo estado exige.
export function validarTransicion(incidencia, nuevoEstado, datos = {}) {
  validarIncidenciaModificable(incidencia);
  if (!ESTADOS_INCIDENCIA.includes(nuevoEstado)) {
    throw new ReglaNegocioError('R6_INTEGRIDAD_INCIDENCIAS', `Estado desconocido: "${nuevoEstado}".`);
  }
  const permitidos = TRANSICIONES_INCIDENCIA[incidencia.estado] ?? [];
  if (!permitidos.includes(nuevoEstado)) {
    throw new ReglaNegocioError(
      'R6_INTEGRIDAD_INCIDENCIAS',
      `No se puede pasar de "${etiqueta(incidencia.estado)}" a "${etiqueta(nuevoEstado)}". ` +
        `Desde "${etiqueta(incidencia.estado)}" solo se permite: ${permitidos.map(etiqueta).join(', ') || 'ninguno'}.`,
      { permitidos },
    );
  }

  const asignado = datos.asignado_a ?? incidencia.asignado_a;
  const solucion = datos.solucion ?? incidencia.solucion;

  if (nuevoEstado === 'en_progreso') {
    if (!incidencia.categoria || !incidencia.prioridad || !incidencia.area_responsable) {
      throw new ReglaNegocioError(
        'R6_INTEGRIDAD_INCIDENCIAS',
        'Clasifica la incidencia (categoría, prioridad y área) antes de ponerla en progreso.',
      );
    }
    if (!tieneTexto(asignado, 2)) {
      throw new ReglaNegocioError('R6_INTEGRIDAD_INCIDENCIAS', 'Indica la persona responsable de atenderla.');
    }
  }
  if (nuevoEstado === 'resuelta' && !tieneTexto(solucion, MINIMO_SOLUCION)) {
    throw new ReglaNegocioError(
      'R6_INTEGRIDAD_INCIDENCIAS',
      `Describe la solución aplicada (mínimo ${MINIMO_SOLUCION} caracteres) para marcarla como resuelta.`,
    );
  }
  if (nuevoEstado === 'cerrada' && !tieneTexto(solucion, MINIMO_SOLUCION)) {
    throw new ReglaNegocioError('R6_INTEGRIDAD_INCIDENCIAS', 'No se puede cerrar una incidencia sin solución registrada.');
  }
  if (nuevoEstado === 'cancelada' && !tieneTexto(datos.motivo, MINIMO_MOTIVO)) {
    throw new ReglaNegocioError(
      'R6_INTEGRIDAD_INCIDENCIAS',
      `Indica el motivo de la cancelación (mínimo ${MINIMO_MOTIVO} caracteres).`,
    );
  }
}
