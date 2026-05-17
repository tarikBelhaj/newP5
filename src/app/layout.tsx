import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'Motion Avatar Templates — Turn photos into AI motion videos',
  description: 'Choose a motion template, upload a face, write a script. Get a motion-controlled AI video in seconds.',
  openGraph: {
    title: 'Motion Avatar Templates',
    description: 'source image + reference video = motion-controlled generated video',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="font-body bg-ink-950 text-white antialiased">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1A1A2E',
              color: '#fff',
              border: '1px solid rgba(200,255,0,0.2)',
            },
            success: { iconTheme: { primary: '#C8FF00', secondary: '#0F0F1A' } },
            error: { iconTheme: { primary: '#FF3DFF', secondary: '#0F0F1A' } },
          }}
        />
      </body>
    </html>
  )
}
