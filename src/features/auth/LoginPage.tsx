import {useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {useAuth} from '../../context/AuthContext'
import {useData} from '../../context/DataContext'
import {isCloudMode} from '../../lib/supabase'
import {mapAuthError} from '../../lib/authErrors'
import AuthLayout,{useNextPath} from './AuthLayout'
import AuthField,{AuthMessage} from './AuthField'

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage(){
  const{signIn}=useAuth()
  const{snapshotLocalWorkspace}=useData()
  const navigate=useNavigate()
  const next=useNextPath()
  const[email,setEmail]=useState('')
  const[password,setPassword]=useState('')
  const[fieldErrors,setFieldErrors]=useState<{email?:string;password?:string}>({})
  const[error,setError]=useState('')
  const[loading,setLoading]=useState(false)

  if(!isCloudMode){
    return(
      <AuthLayout title="登录">
        <AuthMessage kind="info">
          当前为本地模式（未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），数据保存在本机浏览器。
        </AuthMessage>
        <a href="#/" className="btn btn-primary" style={{display:'block',textAlign:'center',textDecoration:'none',padding:'10px'}}>
          进入应用
        </a>
      </AuthLayout>
    )
  }

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault()
    setError('')
    const errors:{email?:string;password?:string}={}
    const trimmed=email.trim()
    if(!trimmed)errors.email='请输入邮箱'
    else if(!EMAIL_RE.test(trimmed))errors.email='邮箱格式不正确'
    if(!password)errors.password='请输入密码'
    setFieldErrors(errors)
    if(Object.keys(errors).length>0)return

    setLoading(true)
    try{
      // [M1-5] 登录前保存本地工作区快照，登出时恢复到这里
      snapshotLocalWorkspace()
      await signIn(trimmed,password)
      navigate(next,{replace:true})
    }catch(err){
      setError(mapAuthError(err as {code?:string;message?:string}))
    }finally{
      setLoading(false)
    }
  }

  return(
    <AuthLayout
      title="登录"
      footer={<>还没有账号？<Link to="/register" style={{color:'var(--primary)'}}>立即注册</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <AuthField
          label="邮箱"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          error={fieldErrors.email}
          disabled={loading}
        />
        <AuthField
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="请输入密码"
          autoComplete="current-password"
          error={fieldErrors.password}
          disabled={loading}
        />
        {error&&<AuthMessage kind="error">{error}</AuthMessage>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%',padding:'10px'}}>
          {loading?'登录中...':'登录'}
        </button>
        <div style={{marginTop:12,textAlign:'right',fontSize:13}}>
          <Link to="/forgot-password" style={{color:'#64748b'}}>忘记密码？</Link>
        </div>
      </form>
    </AuthLayout>
  )
}
