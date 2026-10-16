// Punto de entrada del servidor.

import { abrirBaseDeDatos } from './db/conexion.js';
import { crearApp } from './app.js';
import { estadoPublicoIA, leerConfiguracionIA } from './ia/configuracion.js';
import { baseVacia, DIRECTORIO_OFICIAL, importarDatosOficiales, listarArchivosOficiales } from './importacion/importador.js';

const db = abrirBaseDeDatos();

// Primera ejecución: si la base está vacía y ya hay archivos oficiales, se
// importan solos. Después, reimportar es una acción explícita (pantalla "Datos").
if (baseVacia(db) && listarArchivosOficiales().length) {
  const { importado, reporte } = importarDatosOficiales(db, { operador: 'arranque' });
  if (importado) {
    console.log(`Datos oficiales importados: ${reporte.total_validos} válidos, ${reporte.total_con_errores} con errores.`);
  }
} else if (!listarArchivosOficiales().length) {
  console.log(`Aún no hay datos oficiales en ${DIRECTORIO_OFICIAL}. Cópialos ahí y usa la pantalla "Datos oficiales".`);
}

const ia = estadoPublicoIA(leerConfiguracionIA());
console.log(ia.configurada ? `IA: ${ia.proveedor} / ${ia.modelo}` : `IA no configurada: ${ia.motivo}`);

const puerto = Number(process.env.API_PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
crearApp(db).listen(puerto, host, () => console.log(`API lista en http://${host}:${puerto}`));
