import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/auth.css';
import './styles/chat.css';
import './styles/library.css';
import './styles/search.css';
import './styles/workspace.css';
import App from './App';
import { AuthProvider } from './state/auth';
import { ToastProvider } from './state/toast';
import { initTheme } from './state/theme';

async function bootstrap() {
  initTheme();
  if (import.meta.env.VITE_MOCK === '1') {
    const { installMocks } = await import('./mocks');
    installMocks();
  }

  /* Let the boot shell paint one frame before React replaces it. Without this
     the first paint can land after the app renders, so a slow connection shows
     nothing until the bundle arrives. */
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  const root = document.getElementById('root');
  if (!root) throw new Error('#root element not found');
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

void bootstrap();
