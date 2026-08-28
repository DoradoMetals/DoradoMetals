'use client'

import { FacebookIcon, InstagramIcon, Logo, XIcon } from '@/features/navigation/ui/Logo'
import { Button } from '@/shared/ui/base/button'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import Image from 'next/image'
import Link from 'next/link'

export default function Footer() {
  return (
    <>
      <footer className="hidden lg:flex flex-col w-full items-center justify-center bg-highest px-8 py-5">
        <div className="flex flex-col items-center justify-center w-full max-w-7xl">
          <div className="w-full mx-auto flex flex-wrap justify-between gap-10">
            <nav aria-label="Resources" className="flex flex-col gap-2">
              <h4 className="mb-1">Resources</h4>
              <Link href="/">
                <small>Why Dorado?</small>
              </Link>
              <Link href="/">
                <small>Metals Trading</small>
              </Link>
              <Link href="/terms-and-conditions">
                <small>Terms and Conditions</small>
              </Link>
              <Link href="/privacy-policy">
                <small>Privacy Policy</small>
              </Link>
              <Link href="/sales-tax">
                <small>Sales Tax</small>
              </Link>
            </nav>

            <nav aria-label="Socials" className="flex flex-col gap-2">
              <h4 className="mb-1">Socials</h4>
              <Link href="/">
                <small>X</small>
              </Link>
              <Link href="/">
                <small>Facebook</small>
              </Link>
              <Link
                target="_blank"
                href="https://www.instagram.com/doradometals/?utm_source=qr#"
              >
                <small>Instagram</small>
              </Link>
            </nav>

            <nav aria-label="Links" className="flex flex-col gap-2">
              <h4 className="mb-1">Links</h4>
              <Link
                target="_blank"
                href="https://www.ebay.com/sch/i.html?item=146566125667&rt=nc&_trksid=p4429486.m3561.l161211&_ssn=doradometals"
              >
                <small>eBay Listings</small>
              </Link>
            </nav>

            <nav aria-label="Company" className="flex flex-col gap-2">
              <h4 className="mb-1">Company</h4>
              <Link href="/">
                <small>About Us</small>
              </Link>
            </nav>

            <nav aria-label="Contact Us" className="flex flex-col gap-2">
              <h4 className="mb-1">Contact Us</h4>
              <a href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}>
                <small>{formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}</small>
              </a>
              <Link href="mailto:support@doradometals.com">
                <small>support@doradometals.com</small>
              </Link>
            </nav>
          </div>

          <div className="flex items-center w-full justify-between mt-5">
            <Link href="/" className="px-0">
              <Logo size={200} />
            </Link>

            <Link href="https://occc.texas.gov/" className="px-0">
              <Image
                src="/icons/providers/occc.svg"
                width={148}
                height={148}
                alt="Office of Consumer Credit"
              />
            </Link>
          </div>

          <div className="flex items-center w-full justify-between mt-5">
            <small className="text-left">© Dorado Metals Exchange LLC</small>

            <p>
              <small>
                This site is protected by reCAPTCHA and the Google
                <Link href="https://policies.google.com/privacy">
                  {' '}
                  Privacy Policy{' '}
                </Link>
                and
                <Link href="https://policies.google.com/terms">
                  {' '}
                  Terms of Service{' '}
                </Link>
                apply.
              </small>
            </p>
          </div>
        </div>
      </footer>

      <footer className="flex flex-col lg:hidden w-full bg-highest px-3 py-3 pt-6">
        <nav aria-label="Footer" className="flex flex-col gap-2 w-full">
          <div className="flex w-full items-center justify-between">
            <Link href="/">
              <small>Why Dorado?</small>
            </Link>
            <Link href="/terms-and-conditions">
              <small>Terms and Conditions</small>
            </Link>
          </div>
          <div className="flex w-full items-center justify-between">
            <Link href="/">
              <small>Metals Trading</small>
            </Link>
            <Link href="/privacy-policy">
              <small>Privacy Policy</small>
            </Link>
          </div>
          <div className="flex w-full items-center justify-between">
            <Link
              target="_blank"
              href="https://www.ebay.com/sch/i.html?item=146566125667&rt=nc&_trksid=p4429486.m3561.l161211&_ssn=doradometals"
            >
              <small>eBay Listings</small>
            </Link>
            <Link href="/">
              <small>About Us</small>
            </Link>
          </div>
          <div className="flex w-full items-center justify-between">
            <Link href="/sales-tax">
              <small>Sales Tax</small>
            </Link>
          </div>

          <div className="flex w-full items-center justify-between mt-4">
            <Link href="mailto:support@doradometals.com">
              <small>support@doradometals.com</small>
            </Link>
            <a href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}>
              <small>{formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}</small>
            </a>
          </div>
        </nav>
        <div className="flex items-center w-full justify-between mt-1">
          <small className="text-left">© Dorado Metals Exchange LLC</small>
          <div className="flex items-center gap-3">
            <Button asChild variant="tertiary" size="iconSm">
              <Link target="_blank" href="https://www.instagram.com/doradometals/?utm_source=qr#">
                <InstagramIcon size={20} />
              </Link>
            </Button>
            <Button variant="tertiary" size="iconSm">
              <FacebookIcon size={20} />
            </Button>
            <Button variant="tertiary" size="iconSm">
              <XIcon size={20} />
            </Button>
          </div>
        </div>
        <div className="flex items-center w-full justify-between mt-5">
          <Link href="/" className="px-0">
            <Logo size={128} />
          </Link>

          <Link href="https://occc.texas.gov/" className="px-0">
            <Image
              src="/icons/providers/occc.svg"
              width={100}
              height={100}
              alt="Office of Consumer Credit"
            />
          </Link>
        </div>
      </footer>
    </>
  )
}
