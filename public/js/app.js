import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Vercel monitoring non-blockingly
injectSpeedInsights();
inject();

/**
 * Service Worker Kernel Bootloader
 */
async function registerKernel() {
  if (!('serviceWorker' in navigator)) {
    console.warn('WebOS Warning: Service Workers are not supported in this browser pipeline.');
    return;
  }

  try {
    // Register the SW; path points to root directory scope
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });
    
    console.log('WebOS Kernel registered successfully! Scope:', registration.scope);
  } catch (error) {
    console.error('WebOS Kernel Panic: Service Worker registration failed:', error);
  }
}

// Avoid missing the load event if the DOM is already parsed/loaded
if (document.readyState === 'complete') {
  registerKernel();
} else {
  window.addEventListener('load', registerKernel);
}
