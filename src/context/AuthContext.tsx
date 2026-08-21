import {createContext,useContext,useEffect,useState,ReactNode} from 'react'
import {supabase,isCloudMode} from '../lib/supabase'
type User={id:string;email:string}|null
const C=createContext<{user:User;loading:boolean;signIn:(e:string,p:string)=>Promise<void>;signUp:(e:string,p:string)=>Promise<void>;signOut:()=>Promise<void>}>({user:null,loading:true,signIn:async()=>{},signUp:async()=>{},signOut:async()=>{}})
export function AuthProvider({children}:{children:ReactNode}){
  const[user,setUser]=useState<User>(null)
  const[loading,setLoading]=useState(true)
  useEffect(()=>{if(!isCloudMode||!supabase){setLoading(false);return}supabase.auth.getSession().then(({data})=>{setUser(data.session?.user?{id:data.session.user.id,email:data.session.user.email||''}:null);setLoading(false)});const{data:sub}=supabase.auth.onAuthStateChange((_,s)=>setUser(s?.user?{id:s.user.id,email:s.user.email||''}:null));return()=>sub.subscription.unsubscribe()},[])
  const signIn=async(e:string,p:string)=>{if(!supabase)return;const{error}=await supabase.auth.signInWithPassword({email:e,password:p});if(error)throw error}
  const signUp=async(e:string,p:string)=>{if(!supabase)return;const{error}=await supabase.auth.signUp({email:e,password:p});if(error)throw error}
  const signOut=async()=>{if(supabase)await supabase.auth.signOut()}
  return<C.Provider value={{user,loading,signIn,signUp,signOut}}>{children}</C.Provider>
}
export const useAuth=()=>useContext(C)