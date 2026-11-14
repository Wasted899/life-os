import {useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {useAuth} from '../../context/AuthContext'
import {useData} from '../../context/DataContext'
import {mapAuthError} from '../../lib/authErrors'
import AuthLayout,{useNextPath} from './AuthLayout'
import AuthField,{AuthMessage} from './AuthField'
import VerifyEmailNotice from './VerifyEmailNotice'

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage(){
  const{signUp}=useAuth()
  const{snapshotLocalWorkspace}=useData()
  const navigate=useNavigate()
  const next=useNextPath()
  const[email,setEmail]=useState('')
  const[password,setPassword]=useState('')
  const[confirm,setConfirm]=useState('')
  const[fieldErrors,setFieldErrors]=useState<{email?:string;password?:string;confirm?:string}>({})
  const[error,setError]=useState('')
  const[loading,setLoading]=useState(false)
  const[verifyEmail,setVerifyEmail]=useState('')

  if(verifyEmail){
    return(
      <AuthLayout title="验证邮箱" footer={<Link to="/login" style={{color:'var(--primary)'}}>返回登录</Link>}>
        <VerifyEmailNotice email={verifyEmail}/>
      </AuthLayout>
    )
  }

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault()
    setError('')
    const errors:{email?:string;password?:string;confirm?:string}={}
    const trimmed=email.trim()
    if(!trimmed)errors.email='请输入邮箱'
    else if(!EMAIL_RE.test(trimmed))errors.email='邮箱格式不正确'
    if(!password)errors.password='请输入密码'
    else if(password.length<6)errors.password='密码至少 6 位'
    if(!confirm)errors.confirm='请再次输入密码'
    else if(confirm!==password)errors.confirm='两次输入的密码不一致'
    setFieldErrors(errors)
    if(Object.keys(errors).length>0)return

    setLoading(true)
    try{
      // [M1-5] 注册前保存本地工作区快照，登出时恢复到这里
      snapshotLocalWorkspace()
      const result=await signUp(trimmed,password)
      if(result.needsEmailConfirm){
        setVerifyEmail(trimmed)
      }else{
        navigate(next,{replace:true})
      }
    }catch(err){
      setError(mapAuthError(err as {code?:string;message?:string}))
    }finally{
      setLoading(false)
    }
  }

  return(
    <AuthLayout
      title="注册"
      footer={<>已有账号？<Link to="/login" style={{color:'var(--primary)'}}>去登录</Link></>}
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
          placeholder="至少 6 位"
          autoComplete="new-password"
          error={fieldErrors.password}
          disabled={loading}
        />
        <AuthField
          label="确认密码"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="再次输入密码"
          autoComplete="new-password"
          error={fieldErrors.confirm}
          disabled={loading}
        />
        {error&&<AuthMessage kind="error">{error}</AuthMessage>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%',padding:'10px'}}>
          {loading?'注册中...':'注册'}
        </button>
      </form>
    </AuthLayout>
  )
}
