"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { services } from "@/data/content";
import MediaFrame from "./MediaFrame";
import Reveal from "./Reveal";
import styles from "./Services.module.css";

export default function Services() {
  const [openId, setOpenId] = useState(services[0]?.id ?? null);

  return (
    <section id="services" className={styles.services}>
      <div className="container">
        <div className={styles.header}>
          <Reveal>
            <span className="eyebrow">Hizmet</span>
          </Reveal>
          <div className={styles.headerGrid}>
            <Reveal delay={0.05}>
              <h2 className={styles.heading}>Ölçeklenebilir Ürünler Geliştiriyorum</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className={styles.subtext}>
                İlk fikirden production&apos;a çıkışa kadar — işle birlikte
                büyüyen sağlam mimariler, temiz arayüzler ve güvenilir
                sistemler tasarlıyorum.
              </p>
            </Reveal>
          </div>
        </div>

        <div className={styles.list}>
          {services.map((service, i) => {
            const isOpen = openId === service.id;
            const Icon = service.Icon;

            return (
              <Reveal key={service.id} delay={i * 0.05}>
                <div className={`${styles.row} ${isOpen ? styles.rowOpen : ""}`}>
                  <button
                    type="button"
                    className={styles.rowHeader}
                    onClick={() => setOpenId(isOpen ? null : service.id)}
                    aria-expanded={isOpen}
                  >
                    <span className={styles.rowNumber}>{service.id}</span>
                    <span className={styles.rowTitle}>{service.title}</span>
                    <span className={styles.rowAction}>
                      Detayları Gör
                      <ArrowUpRight size={13} />
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        className={styles.rowBody}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className={styles.rowBodyInner}>
                          <div className={styles.rowMedia}>
                            <MediaFrame
                              image={service.image}
                              Icon={Icon}
                              Illustration={service.Illustration}
                              label={service.title}
                              tone="dark"
                              alt={service.title}
                            />
                          </div>
                          <p className={styles.rowDescription}>
                            {service.description}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
