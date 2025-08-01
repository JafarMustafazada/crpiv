# CRPIV (0.1)
Client‐Side Resource Prefetch Impact Visualizer.

- [crpiv](#liboqs)
	- [Description](#description)
	- [Requirments](#requirments)
	- [How To Use](#how-to-use)
		- [Using in Console](#using-in-console)
		- [Using in Code](#using-in-code)

## Description

A simple JS web app that visualizes the impact of using `<link rel="prefetch">` or `<link rel="preload">` on page performance by timing resource load with and without prefetching. Uses `puppeteer` for browser simulations.

## Requirments

- `npm` (for installing package `puppeteer`)
- `nodejs` (to run program).

## How To Use

`"type": "module"` in `package.json` added for convenience but removing it may break code. By default amount of runs per url is `10`, but can be changed in 4th line of `crpiv.js`.

- Command 0.1. `cd src` to get in `src` folder.
- Command 0.2. `npm install` to install packages from `package.json` and therefor create `node_modules` folder.

### Using in Console

- Command 1. `node app.js https://www.shopify.com` to run program (where url being any other).

### Using in Code

As in `app.js` you only import `crpiv.js` file functions (which is `crpiv_url`, `summarizeByMetric` & `showDetailedSummary`).

```js
import {crpiv_url, printComparison} from "./crpiv.js"
```

- Function `crpiv_url`. Takes string of url and returns following object: 
```json
{
	"with-hints": [                            // Array of RUNS raw measurements
		{
			resources: [                            // one entry per <link>
				{
					id: 0							  // order in which founded
					href: "https://…/styles.css",
					rel: "preload",                   // original rel value
					dns: 5.2,                         // milliseconds
					tcp: 10.3,
					ttfb: 20.7
				},
				{ /* …next resource… */ }
			],
			overall: {                              // navigation timing for this run
				dom: 123.4,                          // DOMContentLoaded → startTime
				load: 234.5                           // loadEventEnd     → startTime
			}
		},
		{ /* …second run of “with‑hints”… */ }
	],
	"no-hints": [                              // same structure, but “no-hints” variant
		{
			resources: [
				{
					id: 0
					href: "https://…/styles.css",
					rel: "nopreload",
					dns: 3.9,
					tcp: 9.8,
					ttfb: 18.2
				},
				{ /* … */ },
			],
			overall: {
				dom: 130.1,
				load: 245.9
			}
		},
		{ /* … */ },
	]
}
```
- Function `summarizeByMetric`. Takes previusly shown object and sums the data and adds the delta value to calculate the impact badge to give in next json.
```json
{
	"summary": [
		{
			href: "any",
			rel: "any",
			avgDnsWith: 3.9,
			avgTcpWith: 9.8,
			avgTtfbWith: 18.2,
			avgDnsNo: 130.1,
			avgTcpNo: 245.9,
			avgTtfbNo: 3.9,
			deltaDns: 9.8,
			deltaTcp: 18.2,
			deltaTtfb: 130.1,
		},
		{ /* …second tag */ }
	],
	"overall": {
		meanDomWith: 130.1,
		varDomWith: 245.9,
		meanDomNo: 3.9,
		varDomNo: 9.8,
		deltaDom: 18.2,
		meanLoadWith: 130.1,
		varLoadWith: 245.9,
		meanLoadNo: 3.9,
		varLoadNo: 9.8,
		deltaLoad: 18.2,
	}
}
```
- Function `showDetailedSummary`. Takes previusly shown objects and shows in console with colors and threshold being 5ms (by default) impact badges.
```js
Resource Hint Impact Details
  https://cdn.shopify.com/b/shopify-brochure2-assets/7ecd57f2fa3d7b997d29181a62c954ee.png?originalWidth=1920&originalHeight=1080 (preload)
        DNS  Δ = +-0.00 ms
        TCP  Δ = +-0.00 ms
        TTFB Δ = -71.49 ms
  https://cdn.shopify.com/b/shopify-brochure2-assets/8e7a81acb91d51d6051bfb7f97e8ecaa.woff2 (preload)
        DNS  Δ = +-2.70 ms
        TCP  Δ = -50.97 ms
        TTFB Δ = -137.37 ms

OVERALL NAVIGATION
OverallDom Δ = +-1.48 ms
OverallLoad Δ = +-1.46 ms
```