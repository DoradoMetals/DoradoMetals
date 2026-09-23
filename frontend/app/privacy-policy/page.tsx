import { ScrollArea } from '@/shared/ui/base/scroll-area'
import { formatFullDate } from '@/shared/utils/formatDates'
import Link from 'next/link'

export default function PrivacyPolicy() {
  return (
    <div className="flex justify-center max-h-screen p-6">
      <div className="max-w-3xl w-full p-6 bg-card shadow-md rounded-xl">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl sm:text-3xl text-neutral-900">Privacy Policy</h1>
          <p className="text-sm text-neutral-700">
            <span className="font-medium font-semibold text-neutral-800">Effective Date:</span>
            {formatFullDate('2025-03-08')}
          </p>
          <p className="text-sm text-neutral-700">
            <span className="font-medium font-semibold text-neutral-800">Last Updated:</span>
            {formatFullDate('2025-04-10')}
          </p>
        </div>

        <div className="separator-inset" />
        <ScrollArea className="h-full overflow-y-auto px-4">
          <p className=" mb-4">
            Dorado Metals Exchange LLC respects your privacy and is committed to protecting it
            through this Privacy Policy. This policy explains how we collect, use, and disclose
            information about users of our website and other services.
          </p>

          <h2 className="text-lg text-neutral-800 font-semibold mt-6">1. Information We Collect</h2>
          <h3 className="text-base text-neutral-700 ml-6">1.1 Personal Information You Provide</h3>
          <ul className="list-disc ml-12 text-sm text-neutral-600">
            <li>Account Registration: email address and password.</li>
            <li>Identity Verification: Additional information may be required for compliance.</li>
            <li>Payment Information: Payment-related details (processed by third parties).</li>
          </ul>
          <h3 className="text-base text-neutral-700 ml-6 mt-2">
            1.2 Information Collected Automatically
          </h3>
          <ul className="list-disc ml-12 text-sm text-neutral-600">
            <li>Device & Log Data: IP address, browser type, timestamps.</li>
            <li>Usage Data: Pages visited, actions taken, platform interactions.</li>
            <li>Cookies & Tracking Technologies: Used for authentication and analytics.</li>
          </ul>

          <h2 className="text-lg text-neutral-800 font-semibold mt-6">
            2. How We Use Your Information
          </h2>
          <ul className="list-disc ml-6 text-sm text-neutral-600 mt-2">
            <li>Provide and manage user accounts.</li>
            <li>Authenticate logins (including via Google OAuth).</li>
            <li>Improve platform functionality and user experience.</li>
            <li>Comply with legal and regulatory obligations.</li>
            <li>Prevent fraud and ensure security.</li>
          </ul>

          <h2 className="text-lg text-neutral-800 font-semibold mt-6">
            3. How We Share Your Information
          </h2>
          <ul className="list-disc ml-6 text-sm text-neutral-600">
            <li>
              <strong>With Service Providers:</strong> Payment processors, authentication providers,
              hosting services.
            </li>
            <li>
              <strong>Legal Compliance:</strong> Data may be disclosed if required by law.
            </li>
            <li>
              <strong>Business Transfers:</strong> User data may transfer in case of acquisition or
              merger.
            </li>
            <li className="text-primary">We never sell your data to third parties.</li>
          </ul>

          <h2 className="text-lg text-neutral-800 font-semibold mt-6">
            4. Cookies & Tracking Technologies
          </h2>
          <ul className="list-disc ml-6 text-sm text-neutral-600">
            <li>
              <strong>Essential Cookies:</strong> Required for authentication and security.
            </li>
            <li>
              <strong>Analytics Cookies:</strong> Used to analyze website traffic (e.g., via Google
              Analytics).
            </li>
            <li>
              You can disable cookies in your browser settings, but some features may not work
              properly.
            </li>
          </ul>

          <h2 className="text-lg text-neutral-800 font-semibold mt-6">5. Data Security</h2>
          <ul className="list-disc ml-6 text-sm text-neutral-600">
            <li>Encryption of sensitive information.</li>
            <li>Secure authentication methods.</li>
            <li>Regular security audits.</li>
          </ul>

          <h2 className="text-lg text-neutral-800 font-semibold mt-6">6. Your Rights & Choices</h2>
          <ul className="list-disc ml-6 text-sm text-neutral-600">
            <li>Access & Update: Update your account information anytime.</li>
            <li>Delete Account: Request account deletion (data removed as required by law).</li>
          </ul>
          <p className="text-sm text-neutral-600">
            To exercise these rights, contact us at{' '}
            <Link className="text-secondary text-sm" href="mailto:support@doradometals.com">
              support@doradometals.com
            </Link>
            .
          </p>

          <h2 className="text-lg text-neutral-800 font-semibold mt-6">7. Third-Party Services</h2>
          <p className="text-sm text-neutral-600">
            We integrate third-party services such as Google OAuth for authentication.
          </p>
          <p className="text-sm text-neutral-600">
            When signing in with Google, you agree to{' '}
            <Link href="https://policies.google.com/privacy" className="text-secondary text-sm">
              Google’s Privacy Policy
            </Link>
            .
          </p>

          <h2 className="text-lg text-neutral-800 font-semibold mt-6">
            8. Text Messaging (SMS)
          </h2>
          <p className="text-sm text-neutral-600">
            If you opt in to receive text messages from us, we collect your mobile phone number,
            the date you gave consent, and the content of the messages exchanged with you. We use
            this information to:
          </p>
          <ul className="list-disc ml-6 text-sm text-neutral-600 mt-2">
            <li>Send one-time sign-in codes.</li>
            <li>Send updates about your orders and account.</li>
            <li>Reply to questions you send us by text.</li>
          </ul>
          <p className="text-sm text-neutral-600 mt-2">
            We do not sell or share your SMS opt-in data or personal information with third
            parties or affiliates for marketing or promotional purposes.
          </p>
          <p className="text-sm text-neutral-600 mt-2">
            You can opt out of text messages at any time by replying STOP, or get help by replying
            HELP. Message frequency varies. Message and data rates may apply.
          </p>
        </ScrollArea>
      </div>
    </div>
  )
}
