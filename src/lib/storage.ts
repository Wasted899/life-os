export const load=<T>(key:string,def:T):T=>{try{const v=localStorage.getItem(key);return v?JSON.parse(v):def}catch{return def}}
export const save=(key:string,val:any)=>{try{localStorage.setItem(key,JSON.stringify(val))}catch{}}
export const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36)