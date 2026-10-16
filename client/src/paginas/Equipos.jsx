// Módulo 2 · Recursos tecnológicos: inventario, préstamos, devoluciones e historial.

import { useState } from 'react';
import { api } from '../api.js';
import {
  Campo, Cargando, fechaLocal, formatearFecha, Insignia, MensajeError, Modal, useAccion, useAvisar,
  useCatalogos, useDatos, useEtiqueta, Vacio,
} from '../componentes/comunes.jsx';
import { ListaMovimientos } from './Panel.jsx';

function FormularioEquipo({ equipo, alCerrar, alGuardar }) {
  const { estados_equipo } = useCatalogos();
  const etiqueta = useEtiqueta();
  const editar = Boolean(equipo);
  const [datos, setDatos] = useState(equipo ?? { id: '', nombre: '', tipo: '', marca: '', serial: '', estado: 'operativo', ubicacion: '' });
  const { enviando, error, ejecutar } = useAccion();
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });
  const guardar = (e) => {
    e.preventDefault();
    ejecutar(async () => {
      const cuerpo = { nombre: datos.nombre, tipo: datos.tipo, marca: datos.marca ?? '', serial: datos.serial ?? '', estado: datos.estado, ubicacion: datos.ubicacion ?? '' };
      const r = editar
        ? await api(`/equipos/${encodeURIComponent(equipo.id)}`, { metodo: 'PATCH', cuerpo })
        : await api('/equipos', { metodo: 'POST', cuerpo: { ...cuerpo, id: datos.id } });
      alGuardar(r, editar ? 'Equipo actualizado' : 'Equipo registrado');
    });
  };
  return (
    <Modal titulo={editar ? `Editar ${equipo.nombre}` : 'Nuevo equipo'} alCerrar={alCerrar}
      pie={<><button className="boton" onClick={alCerrar}>Cancelar</button><button className="boton boton-primario" form="form-equipo" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button></>}>
      <form id="form-equipo" className="formulario" onSubmit={guardar}>
        <MensajeError error={error} />
        <div className="formulario-2">
          <Campo etiqueta="Código" ayuda={editar ? 'El código no se cambia.' : 'Ej.: PC-014, PRY-02'}><input value={datos.id} onChange={cambiar('id')} disabled={editar} required maxLength={40} /></Campo>
          <Campo etiqueta="Nombre"><input value={datos.nombre} onChange={cambiar('nombre')} required maxLength={120} /></Campo>
          <Campo etiqueta="Tipo"><input value={datos.tipo} onChange={cambiar('tipo')} required maxLength={60} placeholder="portátil, proyector, cámara…" /></Campo>
          <Campo etiqueta="Estado operativo" ayuda={equipo?.disponibilidad === 'prestado' ? 'Prestado: registra la devolución para cambiar su estado (R5).' : undefined}>
            <select value={datos.estado} onChange={cambiar('estado')}>{estados_equipo.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
          </Campo>
          <Campo etiqueta="Marca"><input value={datos.marca ?? ''} onChange={cambiar('marca')} maxLength={60} /></Campo>
          <Campo etiqueta="Serial"><input value={datos.serial ?? ''} onChange={cambiar('serial')} maxLength={80} /></Campo>
        </div>
        <Campo etiqueta="Ubicación"><input value={datos.ubicacion ?? ''} onChange={cambiar('ubicacion')} maxLength={120} /></Campo>
      </form>
    </Modal>
  );
}

function Prestar({ equipo, alCerrar, alGuardar }) {
  const [datos, setDatos] = useState({ responsable: '', documento: '', devolucion_prevista: fechaLocal(240), observaciones: '' });
  const { enviando, error, ejecutar } = useAccion();
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });
  const guardar = (e) => {
    e.preventDefault();
    ejecutar(async () => alGuardar(await api(`/equipos/${encodeURIComponent(equipo.id)}/prestamos`, { metodo: 'POST', cuerpo: datos }), `${equipo.nombre} prestado`));
  };
  return (
    <Modal titulo={`Prestar ${equipo.nombre}`} alCerrar={alCerrar}
      pie={<><button className="boton" onClick={alCerrar}>Cancelar</button><button className="boton boton-primario" form="form-prestamo" disabled={enviando}>{enviando ? 'Validando…' : 'Registrar préstamo'}</button></>}>
      <p className="secundario" style={{ margin: 0 }}>Estado: <Insignia valor={equipo.estado} /> · <Insignia valor={equipo.disponibilidad} /></p>
      <form id="form-prestamo" className="formulario" onSubmit={guardar}>
        <MensajeError error={error} />
        <div className="formulario-2">
          <Campo etiqueta="Quién recibe"><input value={datos.responsable} onChange={cambiar('responsable')} required maxLength={120} /></Campo>
          <Campo etiqueta="Documento (opcional)"><input value={datos.documento} onChange={cambiar('documento')} maxLength={30} /></Campo>
        </div>
        <Campo etiqueta="Devolución prevista"><input type="datetime-local" value={datos.devolucion_prevista} onChange={cambiar('devolucion_prevista')} required /></Campo>
        <Campo etiqueta="Observaciones (opcional)"><input value={datos.observaciones} onChange={cambiar('observaciones')} maxLength={300} /></Campo>
      </form>
    </Modal>
  );
}

