const GIS_URL = 'https://accounts.google.com/gsi/client';

let loadPromise: Promise<void> | undefined;

export const loadGis = (): Promise<void> => {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = undefined;
      reject(new Error('Failed to load Google Identity Services script'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
};
