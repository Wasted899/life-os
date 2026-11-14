import {useState} from 'react'
import {Link} from 'react-router-dom'
import {useAuth} from '../../context/AuthContext'
import {mapAuthError} from '../../lib/authErrors'
import AuthLayout from './AuthLayout'
import AuthField,{AuthMessage} from './AuthField'

export default function ResetPasswordPage(){
  const{user,loading,recoveryMode,updatePassword,linkError}=useAuth()
  const[password,setPassword]=useState('')
  const[confirm,setConfirm]=useState('')
  const[fieldErrors,setFieldErrors]=useState<{password?:string;confirm?:string}>({})
  const[error,setError]=useState('')
  const[submitting,setSubmitting]=useState(false)
  const[done,setDone]=useState(false)

  // 加载期间不要提前判"链接失效"
  const invalid=!loading&&!user&&!recoveryMode

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault()
    setError('')
    const errors:{password?:string;confirm?:string}={}
    if(!password)errors.password='请输入新密码'
    else if(password.length<6)errors.password='密码至少 6 位'
    if(!confirm)errors.confirm='请再次输入新密码'
    else if(confirm!==password)errors.confirm='两次输入的密码不一致'
    setFieldErrors(errors)
    if(Object.keys(errors).length>0)return

    setSubmitting(true)
    try{
      await updatePassword(password)
      setDone(true)
    }catch(err){
      setError(mapAuthError(err as {code?:string;message?:string}))
    }finally{
      setSubmitting(false)
    }
  }

  return(
    <AuthLayout title="重置密码" allowAuthenticated footer={<Link to="/login" style={{color:'var(--primary)'}}>返回登录</Link>}>
      {invalid?(
        <>
          <AuthMessage kind="error">
            {linkError?mapAuthError({message:linkError}):'重置链接已失效，请重新发送重置邮件。'}
          </AuthMessage>
          <Link to="/forgot-password" className="btn btn-primary" style={{display:'block',textAlign:'center',textDecoration:'none',padding:'10px'}}>
            重新发送重置邮件
          </Link>
        </>
      ):done?(
        <>
          <AuthMessage kind="success">密码已更新。</AuthMessage>
          <Link to="/" className="btn btn-primary" style={{display:'block',textAlign:'center',textDecoration:'none',padding:'10px'}}>
            进入应用
          </Link>
        </>
      ):(
        <form onSubmit={submit} noValidate>
          <AuthField
            label="新密码"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="至少 6 位"
            autoComplete="new-password"
            error={fieldErrors.password}
            disabled={submitting}
          />
          <AuthField
            label="确认新密码"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="再次输入新密码"
            autoComplete="new-password"
            error={fieldErrors.confirm}
            disabled={submitting}
          />
          {error&&<AuthMessage kind="error">{error}</AuthMessage>}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{width:'100%',padding:'10px'}}>
            {submitting?'保存中...':'保存新密码'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
