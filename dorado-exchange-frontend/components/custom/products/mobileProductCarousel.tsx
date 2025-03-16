"use client";

import { motion } from "framer-motion";

const categories = [
  { name: "Gold", img: "/product_images/elemetal_products/gold/American Eagle/BACK.png" },
  { name: "Silver", img: "/product_images/elemetal_products/silver/1oz Unity/FRONT.png" },
  { name: "Platinum", img: "/product_images/elemetal_products/platinum/American Eagle/BACK.png" },
  { name: "Palladium", img: "/product_images/elemetal_products/palladium/1oz Palladium Bar/FRONT.png" },
  { name: "Coins", img: "/product_images/elemetal_products/gold/Canadian Maple/FRONT.png" },
  { name: "Bars", img: "/product_images/elemetal_products/silver/1oz Unity/FRONT.png" },
  { name: "Featured", img: "/product_images/elemetal_products/silver/5oz Elemetal USA/FRONT.png" },
  { name: "Most Popular", img: "/product_images/elemetal_products/gold/English Britannia/FRONT.png" },
];

export default function AvatarCarousel() {
  return (
    <div className="relative w-full">
      <motion.div className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-3">
        {categories.map((category, index) => (
          <div key={index} className="flex flex-col items-center w-20">
            {/* Avatar Circle */}
            <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center">
              <img
                src={category.img}
                alt={category.name}
                className="w-12 h-12 object-contain"
                onError={(e) => (e.currentTarget.style.display = "none")} // Hide broken images
              />
            </div>
            {/* Category Name (One Line) */}
            <span className="text-xs font-light mt-1 text-center w-full whitespace-nowrap overflow-hidden">
              {category.name}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
