import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import './globals.css';
import RecaptchaProvider from '@/app/components/RecaptchaProvider';
import ScoreDisplayScript from '@/app/components/ScoreDisplayScript';
import AIDetectorProvider from '@/app/components/AIDetectorProvider';
import { AuthProvider } from '@/app/lib/auth-provider';
import NavigationHeader from '@/app/components/NavigationHeader';
import { BehaviorTrackerProvider } from '@/app/components/BehaviorTrackerProvider';
import { getRecaptchaSiteKeyFromServer } from '@/app/lib/server/google-cloud';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '会員制ECサイト',
  description: 'AIエージェント攻撃検出・防御システム トライアル用',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const recaptchaSiteKey = getRecaptchaSiteKeyFromServer();

  return (
    <html lang="ja" className={`${inter.variable} ${montserrat.variable}`}>
      <body className="font-sans bg-pink-50">
        <RecaptchaProvider siteKey={recaptchaSiteKey}>
          <ScoreDisplayScript siteKey={recaptchaSiteKey} />
          <BehaviorTrackerProvider>
            <AIDetectorProvider>
              <AuthProvider>
                <div className="min-h-screen flex flex-col">
                  <NavigationHeader />

                  <main className="flex-grow container mx-auto px-4 py-8 pt-40">
                    {children}
                  </main>

                  <footer className="bg-gradient-to-b from-pink-900 to-pink-950 text-white py-8 border-t border-pink-800">
                    <div className="container mx-auto px-4 text-center text-sm text-gray-300">
                      © {new Date().getFullYear()} Another Star合同会社
                    </div>
                  </footer>
                </div>
              </AuthProvider>
            </AIDetectorProvider>
          </BehaviorTrackerProvider>
        </RecaptchaProvider>
      </body>
    </html>
  );
}
