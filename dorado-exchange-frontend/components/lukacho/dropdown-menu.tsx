"use client";

import React, { useState, useRef, createContext, useContext, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

const DirectionContext = createContext<{
  direction: "rtl" | "ltr" | null;
  setAnimationDirection: (tab: number | null) => void;
} | null>(null);

const CurrentTabContext = createContext<{ currentTab: number | null } | null>(null);

export const Dropdown: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTab, setCurrentTab] = useState<null | number>(null);
  const [direction, setDirection] = useState<"rtl" | "ltr" | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const setAnimationDirection = (tab: number | null) => {
    if (typeof currentTab === "number" && typeof tab === "number") {
      setDirection(currentTab > tab ? "rtl" : "ltr");
    } else if (tab === null) {
      setDirection(null);
    }
    setCurrentTab(tab);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAnimationDirection(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <DirectionContext.Provider value={{ direction, setAnimationDirection }}>
      <CurrentTabContext.Provider value={{ currentTab }}>
      <div ref={dropdownRef} onMouseEnter={() => setAnimationDirection(1)} onMouseLeave={() => setAnimationDirection(null)} className="relative">
      {children}
        </div>
      </CurrentTabContext.Provider>
    </DirectionContext.Provider>
  );
};

export const TriggerWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentTab } = useContext(CurrentTabContext)!;
  const { setAnimationDirection } = useContext(DirectionContext)!;

  return (
    <button
      onMouseEnter={() => setAnimationDirection(1)}
      onClick={() => setAnimationDirection(1)}
      className={cn(
        "flex rounded-md transition-all",
        currentTab === 1 ? "" : ""
      )}
    >
      {children}
    </button>
  );
};

export const Tabs: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const { currentTab } = useContext(CurrentTabContext)!;
  const { direction } = useContext(DirectionContext)!;

  return (
    <AnimatePresence>
  {currentTab !== null && (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "absolute left-1/2 top-[calc(100%_+_6px)] shadow-md rounded-lg p-2 transform -translate-x-1/2",
        className
      )}
    >
      {React.Children.map(children, (e, i) => (
        <div className="overflow-hidden">
          {currentTab === i + 1 && (
            <motion.div
              initial={{ opacity: 0, x: direction === "ltr" ? 100 : direction === "rtl" ? -100 : 0 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              {e}
            </motion.div>
          )}
        </div>
      ))}
    </motion.div>
  )}
</AnimatePresence>

  );
};

export const Tab: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  return <div className={cn("h-full", className)}>{children}</div>;
};
