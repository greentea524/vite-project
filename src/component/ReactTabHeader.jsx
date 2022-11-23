import React, { Component } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import About from "./About";
import Home from "./Home";
import TicTacGame from "./boardgame.jsx";
import MyChart from "./MyChart.jsx";
import MyDataTable from "./datatables/MyDataTable.jsx";

class ReactTabHeader extends Component {
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
          <div className="d-flex justify-content-center">
            <MyChart />
          </div>
        </Tab>
        <Tab eventKey="tictac" title="TicTacToe">
          <div className="d-flex justify-content-center">
            <TicTacGame />
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
