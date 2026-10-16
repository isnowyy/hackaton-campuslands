// Módulo 1 · Gestión de espacios: consulta, registro, edición, reservas y
// asistente de asignación. Toda regla (aforo, cruces, estado) la decide el
// servidor; la interfaz muestra el resultado y el motivo del rechazo.

import { useState } from 'react';
import { api } from '../api.js';
import {
  Campo, Cargando, fechaLocal, formatearFecha, Insignia, MensajeError, Modal, useAccion, useAvisar,
  useCatalogos, useDatos, useEtiqueta, Vacio,
} from '../componentes/comunes.jsx';
import { ListaMovimientos } from './Panel.jsx';

function FormularioEspacio({ espacio, alCerrar, alGuardar }) {
  const { tipos_espacio, estados_espacio } = useCatalogos();
  const etiqueta = useEtiqueta();
  const editar = Boolean(espacio);
  const [datos, setDatos] = useState(
    espacio ?? { id: '', nombre: '', tipo: 'aula', capacidad: '', estado: 'disponible', ubicacion: '' },
  );
  const { enviando, error, ejecutar } = useAccion();
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });

  const guardar = (e) => {
    e.preventDefault();
    ejecutar(async () => {
      const cuerpo = { nombre: datos.nombre, tipo: datos.tipo, capacidad: datos.capacidad, estado: datos.estado, ubicacion: datos.ubicacion ?? '' };
      const r = editar
        ? await api(`/espacios/${encodeURIComponent(espacio.id)}`, { metodo: 'PATCH', cuerpo })
        : await api('/espacios', { metodo: 'POST', cuerpo: { ...cuerpo, id: datos.id } });
      alGuardar(r, editar ? 'Espacio actualizado' : 'Espacio registrado');
    });
  };

  return (
    <Modal titulo={editar ? `Editar ${espacio.nombre}` : 'Nuevo espacio'} alCerrar={alCerrar}
      pie={<><button className="boton" onClick={alCerrar}>Cancelar</button><button className="boton boton-primario" form="form-espacio" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button></>}>
      <form id="form-espacio" className="formulario" onSubmit={guardar}>
        <MensajeError error={error} />
        <div className="formulario-2">
          <Campo etiqueta="Código" ayuda={editar ? 'El código no se cambia.' : 'Ej.: A-101, CUB-03'}>
            <input value={datos.id} onChange={cambiar('id')} disabled={editar} required maxLength={40} />
          </Campo>
          <Campo etiqueta="Nombre"><input value={datos.nombre} onChange={cambiar('nombre')} required maxLength={120} /></Campo>
          <Campo etiqueta="Tipo">
            <select value={datos.tipo} onChange={cambiar('tipo')}>{tipos_espacio.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
          </Campo>
          <Campo etiqueta="Capacidad (personas)"><input type="number" min="1" value={datos.capacidad} onChange={cambiar('capacidad')} required /></Campo>
          <Campo etiqueta="Estado">
            <select value={datos.estado} onChange={cambiar('estado')}>{estados_espacio.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
          </Campo>
          <Campo etiqueta="Ubicación"><input value={datos.ubicacion ?? ''} onChange={cambiar('ubicacion')} maxLength={120} /></Campo>
        </div>
      </form>
    </Modal>
  );
}

export function FormularioReserva({ espacio, valores, alCerrar, alGuardar }) {
  const [datos, setDatos] = useState({
    responsable: '', motivo: '', personas: valores?.personas ?? '', inicio: valores?.inicio ?? fechaLocal(30), fin: valores?.fin ?? fechaLocal(150),
  });
  const { enviando, error, ejecutar } = useAccion();
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });
  const guardar = (e) => {
    e.preventDefault();
    ejecutar(async () => {
      const r = await api(`/espacios/${encodeURIComponent(espacio.id)}/reservas`, { metodo: 'POST', cuerpo: datos });
      alGuardar(r, `Reserva confirmada en ${espacio.nombre}`);
    });
  };
  return (
    <Modal titulo={`Reservar ${espacio.nombre}`} alCerrar={alCerrar}
      pie={<><button className="boton" onClick={alCerrar}>Cancelar</button><button className="boton boton-primario" form="form-reserva" disabled={enviando}>{enviando ? 'Validando…' : 'Reservar'}</button></>}>
      <p className="secundario" style={{ margin: 0 }}>
        Capacidad {espacio.capacidad} personas · Estado <Insignia valor={espacio.estado} />
      </p>
      <form id="form-reserva" className="formulario" onSubmit={guardar}>
        <MensajeError error={error} />
        <div className="formulario-2">
          <Campo etiqueta="Responsable"><input value={datos.responsable} onChange={cambiar('responsable')} required maxLength={120} placeholder="Persona o grupo" /></Campo>
          <Campo etiqueta="Personas"><input type="number" min="1" value={datos.personas} onChange={cambiar('personas')} required /></Campo>
          <Campo etiqueta="Inicio"><input type="datetime-local" value={datos.inicio} onChange={cambiar('inicio')} required /></Campo>
          <Campo etiqueta="Fin"><input type="datetime-local" value={datos.fin} onChange={cambiar('fin')} required /></Campo>
        </div>
        <Campo etiqueta="Motivo (opcional)"><input value={datos.motivo} onChange={cambiar('motivo')} maxLength={200} /></Campo>
      </form>
    </Modal>
  );
}

