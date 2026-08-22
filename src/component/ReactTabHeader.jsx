import React, { Component } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import Home from "./Home";
import TicTacToe from "./boardgame.jsx";
import Minesweeper from "./Minesweeper.jsx";
import DataAnalytics from "./DataAnalytics.jsx";
import GitHubCommitsChart from "./GitHubCommitsChart.jsx";
import FuelCalculator from "./FuelCalculator.jsx";
import DiceBlackjack from "./DiceBlackjack.jsx";
import Sudoku from "./Sudoku.jsx";
import RubiksCubeSolver from "./rubiks/RubiksCubeSolver.jsx";

const LOCAL_GAMES = [
  {
    key: "minesweeper",
    title: "Minesweeper",
    icon: "fa-bomb",
    description: "Clear the board without detonating the hidden mines.",
  },
  {
    key: "dice21",
    title: "Dice 21",
    icon: "fa-cubes",
    description: "Roll toward 21 without busting in this dice blackjack.",
  },
  {
    key: "sudoku",
    title: "Sudoku",
    icon: "fa-table",
    description:
      "Fill the colorful 9×9 grid so every row, column, and box has 1–9.",
  },
  {
    key: "tictactoe",
    title: "TicTacToe",
    icon: "fa-th",
    description: "Classic 3×3 — get three in a row before your opponent.",
  },
];

// Separately deployed applications, as opposed to the Utilities tab, which is
// things that run inside this sandbox. `source` is optional and renders as a
// second link under the description — the repo is where the design decisions
// are written down, which is the part that reads as ownership.
const APPLICATIONS = [
  {
    title: "Blog",
    icon: "fa-pencil",
    href: "https://greentea524.github.io/nextjs-blog/",
    description:
      "A statically generated blog built with Next.js, using dynamic routes and markdown-backed posts.",
  },
  {
    title: "Baby Tracker",
    icon: "fa-child",
    href: "https://baby-6f5b0.web.app",
    description:
      "Flutter web PWA for tracking a baby's feeding, diaper changes, and growth. Google sign-in with real-time sync across caregivers via Firebase Auth and Firestore.",
  },
  {
    title: "React Kanban Board",
    icon: "fa-columns",
    href: "https://greentea524.github.io/react-kanban-board/",
    source: "https://github.com/greentea524/react-kanban-board",
    description:
      "Interactive drag-and-drop Kanban board built with React 19, Tailwind CSS, and @dnd-kit, featuring keyboard accessibility and persistent local storage.",
  },
  {
    title: "Svelte Markdown Editor",
    icon: "fa-file-text-o",
    href: "https://greentea524.github.io/svelte-markdown-editor/",
    source: "https://github.com/greentea524/svelte-markdown-editor",
    description:
      "Real-time dual-pane markdown editor built with Svelte 5 runes and Vite, featuring syntax highlighting, export to Markdown/HTML, and custom themes.",
  },
  {
    title: "Vue Recipe Finder",
    icon: "fa-cutlery",
    href: "https://greentea524.github.io/vue-recipe-finder/",
    source: "https://github.com/greentea524/vue-recipe-finder",
    description:
      "Recipe discovery application built with Vue 3 and TheMealDB API, featuring keyword search, category filters, ingredient checklists, and video guides.",
  },
];

const SERVICES = [
  {
    title: "Expense Tracker API",
    icon: "fa-server",
    href: "https://expense-tracker-api-e7lw.onrender.com/docs",
    source: "https://github.com/greentea524/expense-tracker-api",
    description:
      "A REST API with JWT auth and per-user expense CRUD — Node, Express, Prisma and PostgreSQL, deployed on Render with migrations running at build time. The link opens interactive Swagger docs where you can authorize and call the live service.",
    // Free tier sleeps after 15 minutes idle. Unwarned, a ~60s cold start reads
    // as a broken link — the one link meant to show backend work.
    note: "Hosted on a free tier, so the first request may take up to a minute to wake.",
  },
];

