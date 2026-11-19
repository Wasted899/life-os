import { useState } from 'react'
import type { Category } from '../../../core/types'
import { CATEGORY_PALETTE } from '../../../core/categoryColor'
import Modal from '../../../core/ui/Modal'

interface Props {
  categories: Category[]
  counts: Map<string, number>
  onAdd: (name: string, color: string) => string | null
  onRename: (id: string, name: string) => string | null
  onColor: (id: string, color: string) => void
  onDelete: (id: string) => string | null
  onClose: () => void
}

export default function CategoryManagerModal({
  categories,
  counts,
  onAdd,
  onRename,
  onColor,
  onDelete,
  onClose,
}: Props) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const handleAdd = () => {
    const message = onAdd(newName, newColor)
    if (message) {
      setError(message)
      return
    }
    setError('')
    setNewName('')
    setNewColor(CATEGORY_PALETTE[(categories.length + 1) % CATEGORY_PALETTE.length])
  }

  const handleRename = (category: Category) => {
    const nextName = drafts[category.id] ?? category.name
    const message = onRename(category.id, nextName)
    if (message) {
      setError(message)
      return
    }
    setError('')
    setDrafts(previous => {
      const next = { ...previous }
      delete next[category.id]
      return next
    })
  }

  return (
    <Modal
      open
      title="分类管理"
      onClose={onClose}
      style={{ maxWidth: 620 }}
      actions={<button className="btn btn-primary" onClick={onClose}>完成</button>}
    >
      <div className="ts-cat-manager">
        <div className="ts-cat-add">
          <input
            className="input"
            placeholder="新分类名称"
            value={newName}
            onChange={event => setNewName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') handleAdd() }}
          />
          <input
            type="color"
            className="ts-color-input"
            value={newColor}
            onChange={event => setNewColor(event.target.value)}
            aria-label="新分类颜色"
          />
          <button type="button" className="btn btn-primary" onClick={handleAdd}>添加</button>
        </div>

        {categories.length === 0 && <div className="empty">还没有分类</div>}

        <div className="ts-cat-list">
          {categories.map(category => {
            const draft = drafts[category.id] ?? category.name
            const changed = draft.trim() !== category.name
            return (
              <div key={category.id} className="ts-cat-row">
                <input
                  type="color"
                  className="ts-color-input"
                  value={category.color}
                  onChange={event => onColor(category.id, event.target.value)}
                  aria-label={`${category.name} 颜色`}
                />
                <input
                  className="input"
                  value={draft}
                  onChange={event => setDrafts(previous => ({ ...previous, [category.id]: event.target.value }))}
                />
                <span className="ts-cat-count">{counts.get(category.name) ?? 0} 条</span>
                <button
                  type="button"
                  className="btn btn-outline ts-mini"
                  disabled={!changed}
                  onClick={() => handleRename(category)}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="btn btn-ghost ts-mini ts-danger-text"
                  onClick={() => {
                    if (!confirm(`删除分类「${category.name}」？历史记录会归入「其他」，时间块不会被删除。`)) return
                    const message = onDelete(category.id)
                    if (message) setError(message)
                  }}
                >
                  删除
                </button>
              </div>
            )
          })}
        </div>

        {error && <div className="ts-form-error">{error}</div>}
        <div className="ts-hint">
          改名会同步迁移历史时间记录的分类名；删除分类只把记录归入「其他」，不会删除任何时间块。
        </div>
      </div>
    </Modal>
  )
}
