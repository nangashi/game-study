import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { showProfiles } from './ui/screens/profiles';

registerSW({ immediate: true });
showProfiles();
