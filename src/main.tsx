import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Polices servies par le projet lui-même (aucun chargement depuis Internet).
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/alegreya-sans/latin-800.css';
import '@fontsource/alegreya-sans-sc/latin-700.css';
import '@fontsource/alegreya-sans-sc/latin-800.css';
import './ui/game.css';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
