"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { projects } from "@/data/content";
import MediaFrame from "./MediaFrame";
import ProjectVideo from "./ProjectVideo";
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
            {current.map((project) => {
              const isLive = Boolean(project.href && project.href !== "#");
              return (
                <article key={project.id} className={styles.card}>
                  <div className={styles.cardMedia}>
                    {project.video ? (
                      <ProjectVideo
                        src={project.video}
                        poster={project.poster}
                        alt={project.posterAlt ?? project.name}
                        label={project.name}
                      />
                    ) : (
                      <MediaFrame
                        image={project.image}
                        alt={project.name}
                        Illustration={project.Illustration}
                        label={project.name}
                        tone="neutral"
                      />
                    )}
                    {isLive ? (
                      <span className={styles.cardMediaIcon} aria-hidden="true">
                        <ArrowUpRight size={16} />
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardName}>{project.name}</h3>
                    <span className={styles.cardYear}>{project.year}</span>
                  </div>
                  <p className={styles.cardDescription}>{project.description}</p>
                  {project.tags?.length ? (
                    <ul className={styles.tags} aria-label="Kullanılan teknolojiler">
                      {project.tags.map((tag) => (
                        <li key={tag} className={styles.tag} lang="en">
                          {tag}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {isLive ? (
                    <a
                      href={project.href}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.cardLink}
                      aria-label={`${project.name} projesini incele (yeni sekmede açılır)`}
                    >
                      Projeyi İncele
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </a>
                  ) : null}
                </article>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
