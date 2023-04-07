import React, { Component } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import About from "./About";
import Home from "./Home";
import TicTacToe from "./boardgame.jsx";
import MyChart from "./MyChart.jsx";
import MyDataTable from "./datatables/MyDataTable.jsx";
import { Minesweeper, newMineGame } from "./Minesweeper.jsx";
import SomeChart from "./SomeChart";

class ReactTabHeader extends Component {
  componentDidMount() {
    newMineGame();
  }
  render() {
    return (
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
        <Tab eventKey="profile" title="Profile">
          <About />
        </Tab>
        <Tab eventKey="chart" title="Chart">
          <div>
            {/* <MyChart /> */}
            <SomeChart />
          </div>
        </Tab>
        <Tab eventKey="tictactoe" title="TicTacToe">
          <div className="d-flex justify-content-center">
            <TicTacToe />
          </div>
        </Tab>
        <Tab eventKey="othergames" title="Games">
          <div className="d-flex justify-content-center">
          <div className="cta text-center">
            <a
              className="my-button cta-button"
              href="https://greentea524.github.io/game/js-2048-main/"
            >
              <i className="fa fa-gamepad fa-2x"></i> 2048
            </a>
          </div>
          <div className="cta text-center">
            <a
              className="my-button cta-button"
              href="https://greentea524.github.io/game/wordle-clone-main/"
            >
              <i className="fa fa-gamepad fa-2x"></i> Wordle
            </a>
          </div>
          </div>
        </Tab>
        <Tab eventKey="minesweeper" title="Minesweeper">
          <div className="d-flex justify-content-center">
            <Minesweeper />
          </div>
        </Tab>
        <Tab eventKey="datatable" title="DataTables">
          <div className="d-flex justify-content-center">
            <MyDataTable />
          </div>
        </Tab>
      </Tabs>
    );
  }
}

export default ReactTabHeader;
