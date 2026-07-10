import { useEffect, useState } from "react";
import reactLogo from "../assets/react.svg";
import viteLogo from "../assets/vite.svg";
import ProjectLinks from "./ProjectLinks.jsx";

function Home() {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const splashTimer = setTimeout(() => setLoading(false), 500);
    return () => {
      clearTimeout(splashTimer);
    };
  }, []);

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
          <p className="home-tagline">A test project built with Vite + React.</p>
          <p className="home-description">
            This is a personal sandbox for experimenting with React — a place to
            try out components, UI ideas, and small browser apps. Browse the tabs
            above to explore a fuel calculator, data analytics charts, and a few
            mini-games like TicTacToe, Minesweeper, and Dice 21.
          </p>
        </div>

        {loading ? (
          <output className="spinner-border text-success" aria-live="polite">
            <span className="sr-only">Loading...</span>
          </output>
        ) : (
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: "0.3s" }}
          >
            <ProjectLinks />
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
