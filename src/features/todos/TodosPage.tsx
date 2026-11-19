import {useEffect,useMemo,useState} from 'react'
import dayjs from 'dayjs'
import {useSearchParams} from 'react-router-dom'
import {useData} from '../../context/DataContext'
import type {Quadrant,Todo} from '../../core/types'
import {readDateParam} from '../../lib/dateParam'
import {useTodosUiPrefs} from './hooks/useTodosUiPrefs'
import {useTodosViewData} from './hooks/useTodosViewData'
import TodoToolbar from './components/TodoToolbar'
import TodoSidebar from './components/TodoSidebar'
import type {ManagerKind} from './components/TodoSidebar'
import ListManager from './components/ListManager'
import type {ListDraft} from './components/ListManager'
import CategoryManager from './components/CategoryManager'
import type {CategoryDraft} from './components/CategoryManager'
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_LIST_COLOR,
  hasDuplicateListName,
  normalizeColor,
  normalizeIcon,
  normalizeName,
} from './utils'
import ListView from './views/ListView'
import BoardView from './views/BoardView'
import TimelineView from './views/TimelineView'
import CompleteTimeModal from './components/CompleteTimeModal'
import Modal from '../../core/ui/Modal'
import {QUADRANT_META} from './types'
import type {TodoScope,TodoViewMode} from './types'
import {todayISO} from './date'

/**
 * 容器：只做四件事
 * 1. 接入 useData（唯一数据入口）
 * 2. 持有页面级状态：日期、批量选择、新增弹窗
 * 3. 把筛选/排序/分组交给 useTodosViewData（纯逻辑）
 * 4. 把渲染下发给视图（ListView / BoardView），视图不接触数据层
 *
 * UI 偏好（视图/清单/分组/折叠）落 planner:todos:ui，不进 13 域。
 */
