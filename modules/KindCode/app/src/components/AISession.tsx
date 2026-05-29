/**
 * AISession — right-panel AI coding assistant.
 * Routes to the AI Workbench backend if available, otherwise shows a placeholder.
 * The assistant has context about the currently open file.
 */
import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, FileText } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  activeFile?: string
  activeContent?: string
}

const AI_WORKBENCH_URL = 'http://localhost:7860'

export default function AISession({ activeFile, activeContent }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'KindCode AI is ready. Open a file and ask me anything about it — or ask me to write, explain, or refactor code.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Build context prompt
    const context = activeFile
      ? `\n\n[Active file: ${activeFile}]\n\`\`\`\n${(activeContent ?? '').slice(0, 2000)}\n\`\`\``
      : ''
    const prompt = `${text}${context}`

    try {
      // Try AI Workbench API
      const res = await fetch(`${AI_WORKBENCH_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const reply = data.response ?? data.content ?? data.message ?? 'No response.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'AI Workbench is not reachable at localhost:7860. Start it with `ai-workbench` to enable AI assistance.',
      }])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Sparkles size={12} /> Assistant
      </div>

      {activeFile && (
        <div style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          fontSize: 10,
          color: 'var(--text-dim)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <FileText size={10} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeFile.split('/').pop()}
          </span>
        </div>
      )}

      <div className="ai-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ${msg.role}`} style={{ whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="ai-msg assistant" style={{ color: 'var(--text-dim)' }}>
            thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="ai-input-row">
        <textarea
          className="ai-input"
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about this file… (Enter to send)"
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          style={{ alignSelf: 'flex-end', padding: '6px 10px' }}
          onClick={send}
          disabled={loading || !input.trim()}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}
