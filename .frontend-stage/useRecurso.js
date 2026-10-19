import { useEffect, useState } from 'react'
import { apiRequest } from './api.js'

// Descarta respuestas antiguas al navegar, filtrar o desmontar.
export function useRecurso(ruta, query = {}) {
  const [revision, setRevision] = useState(0)
  const clave = JSON.stringify([ruta, query, revision])
  const [estado, setEstado] = useState(null)
  useEffect(() => {
    let vigente = true
    const [url, parametros] = JSON.parse(clave)
    apiRequest(url, { query: parametros }).then(
      (respuesta) => { if (vigente) setEstado({ clave, respuesta }) },
      (error) => { if (vigente) setEstado({ clave, error: error.message }) },
    )
    return () => { vigente = false }
  }, [clave])
  return { ...(estado?.clave === clave ? estado : {}), cargando: estado?.clave !== clave, recargar: () => setRevision((valor) => valor + 1) }
}
