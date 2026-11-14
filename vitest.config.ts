import {defineConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * 测试配置：默认 node 环境（cloudSync / supabase 纯逻辑用例）。
 * 需要 DOM 的用例在文件头用 `// @vitest-environment jsdom` 单独切换，
 * 这样不会改变既有 node 用例的运行环境。
 */
export default defineConfig({
  plugins:[react()],
  test:{
    environment:'node',
    include:['src/**/*.test.{ts,tsx}'],
  },
})
