import { useState } from 'react'
import dayjs from 'dayjs'
import type { Account, FinanceCategory, Recurring, TransactionType } from '../../core/types'
import Modal from '../../core/ui/Modal'
import { formatCNY, round2 } from './model/money'
import {
  formatNthPeriod,
  nextDueOnOrAfter,
  parseNthPeriod,
  recurringScheduleLabel,
  resolveRecurringAccount,
  WEEKDAY_LABELS,
} from './model/recurringRules'

interface RecurringPanelProps {
  recurrings: Recurring[]
  accounts: Account[]
  categories: FinanceCategory[]
  onCreate: (draft: Omit<Recurring, 'id'>) => void
  onUpdate: (id: string, patch: Partial<Recurring>) => void
  onDelete: (id: string) => void
}

interface RecurringDraft {
  name: string
  amount: string
  type: TransactionType
  cycle: 'monthly' | 'yearly'
  mode: 'day' | 'nth'
  day: string
  nth: string
  weekday: string
  category: string
  account_id: string
  start_date: string
}

const todayText = () => dayjs().format('YYYY-MM-DD')

const firstCategoryOf = (categories: FinanceCategory[], type: TransactionType): string =>
  categories.filter((item) => item.type === type)[0]?.name || ''

const emptyDraft = (categories: FinanceCategory[], accounts: Account[]): RecurringDraft => ({
  name: '',
  amount: '',
  type: 'expense',
  cycle: 'monthly',
  mode: 'day',
  day: '1',
  nth: '1',
  weekday: '1',
  category: firstCategoryOf(categories, 'expense'),
  account_id: accounts[0]?.id || '',
  start_date: todayText(),
})

/**
 * 周期账单管理：新建 / 编辑 / 暂停恢复 / 删除。
 * 删除规则时默认保留已生成流水，不提供「同时删除」选项。
 */
