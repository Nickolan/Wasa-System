import { useEffect } from 'react'
import LandingPage from '@pages/LandingPage'
import { useAuthStore } from '@app/stores/authStore'

function App() {
  // D-6: restores a persisted session, if any is still valid, from the
  // single point the spec requires. Runs after the first paint — see
  // design.md D-6 for the accepted one-frame not-yet-authenticated window.
  const hydrate = useAuthStore((state) => state.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return <LandingPage />
}

export default App
