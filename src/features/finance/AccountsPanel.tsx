import { useState } from 'react'
import type { Account, Recurring, Transaction } from '../../core/types'
import Modal from '../../core/ui/Modal'
import type { Ledger } from './model/accounts'
import { currentBalance, openingBalanceOf, totalAssets } from './model/accounts'
import { accountUsage, validateAccountInput } from './model/accountRules'
import { formatCNY, round2 } from './model/money'

export interface AccountDraft {
  name: string
  icon: string
  openingBalance: number
}

interface AccountsPanelProps {
  accounts: Account[]
  transactions: Transaction[]
  recurrings: Recurring[]
  ledger: Ledger
  onAdd: (draft: AccountDraft) => void
  onUpdate: (id: string, draft: AccountDraft) => void
  onDelete: (id: string) => void
  onMigrate: (sourceId: string, targetId: string) => void
}

const emptyForm = { name: '', icon: '💳', opening: '' }

/**
 * 账户卡片：余额一律走派生（期初 + 全历史流水净额），不读 balance 字段。
 * 新建 / 编辑 / 删除 / 迁移的判定全部来自 model/accountRules，组件只做交互。
 */
export default function AccountsPanel(props: AccountsPanelProps) {
  const { accounts, transactions, recurrings, ledger } = props
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<{ name?: string; openingBalance?: string }>({})
  const [confirmOpeningChange, setConfirmOpeningChange] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null)
  const [migrateTargetId, setMigrateTargetId] = useState('')
  const [notice, setNotice] = useState('')

  const editing = editingId ? accounts.find((item) => item.id === editingId) || null : null
  const editingOpening = editing ? openingBalanceOf(editing) : 0

  const openCreate = () => {
    setCreating(true)
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setConfirmOpeningChange(false)
    setNotice('')
  }

  const openEdit = (account: Account) => {
    setCreating(false)
    setEditingId(account.id)
    setForm({ name: account.name, icon: account.icon, opening: String(openingBalanceOf(account)) })
    setErrors({})
    setConfirmOpeningChange(false)
    setNotice('')
  }

  const closeForm = () => {
    setCreating(false)
    setEditingId(null)
    setConfirmOpeningChange(false)
  }

  const submit = () => {
    const openingBalance = round2(Number(form.opening || 0))
    const nextErrors = validateAccountInput({ name: form.name, openingBalance })
    setErrors(nextErrors)
    if (nextErrors.name || nextErrors.openingBalance) return

    const draft: AccountDraft = { name: form.name.trim(), icon: form.icon.trim() || '💳', openingBalance }

    if (editing) {
      const openingChanged = round2(openingBalance) !== round2(editingOpening)
      if (openingChanged && !confirmOpeningChange) {
        setConfirmOpeningChange(true)
        return
      }
      props.onUpdate(editing.id, draft)
    } else {
      props.onAdd(draft)
    }
    closeForm()
  }

  const askDelete = (account: Account) => {
    const usage = accountUsage(account, transactions, recurrings, accounts.length)
    setNotice('')
    if (usage.blockedByLast) {
      setNotice('至少保留一个账户，无法删除。')
      return
    }
    if (usage.total === 0) {
      setPendingDelete(account)
      setMigrateTargetId('')
      return
    }
    setPendingDelete(account)
    const other = accounts.find((item) => item.id !== account.id)
    setMigrateTargetId(other ? other.id : '')
  }

  const closeDelete = () => {
    setPendingDelete(null)
    setMigrateTargetId('')
  }

  const deleteUsage = pendingDelete
    ? accountUsage(pendingDelete, transactions, recurrings, accounts.length)
    : null
  const otherAccounts = pendingDelete ? accounts.filter((item) => item.id !== pendingDelete.id) : []

  const confirmDelete = () => {
    if (!pendingDelete || !deleteUsage) return
    if (deleteUsage.total > 0) {
      if (!migrateTargetId) return
      props.onMigrate(pendingDelete.id, migrateTargetId)
    }
    props.onDelete(pendingDelete.id)
    closeDelete()
  }

  return (
    <div className="fin-accounts">
      <div className="fin-total-card">
        <div className="fin-total-label">总资产</div>
        <div className="fin-total-value">{formatCNY(totalAssets(accounts, ledger))}</div>
        <div className="fin-total-hint">按「期初 + 全部流水净额」实时计算，含负余额账户</div>
      </div>

      <div className="fin-section-head">
        <div className="fin-section-title">账户</div>
        <button className="btn fin-btn-gold" onClick={openCreate}>＋ 新建账户</button>
      </div>

      {notice && <div className="fin-error-line">{notice}</div>}

      <div className="fin-account-grid">
        {accounts.map((account) => {
          const balance = currentBalance(account, ledger)
          const bucket = ledger.byAccount.get(account.id)
          return (
            <div key={account.id} className="fin-account-card">
              <div className="fin-account-top">
                <div className="fin-account-icon">{account.icon}</div>
                <div className="fin-account-name">{account.name}</div>
                <div className="fin-account-ops">
                  <button className="fin-icon-btn" title="编辑" onClick={() => openEdit(account)}>编辑</button>
                  <button className="fin-icon-btn fin-icon-danger" title="删除" onClick={() => askDelete(account)}>删除</button>
                </div>
              </div>
              <div className={`fin-balance ${balance < 0 ? 'is-negative' : ''}`}>{formatCNY(balance)}</div>
              <div className="fin-account-sub">
                期初 {formatCNY(openingBalanceOf(account))} · 收 {formatCNY((bucket?.incomeCents || 0) / 100)} · 支 {formatCNY((bucket?.expenseCents || 0) / 100)}
              </div>
            </div>
          )
        })}
      </div>
      {accounts.length === 0 && <div className="empty">暂无账户，先新建一个吧</div>}

      <Modal
        open={creating || !!editing}
        title={editing ? '编辑账户' : '新建账户'}
        onClose={closeForm}
        actions={
          <>
            <button className="btn btn-ghost" onClick={closeForm}>取消</button>
            <button className="btn btn-primary" onClick={submit}>
              {confirmOpeningChange ? '确认修改期初' : '保存'}
            </button>
          </>
        }
      >
        <div className="finance-page">
          <div className="fin-form">
            <div className="fin-field">
              <label className="fin-label">账户名称</label>
              <input
                className="input"
                placeholder="如 招商银行"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                autoFocus
              />
              {errors.name && <div className="fin-error">{errors.name}</div>}
            </div>
            <div className="fin-form-row">
              <div className="fin-field" style={{ width: 90 }}>
                <label className="fin-label">图标</label>
                <input
                  className="input"
                  value={form.icon}
                  onChange={(event) => setForm({ ...form, icon: event.target.value })}
                />
              </div>
              <div className="fin-field">
                <label className="fin-label">期初余额（元）</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder="允许负数"
                  value={form.opening}
                  onChange={(event) => {
                    setForm({ ...form, opening: event.target.value })
                    setConfirmOpeningChange(false)
                  }}
                />
                {errors.openingBalance && <div className="fin-error">{errors.openingBalance}</div>}
              </div>
            </div>
            {confirmOpeningChange && (
              <div className="fin-warn">
                修改期初余额会立刻改变当前余额（{formatCNY(editingOpening)} → {formatCNY(round2(Number(form.opening || 0)))}），
                再点一次「确认修改期初」生效。
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!pendingDelete}
        title="删除账户"
        onClose={closeDelete}
        actions={
          <>
            <button className="btn btn-ghost" onClick={closeDelete}>取消</button>
            <button
              className="btn btn-danger"
              disabled={!!deleteUsage && deleteUsage.total > 0 && !migrateTargetId}
              onClick={confirmDelete}
            >
              {deleteUsage && deleteUsage.total > 0 ? '迁移并删除' : '确认删除'}
            </button>
          </>
        }
      >
        {pendingDelete && deleteUsage && (
          <div className="finance-page">
            <div className="fin-form">
            <div className="fin-delete-name">{pendingDelete.icon} {pendingDelete.name}</div>
            {deleteUsage.total > 0 ? (
              <>
                <div className="fin-warn">
                  该账户仍被 {deleteUsage.transactionCount} 笔流水、{deleteUsage.recurringCount} 条周期账单引用，
                  请先迁移到其他账户。
                </div>
                <div className="fin-field">
                  <label className="fin-label">迁移到</label>
                  <select
                    className="select"
                    value={migrateTargetId}
                    onChange={(event) => setMigrateTargetId(event.target.value)}
                  >
                    <option value="">请选择目标账户</option>
                    {otherAccounts.map((item) => (
                      <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="fin-warn">该账户没有流水与周期账单引用，删除后不可恢复。</div>
            )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
