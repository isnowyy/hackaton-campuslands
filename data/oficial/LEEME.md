# Datos oficiales de Campuslands

Copia aquí los archivos que entregue la organización (CSV, TSV, JSON o una
base SQLite). La aplicación solo los **lee**: nunca los modifica ni sobrescribe.

- La pantalla **Datos oficiales** muestra la vista previa: formato detectado,
  columnas reconocidas, registros válidos y registros con errores.
- **Importar** guarda los registros válidos en `data/campus.db`.
- Desde consola: `npm run importar` (vista previa) o `npm run importar -- --aplicar`.

Si una columna no se reconoce, agrega su nombre como alias en
`server/src/importacion/esquemas.js`.
