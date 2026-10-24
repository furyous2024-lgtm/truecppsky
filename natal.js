"use strict";

import { sharedNatal } from "./sharedNatal.js";

document.addEventListener("DOMContentLoaded", function () {
  const svgContainer = d3.select("#natal-chart");
  sharedNatal(svgContainer);

  // Signal that sharedNatal has finished registering the client-side submit
  // handler. Startup calculation must wait for this signal to avoid a native
  // POST navigation/reload loop on every initial page load.
  window.__trueSkyNatalSubmitHandlerReady = true;
  window.dispatchEvent(new Event("truesky-natal-submit-ready"));
});
