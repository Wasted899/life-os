import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa'
export default defineConfig({
  plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{name:'个人规划助手',short_name:'规划助手',description:'待办目标习惯记账一体化规划工具',theme_color:'#2563eb',background_color:'#f0f4f8',display:'standalone',icons:[{src:'/favicon.svg',sizes:'any',type:'image/svg+xml'}]}})],
  server:{port:5173,open:true}
})