'use client'

import { FacebookIcon, InstagramIcon, XIcon } from '@/components/icons/logo'
import { Button } from '@/components/ui/button'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import Link from 'next/link'

export default function Footer() {
  return (
    <>
      <footer className="hidden lg:flex flex-col w-full bg-neutral-800 dark:bg-highest text-white px-8 py-5 mt-10">
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

      <footer className="flex flex-col lg:hidden w-full bg-neutral-800 dark:bg-highest px-3 py-3 pt-6">
        <div className="flex flex-col gap-2 w-full">
          <div className="flex w-full items-center justify-between">
            <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
              Why Dorado?
            </Link>
            <Link
              href="/terms-and-conditions"
              className="text-xs text-neutral-200 dark:text-neutral-700"
            >
              Terms and Conditions
            </Link>
          </div>
          <div className="flex w-full items-center justify-between">
            <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
              Metals Trading
            </Link>
            <Link href="/privacy-policy" className="text-xs text-neutral-200 dark:text-neutral-700">
              Privacy Policy
            </Link>
          </div>
          <div className="flex w-full items-center justify-between">
            <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
              Ebay Listings
            </Link>
            <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
              About Us
            </Link>
          </div>
          <div className="flex w-full items-center justify-between mt-4">
            <Link
              href="mailto:support@doradometals.com"
              className="text-xs text-neutral-200 dark:text-neutral-700"
            >
              support@doradometals.com
            </Link>
            <a
              href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
              className="text-xs text-neutral-200 dark:text-neutral-700"
            >
              {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
            </a>
          </div>
        </div>
        <div className="flex items-center w-full justify-between mt-1">
          <div className="text-xs text-neutral-200 dark:text-neutral-700 text-left">© Dorado Metals Exchange LLC</div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="p-0">
              <InstagramIcon size={20} className="text-neutral-200 dark:text-neutral-700" />
            </Button>
            <Button variant="ghost" className="p-0">
              <FacebookIcon size={20} className="text-neutral-200 dark:text-neutral-700" />
            </Button>
            <Button variant="ghost" className="p-0">
              <XIcon size={20} className="text-neutral-200 dark:text-neutral-700" />
            </Button>
          </div>
        </div>
      </footer>
    </>
  )
}
