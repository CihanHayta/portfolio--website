"use client";

import { motion } from "framer-motion";
import { Asterisk, ArrowDown } from "lucide-react";
import { profile, socials } from "@/data/content";
import styles from "./Hero.module.css";

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <motion.div
          className={styles.topRow}
          initial="hidden"
          animate="visible"
        >
          <motion.span className={styles.eyebrowName} variants={fadeUp} custom={0}>
            {profile.firstName}
          </motion.span>

          <motion.div className={styles.spinners} variants={fadeUp} custom={0.1}>
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              <Asterisk className={styles.spinIcon} />
            </motion.span>
            <motion.span
              animate={{ rotate: -360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            >
              <Asterisk className={styles.spinIcon} />
            </motion.span>
          </motion.div>
        </motion.div>

        <motion.h1
          className={styles.headline}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0.15}
        >
          {profile.lastNameDisplay}
        </motion.h1>

        <div className={styles.bottomRow}>
          <motion.div
            className={styles.contactCol}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0.3}
          >
            <a href={`mailto:${profile.email}`} className={styles.contactLink}>
              {profile.email}
            </a>
          

            <div className={styles.socialRow}>
              {socials.map(({ name, href, Icon }) => (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={name}
                  className={styles.socialLink}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </a>
              ))}
            </div>
          </motion.div>

          <motion.div
            className={styles.textCol}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0.4}
          >
            <p className={styles.bio}>{profile.bio}</p>
            <a href="#services" className={`btn btnDark ${styles.discoverBtn}`}>
              Keşfet
              <ArrowDown size={16} />
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
