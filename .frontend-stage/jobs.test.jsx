import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiRequest } from '../src/lib/api.js'
import { horasAMinutos } from '../src/lib/trabajos.js'
import { DetalleTrabajo, FormularioTrabajo, Trabajos } from '../src/pages/Trabajos.jsx'

vi.mock('../src/lib/api.js', () => ({ apiRequest: vi.fn() }))
vi.mock('../src/auth/useAuth.js', () => ({ useAuth: () => ({ usuario: { id: 'owner', rol: rolActual } }) }))
let rolActual = 'ENCARGADO'
const trabajo = { id: 'job', encargadoId: 'owner', titulo: 'Apoyo biblioteca', descripcion: 'Ordenar libros', ubicacion: 'Biblioteca', inicioPrevisto: '2099-10-20T12:00:00Z', finPrevisto: '2099-10-20T18:00:00Z', duracionMinutos: 276, cupos: 1, cuposDisponibles: 1, aceptados: 0, estado: 'PUBLICADO', faseTemporal: 'PROXIMO', encargadoNombre: 'Ana', contextoNombre: 'Biblioteca' }
const lista = (data, page = 1, totalPages = 1) => ({ data, meta: { page, pageSize: 20, total: data.length, totalPages } })
function montar(elemento, ruta = '/') { return render(<MemoryRouter initialEntries={[ruta]}><Routes><Route path="/" element={elemento} /><Route path="/trabajos/:id" element={<DetalleTrabajo />} /></Routes></MemoryRouter>) }
beforeEach(() => { vi.resetAllMocks(); rolActual = 'ENCARGADO' })
afterEach(cleanup)
describe('Duración exacta', () => {
  it('admite coma y convierte décimas sin redondear', () => {
    expect(horasAMinutos('4,6')).toBe(276)
    expect(horasAMinutos('0.1')).toBe(6)
    for (const valor of ['3.61', '0', '-1', '1e2', 'Infinity']) expect(() => horasAMinutos(valor)).toThrow()
  })
})
it('publica convirtiendo horas y fechas UTC', async () => {
  apiRequest.mockResolvedValue({ data: trabajo })
  montar(<FormularioTrabajo />)
  for (const [label, value] of [['Título', 'Apoyo biblioteca'], ['Descripción', 'Ordenar libros'], ['Ubicación', 'Biblioteca'], ['Inicio previsto (UTC)', '2099-10-20T12:00'], ['Fin previsto (UTC)', '2099-10-20T18:00'], ['Duración acreditable (horas)', '4,6'], ['Cupos', '1']]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Publicar trabajo' }))
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/jobs', expect.objectContaining({ metodo: 'POST', cuerpo: expect.objectContaining({ duracionMinutos: 276, inicioPrevisto: '2099-10-20T12:00:00.000Z' }) })))
})
it('pagina trabajos y muestra el fallo del servidor', async () => {
  apiRequest.mockResolvedValueOnce(lista([trabajo], 1, 2)).mockRejectedValueOnce(new Error('Sin conexión'))
  montar(<Trabajos modo="propios" />)
  await screen.findByText('Apoyo biblioteca')
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  await screen.findByText('Sin conexión')
  expect(apiRequest).toHaveBeenLastCalledWith('/me/jobs', expect.objectContaining({ query: expect.objectContaining({ page: 2 }) }))
})
it('becario postula sin reservar cupo y muestra conflicto', async () => {
  rolActual = 'BECARIO'
  apiRequest.mockResolvedValueOnce({ data: trabajo }).mockRejectedValueOnce(new Error('Ya tienes una postulación'))
  montar(null, '/trabajos/job')
  fireEvent.click(await screen.findByRole('button', { name: 'Postularme' }))
  await screen.findByText('Ya tienes una postulación')
  expect(screen.getByText(/pendiente no reserva cupo/)).toBeInTheDocument()
  expect(apiRequest).toHaveBeenCalledWith('/jobs/job/applications', { metodo: 'POST', cuerpo: {} })
})
it('propietario confirma una aceptación irreversible', async () => {
  const postulacion = { id: 'app', estado: 'PENDIENTE', estudiante: { nombre: 'Luis', codigo: '00123', carrera: 'Sistemas' } }
  apiRequest.mockImplementation(async (ruta, opciones) => {
    if (ruta === '/jobs/job') return { data: trabajo }
    if (ruta === '/jobs/job/applications') return lista([postulacion])
    if (opciones?.metodo === 'POST') return { data: { ...postulacion, estado: 'ACEPTADA' } }
  })
  montar(null, '/trabajos/job')
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar a Luis' }))
  expect(apiRequest).not.toHaveBeenCalledWith('/applications/app/accept', expect.anything())
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar aceptación' }))
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/applications/app/accept', { metodo: 'POST', cuerpo: {} }))
})
it('administrador consulta sin acciones ni datos de postulantes', async () => {
  rolActual = 'ADMIN'
  apiRequest.mockResolvedValue({ data: trabajo })
  montar(null, '/trabajos/job')
  await screen.findByText('Apoyo biblioteca')
  expect(screen.queryByRole('button', { name: 'Postularme' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Editar trabajo' })).not.toBeInTheDocument()
  expect(apiRequest).toHaveBeenCalledTimes(1)
})
it('edita conservando los segundos y refleja conflicto de una aceptación concurrente', async () => {
  apiRequest.mockRejectedValue(new Error('El trabajo tiene aceptaciones y sus condiciones son fijas.'))
  montar(<FormularioTrabajo trabajo={{ ...trabajo, inicioPrevisto: '2099-10-20T12:00:35Z' }} />)
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Título actualizado' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await screen.findByText('El trabajo tiene aceptaciones y sus condiciones son fijas.')
  expect(apiRequest).toHaveBeenCalledWith('/jobs/job', expect.objectContaining({ metodo: 'PATCH', cuerpo: expect.objectContaining({ titulo: 'Título actualizado', inicioPrevisto: '2099-10-20T12:00:35Z' }) }))
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
})
