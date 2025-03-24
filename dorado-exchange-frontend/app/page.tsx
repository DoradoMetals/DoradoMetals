'use client';

import { GoldIcon, PalladiumIcon, PlatinumIcon, SilverIcon } from "@/components/icons/logo";

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-3 mt-10">
      <GoldIcon size={30} height={30} />
      <SilverIcon size={30} height={30} />
      <PlatinumIcon size={30} height={30} />
      <PalladiumIcon size={30} height={30} />
    </div>
  );
}
