const http = require("http");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");

const PORT = 5000;

const GTFS_DIR = path.join(__dirname, "..", "data", "bmtc");

const STOPS_FILE = path.join(GTFS_DIR, "stops.txt");
const ROUTES_FILE = path.join(GTFS_DIR, "routes.txt");
const TRIPS_FILE = path.join(GTFS_DIR, "trips.txt");
const STOP_TIMES_FILE = path.join(GTFS_DIR, "stop_times.txt");

// ======================================================
// OPTIONAL PASSENGER ACCOUNT STORE
// ======================================================

const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
const sessions = new Map();

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
      fs.writeFileSync(USERS_FILE, "[]", "utf8");
    }

    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "[]");
  } catch (error) {
    console.error("Unable to load BUSNETT users:", error);
    return [];
  }
}

let users = loadUsers();

function saveUsers() {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, storedHash, salt) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(storedHash, "hex")
  );
}

function publicUser(user, token) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    token,
  };
}

function getAuthenticatedUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7);
  const userId = sessions.get(token);
  if (!userId) return null;

  return users.find((user) => user.id === userId) || null;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}


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
  console.log("Loading BMTC stops...");

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
    `${stats.stops.toLocaleString()} stops loaded`
  );
}

// ======================================================
// LOAD ROUTES
// ======================================================

async function loadRoutes() {
  console.log("Loading BMTC routes...");

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
    `${stats.routes.toLocaleString()} routes loaded`
  );
}

// ======================================================
// LOAD TRIPS
// ======================================================

