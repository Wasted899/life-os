import { useEffect, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import Modal from '../../core/ui/Modal'
import { load, save, uid } from '../../core/storage'
import dayjs from 'dayjs'
import type { Memo, MemoItem, MemoKind } from '../../core/types'
import {
  DEFAULT_MEMO_CATEGORY,
  MEMO_CATEGORY_ALL,
  addCategoryToRegistry,
  categoryColor,
  categoryUsage,
  checklistProgress,
  clearPurchased,
  deriveMemoCategories,
  filterMemos,
  normalizeCategoryRegistry,
  normalizeMemoKind,
  normalizeMemoQty,
  planCategoryDelete,
  planCategoryRename,
  removeCategoryFromRegistry,
  removeChecklistItem,
  renameCategoryInRegistry,
  setChecklistItemQty,
  setChecklistItemText,
  sortMemos,
  toggleChecklistItem,
  validateCategoryName,
} from './model/memoRules'
import './memos.css'

const MEMO_CATS_KEY = 'p_memo_cats'

interface MemoDraft {
  id?: string
  kind: MemoKind
  category: string
  content: string
  items: MemoItem[]
}

const newDraftItem = (): MemoItem => ({ id: uid(), text: '', done: false, qty: 1 })

export default function MemosPage() {
  const { memos, addMemo, updateMemo, deleteMemo } = useData()
  const [registry, setRegistry] = useState<string[]>(() => normalizeCategoryRegistry(load(MEMO_CATS_KEY, [])))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(MEMO_CATEGORY_ALL)
  const [draft, setDraft] = useState<MemoDraft | null>(null)
  const [error, setError] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [catError, setCatError] = useState('')
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null)
  const newRef = useRef<HTMLDivElement>(null)

  const categories = deriveMemoCategories(memos, registry)
  const visible = sortMemos(filterMemos(memos, { query, category: filter }))
  const defaultCategory = filter === MEMO_CATEGORY_ALL ? DEFAULT_MEMO_CATEGORY : filter

  useEffect(() => {
    if (!newOpen) return
    const onDown = (e: MouseEvent) => {
      if (newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [newOpen])

  const persistRegistry = (next: string[]) => {
    setRegistry(next)
    save(MEMO_CATS_KEY, next)
  }

  const openCreate = (kind: MemoKind) => {
    setNewOpen(false)
    setError('')
    setDraft({
      kind,
      category: defaultCategory,
      content: '',
      items: kind === 'checklist' ? [newDraftItem()] : [],
    })
  }

  const openEdit = (memo: Memo) => {
    const items = memo.items ?? []
    setError('')
    setDraft({
      id: memo.id,
      kind: normalizeMemoKind(memo.kind, items),
      category: memo.category,
      content: memo.content,
      items: items.map(item => ({ ...item })),
    })
  }

  const patchDraftItems = (fn: (items: MemoItem[]) => MemoItem[]) => {
    setDraft(current => (current ? { ...current, items: fn(current.items) } : current))
  }

  const addDraftItem = () => patchDraftItems(items => [...items, newDraftItem()])

  const saveDraft = () => {
    if (!draft) return
    if (draft.kind === 'note') {
      if (!draft.content.trim()) {
        setError('内容不能为空')
        return
      }
      if (draft.id) {
        updateMemo(draft.id, { content: draft.content, category: draft.category })
      } else {
        addMemo({
          content: draft.content,
          category: draft.category,
          pinned: false,
          completed: false,
          created_at: dayjs().toISOString(),
          kind: 'note',
          items: [],
        })
      }
    } else {
      const items = draft.items
        .filter(item => item.text.trim())
        .map(item => ({
          ...item,
          text: item.text.trim(),
          done: item.done === true,
          qty: normalizeMemoQty(item.qty),
        }))
      if (!items.length) {
        setError('请至少添加一个条目')
        return
      }
      if (draft.id) {
        updateMemo(draft.id, { category: draft.category, items })
      } else {
        addMemo({
          content: '',
          category: draft.category,
          pinned: false,
          completed: false,
          created_at: dayjs().toISOString(),
          kind: 'checklist',
          items,
        })
      }
    }
    setDraft(null)
  }

  const toggleItem = (memo: Memo, itemId: string) => {
    updateMemo(memo.id, { items: toggleChecklistItem(memo.items ?? [], itemId) })
  }

  const commitQty = (memo: Memo, item: MemoItem, raw: string) => {
    const qty = normalizeMemoQty(raw)
    if (qty === normalizeMemoQty(item.qty)) return
    updateMemo(memo.id, { items: setChecklistItemQty(memo.items ?? [], item.id, qty) })
  }

  const clearBought = (memo: Memo) => {
    const { done } = checklistProgress(memo.items ?? [])
    if (!done) return
    if (!window.confirm(`确定清空 ${done} 条已购条目？删除后不可恢复。`)) return
    updateMemo(memo.id, { items: clearPurchased(memo.items ?? []) })
  }

  const removeMemo = (memo: Memo) => {
    if (!window.confirm('确定删除这条备忘录？')) return
    deleteMemo(memo.id)
  }

  const addCategory = () => {
    const next = newCat.trim()
    const message = validateCategoryName(next, categories)
    if (message) {
      setCatError(message)
      return
    }
    persistRegistry(addCategoryToRegistry(registry, next))
    setNewCat('')
    setCatError('')
  }

  const commitRename = () => {
    if (!renaming) return
    const target = renaming.value.trim()
    const message = validateCategoryName(target, categories, renaming.from)
    if (message) {
      setCatError(message)
      return
    }
    if (target !== renaming.from) {
      planCategoryRename(memos, renaming.from, target).forEach(patch => updateMemo(patch.id, { category: patch.category }))
      persistRegistry(renameCategoryInRegistry(registry, renaming.from, target))
      if (filter === renaming.from) setFilter(target)
    }
    setRenaming(null)
    setCatError('')
  }

  const removeCategory = (name: string) => {
    const used = categoryUsage(memos, name)
    const tip = used
      ? `删除分类「${name}」？${used} 条备忘录将归到「${DEFAULT_MEMO_CATEGORY}」。`
      : `删除分类「${name}」？`
    if (!window.confirm(tip)) return
    planCategoryDelete(memos, name).forEach(patch => updateMemo(patch.id, { category: patch.category }))
    persistRegistry(removeCategoryFromRegistry(registry, name))
    if (filter === name) setFilter(MEMO_CATEGORY_ALL)
  }

  return (
    <div className="memos-page">
      <div className="card memos-toolbar">
        <div className="memos-search-row">
          <input
            className="input memos-search"
            placeholder="搜索内容或清单条目…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="memos-new" ref={newRef}>
            <button className="btn btn-primary" onClick={() => setNewOpen(open => !open)}>
              + 新建 ▾
            </button>
            {newOpen && (
              <div className="memos-new-menu">
                <button className="memos-new-item" onClick={() => openCreate('note')}>📝 备忘录</button>
                <button className="memos-new-item" onClick={() => openCreate('checklist')}>🛒 购物清单</button>
              </div>
            )}
          </div>
        </div>
        <div className="memos-chips">
          <button
            className={`memos-chip${filter === MEMO_CATEGORY_ALL ? ' memos-chip-active' : ''}`}
            onClick={() => setFilter(MEMO_CATEGORY_ALL)}
          >
            全部 {memos.length}
          </button>
          {categories.map(name => (
            <button
              key={name}
              className={`memos-chip${filter === name ? ' memos-chip-active' : ''}`}
              style={categoryColor(name)}
              onClick={() => setFilter(name)}
            >
              {name} {categoryUsage(memos, name)}
            </button>
          ))}
          <button className="btn btn-outline memos-manage" onClick={() => { setCatError(''); setCatOpen(true) }}>
            分类管理
          </button>
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="memos-grid">
          {visible.map(memo => {
            const items = memo.items ?? []
            const kind = normalizeMemoKind(memo.kind, items)
            const progress = checklistProgress(items)
            return (
              <div key={memo.id} className={`card memo-card${memo.pinned ? ' memo-pinned' : ''}`}>
                <div className="memo-head">
                  <span className="tag" style={categoryColor(memo.category)}>{memo.category}</span>
                  <div className="memo-actions">
                    <button className="btn btn-ghost memo-icon" title={memo.pinned ? '取消置顶' : '置顶'} onClick={() => updateMemo(memo.id, { pinned: !memo.pinned })}>
                      {memo.pinned ? '📌' : '📍'}
                    </button>
                    <button className="btn btn-ghost memo-icon" title="编辑" onClick={() => openEdit(memo)}>✏️</button>
                    <button className="btn btn-ghost memo-icon memo-danger" title="删除" onClick={() => removeMemo(memo)}>🗑️</button>
                  </div>
                </div>

                {kind === 'checklist' ? (
                  <>
                    <div className="memo-progress">已购 {progress.done}/{progress.total}</div>
                    <div className="memo-items">
                      {items.map(item => (
                        <div key={item.id} className={`memo-item${item.done === true ? ' done' : ''}`}>
                          <input type="checkbox" checked={item.done === true} onChange={() => toggleItem(memo, item.id)} />
                          <span className="memo-item-text">{item.text || '（空条目）'}</span>
                          <input
                            key={`${item.id}-${item.qty ?? 1}`}
                            className="input memo-item-qty"
                            type="number"
                            min={1}
                            max={9999}
                            defaultValue={item.qty ?? 1}
                            title="数量"
                            onBlur={e => {
                              commitQty(memo, item, e.target.value)
                              e.target.value = String(normalizeMemoQty(e.target.value))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            }}
                          />
                        </div>
                      ))}
                      {!items.length && <div className="memo-items-empty">还没有条目，点编辑添加</div>}
                    </div>
                    {progress.done > 0 && (
                      <button className="btn btn-ghost memo-clear" onClick={() => clearBought(memo)}>清空已购</button>
                    )}
                  </>
                ) : (
                  <div className="memo-content">{memo.content}</div>
                )}

                {kind === 'checklist' && memo.content && <div className="memo-content memo-note">{memo.content}</div>}
                <div className="memo-time">{dayjs(memo.created_at).format('M-D HH:mm')}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty">{memos.length ? '没有匹配的备忘录' : '暂无备忘录，点击右上角新建'}</div>
      )}

      <Modal
        open={!!draft}
        title={draft ? `${draft.id ? '编辑' : '新建'}${draft.kind === 'checklist' ? '购物清单' : '备忘录'}` : ''}
        style={{ maxWidth: 560 }}
        onClose={() => setDraft(null)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setDraft(null)}>取消</button>
            <button className="btn btn-primary" onClick={saveDraft}>保存</button>
          </>
        }
      >
        {draft && (
          <div className="memos-page">
            <div className="memos-form">
              <label className="memos-field">
                <span>分类</span>
                <select className="select" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
                  {categories.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              {draft.kind === 'note' ? (
                <label className="memos-field">
                  <span>内容</span>
                  <textarea
                    className="textarea"
                    rows={5}
                    placeholder="记录点什么…"
                    value={draft.content}
                    onChange={e => setDraft({ ...draft, content: e.target.value })}
                    autoFocus
                  />
                </label>
              ) : (
                <div className="memos-field">
                  <span>条目</span>
                  <div className="memos-items-editor">
                    {draft.items.map(item => (
                      <div key={item.id} className="memos-item-edit">
                        <input
                          className="input"
                          placeholder="条目名称"
                          value={item.text}
                          onChange={e => patchDraftItems(list => setChecklistItemText(list, item.id, e.target.value))}
                        />
                        <input
                          className="input memos-qty"
                          type="number"
                          min={1}
                          max={9999}
                          title="数量"
                          value={item.qty ?? 1}
                          onChange={e => patchDraftItems(list => setChecklistItemQty(list, item.id, e.target.value))}
                        />
                        <button
                          className="btn btn-ghost memo-danger"
                          title="删除条目"
                          onClick={() => patchDraftItems(list => removeChecklistItem(list, item.id))}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button className="btn btn-outline memos-add-item" onClick={addDraftItem}>+ 添加条目</button>
                  </div>
                </div>
              )}
              {error && <div className="memos-error">{error}</div>}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={catOpen}
        title="分类管理"
        onClose={() => { setCatOpen(false); setRenaming(null); setCatError('') }}
        actions={<button className="btn btn-ghost" onClick={() => { setCatOpen(false); setRenaming(null); setCatError('') }}>关闭</button>}
      >
        <div className="memos-page">
          <div className="memos-cat-list">
            {categories.map(name => (
              <div key={name} className="memos-cat-row">
                {renaming?.from === name ? (
                  <>
                    <input
                      className="input memos-cat-input"
                      value={renaming.value}
                      onChange={e => { setRenaming({ from: name, value: e.target.value }); setCatError('') }}
                      autoFocus
                    />
                    <button className="btn btn-primary memos-cat-btn" onClick={commitRename}>保存</button>
                    <button className="btn btn-ghost memos-cat-btn" onClick={() => { setRenaming(null); setCatError('') }}>取消</button>
                  </>
                ) : (
                  <>
                    <span className="tag" style={categoryColor(name)}>{name}</span>
                    <span className="memos-cat-count">{categoryUsage(memos, name)} 条</span>
                    <div className="memos-cat-actions">
                      <button
                        className="btn btn-ghost memos-cat-btn"
                        disabled={name === DEFAULT_MEMO_CATEGORY}
                        onClick={() => { setRenaming({ from: name, value: name }); setCatError('') }}
                      >
                        改名
                      </button>
                      <button
                        className="btn btn-ghost memos-cat-btn memo-danger"
                        disabled={name === DEFAULT_MEMO_CATEGORY}
                        onClick={() => removeCategory(name)}
                      >
                        删除
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="memos-cat-add">
            <input
              className="input"
              placeholder="新分类名称"
              value={newCat}
              onChange={e => { setNewCat(e.target.value); setCatError('') }}
              onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
            />
            <button className="btn btn-primary" onClick={addCategory}>添加</button>
          </div>
          {catError && <div className="memos-error">{catError}</div>}
        </div>
      </Modal>
    </div>
  )
}
