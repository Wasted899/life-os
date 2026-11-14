import {useState} from 'react'
import type {TodoList} from '../../../core/types'
import {DEFAULT_LIST_COLOR,DEFAULT_LIST_ICON,clampIcon,normalizeColor} from '../utils'
import Modal from '../../../core/ui/Modal'

export type ListDraft = {name: string; color: string; icon: string}

type Props = {
  lists: TodoList[]
  /** key: list.id → 该清单下的待办条数（删除确认展示用） */
  counts: Record<string, number>
  onClose: () => void
  /** 成功返回 null，失败返回提示文案（重名等） */
  onCreate: (draft: ListDraft) => string | null
  onUpdate: (id: string, draft: ListDraft) => string | null
  /** 页面负责"先迁移待办到 inbox，再删除清单" */
  onDelete: (id: string) => void
}

const emptyDraft = (): ListDraft => ({name:'',color:DEFAULT_LIST_COLOR,icon:DEFAULT_LIST_ICON})

/** 清单管理面板：只管编辑态与展示，数据校验/落库由 TodosPage 注入 */
export default function ListManager({lists,counts,onClose,onCreate,onUpdate,onDelete}: Props) {
  const [creating,setCreating] = useState(false)
  const [createDraft,setCreateDraft] = useState<ListDraft>(emptyDraft)
  const [editingId,setEditingId] = useState<string | null>(null)
  const [editDraft,setEditDraft] = useState<ListDraft>(emptyDraft)
  const [message,setMessage] = useState('')

  const startEdit = (list: TodoList) => {
    setEditingId(list.id)
    setEditDraft({
      name:list.name,
      color:normalizeColor(list.color,DEFAULT_LIST_COLOR),
      icon:list.icon || DEFAULT_LIST_ICON,
    })
    setMessage('')
  }

  const submitCreate = () => {
    const error = onCreate(createDraft)
    if (error) {
      setMessage(error)
      return
    }
    setMessage('')
    setCreateDraft(emptyDraft())
    setCreating(false)
  }

  const submitEdit = (id: string) => {
    const error = onUpdate(id,editDraft)
    if (error) {
      setMessage(error)
      return
    }
    setMessage('')
    setEditingId(null)
  }

  const confirmDelete = (list: TodoList) => {
    const affected = counts[list.id] ?? 0
    const tip = affected > 0
      ? `清单「${list.name}」下有 ${affected} 项待办，删除后这些待办会移入「收集箱」。确定删除该清单？`
      : `确定删除清单「${list.name}」？`
    if (window.confirm(tip)) onDelete(list.id)
  }

  const fields = (draft: ListDraft,setDraft: (next: ListDraft) => void) => (
    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
      <input
        className="input"
        style={{width:130}}
        placeholder="清单名称"
        value={draft.name}
        onChange={e => {
          setDraft({...draft,name:e.target.value})
          setMessage('')
        }}
      />
      <input
        type="color"
        aria-label="清单颜色"
        value={normalizeColor(draft.color,DEFAULT_LIST_COLOR)}
        onChange={e => setDraft({...draft,color:e.target.value})}
        style={{width:32,height:30,padding:0,border:'none',background:'none'}}
      />
      <input
        className="input"
        style={{width:60}}
        placeholder="图标"
        value={draft.icon}
        onChange={e => setDraft({...draft,icon:clampIcon(e.target.value)})}
      />
    </div>
  )

  return (
    <Modal
      open
      title="清单管理"
      onClose={onClose}
      style={{width:520}}
      actions={<button className="btn btn-ghost" onClick={onClose}>关闭</button>}
    >

        {!creating && (
          <button className="btn btn-primary" style={{marginBottom:8}} onClick={() => {setCreating(true);setMessage('')}}>＋ 新建清单</button>
        )}
        {creating && (
          <div style={{border:'1px dashed #cbd5e1',borderRadius:8,padding:10,marginBottom:10}}>
            {fields(createDraft,setCreateDraft)}
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <button className="btn btn-primary" style={{padding:'4px 12px'}} onClick={submitCreate}>创建</button>
              <button className="btn btn-ghost" style={{padding:'4px 12px'}} onClick={() => {setCreating(false);setCreateDraft(emptyDraft());setMessage('')}}>取消</button>
            </div>
          </div>
        )}

        {message && <div style={{fontSize:12,color:'#ef4444',marginBottom:8}}>{message}</div>}

        {lists.map(list => (
          <div key={list.id} style={{borderTop:'1px solid #f1f5f9',padding:'8px 0'}}>
            {editingId === list.id ? (
              <>
                {fields(editDraft,setEditDraft)}
                <div style={{display:'flex',gap:8,marginTop:6}}>
                  <button className="btn btn-primary" style={{padding:'2px 10px',fontSize:12}} onClick={() => submitEdit(list.id)}>保存</button>
                  <button className="btn btn-ghost" style={{padding:'2px 10px',fontSize:12}} onClick={() => {setEditingId(null);setMessage('')}}>取消</button>
                </div>
              </>
            ) : (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:18}}>{list.icon}</span>
                <span style={{flex:1}}>
                  {list.name}
                  <span style={{fontSize:11,color:'#94a3b8',marginLeft:6}}>{counts[list.id] ?? 0} 项</span>
                  {list.id === 'inbox' && <span style={{fontSize:11,color:'#64748b',marginLeft:6}}>（默认清单，可改名不可删除）</span>}
                </span>
                <span style={{width:14,height:14,borderRadius:3,background:list.color,border:'1px solid #e2e8f0'}}/>
                <button className="btn btn-ghost" style={{padding:'2px 8px',fontSize:12}} onClick={() => startEdit(list)}>编辑</button>
                <button
                  className="btn btn-ghost"
                  style={{padding:'2px 8px',fontSize:12,color:list.id === 'inbox' ? '#cbd5e1' : '#ef4444'}}
                  disabled={list.id === 'inbox'}
                  title={list.id === 'inbox' ? '收集箱是默认清单，可改名但不可删除' : '删除清单'}
                  onClick={() => confirmDelete(list)}
                >
                  删除
                </button>
              </div>
            )}
          </div>
        ))}
    </Modal>
  )
}