function Devolver({ equipo, alCerrar, alGuardar }) {
  const [datos, setDatos] = useState({ estado_al_devolver: 'operativo', observaciones: '' });
  const { enviando, error, ejecutar } = useAccion();
  const p = equipo.prestamo_activo;
  const guardar = () => ejecutar(async () => alGuardar(await api(`/equipos/${encodeURIComponent(equipo.id)}/devolucion`, { metodo: 'POST', cuerpo: datos }), `${equipo.nombre} devuelto`));
  return (
    <Modal titulo={`Registrar devolución de ${equipo.nombre}`} alCerrar={alCerrar}
      pie={<><button className="boton" onClick={alCerrar}>Cancelar</button><button className="boton boton-primario" onClick={guardar} disabled={enviando}>Confirmar devolución</button></>}>
      {p && <p style={{ margin: 0 }}>Prestado a <strong>{p.responsable}</strong> desde {formatearFecha(p.fecha_prestamo)}{p.vencido && <> · <Insignia valor="vencido" texto="Vencido" /></>}</p>}
      <MensajeError error={error} />
      <Campo etiqueta="¿En qué estado vuelve?">
        <select value={datos.estado_al_devolver} onChange={(e) => setDatos({ ...datos, estado_al_devolver: e.target.value })}>
          <option value="operativo">Operativo</option>
          <option value="danado">Dañado (queda bloqueado para préstamos)</option>
        </select>
      </Campo>
      <Campo etiqueta={datos.estado_al_devolver === 'danado' ? 'Describe el daño' : 'Observaciones (opcional)'}>
        <textarea value={datos.observaciones} onChange={(e) => setDatos({ ...datos, observaciones: e.target.value })} maxLength={300} />
      </Campo>
    </Modal>
  );
}

