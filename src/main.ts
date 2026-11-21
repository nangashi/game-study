import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { showChildren } from './ui/screens/children';

registerSW({ immediate: true });
showChildren();
