// Lectura de los archivos oficiales. Detecta el formato real por extensión y
// contenido (CSV/TSV con separador autodetectado, JSON, base SQLite) y
// devuelve los registros crudos agrupados por "colección" (nombre del
// archivo, clave del JSON o tabla). Solo LEE: abre los archivos en modo
// lectura y nunca los modifica.

import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

export const EXTENSIONES_SOPORTADAS = ['.csv', '.tsv', '.txt', '.json', '.db', '.sqlite', '.sqlite3'];

// UTF-8 estricto; si falla (archivos exportados desde Excel en Windows), latin1.
function decodificar(buffer) {
  try {
    return { texto: new TextDecoder('utf-8', { fatal: true }).decode(buffer), codificacion: 'utf-8' };
  } catch {
    return { texto: new TextDecoder('latin1').decode(buffer), codificacion: 'latin1' };
  }
}

function detectarSeparador(primeraLinea) {
  const candidatos = [',', ';', '\t', '|'];
  let mejor = ',';
  let maximo = -1;
  for (const c of candidatos) {
    let cuenta = 0;
    let enComillas = false;
    for (const ch of primeraLinea) {
      if (ch === '"') enComillas = !enComillas;
      else if (ch === c && !enComillas) cuenta++;
    }
    if (cuenta > maximo) {
      maximo = cuenta;
      mejor = c;
    }
  }
  return mejor;
}

// Parser CSV (RFC 4180): comillas, comillas escapadas ("") y saltos de línea
// dentro de campos entre comillas.
export function parsearCSV(texto) {
  const contenido = texto.replace(/^﻿/, '');
  const separador = detectarSeparador(contenido.split(/\r?\n/, 1)[0] ?? '');
  const filas = [];
  let fila = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < contenido.length; i++) {
    const ch = contenido[i];
    if (enComillas) {
      if (ch === '"' && contenido[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') enComillas = false;
      else campo += ch;
    } else if (ch === '"' && campo === '') enComillas = true;
    else if (ch === separador) {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && contenido[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  const [encabezados = [], ...datos] = filas;
  const columnas = encabezados.map((c) => c.trim());
  const registros = [];
  datos.forEach((valores, indice) => {
    if (valores.every((v) => v.trim() === '')) return; // líneas vacías
    const registro = {};
    columnas.forEach((col, j) => {
      registro[col] = valores[j] ?? '';
    });
    // fila 1 = encabezados, así que el primer dato es la fila 2 del archivo.
    registros.push({ fila: indice + 2, datos: registro, columnasDeMas: valores.length > columnas.length });
  });
  return { separador, columnas, registros };
}

function esObjetoPlano(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

// JSON: un arreglo de registros, o un objeto cuyas claves contienen arreglos
// (p. ej. { "espacios": [...], "equipos": [...] }), con un nivel de anidación.
function coleccionesJSON(valor, nombreBase, ruta = []) {
  if (Array.isArray(valor)) {
    return [{ coleccion: ruta.length ? ruta[ruta.length - 1] : nombreBase, ruta: ruta.join('.') || '(raíz)', elementos: valor }];
  }
  if (esObjetoPlano(valor) && ruta.length < 2) {
    return Object.entries(valor).flatMap(([clave, sub]) => coleccionesJSON(sub, nombreBase, [...ruta, clave]));
  }
  return [];
}

export function leerArchivo(ruta) {
  const nombre = basename(ruta);
  const extension = extname(nombre).toLowerCase();
  const buffer = readFileSync(ruta);
  const huella = createHash('sha256').update(buffer).digest('hex');
  const base = { archivo: nombre, extension, bytes: buffer.length, sha256: huella };

  if (!EXTENSIONES_SOPORTADAS.includes(extension)) {
    return { ...base, formato: 'no_soportado', error: `Formato "${extension || 'sin extensión'}" no soportado. Exporta el archivo a CSV o JSON.`, colecciones: [] };
  }

  if (['.db', '.sqlite', '.sqlite3'].includes(extension)) {
    const db = new DatabaseSync(ruta, { readOnly: true });
    try {
      const tablas = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
        .all()
        .map((t) => t.name);
      const colecciones = tablas.map((tabla) => {
        const filas = db.prepare(`SELECT * FROM "${tabla.replace(/"/g, '""')}"`).all();
        return {
          coleccion: tabla,
          ruta: `tabla ${tabla}`,
          columnas: filas.length ? Object.keys(filas[0]) : [],
          registros: filas.map((f, i) => ({ fila: i + 1, datos: { ...f } })),
        };
      });
      return { ...base, formato: 'sqlite', colecciones };
    } finally {
      db.close();
    }
  }

  const { texto, codificacion } = decodificar(buffer);

  if (extension === '.json') {
    let valor;
    try {
      valor = JSON.parse(texto.replace(/^﻿/, ''));
    } catch (error) {
      return { ...base, formato: 'json', codificacion, error: `JSON inválido: ${error.message}`, colecciones: [] };
    }
    const nombreBase = basename(nombre, extension);
    const colecciones = coleccionesJSON(valor, nombreBase).map(({ coleccion, ruta: rutaJSON, elementos }) => {
      const columnas = [...new Set(elementos.filter(esObjetoPlano).flatMap((e) => Object.keys(e)))];
      return {
        coleccion,
        ruta: rutaJSON,
        columnas,
        registros: elementos.map((e, i) => ({ fila: i + 1, datos: e, noEsObjeto: !esObjetoPlano(e) })),
      };
    });
    return { ...base, formato: 'json', codificacion, colecciones };
  }

  const { separador, columnas, registros } = parsearCSV(texto);
  return {
    ...base,
    formato: 'csv',
    codificacion,
    separador: separador === '\t' ? 'tabulador' : separador,
    colecciones: [{ coleccion: basename(nombre, extension), ruta: nombre, columnas, registros }],
  };
}
