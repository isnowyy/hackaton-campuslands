// Prueba el adaptador /chat/completions (Gemini, OpenAI, Groq, Ollama) contra
// un servidor HTTP local que imita al proveedor: revisa qué se envía y cómo se
// traducen las respuestas de error. No llama a ningún servicio externo.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { leerConfiguracionIA } from '../src/ia/configuracion.js';
import { IAError } from '../src/ia/errores.js';
import { solicitarCompatibleOpenAI } from '../src/ia/proveedorCompatibleOpenAI.js';
import { crearTriaje, ESQUEMA_SUGERENCIA } from '../src/ia/triaje.js';

describe('Proveedor compatible con OpenAI (Gemini)', () => {
  let servidor;
  let ultimaPeticion;
  let responder;
  let base;

  before(async () => {
    servidor = createServer((req, res) => {
      let cuerpo = '';
      req.on('data', (c) => (cuerpo += c));
      req.on('end', () => {
        ultimaPeticion = { ruta: req.url, autorizacion: req.headers.authorization, cuerpo: JSON.parse(cuerpo) };
        responder(res);
      });
    });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${servidor.address().port}/v1beta/openai`;
  });
  after(() => servidor.close());

  const configurar = (extra = {}) =>
    leerConfiguracionIA({ IA_PROVEEDOR: 'openai_compatible', IA_MODELO: 'gemini-3.8-flash', IA_API_KEY: 'clave', IA_URL_BASE: `${base}/`, IA_ESFUERZO: 'low', ...extra });
  const json = (status, datos) => (res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
  };

  test('envía modelo, clave, JSON Schema y esfuerzo; no envía temperature', async () => {
    const sugerencia = {
      categoria: 'hardware', prioridad: 'alta', area_responsable: 'soporte_ti', justificacion: 'El proyector no enciende antes de clase.',
      acciones_recomendadas: ['Revisar el cable de poder'], requiere_atencion_inmediata: true, confianza: 0.85,
    };
    responder = json(200, { model: 'gemini-3.8-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(sugerencia) } }] });
    const triaje = crearTriaje({ entorno: { IA_PROVEEDOR: 'openai_compatible', IA_MODELO: 'gemini-3.8-flash', IA_API_KEY: 'clave', IA_URL_BASE: base, IA_ESFUERZO: 'low' } });
    const resultado = await triaje.analizar({ titulo: 'Proyector', descripcion: 'No enciende el proyector del aula 101' });

    assert.equal(ultimaPeticion.ruta, '/v1beta/openai/chat/completions');
    assert.equal(ultimaPeticion.autorizacion, 'Bearer clave');
    assert.equal(ultimaPeticion.cuerpo.model, 'gemini-3.8-flash');
    assert.equal(ultimaPeticion.cuerpo.reasoning_effort, 'low');
    assert.equal(ultimaPeticion.cuerpo.response_format.type, 'json_schema');
    assert.deepEqual(ultimaPeticion.cuerpo.response_format.json_schema.schema, ESQUEMA_SUGERENCIA);
    assert.equal('temperature' in ultimaPeticion.cuerpo, false);
    assert.equal(resultado.sugerencia.categoria, 'hardware');
    assert.equal(resultado.validacion_reglas.cumple, true);
  });

  test('IA_FORMATO_JSON=ninguno no envía response_format', async () => {
    responder = json(200, { choices: [{ finish_reason: 'stop', message: { content: '{}' } }] });
    await solicitarCompatibleOpenAI({ config: configurar({ IA_FORMATO_JSON: 'ninguno' }), sistema: 's', usuario: 'u', esquema: ESQUEMA_SUGERENCIA });
    assert.equal('response_format' in ultimaPeticion.cuerpo, false);
  });

  test('clave inválida (Gemini responde 400 API_KEY_INVALID) -> credenciales', async () => {
    responder = json(400, [{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }]);
    await assert.rejects(
      solicitarCompatibleOpenAI({ config: configurar(), sistema: 's', usuario: 'u', esquema: ESQUEMA_SUGERENCIA }),
      (e) => e instanceof IAError && e.codigo === 'credenciales',
    );
  });

  test('429 -> límite del proveedor; respuesta cortada -> truncada', async () => {
    responder = json(429, { error: { message: 'Resource exhausted' } });
    await assert.rejects(solicitarCompatibleOpenAI({ config: configurar(), sistema: 's', usuario: 'u' }), (e) => e.codigo === 'limite_proveedor');
    responder = json(200, { choices: [{ finish_reason: 'length', message: { content: '{"categoria": "har' } }] });
    await assert.rejects(solicitarCompatibleOpenAI({ config: configurar(), sistema: 's', usuario: 'u' }), (e) => e.codigo === 'respuesta_truncada');
  });

  test('sin respuesta a tiempo -> tiempo_agotado', async () => {
    responder = (res) => setTimeout(() => json(200, { choices: [] })(res), 4000);
    const config = { ...configurar(), timeoutMs: 200 };
    await assert.rejects(solicitarCompatibleOpenAI({ config, sistema: 's', usuario: 'u' }), (e) => e.codigo === 'tiempo_agotado');
  });

  test('configuración: Gemini sin clave queda "no configurada"; modelo local sin clave sí vale', () => {
    assert.equal(configurar({ IA_API_KEY: '', IA_URL_BASE: 'https://generativelanguage.googleapis.com/v1beta/openai' }).configurada, false);
    assert.equal(leerConfiguracionIA({ IA_PROVEEDOR: 'openai_compatible', IA_MODELO: 'llama', IA_URL_BASE: 'http://127.0.0.1:11434/v1' }).configurada, true);
  });
});
