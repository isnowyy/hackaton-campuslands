// Módulo 3 · Incidencias y solicitudes con triaje de IA.
// La IA solo propone. La persona revisa la sugerencia (claramente marcada como
// generada por IA) y decide aplicarla, editarla o descartarla; lo que se
// aplique pasa siempre por la regla R6 en el servidor.

import { useState } from 'react';
import { api } from '../api.js';
import {
  Campo, Cargando, formatearFecha, Insignia, MensajeError, Modal, useAccion, useAvisar, useCatalogos,
  useConfirmar, useDatos, useEtiqueta, Vacio,
} from '../componentes/comunes.jsx';
import { ListaMovimientos } from './Panel.jsx';

const ETIQUETA_ORIGEN = { ia: 'Clasificada por IA', ia_editada: 'IA editada por persona', manual: 'Clasificación manual', oficial: 'Dato oficial' };

// Campos de clasificación. Se listan todas las áreas, marcando las que no son
// compatibles con la categoría: si se elige una, el servidor la rechaza (R6).
function CamposClasificacion({ valor, alCambiar, conAsignado = false }) {
  const { categorias, prioridades, areas } = useCatalogos();
  const etiqueta = useEtiqueta();
  const permitidas = categorias[valor.categoria]?.areas ?? areas;
  const cambiar = (campo) => (e) => alCambiar({ ...valor, [campo]: e.target.value });
  return (
    <div className="formulario-2">
      <Campo etiqueta="Categoría">
        <select value={valor.categoria ?? ''} onChange={cambiar('categoria')}>
          <option value="">Sin clasificar</option>
          {Object.entries(categorias).map(([clave, c]) => <option key={clave} value={clave}>{c.etiqueta}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Prioridad">
        <select value={valor.prioridad ?? ''} onChange={cambiar('prioridad')}>
          <option value="">—</option>
          {prioridades.map((p) => <option key={p} value={p}>{etiqueta(p)}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Área responsable">
        <select value={valor.area_responsable ?? ''} onChange={cambiar('area_responsable')}>
          <option value="">—</option>
          {areas.map((a) => <option key={a} value={a}>{etiqueta(a)}{permitidas.includes(a) ? '' : ' — no compatible'}</option>)}
        </select>
      </Campo>
      {conAsignado && (
        <Campo etiqueta="Persona asignada" ayuda="Obligatoria si reasignas a otra área una incidencia en progreso.">
          <input value={valor.asignado_a ?? ''} onChange={cambiar('asignado_a')} maxLength={120} />
        </Campo>
      )}
    </div>
  );
}

// Tarjeta de la sugerencia de IA: siempre identificada como generada por un
// modelo, con modelo, fecha, confianza y verificación contra las reglas.
function SugerenciaIA({ sugerencia, modelo, generadaEn, validacion, decision, children }) {
  const etiqueta = useEtiqueta();
  const { categorias } = useCatalogos();
  return (
    <div className="panel-ia" aria-label="Sugerencia generada por IA">
      <div className="panel-ia-cabecera">
        <span className="etiqueta-ia">✦ Sugerencia generada por IA · requiere revisión</span>
        <span className="secundario">{modelo} · {formatearFecha(generadaEn)}{decision && decision !== 'pendiente' ? ` · ${decision}` : ''}</span>
      </div>
      <div className="fila-flex">
        <Insignia valor={sugerencia.prioridad} texto={`Prioridad ${etiqueta(sugerencia.prioridad).toLowerCase()}`} />
        <Insignia valor="ia" texto={categorias[sugerencia.categoria]?.etiqueta ?? sugerencia.categoria} />
        <Insignia valor="ia" texto={etiqueta(sugerencia.area_responsable)} />
        {sugerencia.requiere_atencion_inmediata && <Insignia valor="critica" texto="Atención inmediata" />}
        <span className="secundario">
          Confianza <span className="medidor"><span style={{ width: `${Math.round(sugerencia.confianza * 100)}%` }} /></span> {Math.round(sugerencia.confianza * 100)}%
        </span>
      </div>
      <p style={{ margin: 0 }}>{sugerencia.justificacion}</p>
      <div>
        <strong>Ruta de atención recomendada</strong>
        <ol>{sugerencia.acciones_recomendadas.map((a, i) => <li key={i}>{a}</li>)}</ol>
      </div>
      {validacion && (validacion.cumple ? (
        <div className="aviso aviso-exito"><div><strong>Cumple las reglas de negocio</strong><p>La combinación categoría–área es válida (R6).</p></div></div>
      ) : (
        <div className="aviso aviso-error"><div><strong>No se puede aplicar tal cual: {validacion.regla}</strong><p>{validacion.mensaje} Edítala antes de aplicarla.</p></div></div>
      ))}
      {children && <div className="fila-flex">{children}</div>}
    </div>
  );
}

// Error de IA con salida manual explícita.
function ErrorIA({ error }) {
  const [verCruda, setVerCruda] = useState(false);
  if (!error) return null;
  return (
    <div className="aviso aviso-advertencia" role="alert">
      <div>
        <strong>{error.tipo === 'ia' ? 'La IA no pudo generar la sugerencia' : 'No se pudo consultar la IA'}</strong>
        <p>{error.message}</p>
        <p><strong>Puedes continuar manualmente:</strong> completa categoría, prioridad y área en el formulario. Nada se aplicó automáticamente.</p>
        {error.respuestaCruda && (
          <>
            <button className="boton-texto" onClick={() => setVerCruda(!verCruda)}>{verCruda ? 'Ocultar' : 'Ver'} respuesta recibida del modelo</button>
            {verCruda && <pre className="texto-largo secundario">{error.respuestaCruda}</pre>}
          </>
        )}
      </div>
    </div>
  );
}

function NuevaIncidencia({ alCerrar, alGuardar }) {
  const espacios = useDatos(() => api('/espacios'), []);
  const equipos = useDatos(() => api('/equipos'), []);
  const [datos, setDatos] = useState({ titulo: '', descripcion: '', espacio_id: '', equipo_id: '', reportado_por: '' });
  const [clasificacion, setClasificacion] = useState({ categoria: '', prioridad: '', area_responsable: '' });
  const [triaje, setTriaje] = useState(null);
  const ia = useAccion();
  const guardado = useAccion();
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });

  const pedirSugerencia = () =>
    ia.ejecutar(async () => {
      setTriaje(null);
      setTriaje(await api('/ia/triaje', { metodo: 'POST', cuerpo: datos }));
    });
  const usarSugerencia = () => {
    const { categoria, prioridad, area_responsable } = triaje.sugerencia;
    setClasificacion({ categoria, prioridad, area_responsable });
  };
  const guardar = (e) => {
    e.preventDefault();
    guardado.ejecutar(async () => {
      const r = await api('/incidencias', { metodo: 'POST', cuerpo: { ...datos, ...clasificacion, sugerencia_id: triaje?.id } });
      alGuardar(r, `Incidencia ${r.id} registrada`);
    });
  };

  return (
    <Modal titulo="Nueva incidencia o solicitud" alCerrar={alCerrar} ancho
      pie={<><button className="boton" onClick={alCerrar}>Cancelar</button><button className="boton boton-primario" form="form-incidencia" disabled={guardado.enviando}>{guardado.enviando ? 'Guardando…' : 'Registrar'}</button></>}>
      <form id="form-incidencia" className="formulario" onSubmit={guardar}>
        <MensajeError error={guardado.error} />
        <div className="formulario-2">
          <Campo etiqueta="Título"><input value={datos.titulo} onChange={cambiar('titulo')} required maxLength={120} placeholder="Ej.: Proyector del aula 101 no enciende" /></Campo>
          <Campo etiqueta="Reportado por"><input value={datos.reportado_por} onChange={cambiar('reportado_por')} maxLength={120} /></Campo>
        </div>
        <Campo etiqueta="Descripción"><textarea value={datos.descripcion} onChange={cambiar('descripcion')} required maxLength={4000} placeholder="¿Qué pasa, dónde, desde cuándo, a quién afecta?" /></Campo>
        <div className="formulario-2">
          <Campo etiqueta="Espacio relacionado (opcional)">
            <select value={datos.espacio_id} onChange={cambiar('espacio_id')}>
              <option value="">Ninguno</option>
              {espacios.datos?.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.id})</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Equipo relacionado (opcional)">
            <select value={datos.equipo_id} onChange={cambiar('equipo_id')}>
              <option value="">Ninguno</option>
              {equipos.datos?.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.id})</option>)}
            </select>
          </Campo>
        </div>
      </form>

      <div className="fila-flex separado">
        <h3>Clasificación</h3>
        <button type="button" className="boton boton-ia" onClick={pedirSugerencia} disabled={ia.enviando}>
          {ia.enviando ? <><span className="girando" /> Analizando con IA…</> : '✦ Sugerir con IA'}
        </button>
      </div>
      <ErrorIA error={ia.error} />
      {triaje && (
        <SugerenciaIA sugerencia={triaje.sugerencia} modelo={triaje.modelo} generadaEn={triaje.generada_en} validacion={triaje.validacion_reglas}>
          <button type="button" className="boton boton-pequeno boton-primario" onClick={usarSugerencia}>Copiar al formulario</button>
          <button type="button" className="boton boton-pequeno" onClick={() => setTriaje(null)}>Descartar</button>
        </SugerenciaIA>
      )}
      <CamposClasificacion valor={clasificacion} alCambiar={setClasificacion} />
      <p className="secundario" style={{ margin: 0 }}>Opcional al registrar: puedes clasificarla después. La clasificación se valida en el servidor (R6) y queda registrado si vino de la IA o de una persona.</p>
    </Modal>
  );
}

