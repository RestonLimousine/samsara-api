var accessToken;

Array.prototype.sortBy = function (f) {
  return this.sort(function (x, y) {
    x = f(x), y = f(y);
    return x > y ? 1 : x < y ? -1 : 0;
  });
}

Array.prototype.sortByKey = function (k) {
  return this.sortBy(function (x) {
    return x[k];
  });
}

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

var getDrivers = function (cb) {
  var out = [];
  sendReq("/fleet/drivers", function (x) {
    x = JSON.parse(x).drivers;
    var t = (new Date).getTime(),
        done = 0;
    for (var i = 0; i < x.length; i++){
      (function (j) {
        out[j] = x[j];
        sendReq(
          "/fleet/hos_authentication_logs",
          function (y) {
            var logs = JSON.parse(y).authenticationLogs || [];
            /*
            logs = logs.filter(function (x) {
                return (x.actionType === "signin");
              }).map(function (x) {
                return x.happenedAtMs;
              }).sort();
            */
            var signIns = logs.sortByKey("happenedAtMs").map(function (x) {
              var d = new Date(x.happenedAtMs);
              return x.actionType + ": " + d.toISOString();
            }).join("; ");
            // out[j].lastSignIn = logs.slice(-1)[0];
            out[j].signIns = signIns;
            done++;
            if (done === x.length) {
              cb(out);
            }
          },
          [["driverId", x[j].id],
           ["startMs", t-(24*60*60*1000*7)],
           ["endMs", t]]
        );
      })(i);
    }
  });
}

var dateStr = function (date, delim) {
  var n = delim ? 10 : 8;
  return date.toISOString().replace(/-/g, delim || "").slice(0,n);
}

var downloadReport = function (file, headers, rows) {
  rows = rows.map(function (row) {
    return row.map(function (x) { return '"' + x.replace(/"/g, '""') + '"' }).join(",");
  }).join("\n");
  headers = headers.join(",");
  var content = headers + "\n" + rows,
      a = document.createElement("a");
  file = "samsara_" + file + "_";
  file = file + dateStr(new Date());
  file = file + ".csv";
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
  a.setAttribute('download', file);
  document.body.appendChild(a);
  a.click();
}

var getDriverReport = function () {
  getDrivers(function (rows) {
    downloadReport("drivers", ["Name", "Sign Ins"], rows.sortBy(function (row) {
      return (row.signIns || "Z");
    }).map(function (row) {
      var signIns = row.signIns;
      return [row.name, signIns];
    }));
  });
}

/*
var getVehicles = function () { };

var getVehicleReport = function () {
  getVehicles(function (rows) {
    downloadReport("mileage", ["Name", "Mileage", "Engine Hours", "Vehicles"],
      rows.map(function (row) {
        return [
          row.name,
          (row.odometerMeters === null ? "" : Math.floor(row.odometerMeters * 0.000621371)),
          (row.engineHours || "")
        ];
      })
    );
  });
};
*/

console.log(
  "To download a list of all drivers, type getDriverReport() and press Enter"
);
