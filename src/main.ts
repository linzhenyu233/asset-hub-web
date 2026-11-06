import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { useSession } from './stores/session'

const app = createApp(App)

// 必须先恢复登录态，再安装路由：否则首次导航的守卫拿不到用户，
// 已登录用户会被误判为未登录而跳到 /login。
const { loadSession } = useSession()
loadSession().finally(() => {
  app.use(router)
  app.mount('#app')
})
