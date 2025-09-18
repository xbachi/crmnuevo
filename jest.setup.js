import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      prefetch: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock Next.js image
jest.mock('next/image', () => {
  return function MockImage({ src, alt, ...props }) {
    return <img src={src} alt={alt} {...props} />
  }
})

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_crm'
process.env.NODE_ENV = 'test'

// Mock fetch for API calls
global.fetch = jest.fn()

// Mock window.localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock

// Mock window.location (disabled for now to avoid conflicts)
// global.window = Object.create(window);
// Object.defineProperty(global.window, 'location', {
//   value: {
//     href: 'http://localhost:3000',
//     origin: 'http://localhost:3000',
//     pathname: '/',
//     search: '',
//     hash: '',
//     reload: jest.fn(),
//     assign: jest.fn(),
//   },
//   writable: true
// })

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Increase test timeout for integration tests
jest.setTimeout(30000)
