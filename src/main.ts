import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { pullFamily } from './ui/app';
import { mountCount } from './ui/dom';
import { startPwaUpdate } from './ui/pwa-update';
import { showChildren } from './ui/screens/children';

// 更新チェックと「新しい版で1回だけリロード」は pwa-update にまとめる（autoUpdate のリロードもここを通す）
const pwa = startPwaUpdate();
registerSW({ immediate: true, onNeedReload: pwa.reloadOnce });
showChildren();
// 家族のデータを取って合わせる。まだ最初の画面のままなら、合わせた結果で描きなおす
const first = mountCount();
void pullFamily().then(changed => { if (changed && mountCount() === first) showChildren(); });
