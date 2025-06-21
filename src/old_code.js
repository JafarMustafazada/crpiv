const puppeteer = require('puppeteer');

async function fetch_upwork(searchUrl = 'https://www.upwork.com/nx/search/jobs/?per_page=10&q=n8n') {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: [ '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', ],
        defaultViewport: null, 
    });
    const page = await browser.newPage();

    // Set user agent to mimic a real browser
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    );
  
    // Go to the URL
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

    // Wait for the necessary content to load (customize as needed)
    await page.waitForSelector('.job-tile', { timeout: 6000 });
  
    // Extract html data
    // const data = await page.content();
    // console.log(data);

    const jobs = await page.evaluate(() => {
        const jobTiles = document.querySelectorAll('.job-tile');
        return Array.from(jobTiles).map(tile => {
            const getText = (selector) => {
                const element = tile.querySelector(selector);
                return element ? element.textContent.trim() : 'N/A';
            };

            const title1 = tile.querySelector('.job-tile-title a');
            const skill1 = tile.querySelectorAll('[data-test="token"] span');

            return {
                title: (title1 ? title1.textContent.trim() : 'N/A'),
                link: (title1 ? `https://www.upwork.com${title1.getAttribute('href')}` : 'N/A'),
                paymentType: getText('[data-test="job-type-label"] strong').includes('Hourly') ? 'Hourly' : 'Fixed',
                budget: getText('[data-test="job-type-label"] strong'),
                projectLength: getText('[data-test="duration-label"] strong') || 'N/A',
                shortBio: getText('[data-test="UpCLineClamp JobDescription"] p'),
                skills: (skill1.length ? Array.from(skill1).map(el => el.textContent.trim()) : []),
                publishedDate: getText('[data-test="job-pubilshed-date"]').replace('Posted', '').trim(),
                searchUrl: location.href
            };
        });
    });
    
    await browser.close();
    return JSON.stringify(jobs, null, 0);
}

(async () => {
    // const url1 = process.argv[2];
    // console.log(await fetch_upwork(url1));
    console.log(await fetch_upwork());
})();
