import { useState, useMemo, useEffect } from 'react'
import { useData } from '../../context/DataContext'
import Modal from '../../core/ui/Modal'
import { load, save } from '../../core/storage'
import dayjs from 'dayjs'
import type { AccountDraft } from './AccountsPanel'
import AccountsPanel from './AccountsPanel'
import CategoriesPanel from './CategoriesPanel'
import RecurringPanel from './RecurringPanel'
import { RECURRING_CHECK_EVENT } from './RecurringAutoPost'
import { buildLedger, currentBalance } from './model/accounts'
import { filterTransactions, summarizeTransactions } from './model/selectors'
import { formatCNY, round2 } from './model/money'
import {
  planAccountMigration,
  referencesAccount,
  resolveDefaultAccountId,
  resolveSelectedAccountId,
} from './model/accountRules'
import type { CategoryRefPatch } from './model/categoryRules'
import { categoryLabel, planCategoryRename } from './model/categoryRules'
import type { Transaction } from '../../core/types'
import './finance.css'

interface FinanceUiPrefs {
  lastAccountId?: string
  selectedAccountId?: string
}

type Tab = 'records' | 'stats' | 'budget' | 'accounts' | 'categories' | 'recurring' | 'yearly'

export default function Finance() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, financeCategories, addFinanceCategory, updateFinanceCategory, deleteFinanceCategory, accounts, addAccount, updateAccount, deleteAccount, recurrings, addRecurring, deleteRecurring, updateRecurring } = useData()
  const [tab, setTab] = useState<Tab>('records')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState({ type: 'expense' as 'expense' | 'income', category: '', amount: '', account_id: '', date: dayjs().format('YYYY-MM-DD'), note: '' })
  const [amountError, setAmountError] = useState('')
  const [newAccount, setNewAccount] = useState({ name: '', icon: '💳', opening: '' })
  const [prefs, setPrefs] = useState<FinanceUiPrefs>(() => load<FinanceUiPrefs>('p_finance_ui', {}))
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))

  // 进入记账页立即检查一次周期账单（与挂载/回到前台共用同一计划器）
  useEffect(() => {
    window.dispatchEvent(new Event(RECURRING_CHECK_EVENT))
  }, [])

  /** 账户余额唯一来源：按全历史流水派生，任何增删改都自动重算 */
  const ledger = useMemo(() => buildLedger(transactions), [transactions])

  // UI 偏好：选中账户不进 13 域；账户被删后自动回落「全部账户」
  const selectedAccountId = resolveSelectedAccountId(accounts, prefs.selectedAccountId)
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null
  const persistPrefs = (next: FinanceUiPrefs) => {
    setPrefs(next)
    save('p_finance_ui', next)
  }
  const pickAccount = (id: string) => persistPrefs({ ...prefs, selectedAccountId: id })

  // 流水 / 月度 / 年度 / 分类统计共用同一套 selector
  const visibleTx = useMemo(() => filterTransactions(transactions, { accountId: selectedAccountId }), [transactions, selectedAccountId])
  const mTx = useMemo(() => filterTransactions(visibleTx, { month }), [visibleTx, month])
  const mSummary = useMemo(() => summarizeTransactions(mTx), [mTx])
  const mExp = mSummary.expense
  const mInc = mSummary.income

  const expCats = financeCategories.filter(c => c.type === 'expense')
  const incCats = financeCategories.filter(c => c.type === 'income')

  const byCat = useMemo(() => {
    const map: Record<string, number> = {}
    mTx.filter(t => t.type === 'expense').forEach(t => {
      const label = categoryLabel(t.category, financeCategories)
      map[label] = (map[label] || 0) + t.amount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [mTx, financeCategories])

  const yearlyData = useMemo(() => {
    const y = month.slice(0, 4)
    const m: Record<string, { exp: number; inc: number }> = {}
    for (let i = 1; i <= 12; i++) {
      const key = `${y}-${String(i).padStart(2, '0')}`
      const summary = summarizeTransactions(filterTransactions(visibleTx, { month: key }))
      m[key] = { exp: summary.expense, inc: summary.income }
    }
    return m
  }, [visibleTx, month])

  const rememberAccount = (id: string) => persistPrefs({ ...prefs, lastAccountId: id })

  const accountNameOf = (t: Transaction) => {
    const account = accounts.find(a => a.id === t.account_id)
    return account ? account.name : '未归属'
  }

  const categoriesFor = (type: 'expense' | 'income') => type === 'expense' ? expCats : incCats

  const openAdd = (type?: 'expense' | 'income') => {
    const nextType = type || 'expense'
    const defaultId = resolveDefaultAccountId(accounts, {
      selectedAccountId,
      lastAccountId: prefs.lastAccountId,
    })
    const cats = categoriesFor(nextType)
    setEditing(null)
    setAmountError('')
    setNewAccount({ name: '', icon: '💳', opening: '' })
    setForm({
      type: nextType,
      category: cats[0]?.name || '',
      amount: '',
      account_id: defaultId || '',
      date: dayjs().format('YYYY-MM-DD'),
      note: '',
    })
    setShow(true)
  }

  const openEdit = (t: Transaction) => {
    const defaultId = resolveDefaultAccountId(accounts, {
      editingAccountId: t.account_id,
      editingAccountName: t.account,
      selectedAccountId,
      lastAccountId: prefs.lastAccountId,
    })
    const type = t.type === 'income' ? 'income' : 'expense'
    const cats = categoriesFor(type)
    setEditing(t)
    setAmountError('')
    setForm({
      type,
      category: cats.some(c => c.name === t.category) ? t.category : '',
      amount: String(t.amount),
      account_id: defaultId || '',
      date: t.date,
      note: t.note || '',
    })
    setShow(true)
  }

  const saveTx = () => {
    const amount = round2(Number(form.amount))
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setAmountError('请输入大于 0 的金额')
      return
    }
    // 未选账户时：列表为空则新建（默认「现金」），否则回落第一个账户
    let account = accounts.find(a => a.id === form.account_id) || accounts[0] || null
    if (!account) {
      const opening = round2(Number(newAccount.opening || 0))
      account = addAccount({
        name: newAccount.name.trim() || '现金',
        icon: newAccount.icon.trim() || '💳',
        balance: opening,
        opening_balance: opening,
      })
    }
    const payload = {
      type: form.type,
      category: form.category,
      amount,
      account: account.name,
      account_id: account.id,
      date: form.date,
      note: form.note,
    }
    if (editing) updateTransaction(editing.id, payload)
    else addTransaction(payload)
    rememberAccount(account.id)
    setShow(false)
  }

  const handleAddAccount = (draft: AccountDraft) => {
    addAccount({
      name: draft.name,
      icon: draft.icon,
      balance: draft.openingBalance,
      opening_balance: draft.openingBalance,
    })
  }

  const handleUpdateAccount = (id: string, draft: AccountDraft) => {
    const prev = accounts.find(a => a.id === id)
    updateAccount(id, { name: draft.name, icon: draft.icon, opening_balance: draft.openingBalance })
    // 改名只同步显示名（含只有账户名、没有 account_id 的旧流水），account_id 不变
    if (prev && prev.name !== draft.name) {
      transactions.filter(t => referencesAccount(t, prev)).forEach(t => updateTransaction(t.id, { account: draft.name }))
    }
  }

  /** 迁移引用：只改指向，不做任何余额加减（余额由派生自动跟着变） */
  const handleMigrateAccount = (sourceId: string, targetId: string) => {
    const source = accounts.find(a => a.id === sourceId)
    const target = accounts.find(a => a.id === targetId)
    if (!source || !target) return
    const plan = planAccountMigration(source, target, transactions, recurrings)
    plan.transactions.forEach(patch => updateTransaction(patch.id, { account: patch.account, account_id: patch.account_id }))
    plan.recurrings.forEach(patch => updateRecurring(patch.id, { account: patch.account, account_id: patch.account_id }))
  }

  /** 删除收支分类：先把引用流水落到「未分类」，再删分类本身 */
  const handleDeleteCategory = (id: string, patches: CategoryRefPatch[]) => {
    patches.forEach(patch => updateTransaction(patch.id, { category: patch.category }))
    deleteFinanceCategory(id)
  }

  /** 改名同步历史流水，避免旧快照变成「未分类」 */
  const handleUpdateCategory = (id: string, patch: { name: string; color: string; icon: string }) => {
    const prev = financeCategories.find(c => c.id === id)
    updateFinanceCategory(id, patch)
    if (prev) {
      planCategoryRename(prev, patch.name, transactions).forEach(item => updateTransaction(item.id, { category: item.category }))
    }
  }

  const tabs: [Tab, string][] = [
    ['records', '流水'],
    ['stats', '统计'],
    ['budget', '预算'],
    ['accounts', '账户'],
    ['categories', '收支分类'],
    ['recurring', '周期账单'],
    ['yearly', '年度'],
  ]

  return (
    <div className="finance-page">
      <div className="fin-switcher">
        <span className="fin-switcher-label">账户</span>
        <select className="select" value={selectedAccountId} onChange={e => pickAccount(e.target.value)}>
          <option value="all">全部账户</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.icon} {a.name} · {formatCNY(currentBalance(a, ledger))}</option>
          ))}
        </select>
        <span className="fin-switcher-hint">切换只影响本页统计，不改任何数据</span>
      </div>

      <div className="card" style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              <button onClick={() => { const el = document.createElement('input'); el.type = 'month'; el.value = month; el.onchange = (e: any) => setMonth(e.target.value); el.showPicker && el.showPicker() }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>{month} ▾</button>
              {selectedAccount && <span className="fin-scope-tag">{selectedAccount.name} · {month}</span>}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{formatCNY(mExp)}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>本月支出 · 收入 {formatCNY(mInc)} · 结余 {formatCNY(mSummary.net)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ background: '#fff', color: '#059669', fontWeight: 700 }} onClick={() => openAdd('expense')}>记支出</button>
            <button className="btn" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }} onClick={() => openAdd('income')}>记收入</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {tabs.map(([id, label]) => <button key={id} className={`btn ${tab === id ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setTab(id)}>{label}</button>)}
          </div>
        </div>

        {tab === 'records' && (
          <>
            {[...mTx].sort((a, b) => b.date.localeCompare(a.date)).map(t => {
              const unassigned = accountNameOf(t) === '未归属'
              return (
                <div key={t.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openEdit(t)}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.type === 'expense' ? '#fee2e2' : '#dcfce7', display: 'flex', justifyContent: 'center', fontSize: 16 }}>{t.type === 'expense' ? '💸' : '💰'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>
                      {categoryLabel(t.category, financeCategories)}
                      {t.recurring_id && <span className="fin-recurring-tag">周期</span>}
                      {t.note && <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>{t.note}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {t.date} · {unassigned ? <span className="fin-unassigned">未归属</span> : accountNameOf(t)}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: t.type === 'expense' ? '#ef4444' : '#22c55e' }}>{t.type === 'expense' ? '-' : '+'}{formatCNY(t.amount)}</div>
                  <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12, color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); deleteTransaction(t.id) }}>×</button>
                </div>
              )
            })}
            {mTx.length === 0 && <div className="empty">本月暂无记录</div>}
          </>
        )}

        {tab === 'stats' && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>支出分类</div>
            {byCat.map(([cat, amount]) => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>{cat}</span><span>{formatCNY(amount)} ({mExp > 0 ? ((amount / mExp) * 100).toFixed(0) : 0}%)</span></div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${mExp > 0 ? (amount / mExp) * 100 : 0}%`, background: '#10b981' }} /></div>
              </div>
            ))}
            {byCat.length === 0 && <div className="empty">暂无数据</div>}
          </div>
        )}

        {tab === 'budget' && (
          <div>
            {expCats.map(cat => {
              const spent = mTx.filter(t => t.type === 'expense' && t.category === cat.name).reduce((s, t) => s + t.amount, 0)
              const b = 500
              return (
                <div key={cat.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{cat.icon} {cat.name}</span><span>{formatCNY(spent)}/{formatCNY(b)}</span></div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}><div style={{ height: '100%', width: `${Math.min(100, (spent / b) * 100)}%`, background: spent > b ? '#ef4444' : '#10b981' }} /></div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'accounts' && (
          <AccountsPanel
            accounts={accounts}
            transactions={transactions}
            recurrings={recurrings}
            ledger={ledger}
            onAdd={handleAddAccount}
            onUpdate={handleUpdateAccount}
            onDelete={deleteAccount}
            onMigrate={handleMigrateAccount}
          />
        )}

        {tab === 'categories' && (
          <CategoriesPanel
            categories={financeCategories}
            transactions={transactions}
            onAdd={draft => addFinanceCategory(draft)}
            onUpdate={handleUpdateCategory}
            onDelete={handleDeleteCategory}
          />
        )}

        {tab === 'recurring' && (
          <RecurringPanel
            recurrings={recurrings}
            accounts={accounts}
            categories={financeCategories}
            onCreate={addRecurring}
            onUpdate={updateRecurring}
            onDelete={deleteRecurring}
          />
        )}

        {tab === 'yearly' && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>{month.slice(0, 4)}年度收支{selectedAccount ? ` · ${selectedAccount.name}` : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {Object.entries(yearlyData).map(([m, d]) => (
                <div key={m} className="card" style={{ margin: 0, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{m.slice(5)}月</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>支{formatCNY(d.exp)}</div>
                  <div style={{ fontSize: 12, color: '#22c55e' }}>收{formatCNY(d.inc)}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8, display: 'flex', justifyContent: 'space-around' }}>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: '#94a3b8' }}>年度总支出</div><div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{formatCNY(Object.values(yearlyData).reduce((s, d) => s + d.exp, 0))}</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: '#94a3b8' }}>年度总收入</div><div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{formatCNY(Object.values(yearlyData).reduce((s, d) => s + d.inc, 0))}</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: '#94a3b8' }}>年度结余</div><div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{formatCNY(Object.values(yearlyData).reduce((s, d) => s + d.inc, 0) - Object.values(yearlyData).reduce((s, d) => s + d.exp, 0))}</div></div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={show}
        title={editing ? '编辑' : '记一笔'}
        onClose={() => setShow(false)}
        actions={
          <>
            {editing && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => { deleteTransaction(editing.id); setShow(false) }}>删除</button>}
            <button className="btn btn-ghost" onClick={() => setShow(false)}>取消</button>
            <button className="btn btn-primary" onClick={saveTx}>保存</button>
          </>
        }
      >
        <div className="finance-page">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`btn ${form.type === 'expense' ? 'btn-danger' : 'btn-outline'}`}
                style={{ flex: 1 }}
                onClick={() => {
                  const cats = categoriesFor('expense')
                  setForm({ ...form, type: 'expense', category: cats.some(c => c.name === form.category) ? form.category : (cats[0]?.name || '') })
                }}
              >支出</button>
              <button
                className={`btn ${form.type === 'income' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1 }}
                onClick={() => {
                  const cats = categoriesFor('income')
                  setForm({ ...form, type: 'income', category: cats.some(c => c.name === form.category) ? form.category : (cats[0]?.name || '') })
                }}
              >收入</button>
            </div>
            <div>
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="金额"
                value={form.amount}
                onChange={e => { setForm({ ...form, amount: e.target.value }); setAmountError('') }}
                autoFocus
              />
              {amountError && <div className="fin-error">{amountError}</div>}
            </div>
            <select className="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">未分类</option>
              {categoriesFor(form.type).map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              {accounts.length > 0 ? (
                <select className="select" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                </select>
              ) : null}
              <input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            {accounts.length === 0 && (
              <div className="fin-inline-account">
                <div className="fin-inline-tip">还没有账户：保存时会自动创建「现金」，也可以先填写下面的信息。</div>
                <div className="fin-form-row">
                  <input className="input" placeholder="账户名称（默认 现金）" value={newAccount.name} onChange={e => setNewAccount({ ...newAccount, name: e.target.value })} />
                  <input className="input" style={{ width: 64 }} placeholder="图标" value={newAccount.icon} onChange={e => setNewAccount({ ...newAccount, icon: e.target.value })} />
                  <input className="input" type="number" step="0.01" style={{ width: 100 }} placeholder="期初" value={newAccount.opening} onChange={e => setNewAccount({ ...newAccount, opening: e.target.value })} />
                </div>
              </div>
            )}
            <input className="input" placeholder="备注（可选）" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
