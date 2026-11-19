import { startApp } from '@marktype/app';
import { createWebPlatform } from './platform/web.ts';

startApp(createWebPlatform(), document.getElementById('app')!);
