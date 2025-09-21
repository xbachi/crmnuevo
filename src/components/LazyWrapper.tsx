import { Suspense, lazy, ComponentType } from 'react'
import { LoadingSkeleton } from './LoadingSkeleton'

interface LazyWrapperProps {
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * Wrapper para lazy loading con fallback personalizable
 */
export function LazyWrapper({ fallback = <LoadingSkeleton />, children }: LazyWrapperProps) {
  return (
    <Suspense fallback={fallback}>
      {children}
    </Suspense>
  )
}

/**
 * HOC para hacer lazy loading de componentes
 */
export function withLazyLoading<T extends object>(
  importFunc: () => Promise<{ default: ComponentType<T> }>,
  fallback?: React.ReactNode
) {
  const LazyComponent = lazy(importFunc)
  
  return function LazyLoadedComponent(props: T) {
    return (
      <Suspense fallback={fallback || <LoadingSkeleton />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
}

/**
 * Componentes lazy específicos para el CRM
 */
export const LazyCharts = withLazyLoading(
  () => import('./InteractiveMetricsChart'),
  <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
)

export const LazyKanban = withLazyLoading(
  () => import('./KanbanBoard'),
  <LoadingSkeleton />
)

export const LazyDataExporter = withLazyLoading(
  () => import('./DataExporter'),
  <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
)

export const LazyNotificationCenter = withLazyLoading(
  () => import('./NotificationCenter'),
  <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
)
