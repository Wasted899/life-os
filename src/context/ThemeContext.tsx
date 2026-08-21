import {createContext,useContext,useEffect,useState,ReactNode} from 'react'
import {load,save} from '../lib/storage'
export type Theme={id:string;name:string;primary:string;sidebar:string;bg?:string;bgImage?:string;overlay?:number;blur?:number;custom?:boolean}
const presets:Theme[]=[{id:'blue',name:'深邃蓝',primary:'#2563eb',sidebar:'#1e3a5f',bg:'#f0f4f8',overlay:0.88,blur:12},{id:'green',name:'清新绿',primary:'#10b981',sidebar:'#065f46',bg:'#f0fdf4',overlay:0.88,blur:12},{id:'purple',name:'优雅紫',primary:'#8b5cf6',sidebar:'#4c1d95',bg:'#faf5ff',overlay:0.88,blur:12},{id:'dark',name:'暗夜黑',primary:'#6366f1',sidebar:'#0f172a',bg:'#1e293b',overlay:0.85,blur:16}]
const C=createContext<{theme:Theme;themes:Theme[];setTheme:(id:string)=>void;addTheme:(t:Theme)=>void;deleteTheme:(id:string)=>void}>({theme:presets[0],themes:presets,setTheme:()=>{},addTheme:()=>{},deleteTheme:()=>{}})
export function ThemeProvider({children}:{children:ReactNode}){
  const[themes,setThemes]=useState<Theme[]>(()=>[...presets,...load<Theme[]>('p_themes',[])])
  const[tid,setTid]=useState(()=>load('p_theme','blue'))
  const theme=themes.find(t=>t.id===tid)||themes[0]
  useEffect(()=>{
    document.documentElement.style.setProperty('--primary',theme.primary)
    document.documentElement.style.setProperty('--sidebar-bg',theme.sidebar)
    document.documentElement.style.setProperty('--overlay',String(theme.overlay??0.88))
    document.documentElement.style.setProperty('--blur',String(theme.blur??12)+'px')
    if(theme.bgImage){document.documentElement.style.setProperty('--bg-image',`url(${theme.bgImage})`);document.body.style.backgroundColor='transparent'}else{document.documentElement.style.setProperty('--bg-image','none');document.body.style.backgroundColor=theme.bg||'#f0f4f8'}
  },[theme])
  const setTheme=(id:string)=>{setTid(id);save('p_theme',id)}
  const addTheme=(t:Theme)=>{const nt=[...themes,t];setThemes(nt);save('p_themes',nt.filter(x=>x.custom));setTheme(t.id)}
  const deleteTheme=(id:string)=>{const nt=themes.filter(t=>t.id!==id);setThemes(nt);save('p_themes',nt.filter(x=>x.custom));if(tid===id)setTheme('blue')}
  return<C.Provider value={{theme,themes,setTheme,addTheme,deleteTheme}}>{children}</C.Provider>
}
export const useTheme=()=>useContext(C)