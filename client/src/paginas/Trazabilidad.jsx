// Trazabilidad: todas las operaciones y los intentos rechazados por una regla.

import { useState } from 'react';
import { api } from '../api.js';
import { Cargando, formatearFecha, Insignia, MensajeError, useDatos, useEtiqueta, Vacio } from '../componentes/comunes.jsx';

const ENTIDADES = ['espacio', 'reserva', 'equipo', 'incidencia', 'importacion'];

function resumirDetalle(detalle) {
  if (!detalle) return '';
  if (detalle.mensaje) return `${detalle.regla ? `${detalle.regla}: ` : ''}${detalle.mensaje}`;
  return Object.entries(detalle)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .concat(
      Object.entries(detalle)
        .filter(([, v]) => v && typeof v === 'object' && 'antes' in v)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.antes ?? '—'} → ${v.despues ?? '—'}`),
    )
    .join(' · ');
}

export default function Trazabilidad() {
  const etiqueta = useEtiqueta();
  const [filtros, setFiltros] = useState({ entidad: '', accion: '', limite: 200 });
  const { datos, cargando, error } = useDatos(() => api('/movimientos', { parametros: filtros }), [filtros]);
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Trazabilidad</h1>
          <p>Registro inmutable de cada operación, quién la hizo y los intentos rechazados por reglas de negocio.</p>
        </div>
      </div>
      <div className="tarjeta">
        <div className="barra">
          <select value={filtros.entidad} onChange={(e) => setFiltros({ ...filtros, entidad: e.target.value })} aria-label="Entidad">
            <option value="">Todas las entidades</option>
            {ENTIDADES.map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
          </select>
          <select value={filtros.accion} onChange={(e) => setFiltros({ ...filtros, accion: e.target.value })} aria-label="Acción">
            <option value="">Todas las acciones</option>
            <option value="operacion_rechazada">Solo rechazadas por reglas</option>
            <option value="prestado">Préstamos</option>
            <option value="devuelto">Devoluciones</option>
            <option value="creada">Reservas creadas</option>
            <option value="cancelada">Reservas canceladas</option>
            <option value="cambio_estado">Cambios de estado</option>
            <option value="ia_sugerencia">Sugerencias de IA</option>
            <option value="ia_fallo">Fallos de IA</option>
            <option value="clasificada">Clasificaciones</option>
          </select>
        </div>
        <MensajeError error={error} />
        {cargando && !datos ? <Cargando /> : datos?.length === 0 ? <Vacio titulo="Sin movimientos para este filtro" /> : datos && (
          <div className="tabla-contenedor">
            <table>
              <thead><tr><th>Fecha</th><th>Entidad</th><th>Acción</th><th>Detalle</th><th>Operador</th></tr></thead>
              <tbody>
                {datos.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatearFecha(m.fecha)}</td>
                    <td>{etiqueta(m.entidad)}<div className="secundario">{m.entidad_id}</div></td>
                    <td><Insignia valor={m.accion} texto={m.accion.replace(/_/g, ' ')} tono={m.accion === 'operacion_rechazada' || m.accion === 'ia_fallo' ? 'peligro' : m.accion.startsWith('ia') ? 'ia' : 'primario'} /></td>
                    <td className="secundario">{resumirDetalle(m.detalle)}</td>
                    <td>{m.operador}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
