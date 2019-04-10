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

function dateStr (d) {
  return d.toLocaleString({
    hour: "numeric",
    minute: "numeric"
  });
}

var sendReq = function (uri, mtd, cb, params) {
  var req = new XMLHttpRequest();
  req.addEventListener("load", function () {
    var rsp = this.responseText;
    cb(JSON.parse(rsp), rsp);
  });
  uri = "https://api.samsara.com/v1" + uri + "?access_token=" + accessToken;
  uri = uri + (params ? "&" + params.map(function (x) { return x.join("="); }).join("&") : "");
  uri = encodeURI(uri);
  console.log(uri);
  req.open(mtd, uri);
  req.send();
};

var getDrivers = function (cb) {
  var out = [];
  sendReq("/fleet/drivers", "GET", function (x) {
    x = x.drivers;
    var t = (new Date).getTime(),
        done = 0;
    for (var i = 0; i < x.length; i++){
      (function (j) {
        out[j] = x[j];
        sendReq(
          "/fleet/hos_authentication_logs",
          "GET",
          function (y) {
            var logs = y.authenticationLogs || [];
            /*
            logs = logs.filter(function (x) {
                return (x.actionType === "signin");
              }).map(function (x) {
                return x.happenedAtMs;
              }).sort();
            */
            var signIns = logs.sortByKey("happenedAtMs").map(function (x) {
              var d = new Date(x.happenedAtMs);
              return x.actionType + ": " + dateStr(d);
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

var downloadReport = function (file, headers, rows) {
  rows = rows.map(function (row) {
    return row.map(function (x) {
      x = (typeof x === "string") ? x.replace(/"/g, '""') : x;
      return '"' + x + '"';
    }).join(",");
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
    downloadReport("drivers", ["Name", "ID", "Sign Ins"], rows.sortBy(function (row) {
      return (row.signIns || "z");
    }).map(function (row) {
      return [row.name, row.id, row.signIns];
    }));
  });
}

function createDriver (config) {
  sendReq("/fleet/drivers/create", "POST", function (x, s) {
    console.log(s);
  }, [
    ["name", config.name],
    ["username", config.id],
    ["password", config.id],
    ["eldPcEnabled", true],
    ["eldYmEnabled", true],
    ["tagIds", [100835]]
  ]);
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
