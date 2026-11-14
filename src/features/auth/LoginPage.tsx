import {useState} from 'react'
import {useAuth} from '../../context/AuthContext'
import {useData} from '../../context/DataContext'
import {isCloudMode} from '../../lib/supabase'

export default function Login(){
  const{user,signIn,signUp,signOut}=useAuth()
  const{uploadLocalToCloud,uploading,testCloudConnection}=useData()
  const[mode,setMode]=useState<'login'|'register'>('login')
  const[email,setEmail]=useState('')
  const[password,setPassword]=useState('')
  const[error,setError]=useState('')
  const[loading,setLoading]=useState(false)
  const[uploadMsg,setUploadMsg]=useState('')
  const[skipClear,setSkipClear]=useState(false)

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault()
    setError('')
    setLoading(true)
    try{
      if(mode==='login'){
        await signIn(email,password)
      }else{
        await signUp(email,password)
        setError('注册成功！如果开启了邮箱验证，请先去邮箱点击验证链接，然后回来登录。')
        setMode('login')
      }
    }catch(err:any){
      setError(err.message||'操作失败')
    }finally{
      setLoading(false)
    }
  }

  const handleUpload=async()=>{
    setUploadMsg('')
    try{
      await uploadLocalToCloud(skipClear)
      setUploadMsg('✅ 本地数据已全部上传到云端！')
    }catch(err:any){
      // 错误信息已经在 uploadLocalToCloud 里通过 alert 显示了
      setUploadMsg('❌ 上传失败，请看弹窗详细信息')
    }
  }

  // 未配置Supabase：显示本地模式提示
  if(!isCloudMode){
    return(
      <div style={{maxWidth:420,margin:'80px auto',padding:'0 16px'}}>
        <div className="card" style={{textAlign:'center'}}>
          <div style={{fontSize:56,marginBottom:16}}>📋</div>
          <h2 style={{marginBottom:12}}>个人规划助手</h2>
          <p style={{color:'#64748b',marginBottom:16,lineHeight:1.6}}>
            当前为<strong>本地模式</strong>，所有数据存储在浏览器 localStorage 中。
          </p>
          <p style={{color:'#94a3b8',fontSize:13,marginBottom:20,lineHeight:1.6}}>
            如需多设备云同步，请在项目根目录创建 <code>.env.local</code> 文件，
            填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY，然后重启 <code>npm run dev</code>。
          </p>
          <a href="#/" className="btn btn-primary" style={{display:'inline-block',textDecoration:'none',padding:'10px 24px'}}>
            进入应用
          </a>
        </div>
      </div>
    )
  }

  // 已登录：显示账号信息和上传数据按钮
  if(user){
    return(
      <div style={{maxWidth:420,margin:'80px auto',padding:'0 16px'}}>
        <div className="card">
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={{fontSize:48,marginBottom:8}}>✅</div>
            <h2 style={{marginBottom:6}}>已登录</h2>
            <p style={{color:'#64748b',fontSize:14,wordBreak:'break-all'}}>{user.email}</p>
          </div>

          <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,padding:14,marginBottom:16}}>
            <p style={{fontSize:13,color:'#0369a1',marginBottom:10,lineHeight:1.6}}>
              💡 登录成功后，数据会自动从云端加载。如果你之前在本地有数据，可以点击下方按钮把本地数据批量上传到云端。
            </p>
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading}
                style={{flex:1,padding:'10px'}}
              >
                {uploading?'正在上传...':'📤 上传本地数据到云端'}
              </button>
              <button
                className="btn btn-outline"
                onClick={testCloudConnection}
                style={{padding:'10px 14px'}}
                title="测试Supabase连接和RLS策略是否正常"
              >
                🔍 测试
              </button>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#64748b',cursor:'pointer'}}>
              <input type="checkbox" checked={skipClear} onChange={e=>setSkipClear(e.target.checked)} style={{cursor:'pointer'}}/>
              跳过清空云端旧数据（如果清空步骤报错，勾选这个重试）
            </label>
            {uploadMsg&&(
              <p style={{marginTop:10,fontSize:13,color:uploadMsg.startsWith('✅')?'#16a34a':'#dc2626'}}>{uploadMsg}</p>
            )}
          </div>

          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:12,marginBottom:16}}>
            <p style={{fontSize:12,color:'#92400e',lineHeight:1.6,margin:0}}>
              🛠️ <strong>调试技巧</strong>：按 F12 打开控制台，输入 <code>window.supabase</code> 可以直接测试数据库操作。上传失败时会弹出详细日志，截图发给开发者。
            </p>
          </div>

          <div style={{display:'flex',gap:10}}>
            <a href="#/" className="btn btn-outline" style={{flex:1,textAlign:'center',textDecoration:'none'}}>进入应用</a>
            <button className="btn btn-ghost" onClick={()=>signOut()} style={{flex:1}}>退出登录</button>
          </div>
        </div>
      </div>
    )
  }

  // 未登录：显示登录/注册表单
  return(
    <div style={{maxWidth:420,margin:'80px auto',padding:'0 16px'}}>
      <div className="card">
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:48,marginBottom:8}}>📋</div>
          <h2 style={{marginBottom:6}}>{mode==='login'?'登录':'注册'}</h2>
          <p style={{color:'#64748b',fontSize:14}}>个人规划助手 · 云同步</p>
        </div>

        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
          <input
            className="input"
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="密码（至少6位）"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error&&(
            <div style={{color:'#ef4444',fontSize:13,lineHeight:1.5,background:'#fef2f2',padding:'8px 12px',borderRadius:6}}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{padding:'10px'}}>
            {loading?'处理中...':mode==='login'?'登录':'注册'}
          </button>
        </form>

        <div style={{textAlign:'center',marginTop:16,fontSize:14}}>
          {mode==='login'?(
            <>还没有账号？<a onClick={()=>{setMode('register');setError('')}} style={{color:'var(--primary)',cursor:'pointer',textDecoration:'underline'}}>立即注册</a></>
          ):(
            <>已有账号？<a onClick={()=>{setMode('login');setError('')}} style={{color:'var(--primary)',cursor:'pointer',textDecoration:'underline'}}>去登录</a></>
          )}
        </div>

        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid #e2e8f0'}}>
          <a href="#/" style={{display:'block',textAlign:'center',fontSize:13,color:'#94a3b8',textDecoration:'none'}}>
            暂时不登录，先用本地模式 →
          </a>
        </div>
      </div>
    </div>
  )
}