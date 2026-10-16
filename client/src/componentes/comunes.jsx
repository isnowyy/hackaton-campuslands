// Componentes de interfaz reutilizados por todas las pantallas.

import { Component, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ErrorApi } from '../api.js';

// ---------- Catálogos (estados, categorías...) servidos por la API ----------
const ContextoCatalogos = createContext(null);
export const useCatalogos = () => useContext(ContextoCatalogos);

export function ProveedorCatalogos({ children }) {
  const { datos, error, recargar } = useDatos(() => api('/catalogos'), []);
  if (error) {
    return (
      <div className="principal">
        <MensajeError error={error} titulo="No se pudo conectar con la API" />
        <p><button className="boton" onClick={recargar}>Reintentar</button></p>
      </div>
    );
  }
  if (!datos) return <Cargando texto="Conectando con la API…" />;
  return <ContextoCatalogos.Provider value={datos}>{children}</ContextoCatalogos.Provider>;
}

export function useEtiqueta() {
  const catalogos = useCatalogos();
  return useCallback(
    (valor) => {
      if (valor === null || valor === undefined || valor === '') return '—';
      return catalogos?.etiquetas?.[valor] ?? catalogos?.categorias?.[valor]?.etiqueta ?? String(valor).replace(/_/g, ' ');
    },
    [catalogos],
  );
}

// ---------- Carga de datos con estado de carga y error ----------
export function useDatos(cargar, dependencias) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    cargar()
      .then((datos) => vigente && setEstado({ datos, cargando: false, error: null }))
      .catch((error) => vigente && setEstado((e) => ({ ...e, cargando: false, error })));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, version]);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, recargar };
}

// ---------- Notificaciones ----------
const ContextoAvisos = createContext(() => {});
export const useAvisar = () => useContext(ContextoAvisos);

export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const avisar = useCallback((tipo, titulo, texto) => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a.slice(-3), { id, tipo, titulo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ContextoAvisos.Provider value={avisar}>
      {children}
      <div className="notificaciones" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`notificacion ${a.tipo}`}>
            <strong>{a.titulo}</strong>
            {a.texto && <span className="secundario">{a.texto}</span>}
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

// ---------- Confirmación antes de operaciones destructivas ----------
const ContextoConfirmar = createContext(async () => false);
export const useConfirmar = () => useContext(ContextoConfirmar);

export function ProveedorConfirmacion({ children }) {
  const [pregunta, setPregunta] = useState(null);
  const resolver = useRef(null);
  const confirmar = useCallback(
    (opciones) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setPregunta(opciones);
      }),
    [],
  );
  const responder = (valor) => {
    resolver.current?.(valor);
    setPregunta(null);
  };
  return (
    <ContextoConfirmar.Provider value={confirmar}>
      {children}
      {pregunta && (
        <Modal titulo={pregunta.titulo} alCerrar={() => responder(false)}
          pie={
            <>
              <button className="boton" onClick={() => responder(false)}>Cancelar</button>
              <button className={`boton ${pregunta.peligro ? 'boton-peligro-solido' : 'boton-primario'}`} onClick={() => responder(true)} autoFocus>
                {pregunta.confirmar ?? 'Confirmar'}
              </button>
            </>
          }>
          <p style={{ margin: 0 }}>{pregunta.mensaje}</p>
        </Modal>
      )}
    </ContextoConfirmar.Provider>
  );
}

// ---------- Piezas visuales ----------
export function Modal({ titulo, alCerrar, children, pie, ancho = false }) {
  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [alCerrar]);
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className={`modal ${ancho ? 'modal-ancho' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cabecera">
          <h2>{titulo}</h2>
          <button className="cerrar" onClick={alCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>
  );
}

const TONOS = {
  disponible: 'exito', libre: 'exito', operativo: 'exito', activa: 'primario', activo: 'primario', devuelto: 'exito',
  resuelta: 'exito', cerrada: '', cancelada: '', ocupado: 'primario', prestado: 'primario', en_progreso: 'primario',
  abierta: 'aviso', mantenimiento: 'aviso', vencido: 'peligro', no_disponible: 'peligro', inhabilitado: 'peligro',
  danado: 'peligro', baja: '', media: 'primario', alta: 'aviso', critica: 'peligro', ia: 'ia', ia_editada: 'ia',
  pendiente: 'ia', aceptada: 'exito', editada: 'ia', descartada: '', manual: '', oficial: '',
};

export function Insignia({ valor, texto, tono }) {
  const etiqueta = useEtiqueta();
  return <span className={`insignia tono-${tono ?? TONOS[valor] ?? ''}`}>{texto ?? etiqueta(valor)}</span>;
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="cargando"><span className="girando" /> {texto}</div>
  );
}

export function Vacio({ titulo, children }) {
  return (
    <div className="vacio">
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

// Muestra un error de la API: qué regla se incumplió, la lista de problemas
// de validación o el fallo de la IA, siempre con un texto comprensible.
export function MensajeError({ error, titulo }) {
  if (!error) return null;
  const encabezado =
    titulo ??
    (error instanceof ErrorApi && error.nombreRegla
      ? `Regla incumplida: ${error.nombreRegla}`
      : error instanceof ErrorApi && error.tipo === 'validacion'
        ? 'Revisa los datos'
        : error instanceof ErrorApi && error.tipo === 'ia'
          ? 'La IA no pudo generar la sugerencia'
          : 'No se pudo completar la operación');
  return (
    <div className="aviso aviso-error" role="alert">
      <div>
        <strong>{encabezado}</strong>
        {error.problemas?.length > 1 ? (
          <ul>{error.problemas.map((p) => <li key={p}>{p}</li>)}</ul>
        ) : (
          <p>{error.message}</p>
        )}
      </div>
    </div>
  );
}

export function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <small className="ayuda">{ayuda}</small>}
    </label>
  );
}

// Una pantalla que falla no tumba toda la aplicación.
export class LimiteDeError extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidUpdate(previas) {
    if (previas.clave !== this.props.clave && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="tarjeta tarjeta-cuerpo">
          <MensajeError error={this.state.error} titulo="Esta sección tuvo un error inesperado" />
          <p><button className="boton" onClick={() => this.setState({ error: null })}>Reintentar</button></p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Hook para ejecutar una acción contra la API con estado de "enviando" y error.
export function useAccion() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const ejecutar = useCallback(async (fn) => {
    setEnviando(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setEnviando(false);
    }
  }, []);
  return { enviando, error, setError, ejecutar };
}

export const formatearFecha = (valor) => (valor ? valor.replace('T', ' ') : '—');

// Valor por defecto para <input type="datetime-local">: ahora + minutos, redondeado.
export function fechaLocal(desplazamientoMinutos = 0) {
  const d = new Date(Date.now() + desplazamientoMinutos * 60000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
