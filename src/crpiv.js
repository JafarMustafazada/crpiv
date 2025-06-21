const puppeteer = require('puppeteer');

async function runit(url) {
	// Fetch original HTML to strip resource-hint tags for the 'no-hints' run
	const originalHtml = await (await fetch(url)).text();
	const strippedHtml = originalHtml.replace(
		/<link[^>]+rel="(?:dns-prefetch|preconnect|prefetch|preload)"[^>]*>\s*/gi, ''
	);

	const browser = await puppeteer.launch({
		headless: true,
		// args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
		// defaultViewport: null,
	});
	const results = [];

	// Define our two variants
	const variants = [
		{ name: 'with-hints', load: page => page.goto(url, { waitUntil: 'load' }) },
		{ name: 'no-hints', load: page => page.setContent(strippedHtml, { waitUntil: 'load' }) }
	];

	for (const variant of variants) {
		let sumDns = 0, sumTcp = 0, sumTtfb = 0;
		let sumDom = 0, sumLoad = 0;
		let count = 0;
		const runs = 5;

		for (let i = 0; i < runs; i++) {
			const context = await browser.createBrowserContext();
			const page = await context.newPage();

			// Perform the load
			await variant.load(page);

			// Extract resource hint timings
			const { resources, overall } = await page.evaluate(() => {
				const relTypes = ['dns-prefetch', 'preconnect', 'prefetch', 'preload'];
				const links = Array.from(
					document.querySelectorAll(
						relTypes.map(r => `link[rel="${r}"]`).join(',')
					)
				);
				const hints = links.map(link => ({ href: link.href, rel: link.rel }));
				const entries = performance.getEntriesByType('resource')
					.filter(e => hints.some(h => e.name === h.href));

				const res = entries.map(e => {
					const h = hints.find(h => h.href === e.name);
					return {
						dns: e.domainLookupEnd - e.domainLookupStart,
						tcp: e.connectEnd - e.connectStart,
						ttfb: e.responseStart - e.startTime
					};
				});
				const nav = performance.getEntriesByType('navigation')[0];
				return {
					resources: res,
					overall: {
						dom: nav.domContentLoadedEventEnd - nav.startTime,
						load: nav.loadEventEnd - nav.startTime
					}
				};
			});

			// Aggregate sums
			resources.forEach(r => { sumDns += r.dns; sumTcp += r.tcp; sumTtfb += r.ttfb; });
			sumDom += overall.dom;
			sumLoad += overall.load;
			count += resources.length || 1;

			await context.close();
		}

		// Compute averages
		results.push({
			variant: variant.name,
			avgDns: (sumDns / count).toFixed(1),
			avgTcp: (sumTcp / count).toFixed(1),
			avgTtfb: (sumTtfb / count).toFixed(1),
			domContentLoaded: (sumDom / runs).toFixed(1),
			loadEvent: (sumLoad / runs).toFixed(1)
		});
	}

	console.log(JSON.stringify(results, null, 4));
	await browser.close();
}


(async () => {
	// const url1 = process.argv[2];
	console.log(await runit("https://www.shopify.com"));
})();