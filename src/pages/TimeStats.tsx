import { useState, useMemo } from 'react'
import { useData } from '../context/DataContext'
import dayjs from 'dayjs'

export default function TimeStats() {
  const { timeBlocks, addTimeBlock, updateTimeBlock, deleteTimeBlock, categories } = useData()
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [showDP, setShowDP] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ title: '', start: 9, end: 10, category: '学习' })
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const catColor = (n: string) => categories.find(c => c.name === n)?.color || '#94a3b8'
  const dayBlocks = useMemo(() => timeBlocks.filter(b => b.date === date), [timeBlocks, date])
  const stats = useMemo(() => {
    const total = dayBlocks.reduce((s, b) => s + (b.end - b.start), 0)
    const byCat: Record<string, number> = {}
    dayBlocks.forEach(b => { byCat[b.category] = (byCat[b.category] || 0) + (b.end - b.start) })
    return { total, byCat }
  }, [dayBlocks])

  const toggleSel = (id: string) => {
    const ns = new Set(selected)
    if (ns.has(id)) ns.delete(id)
    else ns.add(id)
    setSelected(ns)
  }
  const batchDelete = () => {
    if (selected.size === 0) return
    if (!confirm(`确定删除选中的${selected.size}条记录？`)) return
    selected.forEach(id => deleteTimeBlock(id))
    setSelected(new Set())
    setBatchMode(false)
  }
  const openAdd = () => {
    setEditing(null)
    setForm({ title: '', start: 9, end: 10, category: categories[0]?.name || '学习' })
    setShowAdd(true)
  }
  const openEdit = (b: any) => {
    setEditing(b)
    setForm({ title: b.title, start: b.start, end: b.end, category: b.category })
    setShowAdd(true)
  }
  const save = () => {
    if (!form.title.trim() || form.end <= form.start) return
    if (editing) updateTimeBlock(editing.id, form)
    else addTimeBlock({ ...form, date })
    setShowAdd(false)
  }

  const PieWheel = () => {
    const size = 320, cx = size / 2, cy = size / 2, r = 130, rInner = 75
    let angle = -Math.PI / 2
    const segs = dayBlocks.map(b => {
      const a = ((b.end - b.start) / 24) * Math.PI * 2
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
      const x2 = cx + r * Math.cos(angle + a), y2 = cy + r * Math.sin(angle + a)
      const xi1 = cx + rInner * Math.cos(angle), yi1 = cy + rInner * Math.sin(angle)
      const xi2 = cx + rInner * Math.cos(angle + a), yi2 = cy + rInner * Math.sin(angle + a)
      const large = a > Math.PI ? 1 : 0
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${rInner} ${rInner} 0 ${large} 0 ${xi1} ${yi1} Z`
      angle += a
      return { d, color: catColor(b.category), title: b.title }
    })
    const nowH = dayjs().hour() + dayjs().minute() / 60
    const nowA = (nowH / 24) * Math.PI * 2 - Math.PI / 2
    const ticks = Array.from({ length: 24 }).map((_, h) => {
      const a = (h / 24) * Math.PI * 2 - Math.PI / 2
      const x1 = cx + (r + 8) * Math.cos(a), y1 = cy + (r + 8) * Math.sin(a)
      const x2 = cx + (r + 14) * Math.cos(a), y2 = cy + (r + 14) * Math.sin(a)
      const tx = cx + (r + 24) * Math.cos(a), ty = cy + (r + 24) * Math.sin(a)
      return (
        <g key={h}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth={h % 6 === 0 ? 2 : 1} />
          {h % 3 === 0 && <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#94a3b8">{h}</text>}
        </g>
      )
    })
    return (
      <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
        {ticks}
        <circle cx={cx} cy={cy} r={r} fill="#f8fafc" />
        {segs.map((s, i) => <path key={i} d={s.d} fill={s.color} opacity={0.85} />)}
        <circle cx={cx} cy={cy} r={rInner} fill="#fff" />
        <line x1={cx} y1={cy} x2={cx + r * Math.cos(nowA)} y2={cy + r * Math.sin(nowA)} stroke="#ef4444" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="5" fill="#ef4444" />
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize="13" fill="#64748b">{dayjs().format('HH:mm')}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="20" fontWeight="800" fill="#1e293b">{stats.total.toFixed(1)}h</text>
        <text x={cx} y={cy + 30} textAnchor="middle" fontSize="11" fill="#94a3b8">已记录 {((stats.total / 24) * 100).toFixed(0)}%</text>
      </svg>
    )
  }

  return (
    <div className="card">
      <div className="card-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-outline" onClick={() => setShowDP(!showDP)}>📅 {dayjs(date).format('YYYY年M月D日')} ▾</button>
          {showDP && <input type="date" className="input" style={{ width: 160 }} value={date} onChange={e => { setDate(e.target.value); setShowDP(false) }} autoFocus />}
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ 添加记录</button>
      </div>
      <PieWheel />
      <div style={{ marginTop: 20, maxWidth: 500, margin: '20px auto 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>分类统计</div>
        {Object.entries(stats.byCat).map(([cat, hours]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: catColor(cat) }} />
            <span style={{ flex: 1 }}>{cat}</span>
            <span style={{ fontWeight: 600 }}>{hours.toFixed(1)}h</span>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>{stats.total > 0 ? ((hours / stats.total) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
        {Object.keys(stats.byCat).length === 0 && <div className="empty">暂无记录，点击右上角添加</div>}
      </div>
      <div style={{ marginTop: 20, maxWidth: 500, margin: '20px auto 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>记录明细</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {batchMode && <>
              <span style={{ fontSize: 12, color: '#64748b' }}>已选{selected.size}</span>
              <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={batchDelete}>删除</button>
            </>}
            <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setBatchMode(!batchMode); setSelected(new Set()) }}>{batchMode ? '取消' : '批量'}</button>
          </div>
        </div>
        {dayBlocks.map(b => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: selected.has(b.id) ? '#dbeafe' : '#f8fafc', borderRadius: 8, marginBottom: 6, cursor: 'pointer' }} onClick={() => batchMode ? toggleSel(b.id) : openEdit(b)}>
            {batchMode && <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSel(b.id)} onClick={e => e.stopPropagation()} />}
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: catColor(b.category), flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{b.title}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>{b.start}:00-{b.end}:00</span>
            <span className="tag" style={{ background: '#e0e7ff', color: '#4338ca' }}>{b.category}</span>
            <span style={{ fontWeight: 600 }}>{(b.end - b.start).toFixed(1)}h</span>
          </div>
        ))}
        {dayBlocks.length === 0 && <div className="empty">暂无记录</div>}
      </div>
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? '编辑' : '添加'}时间记录</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input" placeholder="做了什么？" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12 }}>开始（时）</label>
                  <input type="number" className="input" min="0" max="23" value={form.start} onChange={e => setForm({ ...form, start: +e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12 }}>结束（时）</label>
                  <input type="number" className="input" min="1" max="24" value={form.end} onChange={e => setForm({ ...form, end: +e.target.value })} />
                </div>
              </div>
              <select className="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {categories.map(c => <option key={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              {editing && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => { deleteTimeBlock(editing.id); setShowAdd(false) }}>删除</button>}
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>取消</button>
              <button className="btn btn-primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}