async function loadTrips() {
  console.log("Loading BMTC trips...");

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
    `${stats.trips.toLocaleString()} trips loaded`
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
  console.log("Processing stop_times.txt...");
  console.log(
    "Building BMTC route-stop index..."
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
    `${stats.stopTimes.toLocaleString()} stop-time records processed`
  );

  console.log(
    `${stats.patterns.toLocaleString()} route patterns created`
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
// SMART OCCUPANCY + LIVE BUS SIMULATOR
// ======================================================

/*
  Exhibition-safe simulation of the data pipeline BUSNETT would
  receive from BMTC's live systems.

  GPS simulation:
    - Uses real BMTC GTFS stop coordinates.
    - A demo bus moves continuously between the real stops on its
      selected route pattern.
    - ETA is calculated from the simulated position and speed.

  SmartOccupancy simulation:
    - Uses simulated, anonymized ticket transactions.
    - Each ticket contains only boarding stop + destination stop.
    - When a bus reaches a stop, passengers whose destination is that
      stop alight and new ticket transactions board.
    - Occupancy follows: O_new = O_previous - Alighting + Boarding.
*/

const DEMO_BUS_CONFIG = {
  "401K": {
    capacity: 60,
    speedKmh: 24,
    startOccupancy: 32,
    from: "Kengeri",
    to: "Majestic",
  },
  "500D": {
    capacity: 60,
    speedKmh: 22,
    startOccupancy: 41,
    from: "Kengeri",
    to: "Majestic",
  },
  "500A": {
    capacity: 60,
    speedKmh: 25,
    startOccupancy: 29,
    from: "Kengeri",
    to: "Shivajinagar",
  },
};

const simulatedBuses = new Map();

function distanceKm(a, b) {
  if (!a || !b) return 0;
  const lat1 = Number(a.lat) * Math.PI / 180;
  const lat2 = Number(b.lat) * Math.PI / 180;
  const dLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
  const dLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function findDemoRoute(routeNumber, from, to) {
  if (!gtfsReady) return null;
  const matches = findDirectRoutes(from, to).filter(
    (route) => String(route.routeNumber).toUpperCase() === String(routeNumber).toUpperCase()
  );
  return matches[0] || null;
}

function createTicketSimulation(bus, routeStops) {
  // Deterministic ticket set for the prototype. No passenger identity is stored.
  const tickets = [];
  const start = Math.min(3, Math.max(1, routeStops.length - 1));

  for (let i = 0; i < 18; i++) {
    const boardingIndex = Math.min(start, Math.floor(i / 6));
    const destinationIndex = Math.min(
      routeStops.length - 1,
      boardingIndex + 2 + (i % Math.max(1, routeStops.length - boardingIndex - 1))
    );
    if (destinationIndex <= boardingIndex) continue;

    tickets.push({
      id: `${bus}-T${i + 1}`,
      boardingStopIndex: boardingIndex,
      destinationStopIndex: destinationIndex,
    });
  }

  return tickets;
}

function initializeDemoBuses() {
  if (!gtfsReady) return;

  for (const [routeNumber, config] of Object.entries(DEMO_BUS_CONFIG)) {
    const route = findDemoRoute(routeNumber, config.from, config.to);
    if (!route || !Array.isArray(route.stops) || route.stops.length < 2) {
      console.log(`Demo route ${routeNumber} could not be initialized from GTFS.`);
      continue;
    }

    const now = Date.now();
    simulatedBuses.set(routeNumber, {
      routeNumber,
      routeId: route.routeId,
      headsign: route.headsign,
      routeName: route.routeName,
      stops: route.stops,
      capacity: config.capacity,
      speedKmh: config.speedKmh,
      from: config.from,
      to: config.to,
      segmentIndex: 0,
      segmentProgress: 0.18,
      lastUpdate: now,
      lastProcessedStop: -1,
      occupancy: config.startOccupancy,
      tickets: createTicketSimulation(routeNumber, route.stops),
      startedAt: now,
    });
  }

  console.log(`Live bus simulator initialized for ${simulatedBuses.size} demo buses.`);
}

function processStopTransactions(bus, stopIndex) {
  const alighting = bus.tickets.filter(
    (ticket) => ticket.destinationStopIndex === stopIndex
  ).length;

  const boarding = 2 + ((stopIndex * 3 + bus.routeNumber.length) % 7);

  bus.tickets = bus.tickets.filter(
    (ticket) => ticket.destinationStopIndex !== stopIndex
  );

  bus.occupancy = Math.max(
    0,
    Math.min(bus.capacity, bus.occupancy - alighting + boarding)
  );

  // Add a new anonymized ticket batch for the next part of the route.
  const maxDestination = bus.stops.length - 1;
  for (let i = 0; i < boarding; i++) {
    const destinationStopIndex = Math.min(
      maxDestination,
      stopIndex + 1 + ((i + stopIndex) % Math.max(1, maxDestination - stopIndex))
    );

    if (destinationStopIndex > stopIndex) {
      bus.tickets.push({
        id: `${bus.routeNumber}-${Date.now()}-${i}`,
        boardingStopIndex: stopIndex,
        destinationStopIndex,
      });
    }
  }

  return { boarding, alighting };
}

function updateSimulatedBus(bus) {
  const now = Date.now();
  const elapsedSeconds = Math.max(0, (now - bus.lastUpdate) / 1000);
  bus.lastUpdate = now;

  let remainingDistance = bus.speedKmh * (elapsedSeconds / 3600);
  let transactionSummary = { boarding: 0, alighting: 0 };

  while (remainingDistance > 0 && bus.segmentIndex < bus.stops.length - 1) {
    const fromStop = bus.stops[bus.segmentIndex];
    const toStop = bus.stops[bus.segmentIndex + 1];
    const segmentDistance = Math.max(0.05, distanceKm(fromStop, toStop));
    const remainingOnSegment = segmentDistance * (1 - bus.segmentProgress);

    if (remainingDistance < remainingOnSegment) {
      bus.segmentProgress += remainingDistance / segmentDistance;
      remainingDistance = 0;
    } else {
      remainingDistance -= remainingOnSegment;
      bus.segmentIndex += 1;
      bus.segmentProgress = 0;

      if (bus.segmentIndex !== bus.lastProcessedStop) {
        const result = processStopTransactions(bus, bus.segmentIndex);
        transactionSummary.boarding += result.boarding;
        transactionSummary.alighting += result.alighting;
        bus.lastProcessedStop = bus.segmentIndex;
      }
    }
  }

  // Restart the demonstration once the bus reaches the final stop.
  if (bus.segmentIndex >= bus.stops.length - 1) {
    bus.segmentIndex = 0;
    bus.segmentProgress = 0;
    bus.lastProcessedStop = -1;
    bus.tickets = createTicketSimulation(bus.routeNumber, bus.stops);
    bus.occupancy = Math.max(20, Math.min(bus.capacity, bus.occupancy));
  }

  return transactionSummary;
}

function getSimulatedBusData(bus) {
  updateSimulatedBus(bus);

  const currentStop = bus.stops[bus.segmentIndex];
  const nextStop = bus.stops[Math.min(bus.segmentIndex + 1, bus.stops.length - 1)];

  const lat = currentStop.lat + (nextStop.lat - currentStop.lat) * bus.segmentProgress;
  const lng = currentStop.lng + (nextStop.lng - currentStop.lng) * bus.segmentProgress;

  const remainingToNext = Math.max(
    0,
    distanceKm({ lat, lng }, nextStop)
  );

  const etaMinutes = Math.max(
    0,
    Math.ceil((remainingToNext / bus.speedKmh) * 60)
  );

  const occupancyPercent = Math.round((bus.occupancy / bus.capacity) * 100);

  return {
    bus: bus.routeNumber,
    routeId: bus.routeId,
    route: `${bus.from} → ${bus.to}`,
    headsign: bus.headsign || bus.to,
    status: "On Time",
    capacity: bus.capacity,
    occupancy: bus.occupancy,
    occupancyPercent,
    occupancySource: "SmartOccupancy — simulated ticket transactions",
    eta: etaMinutes,
    etaSource: "Simulated GPS position + route distance + speed",
    speedKmh: bus.speedKmh,
    currentStop: currentStop.name,
    nextStop: nextStop.name,
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    routeStops: bus.stops,
  };
}

function getLiveDemoBuses() {
  return Array.from(simulatedBuses.values()).map(getSimulatedBusData);
}

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
        "GET, POST, DELETE, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",
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
    async (req, res) => {

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
              "GET, POST, DELETE, OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type, Authorization",
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
      // OPTIONAL AUTHENTICATION
      // ----------------------------------------------

      if (
        req.method === "POST" &&
        (pathname === "/api/auth/signup" ||
          pathname === "/api/auth/login")
      ) {
        try {
          const body = await readRequestBody(req);
          const email = String(body.email || "").trim().toLowerCase();
          const password = String(body.password || "");
          const name = String(body.name || "").trim();

          if (!email || !password) {
            sendJSON(res, 400, {
              success: false,
              message: "Email and password are required.",
            });
            return;
          }

          if (password.length < 6) {
            sendJSON(res, 400, {
              success: false,
              message: "Password must be at least 6 characters.",
            });
            return;
          }

          if (pathname === "/api/auth/signup") {
            if (!name) {
              sendJSON(res, 400, {
                success: false,
                message: "Name is required.",
              });
              return;
            }

            if (users.some((user) => user.email === email)) {
              sendJSON(res, 409, {
                success: false,
                message: "An account with this email already exists.",
              });
              return;
            }

            const { salt, hash } = hashPassword(password);

            const user = {
              id: crypto.randomUUID(),
              name,
              email,
              passwordHash: hash,
              passwordSalt: salt,
              trips: [],
              createdAt: new Date().toISOString(),
            };

            users.push(user);
            saveUsers();

            const token = crypto.randomBytes(32).toString("hex");
            sessions.set(token, user.id);

            sendJSON(res, 201, {
              success: true,
              user: publicUser(user, token),
            });
            return;
          }

          const user = users.find((item) => item.email === email);

          if (
            !user ||
            !verifyPassword(
              password,
              user.passwordHash,
              user.passwordSalt
            )
          ) {
            sendJSON(res, 401, {
              success: false,
              message: "Email or password is incorrect.",
            });
            return;
          }

          const token = crypto.randomBytes(32).toString("hex");
          sessions.set(token, user.id);

          sendJSON(res, 200, {
            success: true,
            user: publicUser(user, token),
          });
          return;
        } catch (error) {
          sendJSON(res, 400, {
            success: false,
            message: error.message || "Unable to process account request.",
          });
          return;
        }
      }

      // ----------------------------------------------
      // OPTIONAL SAVED TRIPS
      // ----------------------------------------------

      if (
        pathname === "/api/trips" &&
        req.method === "POST"
      ) {
        const user = getAuthenticatedUser(req);

        if (!user) {
          sendJSON(res, 401, {
            success: false,
            message: "Login is required to save trips.",
          });
          return;
        }

        try {
          const body = await readRequestBody(req);

          const from = String(body.from || "").trim();
          const to = String(body.to || "").trim();
          const busNumber = String(body.busNumber || "").trim();
          const routeId = String(body.routeId || "").trim();

          if (!from || !to || !busNumber) {
            sendJSON(res, 400, {
              success: false,
              message: "From, to and bus number are required.",
            });
            return;
          }

          const alreadySaved = user.trips.some(
            (trip) =>
              trip.from.toLowerCase() === from.toLowerCase() &&
              trip.to.toLowerCase() === to.toLowerCase() &&
              trip.busNumber.toUpperCase() === busNumber.toUpperCase()
          );

          if (!alreadySaved) {
            user.trips.unshift({
              id: crypto.randomUUID(),
              from,
              to,
              busNumber,
              routeId,
              savedAt: new Date().toISOString(),
            });

            user.trips = user.trips.slice(0, 10);
            saveUsers();
          }

          sendJSON(res, 200, {
            success: true,
            trips: user.trips,
          });
          return;
        } catch (error) {
          sendJSON(res, 400, {
            success: false,
            message: error.message || "Unable to save trip.",
          });
          return;
        }
      }

      if (
        pathname.startsWith("/api/trips/") &&
        req.method === "DELETE"
      ) {
        const user = getAuthenticatedUser(req);

        if (!user) {
          sendJSON(res, 401, {
            success: false,
            message: "Login is required.",
          });
          return;
        }

        const tripId = pathname.split("/").pop();
        user.trips = user.trips.filter((trip) => trip.id !== tripId);
        saveUsers();

        sendJSON(res, 200, {
          success: true,
          trips: user.trips,
        });
        return;
      }

      if (
        pathname.startsWith("/api/users/") &&
        pathname.endsWith("/trips") &&
        req.method === "GET"
      ) {
        const user = getAuthenticatedUser(req);
        const requestedUserId = pathname.split("/")[3];

        if (!user || user.id !== requestedUserId) {
          sendJSON(res, 401, {
            success: false,
            message: "Unauthorized.",
          });
          return;
        }

        sendJSON(res, 200, {
          success: true,
          trips: user.trips || [],
        });
        return;
      }

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
          `${from} → ${to}`
        );

        const results =
          findDirectRoutes(
            from,
            to
          );

        console.log(
          `   ${results.length} direct routes found`
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
        if (!gtfsReady) {
          sendJSON(res, 503, {
            success: false,
            message: "BMTC dataset is still loading.",
          });
          return;
        }

        const buses = getLiveDemoBuses();

        sendJSON(res, 200, {
          success: true,
          source: "BUSNETT Cloud",
          engine: "SmartOccupancy",
          updatedAt: new Date().toISOString(),
          simulation: {
            gps: true,
            ticketTransactions: true,
            formula: "O_new = O_previous - Alighting + Boarding",
          },
          buses,
        });

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
      "BUSNETT REAL BMTC BACKEND"
    );
    console.log(
      "=========================================="
    );
    console.log("");

    console.log(
      `Dataset: ${GTFS_DIR}`
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

    initializeDemoBuses();

    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      "BMTC GTFS READY"
    );
    console.log(
      "=========================================="
    );

    console.log(
      `Stops: ${stats.stops.toLocaleString()}`
    );

    console.log(
      `Routes: ${stats.routes.toLocaleString()}`
    );

    console.log(
      `Trips: ${stats.trips.toLocaleString()}`
    );

    console.log(
      `Stop-time records: ${stats.stopTimes.toLocaleString()}`
    );

    console.log(
      `Route patterns: ${stats.patterns.toLocaleString()}`
    );

    console.log("");

    console.log(
      "Real BMTC route search: READY"
    );

    console.log(
      "SmartOccupancy: ACTIVE"
    );

    console.log(
      "BUSNETT passenger API: READY"
    );

    console.log("");
  } catch (error) {
    console.error("");
    console.error(
      "BMTC initialization failed"
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
      `BUSNETT Cloud API: http://localhost:${PORT}`
    );

    console.log(
      "SmartOccupancy Engine active"
    );

    initialize();
  }
);