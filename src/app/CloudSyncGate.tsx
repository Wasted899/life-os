/**
 * 云同步守门层（M1-6）
 *
 * 必须挂在 App 根层（与 <Routes> 同级），这样 /login 与主应用都能看到。
 * 四种状态：
 *   checking      → 右上角轻提示，不遮挡操作
 *   offer-upload  → 云端为空、本机有数据，询问是否上传
 *   conflict      → 两边都有，展示合并预览（默认"云端赢"）
 *   error         → 云端读取失败，明确告知本地数据已保留
 */
import {useEffect,useMemo,useState} from 'react'
import {useData} from '../context/DataContext'
import {CLOUD_DOMAINS,DOMAIN_LABELS} from '../core/cloudSync'

const OVERWRITE_WORD='OVERWRITE'
const COUNTDOWN_SECONDS=3

const overlayStyle:React.CSSProperties={
  position:'fixed',
  inset:0,
  background:'rgba(15,23,42,.45)',
  zIndex:9999,
  display:'flex',
  alignItems:'center',
  justifyContent:'center',
  padding:16,
}

const cardStyle:React.CSSProperties={
  background:'#fff',
  borderRadius:14,
  maxWidth:520,
  width:'100%',
  maxHeight:'85vh',
  overflow:'auto',
  padding:22,
  boxShadow:'0 20px 60px rgba(15,23,42,.25)',
}

