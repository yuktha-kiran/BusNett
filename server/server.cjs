const http = require("http");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const PORT = 5000;

const GTFS_DIR = path.join(__dirname, "..", "data", "bmtc");

const STOPS_FILE = path.join(GTFS_DIR, "stops.txt");
const ROUTES_FILE = path.join(GTFS_DIR, "routes.txt");
const TRIPS_FILE = path.join(GTFS_DIR, "trips.txt");
const STOP_TIMES_FILE = path.join(GTFS_DIR, "stop_times.txt");

// ======================================================
// DATA
// ======================================================

const stops = new Map();
const routes = new Map();
const trips = new Map();

/*
  patternKey:
  route_id + direction_id + shape_id

  Each pattern contains the stops and their GTFS sequence.
*/
const patterns = new Map();

let gtfsReady = false;

const stats = {
  stops: 0,
  routes: 0,
  trips: 0,
  stopTimes: 0,
  patterns: 0,
};

// ======================================================
// CSV PARSER
// ======================================================

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (
      char === "," &&
      !insideQuotes
    ) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);

  return result;
}

function normalize(value = "") {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ======================================================
// GENERIC GTFS READER
// ======================================================

async function readGTFS(filePath, callback) {
  const stream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let headers = null;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headers) {
      headers = parseCSVLine(line).map(
        (header) =>
          header
            .replace(/^\uFEFF/, "")
            .trim()
      );

      continue;
    }

    const values = parseCSVLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    callback(row);
  }
}

// ======================================================
// LOAD STOPS
// ======================================================

async function loadStops() {
  console.log("🚏 Loading BMTC stops...");

  await readGTFS(
    STOPS_FILE,
    (row) => {
      if (!row.stop_id) return;

      stops.set(row.stop_id, {
        id: row.stop_id,
        name:
          row.stop_name ||
          "Unknown Stop",
        lat:
          Number(row.stop_lat) || 0,
        lng:
          Number(row.stop_lon) || 0,
      });
    }
  );

  stats.stops = stops.size;

  console.log(
    `✅ ${stats.stops.toLocaleString()} stops loaded`
  );
}

// ======================================================
// LOAD ROUTES
// ======================================================

async function loadRoutes() {
  console.log("🚌 Loading BMTC routes...");

  await readGTFS(
    ROUTES_FILE,
    (row) => {
      if (!row.route_id) return;

      routes.set(row.route_id, {
        id: row.route_id,

        shortName:
          row.route_short_name ||
          row.route_id,

        longName:
          row.route_long_name || "",

        description:
          row.route_desc || "",

        type:
          row.route_type || "",
      });
    }
  );

  stats.routes = routes.size;

  console.log(
    `✅ ${stats.routes.toLocaleString()} routes loaded`
  );
}

// ======================================================
// LOAD TRIPS
// ======================================================

async function loadTrips() {
  console.log("🧭 Loading BMTC trips...");

  await readGTFS(
    TRIPS_FILE,
    (row) => {
      if (!row.trip_id) return;

      trips.set(row.trip_id, {
        id: row.trip_id,

        routeId:
          row.route_id || "",

        serviceId:
          row.service_id || "",

        headsign:
          row.trip_headsign || "",

        directionId:
          row.direction_id || "",

        shapeId:
          row.shape_id || "",
      });
    }
  );

  stats.trips = trips.size;

  console.log(
    `✅ ${stats.trips.toLocaleString()} trips loaded`
  );
}

// ======================================================
// LOAD STOP TIMES
//
// IMPORTANT:
// We do NOT assume stop_times.txt is sorted.
//
// Each stop-time row is immediately connected to:
// trip -> route -> direction -> shape.
//
// This makes the search independent of file ordering.
// ======================================================