export default function TodosPage() {
  const {todos,addTodo,updateTodo,deleteTodo,lists,addList,updateList,deleteList,categories,addCategory,updateCategory,deleteCategory,habits,updateHabit,addTimeBlock} = useData()
  const {prefs,patch,toggleCollapse} = useTodosUiPrefs()
  const [params]=useSearchParams()
  // 日历跳转携带 ?date= 时直接选中该日；无参数或非法值回落今天。页面只读 query，不回写。
  const [date,setDate] = useState(()=>readDateParam(params.get('date')) ?? dayjs().format('YYYY-MM-DD'))
  useEffect(()=>{
    const next=readDateParam(params.get('date'))
    if(next) setDate(next)
  },[params])
  const [batchMode,setBatchMode] = useState(false)
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [showAdd,setShowAdd] = useState(false)
  const [pendingTime,setPendingTime] = useState<Todo|null>(null)
  const [manager,setManager] = useState<ManagerKind | null>(null)
  const [scheduleDate,setScheduleDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [form,setForm] = useState({
    title:'',
    quadrant:'q2' as Quadrant,
    list_id:'inbox',
    category_id:'',
    due_time:'',
  })

  // 清单可能在别处被删除：偏好里的 activeList 失效时回落到"全部"
  const activeList = prefs.activeList === 'all' || lists.some(list => list.id === prefs.activeList) ? prefs.activeList : 'all'
  useEffect(() => {
    if (activeList !== prefs.activeList) patch({activeList: 'all'})
  }, [activeList,prefs.activeList,patch])

  const scope: TodoScope = prefs.scope
  const {items,sections} = useTodosViewData({todos,lists,categories,date,activeList,scope,groupBy:prefs.groupBy})

  // 删除确认弹窗展示的"受影响条数"
  const listCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    todos.forEach(todo => { counts[todo.list_id] = (counts[todo.list_id] ?? 0) + 1 })
    return counts
  }, [todos])
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    todos.forEach(todo => {
      if (todo.category_id) counts[todo.category_id] = (counts[todo.category_id] ?? 0) + 1
    })
    return counts
  }, [todos])
  const unscheduledCount = useMemo(() => todos.filter(todo => !todo.due_date).length, [todos])

  // ---- 选择：切换日期/清单时清空，避免"看不见的选中项被删除" ----
  const changeDate = (next: string) => {
    setDate(next)
    setSelected(new Set())
    // 从"未排期"回到日期视图
    if (prefs.scope !== 'date') patch({scope:'date'})
  }
  const changeList = (id: string) => {
    patch({activeList: id, scope:'date'})
    setSelected(new Set())
  }
  const selectUnscheduled = () => {
    patch({scope:'unscheduled', activeList:'all'})
    setSelected(new Set())
  }
  // 看板/时间线不支持批量选择：切走时退出批量并清空，避免"按钮可见但无效"
  const changeView = (view: TodoViewMode) => {
    if (view !== 'list') {
      setBatchMode(false)
      setSelected(new Set())
    }
    patch({view})
  }
  const toggleBatch = () => {
    setBatchMode(mode => !mode)
    setSelected(new Set())
  }
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleGroupSelect = (groupItems: Todo[], checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      groupItems.forEach(todo => {
        if (checked) next.add(todo.id)
        else next.delete(todo.id)
      })
      return next
    })
  }
  const selectAllVisible = () => setSelected(new Set(items.map(todo => todo.id)))
  const clearSelection = () => setSelected(new Set())

  // ---- 单条操作 ----
  /** 真正落库：minutes 为 null 表示不记录时间块 */
  const applyComplete = (todo: Todo, minutes: number | null) => {
    // 时长统计归属任务自己的日期；过去/未来日期都不回写到今天
    const statDate = todo.due_date || date
    if (!todo.completed && minutes !== null) {
      const category = categories.find(item => item.id === todo.category_id)
      const parts = todo.due_time ? todo.due_time.split(':').map(Number) : []
      const startHour = parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])
        ? parts[0] + parts[1] / 60
        : dayjs().hour()
      addTimeBlock({date:statDate,start:startHour,end:startHour + minutes / 60,title:todo.title,category:category?.name || '学习',source:'todo'})
    }
    updateTodo(todo.id,{completed: !todo.completed})
    // 习惯勾选归属任务日期；今日由 DataContext.updateTodo 统一处理，这里只补非今日，避免重复写入
    if (todo.source === 'habit' && todo.habit_id && statDate !== todayISO()) {
      const habit = habits.find(item => item.id === todo.habit_id)
      if (habit) {
        const checked = habit.check_dates.includes(statDate)
        if (!todo.completed && !checked) updateHabit(todo.habit_id,{check_dates: [...habit.check_dates,statDate]})
        if (todo.completed && checked) updateHabit(todo.habit_id,{check_dates: habit.check_dates.filter(item => item !== statDate)})
      }
    }
  }
  const toggleComplete = (todo: Todo) => {
    // 勾选完成时先弹用时 Modal；取消勾选直接落库
    if (!todo.completed) {
      setPendingTime(todo)
      return
    }
    applyComplete(todo, null)
  }
  const confirmCompleteTime = (minutes: number | null) => {
    const todo = pendingTime
    setPendingTime(null)
    if (todo) applyComplete(todo, minutes)
  }
  const togglePin = (id: string) => {
    const todo = todos.find(item => item.id === id)
    if (todo) updateTodo(id,{pinned: !todo.pinned})
  }
  const removeTodo = (id: string) => deleteTodo(id)
  const cycleQuadrant = (todo: Todo, next: Quadrant) => updateTodo(todo.id,{quadrant: next})

  // 批量删除：同一事件内同步调用 → React 18 批处理 → 只渲染一次、p_todos 只写一次
  const batchDelete = () => {
    if (selected.size === 0) return
    if (!window.confirm(`删除选中的 ${selected.size} 项待办？`)) return
    selected.forEach(id => deleteTodo(id))
    setSelected(new Set())
    setBatchMode(false)
  }

  // 未排期：逐条补日期 / 批量补日期
  const scheduleTodo = (id: string, next: string) => updateTodo(id,{due_date: next})
  const batchSchedule = () => {
    if (!scheduleDate || selected.size === 0) return
    selected.forEach(id => updateTodo(id,{due_date: scheduleDate}))
    setSelected(new Set())
    setBatchMode(false)
  }

  // ---- 清单 / 分类（完整 CRUD）----
  // 统一约定：删除实体前先把引用迁移走，避免产生孤儿引用。
  const createList = (draft: ListDraft): string | null => {
    const name = normalizeName(draft.name)
    if (!name) return '请输入清单名称'
    if (hasDuplicateListName(lists, name)) return '已存在同名清单'
    addList({name, color:normalizeColor(draft.color, DEFAULT_LIST_COLOR), icon:normalizeIcon(draft.icon)})
    return null
  }
  const updateListSafe = (id: string, draft: ListDraft): string | null => {
    const name = normalizeName(draft.name)
    if (!name) return '请输入清单名称'
    if (hasDuplicateListName(lists, name, id)) return '已存在同名清单'
    updateList(id, {name, color:normalizeColor(draft.color, DEFAULT_LIST_COLOR), icon:normalizeIcon(draft.icon)})
    return null
  }
  const removeList = (id: string) => {
    // inbox 是兜底清单：可改名，不可删除
    if (id === 'inbox') return
    // 顺序：先把该清单下所有待办迁移到 inbox，再删除清单
    todos.filter(todo => todo.list_id === id).forEach(todo => updateTodo(todo.id, {list_id:'inbox'}))
    deleteList(id)
    // 正在筛选被删清单时，回落到"全部任务"
    if (prefs.activeList === id) {
      patch({activeList:'all'})
      setSelected(new Set())
    }
  }
  const createCategory = (draft: CategoryDraft) => {
    const name = normalizeName(draft.name)
    if (!name) return
    addCategory({name, color:normalizeColor(draft.color, DEFAULT_CATEGORY_COLOR), icon:normalizeIcon(draft.icon, '')})
  }
  const updateCategorySafe = (id: string, draft: CategoryDraft) => {
    const name = normalizeName(draft.name)
    if (!name) return
    updateCategory(id, {name, color:normalizeColor(draft.color, DEFAULT_CATEGORY_COLOR), icon:normalizeIcon(draft.icon, '')})
  }
  const removeCategory = (id: string) => {
    // 顺序：先把该分类下所有待办置为"未分类"，再删除分类
    todos.filter(todo => todo.category_id === id).forEach(todo => updateTodo(todo.id, {category_id:''}))
    deleteCategory(id)
  }

  // ---- 新增 ----
  const openAdd = () => {
    setForm({title:'',quadrant:'q2',list_id:activeList === 'all' ? 'inbox' : activeList,category_id:'',due_time:''})
    setShowAdd(true)
  }
  const submitAdd = () => {
    const title = form.title.trim()
    if (!title) return
    addTodo({
      title,
      quadrant:form.quadrant,
      // 日期视图：默认落在当前选中日期；未排期视图：新建后仍保持无日期
      due_date:scope === 'unscheduled' ? '' : date,
      due_time:form.due_time,
      completed:false,
      list_id:form.list_id,
      category_id:form.category_id,
      pinned:false,
      status:'todo',
      source:'todo',
    })
    setShowAdd(false)
  }

  return (
    <div className="todos-layout">
      <div className="todos-side">
        <TodoSidebar
          lists={lists}
          categories={categories}
          activeList={activeList}
          scope={scope}
          unscheduledCount={unscheduledCount}
          onSelectList={changeList}
          onSelectUnscheduled={selectUnscheduled}
          onOpenManager={setManager}
          collapsed={prefs.collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      <div className="todos-main">
        <div className="card">
          <TodoToolbar
            date={date}
            onDateChange={changeDate}
            scope={scope}
            view={prefs.view}
            onViewChange={changeView}
            groupBy={prefs.groupBy}
            onGroupByChange={groupBy => patch({groupBy})}
            batchMode={batchMode}
            onToggleBatch={toggleBatch}
            selectedCount={selected.size}
            totalCount={items.length}
            onSelectAll={selectAllVisible}
            onClearSelection={clearSelection}
            onAdd={openAdd}
            batchActions={
              <>
                <button className="btn btn-danger" onClick={batchDelete} disabled={selected.size === 0}>批量删除</button>
                {scope === 'unscheduled' && (
                  <>
                    <input
                      type="date"
                      className="input"
                      style={{width:150,padding:'4px 8px'}}
                      value={scheduleDate}
                      onChange={e => setScheduleDate(e.target.value)}
                      aria-label="批量补日期"
                    />
                    <button className="btn btn-primary" onClick={batchSchedule} disabled={selected.size === 0 || !scheduleDate}>批量补日期</button>
                  </>
                )}
              </>
            }
          />

          {prefs.view === 'list' && (
            <ListView
              sections={sections}
              batchMode={batchMode}
              selected={selected}
              collapsed={prefs.collapsed}
              lists={lists}
              categories={categories}
              onToggleCollapse={toggleCollapse}
              onToggleGroupSelect={toggleGroupSelect}
              onToggleSelect={toggleSelect}
              onToggleComplete={toggleComplete}
              onTogglePin={togglePin}
              onDelete={removeTodo}
              onSchedule={scope === 'unscheduled' ? scheduleTodo : undefined}
            />
          )}
          {prefs.view === 'board' && (
            <BoardView
              items={items}
              lists={lists}
              categories={categories}
              onMoveQuadrant={cycleQuadrant}
            />
          )}
          {prefs.view === 'timeline' && (
            <TimelineView items={items} lists={lists} categories={categories}/>
          )}
        </div>
      </div>

      <Modal
        open={showAdd}
        title="添加待办"
        onClose={() => setShowAdd(false)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>取消</button>
            <button className="btn btn-primary" onClick={submitAdd}>添加</button>
          </>
        }
      >
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <input className="input" placeholder="任务内容" value={form.title} onChange={e => setForm({...form,title:e.target.value})} autoFocus/>
          <div style={{display:'flex',gap:8}}>
            <select className="select" value={form.quadrant} onChange={e => setForm({...form,quadrant:e.target.value as Quadrant})}>
              {QUADRANT_META.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select className="select" value={form.list_id} onChange={e => setForm({...form,list_id:e.target.value})}>
              {lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
          </div>
          <div style={{display:'flex',gap:8}}>
            <select className="select" value={form.category_id} onChange={e => setForm({...form,category_id:e.target.value})}>
              <option value="">无分类</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <input className="input" type="time" value={form.due_time} onChange={e => setForm({...form,due_time:e.target.value})} placeholder="时间（可选）"/>
          </div>
        </div>
      </Modal>

      {manager === 'list' && (
        <ListManager
          lists={lists}
          counts={listCounts}
          onClose={() => setManager(null)}
          onCreate={createList}
          onUpdate={updateListSafe}
          onDelete={removeList}
        />
      )}
      {manager === 'category' && (
        <CategoryManager
          categories={categories}
          counts={categoryCounts}
          onClose={() => setManager(null)}
          onCreate={createCategory}
          onUpdate={updateCategorySafe}
          onDelete={removeCategory}
        />
      )}

      <CompleteTimeModal
        open={!!pendingTime}
        title={pendingTime?.title || ''}
        onCancel={() => setPendingTime(null)}
        onConfirm={confirmCompleteTime}
      />
    </div>
  )
}