// Formulario del cambio de estado con los datos que exige cada transición.
function CambioEstado({ incidencia, estado, alCerrar, alGuardar }) {
  const etiqueta = useEtiqueta();
  const confirmar = useConfirmar();
  const [datos, setDatos] = useState({ asignado_a: incidencia.asignado_a ?? '', solucion: incidencia.solucion ?? '', motivo: '' });
  const { enviando, error, ejecutar } = useAccion();
  const guardar = async () => {
    if (['cerrada', 'cancelada'].includes(estado)) {
      const ok = await confirmar({
        titulo: `${estado === 'cerrada' ? 'Cerrar' : 'Cancelar'} ${incidencia.id}`,
        mensaje: 'Una incidencia cerrada o cancelada ya no se puede modificar. ¿Continuar?',
        confirmar: estado === 'cerrada' ? 'Cerrar incidencia' : 'Cancelar incidencia',
        peligro: true,
      });
      if (!ok) return;
    }
    ejecutar(async () => alGuardar(await api(`/incidencias/${incidencia.id}/estado`, { metodo: 'POST', cuerpo: { estado, ...datos } }), `${incidencia.id}: ${etiqueta(estado)}`));
  };
  return (
    <div className="tarjeta tarjeta-cuerpo formulario">
      <strong>Pasar a «{etiqueta(estado)}»</strong>
      <MensajeError error={error} />
      {estado === 'en_progreso' && <Campo etiqueta="Persona que la atiende"><input value={datos.asignado_a} onChange={(e) => setDatos({ ...datos, asignado_a: e.target.value })} maxLength={120} /></Campo>}
      {(estado === 'resuelta' || estado === 'cerrada') && (
        <Campo etiqueta="Solución aplicada"><textarea value={datos.solucion} onChange={(e) => setDatos({ ...datos, solucion: e.target.value })} maxLength={2000} disabled={estado === 'cerrada'} /></Campo>
      )}
      {estado === 'cancelada' && <Campo etiqueta="Motivo de la cancelación"><input value={datos.motivo} onChange={(e) => setDatos({ ...datos, motivo: e.target.value })} maxLength={300} /></Campo>}
      <div className="fila-flex">
        <button className={`boton ${['cerrada', 'cancelada'].includes(estado) ? 'boton-peligro-solido' : 'boton-primario'}`} onClick={guardar} disabled={enviando}>Confirmar</button>
        <button className="boton" onClick={alCerrar}>Cancelar</button>
      </div>
    </div>
  );
}

