import { Routes, Route } from 'react-router-dom'
import ThreeScene from './components/ThreeScene'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ThreeScene />} />
    </Routes>
  )
}

export default App
