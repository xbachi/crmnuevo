const fs = require('fs')
const path = require('path')

async function verifyLogoInPDF() {
  console.log('🔍 Verificando logo en PDF generado...\n')

  try {
    // Buscar el PDF más reciente
    const documentsDir = path.join(process.cwd(), 'public', 'documents')
    const dealDirs = fs
      .readdirSync(documentsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort((a, b) => {
        const aNum = parseInt(a.replace('deal-', ''))
        const bNum = parseInt(b.replace('deal-', ''))
        return bNum - aNum // Orden descendente (más reciente primero)
      })

    if (dealDirs.length === 0) {
      console.log('❌ No se encontraron documentos generados')
      return
    }

    const latestDealDir = dealDirs[0]
    const dealPath = path.join(documentsDir, latestDealDir)
    const files = fs.readdirSync(dealPath)

    console.log(`📁 Directorio más reciente: ${latestDealDir}`)
    console.log(`📄 Archivos encontrados: ${files.join(', ')}`)

    // Buscar contrato de reserva
    const reservaFile = files.find((file) => file.includes('contrato-reserva'))
    if (!reservaFile) {
      console.log('❌ No se encontró contrato de reserva')
      return
    }

    const pdfPath = path.join(dealPath, reservaFile)
    const stats = fs.statSync(pdfPath)
    const fileSizeKB = Math.round(stats.size / 1024)

    console.log(`✅ Archivo encontrado: ${reservaFile}`)
    console.log(`📊 Tamaño: ${fileSizeKB} KB`)
    console.log(`📅 Modificado: ${stats.mtime.toLocaleString()}`)

    // Leer el archivo PDF y buscar indicadores de que contiene el logo
    const pdfBuffer = fs.readFileSync(pdfPath)
    const pdfContent = pdfBuffer.toString('binary')

    // Buscar indicadores de que el PDF contiene imágenes
    const hasImages =
      pdfContent.includes('/Image') || pdfContent.includes('/XObject')
    const hasSevenCars =
      pdfContent.includes('SEVEN CARS') || pdfContent.includes('Seven Cars')

    console.log(`\n🔍 Análisis del PDF:`)
    console.log(`  - Contiene imágenes: ${hasImages ? '✅ Sí' : '❌ No'}`)
    console.log(
      `  - Contiene texto "SEVEN CARS": ${hasSevenCars ? '✅ Sí' : '❌ No'}`
    )

    if (hasImages) {
      console.log(
        `\n🎉 ¡El PDF contiene imágenes! Esto indica que el logo se generó correctamente.`
      )
    } else if (hasSevenCars) {
      console.log(
        `\n⚠️  El PDF contiene texto "SEVEN CARS" pero no imágenes. El logo podría no haberse cargado.`
      )
    } else {
      console.log(`\n❌ El PDF no contiene ni imágenes ni texto "SEVEN CARS".`)
    }

    // Verificar si el archivo es válido
    const isValidPDF = pdfContent.startsWith('%PDF-')
    console.log(`  - Es un PDF válido: ${isValidPDF ? '✅ Sí' : '❌ No'}`)
  } catch (error) {
    console.error('❌ Error verificando PDF:', error.message)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  verifyLogoInPDF()
    .then(() => {
      console.log('\n✅ Verificación completada')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error en la verificación:', error)
      process.exit(1)
    })
}

module.exports = { verifyLogoInPDF }
