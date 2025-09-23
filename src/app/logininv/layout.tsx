import { InversorAuthProvider } from '@/contexts/InversorAuthContext'

export default function LoginInvLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <InversorAuthProvider>{children}</InversorAuthProvider>
}