export default function RecurringPanel(props: RecurringPanelProps) {
  const { recurrings, accounts, categories } = props
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Recurring | null>(null)
  const [draft, setDraft] = useState<RecurringDraft>(() => emptyDraft(categories, accounts))
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Recurring | null>(null)

  const typeCategories = categories.filter((item) => item.type === draft.type)

  const openCreate = () => {
    setEditing(null)
    setError('')
    setDraft(emptyDraft(categories, accounts))
    setFormOpen(true)
  }

  const openEdit = (recurring: Recurring) => {
    const nth = parseNthPeriod(recurring.custom_period)
    setEditing(recurring)
    setError('')
    setDraft({
      name: recurring.name,
      amount: String(recurring.amount),
      type: recurring.type === 'income' ? 'income' : 'expense',
      cycle: recurring.cycle,
      mode: nth ? 'nth' : 'day',
      day: String(recurring.day),
      nth: String(nth?.n ?? 1),
      weekday: String(nth?.weekday ?? 1),
      category: recurring.category,
      account_id: recurring.account_id || '',
      start_date: recurring.start_date,
    })
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setError('')
  }

  const switchType = (type: TransactionType) => {
    const inType = categories.some((item) => item.type === type && item.name === draft.category)
    setDraft({
      ...draft,
      type,
      category: inType ? draft.category : firstCategoryOf(categories, type),
    })
  }

  const submit = () => {
    if (!draft.name.trim()) {
      setError('请输入周期账单名称')
      return
    }
    const amount = round2(Number(draft.amount))
    if (!draft.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('请输入大于 0 的金额')
      return
    }
    const day = Math.round(Number(draft.day))
    if (draft.mode === 'day' && (!Number.isFinite(day) || day < 1 || day > 31)) {
      setError('日期需在 1-31 之间')
      return
    }
    const account = accounts.find((item) => item.id === draft.account_id) || accounts[0] || null
    const payload: Omit<Recurring, 'id'> = {
      name: draft.name.trim(),
      amount,
      cycle: draft.cycle,
      day: draft.mode === 'day' ? day : 1,
      category: draft.category,
      account: account?.name || '',
      account_id: account?.id,
      start_date: draft.start_date || todayText(),
      type: draft.type,
      custom_period: draft.mode === 'nth'
        ? formatNthPeriod(Number(draft.nth), Number(draft.weekday))
        : 'day',
      paused: editing?.paused ?? false,
    }

    if (!editing) {
      props.onCreate(payload)
    } else {
      const changed = editing.cycle !== payload.cycle
        || editing.day !== payload.day
        || (editing.custom_period || 'day') !== payload.custom_period
        || editing.start_date !== payload.start_date
      const patch: Partial<Recurring> = { ...payload }
      // 改规则不重写历史：把游标推到今天之后的第一个应付日
      if (changed && !editing.paused) {
        patch.next_date = nextDueOnOrAfter({ ...editing, ...payload }, todayText())
      }
      props.onUpdate(editing.id, patch)
    }
    closeForm()
  }

  const togglePause = (recurring: Recurring) => {
    if (recurring.paused) {
      // 恢复时跳过暂停期间的期次，从今天起算
      props.onUpdate(recurring.id, {
        paused: false,
        next_date: nextDueOnOrAfter(recurring, todayText()),
      })
    } else {
      props.onUpdate(recurring.id, { paused: true })
    }
  }

  return (
    <div className="fin-recurring">
      <div className="fin-cat-head">
        <div className="fin-cat-title">周期账单</div>
        <div className="fin-cat-hint">打开应用时自动补记；一次最多补 12 期（年度 3 期）</div>
      </div>

      {recurrings.length === 0 && <div className="empty">暂无周期账单</div>}
      {recurrings.map((recurring) => {
        const account = resolveRecurringAccount(recurring, accounts)
        return (
          <div key={recurring.id} className={`fin-rec-row${recurring.paused ? ' is-paused' : ''}`}>
            <div className="fin-rec-main">
              <div className="fin-rec-name">
                {recurring.name}
                {recurring.paused && <span className="fin-rec-tag">已暂停</span>}
                {!account && <span className="fin-rec-tag is-warn">缺少账户</span>}
              </div>
              <div className="fin-rec-sub">
                {recurringScheduleLabel(recurring)} · {recurring.category} · {account ? account.name : '未绑定账户'}
              </div>
              <div className="fin-rec-next">
                {recurring.paused ? '暂停期间不生成流水' : `下次生成：${recurring.next_date || '待计算'}`}
              </div>
            </div>
            <div className={`fin-rec-amount ${recurring.type === 'income' ? 'is-income' : 'is-expense'}`}>
              {recurring.type === 'income' ? '+' : '-'}{formatCNY(recurring.amount)}
            </div>
            <div className="fin-account-ops">
              <button className="fin-icon-btn" onClick={() => openEdit(recurring)}>编辑</button>
              <button className="fin-icon-btn" onClick={() => togglePause(recurring)}>
                {recurring.paused ? '恢复' : '暂停'}
              </button>
              <button className="fin-icon-btn fin-icon-danger" onClick={() => setPendingDelete(recurring)}>删除</button>
            </div>
          </div>
        )
      })}

      <div className="fin-rec-footer">
        <button className="btn btn-primary" onClick={openCreate}>新建周期账单</button>
      </div>

      <Modal
        open={formOpen}
        title={editing ? '编辑周期账单' : '新建周期账单'}
        onClose={closeForm}
        actions={
          <>
            <button className="btn btn-ghost" onClick={closeForm}>取消</button>
            <button className="btn btn-primary" onClick={submit}>保存</button>
          </>
        }
      >
        <div className="finance-page">
          <div className="fin-form">
            <div className="fin-field">
              <label className="fin-label">名称</label>
              <input
                className="input"
                placeholder="如 校园网 / 房租"
                value={draft.name}
                onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError('') }}
                autoFocus
              />
            </div>

            <div className="fin-form-row">
              <div className="fin-field">
                <label className="fin-label">金额</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={draft.amount}
                  onChange={(event) => { setDraft({ ...draft, amount: event.target.value }); setError('') }}
                />
              </div>
              <div className="fin-field">
                <label className="fin-label">方向</label>
                <select
                  className="select"
                  value={draft.type}
                  onChange={(event) => switchType(event.target.value as TransactionType)}
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
              </div>
            </div>

            <div className="fin-form-row">
              <div className="fin-field">
                <label className="fin-label">周期</label>
                <select
                  className="select"
                  value={draft.cycle}
                  onChange={(event) => setDraft({ ...draft, cycle: event.target.value as 'monthly' | 'yearly' })}
                >
                  <option value="monthly">每月</option>
                  <option value="yearly">每年</option>
                </select>
              </div>
              <div className="fin-field">
                <label className="fin-label">规则</label>
                <select
                  className="select"
                  value={draft.mode}
                  onChange={(event) => setDraft({ ...draft, mode: event.target.value as 'day' | 'nth' })}
                >
                  <option value="day">按日期</option>
                  <option value="nth">按第几个周几</option>
                </select>
              </div>
            </div>

            {draft.mode === 'day' ? (
              <div className="fin-field">
                <label className="fin-label">日期</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="31"
                  value={draft.day}
                  onChange={(event) => { setDraft({ ...draft, day: event.target.value }); setError('') }}
                />
                <div className="fin-cat-hint">31 日在 2 月会自动顺延到月末；年度取开始日期的月份</div>
              </div>
            ) : (
              <div className="fin-form-row">
                <div className="fin-field">
                  <label className="fin-label">第几个</label>
                  <select
                    className="select"
                    value={draft.nth}
                    onChange={(event) => setDraft({ ...draft, nth: event.target.value })}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={String(value)}>
                        {value === 5 ? '最后一个' : `第 ${value} 个`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fin-field">
                  <label className="fin-label">周几</label>
                  <select
                    className="select"
                    value={draft.weekday}
                    onChange={(event) => setDraft({ ...draft, weekday: event.target.value })}
                  >
                    {WEEKDAY_LABELS.map((label, value) => (
                      <option key={label} value={String(value)}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="fin-form-row">
              <div className="fin-field">
                <label className="fin-label">分类</label>
                <select
                  className="select"
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                >
                  {!typeCategories.some((item) => item.name === draft.category) && (
                    <option value={draft.category}>{draft.category || '未分类'}</option>
                  )}
                  {typeCategories.map((item) => (
                    <option key={item.id} value={item.name}>{item.icon} {item.name}</option>
                  ))}
                </select>
              </div>
              <div className="fin-field">
                <label className="fin-label">账户</label>
                <select
                  className="select"
                  value={draft.account_id}
                  onChange={(event) => setDraft({ ...draft, account_id: event.target.value })}
                >
                  {accounts.length === 0 && <option value="">暂无账户（请先创建）</option>}
                  {accounts.map((item) => (
                    <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="fin-field">
              <label className="fin-label">开始日期</label>
              <input
                className="input"
                type="date"
                value={draft.start_date}
                onChange={(event) => setDraft({ ...draft, start_date: event.target.value })}
              />
            </div>

            {accounts.length === 0 && (
              <div className="fin-error-line">还没有账户：自动生成会因「缺少账户」被跳过，请先到「账户」页创建。</div>
            )}
            {error && <div className="fin-error">{error}</div>}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!pendingDelete}
        title="删除周期账单"
        onClose={() => setPendingDelete(null)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>取消</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (pendingDelete) props.onDelete(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              确认删除
            </button>
          </>
        }
      >
        {pendingDelete && (
          <div className="finance-page">
            <div className="fin-form">
              <div className="fin-delete-name">{pendingDelete.name}</div>
              <div className="fin-warn">
                删除后不再自动生成新流水；已经生成的流水会原样保留，不影响账户余额与统计。
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
