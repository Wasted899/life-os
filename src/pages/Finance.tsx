import { useState, useMemo } from 'react'
import { useData } from '../context/DataContext'
import dayjs from 'dayjs'

export default function Finance() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, financeCategories, addFinanceCategory, deleteFinanceCategory, accounts, addAccount, deleteAccount, recurrings, addRecurring, deleteRecurring } = useData()
  const [tab, setTab] = useState<'records' | 'stats' | 'budget' | 'accounts' | 'recurring' | 'yearly'>('records')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ type: 'expense', category: '餐饮', amount: '', account: '微信', date: dayjs().format('YYYY-MM-DD'), note: '' })
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [showCatMgr, setShowCatMgr] = useState(false)
  const [newCat, setNewCat] = useState({ name: '', type: 'expense' as 'expense' | 'income', color: '#94a3b8', icon: '📦' })
  const [newAcct, setNewAcct] = useState({ name: '', balance: 0, icon: '💳' })
  const [newRec, setNewRec] = useState({ name: '', amount: 0, cycle: 'monthly' as 'monthly' | 'yearly', day: 1, category: '其他', account: '微信' })

  const expCats = financeCategories.filter(c => c.type === 'expense')
  const incCats = financeCategories.filter(c => c.type === 'income')
  const mTx = transactions.filter(t => t.date.startsWith(month))
  const mExp = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const mInc = mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
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

  const openAdd = (type?: string) => {
    setEditing(null)
    setForm({ type: type || 'expense', category: type === 'income' ? (incCats[0]?.name || '生活费') : (expCats[0]?.name || '餐饮'), amount: '', account: '微信', date: dayjs().format('YYYY-MM-DD'), note: '' })
    setShow(true)
  }
  const openEdit = (t: any) => {
    setEditing(t)
    setForm({ type: t.type, category: t.category, amount: String(t.amount), account: t.account, date: t.date, note: t.note || '' })
    setShow(true)
  }
  const save = () => {
    if (!form.amount || isNaN(+form.amount)) return
    if (editing) updateTransaction(editing.id, { ...form, amount: +form.amount })
    else addTransaction({ ...form, amount: +form.amount })
    setShow(false)
  }
  const addCat = () => {
    if (!newCat.name.trim()) return
    addFinanceCategory(newCat)
    setNewCat({ name: '', type: 'expense', color: '#94a3b8', icon: '📦' })
  }
  const addAcct = () => {
    if (!newAcct.name.trim()) return
    addAccount(newAcct)
    setNewAcct({ name: '', balance: 0, icon: '💳' })
  }
  const addRec = () => {
    if (!newRec.name.trim()) return
    addRecurring({ ...newRec, start_date: dayjs().format('YYYY-MM-DD') })
    setNewRec({ name: '', amount: 0, cycle: 'monthly', day: 1, category: '其他', account: '微信' })
  }

  const tabs: [string, string][] = [['records', '流水'], ['stats', '统计'], ['budget', '预算'], ['accounts', '账户'], ['recurring', '周期账单'], ['yearly', '年度']]

  return (
    <div>
      <div className="card" style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              <button onClick={() => { const el = document.createElement('input'); el.type = 'month'; el.value = month; el.onchange = (e: any) => setMonth(e.target.value); el.showPicker && el.showPicker() }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>{month} ▾</button>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>¥{mExp.toFixed(2)}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>本月支出 · 收入 ¥{mInc.toFixed(2)} · 结余 ¥{(mInc - mExp).toFixed(2)}</div>
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
            {mTx.sort((a, b) => b.date.localeCompare(a.date)).map(t => (
              <div key={t.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openEdit(t)}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.type === 'expense' ? '#fee2e2' : '#dcfce7', display: 'flex', justifyContent: 'center', fontSize: 16 }}>{t.type === 'expense' ? '💸' : '💰'}</div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{t.category}{t.note && <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>{t.note}</span>}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{t.date} · {t.account}</div></div>
                <div style={{ fontWeight: 700, color: t.type === 'expense' ? '#ef4444' : '#22c55e' }}>{t.type === 'expense' ? '-' : '+'}¥{t.amount.toFixed(2)}</div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>{cat}</span><span>¥{amount.toFixed(2)} ({mExp > 0 ? ((amount / mExp) * 100).toFixed(0) : 0}%)</span></div>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{cat.icon} {cat.name}</span><span>¥{spent.toFixed(0)}/¥{b}</span></div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}><div style={{ height: '100%', width: `${Math.min(100, (spent / b) * 100)}%`, background: spent > b ? '#ef4444' : '#10b981' }} /></div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'accounts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div><span style={{ fontSize: 13, color: '#64748b' }}>总资产</span><div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>¥{totalBalance.toFixed(2)}</div></div>
            </div>
            {accounts.map((a: any) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: '50%', background: '#dbeafe', display: 'flex', justifyContent: 'center', fontSize: 18 }}>{a.icon}</div><div style={{ fontWeight: 600 }}>{a.name}</div></div>
                <div style={{ fontWeight: 700 }}>¥{a.balance.toFixed(2)}</div>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', color: '#ef4444' }} onClick={() => deleteAccount(a.id)}>×</button>
              </div>
            ))}
            {accounts.length === 0 && <div className="empty">暂无账户</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input className="input" placeholder="账户名称" value={newAcct.name} onChange={e => setNewAcct({ ...newAcct, name: e.target.value })} style={{ flex: 1 }} />
              <input className="input" type="number" placeholder="余额" value={newAcct.balance || ''} onChange={e => setNewAcct({ ...newAcct, balance: +e.target.value })} style={{ width: 120 }} />
              <input className="input" placeholder="图标" value={newAcct.icon} onChange={e => setNewAcct({ ...newAcct, icon: e.target.value })} style={{ width: 60 }} />
              <button className="btn btn-primary" onClick={addAcct}>添加</button>
            </div>
          </div>
        )}

        {tab === 'recurring' && (
          <div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>定期自动扣款/收入提醒</div>
            {recurrings.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 8, marginBottom: 8 }}>
                <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{r.cycle === 'monthly' ? '每月' : '每年'}{r.day}日 · {r.category} · {r.account}</div></div>
                <div style={{ fontWeight: 700, color: '#ef4444' }}>¥{r.amount.toFixed(2)}</div>
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
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>支¥{d.exp.toFixed(0)}</div>
                  <div style={{ fontSize: 12, color: '#22c55e' }}>收¥{d.inc.toFixed(0)}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8, display: 'flex', justifyContent: 'space-around' }}>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: '#94a3b8' }}>年度总支出</div><div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>¥{Object.values(yearlyData).reduce((s, d) => s + d.exp, 0).toFixed(2)}</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: '#94a3b8' }}>年度总收入</div><div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>¥{Object.values(yearlyData).reduce((s, d) => s + d.inc, 0).toFixed(2)}</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: '#94a3b8' }}>年度结余</div><div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>¥{(Object.values(yearlyData).reduce((s, d) => s + d.inc, 0) - Object.values(yearlyData).reduce((s, d) => s + d.exp, 0)).toFixed(2)}</div></div>
            </div>
          </div>
        )}
      </div>

      {show && (
        <div className="modal-overlay" onClick={() => setShow(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? '编辑' : '记一笔'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn ${form.type === 'expense' ? 'btn-danger' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setForm({ ...form, type: 'expense', category: expCats[0]?.name || '餐饮' })}>支出</button>
                <button className={`btn ${form.type === 'income' ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1 }} onClick={() => setForm({ ...form, type: 'income', category: incCats[0]?.name || '生活费' })}>收入</button>
              </div>
              <input className="input" type="number" placeholder="金额" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} autoFocus />
              <select className="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{(form.type === 'expense' ? expCats : incCats).map(c => <option key={c.id}>{c.name}</option>)}</select>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="select" value={form.account} onChange={e => setForm({ ...form, account: e.target.value })}>{['微信', '支付宝', '现金', '银行卡', '其他'].map(a => <option key={a}>{a}</option>)}</select>
                <input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <input className="input" placeholder="备注（可选）" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </div>
            <div className="modal-actions">
              {editing && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => { deleteTransaction(editing.id); setShow(false) }}>删除</button>}
              <button className="btn btn-ghost" onClick={() => setShow(false)}>取消</button>
              <button className="btn btn-primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}