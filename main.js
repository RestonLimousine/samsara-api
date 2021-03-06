// todo: help text for each input field

// var s = document.createElement("script");s.src="https://restonlimousine.github.io/samsara-api/main.js";s.onload=function(){accessToken="wSiVqy6NCd3FEwR5QkUFgxpOoblUxK";};document.body.appendChild(s);

document.body.innerHTML = "";

(function (script) {
  script.src = "https://unpkg.com/xlsx@0.14.2/dist/xlsx.full.min.js";
  document.head.appendChild(script);
})(document.createElement("script"));

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

function yyyymmdd (d, delim) {
  var opts = {
        month: "2-digit",
        day: "2-digit",
        year: "numeric"
      },
      s = d.toLocaleDateString("en", opts).split(/\D/);
  s = s.slice(-1).concat(s.slice(0, 2));
  return s.join(delim || "");
}

var sendReq = function (config) {
  var uri = config.endpoint,
      mtd = config.method || "GET",
      cb = config.callback,
      params = config.params,
      req = new XMLHttpRequest();
  (function (params) {
    req.addEventListener("load", function () {
      var rsp = this.responseText,
          res;
      try {
        res = JSON.parse(rsp);
      } catch {
        res = {"Error Message": rsp};
        for (var i = 0; i < params.length; i++) {
          res["Params: " + params[i][0]] = params[i][1];
        }
      }
      if (cb) cb(res, rsp);
    });
  })(config.params || []);
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

var day = 24*60*60*1000;

function parseDate (date) {
  var year = parseInt(date.slice(0,4)),
      month = parseInt(date.slice(4,6)),
      day = parseInt(date.slice(6));
  return new Date(year, month - 1, day);
}

function getIdlingReport (config) {
  var cb = config.callback,
      dates = config.dates.split("-"),
      start = parseDate(dates[0]).getTime(),
      end = parseDate(dates[1] || dates[0]).getTime() + day,
      maxIdle = parseInt(config.max),
      vehicles = config.vehicles.split(","),
      out = [];
  sendReq({
    endpoint: "/fleet/list",
    method: "GET",
    callback: function (rsp) {
      var rspVeh = rsp.vehicles;
      sendReq({
        endpoint: "/fleet/vehicles/stats",
        params: [["startMs", start], ["endMs", end]],
        callback: function (rsp) {
          var rspStats = rsp.vehicleStats;
          (function loadVehicle (vs) {
            var vName = vs[0].toLowerCase().trim(),
                v = {name: vName},
                next = function () {
                  var _vs = vs.slice(1);
                  if (_vs.length > 0) {
                    loadVehicle(_vs);
                  } else {
                    cb(out);
                  } 
                };
            for (var i = 0; i < rspVeh.length; i++) {
              var _v = rspVeh[i];
              if (_v.name.toLowerCase().trim() === vName) {
                v = _v;
                break;
              }
            }
            if (v.id) {
              for (var i = 0; i < rspStats.length; i++) {
                if (rspStats[i].vehicleId === v.id) {
                  var stats = rspStats[i].engineState,
                      prev;
                  for (var j = 0; j < stats.length; j++) {
                    var millis = stats[j].timeMs,
                        dt = new Date(millis);
                    if (prev) {
                      var duration = Math.floor((millis - prev.__meta__.millis) / 60000),
                          isError = prev.status === "Idle" && duration > maxIdle,
                          error = isError ? "excessive idling" : null
                      prev.duration_minutes = duration;
                      prev.error = error;
                    }
                    prev = {
                      __meta__: {worksheet: v.name, millis: millis},
                      vehicle: v.name,
                      date: dt.toLocaleDateString(),
                      time: dt.toLocaleTimeString(),
                      status: stats[j].value
                    };
                    out.push(prev);
                  }
                  break;
                }
              }
              next();
            } else {
              next();
            }
          })(vehicles);
        }
      });
    }
  });
}

var getHOSLogs = function (config) {
  var cb = config.callback,
      dates = config.dates.split("-"),
      start = parseDate(dates[0]).getTime(),
      end = parseDate(dates[1] || dates[0]).getTime() + day,
      out = [],
      vehicles = {},
      logCount = 0;
  sendReq({
    endpoint: "/fleet/drivers",
    method: "GET",
    callback: function (rsp) {
      var driverCount = rsp.drivers.length;
      (function getNext (drivers) {
        var driver = drivers[0];
        drivers = drivers.slice(1);
        driverCount--;
        sendReq({
          endpoint: "/fleet/hos_logs",
          method: "GET",
          params: [["driverId", driver.id], ["startMs", start], ["endMs", end]],
          callback: function (rsp) {
            logCount += rsp.logs.length;
            (function getNextLog (logs) {
              if (logs[0]) {
                var log = logs[0],
                    vehicleId = log.vehicleId,
                    vehicleName = vehicles[vehicleId];
                if (vehicleName || vehicleId === "0") {
                  log.driverName = driver.name;
                  log.vehicleName = vehicleName;
                  log.startTime = new Date(log.logStartMs);
                  out.push(log);
                  logs = logs.slice(1);
                  if (logs[0]) {
                    getNextLog(logs);
                  } else if (driverCount === 0 && out.length === logCount) {
                    cb(out);
                  }
                } else {
                  sendReq({
                    endpoint: "/fleet/vehicles/" + vehicleId,
                    method: "GET",
                    callback: function (rsp) {
                      vehicles[vehicleId] = rsp.Name;
                      getNextLog(logs);
                    }
                  });
                }
              } else if (driverCount === 0 && out.length === logCount) {
                cb(out);
              }
            })(rsp.logs);
          }
        });
        if (drivers[0]) getNext(drivers);
      })(rsp.drivers);
    }
  });
}

var getHOSAuthLogs = function (config) {
  var cb = config.callback,
      daysAgo = day * parseInt(config.days_ago),
      out = {drivers: [], logs: []};
  sendReq({
    endpoint: "/fleet/drivers",
    method: "GET",
    callback: function (rsp) {
      var drivers = rsp.drivers;
      var t = (new Date).getTime(),
          done = 0;
      for (var i = 0; i < drivers.length; i++){
        (function (j) {
          var driver = drivers[j];
          sendReq({
            endpoint: "/fleet/hos_authentication_logs",
            method: "GET",
            callback: function (y) {
              var logs = y.authenticationLogs || [];
              logs = logs.map(function (log) {
                log.time = new Date(log.happenedAtMs);
                log.driver = driver.name;
                return log;
              }).filter(function (log) {
                return log.time.getHours() > 0 || log.time.getMinutes() > 0;
              });
              if (logs.length > 0) {
                driver.has_logs = true;
                out.logs = out.logs.concat(logs);
              } else {
                driver.has_logs = false;
              }
              out.drivers.push(driver);
              done++;
              if (done === drivers.length) {
                out.drivers.sortByKey("name");
                out.logs.sortByKey("happenedAtMs");
                cb(out);
              }
            },
            params: [
              ["driverId", driver.id],
              ["startMs", t-daysAgo],
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
  file = file + yyyymmdd(new Date());
  file = file + "." + ext;
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
  a.setAttribute('download', file);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

var downloadXLSX = function (config) {
  var headers = config.content.headers,
      rows = config.content.rows,
      wb = XLSX.utils.book_new(),
      wbarr = [];
  rows.reduce(function (p, c) {
    var currSheet = wbarr[wbarr.length - 1],
        destSheet = (c.meta || {}).worksheet;
    if (!currSheet || destSheet !== currSheet.name) {
      currSheet = [headers];
      currSheet.name = destSheet;
      wbarr.push(currSheet);
    }
    currSheet.push(c);
  }, []);
  wbarr.reduce(function (p, c) {
    var ws = XLSX.utils.aoa_to_sheet(c);
    XLSX.utils.book_append_sheet(wb, ws, c.name);
  }, null);
  var filename = "samsara_" + config.filename + "_" + yyyymmdd(new Date()) + ".xlsx";
  XLSX.writeFile(wb, filename);
  /*
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
  */
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
  var config = {headers: [], rows: []};
  for (var n = 0; n < arr.length; n++) {
    for (var prop in arr[n]) {
      if (config.headers.indexOf(prop) === -1 && (prop !== "__meta__")) {
        config.headers.push(prop);
      }
    }
  }
  for (var i = 0; i < arr.length; i++) {
    var row = [];
    row.meta = arr[i].__meta__;
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
  var grid = document.createElement("div"),
      arr = getArray(res, input);
  if (arr) {
    grid.className = "grid";
    var table = prepareForTable(arr);
    var topNum = document.createElement("div");
    topNum.style.gridRow = "1 / 2";
    topNum.className = "cell header";
    topNum.innerText = " ";
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
    return grid;
  }
}

function createAndDownloadXLSX (config) {
  config.content = prepareForTable(config.content);
  downloadXLSX(config);
}
// todo: how to include mobile number and location in export file for Heymarket?
function createDriver (inputs) {
  var id = "000" + inputs.id;
  id = id.slice(id.length - 4);
  return {
    endpoint: "/fleet/drivers/create",
    method: "POST",
    params: [
      ["name", inputs.name],
      ["username", id],
      ["password", id],
      ["eldPcEnabled", true],
      ["eldYmEnabled", true],
      ["tagIds", [100835]]
    ]
  };
}

function getVehicleMileage (config) {
  sendReq({
    endpoint: "/fleet/list",
    method: "GET",
    callback: function (rsp) {
      var vehs = [], done = {};
      for (var i = 0; i < rsp.vehicles.length; i++) {
        var veh = rsp.vehicles[i];
        if (veh.odometerMeters) {
          veh.miles = Math.floor(veh.odometerMeters * 0.000621371);
          delete veh.odometerMeters;
          veh.date = (new Date()).toLocaleDateString("en-US", {month:"2-digit", day:"2-digit", year:"numeric"});
          var already = done[veh.name];
          if (already) {
            if (already[0].miles < veh.miles) {
              done[veh.name] = [veh, i];
              vehs[already[1]] = null;
              vehs.push(veh);
            }
          } else {
            done[veh.name] = [veh, i];
            vehs.push(veh);
          }
        } else {
          vehs[i] = null;
        }
      }
      vehs = vehs.filter(function (v) { return v; }).sortByKey("name");
      config.callback(vehs);
    }
  });
}

function prepareDriverRow (row) {
  var jt = row["JobType"] || "";
  if (jt.match(/^(006|007|008|010)/)
      || jt.indexOf("Charter") > -1
      || jt.indexOf("Mechanic") > -1) {
    return {
      "Driver Name": row["NameFullPreferred_c"],
      "Driver ID": row["zkp_EmployeeID"]
    };
  }
}

var div = document.createElement("div"),
    ops = [
      {
        label: "Create Driver",
        makeConfig: createDriver,
        prepareRow: prepareDriverRow,
        params: ["Driver Name", "name", "Driver ID", "id"],
        op: sendReq
      },
      {
        label: "Send Request",
        makeConfig: sendRequest,
        params: ["Endpoint", "endpoint", "Method", "method", "Params", "params"],
        op: sendReq
      },
      {
        label: "HOS Authentication Logs",
        op: getHOSAuthLogs,
        params: ["Days Ago", "days_ago"]
      },
      {
        label: "HOS Logs",
        op: getHOSLogs,
        params: ["Date Or Range", "dates"]
      },
      {
        label: "Vehicle Mileage",
        op: getVehicleMileage
      },
      {
        label: "Idling Report",
        params: [
          "Vehicles (comma separated for multiple)", "vehicles",
          "Max Idling (optional)", "max",
          "Date Range (yyyymmdd or yyyymmdd-yyyymmdd)", "dates"
        ],
        op: getIdlingReport
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
    
    aInP("download XLSX", function (input) {
      var arr = getArray(thisResult, input);
      if (arr) {
        createAndDownloadXLSX({filename: fileName, content: arr});
      }
    }, true);
    
    var uploaded = null;
    
    if (params.length > 0) {
      var reader = new FileReader();
      reader.addEventListener("loadend", function() {
        var result = new Uint8Array(reader.result),
            book = XLSX.read(result, {type: "array"}),
            sheet = book.Sheets[book.SheetNames[0]];
        uploaded = XLSX.utils.sheet_to_json(sheet);
      });
      (function (div, a, input) {
        div.appendChild(input);
        div.appendChild(a);
        a.href = "javascript:void(0)";
        a.innerText = "cancel";
        a.onclick = function () {
          input.value = null;
          for (var i in inputs) {
            inputs[i].disabled = undefined;
          }
          a.style.display = "none";
          uploaded = null;
        }
        a.style.display = "none";
        input.style.display = "inline";
        input.type = "file";
        input.onchange = function (e) {
          for (var i in inputs) {
            inputs[i].disabled = "disabled";
          }
          a.style.display = "";
          reader.readAsArrayBuffer(input.files[0]);
        }
        innerDiv.appendChild(div);
      })(document.createElement("div"),
         document.createElement("a"),
         document.createElement("input"));
    }
    
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
      pre.innerText = "please wait...";
      op.makeConfig = op.makeConfig || function (x) { return {}; };
      if (uploaded) {
        var out = [],
            done = 0;
        for (var i = 0; i < uploaded.length; i++) {
          var row = uploaded[i];
          if (op.prepareRow) {
            row = op.prepareRow(row);
          }
          if (!row) {
            done++;
          } else {
            for (var k = 0; k < params.length; k += 2) {
              (function (label, name) {
                if (!(label in row)) {
                  clearPre();
                  pre.innerText = "Error: column header \"" + label + "\" not found in file";
                  throw "see error";
                }
                config[name] = row[label];
              })(params[k], params[k + 1]);
            }
            var conf = op.makeConfig(config),
                cb = conf.callback,
                newCB = function (res, rsp) {
                  if (cb) res = cb(res, rsp);
                  out.push(res);
                  done++;
                  if (done === uploaded.length) {
                    lastResult = thisResult = out;
                    clearPre();
                    pre.innerText = JSON.stringify(out, null, 2);
                  }
                };
            for (var prop in conf) {
              config[prop] = conf[prop];
            }
            config.callback = newCB;
            op.op(config);
          }
        }
      } else {
        for (var inputName in inputs) {
          config[inputName] = inputs[inputName].value;
        }
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
