import { useState, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import Modal from '../../core/ui/Modal'
import { load, save } from '../../core/storage'
import dayjs from 'dayjs'
import type { AccountDraft } from './AccountsPanel'
import AccountsPanel from './AccountsPanel'
import { buildLedger } from './model/accounts'
import { monthSummary } from './model/selectors'
import { formatCNY, round2 } from './model/money'
import { planAccountMigration, referencesAccount, resolveDefaultAccountId } from './model/accountRules'
import type { Transaction } from '../../core/types'
import './finance.css'

/** F4 账户切换器尚未接入，当前恒为「全部账户」；接入后改为 state 即可 */
const SELECTED_ACCOUNT = 'all'

export default function Finance() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, financeCategories, addFinanceCategory, deleteFinanceCategory, accounts, addAccount, updateAccount, deleteAccount, recurrings, addRecurring, deleteRecurring, updateRecurring } = useData()
  const [tab, setTab] = useState<'records' | 'stats' | 'budget' | 'accounts' | 'recurring' | 'yearly'>('records')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState({ type: 'expense' as 'expense' | 'income', category: '餐饮', amount: '', account_id: '', date: dayjs().format('YYYY-MM-DD'), note: '' })
  const [amountError, setAmountError] = useState('')
  const [newAccount, setNewAccount] = useState({ name: '', icon: '💳', opening: '' })
  const [uiState, setUiState] = useState<{ lastAccountId?: string }>(() => load<{ lastAccountId?: string }>('p_finance_ui', {}))
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [showCatMgr, setShowCatMgr] = useState(false)
  const [newCat, setNewCat] = useState({ name: '', type: 'expense' as 'expense' | 'income', color: '#94a3b8', icon: '📦' })
  const [newRec, setNewRec] = useState({ name: '', amount: 0, cycle: 'monthly' as 'monthly' | 'yearly', day: 1, category: '其他', account: '微信' })

  /** 账户余额唯一来源：按全历史流水派生，任何增删改都自动重算 */
  const ledger = useMemo(() => buildLedger(transactions), [transactions])
  const expCats = financeCategories.filter(c => c.type === 'expense')
  const incCats = financeCategories.filter(c => c.type === 'income')
  const mTx = transactions.filter(t => t.date.startsWith(month))
  const mSummary = useMemo(() => monthSummary(transactions, month), [transactions, month])
  const mExp = mSummary.expense
  const mInc = mSummary.income
  const byCat = useMemo(() => {
    const m: Record<string, number> = {}
    mTx.filter(t => t.type === 'expense').forEach(t => { m[t.category] = (m[t.category] || 0) + t.amount })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [mTx])
  const yearlyData = useMemo(() => {
    const y = month.slice(0, 4)
    const m: Record<string, { exp: number; inc: number }> = {}
    for (let i = 1; i <= 12; i++) {
      const key = `${y}-${String(i).padStart(2, '0')}`
      const tx = transactions.filter(t => t.date.startsWith(key))
      m[key] = { exp: tx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), inc: tx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) }
    }
    return m
  }, [transactions, month])

  const rememberAccount = (id: string) => {
    const next = { ...uiState, lastAccountId: id }
    setUiState(next)
    save('p_finance_ui', next)
  }

  const accountNameOf = (t: Transaction) => accounts.find(a => a.id === t.account_id)?.name || t.account

  const openAdd = (type?: 'expense' | 'income') => {
    const nextType = type || 'expense'
    const defaultId = resolveDefaultAccountId(accounts, {
      selectedAccountId: SELECTED_ACCOUNT,
      lastAccountId: uiState.lastAccountId,
    })
    setEditing(null)
    setAmountError('')
    setNewAccount({ name: '', icon: '💳', opening: '' })
    setForm({
      type: nextType,
      category: nextType === 'income' ? (incCats[0]?.name || '生活费') : (expCats[0]?.name || '餐饮'),
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
      selectedAccountId: SELECTED_ACCOUNT,
      lastAccountId: uiState.lastAccountId,
    })
    setEditing(t)
    setAmountError('')
    setForm({
      type: t.type === 'income' ? 'income' : 'expense',
      category: t.category,
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

  const addCat = () => {
    if (!newCat.name.trim()) return
    addFinanceCategory(newCat)
    setNewCat({ name: '', type: 'expense', color: '#94a3b8', icon: '📦' })
  }

  const addRec = () => {
    if (!newRec.name.trim()) return
    addRecurring({ ...newRec, start_date: dayjs().format('YYYY-MM-DD') })
    setNewRec({ name: '', amount: 0, cycle: 'monthly', day: 1, category: '其他', account: '微信' })
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

  const tabs: [string, string][] = [['records', '流水'], ['stats', '统计'], ['budget', '预算'], ['accounts', '账户'], ['recurring', '周期账单'], ['yearly', '年度']]

  return (
    <div className="finance-page">
      <div className="card" style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              <button onClick={() => { const el = document.createElement('input'); el.type = 'month'; el.value = month; el.onchange = (e: any) => setMonth(e.target.value); el.showPicker && el.showPicker() }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>{month} ▾</button>
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
            {tabs.map(([id, label]) => <button key={id} className={`btn ${tab === id ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setTab(id as any)}>{label}</button>)}
          </div>
          {tab === 'records' && <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setShowCatMgr(!showCatMgr)}>分类管理</button>}
        </div>

        {tab === 'records' && (
          <>
            {showCatMgr && (
              <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>支出分类</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {expCats.map(c => <span key={c.id} className="tag" style={{ background: c.color + '22', color: c.color, padding: '4px 10px' }}>{c.icon} {c.name}<button style={{ background: 'none', border: 'none', color: '#ef4444', marginLeft: 6, cursor: 'pointer' }} onClick={() => deleteFinanceCategory(c.id)}>×</button></span>)}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>收入分类</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {incCats.map(c => <span key={c.id} className="tag" style={{ background: c.color + '22', color: c.color, padding: '4px 10px' }}>{c.icon} {c.name}<button style={{ background: 'none', border: 'none', color: '#ef4444', marginLeft: 6, cursor: 'pointer' }} onClick={() => deleteFinanceCategory(c.id)}>×</button></span>)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="input" style={{ flex: 1, minWidth: 100 }} placeholder="新分类名" value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} />
                  <select className="select" style={{ width: 100 }} value={newCat.type} onChange={e => setNewCat({ ...newCat, type: e.target.value as any })}><option value="expense">支出</option><option value="income">收入</option></select>
                  <input type="color" value={newCat.color} onChange={e => setNewCat({ ...newCat, color: e.target.value })} style={{ width: 36, height: 36, padding: 0, border: 'none' }} />
                  <input className="input" style={{ width: 60 }} placeholder="图标" value={newCat.icon} onChange={e => setNewCat({ ...newCat, icon: e.target.value })} />
                  <button className="btn btn-primary" onClick={addCat}>添加</button>
                </div>
              </div>
            )}
            {[...mTx].sort((a, b) => b.date.localeCompare(a.date)).map(t => (
              <div key={t.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openEdit(t)}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.type === 'expense' ? '#fee2e2' : '#dcfce7', display: 'flex', justifyContent: 'center', fontSize: 16 }}>{t.type === 'expense' ? '💸' : '💰'}</div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{t.category}{t.note && <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>{t.note}</span>}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{t.date} · {accountNameOf(t)}</div></div>
                <div style={{ fontWeight: 700, color: t.type === 'expense' ? '#ef4444' : '#22c55e' }}>{t.type === 'expense' ? '-' : '+'}{formatCNY(t.amount)}</div>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12, color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); deleteTransaction(t.id) }}>×</button>
              </div>
            ))}
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

        {tab === 'recurring' && (
          <div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>定期自动扣款/收入提醒</div>
            {recurrings.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 8, marginBottom: 8 }}>
                <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{r.cycle === 'monthly' ? '每月' : '每年'}{r.day}日 · {r.category} · {r.account}</div></div>
                <div style={{ fontWeight: 700, color: '#ef4444' }}>{formatCNY(r.amount)}</div>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', color: '#ef4444' }} onClick={() => deleteRecurring(r.id)}>×</button>
              </div>
            ))}
            {recurrings.length === 0 && <div className="empty">暂无周期账单</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
              <input className="input" placeholder="名称（如校园网）" value={newRec.name} onChange={e => setNewRec({ ...newRec, name: e.target.value })} />
              <input className="input" type="number" placeholder="金额" value={newRec.amount || ''} onChange={e => setNewRec({ ...newRec, amount: +e.target.value })} />
              <select className="select" value={newRec.cycle} onChange={e => setNewRec({ ...newRec, cycle: e.target.value as any })}><option value="monthly">每月</option><option value="yearly">每年</option></select>
              <input className="input" type="number" min="1" max="31" placeholder="日" value={newRec.day} onChange={e => setNewRec({ ...newRec, day: +e.target.value })} />
              <button className="btn btn-primary" onClick={addRec}>添加</button>
            </div>
          </div>
        )}

        {tab === 'yearly' && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>{month.slice(0, 4)}年度收支</div>
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
              <button className={`btn ${form.type === 'expense' ? 'btn-danger' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setForm({ ...form, type: 'expense', category: expCats[0]?.name || '餐饮' })}>支出</button>
              <button className={`btn ${form.type === 'income' ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setForm({ ...form, type: 'income', category: incCats[0]?.name || '生活费' })}>收入</button>
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
            <select className="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{(form.type === 'expense' ? expCats : incCats).map(c => <option key={c.id}>{c.name}</option>)}</select>
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
