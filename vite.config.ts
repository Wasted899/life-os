import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa'
export default defineConfig({
  plugins:[react(),VitePWA({
    registerType:'autoUpdate',
    includeAssets:['favicon.svg','apple-touch-icon.png'],
    manifest:{
      name:'个人规划助手',
      short_name:'规划助手',
      description:'待办目标习惯记账一体化规划工具',
      lang:'zh-CN',
      theme_color:'#101014',
      background_color:'#0B0B0F',
      display:'standalone',
      icons:[
        {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
        {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
        {src:'/favicon.svg',sizes:'any',type:'image/svg+xml'}
      ]
    }
  })],
  server:{port:5173,open:true}
})
