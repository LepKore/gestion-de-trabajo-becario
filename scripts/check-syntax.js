import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `npm run check`: valida la sintaxis de todo el JavaScript del proyecto para
// que un error no llegue al arranque ni a las pruebas. Incluye el tooling local
// (`.opencode`, `.codex`) para que un plugin o puente roto se detecte aqui.
const roots = ['src', 'scripts', 'test', '.opencode', '.codex']
const base = fileURLToPath(new URL('../', import.meta.url))

async function collect(dir, found = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return found
    throw error
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await collect(full, found)
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) found.push(full)
  }
  return found
}

const files = []
for (const root of roots) files.push(...(await collect(join(base, root))))
if (files.length === 0) {
  console.error('No se encontró JavaScript para comprobar')
  process.exit(1)
}

// --check procesa un solo archivo por proceso; pasar todos solo comprueba el primero.
for (const file of files) {
  const code = await new Promise((resolve, reject) => {
    spawn(process.execPath, ['--check', file], { stdio: 'inherit' })
      .on('error', reject).on('exit', resolve)
  })
  if (code !== 0) process.exit(code ?? 1)
}
console.log(`Sintaxis correcta en ${files.length} archivos.`)
