import {HashRouter,Routes,Route} from 'react-router-dom'
import Layout from './components/Layout'
import Today from './pages/Today'
import Todos from './pages/Todos'
import Goals from './pages/Goals'
import Habits from './pages/Habits'
import ImportantDays from './pages/ImportantDays'
import Calendar from './pages/Calendar'
import TimeStats from './pages/TimeStats'
import Pomodoro from './pages/Pomodoro'
import Review from './pages/Review'
import Memos from './pages/Memos'
import Finance from './pages/Finance'
import Settings from './pages/Settings'
import GuidePage from './pages/GuidePage'
import Login from './pages/Login'
import {useAuth} from './context/AuthContext'
import {Component,ReactNode} from 'react'

class ErrorBoundary extends Component<{children:ReactNode},{hasError:boolean}>{
  constructor(p:{children:ReactNode}){super(p);this.state={hasError:false}}
  static getDerivedStateFromError(){return{hasError:true}}
  componentDidCatch(e:any){console.error('页面错误:',e)}
  render(){
    if(this.state.hasError)return(
      <div style={{padding:60,textAlign:'center'}}>
        <h2>页面加载出错</h2>
        <p style={{color:'#64748b',margin:'12px 0'}}>数据可能有问题，请刷新页面重试</p>
        <button className="btn btn-primary" onClick={()=>window.location.reload()}>刷新</button>
      </div>
    )
    return this.props.children
  }
}

// 路由守卫：只处理加载状态，不强制登录（用户可选择本地模式）
function AppGuard({children}:{children:ReactNode}){
  const{loading}=useAuth()
  if(loading)return<div style={{padding:40,textAlign:'center'}}>加载中...</div>
  return<>{children}</>
}

export default function App(){
  return(
    <HashRouter>
      <Routes>
        {/* 登录页（独立布局，不需要侧边栏） */}
        <Route path="/login" element={<Login/>}/>
        {/* 主应用（所有页面都可直接访问，不强制登录） */}
        <Route path="/*" element={
          <AppGuard>
            <Layout>
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Today/>}/>
                  <Route path="/todos" element={<Todos/>}/>
                  <Route path="/goals" element={<Goals/>}/>
                  <Route path="/habits" element={<Habits/>}/>
                  <Route path="/days" element={<ImportantDays/>}/>
                  <Route path="/calendar" element={<Calendar/>}/>
                  <Route path="/time" element={<TimeStats/>}/>
                  <Route path="/pomodoro" element={<Pomodoro/>}/>
                  <Route path="/review" element={<Review/>}/>
                  <Route path="/memos" element={<Memos/>}/>
                  <Route path="/finance" element={<Finance/>}/>
                  <Route path="/settings" element={<Settings/>}/>
                  <Route path="/guide/:type" element={<GuidePage/>}/>
                </Routes>
              </ErrorBoundary>
            </Layout>
          </AppGuard>
        }/>
      </Routes>
    </HashRouter>
  )
}