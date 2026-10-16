"use client";

import { useState } from "react";
import { HOME_ICONS } from "./icons";
import styles from "./home.module.css";

// Solda numaralı adımlar, sağda basamak basamak dizilen adım etiketleri.
// Fareyle ya da klavyeyle bir adıma gelindiğinde eşleşen etiket öne çıkar.
export default function MethodSteps({ steps }) {
  const [active, setActive] = useState(steps.length - 1);

  return (
    <div className={styles.methodGrid}>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={styles.step}
            data-active={active === index}
            tabIndex={0}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
          >
            <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepText}>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.ladder} aria-hidden="true">
        {steps.map((step, index) => {
          const Icon = HOME_ICONS[step.icon];
          return (
            <div
              key={step.title}
              className={styles.rung}
              data-active={active === index}
              style={{ "--rung": index }}
            >
              {Icon ? <Icon size={16} /> : null}
              {step.short}
            </div>
          );
        })}
      </div>
    </div>
  );
}
