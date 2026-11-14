import {useState,useEffect} from 'react'
import {useAuth} from '../../context/AuthContext'
import {mapAuthError} from '../../lib/authErrors'
import {AuthMessage} from './AuthField'

interface VerifyEmailNoticeProps{
  email:string
}

const RESEND_SECONDS=60

/** 注册后"验证邮件已发送"提示 + 重发倒计时 */
export default function VerifyEmailNotice({email}:VerifyEmailNoticeProps){
  const{resendVerification}=useAuth()
  const[seconds,setSeconds]=useState(RESEND_SECONDS)
  const[sending,setSending]=useState(false)
  const[message,setMessage]=useState('')
  const[error,setError]=useState('')

  useEffect(()=>{
    if(seconds<=0)return
    const timer=setTimeout(()=>setSeconds(n=>n-1),1000)
    return()=>clearTimeout(timer)
  },[seconds])

  const resend=async()=>{
    setMessage('')
    setError('')
    setSending(true)
    try{
      await resendVerification(email)
      setSeconds(RESEND_SECONDS)
      setMessage('验证邮件已重新发送，请查收（含垃圾箱）')
    }catch(err){
      setError(mapAuthError(err as {code?:string;message?:string}))
    }finally{
      setSending(false)
    }
  }

  return(
    <div>
      <p style={{fontSize:14,lineHeight:1.7,color:'#334155',marginTop:0}}>
        验证邮件已发送到 <strong style={{wordBreak:'break-all'}}>{email}</strong>，请点击邮件中的链接完成验证。
      </p>
      {message&&<AuthMessage kind="success">{message}</AuthMessage>}
      {error&&<AuthMessage kind="error">{error}</AuthMessage>}
      <button
        className="btn btn-outline"
        onClick={resend}
        disabled={seconds>0||sending}
        style={{width:'100%',padding:'10px'}}
      >
        {sending?'发送中...':seconds>0?`重新发送（${seconds}s）`:'重新发送验证邮件'}
      </button>
    </div>
  )
}
