// Proveedor para APIs compatibles con /chat/completions: Google Gemini (su
// endpoint compatible con OpenAI), OpenAI, Groq o un modelo local (Ollama,
// LM Studio). Solo se usa si IA_PROVEEDOR=openai_compatible y IA_URL_BASE
// apunta a un endpoint autorizado y disponible.
//
// Decisiones para Gemini 3:
// - No se envía temperature: Google recomienda dejar el valor por defecto en
//   sus modelos con razonamiento. Se puede forzar con IA_TEMPERATURA.
// - reasoning_effort (IA_ESFUERZO=low) reduce la latencia; en modelos sin
//   razonamiento se deja vacío porque algunos proveedores lo rechazan.
// - La salida se pide con JSON Schema (IA_FORMATO_JSON=json_schema). Si un
//   proveedor no lo admite, usar json_object o ninguno: triaje.js valida la
//   respuesta en cualquier caso.
// - Modelos de respaldo (IA_MODELO_RESPALDO): si el modelo principal está
//   saturado (503) o sin cuota (429), se intenta el siguiente de la lista
//   dentro del mismo tiempo máximo, y se informa qué modelo respondió.

import { IAError } from './errores.js';

const CODIGOS_PARA_REINTENTAR_CON_OTRO_MODELO = ['proveedor_saturado', 'limite_proveedor'];

function formatoDeRespuesta(config, esquema) {
  if (config.formatoJson === 'ninguno') return undefined;
  if (config.formatoJson === 'json_object' || !esquema) return { type: 'json_object' };
  return { type: 'json_schema', json_schema: { name: 'sugerencia_triaje', strict: true, schema: esquema } };
}

// Gemini responde 400 (no 401) cuando la clave es inválida.
const esErrorDeClave = (cuerpo) => /API[_ ]?KEY|api key|unauthenticated|permission/i.test(cuerpo);

async function solicitarModelo({ config, modelo, sistema, usuario, esquema, milisegundos }) {
  const formato = formatoDeRespuesta(config, esquema);
  let respuesta;
  try {
    respuesta = await fetch(`${config.urlBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: usuario },
        ],
        ...(formato ? { response_format: formato } : {}),
        ...(config.esfuerzo ? { reasoning_effort: config.esfuerzo } : {}),
        ...(config.temperatura !== null ? { temperature: config.temperatura } : {}),
      }),
      signal: AbortSignal.timeout(milisegundos),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new IAError('tiempo_agotado', `(límite ${config.timeoutMs} ms)`);
    }
    throw new IAError('sin_conexion', `Revisa IA_URL_BASE (${config.urlBase}).`);
  }

  if (!respuesta.ok) {
    const cuerpo = (await respuesta.text().catch(() => '')).slice(0, 300);
    if (respuesta.status === 401 || respuesta.status === 403 || (respuesta.status === 400 && esErrorDeClave(cuerpo))) {
      throw new IAError('credenciales', 'Revisa IA_API_KEY.');
    }
    if (respuesta.status === 429) throw new IAError('limite_proveedor', `(${modelo})`);
    if (respuesta.status === 503) throw new IAError('proveedor_saturado', `(${modelo})`);
    if (respuesta.status === 408 || respuesta.status === 504) throw new IAError('tiempo_agotado');
    if (respuesta.status === 400 || respuesta.status === 404) {
      throw new IAError('solicitud_rechazada', `(HTTP ${respuesta.status}: revisa IA_MODELO e IA_FORMATO_JSON). ${cuerpo}`);
    }
    throw new IAError('proveedor', `(HTTP ${respuesta.status})`);
  }

  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new IAError('respuesta_invalida', 'El cuerpo de la respuesta no es JSON.');
  }
  const eleccion = datos?.choices?.[0];
  if (eleccion?.finish_reason === 'length') throw new IAError('respuesta_truncada');
  if (eleccion?.finish_reason === 'content_filter') throw new IAError('rechazo_modelo');
  const texto = eleccion?.message?.content;
  if (typeof texto !== 'string' || !texto.trim()) {
    throw new IAError('respuesta_invalida', 'La respuesta no trae contenido de texto.');
  }
  return { texto, modelo: datos.model ?? modelo };
}

export async function solicitarCompatibleOpenAI({ config, sistema, usuario, esquema }) {
  const modelos = [config.modelo, ...(config.modelosRespaldo ?? []).filter((m) => m !== config.modelo)];
  const limite = Date.now() + config.timeoutMs;
  const fallidos = [];
  for (const modelo of modelos) {
    const restante = limite - Date.now();
    if (restante < 1000) throw new IAError('tiempo_agotado', `(límite ${config.timeoutMs} ms)`);
    try {
      const resultado = await solicitarModelo({ config, modelo, sistema, usuario, esquema, milisegundos: restante });
      return fallidos.length
        ? { ...resultado, aviso: `${fallidos.map((f) => `${f.modelo} (${f.codigo})`).join(', ')} no respondió; se usó el modelo de respaldo.` }
        : resultado;
    } catch (error) {
      const ultimo = modelo === modelos[modelos.length - 1];
      if (!(error instanceof IAError) || !CODIGOS_PARA_REINTENTAR_CON_OTRO_MODELO.includes(error.codigo) || ultimo) throw error;
      fallidos.push({ modelo, codigo: error.codigo });
    }
  }
  throw new IAError('proveedor');
}
