import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rexfordshelby.manyai',
  appName: 'Luma AI',
  webDir: 'public',
  server: {
    url: 'https://allai-pink.vercel.app',
    cleartext: false
  }
};

export default config;
