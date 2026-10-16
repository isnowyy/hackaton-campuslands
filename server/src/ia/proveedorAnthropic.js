// Proveedor Claude (Anthropic) mediante el SDK oficial @anthropic-ai/sdk.
// Usa salidas estructuradas (output_config.format con JSON Schema) para que el
// modelo responda en el formato pedido; aun así triaje.js vuelve a validar la
// respuesta, porque la integridad no puede depender de un servicio externo.

import Anthropic from '@anthropic-ai/sdk';
import { IAError } from './errores.js';

// Modelos que admiten el respaldo automático del servidor ante un rechazo.
const MODELOS_CON_RESPALDO = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

export async function solicitarAnthropic({ config, sistema, usuario, esquema }) {
  const cliente = new Anthropic({
    apiKey: config.apiKey,
    // Explícito para no heredar un ANTHROPIC_BASE_URL del entorno por accidente.
    baseURL: config.urlBase || 'https://api.anthropic.com',
    timeout: config.timeoutMs,
    maxRetries: 1,
  });

  const conRespaldo = MODELOS_CON_RESPALDO.includes(config.modelo);
  let respuesta;
  try {
    respuesta = await cliente.beta.messages.create({
      model: config.modelo,
      max_tokens: 4000,
      system: sistema,
      messages: [{ role: 'user', content: usuario }],
      // Clasificar es una tarea corta: esfuerzo bajo = menos latencia y costo.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema } },
      ...(conRespaldo ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    });
  } catch (error) {
    // Del más específico al más general (todas heredan de APIError).
    if (error instanceof Anthropic.APIConnectionTimeoutError) throw new IAError('tiempo_agotado', `(límite ${config.timeoutMs} ms)`);
    if (error instanceof Anthropic.APIConnectionError) throw new IAError('sin_conexion', 'Revisa la red o IA_URL_BASE.');
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new IAError('credenciales', 'Revisa IA_API_KEY.');
    }
    if (error instanceof Anthropic.RateLimitError) throw new IAError('limite_proveedor');
    if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
      throw new IAError('solicitud_rechazada', `(HTTP ${error.status}: revisa IA_MODELO). ${error.message}`.slice(0, 300));
    }
    if (error instanceof Anthropic.APIError) throw new IAError('proveedor', `(HTTP ${error.status ?? '?'})`);
    throw error;
  }

  if (respuesta.stop_reason === 'refusal') throw new IAError('rechazo_modelo');
  if (respuesta.stop_reason === 'max_tokens') throw new IAError('respuesta_truncada');

  const texto = respuesta.content
    .filter((bloque) => bloque.type === 'text')
    .map((bloque) => bloque.text)
    .join('');
  return { texto, modelo: respuesta.model ?? config.modelo };
}
