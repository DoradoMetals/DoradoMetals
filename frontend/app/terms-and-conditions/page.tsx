import NextLink from 'next/link'
import { Link } from '@dorado/components'

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-xl px-md py-2xl lg:px-0">
      <div className="flex flex-col gap-xs">
        <h1>Terms and Conditions</h1>
        <p className="micro">Last updated September 22, 2026</p>
      </div>

      <section className="flex flex-col gap-sm">
        <h2>Agreement</h2>
        <p>
          These terms govern your use of doradometals.com and the services of Dorado Metals
          Exchange LLC (&quot;Dorado Metals,&quot; &quot;we,&quot; &quot;us&quot;), through which
          customers buy and sell precious metals with us. Creating an account or placing an order
          means you agree to these terms and to our{' '}
          <Link asChild>
            <NextLink href="/privacy-policy">Privacy Policy</NextLink>
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Accounts and sign-in</h2>
        <p>
          Signing in does not use a password. We send a one-time code to your email or phone
          number to verify it is you, for every sign-in and for account changes. Keep access to
          your email and phone secure - anyone who can receive your code can sign in as you.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Orders and pricing</h2>
        <p>
          A price we quote you is locked to the market spot at the moment you place the order,
          plus our premium for that metal and order type. Selling to us pays out after we receive
          and assay your shipment; buying from us ships once payment is confirmed. Either of us
          may decline an order we have not yet fulfilled.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Text messages</h2>
        <p>
          If you give us your mobile number and agree to receive texts, we may send you one-time
          sign-in codes, order and account updates, and replies to messages you send our business
          number. Message and data rates may apply, and message frequency varies. Reply STOP to
          any message to cancel at any time, or HELP for help - see our{' '}
          <Link asChild>
            <NextLink href="/privacy-policy">Privacy Policy</NextLink>
          </Link>{' '}
          for how we handle mobile information.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Our liability</h2>
        <p>
          We insure shipments while they are in transit to and from us and take reasonable care in
          pricing, assay, and payout. Beyond returning or making good on a covered loss, we are
          not liable for indirect or consequential damages arising from your use of the service.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Changes to these terms</h2>
        <p>
          We may update these terms as the service changes. We will post the new terms here with
          an updated date; continuing to use the service after that means you accept them.
        </p>
      </section>

      <section className="flex flex-col gap-sm">
        <h2>Contact us</h2>
        <p>
          Questions about these terms can be sent to{' '}
          <Link href="mailto:exchange@doradometals.com">exchange@doradometals.com</Link>.
        </p>
      </section>
    </div>
  )
}
