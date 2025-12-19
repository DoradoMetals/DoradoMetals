'use client'

import { FacebookIcon, InstagramIcon, Logo, XIcon } from '@/components/icons/logo'
import { Button } from '@/components/ui/button'
import formatPhoneNumber from '@/utils/formatting/formatPhoneNumber'
import Image from 'next/image'
import Link from 'next/link'

export default function Footer() {
  return (
    <>
      <footer className="hidden lg:flex flex-col w-full items-center justify-center bg-neutral-800 dark:bg-highest text-white px-8 py-5 raised-off-page">
        <div className='flex flex-col items-center justify-center w-full max-w-7xl'>
          <div className="w-full mx-auto flex flex-wrap justify-between gap-10">
            <div className="flex flex-col gap-2">
              <h4 className="text-base font-medium mb-1">Resources</h4>
              <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
                Why Dorado?
              </Link>
              <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
                Metals Trading
              </Link>
              <Link
                href="/terms-and-conditions"
                className="text-xs text-neutral-200 dark:text-neutral-700"
              >
                Terms and Conditions
              </Link>
              <Link
                href="/privacy-policy"
                className="text-xs text-neutral-200 dark:text-neutral-700"
              >
                Privacy Policy
              </Link>
              <Link href="/sales-tax" className="text-xs text-neutral-200 dark:text-neutral-700">
                Sales Tax
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-lg font-medium mb-1">Socials</h4>
              <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
                X
              </Link>
              <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
                Facebook
              </Link>
              <Link
                target="_blank"
                href="https://www.instagram.com/doradometals/?utm_source=qr#"
                className="text-xs text-neutral-200 dark:text-neutral-700"
              >
                Instagram
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-lg font-medium mb-1">Links</h4>
              <Link
                target="_blank"
                href="https://www.ebay.com/sch/i.html?item=146566125667&rt=nc&_trksid=p4429486.m3561.l161211&_ssn=doradometals"
                className="text-xs text-neutral-200 dark:text-neutral-700"
              >
                eBay Listings
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-lg font-medium mb-1">Company</h4>
              <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
                About Us
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-lg font-medium mb-1">Contact Us</h4>
              <a
                href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
                className="text-xs text-neutral-200 dark:text-neutral-700"
              >
                {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
              </a>
              <Link
                href="mailto:support@doradometals.com"
                className="text-xs text-neutral-200 dark:text-neutral-700"
              >
                support@doradometals.com
              </Link>
            </div>
          </div>

          <div className="flex items-center w-full justify-between mt-5 ">
            <Link href="/" className="px-0">
              <Logo size={200} />
            </Link>

            <Link href="https://occc.texas.gov/" className="px-0">
              <Image src="/icons/providers/occc.svg" width={148} height={148} alt="Office of Consumer Credit" />
            </Link>
          </div>

          <div className="flex items-center w-full justify-between mt-5 ">
            <div className="text-xs text-neutral-500 text-left">© Dorado Metals Exchange LLC</div>

            <div className="text-xs text-neutral-500 gap-1">
              This site is protected by reCAPTCHA and the Google
              <Link
                className="text-neutral-300 dark:text-neutral-600 tracking-wide"
                href="https://policies.google.com/privacy"
              >
                {' '}
                Privacy Policy{' '}
              </Link>
              and
              <Link
                className="text-neutral-300 dark:text-neutral-600 tracking-wide"
                href="https://policies.google.com/terms"
              >
                {' '}
                Terms of Service{' '}
              </Link>
              apply.
            </div>
          </div>
        </div>
      </footer>

      <footer className="flex flex-col lg:hidden w-full bg-neutral-800 dark:bg-highest px-3 py-3 pt-6 raised-off-page">
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
            <Link
              target="_blank"
              href="https://www.ebay.com/sch/i.html?item=146566125667&rt=nc&_trksid=p4429486.m3561.l161211&_ssn=doradometals"
              className="text-xs text-neutral-200 dark:text-neutral-700"
            >
              eBay Listings
            </Link>
            <Link href="/" className="text-xs text-neutral-200 dark:text-neutral-700">
              About Us
            </Link>
          </div>
          <div className="flex w-full items-center justify-between">
            <Link href="/sales-tax" className="text-xs text-neutral-200 dark:text-neutral-700">
              Sales Tax
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
          <div className="text-xs text-neutral-200 dark:text-neutral-700 text-left">
            © Dorado Metals Exchange LLC
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="p-0">
              <Link target="_blank" href="https://www.instagram.com/doradometals/?utm_source=qr#">
                <InstagramIcon size={20} className="text-neutral-200 dark:text-neutral-700" />
              </Link>
            </Button>
            <Button variant="ghost" className="p-0">
              <FacebookIcon size={20} className="text-neutral-200 dark:text-neutral-700" />
            </Button>
            <Button variant="ghost" className="p-0">
              <XIcon size={20} className="text-neutral-200 dark:text-neutral-700" />
            </Button>
          </div>
        </div>
        <div className="flex items-center w-full justify-between mt-5 ">
          <Link href="/" className="px-0">
            <Logo size={128} />
          </Link>

          <Link href="https://occc.texas.gov/" className="px-0">
            <Image src="/icons/providers/occc.svg" width={100} height={100} alt="Office of Consumer Credit" />
          </Link>
        </div>
      </footer>
    </>
  )
}
