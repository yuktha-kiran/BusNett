const http = require("http");

const PORT = 5000;

// Simulated cloud data coming from BMTC systems
let buses = [
  {
    bus: "401K",
    occupancy: 34,
    eta: 4,
    capacity: 100,
    route: "Kengeri → Majestic",
    status: "On Time",
  },
  {
    bus: "500D",
    occupancy: 68,
    eta: 7,
    capacity: 100,
    route: "Kengeri → Majestic",
    status: "On Time",
  },
  {
    bus: "500A",
    occupancy: 48,
    eta: 11,
    capacity: 100,
    route: "Kengeri → Shivajinagar",
    status: "On Time",
  },
];

const server = http.createServer((req, res) => {
  // Allow BUSNETT frontend to access the API
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  // Cloud bus data endpoint
  if (req.method === "GET" && req.url === "/api/buses") {
    res.writeHead(200);

    res.end(
      JSON.stringify({
        success: true,
        source: "BUSNETT Cloud",
        updatedAt: new Date().toISOString(),
        buses,
      })
    );

    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200);

    res.end(
      JSON.stringify({
        success: true,
        message: "BUSNETT Cloud API is running",
      })
    );

    return;
  }

  // Unknown route
  res.writeHead(404);

  res.end(
    JSON.stringify({
      success: false,
      message: "API endpoint not found",
    })
  );
});

server.listen(PORT, () => {
  console.log(`☁️ BUSNETT Cloud API running at http://localhost:${PORT}`);
});