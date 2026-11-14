import {createContext,useContext,useEffect,useRef,useState,ReactNode} from 'react'
import type {Session,User as SupabaseUser} from '@supabase/supabase-js'
import {supabase,isCloudMode} from '../lib/supabase'
import type {AuthUser} from '../core/types'

type User=AuthUser|null

export interface SignUpResult{
  /** 需要先去邮箱点验证链接（注册成功但没有会话） */
  needsEmailConfirm:boolean
}

interface AuthContextValue{
  user:User
  /** 首次会话解析完成前为 true（AppGuard 用它挡住业务页面） */
  loading:boolean
  /** 正在通过邮件里的恢复链接重置密码 */
  recoveryMode:boolean
  /** 恢复链接本身带回来的错误（链接失效/过期），由重置页展示 */
  linkError:string
  signIn:(email:string,password:string)=>Promise<void>
  signUp:(email:string,password:string)=>Promise<SignUpResult>
  signOut:()=>Promise<void>
  sendResetEmail:(email:string)=>Promise<void>
  updatePassword:(password:string)=>Promise<void>
  resendVerification:(email:string)=>Promise<void>
  clearRecovery:()=>void
}

const C=createContext<AuthContextValue>({
  user:null,
  loading:true,
  recoveryMode:false,
  linkError:'',
  signIn:async()=>{},
  signUp:async()=>({needsEmailConfirm:false}),
  signOut:async()=>{},
  sendResetEmail:async()=>{},
  updatePassword:async()=>{},
  resendVerification:async()=>{},
  clearRecovery:()=>{},
})

const toUser=(u:SupabaseUser|null|undefined):User=>(u?{id:u.id,email:u.email||''}:null)

/** 邮件链接统一回到站点根路径（不带 #），让 Supabase 的 hash token 完整落地 */
const redirectTo=()=>{
  if(typeof window==='undefined')return undefined
  return window.location.origin+window.location.pathname
}

/** 恢复链接失效时，Supabase 会把 error_description 写在 hash 里 */
const readLinkError=():string=>{
  if(typeof window==='undefined')return ''
  const hash=window.location.hash||''
  const matched=hash.match(/error_description=([^&]+)/)
  if(!matched)return ''
  try{return decodeURIComponent(matched[1].replace(/\+/g,' '))}catch{return matched[1]}
}

export function AuthProvider({children}:{children:ReactNode}){
  const[user,setUser]=useState<User>(null)
  const[loading,setLoading]=useState(isCloudMode)
  const[recoveryMode,setRecoveryMode]=useState(false)
  const[linkError]=useState(readLinkError)
  // 最近一次会话的 userId：用于识别"账号在其它标签页被切换"
  const userIdRef=useRef<string|null>(null)

  useEffect(()=>{
    if(!isCloudMode||!supabase){setLoading(false);return}
    const client=supabase
    let active=true
    const settle=()=>{if(active)setLoading(false)}

    const applySession=(session:Session|null)=>{
      if(!active)return
      const next=toUser(session?.user)
      // 多标签页 P1 兜底：不做横幅、不做跨标签同步，只提示刷新，避免把 A 的数据写进 B。
      if(next?.id&&userIdRef.current&&userIdRef.current!==next.id){
        console.warn('[认证] 账号已在其它标签页发生变化，请刷新当前页面以保持数据一致')
      }
      userIdRef.current=next?.id||null
      setUser(next)
    }

    client.auth.getSession()
      .then(({data})=>applySession(data.session))
      .catch(()=>{})
      .finally(settle)

    const{data:sub}=client.auth.onAuthStateChange((event,session)=>{
      if(!active)return
      if(event==='PASSWORD_RECOVERY')setRecoveryMode(true)
      // SIGNED_OUT 时 session 为 null；INITIAL_SESSION 无会话时也为 null
      applySession(session)
      settle()
    })

    return()=>{
      active=false
      sub.subscription.unsubscribe()
    }
  },[])

  const signIn=async(email:string,password:string)=>{
    if(!supabase)throw new Error('未配置云端（本地模式无需登录）')
    const{data,error}=await supabase.auth.signInWithPassword({email,password})
    if(error)throw error
    if(data.user){
      userIdRef.current=data.user.id
      setUser(toUser(data.user))
    }
  }

  const signUp=async(email:string,password:string):Promise<SignUpResult>=>{
    if(!supabase)throw new Error('未配置云端（本地模式无需登录）')
    const{data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:redirectTo()}})
    if(error)throw error
    // 开启邮箱验证时不会返回 session，需要用户先去点邮件里的链接
    if(data.session?.user){
      userIdRef.current=data.session.user.id
      setUser(toUser(data.session.user))
    }
    return{needsEmailConfirm:!data.session}
  }

  const signOut=async()=>{
    if(!supabase)return
    const{error}=await supabase.auth.signOut()
    // 网络异常时不要清本地会话，否则数据清理会误触发
    if(error)throw error
    userIdRef.current=null
    setUser(null)
    setRecoveryMode(false)
  }

  const sendResetEmail=async(email:string)=>{
    if(!supabase)throw new Error('未配置云端（本地模式无需登录）')
    const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:redirectTo()})
    if(error)throw error
  }

  const updatePassword=async(password:string)=>{
    if(!supabase)throw new Error('未配置云端（本地模式无需登录）')
    const{data,error}=await supabase.auth.updateUser({password})
    if(error)throw error
    if(data.user){
      userIdRef.current=data.user.id
      setUser(toUser(data.user))
    }
    setRecoveryMode(false)
  }

  const resendVerification=async(email:string)=>{
    if(!supabase)throw new Error('未配置云端（本地模式无需登录）')
    const{error}=await supabase.auth.resend({
      type:'signup',
      email,
      options:{emailRedirectTo:redirectTo()},
    })
    if(error)throw error
  }

  const clearRecovery=()=>setRecoveryMode(false)

  return(
    <C.Provider value={{
      user,loading,recoveryMode,linkError,
      signIn,signUp,signOut,sendResetEmail,updatePassword,resendVerification,clearRecovery,
    }}>
      {children}
    </C.Provider>
  )
}

export const useAuth=()=>useContext(C)
