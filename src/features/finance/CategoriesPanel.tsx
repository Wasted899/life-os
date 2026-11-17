import { useState } from 'react'
import type { FinanceCategory, Transaction, TransactionType } from '../../core/types'
import Modal from '../../core/ui/Modal'
import type { CategoryRefPatch } from './model/categoryRules'
import {
  categoriesOfType,
  categoryUsage,
  planCategoryRemoval,
  validateCategoryInput,
} from './model/categoryRules'

interface CategoriesPanelProps {
  categories: FinanceCategory[]
  transactions: Transaction[]
  onAdd: (draft: { name: string; type: TransactionType; color: string; icon: string }) => void
  onUpdate: (id: string, patch: { name: string; color: string; icon: string }) => void
  onDelete: (id: string, patches: CategoryRefPatch[]) => void
}

const emptyDraft = { name: '', type: 'expense' as TransactionType, color: '#10b981', icon: '📦' }

/**
 * 收支分类管理：与待办分类完全独立，不复用待办分类组件。
 * 删除时把引用流水置空（落到「未分类」），确认弹窗显示引用笔数。
 */
export default function CategoriesPanel(props: CategoriesPanelProps) {
  const { categories, transactions } = props
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<FinanceCategory | null>(null)
  const [editForm, setEditForm] = useState({ name: '', color: '#10b981', icon: '📦' })
  const [editError, setEditError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<FinanceCategory | null>(null)

  const add = () => {
    const errors = validateCategoryInput({ name: draft.name, type: draft.type })
    setError(errors.name || '')
    if (errors.name) return
    props.onAdd({ ...draft, name: draft.name.trim(), icon: draft.icon.trim() || '📦' })
    setDraft(emptyDraft)
  }

  const openEdit = (category: FinanceCategory) => {
    setEditing(category)
    setEditForm({ name: category.name, color: category.color, icon: category.icon })
    setEditError('')
  }

  const submitEdit = () => {
    if (!editing) return
    const errors = validateCategoryInput({ name: editForm.name, type: editing.type })
    setEditError(errors.name || '')
    if (errors.name) return
    props.onUpdate(editing.id, {
      name: editForm.name.trim(),
      color: editForm.color,
      icon: editForm.icon.trim() || '📦',
    })
    setEditing(null)
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    props.onDelete(pendingDelete.id, planCategoryRemoval(pendingDelete, transactions))
    setPendingDelete(null)
  }

  const usageOf = (category: FinanceCategory) => categoryUsage(category, transactions)

  const groups: { type: TransactionType; title: string }[] = [
    { type: 'expense', title: '支出分类' },
    { type: 'income', title: '收入分类' },
  ]

  return (
    <div className="fin-categories">
      <div className="fin-cat-head">
        <div className="fin-cat-title">收支分类</div>
        <div className="fin-cat-hint">与待办分类相互独立，只用于记账</div>
      </div>

      <div className="fin-cat-create">
        <div className="fin-type-toggle">
          <button
            className={`btn ${draft.type === 'expense' ? 'btn-danger' : 'btn-outline'}`}
            style={{ flex: 1 }}
            onClick={() => setDraft({ ...draft, type: 'expense' })}
          >
            支出
          </button>
          <button
            className={`btn ${draft.type === 'income' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1 }}
            onClick={() => setDraft({ ...draft, type: 'income' })}
          >
            收入
          </button>
        </div>
        <div className="fin-cat-create-row">
          <input
            className="input"
            placeholder="收支分类名称"
            value={draft.name}
            onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError('') }}
          />
          <input
            className="input fin-cat-icon-input"
            placeholder="图标"
            value={draft.icon}
            onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
          />
          <input
            className="fin-cat-color"
            type="color"
            value={draft.color}
            onChange={(event) => setDraft({ ...draft, color: event.target.value })}
          />
          <button className="btn fin-btn-gold" onClick={add}>添加</button>
        </div>
        {error && <div className="fin-error">{error}</div>}
      </div>

      {groups.map((group) => {
        const list = categoriesOfType(categories, group.type)
        return (
          <div key={group.type} className="fin-cat-group">
            <div className="fin-cat-group-title">{group.title}</div>
            {list.length === 0 && <div className="empty">暂无{group.title}</div>}
            {list.map((category) => (
              <div key={category.id} className="fin-cat-row">
                <span className="fin-cat-dot" style={{ background: category.color }} />
                <span className="fin-cat-icon">{category.icon}</span>
                <span className="fin-cat-name">{category.name}</span>
                <span className="fin-cat-count">引用 {usageOf(category)} 笔</span>
                <div className="fin-account-ops">
                  <button className="fin-icon-btn" onClick={() => openEdit(category)}>编辑</button>
                  <button className="fin-icon-btn fin-icon-danger" onClick={() => setPendingDelete(category)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )
      })}

      <Modal
        open={!!editing}
        title="编辑收支分类"
        onClose={() => setEditing(null)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>取消</button>
            <button className="btn btn-primary" onClick={submitEdit}>保存</button>
          </>
        }
      >
        <div className="finance-page">
          <div className="fin-form">
            <div className="fin-field">
              <label className="fin-label">名称</label>
              <input
                className="input"
                value={editForm.name}
                onChange={(event) => { setEditForm({ ...editForm, name: event.target.value }); setEditError('') }}
                autoFocus
              />
              {editError && <div className="fin-error">{editError}</div>}
            </div>
            <div className="fin-form-row">
              <div className="fin-field" style={{ width: 90 }}>
                <label className="fin-label">图标</label>
                <input
                  className="input"
                  value={editForm.icon}
                  onChange={(event) => setEditForm({ ...editForm, icon: event.target.value })}
                />
              </div>
              <div className="fin-field" style={{ width: 90 }}>
                <label className="fin-label">颜色</label>
                <input
                  className="fin-cat-color"
                  type="color"
                  value={editForm.color}
                  onChange={(event) => setEditForm({ ...editForm, color: event.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!pendingDelete}
        title="删除收支分类"
        onClose={() => setPendingDelete(null)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>取消</button>
            <button className="btn btn-danger" onClick={confirmDelete}>确认删除</button>
          </>
        }
      >
        {pendingDelete && (
          <div className="finance-page">
            <div className="fin-form">
              <div className="fin-delete-name">{pendingDelete.icon} {pendingDelete.name}</div>
              <div className="fin-warn">
                有 {usageOf(pendingDelete)} 笔流水引用该收支分类。删除后这些流水会落到「未分类」，
                金额与统计仍然保留。
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
