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
      (function (j) {
        out[j] = x[j];
        sendReq(
          "/fleet/hos_authentication_logs",
          function (y) {
            var logs = JSON.parse(y).authenticationLogs || [];
            logs = logs.filter(function (x) {
                return x.actionType === "signin";
              }.sort(function (x, y) {
                if (x.happenedAtMs < y.happenedAtMs) {
                  return 1;
                } else if (x.happenedAtMs > y.happenedAtMs) {
                  return -1;
                } else {
                  return 0;
                }
              });
                               if(logs[0])console.log(j);
            out[j].lastSignIn = logs[0];
          },
          [["driverId", x[j].id],
           ["startMs", t-(24*60*60*1000*7)],
           ["endMs", t]]
        );
      })(i);
    }
  });
}


