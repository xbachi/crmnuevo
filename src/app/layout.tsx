import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { ToastProvider } from "@/hooks/useToast";

export const metadata: Metadata = {
  title: "SevenCars CRM",
  description: "Sistema de gestión de vehículos - SevenCars CRM Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased bg-white" suppressHydrationWarning>
        <ToastProvider>
          <div className="flex min-h-screen">
            <Navigation />
            <main className="flex-1 min-w-0 lg:ml-0">
              <div className="h-full">
                {children}
              </div>
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
