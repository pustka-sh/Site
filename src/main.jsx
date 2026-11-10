import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/base.css';
import './styles/effects.css';
import './styles/code.css';
import './styles/backend.css';
import './styles/integrations.css';
import 'katex/dist/katex.min.css';
import './styles/published-docs.css';
import './styles/relay-lab.css';
import './styles/search.css';
import './styles/journal.css';
import './styles/docs-reading.css';
import './styles/api-stability.css';
import './styles/docs-compare.css';

// Old links used hash routes (pustka.sh/#/docs/relay). Keep them working.
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
