import '@testing-library/jest-dom'

// Mock window.api (preload bridge) for renderer tests
const mockApi = {
  papers: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue('test-id'),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    importDoi: vi.fn().mockResolvedValue('test-id'),
    importPdf: vi.fn().mockResolvedValue('test-id'),
  },
  libraries: {
    list: vi.fn().mockResolvedValue([]),
    switch: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    onSwitched: vi.fn().mockReturnValue(() => {}),
  },
  schema: {
    get: vi.fn().mockResolvedValue({ version: 1, columns: [] }),
    addColumn: vi.fn().mockResolvedValue(undefined),
    removeColumn: vi.fn().mockResolvedValue(undefined),
    renameColumn: vi.fn().mockResolvedValue(undefined),
  },
  agent: {
    send: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockResolvedValue(null),
    setProfile: vi.fn().mockResolvedValue(undefined),
    saveKey: vi.fn().mockResolvedValue(undefined),
    testKey: vi.fn().mockResolvedValue(true),
    getProfiles: vi.fn().mockResolvedValue([]),
    onEvent: vi.fn().mockReturnValue(() => {}),
  },
  pdf: {
    getPath: vi.fn().mockResolvedValue(null),
  },
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true })
