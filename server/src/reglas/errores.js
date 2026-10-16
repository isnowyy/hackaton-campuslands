// Errores del dominio. La API los convierte en respuestas JSON con un código
// estable para que la interfaz muestre qué regla se incumplió y por qué.

export const REGLAS = {
  R1_AFORO: 'R1 · Aforo',
  R2_CRUCE_HORARIO: 'R2 · Conflicto de horario',
  R3_ESTADO_ESPACIO: 'R3 · Estado del espacio',
  R4_DISPONIBILIDAD_EQUIPO: 'R4 · Disponibilidad del equipo',
  R5_INTEGRIDAD_OPERACIONES: 'R5 · Integridad de operaciones',
  R6_INTEGRIDAD_INCIDENCIAS: 'R6 · Integridad de incidencias',
};

// Una operación válida en forma pero prohibida por una regla de negocio (HTTP 409).
export class ReglaNegocioError extends Error {
  constructor(regla, mensaje, detalles = undefined) {
    super(mensaje);
    this.name = 'ReglaNegocioError';
    this.regla = regla;
    this.nombreRegla = REGLAS[regla] ?? regla;
    this.detalles = detalles;
    this.status = 409;
  }
}

// Datos mal formados o incompletos (HTTP 422). Agrupa todos los problemas
// encontrados para que el formulario los muestre de una vez.
export class ValidacionError extends Error {
  constructor(problemas) {
    const lista = Array.isArray(problemas) ? problemas : [problemas];
    super(lista.join(' '));
    this.name = 'ValidacionError';
    this.problemas = lista;
    this.status = 422;
  }
}

export class NoEncontradoError extends Error {
  constructor(entidad, id) {
    super(`No existe ${entidad} con identificador "${id}".`);
    this.name = 'NoEncontradoError';
    this.status = 404;
  }
}

// Acumulador para validar varios campos y lanzar un único ValidacionError.
export function crearValidador() {
  const problemas = [];
  return {
    exigir(condicion, mensaje) {
      if (!condicion) problemas.push(mensaje);
    },
    agregar(mensaje) {
      problemas.push(mensaje);
    },
    lanzarSiHayProblemas() {
      if (problemas.length) throw new ValidacionError(problemas);
    },
  };
}
