import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn } from '../api/authApi';
import UploadView from '../views/UploadView.vue';
import WatchView from '../views/WatchView.vue';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import ProfileView from '../views/ProfileView.vue';
import MyVideosView from '../views/MyVideosView.vue';
import EditVideoView from '../views/EditVideoView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'upload', component: UploadView },
    { path: '/v/:publicId', name: 'watch', component: WatchView, props: true },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/register', name: 'register', component: RegisterView },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { requiresAuth: true },
    },
    {
      path: '/my/videos',
      name: 'myVideos',
      component: MyVideosView,
      meta: { requiresAuth: true },
    },
    {
      path: '/my/videos/:publicId/edit',
      name: 'editVideo',
      component: EditVideoView,
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isLoggedIn()) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    };
  }
  return true;
});
