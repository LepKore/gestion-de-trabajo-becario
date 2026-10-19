import pg from 'pg'

const { Client } = pg
const databaseName = 'mibeca_test'
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL es obligatoria para crear la base de pruebas')
}

const adminUrl = new URL(connectionString)
adminUrl.pathname = '/postgres'

const client = new Client({
  connectionString: adminUrl.toString(),
})

try {
  await client.connect()
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName])
  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE ${databaseName}`)
    console.log(`Base de pruebas creada: ${databaseName}`)
  } else {
    console.log(`Base de pruebas ya existe: ${databaseName}`)
  }
} finally {
  await client.end()
}
