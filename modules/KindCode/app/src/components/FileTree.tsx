/**
 * FileTree — navigable directory browser.
 * Shows directories and files; calls onOpenFile when a file is clicked.
 */
import { useState, useEffect } from 'react'
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Home } from 'lucide-react'

interface FSItem {
  name: string
  path: string
  type: 'file' | 'directory'
}

interface TreeNode extends FSItem {
  children?: TreeNode[]
  open?: boolean
}

interface Props {
  onOpenFile: (path: string, name: string) => void
  activeFile?: string
}

export default function FileTree({ onOpenFile, activeFile }: Props) {
  const [rootPath, setRootPath] = useState('')
  const [nodes, setNodes] = useState<TreeNode[]>([])

  async function loadDir(path: string): Promise<TreeNode[]> {
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.items || []).map((item: FSItem) => ({ ...item }))
  }

  useEffect(() => {
    fetch('/api/files')
      .then(r => r.json())
      .then(async data => {
        setRootPath(data.path)
        const items = (data.items || []).map((item: FSItem) => ({ ...item }))
        setNodes(items)
      })
      .catch(() => {})
  }, [])

  async function toggleDir(node: TreeNode, idx: number) {
    if (node.type !== 'directory') return
    if (node.open) {
      setNodes(prev => prev.map((n, i) => i === idx ? { ...n, open: false, children: undefined } : n))
      return
    }
    const children = await loadDir(node.path)
    setNodes(prev => prev.map((n, i) => i === idx ? { ...n, open: true, children } : n))
  }

  function renderNodes(items: TreeNode[], depth = 0, parentKey = '') {
    return items.map((node, i) => {
      const key = `${parentKey}-${i}`
      const indent = depth * 14
      return (
        <div key={key}>
          <div
            className={`tree-item ${node.type === 'directory' ? 'dir' : ''} ${activeFile === node.path ? 'active' : ''}`}
            style={{ paddingLeft: `${14 + indent}px` }}
            onClick={() => {
              if (node.type === 'directory') {
                toggleDir(node, i)
              } else {
                onOpenFile(node.path, node.name)
              }
            }}
          >
            <span style={{ flexShrink: 0 }}>
              {node.type === 'directory'
                ? (node.open
                    ? <><ChevronDown size={12} /><FolderOpen size={13} style={{ color: '#fbbf24' }} /></>
                    : <><ChevronRight size={12} /><Folder size={13} style={{ color: '#fbbf24' }} /></>)
                : <FileText size={13} style={{ color: 'var(--text-dim)' }} />}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
          </div>
          {node.open && node.children && (
            <div>{renderNodes(node.children, depth + 1, key)}</div>
          )}
        </div>
      )
    })
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Home size={10} /> EXPLORER
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '4px 14px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {rootPath.split('/').pop() || rootPath}
      </div>
      {renderNodes(nodes)}
    </div>
  )
}
