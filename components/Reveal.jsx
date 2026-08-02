"use client";

import { motion } from "framer-motion";

export default function Reveal({
  children,
  delay = 0,
  y = 28,
  duration = 0.7,
  once = true,
  className,
  as = "div",
}) {
  const Component = motion[as] ?? motion.div;

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.2 }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}
