// Configuración de la IA leída solo de variables de entorno (ver .env.example).
// No hay credenciales ni endpoints por defecto escondidos en el código: si la
// organización no autorizó un proveedor, la IA queda "no configurada" y la
// interfaz ofrece el procedimiento manual.

export const PROVEEDORES = ['anthropic', 'openai_compatible'];

export function leerConfiguracionIA(entorno = process.env) {
  const proveedor = (entorno.IA_PROVEEDOR || '').trim().toLowerCase();
  const config = {
    proveedor,
    modelo: (entorno.IA_MODELO || '').trim(),
    apiKey: (entorno.IA_API_KEY || '').trim(),
    urlBase: (entorno.IA_URL_BASE || '').trim().replace(/\/+$/, ''),
    timeoutMs: Math.min(Math.max(Number(entorno.IA_TIMEOUT_MS) || 25000, 3000), 120000),
    limitePorMinuto: Math.max(Number(entorno.IA_LIMITE_POR_MINUTO) || 15, 1),
  };

  let motivo = null;
  if (!proveedor) motivo = 'No se definió IA_PROVEEDOR en el archivo .env.';
  else if (!PROVEEDORES.includes(proveedor)) motivo = `IA_PROVEEDOR="${proveedor}" no es válido. Usa: ${PROVEEDORES.join(' o ')}.`;
  else if (!config.modelo) motivo = 'No se definió IA_MODELO en el archivo .env.';
  else if (proveedor === 'anthropic' && !config.apiKey) motivo = 'Falta IA_API_KEY para el proveedor anthropic.';
  else if (proveedor === 'openai_compatible' && !config.urlBase) {
    motivo = 'Falta IA_URL_BASE (endpoint autorizado compatible con /chat/completions).';
  }

  return { ...config, configurada: !motivo, motivo };
}

// Lo que se puede mostrar en la interfaz: nunca la clave.
export function estadoPublicoIA(config) {
  return {
    configurada: config.configurada,
    proveedor: config.proveedor || null,
    modelo: config.modelo || null,
    motivo: config.motivo,
    timeout_ms: config.timeoutMs,
  };
}
