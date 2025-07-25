import {crpiv_url} from "./crpiv.js"

(async () => {
	const url1 = process.argv[2];
	await crpiv_url(url1);
})();