'use client';

import { ReactNode, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnClickOutside } from 'usehooks-ts';

type FloatingButtonProps = {
  className?: string;
  children: ReactNode;
  triggerContent: ReactNode;
};

type FloatingButtonItemProps = {
  children: ReactNode;
};

const list = {
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      staggerDirection: 1
    }
  },
  hidden: {
    opacity: 0,
    transition: {
      when: 'afterChildren',
      staggerChildren: 0.1
    }
  }
};

const item = {
  visible: { opacity: 1, x: 0 },
  hidden: { opacity: 0, x: -10 }
}



function FloatingButton({ className, children, triggerContent }: FloatingButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useOnClickOutside(ref as React.RefObject<HTMLElement>, () => setIsOpen(false));

  return (
    <div className="flex flex-col items-center relative">
      <div className="mt-3 mr-2 ml-2" ref={ref} onClick={() => setIsOpen(!isOpen)}>
        <motion.div  animate={isOpen ? 'visible' : 'hidden'}>
          {triggerContent}
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
          className="flex flex-row items-center absolute right-full top-3 gap-2 z-50"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={list}
        >
          {children}
        </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function FloatingButtonItem({ children }: FloatingButtonItemProps) {
  return <motion.li variants={item}>{children}</motion.li>;
}

export { FloatingButton, FloatingButtonItem };