async function loadStopTimes() {
  console.log("📍 Processing stop_times.txt...");
  console.log(
    "⏳ Building BMTC route-stop index..."
  );

  const stream =
    fs.createReadStream(
      STOP_TIMES_FILE
    );

  const rl =
    readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

  let headers = null;

  let tripIndex = -1;
  let stopIndex = -1;
  let sequenceIndex = -1;

  for await (const line of rl) {
    if (!line.trim()) continue;

    // Header
    if (!headers) {
      headers = parseCSVLine(line).map(
        (header) =>
          header
            .replace(/^\uFEFF/, "")
            .trim()
      );

      tripIndex =
        headers.indexOf("trip_id");

      stopIndex =
        headers.indexOf("stop_id");

      sequenceIndex =
        headers.indexOf(
          "stop_sequence"
        );

      continue;
    }

    const values =
      parseCSVLine(line);

    const tripId =
      values[tripIndex];

    const stopId =
      values[stopIndex];

    const sequence =
      Number(values[sequenceIndex]);

    if (!tripId || !stopId) {
      continue;
    }

    if (!Number.isFinite(sequence)) {
      continue;
    }

    const trip =
      trips.get(tripId);

    if (!trip) {
      continue;
    }

    if (!trip.routeId) {
      continue;
    }

    /*
      Shape separates different route patterns.

      Example:

      401K | 0 | shape123
      401K | 1 | shape456
    */

    const patternKey =
      [
        trip.routeId,
        trip.directionId,
        trip.shapeId,
      ].join("|");

    if (!patterns.has(patternKey)) {
      patterns.set(
        patternKey,
        {
          key: patternKey,

          routeId:
            trip.routeId,

          directionId:
            trip.directionId,

          shapeId:
            trip.shapeId,

          headsign:
            trip.headsign,

          stops:
            new Map(),
        }
      );
    }

    const pattern =
      patterns.get(patternKey);

    /*
      Store the earliest sequence for
      this stop in this route pattern.
    */

    if (
      !pattern.stops.has(stopId) ||
      sequence <
        pattern.stops.get(stopId)
    ) {
      pattern.stops.set(
        stopId,
        sequence
      );
    }

    stats.stopTimes++;

    if (
      stats.stopTimes % 500000 ===
      0
    ) {
      console.log(
        `   Processed ${stats.stopTimes.toLocaleString()} stop-time records...`
      );
    }
  }

  stats.patterns =
    patterns.size;

  console.log(
    `✅ ${stats.stopTimes.toLocaleString()} stop-time records processed`
  );

  console.log(
    `✅ ${stats.patterns.toLocaleString()} route patterns created`
  );
}

// ======================================================
// STOP SEARCH
// ======================================================

function searchStops(
  query,
  limit = 15
) {
  const cleaned =
    normalize(query);

  if (!cleaned) {
    return [];
  }

  const results = [];

  for (const stop of stops.values()) {
    const name =
      normalize(stop.name);

    let score = 0;

    if (name === cleaned) {
      score = 100;
    } else if (
      name.startsWith(cleaned)
    ) {
      score = 90;
    } else if (
      name.includes(cleaned)
    ) {
      score = 70;
    } else {
      continue;
    }

    results.push({
      ...stop,
      score,
    });
  }

  results.sort(
    (a, b) => {
      if (
        b.score !== a.score
      ) {
        return (
          b.score - a.score
        );
      }

      return a.name.localeCompare(
        b.name
      );
    }
  );

  return results.slice(
    0,
    limit
  );
}

// ======================================================
// RESOLVE STOP QUERY
// ======================================================

