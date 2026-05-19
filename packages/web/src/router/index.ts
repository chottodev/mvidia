import { createRouter, createWebHistory } from 'vue-router';
import UploadView from '../views/UploadView.vue';
import WatchView from '../views/WatchView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'upload', component: UploadView },
    { path: '/v/:publicId', name: 'watch', component: WatchView, props: true },
  ],
});
