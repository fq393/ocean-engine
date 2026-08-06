import './styles.css';
import { OceanDemo } from './app/OceanDemo';
import { chooseBackend, detectCapabilities } from './platform/capabilities';

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Missing #app mount element');
const backend = chooseBackend(detectCapabilities());

if (backend === 'unsupported') {
  mount.innerHTML = '<div class="hud"><strong>海洋引擎</strong><span>当前浏览器不支持 WebGL2。</span></div>';
} else {
  const demo = new OceanDemo(mount, backend);
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <span class="eyebrow">实时海洋与天气模拟</span>
    <strong>热带航道</strong>
    <span>${demo.backendLabel}</span>
    <div class="hud-rule"></div>
    <span>操作说明</span>
    <span>W 前进 · S 后退</span>
    <span>A 左转 · D 右转</span>
    <span>T 切换晴天 / 暴风雨</span>
    <span data-weather-label>当前天气：晴朗</span>
  `;
  mount.append(hud);
  demo.start();
  window.addEventListener('pagehide', () => demo.dispose(), { once: true });
}
