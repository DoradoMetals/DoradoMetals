import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="flex justify-center max-h-screen p-6">
      <Card className="max-w-3xl w-full p-6 bg-card shadow-md rounded-xl">
        <h1 className="text-3xl text-neutral-900 font-bold text-center">Privacy Policy</h1>
        <p className="secondary-text text-center mb-6">Effective Date: 03/08/2025</p>
        
        <ScrollArea className="h-full overflow-y-auto px-4">
          <p className="secondary-text mb-4">
            Dorado Metals Exchange LLC respects your privacy and is committed to protecting it through this Privacy Policy. This policy explains how we collect, use, and disclose information about users of our website and other services.
          </p>

          <h2 className="title-text font-semibold mt-6">1. Information We Collect</h2>
          <h3 className="primary-text ml-6">1.1 Personal Information You Provide</h3>
          <ul className="list-disc ml-12 secondary-text">
            <li>Account Registration: email address and password.</li>
            <li>Identity Verification: Additional information may be required for compliance.</li>
            <li>Payment Information: Payment-related details (processed by third parties).</li>
          </ul>
          <h3 className="primary-text ml-6 mt-2">1.2 Information Collected Automatically</h3>
          <ul className="list-disc ml-12 secondary-text">
            <li>Device & Log Data: IP address, browser type, timestamps.</li>
            <li>Usage Data: Pages visited, actions taken, platform interactions.</li>
            <li>Cookies & Tracking Technologies: Used for authentication and analytics.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">2. How We Use Your Information</h2>
          <ul className="list-disc ml-6 secondary-text mt-2">
            <li>Provide and manage user accounts.</li>
            <li>Authenticate logins (including via Google OAuth).</li>
            <li>Improve platform functionality and user experience.</li>
            <li>Comply with legal and regulatory obligations.</li>
            <li>Prevent fraud and ensure security.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">3. How We Share Your Information</h2>
          <ul className="list-disc ml-6 secondary-text">
            <li><strong>With Service Providers:</strong> Payment processors, authentication providers, hosting services.</li>
            <li><strong>Legal Compliance:</strong> Data may be disclosed if required by law.</li>
            <li><strong>Business Transfers:</strong> User data may transfer in case of acquisition or merger.</li>
            <li className="text-primary">We never sell your data to third parties.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">4. Cookies & Tracking Technologies</h2>
          <ul className="list-disc ml-6 secondary-text">
            <li><strong>Essential Cookies:</strong> Required for authentication and security.</li>
            <li><strong>Analytics Cookies:</strong> Used to analyze website traffic (e.g., via Google Analytics).</li>
            <li>You can disable cookies in your browser settings, but some features may not work properly.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">5. Data Security</h2>
          <ul className="list-disc ml-6 secondary-text">
            <li>Encryption of sensitive information.</li>
            <li>Secure authentication methods.</li>
            <li>Regular security audits.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">6. Your Rights & Choices</h2>
          <ul className="list-disc ml-6 secondary-text">
            <li>Access & Update: Update your account information anytime.</li>
            <li>Delete Account: Request account deletion (data removed as required by law).</li>
          </ul>
          <p className="secondary-text">To exercise these rights, contact us at <Link className="text-secondary text-sm" href="mailto:support@dorado-metals.com">support@doradometals.com</Link>.</p>

          <h2 className="title-text font-semibold mt-6">7. Third-Party Services</h2>
          <p className="secondary-text">We integrate third-party services such as Google OAuth for authentication.</p>
          <p className="secondary-text">When signing in with Google, you agree to <Link href="https://policies.google.com/privacy" className="text-secondary text-sm">Google’s Privacy Policy</Link>.</p>
        </ScrollArea>
      </Card>
    </div>
  );
}

