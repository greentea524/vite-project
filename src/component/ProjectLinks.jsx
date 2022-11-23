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
        </div>
      </div>
      <br></br>

    </div>
  );
}

export default ProjectLinks;
