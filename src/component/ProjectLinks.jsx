import { useState } from "react";

function ProjectLinks() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <div className="row">
        <div className="small-12 column">
          <div className="cta text-center">
            <a
              className="my-button cta-button"
              href="https://greentea524.github.io/portfolio/"
            >
              <i className="fa fa-folder fa-2x"></i> Portfolio
            </a>
          </div>
          <br></br>
          <div className="cta text-center">
            <a
              className="my-button cta-button"
              href="https://greentea524.github.io/minesweeper/"
            >
              <i className="fa fa-gamepad fa-2x"></i> Minesweeper
            </a>
          </div>
          <br></br>
          <div className="cta text-center">
            <a
              className="my-button cta-button"
              href="https://greentea524.github.io/game/js-2048-main/"
            >
              <i className="fa fa-gamepad fa-2x"></i> 2048
            </a>
          </div>
          <br></br>
          <div className="cta text-center">
            <a
              className="my-button cta-button"
              href="https://greentea524.github.io/game/wordle-clone-main/"
            >
              <i className="fa fa-gamepad fa-2x"></i> Wordle
            </a>
          </div>
          <br></br>
        </div>
      </div>
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
  );
}

export default ProjectLinks;
