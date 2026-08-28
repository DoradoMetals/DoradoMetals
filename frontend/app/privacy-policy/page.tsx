import { ScrollArea } from '@/shared/ui/base/scroll-area'
import { formatFullDate } from '@/shared/utils/formatDates'
import Link from 'next/link'

export default function PrivacyPolicy() {
  return (
    <div className="flex justify-center max-h-screen p-6">
      <main className="flex flex-col max-w-3xl w-full p-6 gap-3">
        <section className="flex flex-col gap-3">
          <h1>Privacy Policy</h1>
          <p>
            <strong>Effective Date:</strong>
            {formatFullDate('2025-03-08')}
          </p>
          <p>
            <strong>Last Updated:</strong>
            {formatFullDate('2025-04-10')}
          </p>
        </section>

        <hr />

        <ScrollArea className="h-full overflow-y-auto px-4">
          <p className="mb-4">
            Dorado Metals Exchange LLC respects your privacy and is committed to protecting it
            through this Privacy Policy. This policy explains how we collect, use, and disclose
            information about users of our website and other services.
          </p>

          <section>
            <h2 className="mt-6">1. Information We Collect</h2>
            <h3 className="ml-6">1.1 Personal Information You Provide</h3>
            <ul className="ml-6">
              <li>Account Registration: email address and password.</li>
              <li>Identity Verification: Additional information may be required for compliance.</li>
              <li>Payment Information: Payment-related details (processed by third parties).</li>
            </ul>
            <h3 className="ml-6 mt-2">1.2 Information Collected Automatically</h3>
            <ul className="ml-6">
              <li>Device & Log Data: IP address, browser type, timestamps.</li>
              <li>Usage Data: Pages visited, actions taken, platform interactions.</li>
              <li>Cookies & Tracking Technologies: Used for authentication and analytics.</li>
            </ul>
          </section>

          <section>
            <h2 className="mt-6">2. How We Use Your Information</h2>
            <ul className="mt-2">
              <li>Provide and manage user accounts.</li>
              <li>Authenticate logins (including via Google OAuth).</li>
              <li>Improve platform functionality and user experience.</li>
              <li>Comply with legal and regulatory obligations.</li>
              <li>Prevent fraud and ensure security.</li>
            </ul>
          </section>

          <section>
            <h2 className="mt-6">3. How We Share Your Information</h2>
            <ul>
              <li>
                <strong>With Service Providers:</strong> Payment processors, authentication
                providers, hosting services.
              </li>
              <li>
                <strong>Legal Compliance:</strong> Data may be disclosed if required by law.
              </li>
              <li>
                <strong>Business Transfers:</strong> User data may transfer in case of acquisition
                or merger.
              </li>
              <li>
                <strong>We never sell your data to third parties.</strong>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mt-6">4. Cookies & Tracking Technologies</h2>
            <ul>
              <li>
                <strong>Essential Cookies:</strong> Required for authentication and security.
              </li>
              <li>
                <strong>Analytics Cookies:</strong> Used to analyze website traffic (e.g., via
                Google Analytics).
              </li>
              <li>
                You can disable cookies in your browser settings, but some features may not work
                properly.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mt-6">5. Data Security</h2>
            <ul>
              <li>Encryption of sensitive information.</li>
              <li>Secure authentication methods.</li>
              <li>Regular security audits.</li>
            </ul>
          </section>

          <section>
            <h2 className="mt-6">6. Your Rights & Choices</h2>
            <ul>
              <li>Access & Update: Update your account information anytime.</li>
              <li>Delete Account: Request account deletion (data removed as required by law).</li>
            </ul>
            <p>
              To exercise these rights, contact us at{' '}
              <Link href="mailto:support@doradometals.com">support@doradometals.com</Link>.
            </p>
          </section>

          <section>
            <h2 className="mt-6">7. Third-Party Services</h2>
            <p>We integrate third-party services such as Google OAuth for authentication.</p>
            <p>
              When signing in with Google, you agree to{' '}
              <Link href="https://policies.google.com/privacy">Google’s Privacy Policy</Link>.
            </p>
          </section>
        </ScrollArea>
      </main>
    </div>
  )
}
