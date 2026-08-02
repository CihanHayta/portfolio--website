"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { processSteps } from "@/data/content";
import Reveal from "./Reveal";
import styles from "./Process.module.css";

export default function Process() {
  const defaultActive =
    processSteps.find((s) => s.active)?.id ?? processSteps[0].id;
  const [activeId, setActiveId] = useState(defaultActive);
  const active = processSteps.find((s) => s.id === activeId) ?? processSteps[0];

  return (
    <section id="process" className={styles.process}>
      <div className="container">
        <Reveal className={styles.header}>
          <span className="eyebrow">Nasıl Çalışırım</span>
          <h2 className={styles.heading}>
            Güvenilir Teslimat İçin Odaklı Bir Süreç.
          </h2>
        </Reveal>

        <Reveal delay={0.1} className={styles.circles}>
          {processSteps.map((step) => {
            const isActive = step.id === activeId;
            return (
              <button
                key={step.id}
                type="button"
                className={`${styles.circle} ${isActive ? styles.circleActive : ""}`}
                onMouseEnter={() => setActiveId(step.id)}
                onFocus={() => setActiveId(step.id)}
              >
                {isActive && (
                  <motion.span
                    layoutId="process-ring"
                    className={styles.ring}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  />
                )}
                <span className={styles.circleLabel}>{step.label}</span>
              </button>
            );
          })}
        </Reveal>

        <div className={styles.footer}>
          <motion.p
            key={active.id}
            className={styles.description}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {active.description}
          </motion.p>
        </div>
      </div>
    </section>
  );
}
