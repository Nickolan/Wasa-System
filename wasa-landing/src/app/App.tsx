import { useEffect } from 'react'
import LandingPage from '@pages/LandingPage'
import { useAuthStore } from '@app/stores/authStore'
import { wireHttpClient } from '@app/providers/httpClientProvider'

function App() {
  // D-6: restores a persisted session, if any is still valid, from the
  // single point the spec requires. Runs after the first paint — see
  // design.md D-6 for the accepted one-frame not-yet-authenticated window.
  const hydrate = useAuthStore((state) => state.hydrate)

  useEffect(() => {
    // Same mount effect as hydrate() (design.md D-2, http-client): the
    // single point where the shared HTTP client gets wired to the session
    // store. configureApiClient only assigns module references, so running
    // this twice under StrictMode is a no-op in behavior.
    wireHttpClient()
    hydrate()
  }, [hydrate])

  return <LandingPage />
}

export default App
