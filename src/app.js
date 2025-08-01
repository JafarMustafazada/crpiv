import {crpiv_url, summarizeByMetric, showDetailedSummary} from "./crpiv.js"

(async () => {
	const url1 = process.argv[2];
	const result1 = await crpiv_url(url1);
	const sum1 = summarizeByMetric(result1);
	showDetailedSummary(sum1.summary, sum1.overall);
})();