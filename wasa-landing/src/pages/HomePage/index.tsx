import { HeroWidget } from '@widgets/hero'
import { FeaturesWidget } from '@widgets/features-section'
import { HowItWorksWidget } from '@widgets/how-it-works'
import { FooterWidget } from '@widgets/footer'

/**
 * Página de presentación pública de WASA: Hero → Features → HowItWorks → Footer.
 * Solo contenido informativo — el formulario de escaneo vive en ScanPage.
 */
function HomePage() {
  return (
    <main className="flex min-h-screen w-full flex-col bg-slate-950">
      <HeroWidget />
      <FeaturesWidget />
      <HowItWorksWidget />
      <FooterWidget />
    </main>
  )
}

export default HomePage
