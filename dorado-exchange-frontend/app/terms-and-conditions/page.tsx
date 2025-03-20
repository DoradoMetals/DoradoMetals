import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";

export default function TermsAndConditions() {
  return (
    <div className="flex justify-center max-h-screen p-6">
      <Card className="max-w-3xl w-full p-6 bg-card shadow-md rounded-xl">
        <h1 className="text-3xl text-neutral-900 font-bold text-center">Terms and Conditions</h1>
        <p className="secondary-text text-center mb-6">Effective Date: 03/04/2025</p>

        <ScrollArea className="h-full overflow-y-auto px-4">
          <h2 className="title-text font-semibold mt-6">1. Eligibility & Ownership</h2>
          <ul className="list-disc ml-6 secondary-text">
            <li>Must be at least 18 years old.</li>
            <li>Full legal ownership of Products being sold.</li>
            <li>Information provided must be accurate and complete.</li>
            <li>Compliance with all applicable laws and regulations.</li>
            <li>We may request proof of ownership or identity verification.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">2. Buying Precious Metals from Us</h2>
          <h3 className="primary-text ml-6">2.1 Pricing & Orders</h3>
          <ul className="list-disc ml-12 secondary-text">
            <li>Prices are based on real-time market values and subject to change.</li>
            <li>Orders are final once placed—no cancellations or modifications.</li>
            <li>Full payment required within the specified timeframe.</li>
          </ul>

          <h3 className="primary-text ml-6 mt-2">2.2 Accepted Payment Methods</h3>
          <ul className="list-disc ml-12 secondary-text">
            <li>Bank Wire Transfer</li>
            <li>ACH Transfer</li>
            <li>Credit/Debit Card (fees may apply)</li>
            <li>Cryptocurrency (where applicable)</li>
          </ul>

          <h3 className="primary-text ml-6 mt-2">2.3 Shipping & Delivery</h3>
          <ul className="list-disc ml-12 secondary-text">
            <li>Shipped via insured carriers (FedEx, UPS, USPS).</li>
            <li>Inspect orders upon arrival; report issues within 24 hours.</li>
            <li>We are not responsible for shipping delays.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">3. Selling Precious Metals to Us</h2>
          <h3 className="primary-text ml-6">3.1 Offer & Valuation</h3>
          <ul className="list-disc ml-12 secondary-text">
            <li>Offers based on live market pricing and item condition.</li>
            <li>Offers are valid for 24 hours.</li>
          </ul>

          <h3 className="primary-text ml-6 mt-2">3.2 Shipping to Us</h3>
          <ul className="list-disc ml-12 secondary-text">
            <li>Use our prepaid shipping label for insured shipping.</li>
            <li>Drop off at a staffed carrier location.</li>
            <li>Secure packaging required.</li>
          </ul>

          <h3 className="primary-text ml-6 mt-2">3.3 Insurance Coverage</h3>
          <ul className="list-disc ml-12 secondary-text">
            <li>Shipments insured up to $5,000.</li>
            <li>Additional coverage available upon request.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">4. Payment for Sold Items</h2>
          <ul className="list-disc ml-6 secondary-text">
            <li>Payments processed within 1 business day.</li>
            <li>Payment methods: Bank Wire, ACH, Check, PayPal™.</li>
          </ul>

          <h2 className="title-text font-semibold mt-6">5. Indemnification</h2>
          <p className="secondary-text">
            You agree to indemnify and hold harmless DORADO METALS EXCHANGE LLC from any claims or liabilities arising from your breach of these terms.
          </p>

          <h2 className="title-text font-semibold mt-6">6. Force Majeure</h2>
          <p className="secondary-text">
            We are not liable for delays caused by natural disasters, war, terrorism, or other uncontrollable events.
          </p>

          <h2 className="title-text font-semibold mt-6">7. Arbitration & Waiver of Jury Trial</h2>
          <p className="secondary-text">
            Disputes will be resolved via binding arbitration in Texas. Both parties waive the right to a jury trial.
          </p>

          <h2 className="title-text font-semibold mt-6">8. Electronic Communications</h2>
          <p className="secondary-text">
            By using our services, you consent to receive electronic agreements and disclosures.
          </p>

          <h2 className="title-text font-semibold mt-6">9. Rescission Period</h2>
          <p className="secondary-text">
            You may rescind a transaction within 14 days by returning an uncashed payment.
          </p>

          <h2 className="title-text font-semibold mt-6">10. Unclaimed Items & Abandonment</h2>
          <p className="secondary-text">
            If an offer is unaccepted for 10 business days, payment is issued. Items returned twice and unclaimed for 90 days are considered abandoned.
          </p>

          <h2 className="title-text font-semibold mt-6">11. Price Match Guarantee</h2>
          <p className="secondary-text">
            We will match a competitor’s written offer within 14 days, excluding bullion and high-purity coins.
          </p>

          <h2 className="title-text font-semibold mt-6">12. Compliance with Laws</h2>
          <p className="secondary-text">
            We comply with AML regulations, the Patriot Act, and IRS 1099-B reporting requirements.
          </p>

          <h2 className="title-text font-semibold mt-6">13. Limitations on Liability</h2>
          <p className="secondary-text">
            Liability for lost or damaged shipments is capped at $5,000 unless additional insurance is purchased.
          </p>

          <h2 className="title-text font-semibold mt-6">14. Bonus & Promotional Limits</h2>
          <p className="secondary-text">
            Bonuses cannot exceed 90% of melt value. Promotions and bonuses cannot be combined.
          </p>

          <h2 className="title-text font-semibold mt-6">15. Modifications to Terms</h2>
          <p className="secondary-text">
            We reserve the right to update these terms. Continued use of our services constitutes acceptance of any modifications.
          </p>
        </ScrollArea>
      </Card>
    </div>
  );
}
