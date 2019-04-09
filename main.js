samsaraAPI = {};

samsaraAPI.sendReq = function (uri, cb, params) {
  var req = new XMLHttpRequest();
  req.addEventListener("load", function () {
    var rsp = this.responseText;
    cb(rsp);
  });
  uri = "https://api.samsara.com/v1" + uri + "?access_token=" + samsaraAPI.accessToken;
  uri = uri + (params ? "&" + params.map(function (x) { return x.join("="); }).join("&") : "");
  req.open("GET", uri);
  req.send();
};

samsaraAPI.out = [];

samsaraAPI.getDrivers = function () {
  sendReq("/fleet/drivers", function (x) {
    x = JSON.parse(x).drivers;
    for (var i = 0; i < x.length; i++){
      sendReq(
        "/fleet/hos_authentication_logs",
        function (y) {
          out.push(y);
          if (out.length === x.length) {
            console.log(out.length);
          }
        },
        [["driverId", x[i].id],
         ["startMs", (new Date).getTime()-(24*60*60*1000)],
         ["endMs", (new Date).getTime()]]
      );
    }
  });
}
