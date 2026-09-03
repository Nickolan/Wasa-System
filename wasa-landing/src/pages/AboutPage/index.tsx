import { AboutWidget } from '@widgets/about'
import { FooterWidget } from '@widgets/footer'
import { PageShell } from '@shared/ui/PageShell'
import { PageHeader } from '@shared/ui/PageHeader'

/**
 * Página pública de información del proyecto (`about-page`): compone
 * `PageHeader` + `AboutWidget` + `FooterWidget`. Pública igual que
 * `HomePage` — sin muro de autenticación, sin lectura de sesión, sin
 * solicitud HTTP propia.
 *
 * El título "Acerca de WASA" (P-2, unified-design-system) corrige un
 * defecto real de accesibilidad: antes de este change la página no tenía
 * ningún `h1` — arrancaba directamente en los `h2` de `AboutWidget`. Usa
 * el mismo rótulo que el `Navbar` ya usa para llegar acá, sin inventar
 * copy nuevo.
 */
function AboutPage() {
  return (
    <PageShell>
      <PageHeader title="Acerca de WASA" />
      <AboutWidget />
      <FooterWidget />
    </PageShell>
  )
}

export default AboutPage
