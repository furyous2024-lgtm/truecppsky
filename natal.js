"use strict";

import { sharedNatal } from "./sharedNatal.js";

document.addEventListener("DOMContentLoaded", function () {
  const svgContainer = d3.select("#natal-chart");
  sharedNatal(svgContainer);
});
