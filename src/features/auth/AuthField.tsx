import type {ReactNode} from 'react'

interface AuthFieldProps{
  label:string
  value:string
  onChange:(value:string)=>void
  type?:string
  placeholder?:string
  autoComplete?:string
  error?:string
  disabled?:boolean
}

export default function AuthField({label,value,onChange,type='text',placeholder,autoComplete,error,disabled}:AuthFieldProps){
  return(
    <div style={{marginBottom:14}}>
      <label style={{display:'block',fontSize:13,color:'#64748b',marginBottom:6}}>{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={e=>onChange(e.target.value)}
        style={{width:'100%'}}
      />
      {error&&<div style={{color:'#ef4444',fontSize:12,marginTop:5}}>{error}</div>}
    </div>
  )
}

export function AuthMessage({kind,children}:{kind:'error'|'success'|'info';children:ReactNode}){
  const styles={
    error:{color:'#b91c1c',background:'#fef2f2',border:'1px solid #fecaca'},
    success:{color:'#15803d',background:'#f0fdf4',border:'1px solid #bbf7d0'},
    info:{color:'#0369a1',background:'#f0f9ff',border:'1px solid #bae6fd'},
  } as const
  return(
    <div style={{...styles[kind],borderRadius:8,padding:'10px 12px',fontSize:13,lineHeight:1.6,marginBottom:14}}>
      {children}
    </div>
  )
}