// Cancelación: pide confirmación y motivo (queda en la trazabilidad).
function CancelarReserva({ reserva, alCerrar, alGuardar }) {
  const [motivo, setMotivo] = useState('');
  const { enviando, error, ejecutar } = useAccion();
  const cancelar = () =>
    ejecutar(async () => {
      const r = await api(`/reservas/${reserva.id}/cancelar`, { metodo: 'POST', cuerpo: { motivo } });
      alGuardar(r, 'Reserva cancelada');
    });
  return (
    <Modal titulo="Cancelar reserva" alCerrar={alCerrar}
      pie={<><button className="boton" onClick={alCerrar}>Volver</button><button className="boton boton-peligro-solido" onClick={cancelar} disabled={enviando}>Cancelar reserva</button></>}>
      <p style={{ margin: 0 }}>
        ¿Cancelar la reserva de <strong>{reserva.responsable}</strong> ({formatearFecha(reserva.inicio)} a {reserva.fin.slice(11)})? Esta acción no se puede deshacer.
      </p>
      <MensajeError error={error} />
      <Campo etiqueta="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} autoFocus /></Campo>
    </Modal>
  );
}

function DetalleEspacio({ id, alCerrar, alCambiar }) {
  const { datos, error, recargar } = useDatos(() => api(`/espacios/${encodeURIComponent(id)}`), [id]);
  const [cancelando, setCancelando] = useState(null);
  const avisar = useAvisar();
  return (
    <Modal titulo={datos ? `${datos.nombre} (${datos.id})` : 'Espacio'} alCerrar={alCerrar} ancho>
      <MensajeError error={error} />
      {!datos ? <Cargando /> : (
        <>
          <dl className="definiciones">
            <dt>Tipo</dt><dd><Insignia valor={datos.tipo} tono="" /></dd>
            <dt>Capacidad</dt><dd>{datos.capacidad} personas</dd>
            <dt>Estado</dt><dd><Insignia valor={datos.estado} /></dd>
            <dt>Ahora</dt><dd><Insignia valor={datos.disponibilidad} /></dd>
            <dt>Ubicación</dt><dd>{datos.ubicacion ?? '—'}</dd>
            <dt>Origen</dt><dd>{datos.origen === 'oficial' ? 'Datos oficiales' : 'Registrado en el sistema'}</dd>
          </dl>
          <h3>Reservas</h3>
          {datos.reservas.length === 0 ? <Vacio titulo="Sin reservas" /> : (
            <div className="tabla-contenedor">
              <table>
                <thead><tr><th>Horario</th><th>Responsable</th><th>Personas</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {datos.reservas.map((r) => (
                    <tr key={r.id}>
                      <td>{formatearFecha(r.inicio)} – {r.fin.slice(11)}</td>
                      <td>{r.responsable}{r.motivo && <div className="secundario">{r.motivo}</div>}</td>
                      <td className="numero">{r.personas}</td>
                      <td>{r.estado === 'cancelada' ? <Insignia valor="cancelada" /> : r.finalizada ? <Insignia valor="finalizada" texto="Finalizada" tono="" /> : <Insignia valor="activa" />}</td>
                      <td className="acciones">
                        {r.estado === 'activa' && !r.finalizada && <button className="boton boton-pequeno boton-peligro" onClick={() => setCancelando(r)}>Cancelar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3>Historial</h3>
          <ListaMovimientos movimientos={datos.movimientos} />
        </>
      )}
      {cancelando && (
        <CancelarReserva reserva={cancelando} alCerrar={() => setCancelando(null)}
          alGuardar={(_, msg) => { setCancelando(null); avisar('exito', msg); recargar(); alCambiar(); }} />
      )}
    </Modal>
  );
}

function Asistente({ alReservar }) {
  const { tipos_espacio } = useCatalogos();
  const etiqueta = useEtiqueta();
  const [pedido, setPedido] = useState({ personas: '', inicio: fechaLocal(30), fin: fechaLocal(150), tipo: '' });
  const [resultado, setResultado] = useState(null);
  const { enviando, error, ejecutar } = useAccion();
  const cambiar = (campo) => (e) => setPedido({ ...pedido, [campo]: e.target.value });
  const buscar = (e) => {
    e.preventDefault();
    ejecutar(async () => setResultado(await api('/espacios/sugerencias', { parametros: pedido })));
  };
  return (
    <div className="tarjeta-cuerpo formulario">
      <p className="secundario" style={{ margin: 0 }}>
        Evalúa todos los espacios con las mismas reglas que una reserva real (aforo, estado y cruces de horario) y propone los compatibles, el más ajustado primero.
      </p>
      <form className="fila-flex" onSubmit={buscar}>
        <Campo etiqueta="Personas"><input type="number" min="1" value={pedido.personas} onChange={cambiar('personas')} required style={{ width: 110 }} /></Campo>
        <Campo etiqueta="Inicio"><input type="datetime-local" value={pedido.inicio} onChange={cambiar('inicio')} required /></Campo>
        <Campo etiqueta="Fin"><input type="datetime-local" value={pedido.fin} onChange={cambiar('fin')} required /></Campo>
        <Campo etiqueta="Tipo">
          <select value={pedido.tipo} onChange={cambiar('tipo')}>
            <option value="">Cualquiera</option>
            {tipos_espacio.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}
          </select>
        </Campo>
        <button className="boton boton-primario" style={{ alignSelf: 'flex-end' }} disabled={enviando}>{enviando ? 'Buscando…' : 'Buscar espacios'}</button>
      </form>
      <MensajeError error={error} />
      {resultado && (
        <div className="rejilla rejilla-2">
          <div>
            <h3>Compatibles ({resultado.compatibles.length})</h3>
            {resultado.compatibles.length === 0 ? <Vacio titulo="Ningún espacio cumple las reglas para ese horario" /> : (
              <ul className="linea-tiempo" style={{ marginTop: 8 }}>
                {resultado.compatibles.map((e) => (
                  <li key={e.id} style={{ gridTemplateColumns: '1fr auto' }}>
                    <span><strong>{e.nombre}</strong> <span className="secundario">· {etiqueta(e.tipo)} · capacidad {e.capacidad} (sobran {e.sobrantes})</span></span>
                    <button className="boton boton-pequeno boton-primario" onClick={() => alReservar(e, resultado.pedido)}>Reservar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Descartados ({resultado.descartados.length})</h3>
            <ul className="linea-tiempo" style={{ marginTop: 8 }}>
              {resultado.descartados.map((e) => (
                <li key={e.id} style={{ gridTemplateColumns: '1fr' }}>
                  <span><strong>{e.nombre}</strong> <Insignia valor="no_disponible" texto={e.nombre_regla} tono="peligro" /><div className="secundario">{e.motivo}</div></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function TablaReservas({ version, alCambiar }) {
  const [filtro, setFiltro] = useState('proximas');
  const hoy = fechaLocal(0).slice(0, 10);
  const parametros = filtro === 'hoy' ? { desde: `${hoy}T00:00`, hasta: `${hoy}T23:59`, estado: 'activa' } : filtro === 'proximas' ? { desde: fechaLocal(0), estado: 'activa' } : {};
  const { datos, cargando, error, recargar } = useDatos(() => api('/reservas', { parametros }), [filtro, version]);
  const [cancelando, setCancelando] = useState(null);
  const avisar = useAvisar();
  return (
    <>
      <div className="barra">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar reservas">
          <option value="proximas">Activas y próximas</option>
          <option value="hoy">De hoy</option>
          <option value="todas">Todas (incluye canceladas e historial)</option>
        </select>
      </div>
      <MensajeError error={error} />
      {cargando && !datos ? <Cargando /> : datos?.length === 0 ? <Vacio titulo="No hay reservas en este filtro" /> : datos && (
        <div className="tabla-contenedor">
          <table>
            <thead><tr><th>Espacio</th><th>Horario</th><th>Responsable</th><th>Personas</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {datos.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.espacio_nombre}</strong><div className="secundario">{r.espacio_id}</div></td>
                  <td>{formatearFecha(r.inicio)} – {r.fin.slice(11)}</td>
                  <td>{r.responsable}{r.motivo && <div className="secundario">{r.motivo}</div>}</td>
                  <td className="numero">{r.personas}</td>
                  <td>{r.estado === 'cancelada' ? <Insignia valor="cancelada" /> : r.en_curso ? <Insignia valor="ocupado" texto="En curso" /> : r.finalizada ? <Insignia valor="x" texto="Finalizada" tono="" /> : <Insignia valor="activa" />}</td>
                  <td className="acciones">{r.estado === 'activa' && !r.finalizada && <button className="boton boton-pequeno boton-peligro" onClick={() => setCancelando(r)}>Cancelar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cancelando && (
        <CancelarReserva reserva={cancelando} alCerrar={() => setCancelando(null)}
          alGuardar={(_, msg) => { setCancelando(null); avisar('exito', msg); recargar(); alCambiar(); }} />
      )}
    </>
  );
}

export default function Espacios() {
  const { tipos_espacio, estados_espacio } = useCatalogos();
  const etiqueta = useEtiqueta();
  const [pestana, setPestana] = useState('espacios');
  const [filtros, setFiltros] = useState({ busqueda: '', tipo: '', estado: '', disponibilidad: '' });
  const [version, setVersion] = useState(0);
  const { datos, cargando, error } = useDatos(() => api('/espacios', { parametros: filtros }), [filtros, version]);
  const [modal, setModal] = useState(null); // { tipo: 'nuevo'|'editar'|'reservar'|'detalle', espacio, valores }
  const avisar = useAvisar();
  const refrescar = () => setVersion((v) => v + 1);
  const alGuardar = (_, mensaje) => {
    setModal(null);
    avisar('exito', mensaje);
    refrescar();
  };
  const cambiarFiltro = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Gestión de espacios</h1>
          <p>Aulas y cubículos: capacidad, estado, disponibilidad y reservas.</p>
        </div>
        <button className="boton boton-primario" onClick={() => setModal({ tipo: 'nuevo' })}>+ Nuevo espacio</button>
      </div>
      <div className="tarjeta">
        <div className="pestanas" role="tablist">
          {[['espacios', 'Espacios'], ['reservas', 'Reservas'], ['asistente', 'Asistente de asignación']].map(([clave, texto]) => (
            <button key={clave} role="tab" aria-selected={pestana === clave} className={pestana === clave ? 'activo' : ''} onClick={() => setPestana(clave)}>{texto}</button>
          ))}
        </div>

        {pestana === 'reservas' && <TablaReservas version={version} alCambiar={refrescar} />}
        {pestana === 'asistente' && <Asistente alReservar={(espacio, pedido) => setModal({ tipo: 'reservar', espacio, valores: pedido })} />}
        {pestana === 'espacios' && (
          <>
            <div className="barra">
              <input className="buscar" type="search" placeholder="Buscar por código, nombre o ubicación" value={filtros.busqueda} onChange={cambiarFiltro('busqueda')} aria-label="Buscar espacios" />
              <select value={filtros.tipo} onChange={cambiarFiltro('tipo')} aria-label="Tipo"><option value="">Todos los tipos</option>{tipos_espacio.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
              <select value={filtros.estado} onChange={cambiarFiltro('estado')} aria-label="Estado"><option value="">Todos los estados</option>{estados_espacio.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
              <select value={filtros.disponibilidad} onChange={cambiarFiltro('disponibilidad')} aria-label="Disponibilidad">
                <option value="">Cualquier disponibilidad</option><option value="libre">Libre ahora</option><option value="ocupado">Ocupado ahora</option><option value="no_disponible">No disponible</option>
              </select>
            </div>
            <MensajeError error={error} />
            {cargando && !datos ? <Cargando /> : datos?.length === 0 ? (
              <Vacio titulo="No hay espacios para mostrar">Ajusta los filtros, registra un espacio o importa los datos oficiales.</Vacio>
            ) : datos && (
              <div className="tabla-contenedor">
                <table>
                  <thead><tr><th>Espacio</th><th>Tipo</th><th>Capacidad</th><th>Estado</th><th>Ahora</th><th /></tr></thead>
                  <tbody>
                    {datos.map((e) => (
                      <tr key={e.id}>
                        <td><strong>{e.nombre}</strong><div className="secundario">{e.id}{e.ubicacion ? ` · ${e.ubicacion}` : ''}</div></td>
                        <td>{etiqueta(e.tipo)}</td>
                        <td className="numero">{e.capacidad}</td>
                        <td><Insignia valor={e.estado} /></td>
                        <td>
                          <Insignia valor={e.disponibilidad} />
                          {e.reserva_actual && <div className="secundario">{e.reserva_actual.responsable} hasta {e.reserva_actual.fin.slice(11)}</div>}
                          {!e.reserva_actual && e.proxima_reserva && <div className="secundario">Próxima: {formatearFecha(e.proxima_reserva.inicio)}</div>}
                        </td>
                        <td>
                          <div className="acciones">
                            {/* No se deshabilita: si el espacio no está disponible, el servidor rechaza con R3 y se ve el motivo. */}
                            <button className="boton boton-pequeno boton-primario" onClick={() => setModal({ tipo: 'reservar', espacio: e })}>Reservar</button>
                            <button className="boton boton-pequeno" onClick={() => setModal({ tipo: 'editar', espacio: e })}>Editar</button>
                            <button className="boton boton-pequeno" onClick={() => setModal({ tipo: 'detalle', espacio: e })}>Ver</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {modal?.tipo === 'nuevo' && <FormularioEspacio alCerrar={() => setModal(null)} alGuardar={alGuardar} />}
      {modal?.tipo === 'editar' && <FormularioEspacio espacio={modal.espacio} alCerrar={() => setModal(null)} alGuardar={alGuardar} />}
      {modal?.tipo === 'reservar' && <FormularioReserva espacio={modal.espacio} valores={modal.valores} alCerrar={() => setModal(null)} alGuardar={alGuardar} />}
      {modal?.tipo === 'detalle' && <DetalleEspacio id={modal.espacio.id} alCerrar={() => setModal(null)} alCambiar={refrescar} />}
    </>
  );
}
