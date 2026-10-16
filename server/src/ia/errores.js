// Fallos de la integración de IA, con un código estable y un mensaje que la
// interfaz muestra tal cual junto al botón de "clasificar manualmente".

const MENSAJES = {
  no_configurada: 'La IA no está configurada.',
  limite_local: 'Se alcanzó el límite de consultas a la IA por minuto. Espera un momento o clasifica manualmente.',
  tiempo_agotado: 'La IA no respondió a tiempo.',
  sin_conexion: 'No fue posible conectar con el servicio de IA.',
  credenciales: 'El servicio de IA rechazó las credenciales configuradas.',
  limite_proveedor: 'El proveedor de IA está limitando las solicitudes (rate limit).',
  proveedor_saturado: 'El modelo de IA está saturado en este momento (alta demanda). Suele ser temporal.',
  solicitud_rechazada: 'El proveedor de IA rechazó la solicitud.',
  rechazo_modelo: 'El modelo se negó a responder esta solicitud.',
  respuesta_truncada: 'La respuesta de la IA llegó incompleta.',
  respuesta_invalida: 'La IA devolvió una respuesta con formato inválido.',
  proveedor: 'El servicio de IA devolvió un error.',
};

const ESTADO_HTTP = {
  no_configurada: 503,
  limite_local: 429,
  tiempo_agotado: 504,
  sin_conexion: 503,
  limite_proveedor: 503,
  proveedor_saturado: 503,
};

export class IAError extends Error {
  constructor(codigo, detalle = '', extra = {}) {
    super(`${MENSAJES[codigo] ?? MENSAJES.proveedor}${detalle ? ` ${detalle}` : ''}`);
    this.name = 'IAError';
    this.codigo = codigo;
    this.status = ESTADO_HTTP[codigo] ?? 502;
    this.extra = extra;
  }
}
