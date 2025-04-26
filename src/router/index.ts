// router.js / index.js
import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'
import LoginView from '@/views/LoginView.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    // 注意：如果根路径 '/' 和 '/chat' 都指向 ChatView 且都需要认证
    // 可以考虑合并或只保留一个明确的路径如 '/chat'，让 '/' 重定向到 '/chat'
    // 或者像现在这样，两者都配置
    component: ChatView,
    meta: { requiresAuth: true }
  },
  {
    path: '/chat',
    name: 'Chat',
    component: ChatView,
    meta: { requiresAuth: true }
  },
  {
    path: '/map',
    name: 'Map',
    component: () => import('@/components/MapNavigation.vue'),
    // 如果 Map 页面也需要认证，记得添加 meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  // 1. 检查 URL hash 是否包含 jwt_token
  if (to.hash.startsWith('#jwt_token=')) {
    const token = to.hash.substring('#jwt_token='.length);
    if (token) {
      console.log('Token found in hash, saving to localStorage.');
      localStorage.setItem('jwt_token', token);
      // 清理 sessionStorage (仍然是好习惯)
      sessionStorage.removeItem('redirectPath');
      // 清理 URL 中的 hash，让地址栏更干净 (可选但推荐)
      // 使用 replace: true 避免用户点击后退回到带 hash 的 URL
      next({ path: to.path, query: to.query, hash: '', replace: true });
      return; // 完成处理，等待下一次导航（因为我们改变了URL）
    } else {
      // hash 中 key 存在但 token 为空，视为无效，清理 hash 继续
      console.warn('Empty token found in hash.');
      next({ path: to.path, query: to.query, hash: '', replace: true });
      return;
    }
  }

  // 2. 检查目标路由是否需要认证
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const token = localStorage.getItem('jwt_token');

  if (requiresAuth && !token) {
    // 3. 需要认证但无 token -> 重定向到前端登录页
    console.log('No token found, redirecting to frontend login page...');
    // 保存用户尝试访问的完整路径 (包括查询参数和 hash，如果有的话)
    sessionStorage.setItem('redirectPath', to.fullPath);
    next({ name: 'Login' });
    return;
  }

  // 如果不需要认证，或者需要认证且已有 token，则放行
  console.log(`Navigation allowed to ${to.path}`);
  next();
});

export default router;
