import puppeteer from 'puppeteer';

// How many times to navigate for each measurement
const RUNS = 10;

function disableResourceHints(html) {
	return html.replace(
		/\brel=(["'])(dns-prefetch|preconnect|prefetch|preload)\1/gi,
		(match, quote, relType) => `rel=${quote}no${relType}${quote}`
	);
}

export async function crpiv_url(url) {
	const originalHtml = await (await fetch(url)).text();
	const strippedHtml = disableResourceHints(originalHtml);
	const browser = await puppeteer.launch({ headless: true });

	const variants = [
		{ name: 'with-hints', load: page => page.setContent(originalHtml, { waitUntil: 'load' }) },
		{ name: 'no-hints', load: page => page.setContent(strippedHtml, { waitUntil: 'load' }) }
	];

	const allResults = {};

	for (const variant of variants) {
		allResults[variant.name] = [];

		for (let i = 0; i < RUNS; i++) {
			const result = await measureVariantPerformance(variant, browser);
			allResults[variant.name].push(result);
		}
	}

	await browser.close();

	printComparison(allResults);
}

async function measureVariantPerformance(variant, browser) {
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	await page.setCacheEnabled(false);

	await variant.load(page);
	const { resources, overall } = await page.evaluate(runPerformanceChecks);

	await context.close();
	return { resources, overall };
}

function runPerformanceChecks() {
	const relTypes = [
		'dns-prefetch', 'preconnect', 'prefetch', 'preload',
		'nodns-prefetch', 'nopreconnect', 'noprefetch', 'nopreload'
	];
	const hints = getLinkHints(relTypes);
	const resources = hints.map(getTimingForHint);
	const nav = performance.getEntriesByType('navigation')[0] || {};

	return {
		resources,
		overall: {
			dom: nav.domContentLoadedEventEnd - nav.startTime,
			load: nav.loadEventEnd - nav.startTime
		}
	};

	function getLinkHints(relTypes) {
		const selector = relTypes.map(r => `link[rel="${r}"]`).join(',');
		return Array.from(document.querySelectorAll(selector))
			.map((link, i) => ({
				index: i,
				href: link.href,
				rel: link.rel
			}));
	}

	function getTimingForHint({ index, href, rel }) {
		const entry = performance.getEntriesByName(href, 'resource')[0] || {};
		return {
			index, href, rel, dns: entry.domainLookupEnd - entry.domainLookupStart || 0,
			tcp: entry.connectEnd - entry.connectStart || 0,
			ttfb: entry.responseStart - entry.startTime || 0
		};
	}
}

function printComparison(allResults) {
	const variants = ['with-hints', 'no-hints'];
	const hintCount = allResults['with-hints'][0].resources.length;
	const ids = allResults['with-hints'][0].resources.map(r => r.href);

	const stats = arr => {
		const n = arr.length;
		const sum = arr.reduce((a, x) => a + x, 0);
		const mean = sum / n;
		const variance = arr.reduce((a, x) => a + (x - mean) ** 2, 0) / n;
		return { mean, variance };
	};

	// per‑hint stats
	const perHintStats = variants.reduce((acc, v) => {
		acc[v] = Array.from({ length: hintCount }, (_, idx) => {
			const dnsArr = allResults[v].map(r => r.resources[idx].dns);
			const tcpArr = allResults[v].map(r => r.resources[idx].tcp);
			const ttfbArr = allResults[v].map(r => r.resources[idx].ttfb);
			return {
				dns: stats(dnsArr),
				tcp: stats(tcpArr),
				ttfb: stats(ttfbArr),
			};
		});
		return acc;
	}, {});

	// ANSI color codes
	const RESET = '\x1b[0m';
	const RED = '\x1b[31m';
	const GREEN = '\x1b[32m';

	console.log('\n=== PER-LINK AVERAGES ===');
	for (let i = 0; i < hintCount; i++) {
		console.log(`\nLink #${i}: ${ids[i]}`);
		const base = perHintStats['with-hints'][i];

		variants.forEach(v => {
			const cur = perHintStats[v][i];
			const label = v === 'no-hints' ? 'no‑hints' : 'with‑hints';

			// Helper to colorize no‑hints values
			const fmt = (metric) => {
				const m = cur[metric].mean.toFixed(1);
				const sd = Math.sqrt(cur[metric].variance).toFixed(1);
				const txt = `${metric}=${m}±${sd} ms`;

				if (v === 'no-hints') {
					// compare mean to with‑hints
					return cur[metric].mean < base[metric].mean
						? `${GREEN}${txt}${RESET}`
						: `${RED}${txt}${RESET}`;
				}
				return txt;
			};

			console.log(`  ${label}: ${fmt('dns')}, ${fmt('tcp')}, ${fmt('ttfb')}`);
		});
	}

	// Overall nav timings
	const overallStats = variants.reduce((acc, v) => {
		const domArr = allResults[v].map(r => r.overall.dom);
		const loadArr = allResults[v].map(r => r.overall.load);
		acc[v] = { dom: stats(domArr), load: stats(loadArr) };
		return acc;
	}, {});

	console.log('\n=== OVERALL NAVIGATION ===');
	const baseO = overallStats['with-hints'];
	variants.forEach(v => {
		const curO = overallStats[v];
		const label = v === 'no-hints' ? 'no‑hints' : 'with‑hints';

		const fmtO = (metric) => {
			const m = curO[metric].mean.toFixed(1);
			const sd = Math.sqrt(curO[metric].variance).toFixed(1);
			const txt = `${metric}=${m}±${sd} ms`;

			if (v === 'no-hints') {
				return curO[metric].mean < baseO[metric].mean
					? `${GREEN}${txt}${RESET}`
					: `${RED}${txt}${RESET}`;
			}
			return txt;
		};

		console.log(`${label}: ${fmtO('dom')}, ${fmtO('load')}`);
	});
}