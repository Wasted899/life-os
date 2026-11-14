import {lazy,Suspense} from 'react'
import type {ComponentType,LazyExoticComponent,ReactNode} from 'react'
import {HashRouter,Routes,Route} from 'react-router-dom'
import Layout from './app/Layout'
import ErrorBoundary from './app/ErrorBoundary'
import CloudSyncGate from './app/CloudSyncGate'
import {useAuth} from './context/AuthContext'
import {ROUTE_DEFS} from './core/nav'
import type {ModuleId} from './core/types'

// 页面懒加载映射：核心模块只保留"元数据 + 加载器"，不 import 页面实现
const PAGES:Record<ModuleId,LazyExoticComponent<ComponentType>>={
  today:lazy(()=>import('./features/today/TodayPage')),
  todos:lazy(()=>import('./features/todos/TodosPage')),
  goals:lazy(()=>import('./features/goals/GoalsPage')),
  habits:lazy(()=>import('./features/habits/HabitsPage')),
  importantDays:lazy(()=>import('./features/importantDays/ImportantDaysPage')),
  calendar:lazy(()=>import('./features/calendar/CalendarPage')),
  timeStats:lazy(()=>import('./features/timeStats/TimeStatsPage')),
  pomodoro:lazy(()=>import('./features/pomodoro/PomodoroPage')),
  review:lazy(()=>import('./features/review/ReviewPage')),
  memos:lazy(()=>import('./features/memos/MemosPage')),
  finance:lazy(()=>import('./features/finance/FinancePage')),
  guide:lazy(()=>import('./features/guide/GuidePage')),
  settings:lazy(()=>import('./features/settings/SettingsPage')),
}

const LoginPage=lazy(()=>import('./features/auth/LoginPage'))

const RouteFallback=()=> <div style={{padding:40,textAlign:'center'}}>加载中...</div>

// 路由守卫：只处理加载状态，不强制登录（用户可选择本地模式）
function AppGuard({children}:{children:ReactNode}){
  const{loading}=useAuth()
  if(loading)return<div style={{padding:40,textAlign:'center'}}>加载中...</div>
  return<>{children}</>
}

export default function App(){
  return(
    <HashRouter>
      {/* 云同步弹窗挂在根层：/login 与主应用都能看到 */}
      <CloudSyncGate/>
      <Routes>
        {/* 登录页（独立布局，不需要侧边栏） */}
        <Route path="/login" element={<Suspense fallback={<RouteFallback/>}><LoginPage/></Suspense>}/>
        {/* 主应用（所有页面都可直接访问，不强制登录） */}
        <Route path="/*" element={
          <AppGuard>
            <Layout>
              <ErrorBoundary>
                <Suspense fallback={<RouteFallback/>}>
                  <Routes>
                    {ROUTE_DEFS.map(({path,module})=>{
                      const Page=PAGES[module]
                      return<Route key={path} path={path} element={<Page/>}/>
                    })}
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </Layout>
          </AppGuard>
        }/>
      </Routes>
    </HashRouter>
  )
}
