# animalpassport.org

The website for **Animal Passport**, an open format for the records that should travel with an animal when it moves between zoological facilities. The specification itself lives at [github.com/animal-passport/spec](https://github.com/animal-passport/spec).

The initial draft was written by Tracks Software.

## Stack

[Astro](https://astro.build) with Tailwind CSS v4. The site is static; there is no server component. Node 22 or later (see `.nvmrc`).

```sh
npm ci
npm run dev       # http://localhost:4321/animal-passport/
npm run build     # static output in dist/
```

## Editing copy

Every page lives in `src/pages/*.astro` with its copy inline. Sentence case everywhere, no exclamation marks.

## Base path

`BASE_PATH` sets the path the site is served from and defaults to `/animal-passport`. The production build sets it to `/`.

## Contact form

The form posts to the URL in `PUBLIC_CONTACT_ENDPOINT` (see `.env.example`). Copy `.env.example` to `.env` to set it for local builds. An optional Cloudflare Turnstile site key goes in `PUBLIC_TURNSTILE_SITE_KEY`.

## Deployment

Pushes to `main` build and publish the site to GitHub Pages through `.github/workflows/deploy.yml`. The custom domain is set by `public/CNAME`.
