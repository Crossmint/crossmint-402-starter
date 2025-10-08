import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'sendvia - x402 Tweet Agent',
  description: 'Post tweets with Crossmint wallets using the x402 payment protocol',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
