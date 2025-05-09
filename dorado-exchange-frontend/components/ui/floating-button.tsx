'use client';

import { ReactNode, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnClickOutside } from 'usehooks-ts';


type FloatingButtonProps = {
  className?: string;
  children: ReactNode;
  triggerContent: ReactNode;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};
type FloatingButtonItemProps = {
  children: ReactNode;
};

const list = {
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      staggerDirection: 1,
    }
  },
  hidden: {
    opacity: 0,
    transition: {
      when: 'afterChildren',
      staggerChildren: 0.1,
      staggerDirection: -1,
    }
  }
};

const item = {
  visible: { opacity: 1, x: 0 },
  hidden: { opacity: 0, x: 10 }
}



function FloatingButton({ className, children, triggerContent, isOpen, setIsOpen }: FloatingButtonProps) {
  const ref = useRef<HTMLDivElement>(null);



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
          className="flex flex-row items-center absolute left-full top-3 gap-2 z-50"
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



type BullionFloatingButtonProps = {
  className?: string;
  children: ReactNode;
  triggerContent: ReactNode;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};
type BullionFloatingButtonItemProps = {
  children: ReactNode;
};

const bullionList = {
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      staggerDirection: 1,
    }
  },
  hidden: {
    opacity: 0,
    transition: {
      when: 'afterChildren',
      staggerChildren: 0.1,
      staggerDirection: -1,
    }
  }
};

const bullionItem = {
  visible: { opacity: 1, y: 0 },
  hidden: { opacity: 0, y: 10 }
}



function BullionFloatingButton({ className, children, triggerContent, isOpen, setIsOpen }: BullionFloatingButtonProps) {
  const ref = useRef<HTMLDivElement>(null);



  useOnClickOutside(ref as React.RefObject<HTMLElement>, () => setIsOpen(false));

  return (
    <div className="flex flex-col items-center relative">
      <div className="mt-1 mr-2 ml-2" ref={ref} onClick={() => setIsOpen(!isOpen)}>
        <motion.div  animate={isOpen ? 'visible' : 'hidden'}>
          {triggerContent}
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
          className="flex flex-col-reverse items-center absolute left-1/2 -translate-x-1/2 bottom-full z-50 gap-1"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={bullionList}
        >
          {children}
        </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function BullionFloatingButtonItem({ children }: BullionFloatingButtonItemProps) {
  return <motion.li variants={bullionItem}>{children}</motion.li>;
}

export { BullionFloatingButton, BullionFloatingButtonItem };

