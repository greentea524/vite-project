import { useState } from 'react'
import reactLogo from '../assets/react.svg'
import { Link } from "react-router-dom"
function Home() {
    const [count, setCount] = useState(0);

    return (
  
      <div>
        <div>
          <a href="https://vitejs.dev" target="_blank">
            <img src="vite.svg" className="logo" alt="Vite logo" />
          </a>
          <a href="https://reactjs.org" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>
        <h1>Vite + React</h1>

        <div className="cardcounter">
          <button className="btn btn-primary" onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>
        </div>
        <br></br>
        <Link to="/tictactoe">
          TicTacToe
        </Link>
        
      </div>
    )
}

export default Home;
