function ProjectLinks() {
  return (
    <div className="home-links">
      <div className="home-buttons">
        <a
          className="my-button cta-button"
          href="https://greentea524.github.io/portfolio/"
          target="_blank"
          rel="noreferrer"
        >
          <i className="fa fa-folder"></i> Portfolio
        </a>
        <a
          className="my-button"
          href={`${import.meta.env.BASE_URL}platformer/`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className="fa fa-gamepad"></i> Platformer
        </a>
      </div>

      <div className="home-social">
        <a
          href="https://github.com/greentea524"
          target="_blank"
          rel="noreferrer"
          aria-label="Visit GitHub profile"
        >
          <i className="fa fa-github-alt fa-2x"></i>
        </a>
        <a
          href="https://www.twitter.com/davidphong_"
          target="_blank"
          rel="noreferrer"
          aria-label="Visit Twitter profile"
        >
          <i className="fa fa-twitter fa-2x"></i>
        </a>
      </div>
    </div>
  );
}

export default ProjectLinks;
