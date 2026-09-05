'use client'

import Link from 'next/link'
import { Button, Footer as DsFooter, Link as DsLink } from '@dorado/components'
import { Logo, InstagramIcon } from '@/shared/ui/Logo'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

const EBAY_URL =
  'https://www.ebay.com/sch/i.html?item=146566125667&rt=nc&_trksid=p4429486.m3561.l161211&_ssn=doradometals'
const INSTAGRAM_URL = 'https://www.instagram.com/doradometals/?utm_source=qr#'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  const columns = [
    {
      heading: 'Resources',
      links: [
        <DsLink key="why-dorado" asChild>
          <Link href="/">Why Dorado?</Link>
        </DsLink>,
        <DsLink key="metals-trading" asChild>
          <Link href="/">Metals Trading</Link>
        </DsLink>,
        <DsLink key="sales-tax" asChild>
          <Link href="/sales-tax">Sales Tax</Link>
        </DsLink>,
      ],
    },
    {
      heading: 'Company',
      links: [
        <DsLink key="about-us" asChild>
          <Link href="/">About Us</Link>
        </DsLink>,
        <DsLink key="ebay" asChild external>
          <Link href={EBAY_URL} target="_blank" rel="noopener noreferrer">
            eBay Listings
          </Link>
        </DsLink>,
      ],
    },
    {
      heading: 'Contact',
      links: [
        <DsLink key="phone" asChild>
          <a href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}>
            {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
          </a>
        </DsLink>,
        <DsLink key="email" asChild>
          <a href="mailto:support@doradometals.com">support@doradometals.com</a>
        </DsLink>,
      ],
    },
  ]

  const recaptchaNotice = (
    <>
      This site is protected by reCAPTCHA and the Google{' '}
      <DsLink asChild>
        <Link href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </Link>
      </DsLink>{' '}
      and{' '}
      <DsLink asChild>
        <Link href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
          Terms of Service
        </Link>
      </DsLink>{' '}
      apply.
    </>
  )

  return (
    <DsFooter
      brand={
        <Link href="/" className="px-0">
          <Logo size={136} height={30} />
        </Link>
      }
      tagline="Fast. Insured. Paid the day it arrives."
      cta={
        <Button asChild variant="primary">
          <Link href="/sell">Get a Quote</Link>
        </Button>
      }
      columns={columns}
      legal={`© Dorado Metals Exchange LLC ${currentYear}`}
      legalLinks={[
        <DsLink key="terms" asChild>
          <Link href="/terms-and-conditions">Terms and Conditions</Link>
        </DsLink>,
        <DsLink key="privacy" asChild>
          <Link href="/privacy-policy">Privacy Policy</Link>
        </DsLink>,
      ]}
      social={
        <Button
          variant="tertiary"
          size="iconSm"
          asChild
          aria-label="Dorado Metals Exchange on Instagram"
        >
          <Link href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
            <InstagramIcon aria-hidden />
          </Link>
        </Button>
      }
      notice={recaptchaNotice}
    />
  )
}
