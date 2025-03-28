import { createPortal } from "react-dom";
import { FC, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Anchor = "left" | "right";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  children: ReactNode;
  anchor?: Anchor;
}

const styles = {
  left: "h-full top-29 lg:top-0",
  right: "h-full top-29 lg:top-0",
};

const CartDrawer: FC<Props> = ({ open, setOpen, children, anchor = "right" }) => {
  if (typeof document === "undefined") return null; // Prevent SSR errors

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 lg:bg-black z-[60]" // Higher z-index than navbar
            onClick={() => setOpen(false)}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }} // Starts fully offscreen
            animate={{ x: "0%" }} // Moves into place
            exit={{ x: "100%" }} // Slides back out
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={`fixed right-0 top-29 lg:top-0 z-[70] h-full w-full sm:w-2/3 md:w-1/2 lg:w-1/3 xl:w-1/4 lg:bg-background lg:shadow-lg`}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body as HTMLElement
  );
};

export default CartDrawer;
