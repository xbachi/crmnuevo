import { InversorAuthProvider } from '@/contexts/InversorAuthContext'
import InversorNavigation from '@/components/InversorNavigation'

export default function InversoresLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <InversorAuthProvider>
      <div className="flex min-h-screen">
        <InversorNavigation />
        <main className="flex-1 min-w-0 lg:ml-0">
          <div className="h-full">{children}</div>
        </main>
      </div>
    </InversorAuthProvider>
  )
}
