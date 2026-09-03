import { useId } from 'react'
import { ABOUT_SECTIONS } from '../model/sections'

/**
 * Clases Tailwind planas concentradas acá (D-13 de CHANGE-19).
 */
const CONTAINER_CLASSES = 'mx-auto flex w-full max-w-3xl flex-col gap-16 px-6 py-24'
const SECTION_CLASSES = 'flex flex-col gap-4 text-slate-100'
const HEADING_CLASSES = 'text-2xl font-bold tracking-tight sm:text-3xl'
const PARAGRAPH_CLASSES = 'text-base leading-relaxed text-slate-400'

/**
 * Contenido informativo de `/about` (`about-page`): itera sobre
 * `ABOUT_SECTIONS`, sin literales de texto en el JSX. Cada sección es un
 * `<section>` con su propio encabezado — región identificable (spec
 * `about-page`: "cada uno en una sección identificable con su propio
 * encabezado").
 */
export function AboutWidget() {
  const headingIdPrefix = useId()

  return (
    <div className={CONTAINER_CLASSES}>
      {ABOUT_SECTIONS.map((section) => {
        const headingId = `${headingIdPrefix}-${section.id}`
        return (
          <section key={section.id} aria-labelledby={headingId} className={SECTION_CLASSES}>
            <h2 id={headingId} className={HEADING_CLASSES}>
              {section.title}
            </h2>
            {section.body.map((paragraph, index) => (
              <p key={`${section.id}-${index}`} className={PARAGRAPH_CLASSES}>
                {paragraph}
              </p>
            ))}
          </section>
        )
      })}
    </div>
  )
}
