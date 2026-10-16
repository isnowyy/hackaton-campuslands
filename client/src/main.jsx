import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ProveedorAvisos, ProveedorCatalogos, ProveedorConfirmacion } from './componentes/comunes.jsx';
import './estilos.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ProveedorAvisos>
      <ProveedorConfirmacion>
        <ProveedorCatalogos>
          <App />
        </ProveedorCatalogos>
      </ProveedorConfirmacion>
    </ProveedorAvisos>
  </StrictMode>,
);
