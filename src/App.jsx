
import './App.css'
import About from './component/About';
import Home from './component/Home';
import Game from './component/boardgame.jsx';
import Chart from './component/mychart.jsx';
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";

function App() {

  return (

    <div className="App">
      
      <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tictactoe" element={<Game />} />
          <Route path="/about" element={<About />} />
          <Route path="/chart" element={<Chart />} />
      </Routes>

    </div>
  )
}

export default App
