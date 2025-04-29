'use client';

import { motion, useAnimation } from 'framer-motion';
import type { HTMLAttributes } from 'react';
import { forwardRef, useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CartIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  isOpen: boolean;
}

const iconVariants = {
  normal: {
    rotate: 0,
    scale: 1,
  },
  animate: {
    rotate: 45,
    scale: 0.9,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 20,
    },
  },
};

const CartIcon = forwardRef<HTMLDivElement, CartIconProps>(
  ({ isOpen, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();

    useEffect(() => {
      controls.start(isOpen ? 'animate' : 'normal');
    }, [isOpen]);

    return (
      <div
        ref={ref}
        className={cn(
          `cursor-pointer select-none p-2 rounded-md transition-colors duration-200 flex items-center justify-center`,
          className
        )}
        {...props}
      >
        <motion.div animate={controls} variants={iconVariants}>
          <ShoppingCart size={size} />
        </motion.div>
      </div>
    );
  }
);

CartIcon.displayName = 'MenuIcon';

export { CartIcon };
