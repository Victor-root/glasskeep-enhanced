// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
// Self-hosted webfonts (Fontsource — bundled locally, no CDN). Each font
// ships its own @font-face declarations in the imported CSS; the actual
// woff2 binaries are only fetched by the browser when text uses that
// family / weight, so registering many families costs almost nothing
// at page load.
//
// Sans-serif
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/700.css';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/700.css';
import '@fontsource/lato/400.css';
import '@fontsource/lato/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/700.css';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/raleway/400.css';
import '@fontsource/raleway/700.css';
import '@fontsource/work-sans/400.css';
import '@fontsource/work-sans/700.css';
import '@fontsource/ubuntu/400.css';
import '@fontsource/ubuntu/500.css';
import '@fontsource/ubuntu/700.css';
// Serif
import '@fontsource/merriweather/400.css';
import '@fontsource/merriweather/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/700.css';
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/700.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/700.css';
// Monospace
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/700.css';
import '@fontsource/source-code-pro/400.css';
import '@fontsource/source-code-pro/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/700.css';
// Display / decorative
import '@fontsource/bebas-neue/400.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/700.css';
import '@fontsource/pacifico/400.css';
import '@fontsource/dancing-script/400.css';
import '@fontsource/dancing-script/700.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import App from './App.jsx';

// Register the PWA Service Worker (vite-plugin-pwa)
registerSW({
  immediate: true, // install/update SW ASAP
  // Optional callbacks:
  // onNeedRefresh() {},
  // onOfflineReady() {},
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