function resolveStopCandidates(query) {
  if (!query) {
    return [];
  }

  // Direct GTFS stop ID
  if (stops.has(query)) {
    return [query];
  }

  const cleaned = normalize(query);

  /*
    BUSNETT station aliases.

    GTFS contains multiple platform/terminal stops for the
    same passenger-facing location. These aliases make searches
    such as "Kengeri -> Majestic" resolve to the actual stops
    used by BMTC trips.
  */
  const locationAliases = {
    majestic: [
      "20921_ST",
      "20921",
      "20921_PF19",
      "20922",
      "35931",
    ],

    kengeri: [
      "22167",
      "22168",
      "20925_ST",
      "20925",
      "20926",
      "20925_PF1",
      "20925_PF3",
    ],
  };

  // Use explicit passenger-facing aliases first
  if (locationAliases[cleaned]) {
    return locationAliases[cleaned].filter((id) =>
      stops.has(id)
    );
  }

  const exact = [];
  const partial = [];

  for (const stop of stops.values()) {
    const name = normalize(stop.name);

    if (name === cleaned) {
      exact.push(stop.id);
    } else if (name.includes(cleaned)) {
      partial.push(stop.id);
    }
  }

  /*
    Exact matches first.

    Unlike the old implementation, we keep a much larger
    candidate set so that platform stops are not accidentally
    discarded for broad searches.
  */
  return [
    ...exact,
    ...partial,
  ].slice(0, 200);
}

// ======================================================
// GET ORDERED STOPS FOR PATTERN
// ======================================================

function getOrderedPatternStops(
  pattern
) {
  return Array.from(
    pattern.stops.entries()
  )
    .sort(
      (a, b) => a[1] - b[1]
    )
    .map(
      ([stopId, sequence]) => ({
        stopId,
        sequence,
      })
    );
}

// ======================================================
// FIND DIRECT ROUTES
// ======================================================

function findDirectRoutes(
  fromQuery,
  toQuery
) {
  const originIds =
    resolveStopCandidates(
      fromQuery
    );

  const destinationIds =
    resolveStopCandidates(
      toQuery
    );

  if (
    !originIds.length ||
    !destinationIds.length
  ) {
    return [];
  }

  const originSet =
    new Set(originIds);

  const destinationSet =
    new Set(destinationIds);

  const results = [];

  /*
    Check every actual BMTC route pattern.
  */

  for (const pattern of patterns.values()) {
    const ordered =
      getOrderedPatternStops(
        pattern
      );

    let fromIndex = -1;
    let toIndex = -1;

    /*
      Find the first matching origin.
    */

    for (
      let i = 0;
      i < ordered.length;
      i++
    ) {
      if (
        originSet.has(
          ordered[i].stopId
        )
      ) {
        fromIndex = i;
        break;
      }
    }

    if (fromIndex === -1) {
      continue;
    }

    /*
      Find destination AFTER origin.
    */

    for (
      let i = fromIndex + 1;
      i < ordered.length;
      i++
    ) {
      if (
        destinationSet.has(
          ordered[i].stopId
        )
      ) {
        toIndex = i;
        break;
      }
    }

    if (toIndex === -1) {
      continue;
    }

    const route =
      routes.get(
        pattern.routeId
      );

    if (!route) {
      continue;
    }

    const fromStop =
      stops.get(
        ordered[fromIndex]
          .stopId
      );

    const toStop =
      stops.get(
        ordered[toIndex]
          .stopId
      );

    if (!fromStop || !toStop) {
      continue;
    }

    /*
      Get all stops between origin
      and destination.
    */

    const journeyStops =
      ordered
        .slice(
          fromIndex,
          toIndex + 1
        )
        .map(
          (item) =>
            stops.get(
              item.stopId
            )
        )
        .filter(Boolean);

    results.push({
      routeId:
        route.id,

      routeNumber:
        route.shortName,

      routeName:
        route.longName,

      headsign:
        pattern.headsign,

      directionId:
        pattern.directionId,

      from: {
        id:
          fromStop.id,

        name:
          fromStop.name,

        lat:
          fromStop.lat,

        lng:
          fromStop.lng,
      },

      to: {
        id:
          toStop.id,

        name:
          toStop.name,

        lat:
          toStop.lat,

        lng:
          toStop.lng,
      },

      numberOfStops:
        journeyStops.length - 1,

      stops:
        journeyStops.map(
          (stop) => ({
            id:
              stop.id,

            name:
              stop.name,

            lat:
              stop.lat,

            lng:
              stop.lng,
          })
        ),

      /*
        Passenger-facing SmartOccupancy
        prototype value.
      */

      occupancy:
        getOccupancy(
          route.shortName
        ),

      occupancySource:
        "SmartOccupancy",

      dataSource:
        "BMTC GTFS",
    });
  }

  /*
    Remove duplicate route/direction
    combinations.
  */

  const unique =
    new Map();

  for (const result of results) {
    const key =
      `${result.routeNumber}|${result.directionId}`;

    if (
      !unique.has(key) ||
      result.numberOfStops <
        unique.get(key)
          .numberOfStops
    ) {
      unique.set(
        key,
        result
      );
    }
  }

  return Array.from(
    unique.values()
  ).sort(
    (a, b) =>
      a.numberOfStops -
      b.numberOfStops
  );
}

