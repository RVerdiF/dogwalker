import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import '@xterm/xterm/css/xterm.css';
import './index.css';
import { App } from './app/App';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');
createRoot(container).render(<App />);
console.log(`dw renderer up · dw api: ${typeof window.dw}`);
