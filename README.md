# CRPIV (0.1)
Client‐Side Resource Prefetch Impact Visualizer.

- [crpiv](#liboqs)
	- [Description](#description)
	- [Requirments & How To Run](#requirments)

## Description

A simple JS web app that visualizes the impact of using `<link rel="prefetch">` or `<link rel="preload">` on page performance by timing resource load with and without prefetching. Uses `puppeteer` for browser simulations.

## Requirments

- Have `npm` (for installing 3rdparty resources) and `nodejs` (to run program) installed for following commands.
- Command 0. `cd src` to get in `src` folder.
- Command 1. `npm install` to install packages from `package.json` and therefor create `node_modules` folder.
- Command 2. `node app.js https://www.shopify.com` to run program (where url being any other).