export default function CloudSyncGate(){
  const{cloud,resolveCloud,retryCloud,dismissCloudNotice,uploading}=useData()
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[dangerOpen,setDangerOpen]=useState(false)
  const[word,setWord]=useState('')
  const[countdown,setCountdown]=useState(COUNTDOWN_SECONDS)

  // 每次打开弹窗/切换阶段，重置危险确认
  useEffect(()=>{
    setDangerOpen(false)
    setWord('')
    setCountdown(COUNTDOWN_SECONDS)
    setError('')
  },[cloud.phase])

  useEffect(()=>{
    if(!dangerOpen)return
    if(countdown<=0)return
    const timer=setTimeout(()=>setCountdown(n=>n-1),1000)
    return()=>clearTimeout(timer)
  },[dangerOpen,countdown])

  const countList=useMemo(()=>CLOUD_DOMAINS
    .map(({key})=>({key,label:DOMAIN_LABELS[key]||key,count:cloud.counts[key]||0}))
    .filter(item=>item.count>0),[cloud.counts])

  if(cloud.phase==='idle')return null

  if(cloud.phase==='checking'){
    return(
      <div style={{position:'fixed',right:16,top:16,zIndex:9999,background:'#0f172a',color:'#fff',fontSize:12,padding:'8px 12px',borderRadius:8,opacity:uploading?.4:.9}}>
        正在读取云端数据…
      </div>
    )
  }

  const canOverwrite=dangerOpen&&(word.trim().toUpperCase()===OVERWRITE_WORD||countdown<=0)

  const run=async(action:()=>Promise<void>)=>{
    setBusy(true)
    setError('')
    try{
      await action()
    }catch(e:any){
      setError(e?.message||'操作失败')
    }finally{
      setBusy(false)
    }
  }

  const totalLocal=countList.reduce((sum,item)=>sum+item.count,0)

  return(
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {cloud.phase==='offer-upload'&&(
          <>
            <h3 style={{margin:'0 0 8px',fontSize:18}}>云端暂无数据，本机有数据</h3>
            <p style={{margin:'0 0 14px',color:'#64748b',fontSize:13,lineHeight:1.7}}>
              本机共有 {totalLocal} 条数据，云端 13 张表都是空的。
              上传会把本机数据写入云端（上传前会自动保存一份云端快照以备回退）。
            </p>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 12px',marginBottom:16,fontSize:12,color:'#475569',display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
              {countList.map(item=><div key={item.key}>{item.label}：{item.count} 条</div>)}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-outline" disabled={busy} onClick={()=>dismissCloudNotice()}>暂不上传</button>
              <button className="btn btn-primary" disabled={busy} onClick={()=>run(()=>resolveCloud('overwrite'))}>
                {busy?'处理中…':'📤 上传本地数据'}
              </button>
            </div>
            <p style={{margin:'10px 0 0',color:'#94a3b8',fontSize:12}}>选择"暂不上传"不会丢数据，下次登录仍会提醒。</p>
          </>
        )}

        {cloud.phase==='conflict'&&(
          <>
            <h3 style={{margin:'0 0 8px',fontSize:18}}>云端与本机都有数据</h3>
            <p style={{margin:'0 0 14px',color:'#64748b',fontSize:13,lineHeight:1.7}}>
              合并规则：同一条目以<strong>云端为准</strong>；仅本机存在的条目会保留；仅云端存在的条目会补进本机。
              <strong>合并只改本机，不会自动上传。</strong>
            </p>
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 12px',marginBottom:16,fontSize:12,color:'#475569',lineHeight:1.8}}>
              <div>云端合计：{cloud.merge?.cloudTotal??0} 条</div>
              <div>合并后将新增：{cloud.merge?.added??0} 条</div>
              <div>将用云端覆盖：{cloud.merge?.updated??0} 条</div>
              <div>仅本机保留：{cloud.merge?.keptLocalOnly??0} 条</div>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',flexWrap:'wrap'}}>
              <button className="btn btn-ghost" disabled={busy} onClick={()=>dismissCloudNotice()}>稍后</button>
              <button className="btn btn-outline" disabled={busy} onClick={()=>setDangerOpen(true)}>用本机覆盖云端</button>
              <button className="btn btn-primary" disabled={busy} onClick={()=>run(()=>resolveCloud('merge'))}>
                {busy?'处理中…':'以云端为准合并'}
              </button>
            </div>

            {dangerOpen&&(
              <div style={{marginTop:16,border:'1px solid #fecaca',background:'#fef2f2',borderRadius:8,padding:14}}>
                <div style={{fontSize:13,fontWeight:700,color:'#b91c1c',marginBottom:8}}>危险操作：用本机覆盖云端</div>
                <p style={{margin:'0 0 10px',fontSize:12,color:'#991b1b',lineHeight:1.7}}>
                  云端当前数据会被清空并替换为本机数据。点击确认前会强制创建云端快照（保存在本机）；
                  如果快照创建失败，操作会直接中止。
                </p>
                <p style={{margin:'0 0 8px',fontSize:12,color:'#991b1b'}}>
                  请输入 <code style={{background:'#fee2e2',padding:'1px 5px',borderRadius:4}}>{OVERWRITE_WORD}</code>，或等待 {COUNTDOWN_SECONDS} 秒倒计时结束：
                </p>
                <input
                  className="input"
                  value={word}
                  onChange={e=>setWord(e.target.value)}
                  placeholder={OVERWRITE_WORD}
                  disabled={busy||countdown<=0}
                  style={{width:'100%',marginBottom:10}}
                />
                <div style={{display:'flex',gap:10,justifyContent:'flex-end',alignItems:'center'}}>
                  <button className="btn btn-ghost" disabled={busy} onClick={()=>setDangerOpen(false)}>取消</button>
                  <button
                    className="btn btn-danger"
                    disabled={!canOverwrite||busy}
                    onClick={()=>run(()=>resolveCloud('overwrite'))}
                  >
                    {busy?'覆盖中…':countdown>0?`确认覆盖（${countdown}s）`:'确认覆盖'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {cloud.phase==='error'&&(
          <>
            <h3 style={{margin:'0 0 8px',fontSize:18}}>无法读取云端数据</h3>
            <p style={{margin:'0 0 12px',color:'#64748b',fontSize:13,lineHeight:1.7}}>
              {cloud.message||'云端读取失败'}，<strong>本机数据一条都没有改动</strong>。
              请检查网络、登录状态或 RLS 策略后重试。
            </p>
            {cloud.failedTables.length>0&&(
              <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'10px 12px',marginBottom:14,fontSize:12,color:'#92400e',wordBreak:'break-all'}}>
                读取失败的表：{cloud.failedTables.join('、')}
              </div>
            )}
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-outline" disabled={busy} onClick={()=>dismissCloudNotice()}>继续使用本地数据</button>
              <button className="btn btn-primary" disabled={busy} onClick={()=>retryCloud()}>重试</button>
            </div>
          </>
        )}

        {error&&(
          <div style={{marginTop:14,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 12px',color:'#b91c1c',fontSize:12,lineHeight:1.6,wordBreak:'break-all'}}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
