import { mkdir } from 'fs/promises'
import Store from 'electron-store'
import { Library } from './store'
import { LocalBackend } from './backendLocal'
import type { LibraryConfig, LibraryInfo } from '@shared/types'

const store = new Store<{ config: LibraryConfig }>({
  name: 'libraries',
  defaults: {
    config: {
      libraries: [],
      active: ''
    }
  }
})

export class LibraryManager {
  private cache = new Map<string, Library>()

  // ── Setup ───────────────────────────────────────────────────────────────

  static async init(defaultPath: string): Promise<LibraryManager> {
    const mgr = new LibraryManager()
    const cfg = store.get('config')

    if (cfg.libraries.length === 0) {
      // First run: create default library
      await mkdir(defaultPath, { recursive: true })
      const info = { name: 'My Library', path: defaultPath, createdAt: new Date().toISOString() }
      store.set('config', { libraries: [info], active: info.name })
    }

    // Pre-open active library
    await mgr._openLib(mgr._config().active)
    return mgr
  }

  // ── Active library ──────────────────────────────────────────────────────

  get active(): Library {
    const name = this._config().active
    const lib = this.cache.get(name)
    if (!lib) throw new Error(`Library "${name}" not loaded`)
    return lib
  }

  get activeName(): string {
    return this._config().active
  }

  // ── List ────────────────────────────────────────────────────────────────

  async list(): Promise<LibraryInfo[]> {
    const cfg = this._config()
    return Promise.all(
      cfg.libraries.map(async (l) => {
        const lib = await this._openLib(l.name)
        const refs = await lib.list()
        return {
          ...l,
          active: l.name === cfg.active,
          paperCount: refs.length
        }
      })
    )
  }

  // ── Switch ──────────────────────────────────────────────────────────────

  async switch(name: string): Promise<void> {
    this._assertExists(name)
    await this._openLib(name)
    const cfg = this._config()
    store.set('config', { ...cfg, active: name })
  }

  // ── Add existing folder ─────────────────────────────────────────────────

  async add(name: string, path: string): Promise<LibraryInfo> {
    this._assertUnique(name)
    const be = new LocalBackend(path)
    await be.ensureRoot()
    const lib = await Library.open(be)
    this.cache.set(name, lib)
    const cfg = this._config()
    const info = { name, path, createdAt: new Date().toISOString() }
    store.set('config', { ...cfg, libraries: [...cfg.libraries, info] })
    const refs = await lib.list()
    return { ...info, active: cfg.active === name, paperCount: refs.length }
  }

  // ── Create new library ──────────────────────────────────────────────────

  async create(name: string, path: string): Promise<LibraryInfo> {
    this._assertUnique(name)
    await mkdir(path, { recursive: true })
    return this.add(name, path)
  }

  // ── Remove (unregister only, no file deletion) ──────────────────────────

  remove(name: string): void {
    const cfg = this._config()
    if (cfg.active === name) throw new Error('Cannot remove the active library. Switch first.')
    this.cache.delete(name)
    store.set('config', {
      ...cfg,
      libraries: cfg.libraries.filter((l) => l.name !== name)
    })
  }

  // ── Rename ──────────────────────────────────────────────────────────────

  rename(oldName: string, newName: string): void {
    this._assertExists(oldName)
    this._assertUnique(newName)
    const cfg = this._config()
    const lib = this.cache.get(oldName)
    if (lib) { this.cache.set(newName, lib); this.cache.delete(oldName) }
    store.set('config', {
      libraries: cfg.libraries.map((l) => l.name === oldName ? { ...l, name: newName } : l),
      active: cfg.active === oldName ? newName : cfg.active
    })
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async _openLib(name: string): Promise<Library> {
    if (this.cache.has(name)) return this.cache.get(name)!
    const cfg = this._config()
    const info = cfg.libraries.find((l) => l.name === name)
    if (!info) throw new Error(`Library "${name}" not found`)
    const be = new LocalBackend(info.path)
    await be.ensureRoot()
    const lib = await Library.open(be)
    this.cache.set(name, lib)
    return lib
  }

  private _config(): LibraryConfig { return store.get('config') }

  private _assertExists(name: string): void {
    if (!this._config().libraries.find((l) => l.name === name))
      throw new Error(`Library "${name}" not found`)
  }

  private _assertUnique(name: string): void {
    if (this._config().libraries.find((l) => l.name === name))
      throw new Error(`Library "${name}" already exists`)
  }
}
