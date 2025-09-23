import { InversorAuthProvider } from '@/contexts/InversorAuthContext'
import InversorAuthGuard from '@/components/InversorAuthGuard'
import InversorLayoutWrapper from '@/components/InversorLayoutWrapper'

export default function InversoresLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <InversorAuthProvider>
      <InversorAuthGuard>
        <InversorLayoutWrapper>{children}</InversorLayoutWrapper>
      </InversorAuthGuard>
    </InversorAuthProvider>
  )
}
