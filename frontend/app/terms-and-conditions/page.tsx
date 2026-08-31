import { ScrollArea } from '@dorado/components'
import { formatFullDate } from '@/shared/utils/formatDates'
import Link from 'next/link'

export default function TermsAndConditions() {
  return (
    <div className="flex items-center justify-center w-full p-4">
      <main className="flex flex-col justify-center p-6 w-full max-w-4xl gap-6">
        <section>
          <h1>Terms and Conditions</h1>
          <p>
            <strong>Effective Date:</strong>
            {formatFullDate('2025-03-04')}
          </p>
          <p>
            <strong>Last Updated:</strong>
            {formatFullDate('2025-05-27')}
          </p>
        </section>

        <hr />

        <ScrollArea className="h-full overflow-y-auto px-4">
          <section>
            <p>
              By accessing doradometals.com or otherwise engaging in a "Transaction" with us as that
              term is defined below you agree to be bound by these terms and conditions including
              the Privacy Policy. Your agreement to be bound by these Terms and Conditions shall
              inure to the benefit of Dorado Metals Exchange LLC ("Company"), Its successors and
              assigns, AND SUPERSEDES AND REPLACES ANY INCONSISTENT STATEMENT(s) IN ANY OF OUR
              MATERIALS, ADVERTISEMENTS OR WEBSITES.
            </p>
            <p>
              The terms “Customer,” “You,” or “Your” refer to the person or entity who engages in
              buying or selling of item(s) containing precious metals (gold, platinum, silver, or
              any combination thereof), jewelry, gemstones, bullion, industrial metals, dental or
              other personal ornaments, or any combination thereof (collectively hereinafter
              referred to as "Products") to Company for sale and purchase "We", "our", and "us"
              refers to Company (through any of its divisions or affiliates) and its employees,
              agents, members, owners, directors, officers, successors, and assigns.
            </p>
            <p>
              By using our services, website, or engaging in transactions with us, you agree to
              these Terms and Conditions.
            </p>
          </section>

          <hr />

          <section>
            <h2>Description of Services</h2>
            <p>
              Dorado Metals Exchange LLC buys and sells precious metals including gold, silver,
              platinum, bullion, and scrap jewelry to the public.
            </p>
          </section>

          <hr />

          <section>
            <h2>Currency and Country of Operation</h2>
            <p>
              All prices are listed in U.S. Dollars (USD), and transactions are processed in the
              United States.
            </p>
          </section>

          <hr />

          <section>
            <h2>Eligibility &amp; Ownership</h2>
            <p>To buy or sell Products with us, you must:</p>
            <ul>
              <li>Be at least 18 years old.</li>
              <li>
                Have full legal ownership of any Products you sell, free of liens or third-party
                claims.
              </li>
              <li>
                Ensure all information provided is accurate and complete.
              </li>
              <li>
                Agree that any sale or purchase complies with all applicable laws and regulations.
              </li>
            </ul>
            <p>
              We reserve the right to request proof of ownership or identity verification for
              compliance with anti-money laundering (AML) laws.
            </p>
            <p>
              You will provide any documentation and/or information reasonably requested by us in
              connection with or related to you, the Products or the Transaction.
            </p>
          </section>

          <hr />

          <section>
            <h2>Buying Precious Metals from Us</h2>

            <section>
              <h3>Pricing &amp; Orders</h3>
              <ul>
                <li>
                  Our pricing is based on real-time market values and is subject to change without
                  notice.
                </li>
                <li>
                  Once an order is placed, it is locked in and final—no cancellations or
                  modifications.
                </li>
                <li>
                  All orders require full payment within the specified timeframe.
                </li>
              </ul>
            </section>

            <section>
              <h3>Accepted Payment Methods</h3>
              <ul>
                <li>Bank Wire Transfer</li>
                <li>ACH Transfer</li>
                <li>Bullion Credit </li>
                <li>
                  Credit/Debit Card (additional processing fees may apply){' '}
                </li>
              </ul>
              <p>
                Payments made by credit/debit card are processed securely via Stripe, Inc. Stripe
                may appear as the billing entity on your card statement
              </p>
            </section>

            <section>
              <h3>Shipping &amp; Delivery</h3>
              <p>
                We ship orders via insured carriers (FedEx, UPS, or USPS). You must inspect your
                order upon arrival and notify us of any issues within 24 hours. We are not
                responsible for delays due to shipping carriers or force majeure events.
              </p>
            </section>

            <section>
              <h3>Returns &amp; Cancellations</h3>
              <p>
                All sales are final due to market fluctuations. Returns are only accepted for
                incorrect or defective items. If you refuse a delivery, you will be responsible for
                restocking fees and market loss liability.
              </p>
            </section>

            <section>
              <h3>Refund Policy</h3>
              <p>
                All sales are final. No refunds or exchanges are allowed unless the item received is
                defective or incorrect
              </p>
            </section>
          </section>

          <hr />

          <section>
            <h2>Selling Precious Metals to Us</h2>

            <section>
              <h3>Guarantee Against Loss</h3>
              <p>
                If you ship Products to us and comply with the Required Shipping Procedures, the
                Company guarantees your Products up to $5,000 against loss.
              </p>
            </section>

            <section>
              <h3>Additional Insurance</h3>
              <p>
                You may request additional insurance for your Products up to $50,000. If you believe
                your gold jewelry or other Products are worth more than $5,000.00, you must call us
                at{' '}
                <Link href="tel:8172034786">
                  (817) 203-4786
                </Link>
                , receive written approval for the additional insurance and follow all instructions
                and procedures provided by Company prior to your shipment of the Products.
              </p>
            </section>

            <section>
              <h3>Required Shipping Procedures</h3>
              <p>
                When shipping your Products to Company you must comply with the following required
                shipping procedures (“Required Shipping Procedures”). Failure to do so will negate
                any claim for loss you may make in connection with our Guarantee Against Loss or
                Additional Insurance sections as set forth herein. The shipping procedures as set
                forth below are:
              </p>
              <ul>
                <li>
                  Ship Products using a Company generated pre-paid shipping label.
                </li>
                <li>
                  Take pictures of your Products for your records prior to packaging them.
                </li>
                <li>
                  Products must be securely packaged to ensure the safety of the Products either
                  using the supplied materials or your own packaging.
                </li>
                <li>
                  Ship your Products by dropping it at a staffed FedEx location or by using a FedEx
                  Driver. This is to ensure packaging for your Products can be inspected prior to
                  shipment. Company is not responsible for Products shipped using drop boxes or any
                  other method. The label must be scanned by FedEx.
                </li>
                <li>
                  Obtain a printed receipt with a tracking number(s) and keep the receipt in a safe
                  place until your transaction with us has been completed.
                </li>
                <li>
                  The packaging should not allow the Products to be displayed or seen, do not
                  disclose the Products shipped to any FedEx employee or any other person.
                </li>
                <li>
                  Ensure the Packing List provided with your label accurately states your Products
                  and their value and include it with your shipment.
                </li>
                <li>
                  For contents you believe are valued at over $5,000 you must double box the
                  shipment. For example, place your contents in a small FedEx box and then place
                  that box in a Medium FedEx box.
                </li>
                <li>
                  If you arrange your own shipping, you shall assume any and all risk of loss and
                  Company will have no liability whatsoever for your Products. In addition, you
                  shall be solely responsible for shipping costs and any associated insurance.
                </li>
              </ul>
              <p>
                Please contact customer support at{' '}
                <Link href="tel:8172034786">
                  (817) 203-4786
                </Link>{' '}
                if you have any questions concerning the Required Shipping Procedures prior to
                shipping your Products to Company.
              </p>
            </section>

            <section>
              <h3>Valuation</h3>
              <p>
                We determine the value of Products based on: Live market pricing for gold, silver,
                platinum, and palladium. Purity, weight, and condition of items. Authenticity
                verification of coins, bars, and bullion.
              </p>
            </section>

            <section>
              <h3>Pricing &amp; Payment</h3>
              <p>
                After your Products are received and verified, we will price them and notify you by
                (A) an email or text message with a link to your account, and/or (B) telephone. In
                general, your Products will be priced within one business day of their receipt, and
                payment is issued once pricing is finalized.
              </p>
            </section>

            <section>
              <h3>Return Policy</h3>
              <p>
                If your Products are to be returned, we will return your items at our shipping
                &amp; insurance cost. Return shipments will be insured for the appraised value + 20%
                (not exceeding melt value). If your item is valued higher, you must request and pay
                for additional insurance before shipping. We are not responsible for loss or damage
                beyond the insured amount once the package is with the carrier. Returned Products
                are sent to you via FedEx, UPS, USPS or other delivery service
                ("Carrier") of our choosing. We will require a signature upon delivery. If you
                choose to receive your Products without signature, we will not be responsible for
                loss or damage to your Products. Upon delivery of returned Products by the Carrier
                as indicated by the Carrier records, the Company assumes no further liability as to
                the loss of the Products. You must notify us immediately of any change of address.
                We will not be responsible for the loss of your Products if the Carrier is unable to
                deliver to the address on file. If the carrier fails to deliver your Products and
                returns it to us, we will attempt to send the Products a second time. If Products
                are returned to us a second time, we will consider it abandoned and discard it
                unless you claim it within 30 days from the date we first attempted to mail your
                Products back to you.
              </p>
            </section>

            <section>
              <h3>Payment for Sold Items</h3>
              <p>
                Once your items are received and verified, we process payments within 1 business day
                via: Bank Wire Transfer, ACH Transfer, Deluxe eCheck, Dorado Credit - can only be
                used in exchange for bullion products, no cash withdrawals. If you did not select a
                Payment method or if you provide us with incorrect or incomplete Payment
                information, we will issue the Payment by Deluxe eCheck. Before we issue Payment for
                your Products, we may verify the personal and payment information submitted through
                a national provider of personal identification verification services. If we are not
                able to verify your information, we may ask you for additional information or
                documentation, which may delay Payment. Please note that you are responsible for any
                third-party transaction fees relating to any Payments made by us to you or if you
                elect to send money back to us. This includes, but is not limited to, fees
                associated with ACH payments, Wire transfers and other similar payment methods. It
                is your responsibility to determine and accept any such third-party fees prior to
                requesting your method of Payment. Additional Requirements may apply depending on
                Payment method.
              </p>
            </section>
          </section>

          <hr />

          <section>
            <h2>Limitations on Liability</h2>
            <p>
              BY AGREEING TO THESE TERMS AND CONDITIONS AND/OR ENGAGING IN A TRANSACTION WITH US,
              YOU AGREE AND UNDERSTAND THAT THE LEGAL LIMIT OF OUR LIABILITY TO YOU FOR ANY CLAIM,
              LAWSUIT, ACTION, DISPUTE, CONTROVERSY OR OTHER MATTER YOU MAY ASSERT AGAINST US FOR
              LOST, DAMAGED, OR DESTROYED PRODUCTS SHALL NOT EXCEED $5,000 AS SET FORTH IN THE
              PRODUCTS CLAIM LIABILITY LIMITS SECTION.
            </p>
            <p>
              FURTHER, YOU AGREE AND UNDERSTAND THAT WE WILL NOT BE LIABLE FOR (A) ANY INCIDENTAL,
              SPECIAL, INDIRECT, CONSEQUENTIAL, OR PUNITIVE, OR OTHER SIMILAR DAMAGES, INCLUDING,
              WITHOUT LIMITATION, LOST INCOME, REVENUE, PROFIT OR OPPORTUNITY, WHETHER OR NOT
              FORESEEABLE AND HOWEVER ARISING AND WHETHER BASED IN CONTRACT, EQUITY, TORT, STATUTE,
              STRICT LIABILITY, OR ANY OTHER THEORY OF LIABILITY; OR (B) CLAIMS, DEMANDS, OR ACTIONS
              FOR ANY SUBROGATION CLAIM BROUGHT ON YOUR BEHALF OR BY YOUR INSURANCE CARRIER.
            </p>
            <p>
              WE EXPRESSLY DISCLAIM ALL WARRANTIES, REPRESENTATIONS OR GUARANTEES, WHETHER EXPRESS
              OR IMPLIED NOT EXPRESSLY STATED HEREIN.
            </p>

            <section>
              <h3>Making a Claim</h3>
              <p>
                If your Products has been lost or damaged in transit to or from Company and such
                loss or damage would qualify as a claim under our Guarantee Against Loss or
                Additional Insurance (“Claim”), you may file a Claim by emailing us at{' '}
                <Link href="mailto:support@doradometals.com">
                  support@doradometals.com
                </Link>{' '}
                or call{' '}
                <Link href="tel:8172034786">
                  (817) 203-4786
                </Link>
                . You must file the Claim with us within ten (10) days of the date the Products were
                sent to or from the Company. For a Claim to qualify you must have followed the
                Required Shipping Procedures and provide Company with all information as required or
                requested. Failure to comply with the Claim requirements or procedures will negate
                your Claim. Please note, due to fraud, Company shall not be liable for Products
                which are delivered in packages that are empty or missing contents since Company has
                no way of knowing if the packages were tampered, damaged or emptied before shipping
                Products for the purpose of making a Claim. Company reserves the right, in its sole
                discretion, to reject delivery of any mail, envelope or package which appears to be
                empty, damaged, opened, or tampered with, and to return such mail, envelope or
                package to you. Company shall have no liability to you for any such attempted
                delivery or return of such Products whether or not Company accepts or rejects the
                delivery.
              </p>
            </section>

            <section>
              <h3>Products Claim Liability Limit</h3>
              <p>
                This Products Claim Liability Limit shall be binding on you and any third party,
                including but not limited to you and your successors, assigns, insurance carriers
                and other individuals or entities asserting any right or claim relating to your
                Products.
              </p>
              <p>
                Company liability to reimburse your Products Claims shall be expressly limited to
                the LEAST of the following sums:
              </p>
              <ul>
                <li>
                  The sum of Five Thousand Dollars ($5,000.00), unless increased in accordance with
                  the Additional Insurance section.
                </li>
                <li>
                  The liquidation value placed on the Products by Company in its sole discretion.
                  Liquidation value is defined as the value of the Products when it must be sold on
                  an expedited basis.
                </li>
                <li>
                  One-third (1/3) of the appraised value of the Products according to an appraisal
                  issued by a reputable appraiser within one year prior to the shipment of Products
                  submitted by you to the Company.
                </li>
              </ul>
              <p>
                Within 90 days from filed claim, Company (or the insurer if it is an insured loss)
                may in its sole discretion, either (a) reimburse you as set forth above, or (b)
                replace your Products with goods of like kind, quality, and condition.
              </p>
            </section>
          </section>

          <hr />

          <section>
            <h2>Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless DORADO METALS EXCHANGE LLC, its
              affiliates, officers, directors, employees, and agents from any claims, liabilities,
              damages, losses, or expenses (including legal fees) arising out of or related to your
              breach of these Terms, violation of any laws, or infringement of third-party rights.
            </p>
          </section>

          <hr />

          <section>
            <h2>Force Majeure</h2>
            <p>
              We are not liable for any delays or failures in performance due to circumstances
              beyond our reasonable control, including but not limited to acts of God, natural
              disasters, war, terrorism, government actions, labor strikes, supply chain
              disruptions, or carrier delays. Performance will resume as soon as the impacting event
              is resolved.
            </p>
          </section>

          <hr />

          <section>
            <h2>Unclaimed Items &amp; Abandonment</h2>
            <p>
              Items returned twice due to
              failed delivery will be considered abandoned after 30 days.
            </p>
          </section>

          <hr />

          <section>
            <h2>Compliance with Federal &amp; State Laws</h2>
            <p>
              We comply with AML (Anti-Money Laundering) regulations, Patriot Act, and IRS Form
              1099-B reporting requirements. We cooperate with law enforcement agencies for
              suspicious transactions. We reserve the right to disclose your personally identifiable
              information upon request by a law enforcement and/or governmental agency, as required
              by law or when we believe that disclosure is necessary to protect our rights and/or to
              comply with a judicial proceeding, court order or legal process.
            </p>
            <p>
              You must not ship hazardous or illegal materials and your shipment must otherwise
              comply with applicable state and federal laws.
            </p>
          </section>

          <hr />

          <section>
            <h2>Electronic Communications and Signature</h2>
            <p>
              You consent to receive communications electronically from the Company and perform any
              actions, including without limitation consent and signatures, with respect to
              Transaction, to the fullest extent permitted by applicable law electronically as
              provided for in the Federal Electronic Signatures in Global and National Commerce Act
              or any similar state law based on the Uniform Electronic Transactions Act and the
              parties hereby waive any objection to the contrary. You agree that all agreements,
              notices, disclosures and other communications that are provided to you electronically
              satisfy any legal requirement that such communications be in writing.
            </p>
            <p>
              For purposes of a Transaction, you agree that by clicking to submit on Our Website
              which relates to any agreement, acknowledgment, consent, terms, disclosures or these
              terms and conditions constitutes acceptance and agreement as if actually signed by you
              in writing. You agree and consent to be contacted by us, our agents, employees, and
              affiliates through the use of email, instant messaging or live chat, and/or telephone
              calls, including the use of automatic dialing systems to your cellular, home or work
              numbers, as well as any other telephone number you provided. You may unsubscribe from
              receiving emails at any time, by calling{' '}
              <Link href="tel:8172034786">
                (817) 203-4786
              </Link>
              . Telephone conversations with our employees, agents and independent contractors may
              be monitored and/or recorded.
            </p>
          </section>

          <hr />

          <section>
            <h2>Text Messages; Auto Dialed Calls; Consent</h2>
            <p>
              If you provide us with your mobile number, you agree that we may contact you using
              auto dialed or prerecorded message calls and text messages. The purpose of such calls
              or texts is to more efficiently provide notices regarding your Account or
              Transaction(s) with us. Standard telephone minute and text charges may apply. We will
              not use auto dialed or prerecorded message calls or texts to contact you for marketing
              purposes. You may revoke your consent by contacting customer service at{' '}
              <Link href="tel:8172034786">
                (817) 203-4786{' '}
              </Link>
              or by changing your account preferences. You are not required to consent to receive
              auto dialed or prerecorded message calls or texts in order to use our services.
            </p>
          </section>

          <hr />

          <section>
            <h2>Miscellaneous.</h2>
            <p>
              Headings are for convenience only and shall not be used to interpret or construe the
              same. The invalidity, in whole or in part, of any provision herein shall not affect
              the validity of the remainder of the provisions.
            </p>
          </section>

          <hr />

          <section>
            <h2>Governing Law</h2>
            <p>
              All transactions and services with Company shall be deemed to occur in the State of
              Texas and be regulated thereby, regardless of where you may reside, or access Our
              Website. The Transactions, services and all claims or causes of actions shall be
              governed, construed and enforced in accordance with Texas law and applicable federal
              law, in accordance with the laws of the State of Texas without reference to or
              application of Texas’ conflict of law principles.
            </p>
          </section>

          <hr />

          <section>
            <h2>Waiver of Jury Trial; Choice of Forum</h2>
            <p>
              IF ANY CLAIM, ACTION OR LAWSUIT ARISES BETWEEN YOU AND THE COMPANY, YOU EXPRESSLY (A)
              WAIVE YOUR RIGHT TO A JURY TRIAL; AND (B) CONSENT AND SUBMIT TO THE EXCLUSIVE
              JURISDICTION AND VENUE OF EITHER THE STATE OR FEDERAL COURTS LOCATED IN DALLAS COUNTY,
              TEXAS and you expressly agree that any such Court has personal jurisdiction over you.
              You waive all defenses of lack of personal jurisdiction and forum selection.
            </p>
          </section>

          <hr />

          <section>
            <h2>Modifications to Terms &amp; Conditions</h2>
            <p>
              DORADO METALS EXCHANGE LLC reserves the right to modify these Terms at any time.
              Updates will be posted on our website, and continued use of our services constitutes
              acceptance of the revised Terms.
            </p>
          </section>

          <hr />

          <section>
            <h2>Privacy Policy</h2>
            <p>
              To review how we collect, use, and protect your personal information, see our full{' '}
              <Link href="https://doradometals.com/privacy-policy">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <hr />

          <section>
            <h2>Customer Support and Contact Information</h2>
            <p>
              If you have any questions or concerns, please contact us by phone:{' '}
              <Link href="tel:8172034786">
                (817) 203-4786
              </Link>
              , email:{' '}
              <Link href="mailto:support@doradometals.com">
                support@doradometals.com
              </Link>{' '}
              , or address: 3198 Royal Lane Suite 209, Dallas, TX 75229
            </p>
          </section>
        </ScrollArea>
      </main>
    </div>
  )
}
