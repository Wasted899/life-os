import {useState} from 'react'
import {useData} from '../../context/DataContext'
import Modal from '../../core/ui/Modal'
import dayjs from 'dayjs'
export default function Memos(){
  const{memos,addMemo,updateMemo,deleteMemo}=useData()
  const[show,setShow]=useState(false)
  const[content,setContent]=useState('')
  const[cat,setCat]=useState('其他')
  const[filter,setFilter]=useState('全部')
  const cats=['全部',...new Set(memos.map(m=>m.category))]
  const list=memos.filter(m=>filter==='全部'||m.category===filter).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0))
  const add=()=>{if(!content.trim())return;addMemo({content,category:cat,pinned:false,completed:false,created_at:dayjs().toISOString()});setContent('');setShow(false)}
  return(<div className="card"><div className="card-title"><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{cats.map(c=><button key={c} className={`btn ${filter===c?'btn-primary':'btn-outline'}`} style={{padding:'4px 12px',fontSize:13}} onClick={()=>setFilter(c)}>{c}</button>)}</div><button className="btn btn-primary" onClick={()=>setShow(true)}>+ 新建</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:12}}>{list.map(m=>(<div key={m.id} className="card" style={{margin:0,background:m.pinned?'#fffbeb':'#fff',borderLeft:m.pinned?'3px solid #f59e0b':'none'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}><span className="tag" style={{background:'#ede9fe',color:'#5b21b6'}}>{m.category}</span><div style={{display:'flex',gap:4}}><button className="btn btn-ghost" style={{padding:'2px 6px',fontSize:12}} onClick={()=>updateMemo(m.id,{pinned:!m.pinned})}>{m.pinned?'📌':'📍'}</button><button className="btn btn-ghost" style={{padding:'2px 6px',fontSize:12,color:'#ef4444'}} onClick={()=>deleteMemo(m.id)}>×</button></div></div><div style={{fontSize:14,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{m.content}</div><div style={{fontSize:11,color:'#94a3b8',marginTop:8}}>{dayjs(m.created_at).format('M-D HH:mm')}</div></div>))}</div>
    {list.length===0&&<div className="empty">暂无备忘录</div>}
    <Modal
      open={show}
      title="新建备忘录"
      onClose={()=>setShow(false)}
      actions={<><button className="btn btn-ghost" onClick={()=>setShow(false)}>取消</button><button className="btn btn-primary" onClick={add}>保存</button></>}
    >
      <div style={{display:'flex',flexDirection:'column',gap:12}}><textarea className="textarea" placeholder="记录点什么..." rows={5} value={content} onChange={e=>setContent(e.target.value)} autoFocus/><input className="input" placeholder="分类，如：购物清单/想法/待买" value={cat} onChange={e=>setCat(e.target.value)}/></div>
    </Modal>
  </div>)
}
