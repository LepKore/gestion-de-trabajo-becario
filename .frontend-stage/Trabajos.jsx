import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { apiRequest } from '../lib/api.js'
import { useRecurso } from '../lib/useRecurso.js'
import { fechaUTC, fechaVisible, horasAMinutos, ZONA_UNIVERSITARIA } from '../lib/trabajos.js'
import { Alert, EmptyState, Field } from '../components/ui.jsx'

function Paginacion({ meta, cambiar }) {
  if (!meta || meta.totalPages <= 1) return null
  return <nav className="paginacion" aria-label="Paginación de resultados">
    <button className="button button--secondary" disabled={meta.page <= 1} onClick={() => cambiar(meta.page - 1)}>Anterior</button>
    <span>Página {meta.page} de {meta.totalPages} · {meta.total} resultados</span>
    <button className="button button--secondary" disabled={meta.page >= meta.totalPages} onClick={() => cambiar(meta.page + 1)}>Siguiente</button>
  </nav>
}
function EstadoCarga({ recurso, children }) {
  if (recurso.cargando) return <p role="status" className="loading">Cargando…</p>
  if (recurso.error) return <><Alert tipo="error">{recurso.error}</Alert><button className="button button--secondary" onClick={recurso.recargar}>Reintentar</button></>
  return children(recurso.respuesta)
}
function DatosTrabajo({ trabajo }) {
  return <>
    <p>{trabajo.estado} · {trabajo.faseTemporal.replaceAll('_', ' ')}</p>
    <p>{trabajo.ubicacion} · {trabajo.duracionMinutos / 60} horas acreditables</p>
    <p>Inicio: {fechaVisible(trabajo.inicioPrevisto)} · Fin: {fechaVisible(trabajo.finPrevisto)}</p>
    <p>{trabajo.cuposDisponibles} de {trabajo.cupos} cupos disponibles · {trabajo.aceptados} aceptados</p>
    <p>{trabajo.encargadoNombre} · {trabajo.contextoTipo} · {trabajo.contextoNombre}</p>
  </>
}
export function Trabajos({ modo = 'disponibles' }) {
  const [pagina, setPagina] = useState(1)
  const [q, setQ] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState(modo === 'disponibles' ? 'PUBLICADO' : '')
  const propios = modo === 'propios' || modo === 'postulantes'
  const recurso = useRecurso(propios ? '/me/jobs' : '/jobs', { page: pagina, pageSize: 20, q, estado })
  return <section className="panel">
    <header className="panel-head"><h2>{modo === 'postulantes' ? 'Elige un trabajo para gestionar sus postulantes' : propios ? 'Trabajos a tu cargo' : 'Consulta de trabajos'}</h2>
      {propios && <Link className="button button--primary" to="/mis-trabajos/nuevo">Publicar trabajo</Link>}
    </header>
    <p>Fechas en {ZONA_UNIVERSITARIA}. Una postulación pendiente no reserva cupo.</p>
    <form className="form-grid" onSubmit={(evento) => { evento.preventDefault(); setQ(busqueda.trim()); setPagina(1) }}>
      <Field label="Buscar trabajos" type="search" maxLength={100} value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} />
      <Field label="Estado">{(props) => <select {...props} value={estado} onChange={(evento) => { setEstado(evento.target.value); setPagina(1) }}><option value="">Todos</option><option value="PUBLICADO">Publicado</option><option value="CERRADO">Cerrado</option></select>}</Field>
      <button className="button button--secondary" type="submit">Buscar</button>
    </form>
    <EstadoCarga recurso={recurso}>{({ data, meta }) => <>
      {data.length === 0 ? <EmptyState title="Sin trabajos">No hay trabajos que coincidan con los filtros.</EmptyState> : data.map((trabajo) => <article className="panel" key={trabajo.id}>
        <h3><Link to={`/trabajos/${trabajo.id}`}>{trabajo.titulo}</Link></h3><DatosTrabajo trabajo={trabajo} />
        <Link className="button button--secondary" to={`/trabajos/${trabajo.id}`}>{propios ? 'Ver trabajo y postulantes' : 'Ver detalle'}</Link>
      </article>)}
      <Paginacion meta={meta} cambiar={setPagina} />
    </>}</EstadoCarga>
  </section>
}
export function DetalleTrabajo() {
  const { id } = useParams()
  const recurso = useRecurso(`/jobs/${id}`)
  return <EstadoCarga recurso={recurso}>{({ data }) => <DetalleContenido key={id} trabajo={data} recargar={recurso.recargar} />}</EstadoCarga>
}
function DetalleContenido({ trabajo, recargar }) {
  const { usuario } = useAuth()
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [postulado, setPostulado] = useState(false)
  const propio = usuario.rol === 'ENCARGADO' && usuario.id === trabajo.encargadoId
  const proximo = trabajo.estado === 'PUBLICADO' && trabajo.faseTemporal === 'PROXIMO'
  async function postular() {
    setOcupado(true); setError('')
    try { await apiRequest(`/jobs/${trabajo.id}/applications`, { metodo: 'POST', cuerpo: {} }); setPostulado(true) }
    catch (fallo) { setError(fallo.message) }
    finally { setOcupado(false) }
  }
  return <>
    <section className="panel"><header className="panel-head"><h2>{trabajo.titulo}</h2><Link to={usuario.rol === 'ADMIN' ? '/admin/trabajos' : propio ? '/mis-trabajos' : '/trabajos-disponibles'}>Volver a trabajos</Link></header>
      <p>{trabajo.descripcion}</p><DatosTrabajo trabajo={trabajo} /><p>Fechas en {ZONA_UNIVERSITARIA}.</p>
      <p>Una postulación pendiente no reserva cupo. Las decisiones son definitivas.</p>
      {error && <Alert tipo="error">{error}</Alert>}
      {postulado && <Alert conRol={false}>Postulación enviada. Consulta su estado en Mis postulaciones.</Alert>}
      {usuario.rol === 'BECARIO' && <><button className="button button--primary" disabled={ocupado || postulado || !proximo || trabajo.cuposDisponibles <= 0} onClick={postular}>{ocupado ? 'Enviando…' : 'Postularme'}</button> <Link to="/mis-postulaciones">Mis postulaciones</Link></>}
      {propio && (proximo && trabajo.aceptados === 0 ? <Link className="button button--secondary" to={`/mis-trabajos/${trabajo.id}/editar`}>Editar trabajo</Link> : <p>Las condiciones solo se pueden editar antes del inicio y antes de la primera aceptación.</p>)}
    </section>
    {propio && <Postulantes trabajo={trabajo} actualizarTrabajo={recargar} />}
  </>
}
function Postulantes({ trabajo, actualizarTrabajo }) {
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState('')
  const [decision, setDecision] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const recurso = useRecurso(`/jobs/${trabajo.id}/applications`, { page: pagina, pageSize: 20, estado })
  async function decidir() {
    setOcupado(true); setError('')
    try { await apiRequest(`/applications/${decision.id}/${decision.accion}`, { metodo: 'POST', cuerpo: {} }); setDecision(null); actualizarTrabajo() }
    catch (fallo) { setError(fallo.message); recurso.recargar() }
    finally { setOcupado(false) }
  }
  return <section className="panel"><h2>Postulantes</h2>
    <FiltroPostulacion estado={estado} cambiar={(valor) => { setEstado(valor); setPagina(1); setDecision(null) }} />
    {error && <Alert tipo="error">{error}</Alert>}
    {decision && <div className="alert alert--warning" role="alert"><p>Vas a {decision.accion === 'accept' ? 'aceptar' : 'rechazar'} a {decision.nombre}. Esta decisión no se puede revertir.</p><div className="row-actions">
      <button className="button button--primary" disabled={ocupado} onClick={decidir}>{decision.accion === 'accept' ? 'Confirmar aceptación' : 'Confirmar rechazo'}</button>
      <button className="button button--secondary" disabled={ocupado} onClick={() => setDecision(null)}>Cancelar</button>
    </div></div>}
    <EstadoCarga recurso={recurso}>{({ data, meta }) => <>
      {data.length === 0 ? <EmptyState title="Sin postulaciones">Todavía no hay postulaciones con este estado.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>Código</th><th>Carrera</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{data.map((item) => <tr key={item.id}>
        <th scope="row">{item.estudiante.nombre}</th><td>{item.estudiante.codigo}</td><td>{item.estudiante.carrera}</td><td>{item.estado}</td><td>
          {item.estado === 'PENDIENTE' && trabajo.estado === 'PUBLICADO' && <div className="row-actions">{['accept', 'reject'].map((accion) => <button key={accion} className="button button--secondary" disabled={ocupado || (accion === 'accept' && (trabajo.faseTemporal !== 'PROXIMO' || trabajo.cuposDisponibles <= 0))} aria-label={`${accion === 'accept' ? 'Aceptar' : 'Rechazar'} a ${item.estudiante.nombre}`} onClick={() => setDecision({ id: item.id, nombre: item.estudiante.nombre, accion })}>{accion === 'accept' ? 'Aceptar' : 'Rechazar'}</button>)}</div>}
        </td></tr>)}</tbody></table></div>}
      <Paginacion meta={meta} cambiar={setPagina} />
    </>}</EstadoCarga>
  </section>
}
function FiltroPostulacion({ estado, cambiar }) {
  return <Field label="Estado de postulación">{(props) => <select {...props} value={estado} onChange={(evento) => cambiar(evento.target.value)}><option value="">Todos</option>{['PENDIENTE', 'ACEPTADA', 'RECHAZADA'].map((valor) => <option key={valor}>{valor}</option>)}</select>}</Field>
}
export function MisPostulaciones() {
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState('')
  const recurso = useRecurso('/me/applications', { page: pagina, pageSize: 20, estado })
  return <section className="panel"><h2>Mis postulaciones</h2><p>Una postulación pendiente no reserva cupo. No hay retiro de postulaciones.</p>
    <FiltroPostulacion estado={estado} cambiar={(valor) => { setEstado(valor); setPagina(1) }} />
    <EstadoCarga recurso={recurso}>{({ data, meta }) => <>
      {data.length === 0 ? <EmptyState title="Sin postulaciones">Puedes consultar los trabajos disponibles para postularte.</EmptyState> : data.map((item) => <article className="panel" key={item.id}><h3><Link to={`/trabajos/${item.trabajoId}`}>{item.trabajo.titulo}</Link></h3><span className="status status--info">{item.estado}</span><DatosTrabajo trabajo={item.trabajo} /></article>)}
      <Paginacion meta={meta} cambiar={setPagina} />
    </>}</EstadoCarga>
  </section>
}
export function EditarTrabajo() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const recurso = useRecurso(`/jobs/${id}`)
  return <EstadoCarga recurso={recurso}>{({ data }) => usuario.id !== data.encargadoId || data.estado !== 'PUBLICADO' || data.faseTemporal !== 'PROXIMO' || data.aceptados > 0 ? <Alert tipo="warning">Este trabajo no se puede editar. Debe ser propio, no haber iniciado y no tener aceptados.</Alert> : <FormularioTrabajo key={id} trabajo={data} />}</EstadoCarga>
}
export function FormularioTrabajo({ trabajo }) {
  const navegar = useNavigate()
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function guardar(evento) {
    evento.preventDefault(); setError('')
    const valores = Object.fromEntries(new FormData(evento.currentTarget))
    let cuerpo
    try {
      cuerpo = { titulo: valores.titulo.trim(), descripcion: valores.descripcion.trim(), ubicacion: valores.ubicacion.trim(), inicioPrevisto: fechaUTC(valores.inicioPrevisto), finPrevisto: fechaUTC(valores.finPrevisto), duracionMinutos: horasAMinutos(valores.horas), cupos: Number(valores.cupos) }
      // Editar otro campo no trunca los segundos de un instante ya guardado.
      if (trabajo) for (const campo of ['inicioPrevisto', 'finPrevisto']) {
        if (valores[campo] === new Date(trabajo[campo]).toISOString().slice(0, 16)) cuerpo[campo] = trabajo[campo]
      }
      if (new Date(cuerpo.inicioPrevisto).getTime() <= Date.now()) throw new Error('El inicio debe estar en el futuro.')
      if (new Date(cuerpo.finPrevisto) <= new Date(cuerpo.inicioPrevisto)) throw new Error('El fin debe ser posterior al inicio.')
      if (!Number.isSafeInteger(cuerpo.cupos) || cuerpo.cupos < 1) throw new Error('Los cupos deben ser un entero positivo.')
    } catch (fallo) { setError(fallo.message); return }
    setOcupado(true)
    try {
      const respuesta = await apiRequest(trabajo ? `/jobs/${trabajo.id}` : '/jobs', { metodo: trabajo ? 'PATCH' : 'POST', cuerpo })
      navegar(`/trabajos/${respuesta.data.id}`)
    } catch (fallo) { setError(fallo.message); setOcupado(false) }
  }
  return <section className="panel"><h2>{trabajo ? 'Editar trabajo' : 'Publicar trabajo'}</h2><p>Introduce las fechas en UTC. Al consultar se muestran en {ZONA_UNIVERSITARIA}. La duración acreditable es independiente del intervalo de fechas.</p>
    {error && <Alert tipo="error">{error}</Alert>}
    <form onSubmit={guardar}><fieldset disabled={ocupado} style={{ border: 0, padding: 0, minWidth: 0 }}><legend>Condiciones del trabajo</legend><div className="form-grid">
      <Field label="Título" name="titulo" required minLength={3} maxLength={120} defaultValue={trabajo?.titulo || ''} />
      <Field label="Ubicación" name="ubicacion" required minLength={2} maxLength={200} defaultValue={trabajo?.ubicacion || ''} />
      <Field label="Descripción">{(props) => <textarea {...props} name="descripcion" required minLength={3} maxLength={4000} rows={4} defaultValue={trabajo?.descripcion || ''} />}</Field>
      <Field label="Duración acreditable (horas)" name="horas" inputMode="decimal" required hint="Máximo un decimal: 4,6 horas equivale a 276 minutos." defaultValue={trabajo ? String(trabajo.duracionMinutos / 60) : ''} />
      <Field label="Inicio previsto (UTC)" name="inicioPrevisto" type="datetime-local" required defaultValue={trabajo ? new Date(trabajo.inicioPrevisto).toISOString().slice(0, 16) : ''} />
      <Field label="Fin previsto (UTC)" name="finPrevisto" type="datetime-local" required defaultValue={trabajo ? new Date(trabajo.finPrevisto).toISOString().slice(0, 16) : ''} />
      <Field label="Cupos" name="cupos" type="number" min="1" max="2147483647" step="1" required defaultValue={trabajo?.cupos || ''} />
    </div><div className="row-actions"><button className="button button--primary" type="submit">{ocupado ? 'Guardando…' : trabajo ? 'Guardar cambios' : 'Publicar trabajo'}</button><Link to={trabajo ? `/trabajos/${trabajo.id}` : '/mis-trabajos'}>Cancelar</Link></div></fieldset></form>
  </section>
}
