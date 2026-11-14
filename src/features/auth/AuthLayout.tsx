import type {ReactNode} from 'react'
import {Navigate,useLocation} from 'react-router-dom'
import {useAuth} from '../../context/AuthContext'

/** 登录后回跳地址：?next= 优先，其次 location.state.from；只接受站内绝对路径 */
export function useNextPath():string{
  const location=useLocation()
  const fromQuery=new URLSearchParams(location.search).get('next')||''
  const fromState=((location.state as {from?:string}|null)?.from)||''
  const target=fromQuery||fromState
  return target.startsWith('/')&&!target.startsWith('//')?target:'/'
}

interface AuthLayoutProps{
  title:string
  children:ReactNode
  /** 底部附加链接（注册/登录/忘记密码之间跳转） */
  footer?:ReactNode
  /** 重置密码页需要允许"已登录的恢复会话"停留 */
  allowAuthenticated?:boolean
}

export default function AuthLayout({title,children,footer,allowAuthenticated=false}:AuthLayoutProps){
  const{user,loading,recoveryMode}=useAuth()
  const next=useNextPath()

  if(loading){
    return<div style={{padding:40,textAlign:'center',color:'#64748b'}}>加载中...</div>
  }
  // 已登录访问认证页：直接回主应用（恢复密码流程除外）
  if(user&&!allowAuthenticated&&!recoveryMode){
    return<Navigate to={next} replace/>
  }

  return(
    <div style={{maxWidth:420,margin:'80px auto',padding:'0 16px'}}>
      <div className="card">
        <h2 style={{margin:'0 0 20px',textAlign:'center'}}>{title}</h2>
        {children}
        {footer&&<div style={{marginTop:16,textAlign:'center',fontSize:14,color:'#64748b'}}>{footer}</div>}
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid #e2e8f0'}}>
          <a href="#/" style={{display:'block',textAlign:'center',fontSize:13,color:'#94a3b8',textDecoration:'none'}}>
            暂时不登录，使用本地模式 →
          </a>
        </div>
      </div>
    </div>
  )
}
