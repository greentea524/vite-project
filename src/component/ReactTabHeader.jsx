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
import Platformer from "./platformer/Platformer.jsx";

const LOCAL_GAMES = [
  {
    key: "tictactoe",
    title: "TicTacToe",
    icon: "fa-th",
    description: "Classic 3×3 — get three in a row before your opponent.",
  },
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
    key: "platformer",
    title: "Platformer",
    icon: "fa-gamepad",
    description: "Run, double-jump, and stomp through six levels across two worlds.",
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
    title: "Invasion",
    href: "https://greentea524.github.io/game/js-alien-invasion/",
    description: "Defend against waves of alien invaders.",
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
];

class ReactTabHeader extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedGame: null,
    };
  }

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
      case "platformer":
        return <Platformer />;
      default:
        return null;
    }
  }

  render() {
    return (
      <div className="tabs-shell">
        <Tabs
          defaultActiveKey="home"
          id="fill-tab"
          className="mb-3 px-3"
          variant="pills"
          fill
        >
          <Tab eventKey="home" title="Home">
            <Home />
          </Tab>
          {/* <Tab eventKey="profile" title="About">
            <About />
          </Tab> */}
          <Tab eventKey="utility" title="Utility">
            <Tabs
              defaultActiveKey="fuelcalculator"
              id="utility-subtab"
              className="mb-3"
              variant="tabs"
              justify
            >
              <Tab eventKey="fuelcalculator" title="FuelCalculator">
                <FuelCalculator />
              </Tab>
              <Tab eventKey="analytics" title="Analytics">
                <DataAnalytics theme={this.props.theme} />
              </Tab>
              <Tab eventKey="hackerterminal" title="Hacker Terminal">
                <div className="utility-launch">
                  <h6 className="utility-launch-title">
                    <i className="fa fa-terminal" aria-hidden="true"></i> Hacker
                    Terminal
                  </h6>
                  <p className="utility-launch-description">
                    A fake green-on-black hacker terminal feed for
                    screen-recordings and demos — auto-scrolling fake logs with
                    pause/resume and speed controls. Opens in a new tab so you
                    can run it fullscreen.
                  </p>
                  <a
                    className="utility-launch-btn"
                    href={`${import.meta.env.BASE_URL}hacker-terminal.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i className="fa fa-play" aria-hidden="true"></i> Launch
                    terminal
                  </a>
                </div>
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