function DetalleEquipo({ id, alCerrar }) {
  const { datos, error } = useDatos(() => api(`/equipos/${encodeURIComponent(id)}`), [id]);
  return (
    <Modal titulo={datos ? `${datos.nombre} (${datos.id})` : 'Equipo'} alCerrar={alCerrar} ancho>
      <MensajeError error={error} />
      {!datos ? <Cargando /> : (
        <>
          <dl className="definiciones">
            <dt>Tipo</dt><dd>{datos.tipo}</dd>
            <dt>Marca / serial</dt><dd>{datos.marca ?? '—'} / {datos.serial ?? '—'}</dd>
            <dt>Estado</dt><dd><Insignia valor={datos.estado} /></dd>
            <dt>Disponibilidad</dt><dd><Insignia valor={datos.disponibilidad} /></dd>
            <dt>Origen</dt><dd>{datos.origen === 'oficial' ? 'Datos oficiales' : 'Registrado en el sistema'}</dd>
          </dl>
          <h3>Préstamos</h3>
          {datos.prestamos.length === 0 ? <Vacio titulo="Nunca se ha prestado" /> : (
            <div className="tabla-contenedor">
              <table>
                <thead><tr><th>#</th><th>Responsable</th><th>Salida</th><th>Prevista</th><th>Devuelto</th><th>Estado</th></tr></thead>
                <tbody>
                  {datos.prestamos.map((p) => (
                    <tr key={p.id}>
                      <td className="numero">{p.id}</td>
                      <td>{p.responsable}{p.observaciones && <div className="secundario">{p.observaciones}</div>}</td>
                      <td>{formatearFecha(p.fecha_prestamo)}</td>
                      <td>{formatearFecha(p.devolucion_prevista)}</td>
                      <td>{formatearFecha(p.fecha_devolucion)}{p.estado_al_devolver && <div><Insignia valor={p.estado_al_devolver} /></div>}</td>
                      <td><Insignia valor={p.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3>Trazabilidad</h3>
          <ListaMovimientos movimientos={datos.movimientos} />
        </>
      )}
    </Modal>
  );
}

function TablaPrestamos({ version }) {
  const [estado, setEstado] = useState('activo');
  const { datos, cargando, error } = useDatos(() => api('/prestamos', { parametros: { estado } }), [estado, version]);
  return (
    <>
      <div className="barra">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado del préstamo">
          <option value="activo">Activos</option><option value="devuelto">Devueltos</option><option value="">Todos</option>
        </select>
      </div>
      <MensajeError error={error} />
      {cargando && !datos ? <Cargando /> : datos?.length === 0 ? <Vacio titulo="No hay préstamos en este filtro" /> : datos && (
        <div className="tabla-contenedor">
          <table>
            <thead><tr><th>Equipo</th><th>Responsable</th><th>Salida</th><th>Prevista</th><th>Estado</th></tr></thead>
            <tbody>
              {datos.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.equipo_nombre}</strong><div className="secundario">{p.equipo_id}</div></td>
                  <td>{p.responsable}{p.documento && <div className="secundario">{p.documento}</div>}</td>
                  <td>{formatearFecha(p.fecha_prestamo)}</td>
                  <td>{formatearFecha(p.devolucion_prevista)}</td>
                  <td>{p.vencido ? <Insignia valor="vencido" texto="Vencido" /> : <Insignia valor={p.estado} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Equipos() {
  const { estados_equipo } = useCatalogos();
  const etiqueta = useEtiqueta();
  const [pestana, setPestana] = useState('equipos');
  const [filtros, setFiltros] = useState({ busqueda: '', estado: '', disponibilidad: '' });
  const [version, setVersion] = useState(0);
  const { datos, cargando, error } = useDatos(() => api('/equipos', { parametros: filtros }), [filtros, version]);
  const [modal, setModal] = useState(null);
  const avisar = useAvisar();
  const alGuardar = (_, mensaje) => {
    setModal(null);
    avisar('exito', mensaje);
    setVersion((v) => v + 1);
  };
  const cambiarFiltro = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Recursos tecnológicos</h1>
          <p>Inventario, estado operativo, préstamos y devoluciones con trazabilidad.</p>
        </div>
        <button className="boton boton-primario" onClick={() => setModal({ tipo: 'nuevo' })}>+ Nuevo equipo</button>
      </div>
      <div className="tarjeta">
        <div className="pestanas" role="tablist">
          {[['equipos', 'Equipos'], ['prestamos', 'Préstamos']].map(([clave, texto]) => (
            <button key={clave} role="tab" aria-selected={pestana === clave} className={pestana === clave ? 'activo' : ''} onClick={() => setPestana(clave)}>{texto}</button>
          ))}
        </div>
        {pestana === 'prestamos' ? <TablaPrestamos version={version} /> : (
          <>
            <div className="barra">
              <input className="buscar" type="search" placeholder="Buscar por código, nombre, serial o responsable" value={filtros.busqueda} onChange={cambiarFiltro('busqueda')} aria-label="Buscar equipos" />
              <select value={filtros.estado} onChange={cambiarFiltro('estado')} aria-label="Estado"><option value="">Todos los estados</option>{estados_equipo.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
              <select value={filtros.disponibilidad} onChange={cambiarFiltro('disponibilidad')} aria-label="Disponibilidad">
                <option value="">Cualquier disponibilidad</option><option value="disponible">Disponible</option><option value="prestado">Prestado</option><option value="no_disponible">No disponible</option>
              </select>
            </div>
            <MensajeError error={error} />
            {cargando && !datos ? <Cargando /> : datos?.length === 0 ? (
              <Vacio titulo="No hay equipos para mostrar">Ajusta los filtros, registra un equipo o importa los datos oficiales.</Vacio>
            ) : datos && (
              <div className="tabla-contenedor">
                <table>
                  <thead><tr><th>Equipo</th><th>Tipo</th><th>Estado</th><th>Disponibilidad</th><th /></tr></thead>
                  <tbody>
                    {datos.map((e) => (
                      <tr key={e.id}>
                        <td><strong>{e.nombre}</strong><div className="secundario">{e.id}{e.serial ? ` · S/N ${e.serial}` : ''}</div></td>
                        <td>{e.tipo}</td>
                        <td><Insignia valor={e.estado} /></td>
                        <td>
                          {e.prestamo_activo?.vencido ? <Insignia valor="vencido" texto="Préstamo vencido" /> : <Insignia valor={e.disponibilidad} />}
                          {e.prestamo_activo && <div className="secundario">{e.prestamo_activo.responsable} · hasta {formatearFecha(e.prestamo_activo.devolucion_prevista)}</div>}
                        </td>
                        <td>
                          <div className="acciones">
                            {e.prestamo_activo
                              ? <button className="boton boton-pequeno boton-primario" onClick={() => setModal({ tipo: 'devolver', equipo: e })}>Devolver</button>
                              : <button className="boton boton-pequeno boton-primario" onClick={() => setModal({ tipo: 'prestar', equipo: e })}>Prestar</button>}
                            <button className="boton boton-pequeno" onClick={() => setModal({ tipo: 'editar', equipo: e })}>Editar</button>
                            <button className="boton boton-pequeno" onClick={() => setModal({ tipo: 'detalle', equipo: e })}>Historial</button>
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

      {modal?.tipo === 'nuevo' && <FormularioEquipo alCerrar={() => setModal(null)} alGuardar={alGuardar} />}
      {modal?.tipo === 'editar' && <FormularioEquipo equipo={modal.equipo} alCerrar={() => setModal(null)} alGuardar={alGuardar} />}
      {modal?.tipo === 'prestar' && <Prestar equipo={modal.equipo} alCerrar={() => setModal(null)} alGuardar={alGuardar} />}
      {modal?.tipo === 'devolver' && <Devolver equipo={modal.equipo} alCerrar={() => setModal(null)} alGuardar={alGuardar} />}
      {modal?.tipo === 'detalle' && <DetalleEquipo id={modal.equipo.id} alCerrar={() => setModal(null)} />}
    </>
  );
}