// ======================================================
// SMART OCCUPANCY
// ======================================================

const occupancy =
  new Map();

function getOccupancy(
  routeNumber
) {
  if (
    !occupancy.has(
      routeNumber
    )
  ) {
    occupancy.set(
      routeNumber,
      Math.floor(
        Math.random() * 51
      ) + 25
    );
  }

  return occupancy.get(
    routeNumber
  );
}

function updateOccupancy() {
  for (
    const [
      route,
      current,
    ] of occupancy
  ) {
    const change =
      Math.floor(
        Math.random() * 9
      ) - 4;

    const next =
      Math.max(
        10,
        Math.min(
          95,
          current + change
        )
      );

    occupancy.set(
      route,
      next
    );
  }
}

setInterval(
  updateOccupancy,
  7000
);

// ======================================================
// JSON RESPONSE
// ======================================================

function sendJSON(
  res,
  status,
  data
) {
  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Methods":
        "GET, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type",
    }
  );

  res.end(
    JSON.stringify(data)
  );
}

// ======================================================
// HTTP SERVER
// ======================================================

const server =
  http.createServer(
    (req, res) => {

      // ----------------------------------------------
      // OPTIONS
      // ----------------------------------------------

      if (
        req.method ===
        "OPTIONS"
      ) {
        res.writeHead(
          204,
          {
            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET, OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type",
          }
        );

        res.end();

        return;
      }

      const url =
        new URL(
          req.url,
          `http://${req.headers.host}`
        );

      const pathname =
        url.pathname;

      // ----------------------------------------------
      // HEALTH
      // ----------------------------------------------

      if (
        pathname ===
        "/api/health"
      ) {
        sendJSON(
          res,
          200,
          {
            success: true,

            message:
              "BUSNETT Cloud API is running",

            engine:
              "SmartOccupancy",

            dataSource:
              "BMTC GTFS",

            gtfsReady,

            stats,
          }
        );

        return;
      }

      // ----------------------------------------------
      // STOP SEARCH
      // ----------------------------------------------

      if (
        pathname ===
        "/api/stops"
      ) {
        if (!gtfsReady) {
          sendJSON(
            res,
            503,
            {
              success: false,

              message:
                "BMTC dataset is still loading.",
            }
          );

          return;
        }

        const query =
          url.searchParams.get(
            "q"
          ) || "";

        const results =
          searchStops(
            query
          );

        sendJSON(
          res,
          200,
          {
            success: true,

            query,

            count:
              results.length,

            stops:
              results,
          }
        );

        return;
      }

      // ----------------------------------------------
      // ROUTE SEARCH
      // ----------------------------------------------

      if (
        pathname ===
        "/api/search"
      ) {
        if (!gtfsReady) {
          sendJSON(
            res,
            503,
            {
              success: false,

              message:
                "BMTC dataset is still loading.",
            }
          );

          return;
        }

        const from =
          url.searchParams.get(
            "from"
          );

        const to =
          url.searchParams.get(
            "to"
          );

        if (!from || !to) {
          sendJSON(
            res,
            400,
            {
              success: false,

              message:
                "Both from and to are required.",
            }
          );

          return;
        }

        console.log(
          `🔎 ${from} → ${to}`
        );

        const results =
          findDirectRoutes(
            from,
            to
          );

        console.log(
          `   🚌 ${results.length} direct routes found`
        );

        sendJSON(
          res,
          200,
          {
            success: true,

            from,

            to,

            count:
              results.length,

            directRoutes:
              results,
          }
        );

        return;
      }

      // ----------------------------------------------
      // ALL BMTC ROUTES
      // ----------------------------------------------

      if (
        pathname ===
        "/api/routes"
      ) {
        if (!gtfsReady) {
          sendJSON(
            res,
            503,
            {
              success: false,

              message:
                "BMTC dataset is still loading.",
            }
          );

          return;
        }

        sendJSON(
          res,
          200,
          {
            success: true,

            count:
              routes.size,

            routes:
              Array.from(
                routes.values()
              ),
          }
        );

        return;
      }

      // ----------------------------------------------
      // BUSNETT LIVE BUS DATA
      // ----------------------------------------------

      if (
        pathname ===
        "/api/buses"
      ) {
        const buses = [
          {
            bus: "401K",

            occupancy:
              getOccupancy(
                "401K"
              ),

            eta: 4,

            capacity: 100,

            route:
              "Kengeri → Majestic",

            status:
              "On Time",
          },

          {
            bus: "500D",

            occupancy:
              getOccupancy(
                "500D"
              ),

            eta: 7,

            capacity: 100,

            route:
              "Kengeri → Majestic",

            status:
              "On Time",
          },

          {
            bus: "500A",

            occupancy:
              getOccupancy(
                "500A"
              ),

            eta: 11,

            capacity: 100,

            route:
              "Kengeri → Shivajinagar",

            status:
              "On Time",
          },
        ];

        sendJSON(
          res,
          200,
          {
            success: true,

            source:
              "BUSNETT Cloud",

            engine:
              "SmartOccupancy",

            updatedAt:
              new Date().toISOString(),

            buses,
          }
        );

        return;
      }

      // ----------------------------------------------
      // 404
      // ----------------------------------------------

      sendJSON(
        res,
        404,
        {
          success: false,

          message:
            "API endpoint not found",
        }
      );
    }
  );

