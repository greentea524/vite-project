
import './App.css'
import About from './component/About';
import Home from './component/Home';
import Game from './component/boardgame.jsx';
import MyChart from './component/MyChart.jsx';
import { Route, BrowserRouter as Router, Routes, Navigate } from "react-router-dom";

function App() {

  return (

    <div className="App">
      
      <Routes>
          <Route path="/" element={<Navigate replace to="/home" />} />
          <Route path="/home" element={<Home />} />
          <Route path="/tictactoe" element={<Game />} />
          <Route path="/about" element={<About />} />
          <Route path="/chart" element={<MyChart />} />
      </Routes>

    </div>
  )
}

export default App
