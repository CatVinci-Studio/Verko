import type { IApi } from '@/lib/ipc'
import { ConversationStore } from '@shared/agent/conversationStore'
import { createProvider } from '@shared/agent/providers'
import { buildLibraryFacade } from '@/lib/libraryFacade'
import { buildAgentFacade } from '@/lib/agentFacade'
import { IpcBackend } from './backendIpc'
import { LibraryHost } from './libraryHost'
import { buildDesktopDispatch } from './desktopTools'
import type { IShellApi } from './shellApi'

const CONVERSATIONS_ROOT = 'conversations'
const TRANSCRIPTS_ROOT   = 'transcripts'

/**
 * Build the renderer-facing `IApi` for the desktop build.
 *
 * Library + Agent live in the renderer; the preload-bridged `fs:* / paths:*
 * / dialog:*` IPC carries only file bytes and OS-keychain values. Everything
 * else (papers, schema, collections, agent loop, conversation persistence)
 * runs locally.
 */
export function makeDesktopApi(preload: IShellApi): IApi {
  const host = new LibraryHost(preload)
  const convStore = new ConversationStore(new IpcBackend(preload, CONVERSATIONS_ROOT))
  const transcriptBackend = new IpcBackend(preload, TRANSCRIPTS_ROOT)

  const { dispatch, tools } = buildDesktopDispatch(preload, () => host.current())
  const toolDefs = Object.values(tools).map((h) => h.def)

  const lib = buildLibraryFacade(() => host.ensure())
  const ag = buildAgentFacade({
    store: convStore,
    config: {
      getConfig:     () => preload.agent.getConfig(),
      setProfile:    (name) => preload.agent.setProfile(name),
      updateProfile: (name, patch) => preload.agent.updateProfile(name, patch),
      saveKey:       (profile, key, remember) => preload.agent.saveKey(profile, key, remember),
      loadKey:       (profile) => preload.agent.loadKey(profile),
      testKey:       (profile) => preload.agent.testKey(profile),
      getProfiles:   () => preload.agent.getProfiles(),
    },
    ports: {
      async getProvider() {
        const cfg = await preload.agent.getConfig()
        if (!cfg) return null
        const profile = cfg.profiles.find((p) => p.name === cfg.defaultProfile)
        if (!profile) return null
        const apiKey = await preload.agent.loadKey(profile.name)
        if (!apiKey) return null
        const provider = createProvider({
          protocol: profile.protocol,
          baseUrl: profile.baseUrl,
          apiKey,
          model: profile.model,
        })
        return { provider, model: profile.model }
      },
      describeContext: async () => {
        const lib = await host.ensure()
        const base = host.describe()
        if (!lib) {
          return { ...base, paperCount: 0, collections: [], customColumns: [], skills: [] }
        }
        const refs = await lib.list()
        const collections = lib.listCollections()
        const customColumns = lib.schema().columns.map((c) => ({ name: c.name, type: c.type }))
        const skills = await lib.listSkills()
        return {
          ...base,
          paperCount: refs.length,
          collections,
          customColumns,
          skills,
        }
      },
      getTools: () => toolDefs,
      dispatchTool: dispatch,
      store: convStore,
      saveTranscript: async (convId, snapshot) => {
        const fname = `${convId}-${Date.now()}.json`
        try {
          await transcriptBackend.writeFile(fname, JSON.stringify(snapshot, null, 2))
          return fname
        } catch {
          return null
        }
      },
      maxTurns: 10,
      temperature: 0.3,
    },
  })

  // Override `papers.importPdf` with the desktop-specific dialog flow.
  const papers: IApi['papers'] = {
    ...lib.papers,
    importPdf: async () => {
      const l = await host.ensure()
      if (!l) throw new Error('No active library')
      const picked = await preload.dialog.openPdf()
      if (!picked) throw new Error('Cancelled')
      const id = await l.add({ title: picked.filename, tags: [] })
      await l.backend.writeFile(`attachments/${id}.pdf`, picked.bytes)
      await l.markPdfPresent(id)
      return id
    },
  }

  return {
    libraries: preload.libraries,
    papers,
    schema:        lib.schema,
    collections:   lib.collections,
    pdf:           lib.pdf,
    agent:         ag.agent,
    conversations: ag.conversations,
    fs:            preload.fs,
    paths:         { libraryRoot: preload.paths.libraryRoot },
    app:           preload.app,
    window:        preload.window,
    net:           preload.net,
  }
}
