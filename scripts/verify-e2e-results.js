// Quality Gates: lee el JSON de Playwright (reporter json) y falla si no hay
// resultados o si algún test terminó en unexpected/flaky-fatal. Antes el paso
// solo comprobaba que existiera index.html, que estaba commiteado en git.
const fs = require('fs')

const archivo = process.argv[2] || 'qa/artifacts/test-results.json'
if (!fs.existsSync(archivo)) {
  console.error(`❌ No hay resultados E2E en ${archivo}`)
  process.exit(1)
}
const { stats } = JSON.parse(fs.readFileSync(archivo, 'utf8'))
if (!stats) {
  console.error('❌ El JSON de Playwright no tiene "stats"')
  process.exit(1)
}
console.log(
  `E2E: ${stats.expected} ok, ${stats.unexpected} fallidos, ${stats.flaky} flaky, ${stats.skipped} omitidos`
)
if (stats.unexpected > 0) {
  console.error('❌ Hay tests E2E fallidos')
  process.exit(1)
}
if (stats.expected === 0) {
  console.error('❌ No se ejecutó ningún test E2E')
  process.exit(1)
}
console.log('✅ E2E en verde')
