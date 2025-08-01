import puppeteer from 'puppeteer';

// How many times to navigate for each measurement
const RUNS = 10;

function disableResourceHints(html) {
	return html.replace(
		/\brel=(["'])(dns-prefetch|preconnect|prefetch|preload)\1/gi,
		(match, quote, relType) => `rel=${quote}no${relType}${quote}`
	);
}

/**
 * @typedef {Object} ResourceTiming
 * @property {number} index    // e.g. the order of finding
 * @property {string} href     // e.g. the link href
 * @property {string} rel      // the link rel value
 * @property {number} dns      // DNS lookup time in ms
 * @property {number} tcp      // TCP connect time in ms
 * @property {number} ttfb     // time to first byte in ms
 *
 * @typedef {Object} RunResult
 * @property {ResourceTiming[]} resources
 * @property {{ dom: number, load: number }} overall
 *
 * @typedef {Object} AllResults
 * @property {RunResult[]} with-hints
 * @property {RunResult[]} no-hints
 */

/**
 * Fetches a URL with and without resource hints, RUNS measurements,
 * and returns the raw timing results.
 *
 * @param {string} url
 * @returns {Promise<AllResults>}
 */
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
	return allResults;
	// printComparison(allResults);
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

// in browser function
function runPerformanceChecks() {
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

}

/**
 * Summarize performance across multiple runs with and without hints,
 * computing separate deltas for dns, tcp, and ttfb.
 *
 * @param {AllResults} allResults
 *
 * Each overall item:
 * {
 *   meanDomWith: number,
 *   varDomWith: number,
 *   meanDomNo: number,
 *   varDomNo: number,
 *   deltaDom: number,
 *   
 *   meanLoadWith: number,
 *   varLoadWith: number,
 *   meanLoadNo: number,
 *   varLoadNo: number,
 *   deltaLoad: number
 * }
 */
export function summarizeByMetric(allResults) {
	const withRuns = allResults['with-hints'] || [];
	const noRuns = allResults['no-hints'] || [];

	function aggregate(runs, field) {
		const map = new Map();
		for (const run of runs) {
			for (const r of run.resources) {
				const key = r.href;
				if (!map.has(key)) {
					map.set(key, { sum: 0, count: 0, rel: r.rel });
				}
				const entry = map.get(key);
				entry.sum += r[field];
				entry.count += 1;
			}
		}
		return map;
	}

	const stats = arr => {
		const n = arr.length;
		const sum = arr.reduce((a, x) => a + x, 0);
		const mean = sum / n;
		const variance = arr.reduce((a, x) => a + (x - mean) ** 2, 0) / n;
		return { mean, variance };
	};

	const withDns = aggregate(withRuns, 'dns');
	const withTcp = aggregate(withRuns, 'tcp');
	const withTtfb = aggregate(withRuns, 'ttfb');

	const noDns = aggregate(noRuns, 'dns');
	const noTcp = aggregate(noRuns, 'tcp');
	const noTtfb = aggregate(noRuns, 'ttfb');

	const hrefs = new Set([
		...withDns.keys(), ...noDns.keys()
	]);

	const summary = [];
	for (const href of hrefs) {
		const wDns = withDns.get(href) || { sum: 0, count: 0, rel: '' };
		const wTcp = withTcp.get(href) || { sum: 0, count: 0 };
		const wTtfb = withTtfb.get(href) || { sum: 0, count: 0 };

		const nDns = noDns.get(href) || { sum: 0, count: 0 };
		const nTcp = noTcp.get(href) || { sum: 0, count: 0 };
		const nTtfb = noTtfb.get(href) || { sum: 0, count: 0 };

		// Need both sides for each metric
		if (!wDns.count || !nDns.count ||
			!wTcp.count || !nTcp.count ||
			!wTtfb.count || !nTtfb.count) {
			continue;
		}

		const avgDnsWith = wDns.sum / wDns.count;
		const avgTcpWith = wTcp.sum / wTcp.count;
		const avgTtfbWith = wTtfb.sum / wTtfb.count;

		const avgDnsNo = nDns.sum / nDns.count;
		const avgTcpNo = nTcp.sum / nTcp.count;
		const avgTtfbNo = nTtfb.sum / nTtfb.count;

		summary.push({
			href,
			rel: wDns.rel,
			avgDnsWith: Number(avgDnsWith.toFixed(2)),
			avgTcpWith: Number(avgTcpWith.toFixed(2)),
			avgTtfbWith: Number(avgTtfbWith.toFixed(2)),

			avgDnsNo: Number(avgDnsNo.toFixed(2)),
			avgTcpNo: Number(avgTcpNo.toFixed(2)),
			avgTtfbNo: Number(avgTtfbNo.toFixed(2)),

			deltaDns: Number((avgDnsWith - avgDnsNo).toFixed(2)),
			deltaTcp: Number((avgTcpWith - avgTcpNo).toFixed(2)),
			deltaTtfb: Number((avgTtfbWith - avgTtfbNo).toFixed(2))
		});
	}

	// Collect overall DOM and load arrays
	const collectOverall = (runs, field) =>
		runs.map(r => r.overall && typeof r.overall[field] === 'number'
			? r.overall[field]
			: null
		).filter(x => x !== null);

	const domWithArr = collectOverall(withRuns, 'dom');
	const domNoArr = collectOverall(noRuns, 'dom');
	const loadWithArr = collectOverall(withRuns, 'load');
	const loadNoArr = collectOverall(noRuns, 'load');

	const { mean: meanDomWith, variance: varDomWith } = stats(domWithArr);
	const { mean: meanDomNo, variance: varDomNo } = stats(domNoArr);
	const { mean: meanLoadWith, variance: varLoadWith } = stats(loadWithArr);
	const { mean: meanLoadNo, variance: varLoadNo } = stats(loadNoArr);

	const deltaDom = meanDomWith - meanDomNo;
	const deltaLoad = meanLoadWith - meanLoadNo;

	const overall = {
		meanDomWith: Number(meanDomWith.toFixed(2)),
		varDomWith: Number(varDomWith.toFixed(2)),
		meanDomNo: Number(meanDomNo.toFixed(2)),
		varDomNo: Number(varDomNo.toFixed(2)),
		deltaDom: Number(deltaDom.toFixed(2)),

		meanLoadWith: Number(meanLoadWith.toFixed(2)),
		varLoadWith: Number(varLoadWith.toFixed(2)),
		meanLoadNo: Number(meanLoadNo.toFixed(2)),
		varLoadNo: Number(varLoadNo.toFixed(2)),
		deltaLoad: Number(deltaLoad.toFixed(2))
	};


	return { summary, overall };
}

/**
 * Prints the detailed summary with separate colored badges
 * for DNS, TCP, and TTFB deltas.
 *
 * @param {Array<Object>} summary  // from summarizeByMetric()
 * @param {number} [threshold=5]  // ms threshold for “small difference”
 */
export function showDetailedSummary(summary, overall, threshold = 5) {
	// ANSI color codes
	const RESET = '\x1b[0m';
	const RED = '\x1b[31m';
	const GREEN = '\x1b[32m';
	const YELLOW = '\x1b[33m';

	function colorDealta(name, delta, threshold = 5) {
		let color, symbol;
		if (delta > threshold) { color = GREEN; symbol = '+'; }
		else if (delta < -threshold) { color = RED; symbol = ''; }
		else { color = YELLOW; symbol = '+-'; }
		const msg = `${name.padEnd(4)} Δ = ${symbol}${delta.toFixed(2)} ms`;
		return `${color}${msg}${RESET}`;
	}

	console.groupCollapsed("\nResource Hint Impact Details");
	summary.forEach(item => {
		console.groupCollapsed(`${item.href} (${item.rel})`);

		const metrics = [
			{ name: 'DNS', delta: item.deltaDns },
			{ name: 'TCP', delta: item.deltaTcp },
			{ name: 'TTFB', delta: item.deltaTtfb }
		];

		metrics.forEach(({ name, delta }) => {
			console.log(`\t${colorDealta(name,delta,threshold)}`);
		});

		console.groupEnd();
	});
	console.groupEnd();

	console.log('\nOVERALL NAVIGATION');
	console.log(`${colorDealta("OverallDom",overall.deltaDom,threshold)}`);
	console.log(`${colorDealta("OverallLoad",overall.deltaLoad,threshold)}\n`);
}

// /**
//  * @param {AllResults} data1 - data from cripv_url
//  */
// export function printComparison(data1) {
// 	const variants = ['with-hints', 'no-hints'];
// 	const hintCount = data1['with-hints'][0].resources.length;
// 	const ids = data1['with-hints'][0].resources.map(r => r.href);

// 	const stats = arr => {
// 		const n = arr.length;
// 		const sum = arr.reduce((a, x) => a + x, 0);
// 		const mean = sum / n;
// 		const variance = arr.reduce((a, x) => a + (x - mean) ** 2, 0) / n;
// 		return { mean, variance };
// 	};

// 	// per‑hint stats
// 	const perHintStats = variants.reduce((acc, v) => {
// 		acc[v] = Array.from({ length: hintCount }, (_, idx) => {
// 			const dnsArr = data1[v].map(r => r.resources[idx].dns);
// 			const tcpArr = data1[v].map(r => r.resources[idx].tcp);
// 			const ttfbArr = data1[v].map(r => r.resources[idx].ttfb);
// 			return {
// 				dns: stats(dnsArr),
// 				tcp: stats(tcpArr),
// 				ttfb: stats(ttfbArr),
// 			};
// 		});
// 		return acc;
// 	}, {});

// 	// ANSI color codes
// 	const RESET = '\x1b[0m';
// 	const RED = '\x1b[31m';
// 	const GREEN = '\x1b[32m';

// 	console.log('\n=== PER-LINK AVERAGES ===');
// 	for (let i = 0; i < hintCount; i++) {
// 		console.log(`\nLink #${i}: ${ids[i]}`);
// 		const base = perHintStats['with-hints'][i];

// 		variants.forEach(v => {
// 			const cur = perHintStats[v][i];
// 			const label = v === 'no-hints' ? 'no‑hints' : 'with‑hints';

// 			// Helper to colorize no‑hints values
// 			const fmt = (metric) => {
// 				const m = cur[metric].mean.toFixed(1);
// 				const sd = Math.sqrt(cur[metric].variance).toFixed(1);
// 				const txt = `${metric}=${m}±${sd} ms`;

// 				if (v === 'no-hints') {
// 					// compare mean to with‑hints
// 					return cur[metric].mean < base[metric].mean
// 						? `${GREEN}${txt}${RESET}`
// 						: `${RED}${txt}${RESET}`;
// 				}
// 				return txt;
// 			};

// 			console.log(`  ${label}: ${fmt('dns')}, ${fmt('tcp')}, ${fmt('ttfb')}`);
// 		});
// 	}

// 	// Overall nav timings
// 	const overallStats = variants.reduce((acc, v) => {
// 		const domArr = data1[v].map(r => r.overall.dom);
// 		const loadArr = data1[v].map(r => r.overall.load);
// 		acc[v] = { dom: stats(domArr), load: stats(loadArr) };
// 		return acc;
// 	}, {});

// 	console.log('\n=== OVERALL NAVIGATION ===');
// 	const baseO = overallStats['with-hints'];
// 	variants.forEach(v => {
// 		const curO = overallStats[v];
// 		const label = v === 'no-hints' ? 'no‑hints' : 'with‑hints';

// 		const fmtO = (metric) => {
// 			const m = curO[metric].mean.toFixed(1);
// 			const sd = Math.sqrt(curO[metric].variance).toFixed(1);
// 			const txt = `${metric}=${m}±${sd} ms`;

// 			if (v === 'no-hints') {
// 				return curO[metric].mean < baseO[metric].mean
// 					? `${GREEN}${txt}${RESET}`
// 					: `${RED}${txt}${RESET}`;
// 			}
// 			return txt;
// 		};

// 		console.log(`${label}: ${fmtO('dom')}, ${fmtO('load')}`);
// 	});
// }