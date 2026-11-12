// HTML zu PDF mit dem Chromium des Containers. Ein Browser für alle Anfragen, eine Seite je Dokument.
import puppeteer from 'puppeteer-core'

let start = null

async function browser() {
  if (!start) {
    start = puppeteer.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
    }).catch(e => { start = null; throw e })
  }
  const b = await start
  if (!b.connected) { start = null; return browser() }
  return b
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export async function pdf(html, { fusszeile = '' } = {}) {
  const page = await (await browser()).newPage()
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    const out = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '18mm', left: '17mm', right: '17mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;padding:0 17mm;font:7.5px/1 Helvetica,Arial,sans-serif;color:#6b7478;display:flex;justify-content:space-between"><span>${esc(fusszeile)}</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>`,
    })
    return Buffer.from(out)
  } finally {
    await page.close().catch(() => {})
  }
}

export async function schliessen() {
  if (start) { const b = await start.catch(() => null); start = null; await b?.close().catch(() => {}) }
}
