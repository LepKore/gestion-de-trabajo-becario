// Contrato backend OpenAPI 1.1.0 (borrador no fijado).
export const ZONA_UNIVERSITARIA = import.meta.env.VITE_TIME_ZONE || 'America/La_Paz'
export function horasAMinutos(valor) {
  const texto = String(valor).trim().replace(',', '.')
  if (!/^\d+(?:\.\d)?$/.test(texto)) throw new Error('Introduce horas positivas con un máximo de un decimal.')
  const [entero, decimal = '0'] = texto.split('.')
  const minutos = (Number(entero) * 10 + Number(decimal)) * 6
  if (!Number.isSafeInteger(minutos) || minutos <= 0 || minutos > 2147483647) throw new Error('La duración debe ser positiva y estar dentro del rango permitido.')
  return minutos
}
export function fechaVisible(valor) {
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA_UNIVERSITARIA }).format(new Date(valor))
}
export function fechaUTC(valor) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) throw new Error('Completa las fechas UTC.')
  const fecha = new Date(`${valor}:00Z`)
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 16) !== valor) throw new Error('La fecha no es válida.')
  return fecha.toISOString()
}
