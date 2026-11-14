import {useState,useRef,useEffect,ReactNode} from 'react'
import {NavLink} from 'react-router-dom'
import {useTheme} from '../context/ThemeContext'
import {useAuth} from '../context/AuthContext'
import dayjs from 'dayjs'
import {NAV_GROUPS} from '../core/nav'
const quotes=[
  "我名叫志气还有恒心，我早晚要闯出一番名堂 —— Asen",
  "每天翻山越岭老子必须爬更高 —— Asen",
  "万丈高楼平地起这不是吹的 —— Asen",
  "我来自底层，所以我唯一的选择只有往上面爬 —— Asen",
  "Stay true to myself，我才对得起我的天赋 —— Asen",
  "你等着我破茧后化成蝶 —— Asen",
  "我爱做白日梦，Now I'm living my dream life —— Asen",
  "我就像路飞坐上船，我现在要启程 —— Asen",
  "Now my hard work pays off —— Asen",
  "你赚得少是因为格局太小 —— Asen",
  "祖辈在山里面扎根，我要让他们看到我出人头地 —— Asen",
  "生活就像骑自行车，要保持平衡就得不断前进。—— 爱因斯坦（相对论创立者，诺贝尔物理学奖）",
  "你的时间有限，不要浪费时间活在别人的生活里。—— 乔布斯（苹果公司创始人）",
  "活着就是为了改变世界，难道还有其他原因吗？—— 乔布斯（苹果公司创始人）",
  "我成功是因为我有决心，从不踌躇。—— 拿破仑（法兰西第一帝国皇帝）",
  "胜利属于最坚忍的人。—— 拿破仑（法兰西第一帝国皇帝）",
  "天才是百分之一的灵感加百分之九十九的汗水。—— 爱迪生（发明大王，1093项专利）",
  "我没有失败，我只是发现了10000种行不通的方法。—— 爱迪生（发明大王）",
  "想象力比知识更重要。—— 爱因斯坦（相对论创立者）",
  "成功不是终点，失败也并非末日，最重要的是继续前进的勇气。—— 丘吉尔（英国首相，诺贝尔文学奖）",
  "永远永远永远不要放弃。—— 丘吉尔（英国首相）",
  "人生最大的荣耀不在于从不跌倒，而在于每次跌倒后都能爬起来。—— 曼德拉（南非前总统，诺贝尔和平奖）",
  "教育是最强大的武器，你可以用它来改变世界。—— 曼德拉（南非前总统）",
  "知识就是力量。—— 培根（英国唯物主义哲学家）",
  "我思故我在。—— 笛卡尔（法国哲学家，解析几何之父）",
  "千里之行，始于足下。—— 老子（道家学派创始人）",
  "天行健，君子以自强不息。—— 《周易》（中国古代经典）",
  "不积跬步，无以至千里；不积小流，无以成江海。—— 荀子（战国思想家）",
  "业精于勤，荒于嬉；行成于思，毁于随。—— 韩愈（唐代文学家，唐宋八大家之首）",
  "路漫漫其修远兮，吾将上下而求索。—— 屈原（战国诗人，楚辞创立者）",
  "会当凌绝顶，一览众山小。—— 杜甫（唐代诗圣）",
  "长风破浪会有时，直挂云帆济沧海。—— 李白（唐代诗仙）",
  "如果说我看得远，那是因为我站在巨人的肩上。—— 牛顿（经典力学奠基人）",
  "物竞天择，适者生存。—— 达尔文（进化论创立者）",
  "给我一个支点，我就能撬动地球。—— 阿基米德（古希腊科学家）",
  "成功=艰苦的劳动+正确的方法+少说空话。—— 爱因斯坦（相对论创立者）",
  "学而不思则罔，思而不学则殆。—— 孔子（儒家学派创始人）",
  "三人行，必有我师焉。—— 孔子（儒家学派创始人）",
  "世界上只有一种真正的英雄主义，那就是在认清生活真相之后依然热爱生活。—— 罗曼·罗兰（法国作家，诺贝尔文学奖）",
  "伟大的事情都是由一系列小事汇聚而成的。—— 梵高（后印象派画家）",
  "你今天的努力，是幸运的伏笔。",
  "幸福不是拥有你想要的，而是珍惜你拥有的。",
]
export default function Layout({children}:{children:ReactNode}){
  const{user,signOut}=useAuth()
  const[qi,setQi]=useState(()=>{const d=dayjs();return(d.year()+d.month()+d.date())%quotes.length})
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
            <div className="header-quote-wrap">
              <span className="header-quote" title="点击切换下一条">"{quotes[qi]}"</span>
              <button className="quote-refresh" onClick={()=>setQi(i=>(i+1)%quotes.length)} title="换一条">↻</button>
            </div>
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