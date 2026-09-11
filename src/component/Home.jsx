import reactLogo from "../assets/react.svg";
import viteLogo from "../assets/vite.svg";
import ProjectLinks from "./ProjectLinks.jsx";
import ActivityDashboard from "./analytics/ActivityDashboard.jsx";

function Home() {

  return (
    <div className="home-wrapper">
      <div className="home">
        <div
          className="home-logos animate-fade-in-up"
          style={{ animationDelay: "0.1s" }}
        >
          <a href="https://vite.dev" target="_blank" rel="noreferrer">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank" rel="noreferrer">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>

        <div
          className="home-intro animate-fade-in-up"
          style={{ animationDelay: "0.2s" }}
        >
          {/* The page had no h1 at all, so its outline started at h2 and a
              screen reader navigating by heading found nothing. This is
              already the most prominent text on the page; the styling is
              class-based, so nothing moves. */}
          <h1 className="home-tagline">A test project built with Vite + React.</h1>
          <p className="home-description">
            This is a personal sandbox for experimenting with React — a place to
            try out components, UI ideas, and small browser apps. Browse the tabs
            above: <strong>Projects</strong> for deployed apps and APIs built
            outside this sandbox, <strong>Utilities</strong> for tools like a
            fuel calculator and a Rubik's cube solver, and{" "}
            <strong>Games</strong> for mini-games like TicTacToe, Minesweeper,
            and Dice 21. The dashboard below is my GitHub activity for the last
            year.
          </p>
        </div>

        <div
          className="animate-fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          <ProjectLinks />
        </div>

        {/* Full-bleed within the centred column: .home centres its children,
            and the dashboard wants the width, not the centring. */}
        <div
          className="home-dashboard animate-fade-in-up"
          style={{ animationDelay: "0.4s" }}
        >
          <ActivityDashboard />
        </div>
      </div>
    </div>
  );
}

export default Home;
