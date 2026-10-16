// Normalización de texto compartida por el importador y las validaciones.

export function sinTildes(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// "Cubículo  En Mantenimiento" -> "cubiculo_en_mantenimiento"
export function claveNormalizada(texto) {
  return sinTildes(String(texto ?? ''))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function limpiarTexto(valor, maximo = 500) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s+/g, ' ').trim().slice(0, maximo);
}

// Texto largo (descripciones): conserva saltos de línea pero recorta espacios.
export function limpiarTextoLargo(valor, maximo = 4000) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, maximo);
}

// Identificadores de espacios y equipos: código legible, sin espacios ni símbolos raros.
export const PATRON_IDENTIFICADOR = /^[A-Za-z0-9][A-Za-z0-9_.\-]{0,39}$/;

export function esIdentificadorValido(id) {
  return PATRON_IDENTIFICADOR.test(String(id ?? ''));
}
