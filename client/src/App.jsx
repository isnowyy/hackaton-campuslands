import { useEffect, useState } from 'react';
import { guardarOperador, leerOperador } from './api.js';
import { LimiteDeError } from './componentes/comunes.jsx';
import Panel from './paginas/Panel.jsx';
import Espacios from './paginas/Espacios.jsx';
import Equipos from './paginas/Equipos.jsx';
import Incidencias from './paginas/Incidencias.jsx';
import DatosOficiales from './paginas/DatosOficiales.jsx';
import Trazabilidad from './paginas/Trazabilidad.jsx';

// Navegación por hash (#/espacios): sin dependencias extra y funciona al recargar.
const RUTAS = [
  { ruta: 'panel', titulo: 'Panel', icono: '◧', componente: Panel },
  { ruta: 'espacios', titulo: 'Espacios', icono: '▦', componente: Espacios },
  { ruta: 'equipos', titulo: 'Recursos tecnológicos', icono: '⌨', componente: Equipos },
  { ruta: 'incidencias', titulo: 'Incidencias', icono: '⚑', componente: Incidencias },
  { ruta: 'datos', titulo: 'Datos oficiales', icono: '⇪', componente: DatosOficiales },
  { ruta: 'trazabilidad', titulo: 'Trazabilidad', icono: '☰', componente: Trazabilidad },
];

function rutaActual() {
  const [ruta, consulta = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  return { ruta: RUTAS.some((r) => r.ruta === ruta) ? ruta : 'panel', consulta: new URLSearchParams(consulta) };
}

export default function App() {
  const [{ ruta, consulta }, setUbicacion] = useState(rutaActual);
  const [operador, setOperador] = useState(leerOperador);

  useEffect(() => {
    const alCambiar = () => setUbicacion(rutaActual());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const actual = RUTAS.find((r) => r.ruta === ruta);
  const Pagina = actual.componente;

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <div className="marca-logo">C</div>
          <div>
            <strong>Campus Operativo</strong>
            <small>Campuslands · Gestión central</small>
          </div>
        </div>
        <nav className="navegacion" aria-label="Módulos">
          {RUTAS.map((r) => (
            <a key={r.ruta} href={`#/${r.ruta}`} className={r.ruta === ruta ? 'activo' : ''} aria-current={r.ruta === ruta ? 'page' : undefined}>
              <span aria-hidden="true">{r.icono}</span> {r.titulo}
            </a>
          ))}
        </nav>
        <div className="lateral-pie">
          <label htmlFor="operador">Operador (queda en la trazabilidad)</label>
          <input
            id="operador"
            placeholder="Tu nombre"
            value={operador}
            maxLength={60}
            onChange={(e) => {
              setOperador(e.target.value);
              guardarOperador(e.target.value);
            }}
          />
        </div>
      </aside>
      <main className="principal">
        <LimiteDeError clave={ruta}>
          <Pagina consulta={consulta} />
        </LimiteDeError>
      </main>
    </div>
  );
}
