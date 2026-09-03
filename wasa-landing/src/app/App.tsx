import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from '@pages/HomePage'
import ScanPage from '@pages/ScanPage'
import AboutPage from '@pages/AboutPage'
import DashboardPage from '@pages/DashboardPage'
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
        <Route path="/about" element={<AboutPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
