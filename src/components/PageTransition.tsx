import { motion } from "framer-motion";
import { ReactNode, forwardRef } from "react";

const PageTransition = forwardRef<HTMLDivElement, { children: ReactNode }>(({ children }, ref) => (
  <motion.div
    ref={ref}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
));

PageTransition.displayName = "PageTransition";

export default PageTransition;
