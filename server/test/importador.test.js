// Pruebas del importador con archivos de PRUEBA escritos en una carpeta
// temporal. No son datos oficiales: contienen errores a propósito para
// demostrar la detección de duplicados, campos faltantes, identificadores
// inválidos, estados desconocidos, referencias rotas y reglas incumplidas.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { analizarDatosOficiales, importarDatosOficiales } from '../src/importacion/importador.js';
import { parsearCSV } from '../src/importacion/lectores.js';

describe('Importador de datos oficiales', () => {
  let carpeta;
  const espaciosCSV = [
    'Código;Nombre;Tipo;Aforo;Estado',
    'A-101;Aula 101;Aula;30;Disponible',
    'A-101;Aula 101 repetida;Aula;30;Disponible', // duplicado
    'C-01;Cubículo 1;Cubículo;4;En mantenimiento',
    ';Sin código;Aula;20;Disponible', // falta identificador
    'A 103!;Aula 103;Aula;20;Disponible', // identificador inválido
    'A-104;Aula 104;Aula;veinte;Disponible', // capacidad inválida
    'A-105;Aula 105;Aula;25;Explotada', // estado desconocido
  ].join('\n');

  const datosJSON = {
    equipos: [
      { id: 'PC-01', nombre: 'Portátil 01', tipo: 'Portátil', estado: 'Operativo', serial: 'S1' },
      { id: 'PC-02', nombre: 'Portátil 02', tipo: 'Portátil', estado: 'Dañado', serial: 'S1' }, // serial duplicado
      { id: 'PC-03', nombre: 'Portátil 03', tipo: 'Portátil', estado: 'Prestado', prestado_a: 'Ana' },
      { id: 'PRY-1', nombre: 'Proyector', tipo: 'Proyector' }, // falta estado
    ],
    reservas: [
      { espacio: 'A-101', responsable: 'P1', personas: 20, fecha: '2030-01-10', hora_inicio: '08:00', hora_fin: '10:00' },
      { espacio: 'Aula 101', responsable: 'P2', personas: 10, fecha: '2030-01-10', hora_inicio: '09:00', hora_fin: '11:00' }, // cruce
      { espacio: 'A-101', responsable: 'P3', personas: 50, fecha: '2030-01-11', hora_inicio: '08:00', hora_fin: '09:00' }, // aforo
      { espacio: 'X-999', responsable: 'P4', personas: 5, fecha: '2030-01-11', hora_inicio: '08:00', hora_fin: '09:00' }, // referencia rota
    ],
    incidencias: [
      { id: 'INC-0007', titulo: 'Wifi caído', descripcion: 'No hay internet en el piso 2', estado: 'Abierta', prioridad: 'Alta', categoria: 'Red', area: 'TI' },
      { descripcion: 'Silla rota en el cubículo 1', estado: 'Nueva', espacio: 'C-01' },
      { titulo: 'Fuga', descripcion: 'Fuga de agua en baño', estado: 'Pausada' }, // estado desconocido
    ],
  };

  before(() => {
    carpeta = mkdtempSync(join(tmpdir(), 'campus-prueba-'));
    writeFileSync(join(carpeta, 'espacios.csv'), espaciosCSV);
    writeFileSync(join(carpeta, 'campus.json'), JSON.stringify(datosJSON));
    writeFileSync(join(carpeta, 'inventario.xlsx'), 'binario');
  });
  after(() => rmSync(carpeta, { recursive: true, force: true }));

  test('detecta formato, separador y entidades', () => {
    const { reporte } = analizarDatosOficiales(carpeta, { ahora: '2030-01-10T07:00' });
    const csv = reporte.archivos.find((a) => a.archivo === 'espacios.csv');
    assert.equal(csv.formato, 'csv');
    assert.equal(csv.separador, ';');
    assert.equal(csv.colecciones[0].mapeo.capacidad, 'Aforo');
    const json = reporte.archivos.find((a) => a.archivo === 'campus.json');
    assert.deepEqual(json.colecciones.map((c) => c.entidad), ['equipos', 'reservas', 'incidencias']);
    assert.equal(reporte.archivos.find((a) => a.archivo === 'inventario.xlsx').formato, 'no_soportado');
  });

  test('cuenta válidos y errores por entidad', () => {
    const { reporte } = analizarDatosOficiales(carpeta, { ahora: '2030-01-10T07:00' });
    assert.deepEqual(
      Object.fromEntries(Object.entries(reporte.entidades).map(([e, r]) => [e, [r.leidos, r.validos, r.con_errores]])),
      { reservas: [4, 1, 3], prestamos: [0, 0, 0], incidencias: [3, 2, 1], espacios: [7, 2, 5], equipos: [4, 2, 2] },
    );
    const textos = reporte.errores.flatMap((e) => e.problemas).join(' | ');
    for (const esperado of ['duplicado "a-101"', 'Falta el identificador', 'Identificador inválido', 'Capacidad inválida', 'Estado desconocido: "Explotada"', 'Serial duplicado', 'R2 ·', 'R1 · Aforo', '"X-999" no existe']) {
      assert.ok(textos.includes(esperado), `falta el error: ${esperado}`);
    }
  });

  test('importa solo lo válido, sin tocar los archivos originales', () => {
    const antes = readFileSync(join(carpeta, 'espacios.csv'), 'utf8');
    const db = abrirBaseDeDatos(':memory:');
    const { importado } = importarDatosOficiales(db, { directorio: carpeta });
    assert.equal(importado, true);
    assert.equal(readFileSync(join(carpeta, 'espacios.csv'), 'utf8'), antes);
    assert.deepEqual(db.prepare('SELECT id FROM espacios ORDER BY id').all().map((e) => e.id), ['A-101', 'C-01']);
    // PC-03 venía "prestado": queda con préstamo activo, no disponible para prestar.
    assert.equal(db.prepare(`SELECT responsable FROM prestamos WHERE equipo_id = 'PC-03' AND estado = 'activo'`).get().responsable, 'Ana');
    // La incidencia sin código recibe uno consecutivo y queda sin clasificar.
    const sinCodigo = db.prepare(`SELECT * FROM incidencias WHERE id = 'INC-0008'`).get();
    assert.equal(sinCodigo.categoria, null);
    assert.equal(sinCodigo.espacio_id, 'C-01');
  });

  test('CSV con comillas, comas internas y saltos de línea', () => {
    const { registros } = parsearCSV('id,descripcion\n1,"Hola, ""mundo""\nsegunda línea"\n');
    assert.equal(registros[0].datos.descripcion, 'Hola, "mundo"\nsegunda línea');
  });
});
