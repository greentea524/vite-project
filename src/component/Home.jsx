import { useState } from "react";
import reactLogo from "../assets/react.svg";
import viteLogo from "../assets/vite.svg";
import ProjectLinks from './ProjectLinks.jsx';
function Home() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://reactjs.org" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      {/* <div className="cardcounter">
        <button
          className="btn btn-primary"
          onClick={() => setCount((count) => count + 1)}
        >
          count is {count}
        </button>
      </div> */}
      <br></br>
      <ProjectLinks />

      <div className="footer-div">
        <p className={"footer-text"}>
          Experimental page using React
          <br></br>
          <a href="https://greentea524.github.io/">
           https://greentea524.github.io/
          </a>
        </p>
        <div className="row">
        <div className="small-12 column">
          <div className="my-arrow-div text-center">
            <a href="https://github.com/greentea524" target="_blank">
              <i className="fa fa-github-alt fa-2x"></i>
            </a>
            <a href="https://www.twitter.com/davidphong_" target="_blank">
              <i className="fa fa-twitter fa-2x"></i>
            </a>
          </div>
        </div>
      </div>
      </div>

    </div>
  );
}

export default Home;
