import type { S3BackendConfig as S3Creds } from '@shared/paperdb/backendS3'

/**
 * Single-record credential store backed by IndexedDB. Origin-scoped, so
 * different deployments don't share state. We only ever store one library's
 * creds at a time in the web build — multi-library is a desktop-only feature.
 */
const DB = 'verko-web'
const STORE = 'creds'
const KEY = 'active'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadCreds(): Promise<S3Creds | null> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve((req.result as S3Creds | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function saveCreds(creds: S3Creds): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(creds, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearCreds(): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
