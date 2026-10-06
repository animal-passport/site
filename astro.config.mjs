// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// The default base is /animal-passport. The production build
// (GitHub Pages at animalpassport.org) sets BASE_PATH=/ to serve from the root.
const base = process.env.BASE_PATH || '/animal-passport';

// https://astro.build/config
export default defineConfig({
  site: 'https://animalpassport.org',
  base,

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    sitemap({
      filter: (page) => !/\/(404|og-template)\/?$/.test(page),
    }),
  ],
});
