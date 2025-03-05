'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function Navbar() {

  const pathname = usePathname();

  useEffect(() => {
    console.log(pathname)
  }, [pathname])

  const menuItems = [
    {
      key: 1,
      label: 'Buy',
      src: '/buy',
    },
    {
      key: 2,
      label: 'Sell',
      src: '/sell'
    }
  ]
  return (
    <nav className="flex items-center justify-between bg-white flex-wrap p-6">
      <div className="flex items-center flex-shrink-0 mr-6">
        <span className="font-semibold text-lg tracking-tight">Dorado Metals Exchange</span>
      </div>
      <div className="w-full block flex-grow lg:flex lg:items-center lg:w-auto">
        <div className="text-sm lg:flex-grow">
          {menuItems.map((item) => {
            return (<Link key={item.key} href={item.src}><p>{item.label}</p></Link>)
          })}
          {/* <a href="#responsive-header" className="block mt-4 lg:inline-block lg:mt-0 text-teal-200 hover:text-white mr-4">
            Docs
          </a>
          <a href="#responsive-header" className="block mt-4 lg:inline-block lg:mt-0 text-teal-200 hover:text-white mr-4">
            Examples
          </a>
          <a href="#responsive-header" className="block mt-4 lg:inline-block lg:mt-0 text-teal-200 hover:text-white">
            Blog
          </a> */}
        </div>
      </div>
    </nav>
  );
}