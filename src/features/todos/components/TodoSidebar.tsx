import type {ReactNode} from 'react'
import type {Category,TodoList} from '../../../core/types'
import type {TodoScope} from '../types'

export type ManagerKind = 'list' | 'category'

type Props = {
  lists: TodoList[]
  categories: Category[]
  activeList: string
  scope: TodoScope
  unscheduledCount: number
  onSelectList: (id: string) => void
  /** 独立入口：只显示 due_date 为空的待办 */
  onSelectUnscheduled: () => void
  /** 打开完整 CRUD 面板（清单 / 分类） */
  onOpenManager: (kind: ManagerKind) => void
  collapsed: Record<string, boolean>
  onToggleCollapse: (key: string) => void
}

const LISTS_KEY = 'sidebar:lists'
const CATEGORIES_KEY = 'sidebar:categories'

const Section = ({
  sectionKey,
  label,
  count,
  collapsed,
  onToggleCollapse,
  children,
}: {
  sectionKey: string
  label: string
  count: number
  collapsed: Record<string, boolean>
  onToggleCollapse: (key: string) => void
  children: ReactNode
}) => (
  <div>
    <div className="collapse-header" onClick={() => onToggleCollapse(sectionKey)}>
      <span>{label} ({count})</span>
      <span className={`collapse-arrow ${collapsed[sectionKey] ? 'collapsed' : ''}`}>▼</span>
    </div>
    {!collapsed[sectionKey] && children}
  </div>
)

/**
 * 清单/分类侧栏：只做选择与入口。
 * 新建/改名/改色/改图标/删除统一收口到 ListManager / CategoryManager。
 */
export default function TodoSidebar({
  lists,
  categories,
  activeList,
  scope,
  unscheduledCount,
  onSelectList,
  onSelectUnscheduled,
  onOpenManager,
  collapsed,
  onToggleCollapse,
}: Props) {
  const dateScope = scope === 'date'
  return (
    <div className="card" style={{padding:12}}>
      <Section sectionKey={LISTS_KEY} label="我的清单" count={lists.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
        <div
          className="sidebar-item"
          style={{padding:'6px 8px',borderRadius:6,cursor:'pointer',background:dateScope && activeList === 'all' ? 'var(--primary)' : 'transparent',color:dateScope && activeList === 'all' ? '#fff' : '#334155'}}
          onClick={() => onSelectList('all')}
        >
          📥 全部任务
        </div>
        {lists.map(list => (
          <div
            key={list.id}
            className="sidebar-item"
            style={{padding:'6px 8px',borderRadius:6,cursor:'pointer',background:dateScope && activeList === list.id ? 'var(--primary)' : 'transparent',color:dateScope && activeList === list.id ? '#fff' : '#334155'}}
            onClick={() => onSelectList(list.id)}
          >
            {list.icon} {list.name}
          </div>
        ))}
        <div
          className="sidebar-item"
          style={{padding:'6px 8px',borderRadius:6,cursor:'pointer',marginTop:4,background:scope === 'unscheduled' ? 'var(--primary)' : 'transparent',color:scope === 'unscheduled' ? '#fff' : '#334155'}}
          onClick={onSelectUnscheduled}
        >
          🗂️ 未排期 ({unscheduledCount})
        </div>
        <button
          className="btn btn-ghost"
          style={{marginTop:6,padding:'2px 6px',fontSize:11,width:'100%'}}
          onClick={() => onOpenManager('list')}
        >
          管理清单
        </button>
      </Section>

      <Section sectionKey={CATEGORIES_KEY} label="任务分类" count={categories.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
        {categories.length === 0 && <div style={{fontSize:12,color:'#94a3b8',padding:'4px 8px'}}>暂无分类</div>}
        {categories.map(category => (
          <div key={category.id} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 8px'}}>
            <div style={{width:10,height:10,borderRadius:2,background:category.color}}/>
            <span style={{fontSize:12,color:'#334155'}}>{category.icon ? `${category.icon} ` : ''}{category.name}</span>
          </div>
        ))}
        <button
          className="btn btn-ghost"
          style={{marginTop:6,padding:'2px 6px',fontSize:11,width:'100%'}}
          onClick={() => onOpenManager('category')}
        >
          管理分类
        </button>
      </Section>
    </div>
  )
}
