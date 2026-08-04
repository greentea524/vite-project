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
          className="my-button cta-button"
          href="https://greentea524.github.io/games/"
          target="_blank"
          rel="noreferrer"
        >
          <i className="fa fa-gamepad"></i> Web Games
        </a>
        <a
          className="my-button cta-button"
          href="https://greentea524.github.io/nextjs-blog/"
          target="_blank"
          rel="noreferrer"
        >
          <i className="fa fa-pencil"></i> Blog
        </a>
        <a
          className="my-button cta-button"
          href="https://baby-6f5b0.web.app"
          target="_blank"
          rel="noreferrer"
        >
          <i className="fa fa-child"></i> Baby Tracker
        </a>
        {/*
          The API sleeps after 15 minutes idle on Render's free tier, so a cold
          first load can take about a minute. Without the warning in the title,
          that reads as a broken link.
        */}
        <a
          className="my-button cta-button"
          href="https://expense-tracker-api-e7lw.onrender.com/docs"
          target="_blank"
          rel="noreferrer"
          title="Live REST API — interactive Swagger docs. Hosted on a free tier, so the first load may take up to a minute to wake."
        >
          <i className="fa fa-server"></i> Expense API
        </a>
        {/*
          Paired with the docs link above. Swagger UI shows what the API does;
          the README is where the design decisions are written down, which is
          the part that reads as ownership rather than just a deployed URL.
        */}
        <a
          className="my-button cta-button"
          href="https://github.com/greentea524/expense-tracker-api"
          target="_blank"
          rel="noreferrer"
          title="Source for the Expense API — Node, Express, Prisma and PostgreSQL, with the design decisions written up in the README."
        >
          <i className="fa fa-code"></i> API Source
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
