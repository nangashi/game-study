import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { pullFamily } from './ui/app';
import { mountCount } from './ui/dom';
import { showChildren } from './ui/screens/children';

registerSW({ immediate: true });
showChildren();
// 家族のデータを取って合わせる。まだ最初の画面のままなら、合わせた結果で描きなおす
const first = mountCount();
void pullFamily().then(changed => { if (changed && mountCount() === first) showChildren(); });
