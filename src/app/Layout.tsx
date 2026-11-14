import {useState,useRef,useEffect,ReactNode} from 'react'
import {NavLink} from 'react-router-dom'
import {useTheme} from '../context/ThemeContext'
import {useAuth} from '../context/AuthContext'
import dayjs from 'dayjs'
import {NAV_GROUPS} from '../core/nav'

export default function Layout({children}:{children:ReactNode}){
  const{user,signOut}=useAuth()
  const[um,setUm]=useState(false)
  const[nick,setNick]=useState(()=>{try{return localStorage.getItem('p_nick')||'同学'}catch{return'同学'}})
  const[avatar,setAvatar]=useState(()=>{try{return localStorage.getItem('p_avatar')||''}catch{return''}})
  const fileRef=useRef<HTMLInputElement>(null)
  const menuRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{const h=(e:MouseEvent)=>{if(menuRef.current&&!menuRef.current.contains(e.target as Node))setUm(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])
  const ha=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{const d=r.result as string;setAvatar(d);try{localStorage.setItem('p_avatar',d)}catch{}};r.readAsDataURL(f)}
  const cn=()=>{const n=prompt('输入昵称',nick);if(n){setNick(n);try{localStorage.setItem('p_nick',n)}catch{}}}
  return(
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">📋 规划助手</div>
        {NAV_GROUPS.map(g=>(<div key={g.id}><div className="sidebar-group-title">{g.title}</div>{g.items.map(i=>(<NavLink key={i.to} to={i.to} className="sidebar-item" end={i.to==='/'}><span>{i.icon}</span><span>{i.label}</span></NavLink>))}</div>))}
      </aside>
      <main className="main-content">
        <header className="header">
          <div style={{flex:1}}>
            <div className="header-date">{dayjs().format('YYYY年M月D日 dddd')}</div>
          </div>
          <div className="user-area" ref={menuRef} onClick={()=>setUm(v=>!v)}>
            <div className="user-avatar">{avatar?<img src={avatar} alt=""/>:nick[0]}</div>
            <span style={{fontWeight:600}}>{nick}</span>
            {um&&(<div className="dropdown"><div className="dropdown-item" onClick={cn}>✏️ 修改昵称</div><div className="dropdown-item" onClick={()=>fileRef.current?.click()}>🖼️ 更换头像</div><div className="dropdown-item" onClick={()=>{window.location.hash='#/settings';setUm(false)}}>⚙️ 设置</div>{!user&&<div className="dropdown-item" onClick={()=>{window.location.hash='#/login';setUm(false)}}>🔐 登录 / 云同步</div>}{user&&<div className="dropdown-item" onClick={()=>{signOut().catch(()=>alert('退出失败，请检查网络后重试'));setUm(false)}}>🚪 退出登录</div>}</div>)}
            <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={ha}/>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}
