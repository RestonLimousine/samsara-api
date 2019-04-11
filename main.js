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

function mdy (d, delim) {
  var opts = {
        month: "2-digit",
        day: "2-digit",
        year: "numeric"
      },
      s = d.toLocaleDateString("en", opts).split(/\D/)
  s = s.slice(0, 2).concat(s.slice(-1));
  return s.join(delim || "");
}

var sendReq = function (config) {
  var uri = config.endpoint,
      mtd = config.method,
      cb = config.callback,
      params = config.params,
      req = new XMLHttpRequest();
  req.addEventListener("load", function () {
    var rsp = this.responseText;
    cb(JSON.parse(rsp), rsp);
  });
  params = (params ? "&" + params.map(function (x) { return x.join("="); }).join("&") : "");
  uri = "https://api.samsara.com/v1" + uri + "?access_token=" + accessToken;
  uri = encodeURI(uri + params);
  console.log(uri);
  req.open(mtd, uri);
  req.send();
};

function sendRequest (config) {
  config.params = (config.params || "").split(/&/).map(function (x) {
    return x.split(/=/);
  });
  config.callback = function (data, text) {
    console.log(data);
    config.pre.innerText = text;
  }
  sendReq(config);
}

var getDrivers = function (config) {
  var cb = config.callback,
      out = [];
  sendReq({
    endpoint: "/fleet/drivers",
    method: "GET",
    callback: function (x) {
      x = x.drivers;
      var t = (new Date).getTime(),
          done = 0;
      for (var i = 0; i < x.length; i++){
        (function (j) {
          out[j] = x[j];
          sendReq({
            endpoint: "/fleet/hos_authentication_logs",
            method: "GET",
            callback: function (y) {
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
            params: [
              ["driverId", x[j].id],
              ["startMs", t-(24*60*60*1000*7)],
              ["endMs", t]
            ]
          });
        })(i);
      }
    }
  });
}

var downloadReport = function (config) {
  var file = config.filename,
      headers = config.headers,
      rows = config.rows;
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
  file = file + mdy(new Date());
  file = file + ".csv";
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
  a.setAttribute('download', file);
  document.body.appendChild(a);
  a.click();
}

var getDriverReport = function () {
  getDrivers({
    callback: function (rows) {
      downloadReport({
        filename: "drivers",
        headers: ["Name", "ID", "Sign Ins"],
        rows: rows.sortBy(function (row) {
          return (row.signIns || "z");
        }).map(function (row) {
          return [row.name, row.id, row.signIns];
        })
      });
    }
  });
}

function createDriver (config) {
  sendReq({
    endpoint: "/fleet/drivers/create",
    method: "POST",
    callback: function (x, s) {
      console.log(s);
    },
    params: [
      ["name", config.name],
      ["username", config.id],
      ["password", config.id],
      ["eldPcEnabled", true],
      ["eldYmEnabled", true],
      ["tagIds", [100835]]
    ]
  });
}

var div = document.createElement("div"),
    ops = [
      ["Create Driver", createDriver, "Driver Name", "name", "Driver ID", "id"],
      ["Get Driver Report", getDriverReport],
      ["Send Request", sendRequest, "Endpoint", "endpoint", "Method", "method", "Params", "params"]
    ],
    showingDiv,
    voidLink = "javascript:void(0)";

div.style.border = "1px solid gray";
div.style.borderBottom = "none";
ops.sortByKey(0);

for (var i = 0; i < ops.length; i++) {
  (function (op) {
    var opNm = op[0],
        opFn = op[1],
        opDiv = document.createElement("div"),
        nameA = document.createElement("a"),
        nameP = document.createElement("p"),
        innerDiv = document.createElement("div"),
        executeP = document.createElement("p"),
        executeA = document.createElement("a"),
        pre = document.createElement("pre"),
        config = {};
    
    pre.style.whiteSpace = "pre-wrap";
    
    for (var i = 2; i < op.length; i += 2) {
      (function (label, name) {
        var p = document.createElement("p"),
            b = document.createElement("b"),
            input = document.createElement("input");
        b.innerText = label + ": ";
        p.appendChild(b);
        input.type = "text";
        p.appendChild(input);
        innerDiv.appendChild(p);
        config[name] = input;
      })(op[i], op[i + 1]);
    }
    
    nameA.href = voidLink;
    nameA.textContent = opNm;
    nameA.onclick = function () {
      if (showingDiv) showingDiv.style.display = "none";
      showingDiv = innerDiv;
      innerDiv.style.display = "";
    }
    nameP.appendChild(nameA);
    
    executeA.href = voidLink;
    executeA.textContent = "Execute";
    executeA.onclick = function () {
      for (var inputName in config) {
        (function (input) {
          config[inputName] = input.value;
        })(config[inputName]);
      }
      config.pre = pre;
      pre.innerText = "please wait...";
      opFn(config);
    }
    executeP.appendChild(executeA);
    
    innerDiv.style.display = "none";
    innerDiv.style.paddingLeft = "2em";
    innerDiv.style.paddingRight = "2em";
    innerDiv.appendChild(executeP);
    innerDiv.appendChild(pre);
    
    opDiv.style.paddingLeft = "1em";
    opDiv.style.borderBottom = "1px solid gray";
    opDiv.appendChild(nameP);
    opDiv.appendChild(innerDiv);
    
    div.appendChild(opDiv);
  })(ops[i]);
}

document.body.innerHTML = "";
document.body.appendChild(div);

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
