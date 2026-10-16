// Cliente HTTP de la API. Todas las validaciones reales viven en el servidor;
// aquí solo se transporta la petición y se traduce el error a un objeto que
// la interfaz sabe mostrar (regla incumplida, problemas de validación, IA...).

export class ErrorApi extends Error {
  constructor(status, cuerpo) {
    super(cuerpo?.mensaje || `Error ${status}`);
    this.status = status;
    this.tipo = cuerpo?.error ?? 'desconocido';
    this.regla = cuerpo?.regla ?? null;
    this.nombreRegla = cuerpo?.nombre_regla ?? null;
    this.problemas = cuerpo?.problemas ?? [];
    this.codigo = cuerpo?.codigo ?? null; // errores de IA
    this.detalles = cuerpo?.detalles ?? null;
    this.respuestaCruda = cuerpo?.respuesta_cruda ?? null;
  }
}

const CLAVE_OPERADOR = 'campus.operador';

export function leerOperador() {
  try {
    return localStorage.getItem(CLAVE_OPERADOR) || '';
  } catch {
    return '';
  }
}

export function guardarOperador(nombre) {
  try {
    localStorage.setItem(CLAVE_OPERADOR, nombre);
  } catch {
    // Sin almacenamiento local el nombre solo dura la sesión; no es crítico.
  }
}

export async function api(ruta, { metodo = 'GET', cuerpo, parametros } = {}) {
  const consulta = parametros
    ? '?' + new URLSearchParams(Object.entries(parametros).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false)).toString()
    : '';
  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}${consulta}`, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'X-Operador': encodeURIComponent(leerOperador() || 'anónimo').slice(0, 180),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(0, { error: 'red', mensaje: 'No hay conexión con el servidor. ¿Está corriendo la API?' });
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, datos);
  return datos;
}
