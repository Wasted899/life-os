import {defineConfig} from 'vitest/config'

// 单测只跑纯逻辑与网络层，默认 node 环境；
// 独立配置，避免加载 vite.config.ts 里的 PWA 插件。
export default defineConfig({
  test:{
    environment:'node',
    include:['src/**/*.test.ts'],
  },
})
