import {lazy,Suspense,useEffect} from 'react'
import type {ComponentType,LazyExoticComponent,ReactNode} from 'react'
import {HashRouter,Routes,Route,useNavigate} from 'react-router-dom'
import Layout from './app/Layout'
import ErrorBoundary from './app/ErrorBoundary'
import CloudSyncGate from './app/CloudSyncGate'
import RecurringAutoPost from './features/finance/RecurringAutoPost'
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
  timer:lazy(()=>import('./features/timer/TimerPage')),
  review:lazy(()=>import('./features/review/ReviewPage')),
  memos:lazy(()=>import('./features/memos/MemosPage')),
  finance:lazy(()=>import('./features/finance/FinancePage')),
  guide:lazy(()=>import('./features/guide/GuidePage')),
  settings:lazy(()=>import('./features/settings/SettingsPage')),
}

const LoginPage=lazy(()=>import('./features/auth/LoginPage'))
const RegisterPage=lazy(()=>import('./features/auth/RegisterPage'))
const ForgotPasswordPage=lazy(()=>import('./features/auth/ForgotPasswordPage'))
const ResetPasswordPage=lazy(()=>import('./features/auth/ResetPasswordPage'))

const RouteFallback=()=> <div style={{padding:40,textAlign:'center'}}>加载中...</div>

// 恢复链接：Supabase 解析 hash 后触发 PASSWORD_RECOVERY，这里统一跳到重置页
function RecoveryRedirect(){
  const{recoveryMode}=useAuth()
  const navigate=useNavigate()
  useEffect(()=>{
    if(recoveryMode)navigate('/reset-password',{replace:true})
  },[recoveryMode,navigate])
  return null
}

const AuthRoute=({Page}:{Page:LazyExoticComponent<ComponentType>})=> (
  <Suspense fallback={<RouteFallback/>}><Page/></Suspense>
)

// 路由守卫：只处理加载状态，不强制登录（用户可选择本地模式）
function AppGuard({children}:{children:ReactNode}){
  const{loading}=useAuth()
  if(loading)return<div style={{padding:40,textAlign:'center'}}>加载中...</div>
  return<>{children}</>
}

export default function App(){
  return(
    <HashRouter>
      {/* 周期账单自动生成：位于 DataProvider 之内、Routes 之外 */}
      <RecurringAutoPost/>
      {/* 云同步弹窗挂在根层：/login 与主应用都能看到 */}
      <CloudSyncGate/>
      <RecoveryRedirect/>
      <Routes>
        {/* 认证页（独立布局，不需要侧边栏） */}
        <Route path="/login" element={<AuthRoute Page={LoginPage}/>}/>
        <Route path="/register" element={<AuthRoute Page={RegisterPage}/>}/>
        <Route path="/forgot-password" element={<AuthRoute Page={ForgotPasswordPage}/>}/>
        <Route path="/reset-password" element={<AuthRoute Page={ResetPasswordPage}/>}/>
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
