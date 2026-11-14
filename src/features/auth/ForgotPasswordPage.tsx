import {useState} from 'react'
import {Link} from 'react-router-dom'
import {useAuth} from '../../context/AuthContext'
import {mapAuthError} from '../../lib/authErrors'
import AuthLayout from './AuthLayout'
import AuthField,{AuthMessage} from './AuthField'

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage(){
  const{sendResetEmail}=useAuth()
  const[email,setEmail]=useState('')
  const[fieldError,setFieldError]=useState('')
  const[error,setError]=useState('')
  const[loading,setLoading]=useState(false)
  const[sent,setSent]=useState(false)

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault()
    setError('')
    const trimmed=email.trim()
    if(!trimmed)return setFieldError('请输入邮箱')
    if(!EMAIL_RE.test(trimmed))return setFieldError('邮箱格式不正确')
    setFieldError('')
    setLoading(true)
    try{
      await sendResetEmail(trimmed)
      // 无论邮箱是否存在都给同样的提示，避免账号枚举
      setSent(true)
    }catch(err){
      setError(mapAuthError(err as {code?:string;message?:string}))
    }finally{
      setLoading(false)
    }
  }

  return(
    <AuthLayout
      title="找回密码"
      footer={<Link to="/login" style={{color:'var(--primary)'}}>返回登录</Link>}
    >
      {sent?(
        <AuthMessage kind="success">
          如果该邮箱已注册，重置邮件已发送，请查收（含垃圾箱）。
        </AuthMessage>
      ):(
        <form onSubmit={submit} noValidate>
          <AuthField
            label="邮箱"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            error={fieldError}
            disabled={loading}
          />
          {error&&<AuthMessage kind="error">{error}</AuthMessage>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%',padding:'10px'}}>
            {loading?'发送中...':'发送重置邮件'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