// ======================================================
// INITIALIZATION
// ======================================================

async function initialize() {
  try {
    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      "🚍 BUSNETT REAL BMTC BACKEND"
    );
    console.log(
      "=========================================="
    );
    console.log("");

    console.log(
      `📂 Dataset: ${GTFS_DIR}`
    );

    if (
      !fs.existsSync(
        GTFS_DIR
      )
    ) {
      throw new Error(
        `BMTC dataset not found at ${GTFS_DIR}`
      );
    }

    await loadStops();

    await loadRoutes();

    await loadTrips();

    await loadStopTimes();

    gtfsReady = true;

    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      "✅ BMTC GTFS READY"
    );
    console.log(
      "=========================================="
    );

    console.log(
      `🚏 Stops: ${stats.stops.toLocaleString()}`
    );

    console.log(
      `🚌 Routes: ${stats.routes.toLocaleString()}`
    );

    console.log(
      `🧭 Trips: ${stats.trips.toLocaleString()}`
    );

    console.log(
      `📍 Stop-time records: ${stats.stopTimes.toLocaleString()}`
    );

    console.log(
      `🛣️ Route patterns: ${stats.patterns.toLocaleString()}`
    );

    console.log("");

    console.log(
      "🔎 Real BMTC route search: READY"
    );

    console.log(
      "🧠 SmartOccupancy: ACTIVE"
    );

    console.log(
      "📱 BUSNETT passenger API: READY"
    );

    console.log("");
  } catch (error) {
    console.error("");
    console.error(
      "❌ BMTC initialization failed"
    );
    console.error(error);
    console.error("");
  }
}

// ======================================================
// START
// ======================================================

server.listen(
  PORT,
  () => {
    console.log(
      `☁️ BUSNETT Cloud API: http://localhost:${PORT}`
    );

    console.log(
      "🧠 SmartOccupancy Engine active"
    );

    initialize();
  }
);