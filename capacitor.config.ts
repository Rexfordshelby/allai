import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rexfordshelby.manyai',
  appName: 'Luma AI',
  webDir: 'public',
  server: {
    url: 'https://luma-ai-studio.vercel.app',
    cleartext: false
  }
};

export default config;
