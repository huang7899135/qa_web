import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'

const routes = [
  {
    path: '/',
    name: 'Chat',
    component: ChatView
  },
  {
    path: '/map',
    name: 'Map',
    component: () => import('@/components/MapNavigation.vue')
  }

]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router