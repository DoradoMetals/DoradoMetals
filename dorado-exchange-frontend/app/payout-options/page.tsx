'use client'

import * as React from 'react'
import {
  Bank,
  ArrowsLeftRight,
  EnvelopeSimple,
  Coins,
  IconProps,
  CoinsIcon,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function HeadingWithIcon({
  icon: Icon,
  children,
  className,
  iconSize = 32,
}: {
  icon: React.ComponentType<IconProps>
  children: React.ReactNode
  className?: string
  iconSize?: number
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Icon size={iconSize} weight="regular" className="text-primary shrink-0" />
      <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 tracking-tight">
        {children}
      </h2>
    </div>
  )
}

export default function PayoutMethodsPage() {
  return (
    <main className="relative w-full flex flex-col items-center">
      {/* Intro */}
      <section className="w-full px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          <h1 className="text-neutral-900 text-2xl sm:text-3xl font-semibold tracking-tight">
            Payout Methods
          </h1>
          <p className="text-neutral-700 text-sm sm:text-base leading-relaxed">
            Choose how you’d like to get paid when you sell your metal. We offer several secure
            payout options designed to balance speed, convenience, and flexibility. Each method
            below explains how it works, typical timing, and when it might be the best fit.
          </p>
        </div>
      </section>

      {/* Methods */}
      <section className="w-full px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16">
        <div className="max-w-5xl mx-auto flex flex-col gap-6 sm:gap-8">
          {/* ACH */}
          <PayoutCard
            icon={Bank}
            title="ACH Transfer"
            fitHeading="ACH is a great fit if you:"
            bullets={[
              'Prefer a low-fee or no-fee payout method',
              'Are comfortable waiting 1–3 business days for your bank to post the deposit',
              'Want your funds to arrive quietly and securely in your bank account',
            ]}
            intro={
              <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                ACH (Automated Clearing House) is one of the most common and trusted ways to move
                money between banks in the U.S. With this option, we send your payout directly to
                your checking or savings account—no paper checks, no branch visits, and no extra
                steps once it’s set up.
              </p>
            }
            afterBullets={
              <>
                <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                  Once your metal is received, verified, and your payout is approved, we initiate
                  the transfer the same business day whenever possible (subject to our processing
                  cutoff times). From there, your bank’s ACH schedule determines when the funds show
                  up, but you’ll receive a confirmation from us as soon as the transfer is sent.
                </p>
                <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                  All you need is your bank name, routing number, and account number. We transmit
                  this information securely and never use it for anything other than sending your
                  payout.
                </p>
              </>
            }
          />

          {/* Wire */}
          <PayoutCard
            icon={ArrowsLeftRight}
            title="Wire Transfer"
            fitHeading="Wire is a great fit if you:"
            bullets={[
              'Need access to your funds as quickly as possible',
              'Are moving a larger payout and want a direct bank-to-bank transfer',
              'Don’t mind that your bank may charge an incoming wire fee',
            ]}
            intro={
              <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                Wire transfers are designed for speed and reliability, especially when you’re
                dealing with larger dollar amounts. With a wire, funds are sent directly from our
                bank to yours, often arriving the same business day once the wire is released
                (depending on bank cut-off times and your bank’s policies).
              </p>
            }
            afterBullets={
              <>
                <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                  After your shipment is received and your payout is approved, we prepare and
                  release the wire during our normal banking hours. You’ll receive a confirmation
                  with the amount and reference details so you can easily track it with your bank.
                </p>
                <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                  Some banks may place temporary holds on large incoming wires or require additional
                  verification. While that’s outside our control, we’re happy to provide any
                  supporting documentation you might need if your bank asks for it.
                </p>
              </>
            }
          />

          {/* eCheck */}
          <PayoutCard
            icon={EnvelopeSimple}
            title="Deluxe eCheck"
            fitHeading="eCheck is a great fit if you:"
            bullets={[
              'Want fast access to funds without sharing bank account details',
              'Prefer something that can be deposited at almost any bank or credit union',
              'Like having a printable record of your payout for your own files',
            ]}
            intro={
              <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                A Deluxe eCheck gives you the convenience of a traditional check without waiting for
                the mail. Once your payout is ready, we issue a secure digital check and send it
                straight to your email. From there, you can print it and deposit it in person, use
                your bank’s mobile app, or use supported Deluxe tools for direct electronic deposit.
              </p>
            }
            afterBullets={
              <>
                <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                  We typically issue eChecks the same day your payout is finalized. As soon as it’s
                  sent, you’ll receive an email with clear instructions on how to open, print, and
                  deposit the check safely. The check itself is drawn on a standard U.S. bank
                  account and is processed by your bank just like any other check, subject to their
                  normal hold times.
                </p>
                <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                  All you need is a valid email address you can access securely. If you’re
                  comfortable handling things digitally and want flexibility in how you deposit,
                  eCheck is a great middle ground between speed and familiarity.
                </p>
              </>
            }
          />

          {/* Bullion Exchange */}
          <PayoutCard
            icon={CoinsIcon}
            title="Bullion Exchange"
            fitHeading="Bullion Exchange is a great fit if you:"
            bullets={[
              'Want to move from scrap or unwanted items into investable bullion',
              'Prefer to store value in physical metal rather than holding cash',
              'Like the idea of “trading up” into coins and bars in a single transaction',
            ]}
            intro={
              <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                If your goal is to build or grow your precious-metals holdings, you don’t have to
                take your payout in cash at all. With Bullion Exchange, you can apply some or all of
                your proceeds toward eligible coins and bars instead of receiving a cash payment.
              </p>
            }
            afterBullets={
              <>
                <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                  Once your metal is received and your payout is calculated, you can choose the
                  bullion you’d like from our available inventory. We lock in pricing at the time of
                  your selection, provide a clear breakdown of how your payout is applied (including
                  any premiums and shipping), and confirm your final order total before anything is
                  finalized.
                </p>
                <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
                  After you approve the conversion, your bullion order is packed, fully insured, and
                  shipped to you—typically within about a week, depending on product availability
                  and shipping method. You’ll receive tracking information so you can follow
                  delivery every step of the way.
                </p>
              </>
            }
          />

          {/* Optional CTA row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-border mt-4">
            <p className="text-xs sm:text-sm text-neutral-600 max-w-lg">
              Not sure which payout method is right for you? We're happy to walk through the
              options based on your shipment size, timing, and preferences.
            </p>
            <Button asChild size="sm">
              <a href="/contact">Ask a payout question</a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

function PayoutCard({
  icon,
  title,
  intro,
  fitHeading,
  bullets,
  afterBullets,
}: {
  icon: React.ComponentType<IconProps>
  title: string
  intro: React.ReactNode
  fitHeading: string
  bullets: string[]
  afterBullets?: React.ReactNode
}) {
  return (
    <article className="rounded-lg bg-card raised-off-page border border-border">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-5 sm:pb-7">
        <HeadingWithIcon icon={icon}>{title}</HeadingWithIcon>

        <div className="mt-3 sm:mt-4 flex flex-col gap-3 sm:gap-4">
          {/* Intro paragraphs */}
          {intro}

          {/* Bullets section */}
          <div className="mt-1 sm:mt-2">
            <p className="text-sm sm:text-base font-semibold text-neutral-900 mb-1.5">
              {fitHeading}
            </p>
            <ul className="space-y-1.5 text-sm sm:text-base text-neutral-800">
              {bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-neutral-900 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail paragraphs after bullets */}
          {afterBullets}
        </div>
      </div>
    </article>
  )
}
