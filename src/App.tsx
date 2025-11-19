import { Routes, Route } from 'react-router-dom'
import ThreeScene from './components/ThreeScene'
import PointCloudViewer from './components/PointCloudViewer'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ThreeScene />} />
      <Route path="/pointcloud" element={<PointCloudViewer />} />
    </Routes>
  )
}

export default App
