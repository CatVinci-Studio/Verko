import { useRef, useCallback, useEffect } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view'
import { bracketMatching } from '@codemirror/language'
import { debounce } from '@/lib/utils'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onSave?: (value: string) => void
}

// Custom theme extending One Dark
const customTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#0f0f0f',
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
    fontSize: '13px',
  },
  '.cm-content': {
    padding: '16px 20px',
    minHeight: '100%',
    caretColor: '#5b8ef0',
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
    lineHeight: '1.7',
  },
  '.cm-focused': { outline: 'none' },
  '.cm-editor': { height: '100%' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
  '.cm-gutters': {
    backgroundColor: '#0f0f0f',
    borderRight: '1px solid #1e1e1e',
    color: '#3a3a3a',
    userSelect: 'none',
  },
  '.cm-activeLineGutter': { backgroundColor: '#161616' },
  '.cm-activeLine': { backgroundColor: '#161616' },
  '.cm-line': { padding: '0 4px' },
  '.cm-cursor': { borderLeftColor: '#5b8ef0', borderLeftWidth: '2px' },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#5b8ef0' },
  '.cm-selectionBackground': { backgroundColor: '#1e2a3a !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: '#1e2a3a' },
  '.cm-matchingBracket': { color: '#5b8ef0', fontWeight: 'bold' },
})

export function MarkdownEditor({ value, onChange, onSave }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)

  // Debounced save
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce((v: string) => onSave?.(v), 500),
    [onSave]
  )

  useEffect(() => {
    if (!containerRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          onSave?.(view.state.doc.toString())
          return true
        },
      },
    ])

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        bracketMatching(),
        markdown(),
        oneDark,
        customTheme,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        saveKeymap,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            const newVal = update.state.doc.toString()
            valueRef.current = newVal
            onChange(newVal)
            debouncedSave(newVal)
          }
        }),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only create editor once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update editor content if value changes externally
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value && valueRef.current !== value) {
      valueRef.current = value
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ userSelect: 'text' }}
    />
  )
}
