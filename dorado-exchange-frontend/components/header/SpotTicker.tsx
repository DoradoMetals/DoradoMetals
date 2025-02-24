import { useEffect, useState } from "react";
import { Divider } from "@heroui/react";
import { SpotTickerArrowDown, SpotTickerArrowUp } from "../icons";

export default function SpotTicker() {
  const [prices, setPrices] = useState({
    gold: { price: 2948, change: 0 },
    silver: { price: 30.25, change: 0 },
    platinum: { price: 971, change: 0 },
    palladium: { price: 993, change: 0 },
  });

  const getRandomNumFromRange = (min: number, max: number) => {
    return +(Math.random() * (max - min) + min).toFixed(2);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(() => ({
        gold: {
          price: getRandomNumFromRange(2945, 2953),
          change: getRandomNumFromRange(-2, 2),
        },
        silver: {
          price: getRandomNumFromRange(30, 33),
          change: getRandomNumFromRange(-0.5, 0.5),
        },
        platinum: {
          price: getRandomNumFromRange(970, 1000),
          change: getRandomNumFromRange(-5, 5),
        },
        palladium: {
          price: getRandomNumFromRange(990, 1020),
          change: getRandomNumFromRange(-3, 3),
        },
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="py-2 flex justify-end">
        <div className="flex gap-6 whitespace-nowrap animate-marquee px-6 sm:text-sm md:text-md lg:text-lg">
          {Object.entries(prices).map(([metal, { price, change }]) => (
            <a
              key={metal}
              href={`/prices/${metal}`} // Placeholder link
              className="flex items-center gap-2 cursor-pointer hover:underline"
            >
              <span className="capitalize">{metal}:</span>
              <span className="text-shadow-sm">${price.toLocaleString()}</span>
              <span
                className={`flex items-center text-shadow-sm ${
                  change >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                ({change >= 0 ? <SpotTickerArrowUp /> : <SpotTickerArrowDown />}
                {Math.abs(change)}%)
              </span>
            </a>
          ))}
        </div>
      </div>
      <Divider />
    </>
  );
}
