const fs = require('fs')
const path = require('path')

function checkCoverage() {
  console.log('Checking code coverage thresholds...')
  
  const coveragePath = path.join('qa', 'artifacts', 'unit-test-results', 'coverage', 'coverage-summary.json')
  
  if (!fs.existsSync(coveragePath)) {
    console.log('⚠️ Coverage file not found, skipping threshold check')
    return
  }
  
  try {
    const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'))
    const total = coverageData.total
    
    const thresholds = {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    }
    
    let allPassed = true
    const results = []
    
    for (const [metric, threshold] of Object.entries(thresholds)) {
      const actual = total[metric].pct
      const passed = actual >= threshold
      
      if (!passed) allPassed = false
      
      results.push({
        metric,
        actual,
        threshold,
        passed,
        status: passed ? '✅' : '❌'
      })
      
      console.log(`${passed ? '✅' : '❌'} ${metric}: ${actual}% (threshold: ${threshold}%)`)
    }
    
    console.log('\n📊 Coverage Summary:')
    console.table(results)
    
    if (allPassed) {
      console.log('\n🎉 All coverage thresholds met!')
      process.exit(0)
    } else {
      console.log('\n❌ Some coverage thresholds not met')
      console.log('Consider adding more unit tests to improve coverage')
      
      // In CI, we might want to fail the build
      // For now, we'll just warn
      if (process.env.CI === 'true') {
        console.log('Running in CI - failing build due to coverage')
        process.exit(1)
      } else {
        console.log('Running locally - continuing despite coverage issues')
        process.exit(0)
      }
    }
    
  } catch (error) {
    console.error('❌ Error reading coverage data:', error)
    process.exit(1)
  }
}

// Baseline coverage tracking
function trackCoverageBaseline() {
  const coveragePath = path.join('coverage', 'coverage-summary.json')
  const baselinePath = path.join('qa', 'coverage-baseline.json')
  
  if (!fs.existsSync(coveragePath)) {
    console.log('No coverage data found for baseline tracking')
    return
  }
  
  try {
    const currentCoverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'))
    const baseline = {
      timestamp: new Date().toISOString(),
      coverage: currentCoverage.total,
      commit: process.env.GITHUB_SHA || 'local'
    }
    
    // Read existing baseline if it exists
    let existingBaselines = []
    if (fs.existsSync(baselinePath)) {
      existingBaselines = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    }
    
    // Add new baseline
    existingBaselines.push(baseline)
    
    // Keep only last 10 baselines
    if (existingBaselines.length > 10) {
      existingBaselines = existingBaselines.slice(-10)
    }
    
    fs.writeFileSync(baselinePath, JSON.stringify(existingBaselines, null, 2))
    console.log('📈 Coverage baseline updated')
    
  } catch (error) {
    console.error('Error tracking coverage baseline:', error)
  }
}

// Run if called directly
if (require.main === module) {
  checkCoverage()
  trackCoverageBaseline()
}

module.exports = { checkCoverage, trackCoverageBaseline }
