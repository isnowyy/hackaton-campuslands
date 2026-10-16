// Datos oficiales de Campuslands: vista previa del análisis (sin escribir),
// mapeo de columnas, conteos de válidos y errores, e importación confirmada.

import { useState } from 'react';
import { api } from '../api.js';
import { Cargando, formatearFecha, Insignia, MensajeError, useAccion, useAvisar, useConfirmar, useDatos, Vacio } from '../componentes/comunes.jsx';

function TablaProblemas({ titulo, lista, tono }) {
  const [filtro, setFiltro] = useState('');
  if (!lista.length) return null;
  const visibles = lista.filter((p) => !filtro || p.entidad === filtro);
  const entidades = [...new Set(lista.map((p) => p.entidad))];
  return (
    <div className="tarjeta seccion">
      <div className="tarjeta-titulo">
        <h2>{titulo} ({lista.length})</h2>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 'auto' }} aria-label="Filtrar por entidad">
          <option value="">Todas las entidades</option>
          {entidades.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <div className="tabla-contenedor">
        <table>
          <thead><tr><th>Archivo</th><th>Fila</th><th>Entidad</th><th>Registro</th><th>Problema</th></tr></thead>
          <tbody>
            {visibles.slice(0, 300).map((p, i) => (
              <tr key={i}>
                <td>{p.archivo}{p.coleccion !== p.archivo && <div className="secundario">{p.coleccion}</div>}</td>
                <td className="numero">{p.fila}</td>
                <td><Insignia valor={p.entidad} texto={p.entidad} tono={tono} /></td>
                <td>{p.id ?? '—'}</td>
                <td>{p.problemas.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DatosOficiales() {
  const { datos, cargando, error, recargar } = useDatos(() => api('/importacion'), []);
  const { enviando, error: errorImportar, ejecutar } = useAccion();
  const confirmar = useConfirmar();
  const avisar = useAvisar();

  const importar = async () => {
    const ok = await confirmar({
      titulo: 'Importar datos oficiales',
      mensaje:
        'Se reemplazarán los espacios, equipos, reservas, préstamos e incidencias actuales por los registros válidos de los archivos oficiales. Los archivos originales no se modifican y la trazabilidad se conserva. ¿Continuar?',
      confirmar: 'Importar y reemplazar',
      peligro: true,
    });
    if (!ok) return;
    const r = await ejecutar(() => api('/importacion', { metodo: 'POST', cuerpo: { confirmar: true } }));
    if (r?.importado) {
      avisar('exito', 'Datos oficiales importados', `${r.reporte.total_validos} válidos · ${r.reporte.total_con_errores} con errores`);
      recargar();
    } else if (r) avisar('error', 'No se importó nada', r.motivo);
  };

  if (error) return <MensajeError error={error} />;
  if (cargando && !datos) return <Cargando texto="Analizando archivos oficiales…" />;
  const { vista_previa: reporte, ultima, directorio } = datos;
  const sinArchivos = reporte.archivos.length === 0;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Datos oficiales</h1>
          <p>Lectura, validación y normalización de los archivos entregados por Campuslands.</p>
        </div>
        <div className="fila-flex">
          <button className="boton" onClick={recargar} disabled={cargando}>Volver a analizar</button>
          <button className="boton boton-primario" onClick={importar} disabled={enviando || sinArchivos}>{enviando ? 'Importando…' : ultima ? 'Reimportar' : 'Importar'}</button>
        </div>
      </div>
      <MensajeError error={errorImportar} />

      <div className="aviso aviso-info" style={{ marginBottom: 14 }}>
        <div>
          <strong>Carpeta de origen (solo lectura)</strong>
          <p><code>{directorio}</code> · Formatos: {reporte.extensiones_soportadas.join(', ')}. Esta vista previa no escribe nada.</p>
          {ultima && <p>Última importación: {formatearFecha(ultima.fecha)} ({ultima.reporte.total_validos} válidos, {ultima.reporte.total_con_errores} con errores).</p>}
        </div>
      </div>

      {sinArchivos ? (
        <div className="tarjeta">
          <Vacio titulo="Todavía no hay archivos oficiales">
            Copia los archivos entregados por Campuslands en la carpeta indicada y pulsa «Volver a analizar». No se usan datos inventados.
          </Vacio>
        </div>
      ) : (
        <>
          <div className="rejilla rejilla-kpi">
            <div className="tarjeta kpi kpi-acento-primario"><span className="kpi-etiqueta">Registros leídos</span><span className="kpi-valor">{reporte.total_leidos}</span></div>
            <div className="tarjeta kpi kpi-acento-exito"><span className="kpi-etiqueta">Válidos</span><span className="kpi-valor">{reporte.total_validos}</span></div>
            <div className="tarjeta kpi kpi-acento-peligro"><span className="kpi-etiqueta">Con errores (no se importan)</span><span className="kpi-valor">{reporte.total_con_errores}</span></div>
            <div className="tarjeta kpi kpi-acento-aviso"><span className="kpi-etiqueta">Con advertencias</span><span className="kpi-valor">{reporte.advertencias.length}</span></div>
          </div>

          <div className="tarjeta seccion">
            <div className="tarjeta-titulo"><h2>Por entidad</h2></div>
            <div className="tabla-contenedor">
              <table>
                <thead><tr><th>Entidad</th><th>Leídos</th><th>Válidos</th><th>Con errores</th><th>Con advertencias</th></tr></thead>
                <tbody>
                  {Object.entries(reporte.entidades).map(([clave, e]) => (
                    <tr key={clave}>
                      <td><strong>{e.etiqueta}</strong></td>
                      <td className="numero">{e.leidos}</td>
                      <td className="numero">{e.validos}</td>
                      <td className="numero">{e.con_errores ? <Insignia valor="x" texto={e.con_errores} tono="peligro" /> : 0}</td>
                      <td className="numero">{e.con_advertencias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tarjeta seccion">
            <div className="tarjeta-titulo"><h2>Archivos y columnas detectadas</h2></div>
            <div className="tarjeta-cuerpo formulario">
              {reporte.archivos.map((a) => (
                <div key={a.archivo} className="formulario">
                  <div className="fila-flex">
                    <strong>{a.archivo}</strong>
                    <Insignia valor="x" texto={a.formato} tono={a.formato === 'no_soportado' ? 'peligro' : 'primario'} />
                    {a.separador && <span className="secundario">separador «{a.separador}»</span>}
                    {a.codificacion && <span className="secundario">{a.codificacion}</span>}
                    {a.sha256 && <span className="secundario" title={a.sha256}>SHA-256 {a.sha256.slice(0, 12)}…</span>}
                  </div>
                  {a.error && <div className="aviso aviso-error"><div><strong>No se pudo leer</strong><p>{a.error}</p></div></div>}
                  {a.colecciones.map((c) => (
                    <div key={c.nombre} className="secundario">
                      <strong style={{ color: 'var(--texto)' }}>{c.nombre}</strong> → {c.entidad ?? <Insignia valor="x" texto="entidad no reconocida" tono="peligro" />} · {c.registros} registros
                      <div>Mapeo: {Object.entries(c.mapeo).map(([campo, col]) => `${campo} ← "${col}"`).join(', ') || '—'}</div>
                      {c.columnas_no_reconocidas.length > 0 && <div>Columnas no reconocidas (se ignoran): {c.columnas_no_reconocidas.join(', ')}</div>}
                      {c.aviso && <div style={{ color: 'var(--peligro)' }}>{c.aviso}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <TablaProblemas titulo="Registros con errores" lista={reporte.errores} tono="peligro" />
          <TablaProblemas titulo="Advertencias (se importan)" lista={reporte.advertencias} tono="aviso" />
        </>
      )}
    </>
  );
}