function DetalleIncidencia({ id, alCerrar, alCambiar }) {
  const { transiciones_incidencia, categorias } = useCatalogos();
  const etiqueta = useEtiqueta();
  const avisar = useAvisar();
  const { datos: inc, error, recargar } = useDatos(() => api(`/incidencias/${encodeURIComponent(id)}`), [id]);
  const [clasificacion, setClasificacion] = useState(null);
  const [estadoDestino, setEstadoDestino] = useState(null);
  const ia = useAccion();
  const accion = useAccion();

  const tras = (mensaje) => (r) => {
    if (r === undefined) return;
    avisar('exito', mensaje);
    setClasificacion(null);
    setEstadoDestino(null);
    recargar();
    alCambiar();
  };
  const analizar = () => ia.ejecutar(() => api(`/incidencias/${id}/ia`, { metodo: 'POST' })).then(tras('Sugerencia de IA lista para revisar'));
  const clasificar = (valores) => accion.ejecutar(() => api(`/incidencias/${id}/clasificacion`, { metodo: 'POST', cuerpo: valores })).then(tras('Clasificación aplicada'));
  const descartar = () => accion.ejecutar(() => api(`/incidencias/${id}/ia/descartar`, { metodo: 'POST' })).then(tras('Sugerencia descartada'));

  if (error) return <Modal titulo="Incidencia" alCerrar={alCerrar}><MensajeError error={error} /></Modal>;
  if (!inc) return <Modal titulo="Incidencia" alCerrar={alCerrar}><Cargando /></Modal>;

  const final = ['cerrada', 'cancelada'].includes(inc.estado);
  const editable = !final && inc.estado !== 'resuelta';
  const sugerencia = inc.ia_sugerencia;
  const formulario = clasificacion ?? {
    categoria: inc.categoria ?? '', prioridad: inc.prioridad ?? '', area_responsable: inc.area_responsable ?? '', asignado_a: '',
  };

  return (
    <Modal titulo={`${inc.id} · ${inc.titulo}`} alCerrar={alCerrar} ancho>
      <div className="fila-flex">
        <Insignia valor={inc.estado} />
        {inc.prioridad && <Insignia valor={inc.prioridad} texto={`Prioridad ${etiqueta(inc.prioridad).toLowerCase()}`} />}
        {inc.origen_clasificacion && <Insignia valor={inc.origen_clasificacion} texto={ETIQUETA_ORIGEN[inc.origen_clasificacion]} />}
        <span className="secundario">Creada {formatearFecha(inc.creado_en)}{inc.reportado_por ? ` por ${inc.reportado_por}` : ''}</span>
      </div>
      <p className="texto-largo">{inc.descripcion}</p>
      <dl className="definiciones">
        <dt>Categoría</dt><dd>{categorias[inc.categoria]?.etiqueta ?? '—'}</dd>
        <dt>Área</dt><dd>{etiqueta(inc.area_responsable)}</dd>
        <dt>Asignada a</dt><dd>{inc.asignado_a ?? '—'}</dd>
        {inc.espacio && <><dt>Espacio</dt><dd>{inc.espacio.nombre} <Insignia valor={inc.espacio.estado} /></dd></>}
        {inc.equipo && <><dt>Equipo</dt><dd>{inc.equipo.nombre} <Insignia valor={inc.equipo.estado} /></dd></>}
        {inc.solucion && <><dt>Solución</dt><dd className="texto-largo">{inc.solucion}</dd></>}
        {inc.motivo_cancelacion && <><dt>Motivo</dt><dd>{inc.motivo_cancelacion}</dd></>}
      </dl>

      <MensajeError error={accion.error} />

      {/* --- Triaje con IA --- */}
      {editable && (
        <div className="fila-flex separado">
          <h3>Triaje inteligente</h3>
          <button className="boton boton-ia" onClick={analizar} disabled={ia.enviando}>
            {ia.enviando ? <><span className="girando" /> Analizando…</> : sugerencia ? '✦ Volver a analizar con IA' : '✦ Analizar con IA'}
          </button>
        </div>
      )}
      <ErrorIA error={ia.error} />
      {sugerencia && (
        <SugerenciaIA sugerencia={sugerencia} modelo={inc.ia_modelo} generadaEn={inc.ia_generada_en} validacion={sugerencia.validacion_reglas} decision={inc.ia_decision}>
          {inc.ia_decision === 'pendiente' && editable && (
            <>
              <button className="boton boton-pequeno boton-primario" disabled={accion.enviando || !sugerencia.validacion_reglas?.cumple}
                onClick={() => clasificar({ categoria: sugerencia.categoria, prioridad: sugerencia.prioridad, area_responsable: sugerencia.area_responsable })}>
                Aplicar sugerencia
              </button>
              <button className="boton boton-pequeno" onClick={() => setClasificacion({ categoria: sugerencia.categoria, prioridad: sugerencia.prioridad, area_responsable: sugerencia.area_responsable, asignado_a: '' })}>
                Editar antes de aplicar
              </button>
              <button className="boton boton-pequeno boton-peligro" onClick={descartar} disabled={accion.enviando}>Descartar</button>
            </>
          )}
        </SugerenciaIA>
      )}

      {/* --- Clasificación manual / edición --- */}
      {editable && (
        <div className="tarjeta tarjeta-cuerpo formulario">
          <strong>{inc.categoria ? 'Reclasificar o reasignar' : 'Clasificar manualmente'}</strong>
          <CamposClasificacion valor={formulario} alCambiar={setClasificacion} conAsignado />
          <div className="fila-flex">
            <button className="boton boton-primario" disabled={accion.enviando || !formulario.categoria || !formulario.prioridad || !formulario.area_responsable}
              onClick={() => clasificar(formulario)}>Guardar clasificación</button>
            {clasificacion && <button className="boton" onClick={() => setClasificacion(null)}>Deshacer cambios</button>}
          </div>
        </div>
      )}

      {/* --- Estado --- */}
      {!final && (
        <div className="fila-flex">
          <strong>Cambiar estado:</strong>
          {(transiciones_incidencia[inc.estado] ?? []).map((destino) => (
            <button key={destino} className={`boton boton-pequeno ${['cancelada'].includes(destino) ? 'boton-peligro' : ''}`} onClick={() => setEstadoDestino(destino)}>
              {etiqueta(destino)}
            </button>
          ))}
        </div>
      )}
      {estadoDestino && <CambioEstado key={estadoDestino} incidencia={inc} estado={estadoDestino} alCerrar={() => setEstadoDestino(null)} alGuardar={tras(`Estado actualizado`)} />}
      {final && <div className="aviso aviso-info"><div><strong>Incidencia {etiqueta(inc.estado).toLowerCase()}</strong><p>Es histórica: no admite cambios (R6).</p></div></div>}

      <h3>Trazabilidad</h3>
      <ListaMovimientos movimientos={inc.movimientos} />
    </Modal>
  );
}

