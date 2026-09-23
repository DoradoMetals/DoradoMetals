import NextLink from 'next/link'
import { Link } from '@dorado/components'

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-xl px-md py-2xl lg:px-0">
      <div className="flex flex-col gap-xs">
        <h1>Privacy Policy</h1>
        <p className="micro">Last updated September 22, 2026</p>
      </div>

      <section className="flex flex-col gap-sm">
        <h2>Who we are</h2>
        <p>
          Dorado Metals Exchange LLC (&quot;Dorado Metals,&quot; &quot;we,&quot; &quot;us&quot;)
          operates doradometals.com, where customers buy and sell precious metals with us. This
          policy explains what information we collect, how we use it, and the choices you have.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Information we collect</h2>
        <p>
          When you create an account, request a quote, or place an order, we collect your name,
          email address, mobile phone number, mailing address, and the order and payment details
          needed to buy or sell metal with you - including bank or payout details when you are
          paid for a sale.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>How we use it</h2>
        <p>
          We use this information to price and fulfill your order, verify your identity, pay you
          for a sale, ship and insure a purchase, and communicate with you about your account and
          orders - by email and, if you give us your number, by text message. We also use it to
          respond when you contact us.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Text messages</h2>
        <p>
          If you give us your mobile number and agree to receive texts, we use it to send account
          and order updates, one-time sign-in codes, and replies to messages you send our business
          number. Message and data rates may apply, and message frequency varies.{' '}
          <strong>
            Mobile information will not be shared with third parties or affiliates for marketing
            or promotional purposes.
          </strong>{' '}
          Reply STOP to any message to opt out at any time, or HELP for help. Opting out of texts
          does not affect your account or your ability to sign in by email.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Who we share it with</h2>
        <p>
          We share information only as needed to complete your order: our payment processor,
          shipping carriers, our refining partners, and the text and email providers that deliver
          our messages. We do not sell your information, and we do not share it with third parties
          or affiliates for their own marketing.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Your choices</h2>
        <p>
          You can update your account details, ask us what we hold about you, or ask us to delete
          your account from your account settings or by emailing us. Deleting your account does
          not remove records we are required to keep for tax, accounting, or legal reasons.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Contact us</h2>
        <p>
          Questions about this policy can be sent to{' '}
          <Link href="mailto:exchange@doradometals.com">exchange@doradometals.com</Link>. Our
          terms are at{' '}
          <Link asChild>
            <NextLink href="/terms-and-conditions">doradometals.com/terms-and-conditions</NextLink>
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
