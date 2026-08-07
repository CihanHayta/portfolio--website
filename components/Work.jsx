"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { projects } from "@/data/content";
import MediaFrame from "./MediaFrame";
import Reveal from "./Reveal";
import styles from "./Work.module.css";

const PAGE_SIZE = 4;

export default function Work() {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const current = projects.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const goPrev = () => setPage((p) => (p - 1 + pageCount) % pageCount);
  const goNext = () => setPage((p) => (p + 1) % pageCount);

  return (
    <section id="work" className={styles.work}>
      <div className="container">
        <div className={styles.header}>
          <Reveal className={styles.headerText}>
            <span className="eyebrow">Projeler</span>
            <h2 className={styles.heading}>
              Geliştirdiğim Bazı SaaS Ürünleri
            </h2>
          </Reveal>

          {pageCount > 1 && (
            <div className={styles.nav}>
              <button
                type="button"
                onClick={goPrev}
                className={styles.navBtn}
                aria-label="Önceki projeler"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                onClick={goNext}
                className={styles.navBtn}
                aria-label="Sonraki projeler"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            className={styles.grid}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {current.map((project) => (
              <a
                key={project.id}
                href={project.href || "#"}
                target={project.href && project.href !== "#" ? "_blank" : undefined}
                rel={project.href && project.href !== "#" ? "noreferrer" : undefined}
                className={styles.card}
              >
                <div className={styles.cardMedia}>
                  <MediaFrame
                    image={project.image}
                    alt={project.name}
                    Illustration={project.Illustration}
                    label={project.name}
                    tone="neutral"
                  />
                  <span className={styles.cardMediaIcon}>
                    <ArrowUpRight size={16} />
                  </span>
                </div>
                <div className={styles.cardHead}>
                  <h3 className={styles.cardName}>{project.name}</h3>
                  <span className={styles.cardYear}>{project.year}</span>
                </div>
                <p className={styles.cardDescription}>{project.description}</p>
                {project.tags?.length ? (
                  <div className={styles.tags}>
                    {project.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </a>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
