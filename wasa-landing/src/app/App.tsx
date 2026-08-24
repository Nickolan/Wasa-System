import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from '@pages/HomePage'
import ScanPage from '@pages/ScanPage'
import { Navbar } from '@widgets/navbar'
import { useAuthStore } from '@entities/user'
import { wireHttpClient } from '@app/providers/httpClientProvider'

function App() {
  const hydrate = useAuthStore((state) => state.hydrate)

  useEffect(() => {
    wireHttpClient()
    hydrate()
  }, [hydrate])

  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scan" element={<ScanPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
