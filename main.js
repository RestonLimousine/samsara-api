document.body.innerHTML = "";

var accessToken, lastResult;

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
    var rsp = this.responseText,
        res = JSON.parse(rsp);
    if (cb) cb(res, rsp);
  });
  params = (params ? "&" + params.map(function (x) { return x.join("="); }).join("&") : "");
  uri = "https://api.samsara.com/v1" + uri + "?access_token=" + accessToken;
  uri = encodeURI(uri + params);
  console.log(uri);
  req.open(mtd, uri);
  req.send();
};

function sendRequest (inputs) {
  return {
    params: (inputs.params || "").split(/&/).map(function (x) {
      return x.split(/=/);
    })
  };
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

function downloadContent (config) {
  var a = document.createElement("a"),
      ext = config.ext,
      file = config.filename,
      content = config.content;
  file = "samsara_" + file + "_";
  file = file + mdy(new Date());
  file = file + "." + ext;
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
  a.setAttribute('download', file);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

var downloadCSV = function (config) {
  var headers = config.content.headers,
      rows = config.content.rows;
  rows = rows.map(function (row) {
    return row.map(function (x) {
      x = x.replace(/"/g, '""');
      return '"' + x + '"';
    }).join(",");
  }).join("\n");
  headers = headers.join(",");
  config.content = headers + "\n" + rows;
  config.ext = "csv";
  downloadContent(config);
}

function formatCell (value) {
  var x = (value === undefined || value === null) ? "" : value;
  switch (x.constructor) {
    case Array: x = "[" + x.length + "]"; break;
    case Object:
      var n = 0;
      for (var p in x) { n++; }
      var c = n > 0 ? "..." : "";
      x = "{" + c + "}";
    break;
  }
  return x.toString();
}

function prepareForTable (arr) {
  var first = arr[0],
      config = {headers: [], rows: []};
  for (var prop in first) {
    config.headers.push(prop);
  }
  for (var i = 0; i < arr.length; i++) {
    var row = [];
    for (var j = 0; j < config.headers.length; j++) {
      var header = config.headers[j],
          cell = arr[i][header];
      cell = formatCell(cell);
      row.push(cell);
    }
    config.rows.push(row);
  }
  return config;
}

function getArray (res, input) {
  var path = input.value || "";
  path = (path === "") ? [] : path.split(/\./);
  for (var i = 0; i < path.length; i++) {
    res = res[path[i]];
  }
  if (res && res.constructor === Array) return res;
}

function makeTable (res, input) {
  var container = document.createElement("div"),
      grid = document.createElement("div"),
      arr = getArray(res, input);
  if (arr) {
    container.className = "grid-container";
    grid.className = "grid";
    container.appendChild(grid);
    var table = prepareForTable(arr);
    var topNum = document.createElement("div");
    topNum.style.gridRow = "1 / 2";
    topNum.className = "cell header row-num";
    grid.appendChild(topNum);
    for (var h = 0; h < table.headers.length; h++) {
      var header = document.createElement("div");
      header.innerText = table.headers[h];
      header.style.gridRow = "1 / 2";
      header.className = "cell header";
      grid.appendChild(header);
    }
    for (var i = 0; i < table.rows.length; i++) {
      var gridRow = (i + 2) + " / " + (i + 3);
      var rowNum = document.createElement("div");
      rowNum.style.gridRow = gridRow;
      rowNum.className = "cell row-num";
      rowNum.innerText = i + 1;
      grid.appendChild(rowNum);
      var row = table.rows[i];
      for (var j = 0; j < row.length; j++) {
        var cell = document.createElement("div");
        cell.style.gridRow = gridRow;
        cell.innerText = row[j];
        cell.className = "cell";
        grid.appendChild(cell);
      }
    }
    return container;
  }
}

function createAndDownloadCSV (config) {
  config.content = prepareForTable(config.content);
  downloadCSV(config);
}

function createDriver (inputs) {
  return {
    endpoint: "/fleet/drivers/create",
    method: "POST",
    params: [
      ["name", inputs.name],
      ["username", inputs.id],
      ["password", inputs.id],
      ["eldPcEnabled", true],
      ["eldYmEnabled", true],
      ["tagIds", [100835]]
    ]
  };
}

var div = document.createElement("div"),
    ops = [
      {
        label: "Create Driver",
        makeConfig: createDriver,
        params: ["Driver Name", "name", "Driver ID", "id"],
        op: sendReq
      },
      {
        label: "Send Request",
        makeConfig: sendRequest,
        params: ["Endpoint", "endpoint", "Method", "method", "Params", "params"],
        op: sendReq
      }
    ],
    showingDiv,
    voidLink = "javascript:void(0)",
    freshA = function (innerText) {
      var a = document.createElement("a");
      a.href = voidLink;
      a.innerText = innerText;
      return a;
    };

div.style.border = "1px solid gray";
div.style.borderBottom = "none";
ops.sortByKey("label");

for (var i = 0; i < ops.length; i++) {
  (function (op) {
    var opNm = op.label,
        params = op.params || [],
        opDiv = document.createElement("div"),
        nameA = document.createElement("a"),
        nameP = document.createElement("p"),
        innerDiv = document.createElement("div"),
        executeP = document.createElement("p"),
        executeA = document.createElement("a"),
        preDiv = document.createElement("div"),
        pre = document.createElement("pre"),
        preLabel = document.createElement("b"),
        aInP = function (text, onclick, hasInput) {
          var p = document.createElement("p"),
              a = freshA(text),
              input = document.createElement("input");
          a.onclick = function (e) { onclick(input); };
          p.appendChild(a);
          if (hasInput) {
            input.type = "text";
            input.placeholder = "path to array";
            input.style.marginLeft = "1em";
            p.appendChild(input);
          }
          p.style.marginLeft = "2em";
          preDiv.appendChild(p);
        },
        preLabelP = document.createElement("p"),
        inputs = {},
        config = {},
        fileName = opNm.toLowerCase().replace(/ /, "_"),
        thisResult;
    
    preLabel.innerText = "Results: ";
    preLabelP.appendChild(preLabel);
    preDiv.appendChild(preLabelP);
    
    function clearPre () {
      pre.innerText = "";
      var cn = preDiv.childNodes;
      preDiv.replaceChild(pre, cn[cn.length - 1]);
    }
    
    aInP("clear", clearPre);
    
    aInP("view JSON", function () {
      clearPre();
      pre.innerText = JSON.stringify(thisResult, null, 2);
    });
    
    aInP("view table", function (input) {
      clearPre();
      var table = makeTable(thisResult, input);
      if (table) preDiv.replaceChild(table, pre);
    }, true);
    
    aInP("download JSON", function () {
      downloadContent({
        filename: fileName,
        content: JSON.stringify(thisResult, null, 2),
        ext: "txt"
      });
    });
    
    aInP("download CSV", function (input) {
      var arr = getArray(thisResult, input);
      if (arr) {
        createAndDownloadCSV({filename: fileName, content: arr});
      }
    }, true);
    
    for (var i = 0; i < params.length; i += 2) {
      (function (label, name) {
        var p = document.createElement("p"),
            b = document.createElement("b"),
            input = document.createElement("input");
        b.innerText = label + ": ";
        p.appendChild(b);
        input.type = "text";
        p.appendChild(input);
        innerDiv.appendChild(p);
        inputs[name] = input;
      })(params[i], params[i + 1]);
    }
    
    preDiv.appendChild(pre);
    
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
      for (var inputName in inputs) {
        config[inputName] = inputs[inputName].value;
      }
      pre.innerText = "please wait...";
      op.makeConfig = op.makeConfig || function (x) { return {}; };
      var conf = op.makeConfig(config),
          cb = conf.callback,
          newCB = function (res, rsp) {
            if (cb) res = cb(res, rsp);
            lastResult = thisResult = res;
            clearPre();
            pre.innerText = JSON.stringify(res, null, 2);
          };
      for (var prop in conf) {
        config[prop] = conf[prop];
      }
      config.callback = newCB;
      op.op(config);
    }
    executeP.appendChild(executeA);
    
    innerDiv.style.display = "none";
    innerDiv.style.paddingLeft = "2em";
    innerDiv.style.paddingRight = "2em";
    innerDiv.appendChild(executeP);
    innerDiv.appendChild(preDiv);
    
    opDiv.style.paddingLeft = "1em";
    opDiv.style.borderBottom = "1px solid gray";
    opDiv.appendChild(nameP);
    opDiv.appendChild(innerDiv);
    
    div.appendChild(opDiv);
  })(ops[i]);
}

var link = document.createElement("link");
link.href = "https://restonlimousine.github.io/samsara-api/main.css";
link.rel = "stylesheet";

document.head.appendChild(link);
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
