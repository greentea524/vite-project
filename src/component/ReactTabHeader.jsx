import React, { Component } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import Home from "./Home";
import TicTacToe from "./boardgame.jsx";
import Minesweeper from "./Minesweeper.jsx";
import DataAnalytics from "./DataAnalytics.jsx";
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
    description: "Fill the colorful 9×9 grid so every row, column, and box has 1–9.",
  },
  {
    key: "tictactoe",
    title: "TicTacToe",
    icon: "fa-th",
    description: "Classic 3×3 — get three in a row before your opponent.",
  },
];

const WEB_GAMES = [
  {
    title: "2048",
    href: "https://greentea524.github.io/game/js-2048-main/",
    description: "Slide numbered tiles to combine them and reach the 2048 tile.",
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
    description: "A role-playing boxing game where you train and fight opponents.",
  },
  {
    title: "Invasion",
    href: `${import.meta.env.BASE_URL}space/`,
    description: "Defend against waves of alien invaders. Features a multiplayer mode!",
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
];


class ReactTabHeader extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeKey: "home",
      selectedGame: null,
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
          <Tab eventKey="utilities" title="Utilities">
            <Tabs
              defaultActiveKey="fuelcalculator"
              id="utilities-subtab"
              className="mb-3"
              variant="tabs"
              justify
              unmountOnExit
            >
              <Tab eventKey="fuelcalculator" title="FuelCalculator">
                <FuelCalculator />
              </Tab>
              <Tab eventKey="analytics" title="Analytics">
                <DataAnalytics theme={this.props.theme} />
              </Tab>
              <Tab eventKey="hackerterminal" title="Hacker Terminal">
                <div className="utilities-launch">
                  <h6 className="utilities-launch-title">
                    <i className="fa fa-terminal" aria-hidden="true"></i> Hacker
                    Terminal
                  </h6>
                  <p className="utilities-launch-description">
                    A fake green-on-black hacker terminal feed for
                    screen-recordings and demos — auto-scrolling fake logs with
                    pause/resume and speed controls. Opens in a new tab so you
                    can run it fullscreen.
                  </p>
                  <a
                    className="utilities-launch-btn"
                    href={`${import.meta.env.BASE_URL}hacker-terminal.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i className="fa fa-play" aria-hidden="true"></i> Launch
                    terminal
                  </a>
                </div>
              </Tab>
              <Tab eventKey="fakeide" title="Fake IDE">
                <div className="utilities-launch">
                  <h6 className="utilities-launch-title">
                    <i className="fa fa-code" aria-hidden="true"></i> Fake IDE
                  </h6>
                  <p className="utilities-launch-description">
                    A fake IDE that codes by itself — realistic-looking
                    JavaScript, Python, C, and shell files type themselves out
                    in a dark editor, complete with typos and file switching.
                    Great for demos and screen recordings. Opens in a new tab
                    so you can run it fullscreen.
                  </p>
                  <a
                    className="utilities-launch-btn"
                    href={`${import.meta.env.BASE_URL}fake-ide.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i className="fa fa-play" aria-hidden="true"></i> Launch
                    fake IDE
                  </a>
                </div>
              </Tab>
              <Tab eventKey="rubikscube" title="Rubik's Cube">
                <RubiksCubeSolver />
              </Tab>
            </Tabs>
          </Tab>
          <Tab eventKey="othergames" title="Games">
            {this.state.selectedGame ? (
              <div className="games-layout">
                <button
                  type="button"
                  className="games-back-btn"
                  onClick={this.clearSelectedGame}
                >
                  <i className="fa fa-arrow-left" aria-hidden="true"></i> Back to
                  games
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
