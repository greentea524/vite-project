import React, { Component } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import About from "./About";
import Home from "./Home";
import TicTacGame from "./boardgame.jsx";
import MyChart from "./MyChart.jsx";

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
            <div className="row">
              <div className="small-12">
                <ul className="nav nav-pills" id="pills-tab" role="tablist">
                  <li className="nav-item">
                    <a
                      className="nav-link active"
                      id="pills-home-tab"
                      data-toggle="pill"
                      href="#pills-home"
                      role="tab"
                      aria-controls="pills-home"
                      aria-selected="true"
                    >
                      Users
                    </a>
                  </li>
                  <li className="nav-item">
                    <a
                      className="nav-link"
                      id="pills-post-tab"
                      data-toggle="pill"
                      href="#pills-post"
                      role="tab"
                      aria-controls="pills-post"
                      aria-selected="false"
                    >
                      Posts
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="row">
              <div className="small-12">
                <div
                  className="tab-content d-flex justify-content-center"
                  id="pills-tabContent"
                >
                  <div
                    className="tab-pane fade show active"
                    id="pills-home"
                    role="tabpanel"
                    aria-labelledby="pills-home-tab"
                  >
                    Work in progress
                    <table
                      id="myTableOne"
                      className="table nowrap display responsive"
                    >
                      <thead className="thead-light">
                        <tr>
                          <th scope="col">Id</th>
                          <th scope="col">Name</th>
                          <th scope="col">Username</th>
                          <th scope="col">Email</th>
                          <th scope="col">Website</th>
                        </tr>
                      </thead>
                    </table>
                    <a href="https://datatables.net/" target="_blank">
                      <i className="fa fa-table fa-2x"></i>DataTable
                    </a>
                    <a
                      href="https://jsonplaceholder.typicode.com/"
                      target="_blank"
                    >
                      <i className="fa fa-database fa-2x"></i>JSONPlaceHolder
                    </a>
                  </div>
                  <div
                    className="tab-pane fade"
                    id="pills-post"
                    role="tabpanel"
                    aria-labelledby="pills-post-tab"
                  >
                    Work in progress
                    <table
                      id="myTableTwo"
                      className="table nowrap display responsive"
                    >
                      <thead className="thead-light">
                        <tr>
                          <th scope="col">Title</th>
                          <th scope="col">Views</th>
                          <th scope="col">Published</th>
                          <th scope="col">Created</th>
                        </tr>
                      </thead>
                    </table>
                    <a href="https://datatables.net/" target="_blank">
                      <i className="fa fa-table fa-2x"></i>DataTable
                    </a>
                    <a href="https://mockend.com" target="_blank">
                      <i className="fa fa-server fa-2x"></i>Mockend
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Tab>
      </Tabs>
    );
  }
}

export default ReactTabHeader;
