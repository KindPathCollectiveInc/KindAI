/**
 * Terminal — WebSocket-backed terminal panel.
 * Commands are sent to the backend which executes them in a shell
 * and streams output back.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal as TermIcon, X, Plus } from 'lucide-react'

interface OutputLine {
  text: string
  type: 'input' | 'output' | 'error' | 'info'
}

interface Props {
  cwd?: string
}

export default function TerminalPanel({ cwd }: Props) {
  const [lines, setLines] = useState<OutputLine[]>([
    { text: 'KindCode terminal — type commands below', type: 'info' },
  ])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  const appendLine = useCallback((text: string, type: OutputLine['type']) => {
    setLines(prev => [...prev, { text, type }])
    setTimeout(() => {
      if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
    }, 20)
  }, [])

  useEffect(() => {
    const wsUrl = window.location.hostname === 'localhost'
      ? `ws://localhost:7876/ws/terminal`
      : `ws://${window.location.host}/ws/terminal`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      appendLine('Connected.', 'info')
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'output') {
          const text = msg.data.trimEnd()
          if (text) appendLine(text, 'output')
        } else if (msg.type === 'error') {
          appendLine(msg.data, 'error')
        }
      } catch {
        appendLine(e.data, 'output')
      }
    }
    ws.onclose = () => {
      setConnected(false)
      appendLine('Disconnected.', 'info')
    }
    ws.onerror = () => appendLine('Connection error.', 'error')

    return () => ws.close()
  }, [appendLine])

  function sendCmd() {
    const cmd = input.trim()
    if (!cmd || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    appendLine(`$ ${cmd}`, 'input')
    setHistory(prev => [cmd, ...prev.slice(0, 49)])
    setHistIdx(-1)
    wsRef.current.send(JSON.stringify({ cmd, cwd: cwd || '~' }))
    setInput('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); sendCmd() }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(idx)
      setInput(history[idx] ?? '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = Math.max(histIdx - 1, -1)
      setHistIdx(idx)
      setInput(idx === -1 ? '' : history[idx] ?? '')
    }
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <TermIcon size={11} />
        <span>TERMINAL</span>
        <span style={{ marginLeft: 8, fontSize: 10, color: connected ? 'var(--green)' : 'var(--red)' }}>
          {connected ? '● live' : '● offline'}
        </span>
      </div>

      <div className="terminal-output" ref={outputRef}>
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'error' ? 'line-err' :
              line.type === 'input' ? '' :
              line.type === 'info' ? '' : ''
            }
            style={{
              color: line.type === 'error' ? 'var(--red)'
                : line.type === 'input' ? 'var(--primary)'
                : line.type === 'info' ? 'var(--text-dim)'
                : '#ccc',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {line.text}
          </div>
        ))}
      </div>

      <div className="terminal-input-row">
        <span className="terminal-prompt">$</span>
        <input
          className="terminal-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="type a command…"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
