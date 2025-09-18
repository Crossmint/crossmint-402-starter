export const metadata = {
  title: 'sendvia',
  description: 'Crossmint x A2A direct-transfer client',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji' }}>
        {children}
      </body>
    </html>
  );
}


