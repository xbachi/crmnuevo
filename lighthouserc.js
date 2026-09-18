// Lighthouse CI (job "Performance Baseline"). Sin este archivo `lhci autorun`
// intenta adivinar un directorio estático y falla. Arranca la app construida
// y audita la página de login, que no necesita sesión ni datos.
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start -- --port 3000',
      startServerReadyPattern: 'Ready',
      startServerReadyTimeout: 120000,
      url: ['http://localhost:3000/login'],
      numberOfRuns: 1,
      settings: { preset: 'desktop' },
    },
    assert: {
      // Línea base, no bloqueo: avisa si baja del umbral.
      assertions: {
        'categories:performance': ['warn', { minScore: 0.5 }],
        'categories:accessibility': ['warn', { minScore: 0.8 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
}
