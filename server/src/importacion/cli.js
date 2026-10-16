// Uso desde consola:
//   npm run importar               -> vista previa (no escribe nada)
//   npm run importar -- --aplicar  -> importa los registros válidos

import { abrirBaseDeDatos } from '../db/conexion.js';
import { analizarDatosOficiales, DIRECTORIO_OFICIAL, importarDatosOficiales } from './importador.js';

const aplicar = process.argv.includes('--aplicar');
const { reporte } = aplicar
  ? importarDatosOficiales(abrirBaseDeDatos(), { operador: 'consola' })
  : analizarDatosOficiales();

console.log(`Directorio: ${DIRECTORIO_OFICIAL}`);
for (const archivo of reporte.archivos) {
  console.log(`\n${archivo.archivo} [${archivo.formato}${archivo.separador ? `, separador "${archivo.separador}"` : ''}]`);
  if (archivo.error) console.log(`  ERROR: ${archivo.error}`);
  for (const c of archivo.colecciones) {
    console.log(`  ${c.nombre} -> ${c.entidad ?? 'NO RECONOCIDA'} (${c.registros} registros)`);
    console.log(`    mapeo: ${JSON.stringify(c.mapeo)}`);
    if (c.columnas_no_reconocidas.length) console.log(`    columnas no reconocidas: ${c.columnas_no_reconocidas.join(', ')}`);
  }
}
console.log('\nResumen por entidad:');
for (const [entidad, r] of Object.entries(reporte.entidades)) {
  if (r.leidos) console.log(`  ${entidad}: ${r.leidos} leídos, ${r.validos} válidos, ${r.con_errores} con errores, ${r.con_advertencias} con advertencias`);
}
for (const e of reporte.errores.slice(0, 40)) console.log(`  ✗ ${e.archivo} fila ${e.fila} (${e.entidad}${e.id ? ` ${e.id}` : ''}): ${e.problemas.join(' ')}`);
for (const a of reporte.advertencias.slice(0, 20)) console.log(`  ! ${a.archivo} fila ${a.fila} (${a.entidad}): ${a.problemas.join(' ')}`);
console.log(aplicar ? '\nImportación aplicada.' : '\nVista previa: no se escribió nada. Usa --aplicar para importar.');
