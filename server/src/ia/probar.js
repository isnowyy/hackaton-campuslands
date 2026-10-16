// Prueba de conexión con la IA configurada en .env: hace UNA consulta real de
// triaje y muestra la respuesta validada, o el error exacto si algo falla.
// Uso: npm run probar-ia
// La incidencia de ejemplo es solo la entrada; la salida es la del modelo.

import { estadoPublicoIA, leerConfiguracionIA } from './configuracion.js';
import { IAError } from './errores.js';
import { crearTriaje } from './triaje.js';

const estado = estadoPublicoIA(leerConfiguracionIA());
console.log(`Proveedor: ${estado.proveedor ?? '—'} · Modelo: ${estado.modelo ?? '—'} · Tiempo máximo: ${estado.timeout_ms} ms`);
if (!estado.configurada) {
  console.error(`IA no configurada: ${estado.motivo}`);
  process.exit(1);
}

try {
  const resultado = await crearTriaje().analizar({
    titulo: 'Proyector no enciende',
    descripcion: 'El proyector del aula 101 no enciende desde esta mañana y hay clase a las 10:00 con 28 campers.',
  });
  console.log(`\nRespuesta válida en ${resultado.duracion_ms} ms (modelo ${resultado.modelo}):`);
  console.log(JSON.stringify(resultado.sugerencia, null, 2));
  console.log(`\nCumple reglas de negocio: ${resultado.validacion_reglas.cumple ? 'sí' : `no (${resultado.validacion_reglas.mensaje})`}`);
} catch (error) {
  if (error instanceof IAError) {
    console.error(`\nFallo de IA [${error.codigo}]: ${error.message}`);
    if (error.extra?.respuesta_cruda) console.error(`Respuesta recibida:\n${error.extra.respuesta_cruda}`);
    process.exit(1);
  }
  throw error;
}