export default function Incidencias({ consulta }) {
  const { estados_incidencia, prioridades, areas } = useCatalogos();
  const etiqueta = useEtiqueta();
  const [filtros, setFiltros] = useState({ busqueda: '', estado: '', prioridad: '', area: '', pendientes: true });
  const [version, setVersion] = useState(0);
  const { datos, cargando, error } = useDatos(() => api('/incidencias', { parametros: filtros }), [filtros, version]);
  const [modal, setModal] = useState(consulta?.get('id') ? { tipo: 'detalle', id: consulta.get('id') } : null);
  const avisar = useAvisar();
  const refrescar = () => setVersion((v) => v + 1);
  const cambiarFiltro = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Incidencias y solicitudes</h1>
          <p>Registro, triaje con IA revisado por personas y atención hasta el cierre.</p>
        </div>
        <button className="boton boton-primario" onClick={() => setModal({ tipo: 'nueva' })}>+ Nueva incidencia</button>
      </div>
      <div className="tarjeta">
        <div className="barra">
          <input className="buscar" type="search" placeholder="Buscar por código, título, descripción o persona" value={filtros.busqueda} onChange={cambiarFiltro('busqueda')} aria-label="Buscar incidencias" />
          <select value={filtros.estado} onChange={cambiarFiltro('estado')} aria-label="Estado"><option value="">Todos los estados</option>{estados_incidencia.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
          <select value={filtros.prioridad} onChange={cambiarFiltro('prioridad')} aria-label="Prioridad"><option value="">Toda prioridad</option>{prioridades.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
          <select value={filtros.area} onChange={cambiarFiltro('area')} aria-label="Área"><option value="">Todas las áreas</option>{areas.map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}</select>
          <label className="casilla"><input type="checkbox" checked={filtros.pendientes} onChange={cambiarFiltro('pendientes')} /> Solo pendientes</label>
        </div>
        <MensajeError error={error} />
        {cargando && !datos ? <Cargando /> : datos?.length === 0 ? (
          <Vacio titulo="No hay incidencias en este filtro">{filtros.pendientes ? 'Desmarca «Solo pendientes» para ver el historial.' : 'Registra la primera incidencia.'}</Vacio>
        ) : datos && (
          <div className="tabla-contenedor">
            <table>
              <thead><tr><th>Incidencia</th><th>Prioridad</th><th>Categoría / área</th><th>Estado</th><th>Clasificación</th><th /></tr></thead>
              <tbody>
                {datos.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.titulo}</strong><div className="secundario">{i.id} · {formatearFecha(i.creado_en)}</div></td>
                    <td>{i.prioridad ? <Insignia valor={i.prioridad} /> : <span className="secundario">—</span>}</td>
                    <td>{i.categoria ? etiqueta(i.categoria) : <Insignia valor="abierta" texto="Sin clasificar" tono="aviso" />}<div className="secundario">{i.area_responsable ? etiqueta(i.area_responsable) : ''}</div></td>
                    <td><Insignia valor={i.estado} />{i.asignado_a && <div className="secundario">{i.asignado_a}</div>}</td>
                    <td>
                      {i.ia_decision === 'pendiente' && <Insignia valor="pendiente" texto="IA por revisar" />}
                      {i.ia_decision !== 'pendiente' && i.origen_clasificacion && <Insignia valor={i.origen_clasificacion} texto={ETIQUETA_ORIGEN[i.origen_clasificacion]} />}
                    </td>
                    <td className="acciones"><button className="boton boton-pequeno" onClick={() => setModal({ tipo: 'detalle', id: i.id })}>Gestionar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.tipo === 'nueva' && (
        <NuevaIncidencia alCerrar={() => setModal(null)} alGuardar={(r, msg) => { avisar('exito', msg); refrescar(); setModal({ tipo: 'detalle', id: r.id }); }} />
      )}
      {modal?.tipo === 'detalle' && <DetalleIncidencia id={modal.id} alCerrar={() => setModal(null)} alCambiar={refrescar} />}
    </>
  );
}
