// Arranque local del primer administrador.
//
// El script es idempotente: solo crea la cuenta si la base de datos no tiene
// ningún administrador activo. Nunca sobrescribe una cuenta existente. Si
// BOOTSTRAP_ADMIN_PASSWORD está vacío se genera una contraseña temporal y se
// muestra una sola vez por consola.
//jdncjdncndjcnjdnc
// Uso: npm run db:bootstrap-admin
//
// Variables (solo lectura, en .env):
//   BOOTSTRAP_ADMIN_NOMBRE    nombre completo del administrador inicial
//   BOOTSTRAP_ADMIN_CORREO    correo institucional; puede cambiarse después por SQL
//   BOOTSTRAP_ADMIN_PASSWORD  contraseña inicial; vacío = generar temporal
//
// Tras el primer ingreso, cambia la contraseña desde la aplicación o con SQL:
//   UPDATE usuarios SET nombre = '...', correo = '...', password_hash = '<argon2id>', requiere_cambio_password = true WHERE rol = 'ADMIN';
import pg from 'pg'
import { hashPassword } from '../src/lib/passwords.js'
import { crearUsuario } from '../src/services/users.js'

const { Pool } = pg

function valor(ambiente, nombre) {
  const raw = ambiente[nombre]
  return typeof raw === 'string' ? raw.trim() : ''
}

async function main() {
  const ambiente = process.env
  const nombre = valor(ambiente, 'BOOTSTRAP_ADMIN_NOMBRE')
  const correo = valor(ambiente, 'BOOTSTRAP_ADMIN_CORREO')
  const password = valor(ambiente, 'BOOTSTRAP_ADMIN_PASSWORD')

  if (!correo) {
    throw new Error('Falta BOOTSTRAP_ADMIN_CORREO en el entorno (.env).')
  }

  const pool = new Pool({ connectionString: ambiente.DATABASE_URL, max: 1 })
  try {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS total FROM usuarios WHERE rol = 'ADMIN' AND activo",
    )
    if (rows[0].total > 0) {
      console.log('Ya existe un administrador activo: no se creó ninguna cuenta.')
      console.log('Para cambiar el administrador, usa SQL sobre la tabla usuarios.')
      return
    }

    const datos = {
      nombre: nombre || 'Administración MiBeca',
      correo,
      rol: 'ADMIN',
    }
    if (password) datos.passwordInicial = password

    const { usuario, passwordTemporal, passwordGenerada } = await crearUsuario(pool, datos, ambiente)

    console.log('Administrador creado:')
    console.log(`  id:     ${usuario.id}`)
    console.log(`  correo: ${usuario.correo}`)
    if (passwordGenerada) {
      console.log(`  contraseña temporal (se muestra una vez): ${passwordTemporal}`)
    } else {
      console.log('  contraseña: la definida en BOOTSTRAP_ADMIN_PASSWORD (cámbiala al ingresar)')
    }
    console.log('El cambio de contraseña es obligatorio en el primer ingreso.')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(`No fue posible crear el administrador: ${error.message}`)
  process.exitCode = 1
})