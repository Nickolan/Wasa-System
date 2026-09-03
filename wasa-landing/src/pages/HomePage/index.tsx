import { HeroWidget } from '@widgets/hero'
import { FeaturesWidget } from '@widgets/features-section'
import { HowItWorksWidget } from '@widgets/how-it-works'
import { FooterWidget } from '@widgets/footer'
import { PageShell } from '@shared/ui/PageShell'

/**
 * Página de presentación pública de WASA: Hero → Features → HowItWorks → Footer.
 * Solo contenido informativo — el formulario de escaneo vive en ScanPage.
 * Sin `PageHeader` (D-10): el `HeroWidget` ya provee su propio `h1`.
 */
function HomePage() {
  return (
    <PageShell>
      <HeroWidget />
      <FeaturesWidget />
      <HowItWorksWidget />
      <FooterWidget />
    </PageShell>
  )
}

export default HomePage
