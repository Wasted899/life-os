import {useState} from 'react'
import type {Category} from '../../../core/types'
import {DEFAULT_CATEGORY_COLOR,clampIcon,hasDuplicateCategoryName,normalizeColor,normalizeName} from '../utils'
import Modal from '../../../core/ui/Modal'

export type CategoryDraft = {name: string; color: string; icon: string}

type Props = {
  categories: Category[]
  /** key: category.id → 该分类下的待办条数（删除确认展示用） */
  counts: Record<string, number>
  onClose: () => void
  onCreate: (draft: CategoryDraft) => void
  onUpdate: (id: string, draft: CategoryDraft) => void
  /** 页面负责"先清空待办 category_id，再删除分类" */
  onDelete: (id: string) => void
}

const emptyDraft = (): CategoryDraft => ({name:'',color:DEFAULT_CATEGORY_COLOR,icon:''})

/** 分类管理面板：允许重名，但给同名提示；数据落库由 TodosPage 注入 */
export default function CategoryManager({categories,counts,onClose,onCreate,onUpdate,onDelete}: Props) {
  const [creating,setCreating] = useState(false)
  const [createDraft,setCreateDraft] = useState<CategoryDraft>(emptyDraft)
  const [editingId,setEditingId] = useState<string | null>(null)
  const [editDraft,setEditDraft] = useState<CategoryDraft>(emptyDraft)
  const [notice,setNotice] = useState('')

  const createDuplicate = hasDuplicateCategoryName(categories,createDraft.name)
  const editDuplicate = editingId ? hasDuplicateCategoryName(categories,editDraft.name,editingId) : false

  const startEdit = (category: Category) => {
    setEditingId(category.id)
    setEditDraft({
      name:category.name,
      color:normalizeColor(category.color,DEFAULT_CATEGORY_COLOR),
      icon:category.icon || '',
    })
    setNotice('')
  }

  const submitCreate = () => {
    const name = normalizeName(createDraft.name)
    if (!name) return
    onCreate(createDraft)
    setNotice(createDuplicate ? `已创建同名分类「${name}」，请注意区分` : `已创建分类「${name}」`)
    setCreateDraft(emptyDraft())
    setCreating(false)
  }

  const submitEdit = (id: string) => {
    if (!normalizeName(editDraft.name)) return
    onUpdate(id,editDraft)
    setNotice(editDuplicate ? '已保存，存在同名分类，请注意区分' : '')
    setEditingId(null)
  }

  const confirmDelete = (category: Category) => {
    const affected = counts[category.id] ?? 0
    const tip = affected > 0
      ? `分类「${category.name}」下有 ${affected} 项待办，删除后这些待办会变为「未分类」。确定删除该分类？`
      : `确定删除分类「${category.name}」？`
    if (window.confirm(tip)) onDelete(category.id)
  }

  const fields = (draft: CategoryDraft,setDraft: (next: CategoryDraft) => void,duplicate: boolean) => (
    <>
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <input
          className="input"
          style={{width:130}}
          placeholder="分类名称"
          value={draft.name}
          onChange={e => setDraft({...draft,name:e.target.value})}
        />
        <input
          type="color"
          aria-label="分类颜色"
          value={normalizeColor(draft.color,DEFAULT_CATEGORY_COLOR)}
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
      {duplicate && <div style={{fontSize:11,color:'#d97706',marginTop:4}}>已有同名分类（允许重名，建议改名区分）</div>}
    </>
  )

  return (
    <Modal
      open
      title="分类管理"
      onClose={onClose}
      style={{width:540}}
      actions={<button className="btn btn-ghost" onClick={onClose}>关闭</button>}
    >

        {!creating && (
          <button className="btn btn-primary" style={{marginBottom:8}} onClick={() => {setCreating(true);setNotice('')}}>＋ 新建分类</button>
        )}
        {creating && (
          <div style={{border:'1px dashed #cbd5e1',borderRadius:8,padding:10,marginBottom:10}}>
            {fields(createDraft,setCreateDraft,createDuplicate)}
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <button className="btn btn-primary" style={{padding:'4px 12px'}} onClick={submitCreate}>创建</button>
              <button className="btn btn-ghost" style={{padding:'4px 12px'}} onClick={() => {setCreating(false);setCreateDraft(emptyDraft());setNotice('')}}>取消</button>
            </div>
          </div>
        )}

        {notice && <div style={{fontSize:12,color:notice.startsWith('已创建同名') || notice.includes('存在同名') ? '#d97706' : '#16a34a',marginBottom:8}}>{notice}</div>}

        {categories.length === 0 && <div className="empty">还没有分类</div>}

        {categories.map(category => {
          const duplicate = hasDuplicateCategoryName(categories,category.name,category.id)
          return (
            <div key={category.id} style={{borderTop:'1px solid #f1f5f9',padding:'8px 0'}}>
              {editingId === category.id ? (
                <>
                  {fields(editDraft,setEditDraft,editDuplicate)}
                  <div style={{display:'flex',gap:8,marginTop:6}}>
                    <button className="btn btn-primary" style={{padding:'2px 10px',fontSize:12}} onClick={() => submitEdit(category.id)}>保存</button>
                    <button className="btn btn-ghost" style={{padding:'2px 10px',fontSize:12}} onClick={() => {setEditingId(null);setNotice('')}}>取消</button>
                  </div>
                </>
              ) : (
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:16}}>{category.icon || '🏷️'}</span>
                  <span style={{flex:1}}>
                    {category.name}
                    {duplicate && <span className="tag" style={{marginLeft:6,background:'#fef3c7',color:'#92400e'}}>同名</span>}
                    <span style={{fontSize:11,color:'#94a3b8',marginLeft:6}}>{counts[category.id] ?? 0} 项</span>
                  </span>
                  <span style={{width:14,height:14,borderRadius:3,background:category.color,border:'1px solid #e2e8f0'}}/>
                  <button className="btn btn-ghost" style={{padding:'2px 8px',fontSize:12}} onClick={() => startEdit(category)}>编辑</button>
                  <button className="btn btn-ghost" style={{padding:'2px 8px',fontSize:12,color:'#ef4444'}} onClick={() => confirmDelete(category)}>删除</button>
                </div>
              )}
            </div>
          )
        })}
    </Modal>
  )
}
