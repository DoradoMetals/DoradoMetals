'use client'

import formatPhoneNumber from '@/utils/formatPhoneNumber'
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="w-full bg-neutral-800 dark:bg-highest text-white px-8 py-5 mt-20">
      <div className="w-full mx-auto flex flex-wrap justify-between gap-10">
        <div className="flex flex-col gap-2">
          <h4 className="text-xl font-medium mb-3">Resources</h4>
          <Link href="/" className="text-neutral-200 dark:text-neutral-700">
            Why Dorado?
          </Link>
          <Link href="/" className="text-neutral-200 dark:text-neutral-700">
            Metals Trading
          </Link>
          <Link href="/terms-and-conditions" className="text-neutral-200 dark:text-neutral-700">
            Terms and Conditions
          </Link>
          <Link href="/privacy-policy" className="text-neutral-200 dark:text-neutral-700">
            Privacy Policy
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-xl font-medium mb-3">Socials</h4>
          <Link href="/" className="text-neutral-200 dark:text-neutral-700">
            LinkedIn
          </Link>
          <Link href="/" className="text-neutral-200 dark:text-neutral-700">
            Twitter
          </Link>
          <Link href="/" className="text-neutral-200 dark:text-neutral-700">
            Facebook
          </Link>
          <Link href="/" className="text-neutral-200 dark:text-neutral-700">
            Instagram
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-xl font-medium mb-3">Links</h4>
          <Link href="/" className="text-neutral-200 dark:text-neutral-700">
            Ebay Listings
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-xl font-medium mb-3">Company</h4>
          <Link href="/" className="text-neutral-200 dark:text-neutral-700">
            About Us
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-xl font-medium mb-3">Contact Us</h4>
          <a
            href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
            className="text-neutral-200 dark:text-neutral-700"
          >
            {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
          </a>
          <Link
            href="mailto:support@doradometals.com"
            className="text-neutral-200 dark:text-neutral-700"
          >
            support@doradometals.com
          </Link>
        </div>
      </div>

      <div className="mt-10 text-xs text-neutral-500 text-left">© Dorado Metals Exchange LLC</div>
    </footer>
  )
}
