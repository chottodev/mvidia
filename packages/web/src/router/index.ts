import { createRouter, createWebHistory } from 'vue-router';
import UploadView from '../views/UploadView.vue';
import ScreencastView from '../views/ScreencastView.vue';
import WatchView from '../views/WatchView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'upload', component: UploadView },
    { path: '/screencast', name: 'screencast', component: ScreencastView },
    { path: '/v/:publicId', name: 'watch', component: WatchView, props: true },
  ],
});
