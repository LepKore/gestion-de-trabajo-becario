import { createInterface } from 'node:readline/promises'
import { createPool, isSupabaseHost } from '../src/db.js'
import { crearUsuario } from '../src/services/users.js'

// Alta del primer administrador. Es interactivo a propósito: nunca se ejecuta
// dentro de una migración, en CI ni con credenciales por defecto. La contraseña
// temporal se imprime una sola vez y debe entregarse en persona.
const url = new URL(process.env.DATABASE_URL || 'postgresql://missing:missing@invalid/missing')
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function assertDestinoPermitido() {
  const target = process.env.MIGRATION_TARGET
  if (target !== 'local' && target !== 'supabase' && target !== 'render') {
    throw new Error('Define MIGRATION_TARGET=local, supabase o render antes de crear el administrador')
  }
  if (target === 'supabase') {
    if (localHosts.has(url.hostname) || !isSupabaseHost(url.hostname)) {
      throw new Error('MIGRATION_TARGET=supabase requiere un host de Supabase')
    }
    if (process.env.MIGRATION_CONFIRM_HOST !== url.hostname) {
      throw new Error('Alta remota requiere MIGRATION_CONFIRM_HOST igual al host de DATABASE_URL')
    }
  }
  if (target !== 'local' && localHosts.has(url.hostname)) {
    throw new Error(`MIGRATION_TARGET=${target} no admite una base local`)
  }
}

async function main() {
  assertDestinoPermitido()
  console.log(`Destino del alta: ${url.hostname}/${url.pathname.slice(1)}`)
  console.log('No hay credenciales por defecto: la contraseña se genera ahora y se muestra una vez.')

  const readline = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const nombre = (await readline.question('Nombre completo del administrador: ')).trim()
    const correo = (await readline.question('Correo institucional: ')).trim().toLowerCase()
    if (nombre.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error('Correo inválido')
    const confirmacion = (await readline.question(`Confirmar alta de ${correo} (escribe SI): `)).trim()
    if (confirmacion !== 'SI') {
      console.log('Operación cancelada; no se creó ninguna cuenta.')
      return
    }

    const pool = createPool()
    try {
      const { usuario, passwordTemporal } = await crearUsuario(pool, {
        nombre,
        correo,
        rol: 'ADMIN',
        actorId: null,
      })
      console.log(`Administrador creado: ${usuario.id}`)
      console.log(`Correo: ${usuario.correo}`)
      console.log(`Contraseña temporal (se muestra una sola vez): ${passwordTemporal}`)
      console.log('Entréguela en persona: el usuario deberá cambiarla al entrar.')
    } finally {
      await pool.end()
    }
  } finally {
    readline.close()
  }
}

main().catch((error) => {
  console.error(`No se pudo crear el administrador: ${error.message}`)
  process.exit(1)
})