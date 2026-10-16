// Proveedor genérico para servicios con API compatible con /chat/completions
// (por ejemplo un modelo local servido por Ollama o LM Studio, u otra API que
// la organización autorice). Solo se usa si IA_PROVEEDOR=openai_compatible y
// IA_URL_BASE apunta a un endpoint que de verdad esté disponible.

import { IAError } from './errores.js';

export async function solicitarCompatibleOpenAI({ config, sistema, usuario }) {
  let respuesta;
  try {
    respuesta = await fetch(`${config.urlBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.modelo,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: usuario },
        ],
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new IAError('tiempo_agotado', `(límite ${config.timeoutMs} ms)`);
    }
    throw new IAError('sin_conexion', `Revisa IA_URL_BASE (${config.urlBase}).`);
  }

  if (!respuesta.ok) {
    if (respuesta.status === 401 || respuesta.status === 403) throw new IAError('credenciales', 'Revisa IA_API_KEY.');
    if (respuesta.status === 429) throw new IAError('limite_proveedor');
    if (respuesta.status === 408 || respuesta.status === 504) throw new IAError('tiempo_agotado');
    const cuerpo = (await respuesta.text().catch(() => '')).slice(0, 200);
    if (respuesta.status === 400 || respuesta.status === 404) {
      throw new IAError('solicitud_rechazada', `(HTTP ${respuesta.status}: revisa IA_MODELO). ${cuerpo}`);
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
  const texto = eleccion?.message?.content;
  if (typeof texto !== 'string') throw new IAError('respuesta_invalida', 'La respuesta no trae contenido de texto.');
  return { texto, modelo: datos.model ?? config.modelo };
}
