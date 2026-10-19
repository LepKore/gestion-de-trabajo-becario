import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'

// argon2id con parámetros por defecto de la librería (m=65536 KiB, t=3, p=4).
// En pruebas se Bajan los parámetros: las pruebas no necesitan resistencia.
const TEST_PARAMS = { memoryCost: 8192, timeCost: 1, parallelism: 1 }

let params
export function passwordParams(env = process.env) {
  if (params) return params
  params = env.NODE_ENV === 'test' ? TEST_PARAMS : undefined
  return params
}

export function hashPassword(password, env = process.env) {
  return argon2.hash(password, passwordParams(env))
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password)
  } catch {
    // Hash corrupto o de otro algoritmo: se trata como contraseña incorrecta.
    return false
  }
}

// Contraseña temporal: 12 caracteres de un alfabeto sin ambiguos. Suficiente
// frente a fuerza bruta y pensada para tipearse; no se deriva del usuario.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
export function generateTemporaryPassword(length = 12) {
  const bytes = randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i += 1) {
    password += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return password
}