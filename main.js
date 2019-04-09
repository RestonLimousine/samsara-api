var accessToken;

var sendReq = function (uri, cb, params) {
  var req = new XMLHttpRequest();
  req.addEventListener("load", function () {
    var rsp = this.responseText;
    cb(rsp);
  });
  uri = "https://api.samsara.com/v1" + uri + "?access_token=" + accessToken;
  uri = uri + (params ? "&" + params.map(function (x) { return x.join("="); }).join("&") : "");
  req.open("GET", uri);
  req.send();
};

var out = [];

var getDrivers = function () {
  sendReq("/fleet/drivers", function (x) {
    x = JSON.parse(x).drivers;
    var t = (new Date).getTime();
    for (var i = 0; i < x.length; i++){
      out[i] = x[i];
      sendReq(
        "/fleet/hos_authentication_logs",
        function (y) {
          out[i].authenticationLogs = JSON.parse(y).authenticationLogs;
          if (i === x.length) {
            console.log(i);
          }
        },
        [["driverId", x[i].id],
         ["startMs", t-(24*60*60*1000)],
         ["endMs", t]]
      );
    }
  });
}


