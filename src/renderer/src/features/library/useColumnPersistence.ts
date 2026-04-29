import { useEffect, useRef, useState } from 'react'
import type {
  ColumnSizingState,
  VisibilityState,
} from '@tanstack/react-table'

const KEY_PREFIX = 'verko:column-state:'

interface ColumnState {
  sizing: ColumnSizingState
  visibility: VisibilityState
}

function readState(libraryName: string | null): ColumnState {
  if (!libraryName) return { sizing: {}, visibility: {} }
  try {
    const raw = localStorage.getItem(KEY_PREFIX + libraryName)
    if (!raw) return { sizing: {}, visibility: {} }
    const parsed = JSON.parse(raw) as Partial<ColumnState>
    return {
      sizing: parsed.sizing ?? {},
      visibility: parsed.visibility ?? {},
    }
  } catch {
    return { sizing: {}, visibility: {} }
  }
}

function writeState(libraryName: string | null, state: ColumnState): void {
  if (!libraryName) return
  try {
    localStorage.setItem(KEY_PREFIX + libraryName, JSON.stringify(state))
  } catch {
    // localStorage full or blocked — ignore
  }
}

/**
 * Per-library, localStorage-backed column sizing and visibility state.
 *
 * Sizing and visibility are scoped to the active library so that schemas
 * and user preferences for one library don't bleed into another. The
 * library schema itself stays untouched (CSV + Markdown remain a clean
 * data layer for the agent).
 */
export function useColumnPersistence(libraryName: string | null) {
  const [sizing, setSizing] = useState<ColumnSizingState>(() => readState(libraryName).sizing)
  const [visibility, setVisibility] = useState<VisibilityState>(() => readState(libraryName).visibility)

  // Reload when active library changes
  const lastLibrary = useRef(libraryName)
  useEffect(() => {
    if (lastLibrary.current === libraryName) return
    lastLibrary.current = libraryName
    const next = readState(libraryName)
    setSizing(next.sizing)
    setVisibility(next.visibility)
  }, [libraryName])

  // Persist on change
  useEffect(() => {
    writeState(libraryName, { sizing, visibility })
  }, [libraryName, sizing, visibility])

  return { sizing, setSizing, visibility, setVisibility }
}