const WEB_GAMES = [
  {
    title: "2048",
    href: "https://greentea524.github.io/game/js-2048-main/",
    description:
      "Slide numbered tiles to combine them and reach the 2048 tile.",
  },
  {
    title: "Wordle",
    href: "https://greentea524.github.io/game/wordle-clone-main/",
    description: "Guess the hidden 5-letter word in 6 attempts.",
  },
  {
    title: "Pacman",
    href: "https://greentea524.github.io/game/js-pacman/",
    description: "Navigate a maze, eat dots, and avoid ghosts.",
  },
  {
    title: "Boxing RPG",
    href: "https://greentea524.github.io/game/js-boxing/",
    description:
      "A role-playing boxing game where you train and fight opponents.",
  },
  {
    title: "Invasion",
    href: `${import.meta.env.BASE_URL}space/`,
    description:
      "Defend against waves of alien invaders. Features a multiplayer mode!",
  },
  {
    title: "Platformer",
    href: `${import.meta.env.BASE_URL}platformer/`,
    description:
      "A 2D side-scrolling adventure featuring a multiplayer 'Race a friend' mode.",
  },
  {
    title: "Big 2",
    href: `${import.meta.env.BASE_URL}big2/`,
    description: "Shed all 13 cards first in this classic climbing card game.",
  },
  {
    title: "Lantern Keeper",
    href: "https://greentea524.github.io/games/lantern-keeper/",
    description:
      "A fantasy adventure game where you light the way through dark forests.",
  },
];

