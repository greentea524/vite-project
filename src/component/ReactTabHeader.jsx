import React, { Component } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import About from "./About";
import Home from "./Home";
import TicTacToe from "./boardgame.jsx";
import MyChart from "./MyChart.jsx";
import MyDataTable from "./datatables/MyDataTable.jsx";
import Minesweeper from "./Minesweeper.jsx";
import { newMineGame } from "./minesweeper/initGame.js";
import SomeChart from "./SomeChart";
import TestProject from "./TestProject";
import StateForm from "./form/StateForm";
import RefForm from "./form/RefForm";
import "./form/form.css";
import FuelCalculator from "./FuelCalculator.jsx";
import DiceBlackjack from "./DiceBlackjack.jsx";

class ReactTabHeader extends Component {
  constructor(props) {
    super(props);
    this.state = {
      apkPassword: "",
      isApkUnlocked: false,
      apkError: "",
    };
  }

  componentDidMount() {
    newMineGame();
  }

  handleApkPasswordChange = (event) => {
    this.setState({ apkPassword: event.target.value, apkError: "" });
  };

  unlockApkDownload = () => {
    const expectedPassword =
      import.meta.env.VITE_APK_PASSWORD || "apk-download-2026";

    if (this.state.apkPassword === expectedPassword) {
      this.setState({
        isApkUnlocked: true,
        apkError: "",
      });
      return;
    }

    this.setState({ apkError: "Incorrect password. Please try again." });
  };

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
          <Tab eventKey="fuelcalculator" title="FuelCalculator">
            <FuelCalculator />
          </Tab>
          <Tab eventKey="chart" title="Chart">
            <div>
              {/* <MyChart /> */}
              <SomeChart theme={this.props.theme} />
            </div>
          </Tab>
          <Tab eventKey="tictactoe" title="TicTacToe">
            <div className="d-flex justify-content-center">
              <TicTacToe />
            </div>
          </Tab>
          <Tab eventKey="othergames" title="Games">
            <div className="games-layout">
              <div className="games-section">
                <h6 className="games-section-title">Android App</h6>
                {!this.state.isApkUnlocked ? (
                  <div className="apk-gate">
                    <p className="apk-gate-text">
                      Enter password to unlock APK download
                    </p>
                    <div className="apk-gate-controls">
                      <input
                        type="password"
                        value={this.state.apkPassword}
                        onChange={this.handleApkPasswordChange}
                        placeholder="Password"
                        className="apk-password-input"
                        aria-label="APK password"
                      />
                      <button
                        type="button"
                        onClick={this.unlockApkDownload}
                        className="apk-unlock-btn"
                      >
                        Unlock
                      </button>
                    </div>
                    {this.state.apkError && (
                      <div className="apk-error" role="alert">
                        {this.state.apkError}
                      </div>
                    )}
                  </div>
                ) : (
                  <a
                    className="game-link apk-link"
                    href="https://greentea524.github.io/file/app-release.apk"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="APK download (opens in a new tab)"
                  >
                    <span>
                      <i className="fa fa-android" aria-hidden="true"></i>
                      Download APK
                    </span>
                    <i className="fa fa-external-link" aria-hidden="true"></i>
                  </a>
                )}
              </div>

              <div className="games-section">
                <h6 className="games-section-title">Web Games</h6>
                <div className="games-grid">
                  <a
                    className="game-link"
                    href="https://greentea524.github.io/game/js-2048-main/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="2048 (opens in a new tab)"
                  >
                    <span>
                      <i className="fa fa-gamepad" aria-hidden="true"></i> 2048
                    </span>
                    <i className="fa fa-external-link" aria-hidden="true"></i>
                  </a>
                  <a
                    className="game-link"
                    href="https://greentea524.github.io/game/wordle-clone-main/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Wordle (opens in a new tab)"
                  >
                    <span>
                      <i className="fa fa-gamepad" aria-hidden="true"></i>{" "}
                      Wordle
                    </span>
                    <i className="fa fa-external-link" aria-hidden="true"></i>
                  </a>
                  <a
                    className="game-link"
                    href="https://greentea524.github.io/game/js-alien-invasion/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Invasion (opens in a new tab)"
                  >
                    <span>
                      <i className="fa fa-gamepad" aria-hidden="true"></i>{" "}
                      Invasion
                    </span>
                    <i className="fa fa-external-link" aria-hidden="true"></i>
                  </a>
                  <a
                    className="game-link"
                    href="https://greentea524.github.io/game/js-pacman/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Pacman (opens in a new tab)"
                  >
                    <span>
                      <i className="fa fa-gamepad" aria-hidden="true"></i>{" "}
                      Pacman
                    </span>
                    <i className="fa fa-external-link" aria-hidden="true"></i>
                  </a>
                </div>
              </div>
            </div>
          </Tab>
          <Tab eventKey="minesweeper" title="Minesweeper">
            <div className="d-flex justify-content-center">
              <Minesweeper />
            </div>
          </Tab>
          <Tab eventKey="dice21" title="Dice 21">
            <div className="d-flex justify-content-center">
              <DiceBlackjack />
            </div>
          </Tab>
          <Tab eventKey="datatable" title="DataTables">
            <div className="d-flex justify-content-center">
              <MyDataTable />
            </div>
          </Tab>
          <Tab eventKey="stateform" title="Form">
            <div className="d-flex justify-content-center">
              <StateForm />
            </div>
          </Tab>
          <Tab eventKey="testproject" title="Test">
            <TestProject />
          </Tab>
        </Tabs>
      </div>
    );
  }
}

export default ReactTabHeader;
