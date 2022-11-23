import React, { useState, useEffect } from "react";
import { displayDataTableUser, displayDataTablePost } from "./display_data";
function MyDataTable() {
  useEffect(() => {
    displayDataTableUser();
    displayDataTablePost();
  });
  return (
    <>
      <div className="small-12">
        <ul className="nav nav-pills justify-content-center" id="pills-tab" role="tablist">
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
        <hr></hr>
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
                <hr></hr>
                <a href="https://datatables.net/" target="_blank">
                  <i className="fa fa-table fa-2x"></i>DataTable
                </a>
                <a href="https://jsonplaceholder.typicode.com/" target="_blank">
                  <i className="fa fa-database fa-2x"></i>JSONPlaceHolder
                </a>
              </div>
              <div
                className="tab-pane fade"
                id="pills-post"
                role="tabpanel"
                aria-labelledby="pills-post-tab"
              >
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
                <hr></hr>
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
    </>
  );
}

export default MyDataTable;
