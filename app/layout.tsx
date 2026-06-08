import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Order Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>

        {/* ── Top navigation bar ── */}
        <nav className="h-12 bg-white border-b border-gray-100 flex items-center px-6 gap-1 sticky top-0 z-50">

          {/* Logo */}
          <div className="w-7 h-7 rounded-md bg-[#1a56db] flex items-center justify-center text-white text-[11px] font-medium mr-4">
            OM
          </div>

          {/* Nav links */}
          <Link
            href="/orders"
            className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
          >
            Order List
          </Link>

          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
          >
            Live Dashboard
          </Link>
          
          <Link
            href="/worker"
            className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
          >
            Worker Terminal
          </Link>
        </nav>

        {/* ── Page content ── */}
        {children}

      </body>
    </html>
  )
}