class ReactTabHeader extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeKey: "home",
      selectedGame: null,
      selectedUtility: null,
    };
  }

  handleTabSelect = (key) => {
    this.setState({ activeKey: key });
  };

  selectGame = (key) => {
    this.setState({ selectedGame: key });
  };

  clearSelectedGame = () => {
    this.setState({ selectedGame: null });
  };

  renderActiveGame() {
    switch (this.state.selectedGame) {
      case "tictactoe":
        return <TicTacToe />;
      case "minesweeper":
        return <Minesweeper />;
      case "dice21":
        return <DiceBlackjack />;
      case "sudoku":
        return <Sudoku />;
      default:
        return null;
    }
  }

  renderProjectSection(title, projects) {
    return (
      <div className="games-section">
        <h6 className="games-section-title">{title}</h6>
        <div className="games-grid">
          {projects.map((project) => (
            <div className="game-card" key={project.title}>
              <a
                className="game-link"
                href={project.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${project.title} (opens in a new tab)`}
              >
                <span className="game-link-title-row">
                  <i className={`fa ${project.icon}`} aria-hidden="true"></i>{" "}
                  {project.title}
                </span>
                <i className="fa fa-external-link" aria-hidden="true"></i>
              </a>
              <p className="game-link-description">
                {project.description}
                {project.note && (
                  <>
                    {" "}
                    <em>{project.note}</em>
                  </>
                )}
              </p>
              {project.source && (
                <p className="project-source">
                  <a
                    href={project.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${project.title} source on GitHub (opens in a new tab)`}
                  >
                    <i className="fa fa-code" aria-hidden="true"></i> View source
                  </a>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  render() {
    return (
      <div className="tabs-shell">
        <Tabs
          activeKey={this.state.activeKey}
          onSelect={this.handleTabSelect}
          id="fill-tab"
          className="mb-3 px-3"
          variant="pills"
          fill
          unmountOnExit
        >
          <Tab eventKey="home" title="Home">
            <Home />
          </Tab>
          {/* <Tab eventKey="profile" title="About">
            <About />
          </Tab> */}
          <Tab eventKey="projects" title="Projects">
            <div className="games-layout">
              {this.renderProjectSection("Applications", APPLICATIONS)}
              {this.renderProjectSection("APIs & Services", SERVICES)}
            </div>
          </Tab>
          <Tab eventKey="utilities" title="Utilities">
            {this.state.selectedUtility ? (
              <div className="games-layout">
                <button
                  type="button"
                  className="games-back-btn"
                  onClick={() => this.setState({ selectedUtility: null })}
                >
                  <i className="fa fa-arrow-left" aria-hidden="true"></i> Back
                  to utilities
                </button>
                <div className="d-flex justify-content-center">
                  {this.state.selectedUtility === "fuelcalculator" && (
                    <FuelCalculator />
                  )}
                  {this.state.selectedUtility === "analytics" && (
                    <DataAnalytics theme={this.props.theme} />
                  )}
                  {this.state.selectedUtility === "rubikscube" && (
                    <RubiksCubeSolver />
                  )}
                  {this.state.selectedUtility === "githubactivity" && (
                    <GitHubCommitsChart theme={this.props.theme} />
                  )}
                </div>
              </div>
            ) : (
              <div className="games-layout">
                <div className="games-section">
                  <h6 className="games-section-title">Tools</h6>
                  <div className="games-grid">
                    <div className="game-card">
                      <button
                        type="button"
                        className="game-link"
                        onClick={() =>
                          this.setState({ selectedUtility: "fuelcalculator" })
                        }
                        aria-label="Open Fuel Calculator"
                      >
                        <span className="game-link-title-row">
                          <i
                            className="fa fa-tachometer"
                            aria-hidden="true"
                          ></i>{" "}
                          Fuel Calculator
                        </span>
                        <i className="fa fa-play" aria-hidden="true"></i>
                      </button>
                      <p className="game-link-description">
                        Calculate fuel cost and efficiency for your trips with
                        real-time unit conversions.
                      </p>
                    </div>
                    <div className="game-card">
                      <button
                        type="button"
                        className="game-link"
                        onClick={() =>
                          this.setState({ selectedUtility: "analytics" })
                        }
                        aria-label="Open Analytics"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-bar-chart" aria-hidden="true"></i>{" "}
                          Analytics
                        </span>
                        <i className="fa fa-play" aria-hidden="true"></i>
                      </button>
                      <p className="game-link-description">
                        Interactive data analytics dashboard with charts,
                        tables, and export options.
                      </p>
                    </div>
                    <div className="game-card">
                      <button
                        type="button"
                        className="game-link"
                        onClick={() =>
                          this.setState({ selectedUtility: "rubikscube" })
                        }
                        aria-label="Open Rubik's Cube Solver"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-cube" aria-hidden="true"></i>{" "}
                          Rubik's Cube
                        </span>
                        <i className="fa fa-play" aria-hidden="true"></i>
                      </button>
                      <p className="game-link-description">
                        3D Rubik's Cube solver — input your cube state and get
                        an optimal solution.
                      </p>
                    </div>
                    <div className="game-card">
                      <button
                        type="button"
                        className="game-link"
                        onClick={() =>
                          this.setState({ selectedUtility: "githubactivity" })
                        }
                        aria-label="Open GitHub Activity"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-github" aria-hidden="true"></i>{" "}
                          GitHub Activity
                        </span>
                        <i className="fa fa-play" aria-hidden="true"></i>
                      </button>
                      <p className="game-link-description">
                        Daily contribution history as a GitHub-style calendar
                        heatmap with a rolling trend view.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="games-section">
                  <h6 className="games-section-title">Demos</h6>
                  <div className="games-grid">
                    <div className="game-card">
                      <a
                        className="game-link"
                        href={`${import.meta.env.BASE_URL}hacker-terminal.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Hacker Terminal (opens in a new tab)"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-terminal" aria-hidden="true"></i>{" "}
                          Hacker Terminal
                        </span>
                        <i
                          className="fa fa-external-link"
                          aria-hidden="true"
                        ></i>
                      </a>
                      <p className="game-link-description">
                        A fake green-on-black hacker terminal feed for
                        screen-recordings and demos — auto-scrolling fake logs
                        with pause/resume and speed controls.
                      </p>
                    </div>
                    <div className="game-card">
                      <a
                        className="game-link"
                        href={`${import.meta.env.BASE_URL}fake-ide.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Fake IDE (opens in a new tab)"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-code" aria-hidden="true"></i> Fake
                          IDE
                        </span>
                        <i
                          className="fa fa-external-link"
                          aria-hidden="true"
                        ></i>
                      </a>
                      <p className="game-link-description">
                        A fake IDE that codes by itself — realistic-looking
                        JavaScript, Python, C, and shell files type themselves
                        out in a dark editor, complete with typos and file
                        switching.
                      </p>
                    </div>
                    <div className="game-card">
                      <a
                        className="game-link"
                        href={`${import.meta.env.BASE_URL}fake-file-transfer.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Fake File Transfer (opens in a new tab)"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-exchange" aria-hidden="true"></i>{" "}
                          Fake File Transfer
                        </span>
                        <i
                          className="fa fa-external-link"
                          aria-hidden="true"
                        ></i>
                      </a>
                      <p className="game-link-description">
                        A retro scp-style file transfer screen — multiple
                        downloads and uploads with progress bars, transfer
                        speeds, ETAs, and completion checkmarks. Auto-runs for
                        screen recordings.
                      </p>
                    </div>
                    <div className="game-card">
                      <a
                        className="game-link"
                        href={`${import.meta.env.BASE_URL}fake-deploy.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Fake Deploy Dashboard (opens in a new tab)"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-server" aria-hidden="true"></i>{" "}
                          Fake Deploy
                        </span>
                        <i
                          className="fa fa-external-link"
                          aria-hidden="true"
                        ></i>
                      </a>
                      <p className="game-link-description">
                        A simulated CI/CD deploy pipeline dashboard — showing
                        live build steps, unit tests (with retries), Docker
                        pushes, Kubernetes rolling rollout, and deployment logs.
                      </p>
                    </div>
                    <div className="game-card">
                      <a
                        className="game-link"
                        href={`${import.meta.env.BASE_URL}fake-db-console.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Fake Database Console (opens in a new tab)"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-database" aria-hidden="true"></i>{" "}
                          Fake DB Console
                        </span>
                        <i
                          className="fa fa-external-link"
                          aria-hidden="true"
                        ></i>
                      </a>
                      <p className="game-link-description">
                        A PostgreSQL-style console that auto-types SQL queries
                        with syntax highlighting, renders result tables, EXPLAIN
                        ANALYZE plans, transactions, and occasional errors.
                      </p>
                    </div>
                    <div className="game-card">
                      <a
                        className="game-link"
                        href={`${import.meta.env.BASE_URL}fake-sysmon.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Fake System Monitor (opens in a new tab)"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-desktop" aria-hidden="true"></i>{" "}
                          Fake System Monitor
                        </span>
                        <i
                          className="fa fa-external-link"
                          aria-hidden="true"
                        ></i>
                      </a>
                      <p className="game-link-description">
                        A terminal-style system monitor (htop clone) featuring
                        live-updating CPU core bars, memory and swap usage,
                        network I/O sparklines, and a dynamic process list
                        sorting by CPU usage.
                      </p>
                    </div>
                    <div className="game-card">
                      <a
                        className="game-link"
                        href={`${import.meta.env.BASE_URL}fake-git-history.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Fake Git History (opens in a new tab)"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-code-fork" aria-hidden="true"></i>{" "}
                          Fake Git History
                        </span>
                        <i
                          className="fa fa-external-link"
                          aria-hidden="true"
                        ></i>
                      </a>
                      <p className="game-link-description">
                        A busy open-source repository simulation featuring live
                        commit streams, animated GitHub contribution heatmap
                        graphs, and real-time PR merge & CI build events.
                      </p>
                    </div>
                    <div className="game-card">
                      <a
                        className="game-link"
                        href={`${import.meta.env.BASE_URL}fake-netscan.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Fake Network Scanner (opens in a new tab)"
                      >
                        <span className="game-link-title-row">
                          <i className="fa fa-wifi" aria-hidden="true"></i> Fake
                          Network Scanner
                        </span>
                        <i
                          className="fa fa-external-link"
                          aria-hidden="true"
                        ></i>
                      </a>
                      <p className="game-link-description">
                        An nmap-style terminal network scanner simulating subnet
                        ARP discovery, port probes (HTTP, SSH, MySQL, Postgres,
                        K8s), OS fingerprinting, and live target cards.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Tab>
          <Tab eventKey="othergames" title="Games">
            {this.state.selectedGame ? (
              <div className="games-layout">
                <button
                  type="button"
                  className="games-back-btn"
                  onClick={this.clearSelectedGame}
                >
                  <i className="fa fa-arrow-left" aria-hidden="true"></i> Back
                  to games
                </button>
                <div className="d-flex justify-content-center">
                  {this.renderActiveGame()}
                </div>
              </div>
            ) : (
              <div className="games-layout">
                <div className="games-section">
                  <h6 className="games-section-title">Mini Games</h6>
                  <div className="games-grid">
                    {LOCAL_GAMES.map((game) => (
                      <div className="game-card" key={game.key}>
                        <button
                          type="button"
                          className="game-link"
                          onClick={() => this.selectGame(game.key)}
                          aria-label={`Play ${game.title}`}
                        >
                          <span className="game-link-title-row">
                            <i
                              className={`fa ${game.icon}`}
                              aria-hidden="true"
                            ></i>{" "}
                            {game.title}
                          </span>
                          <i className="fa fa-play" aria-hidden="true"></i>
                        </button>
                        <p className="game-link-description">
                          {game.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="games-section">
                  <h6 className="games-section-title">Web Games</h6>
                  <div className="games-grid">
                    {WEB_GAMES.map((game) => (
                      <div className="game-card" key={game.title}>
                        <a
                          className="game-link"
                          href={game.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${game.title} (opens in a new tab)`}
                        >
                          <span className="game-link-title-row">
                            <i className="fa fa-gamepad" aria-hidden="true"></i>{" "}
                            {game.title}
                          </span>
                          <i
                            className="fa fa-external-link"
                            aria-hidden="true"
                          ></i>
                        </a>
                        <p className="game-link-description">
                          {game.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Tab>
        </Tabs>
      </div>
    );
  }
}

export default ReactTabHeader;
