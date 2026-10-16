// Panel principal: indicadores de los tres módulos, estado de la IA y de los datos.

import { api } from '../api.js';
import { Cargando, formatearFecha, MensajeError, useDatos, useEtiqueta, Vacio } from '../componentes/comunes.jsx';

function Kpi({ etiqueta, valor, total, detalle, acento, enlace }) {
  const contenido = (
    <div className={`tarjeta kpi kpi-acento-${acento}`}>
      <span className="kpi-etiqueta">{etiqueta}</span>
      <span className="kpi-valor">
        {valor}
        {total !== undefined && <small> / {total}</small>}
      </span>
      {detalle && <span className="kpi-detalle">{detalle}</span>}
    </div>
  );
  return enlace ? <a href={enlace} style={{ textDecoration: 'none', color: 'inherit' }}>{contenido}</a> : contenido;
}

export function ListaMovimientos({ movimientos }) {
  const etiqueta = useEtiqueta();
  if (!movimientos?.length) return <Vacio titulo="Sin movimientos todavía">Cada operación quedará registrada aquí.</Vacio>;
  return (
    <ul className="linea-tiempo">
      {movimientos.map((m) => (
        <li key={m.id}>
          <span className="secundario">{formatearFecha(m.fecha)}</span>
          <span>
            <strong>{m.accion.replace(/_/g, ' ')}</strong> · {etiqueta(m.entidad)} <code>{m.entidad_id}</code>{' '}
            <span className="secundario">por {m.operador}</span>
            {m.detalle?.mensaje && <div className="secundario">{m.detalle.regla}: {m.detalle.mensaje}</div>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Panel() {
  const { datos, cargando, error, recargar } = useDatos(() => api('/panel'), []);

  if (error) return <MensajeError error={error} />;
  if (cargando && !datos) return <Cargando />;
  const { espacios, equipos, incidencias, ia, ultima_importacion: importacion, movimientos } = datos;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Panel operativo</h1>
          <p>Estado del campus en este momento.</p>
        </div>
        <button className="boton" onClick={recargar} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</button>
      </div>

      {!importacion && (
        <div className="aviso aviso-advertencia" style={{ marginBottom: 14 }}>
          <div>
            <strong>Aún no se han cargado los datos oficiales de Campuslands.</strong>
            <p>Copia los archivos entregados en <code>data/oficial/</code> y revísalos en <a href="#/datos">Datos oficiales</a>.</p>
          </div>
        </div>
      )}

      <div className="rejilla rejilla-kpi">
        <Kpi etiqueta="Espacios libres ahora" valor={espacios.libres} total={espacios.total} acento="exito" enlace="#/espacios"
          detalle={<><span>{espacios.ocupados} ocupados</span><span>{espacios.no_disponibles} no disponibles</span></>} />
        <Kpi etiqueta="Reservas para hoy" valor={espacios.reservas_hoy} acento="primario" enlace="#/espacios" />
        <Kpi etiqueta="Equipos prestados" valor={equipos.prestados} total={equipos.total} acento="primario" enlace="#/equipos"
          detalle={<><span>{equipos.disponibles} disponibles</span>{equipos.vencidos > 0 && <span style={{ color: 'var(--peligro)' }}>{equipos.vencidos} vencidos</span>}</>} />
        <Kpi etiqueta="Equipos dañados" valor={equipos.danados} acento={equipos.danados ? 'peligro' : 'exito'} enlace="#/equipos" />
        <Kpi etiqueta="Incidencias pendientes" valor={incidencias.pendientes} acento={incidencias.criticas_o_altas ? 'peligro' : 'aviso'} enlace="#/incidencias"
          detalle={<><span>{incidencias.criticas_o_altas} críticas o altas</span><span>{incidencias.sin_clasificar} sin clasificar</span></>} />
        <Kpi etiqueta="Sugerencias de IA por revisar" valor={incidencias.sugerencias_por_revisar} acento="primario" enlace="#/incidencias" />
      </div>

      <div className="rejilla rejilla-2 seccion">
        <div className="tarjeta">
          <div className="tarjeta-titulo"><h2>Servicios</h2></div>
          <div className="tarjeta-cuerpo formulario">
            <div className={`aviso ${ia.configurada ? 'aviso-exito' : 'aviso-advertencia'}`}>
              <div>
                <strong>{ia.configurada ? 'IA de triaje activa' : 'IA no disponible: clasificación manual'}</strong>
                <p>{ia.configurada ? `${ia.proveedor} · ${ia.modelo}` : ia.motivo}</p>
              </div>
            </div>
            <div className={`aviso ${importacion ? 'aviso-info' : 'aviso-advertencia'}`}>
              <div>
                <strong>Datos oficiales</strong>
                <p>
                  {importacion
                    ? `Importados el ${formatearFecha(importacion.fecha)}: ${importacion.total_validos} registros válidos, ${importacion.total_con_errores} con errores.`
                    : 'Pendientes de cargar.'}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>Últimos movimientos</h2>
            <a href="#/trazabilidad" className="secundario">Ver todo</a>
          </div>
          <div className="tarjeta-cuerpo"><ListaMovimientos movimientos={movimientos} /></div>
        </div>
      </div>
    </>
  );
}
