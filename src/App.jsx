import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BusFront,
  MapPin,
  Search,
  Bell,
  Navigation,
  ChevronRight,
  Clock3,
  Users,
  Star,
  Home,
  Ticket,
  UserRound,
  ArrowLeft,
  Radio,
  LogOut,
  BarChart3,
  AlertTriangle,
  Activity,
  TrendingUp,
  Gauge,
  RefreshCw,
} from "lucide-react";
import "./App.css";

const buses = [
  {
    number: "401K",
    destination: "Majestic",
    eta: "4 min",
    occupancy: 32,
    duration: "28 min",
    fare: "₹15",
    recommended: true,
  },
  {
    number: "500D",
    destination: "Majestic",
    eta: "7 min",
    occupancy: 68,
    duration: "24 min",
    fare: "₹18",
    recommended: false,
  },
  {
    number: "500A",
    destination: "Shivajinagar",
    eta: "11 min",
    occupancy: 48,
    duration: "31 min",
    fare: "₹15",
    recommended: false,
  },
];
function getSmartRecommendation(buses) {
  if (!buses || buses.length === 0) return null;

  const scoredBuses = buses.map((bus) => {
    const occupancy = bus.occupancy ?? 100;
    const eta = parseInt(bus.eta) || 99;
    const duration = parseInt(bus.duration) || 99;

    // Lower score = better choice
    const score =
      occupancy * 0.6 +
      eta * 4 +
      duration * 0.5;

    return {
      ...bus,
      score,
    };
  });

  scoredBuses.sort((a, b) => a.score - b.score);

  const best = scoredBuses[0];

  return {
    bus: best,
    reason:
      best.occupancy <= 40
        ? "Low crowding and a quick arrival"
        : best.occupancy <= 65
        ? "Good balance of arrival time and crowding"
        : "Best available option right now",
  };
}

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [activeScreen, setActiveScreen] = useState("home");
 const [selectedBus, setSelectedBus] = useState(null);
const [busOccupancies, setBusOccupancies] = useState({
  "401K": 32,
  "500D": 68,
  "500A": 48,
});
  const [cloudOccupancies, setCloudOccupancies] = useState({
    "401K": 32,
    "500D": 68,
    "500A": 48,
  });

  const [lastSynced, setLastSynced] = useState(new Date());

  useEffect(() => {
    const syncCloudData = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/buses");

        if (!response.ok) {
          throw new Error("Cloud API request failed");
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.buses)) {
          const occupancyData = {};

          data.buses.forEach((bus) => {
            occupancyData[bus.bus] = bus.occupancy;
          });

          setCloudOccupancies(occupancyData);
          setBusOccupancies(occupancyData);
          setLastSynced(new Date(data.updatedAt));
        }
      } catch (error) {
        console.error("BUSNETT cloud sync failed:", error);
      }
    };

    syncCloudData();

    const interval = setInterval(syncCloudData, 7000);

    return () => clearInterval(interval);
  }, []);

  const goToTab = (tab) => {
    setActiveTab(tab);
    setActiveScreen(tab);
  };
const updateOccupancy = (busNumber, newOccupancy) => {
    const clampedOccupancy = Math.max(0, Math.min(100, newOccupancy));

    setBusOccupancies((prev) => ({
      ...prev,
      [busNumber]: clampedOccupancy,
    }));

    setSelectedBus((prev) =>
      prev && prev.number === busNumber
        ? { ...prev, occupancy: clampedOccupancy }
        : prev
    );
  };
  const liveBuses = buses.map((bus) => ({
    ...bus,
    occupancy: busOccupancies[bus.number],
  }));

  const smartRecommendation = getSmartRecommendation(liveBuses);
  const displayBuses = liveBuses.map((bus) => ({
  ...bus,
  recommended:
    smartRecommendation?.bus?.number === bus.number,
}));
  return (
    <div className="app">
      <div className="phone-shell">

        <header className="topbar">
            <div>
              <p className="greeting">Good evening 👋</p>
              <h1>BUSNETT</h1>
            </div>

            <button className="icon-button">
              <Bell size={21} />
              <span className="notification-dot" />
            </button>
        </header>

        <main className="content">

          {activeScreen === "home" && (
            <HomeScreen
  lastSynced={lastSynced}
  buses={displayBuses}
  onSearch={() => setActiveScreen("search")}
  onNearby={() => setActiveScreen("nearby")}
/>
          )}

          {activeScreen === "search" && (
            <SearchScreen
  buses={displayBuses}
  onBack={() => setActiveScreen("home")}
  onSelectBus={(bus) => {
                setSelectedBus(bus);
                setActiveScreen("details");
              }}
            />
          )}

          {activeScreen === "nearby" && (
            <NearbyBusesScreen
              buses={displayBuses}
              onBack={() => setActiveScreen("home")}
              onSelectBus={(bus) => {
                setSelectedBus(bus);
                setActiveScreen("details");
              }}
              onTrackBus={(bus) => {
                setSelectedBus(bus);
                setActiveScreen("tracking");
              }}
            />
          )}

          {activeScreen === "details" && selectedBus && (
            <BusDetailsScreen
              bus={selectedBus}
              onBack={() => setActiveScreen("search")}
              onTrack={() => setActiveScreen("tracking")}
            />
          )}

          {activeScreen === "tracking" && selectedBus && (
            <TrackingScreen
              bus={selectedBus}
              onBack={() => setActiveScreen("details")}
            />
          )}

          {activeScreen === "trips" && <TripsScreen />}
          {activeScreen === "pass" && <PassScreen />}

          {activeScreen === "profile" && (
            <ProfileScreen onAuth={() => setActiveScreen("auth")} />
          )}

          {activeScreen === "auth" && (
            <AuthScreen onBack={() => setActiveScreen("profile")} />
          )}

        </main>

        <nav className="bottom-nav">

            <NavItem
              icon={<Home size={21} />}
              label="Home"
              active={activeTab === "home"}
              onClick={() => goToTab("home")}
            />

            <NavItem
              icon={<BusFront size={21} />}
              label="Trips"
              active={activeTab === "trips"}
              onClick={() => goToTab("trips")}
            />

            <NavItem
              icon={<Ticket size={21} />}
              label="Pass"
              active={activeTab === "pass"}
              onClick={() => goToTab("pass")}
            />

            <NavItem
              icon={<UserRound size={21} />}
              label="Profile"
              active={activeTab === "profile"}
              onClick={() => goToTab("profile")}
            />

        </nav>

      </div>
    </div>
  );
}


/* =========================
   HOME
========================= */

function HomeScreen({ buses, onSearch, lastSynced, onNearby }) {
    const recommendation = getSmartRecommendation(buses);
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#e8f7f0",
          borderRadius: "14px",
          padding: "9px 12px",
          marginBottom: "12px",
          color: "#16865b",
          fontSize: "10px",
          fontWeight: "800",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#16865b",
              boxShadow: "0 0 0 4px rgba(22,134,91,0.10)",
            }}
          />
          CLOUD DATA SYNCED
        </span>

        <span style={{ color: "#64748b", fontWeight: "600" }}>
          {lastSynced.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>

      <section className="location-card">

        <div className="location-row">

          <MapPin size={18} />

          <div>
            <span>Current location</span>
            <strong>Kengeri</strong>
          </div>

          <ChevronRight size={18} />

        </div>

      </section>


      <section className="search-card">

        <div className="search-title">

          <div>
            <span>Where are you going?</span>
            <h2>Find your bus</h2>
          </div>

          <Search size={23} />

        </div>


        <div className="route-input">

          <div className="route-dot start" />

          <div>
            <small>FROM</small>
            <p>Kengeri</p>
          </div>

        </div>


        <div className="route-line" />


        <div className="route-input">

          <div className="route-dot end" />

          <div>
            <small>TO</small>
            <p>Majestic</p>
          </div>

        </div>


        <button
          className="search-button"
          onClick={onSearch}
        >
          <Search size={18} />
          Search buses
        </button>

      </section>


      <section className="quick-actions">

        <button onClick={onNearby}>
          <div className="quick-icon">
            <Navigation size={19} />
          </div>
          <span>Nearby buses</span>
        </button>

        <button>
          <div className="quick-icon">
            <Ticket size={19} />
          </div>
          <span>My pass</span>
        </button>

        <button>
          <div className="quick-icon">
            <Star size={19} />
          </div>
          <span>Saved</span>
        </button>

      </section>


      <section className="section">

        <div className="section-heading">

          <div>
            <span className="eyebrow">
              SMART ROUTES
            </span>

            <h2>Best buses for you</h2>
          </div>

          <button className="see-all">
            See all
          </button>

        </div>


        <div className="bus-list">

          {buses.map((bus) => (
            <BusCard
              key={bus.number}
              bus={bus}
            />
          ))}

        </div>

      </section>


      <section className="insight-card">

        <div className="insight-icon">
          <Users size={20} />
        </div>

        <div className="insight-content">

          <span>SMART INSIGHT</span>

          <h3>
  Take {recommendation?.bus?.number || "the best available bus"}
</h3>

<p>
  {recommendation?.bus?.eta || "--"} away ·{" "}
  {recommendation?.bus?.occupancy ?? "--"}% occupied.{" "}
  {recommendation?.reason || "Best available option right now"}.
</p>

        </div>

        <ChevronRight size={18} />

      </section>
    </>
  );
}


/* =========================
   NEARBY BUSES
========================= */

function NearbyBusesScreen({ buses, onBack, onSelectBus, onTrackBus }) {
  const sortedBuses = [...buses].sort(
    (a, b) => (parseInt(a.eta) || 99) - (parseInt(b.eta) || 99)
  );

  const recommendation = getSmartRecommendation(buses);

  return (
    <>
      <div className="search-page-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="eyebrow">NEARBY</span>
          <h2>Nearby buses</h2>
        </div>
      </div>

      <section
        style={{
          background: "#e8f7f0",
          borderRadius: "20px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div className="quick-icon">
            <MapPin size={18} />
          </div>

          <div>
            <span
              style={{
                display: "block",
                fontSize: "10px",
                fontWeight: "800",
                color: "#16865b",
                letterSpacing: "0.8px",
              }}
            >
              CURRENT STOP
            </span>

            <strong
              style={{
                display: "block",
                marginTop: "3px",
                fontSize: "16px",
                color: "#0f172a",
              }}
            >
              Kengeri
            </strong>
          </div>
        </div>

        <p
          style={{
            margin: "12px 0 0",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          Buses approaching your nearby stop, powered by BUSNETT's
          cloud-synced transit data.
        </p>
      </section>

      <div className="results-header">
        <div>
          <span className="eyebrow">LIVE ARRIVALS</span>
          <h3>Coming your way</h3>
        </div>

        <span className="result-count">
          {sortedBuses.length} buses
        </span>
      </div>

      <div className="bus-list">
        {sortedBuses.map((bus) => (
          <article
            key={bus.number}
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "18px",
              padding: "15px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "18px",
                      color: "#0f172a",
                    }}
                  >
                    {bus.number}
                  </strong>

                  {recommendation?.bus?.number === bus.number && (
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: "800",
                        color: "#16865b",
                        background: "#e8f7f0",
                        padding: "4px 7px",
                        borderRadius: "7px",
                      }}
                    >
                      BEST PICK
                    </span>
                  )}
                </div>

                <span
                  style={{
                    display: "block",
                    marginTop: "4px",
                    fontSize: "12px",
                    color: "#64748b",
                  }}
                >
                  Kengeri → {bus.destination}
                </span>
              </div>

              <div style={{ textAlign: "right" }}>
                <strong
                  style={{
                    display: "block",
                    fontSize: "20px",
                    color: "#0f172a",
                  }}
                >
                  {bus.eta}
                </strong>

                <span
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                  }}
                >
                  away
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                marginTop: "13px",
                paddingTop: "11px",
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                }}
              >
                <Users
                  size={13}
                  style={{
                    verticalAlign: "middle",
                    marginRight: "4px",
                  }}
                />
                {bus.occupancy}% occupied
              </span>

              <button
                onClick={() => onSelectBus(bus)}
                style={{
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  borderRadius: "9px",
                  padding: "8px 11px",
                  fontSize: "10px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                View details
              </button>

              <button
                onClick={() => onTrackBus(bus)}
                style={{
                  border: "1px solid #dbe3ea",
                  background: "#ffffff",
                  color: "#0f172a",
                  borderRadius: "9px",
                  padding: "8px 11px",
                  fontSize: "10px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                Track
              </button>
            </div>
          </article>
        ))}
      </div>

      <section
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "18px",
          padding: "15px",
          marginTop: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            marginBottom: "6px",
          }}
        >
          <Activity size={18} />

          <strong
            style={{
              fontSize: "13px",
              color: "#0f172a",
            }}
          >
            BUSNETT live intelligence
          </strong>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "12px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          {recommendation?.bus?.number
            ? `${recommendation.bus.number} is currently the best balance of arrival time and estimated crowding.`
            : "Live bus intelligence is currently unavailable."}
        </p>
      </section>
    </>
  );
}


/* =========================
   SEARCH SCREEN
========================= */

function SearchScreen({ buses, onBack, onSelectBus }) {
    const recommendation = getSmartRecommendation(buses);
  return (
    <>
      <div className="search-page-header">

        <button
          className="back-button"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="eyebrow">
            YOUR ROUTE
          </span>

          <h2>Available buses</h2>
        </div>

      </div>


      <div className="selected-route">

        <div className="selected-stop">

          <div className="route-dot start" />

          <div>
            <small>FROM</small>
            <strong>Kengeri</strong>
          </div>

        </div>


        <div className="route-connector" />


        <div className="selected-stop">

          <div className="route-dot end" />

          <div>
            <small>TO</small>
            <strong>Majestic</strong>
          </div>

        </div>

      </div>


      <div className="results-header">

        <div>
          <span className="eyebrow">
            SMART MATCH
          </span>

          <h3>Best options</h3>
        </div>

        <span className="result-count">
          3 buses
        </span>

      </div>


      <div className="bus-list">

        {buses.map((bus) => (
          <BusCard
            key={bus.number}
            bus={bus}
            onClick={() => onSelectBus(bus)}
          />
        ))}

      </div>


      <div className="recommendation-banner">

        <div className="insight-icon">
          <Star
            size={19}
            fill="currentColor"
          />
        </div>

        <div>

          <span>BUSNETT RECOMMENDS</span>

         <strong>
  {recommendation?.bus?.number || "Best bus"} is the best balance
</strong>

<p>
  {recommendation?.bus?.eta || "--"} away ·{" "}
  {recommendation?.bus?.occupancy ?? "--"}% occupied.{" "}
  {recommendation?.reason || "Best available option right now"}.
</p>

        </div>

      </div>

    </>
  );
}


/* =========================
   BUS DETAILS
========================= */

function BusDetailsScreen({ bus, onBack, onTrack }) {

  const forecast = [
    {
      stop: "Kengeri",
      occupancy: bus.occupancy,
    },
    {
      stop: "RR Nagar",
      occupancy: Math.min(bus.occupancy + 8, 100),
    },
    {
      stop: "Vijayanagar",
      occupancy: Math.min(bus.occupancy + 17, 100),
    },
    {
      stop: "Majestic",
      occupancy: Math.min(bus.occupancy + 24, 100),
    },
  ];
    const crowdingTrend =
    forecast[forecast.length - 1].occupancy > bus.occupancy
      ? "Crowding expected to increase"
      : "Crowding expected to remain stable";

  const trendDescription =
    forecast[forecast.length - 1].occupancy > bus.occupancy
      ? `BUSNETT predicts higher occupancy toward ${bus.destination}.`
      : `BUSNETT predicts relatively stable occupancy toward ${bus.destination}.`;

  const getStatus = (occupancy) => {
    if (occupancy < 45) {
      return "Plenty of space";
    }

    if (occupancy < 70) {
      return "Moderately crowded";
    }

    return "High crowding";
  };

  return (
    <>
      <div className="details-header">

        <button
          className="back-button"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="eyebrow">
            BUS DETAILS
          </span>

          <h2>{bus.number}</h2>
        </div>

      </div>


      <section className="bus-hero">

        <div className="hero-bus-icon">
          <BusFront size={30} />
        </div>

        <div className="hero-bus-info">

          <span>Next bus to</span>

          <h2>{bus.destination}</h2>

          <p>
            Arriving in <strong>{bus.eta}</strong>
          </p>

        </div>

      </section>


      <section className="occupancy-card">

        <div className="occupancy-heading">

          <div>
            <span>ESTIMATED OCCUPANCY</span>
            <h3>{bus.occupancy}%</h3>
          </div>

          <Users size={24} />

        </div>


        <div className="occupancy-bar">

          <div
            className="occupancy-fill"
            style={{
              width: `${bus.occupancy}%`,
            }}
          />

        </div>


        <div className="occupancy-status">
          {getStatus(bus.occupancy)}
        </div>

      </section>


      <section className="forecast-section">

        <div className="section-heading">

          <div>
            <span className="eyebrow">
              SMART FORECAST
            </span>

            <h3>Crowding ahead</h3>
          </div>

        </div>


        <div className="forecast-list">

          {forecast.map((item, index) => (

            <div
              className="forecast-item"
              key={item.stop}
            >

              <div className="forecast-number">
                {index + 1}
              </div>

              <div className="forecast-info">

                <strong>
                  {item.stop}
                </strong>

                <div className="forecast-meter">

                  <div className="mini-bar">

                    <div
                      style={{
                        width: `${item.occupancy}%`,
                      }}
                    />

                  </div>

                  <span>
                    {item.occupancy}%
                  </span>

                </div>

              </div>

            </div>

          ))}

        </div>

      </section>

      <section
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "18px",
          padding: "15px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "7px",
          }}
        >
          <TrendingUp size={19} />

          <strong
            style={{
              fontSize: "13px",
              color: "#0f172a",
            }}
          >
            {crowdingTrend}
          </strong>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "12px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          {trendDescription}
        </p>
      </section>


      <section className="take-bus-card">

        <div className="take-icon">

          <Star
            size={21}
            fill="currentColor"
          />

        </div>

        <div>

          <span>SMART DECISION</span>

          <h3>
            Should I take this bus?
          </h3>

          <p>
            {bus.occupancy < 50
              ? "Yes — this bus has plenty of available space."
              : bus.occupancy < 70
                ? "Yes — crowding is manageable for this route."
                : "Consider another bus if you prefer a less crowded ride."}
          </p>

        </div>

      </section>


      <button
        className="track-button"
        onClick={onTrack}
      >
        <Navigation size={18} />
        Track this bus live
      </button>

    </>
  );
}


/* =========================
   LIVE TRACKING
========================= */

function TrackingScreen({ bus, onBack }) {
  const [liveEta, setLiveEta] = useState(parseInt(bus.eta) || 4);
  const [busProgress, setBusProgress] = useState(45);
  const routePoints = [
  [12.9345, 77.4847], // Kengeri
  [12.9365, 77.5000],
  [12.9500, 77.5350], // RR Nagar
  [12.9610, 77.5650], // Vijayanagar
  [12.9716, 77.5946], // Majestic
];

const routeIndex = Math.min(
  Math.floor((busProgress / 100) * (routePoints.length - 1)),
  routePoints.length - 2
);

const segmentProgress =
  (busProgress / 100) * (routePoints.length - 1) - routeIndex;

const currentLat =
  routePoints[routeIndex][0] +
  (routePoints[routeIndex + 1][0] - routePoints[routeIndex][0]) *
    segmentProgress;

const currentLng =
  routePoints[routeIndex][1] +
  (routePoints[routeIndex + 1][1] - routePoints[routeIndex][1]) *
    segmentProgress;
    useEffect(() => {
    const interval = setInterval(() => {
      setLiveEta((prev) => Math.max(1, prev - 1));
      setBusProgress((prev) => Math.min(90, prev + 5));
    }, 5000);

    return () => clearInterval(interval);
  }, []);
  const stops = [
    {
      name: "Kengeri",
      status: "Passed",
    },
    {
      name: "RR Nagar",
      status: "Current location",
    },
    {
      name: "Vijayanagar",
      status: "Upcoming",
    },
    {
      name: "Majestic",
      status: "Destination",
    },
  ];

  return (
    <>
      <div className="details-header">

        <button
          className="back-button"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="eyebrow">
            LIVE TRACKING
          </span>

          <h2>{bus.number}</h2>
        </div>

      </div>


      <section
        style={{
          background: "#e8f7f0",
          borderRadius: "20px",
          padding: "16px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >

        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: "#16865b",
            boxShadow:
              "0 0 0 6px rgba(22,134,91,0.12)",
          }}
        />

        <div>

          <strong
            style={{
              display: "block",
              color: "#0f172a",
              fontSize: "15px",
            }}
          >
           {liveEta <= 1 ? "Arriving soon" : "Bus is moving"}
          </strong>

          <span
            style={{
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            Live location updated a few seconds ago
          </span>

        </div>

        <Radio
          size={20}
          style={{
            marginLeft: "auto",
            color: "#16865b",
          }}
        />

      </section>


      <section
  style={{
    height: "310px",
    borderRadius: "24px",
    overflow: "hidden",
    position: "relative",
    marginBottom: "18px",
  }}
>
  <MapContainer
    center={[12.9716, 77.5946]}
    zoom={12}
    style={{ height: "100%", width: "100%" }}
  >
    <TileLayer
      attribution='&copy; OpenStreetMap contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />

    <Polyline
      positions={[
        [12.9345, 77.4847],
        [12.9365, 77.5000],
        [12.9500, 77.5350],
        [12.9610, 77.5650],
        [12.9716, 77.5946],
      ]}
    />

    <Marker position={[currentLat, currentLng]}>

      <Popup>
        <strong>BUSNETT</strong>
        <br />
        Bus {bus.number} is here
      </Popup>
    </Marker>
  </MapContainer>

  <div
    style={{
      position: "absolute",
      bottom: "12px",
      left: "12px",
      zIndex: 1000,
      background: "rgba(255,255,255,0.95)",
      padding: "7px 10px",
      borderRadius: "9px",
      fontSize: "10px",
      fontWeight: "700",
      color: "#64748b",
    }}
  >
    BUSNETT LIVE MAP
  </div>
</section>


      <section className="occupancy-card">

        <div className="occupancy-heading">

          <div>

            <span>
              ARRIVING AT MAJESTIC
            </span>

            <h3>
             {liveEta} min
            </h3>

          </div>

          <Clock3 size={24} />

        </div>


        <div
          style={{
            marginTop: "10px",
            color: "#64748b",
            fontSize: "13px",
          }}
        >
          Route 401K · Kengeri → Majestic
        </div>

      </section>


      <section className="forecast-section">

        <div className="section-heading">

          <div>
            <span className="eyebrow">
              ROUTE PROGRESS
            </span>

            <h3>Upcoming stops</h3>
          </div>

        </div>


        <div className="forecast-list">

          {stops.map((stop, index) => (

            <div
              className="forecast-item"
              key={stop.name}
            >

              <div
                className="forecast-number"
                style={{
                  background:
                    stop.status === "Current location"
                      ? "#16865b"
                      : undefined,
                  color:
                    stop.status === "Current location"
                      ? "#ffffff"
                      : undefined,
                }}
              >
                {index + 1}
              </div>

              <div className="forecast-info">

                <strong>
                  {stop.name}
                </strong>

                <span
                  style={{
                    color:
                      stop.status === "Current location"
                        ? "#16865b"
                        : "#64748b",
                    fontSize: "12px",
                  }}
                >
                  {stop.status}
                </span>

              </div>

              {stop.status === "Current location" && (
                <Radio
                  size={18}
                  style={{
                    color: "#16865b",
                  }}
                />
              )}

            </div>

          ))}

        </div>

      </section>

    </>
  );
}


/* =========================
   BUS CARD
========================= */

function BusCard({ bus, onClick }) {

  const occupancyClass =
    bus.occupancy < 45
      ? "low"
      : bus.occupancy < 70
        ? "medium"
        : "high";


  return (
    <article
      className={`bus-card ${
        bus.recommended ? "recommended" : ""
      } ${onClick ? "clickable" : ""}`}
      onClick={onClick}
    >

      {bus.recommended && (
        <div className="recommended-label">

          <Star
            size={13}
            fill="currentColor"
          />

          Recommended

        </div>
      )}


      <div className="bus-main">

        <div className="bus-number">

          <BusFront size={21} />

          <strong>
            {bus.number}
          </strong>

        </div>


        <div className="eta">

          <strong>
            {bus.eta}
          </strong>

          <span>away</span>

        </div>

      </div>


      <div className="bus-destination">

        <span>→</span>

        <strong>
          {bus.destination}
        </strong>

      </div>


      <div className="bus-details">

        <div>
          <Clock3 size={15} />
          {bus.duration}
        </div>

        <div
          className={`occupancy ${occupancyClass}`}
        >
          <Users size={15} />
          {bus.occupancy}% occupied
        </div>

        <div>
          {bus.fare}
        </div>

      </div>

    </article>
  );
}


/* =========================
   NAV ITEM
========================= */

function NavItem({
  icon,
  label,
  active,
  onClick,
}) {
  return (
    <button
      className={`nav-item ${
        active ? "active" : ""
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}


/* =========================
   TRIPS
========================= */

function TripsScreen() {
  const trips = [
    {
      bus: "401K",
      route: "Kengeri → Majestic",
      date: "Today · 9:42 AM",
      fare: "₹15",
      status: "Completed",
    },
    {
      bus: "500D",
      route: "Kengeri → Vijayanagar",
      date: "Yesterday · 6:18 PM",
      fare: "₹18",
      status: "Completed",
    },
    {
      bus: "401K",
      route: "Majestic → Kengeri",
      date: "2 Sep · 5:34 PM",
      fare: "₹15",
      status: "Completed",
    },
  ];

  return (
    <>
      <div className="page-header">
        <span className="eyebrow">YOUR JOURNEY</span>
        <h2>My Trips</h2>
      </div>

      <div
        style={{
          background: "#e8f7f0",
          borderRadius: "18px",
          padding: "14px",
          marginBottom: "16px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: "800",
            color: "#16865b",
            letterSpacing: "0.8px",
          }}
        >
          TRAVEL SUMMARY
        </span>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "10px",
          }}
        >
          <div>
            <strong style={{ fontSize: "20px", color: "#0f172a" }}>
              3
            </strong>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Trips
            </div>
          </div>

          <div>
            <strong style={{ fontSize: "20px", color: "#0f172a" }}>
              ₹48
            </strong>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Total fare
            </div>
          </div>

          <div>
            <strong style={{ fontSize: "20px", color: "#0f172a" }}>
              38 km
            </strong>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Travelled
            </div>
          </div>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">RECENT</span>
          <h3>Journey history</h3>
        </div>
      </div>

      <div className="bus-list">
        {trips.map((trip, index) => (
          <article
            key={index}
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "18px",
              padding: "15px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "11px",
                  alignItems: "center",
                }}
              >
                <div className="hero-bus-icon">
                  <BusFront size={20} />
                </div>

                <div>
                  <strong
                    style={{
                      display: "block",
                      fontSize: "15px",
                      color: "#0f172a",
                    }}
                  >
                    {trip.bus}
                  </strong>

                  <span
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                    }}
                  >
                    {trip.route}
                  </span>
                </div>
              </div>

              <strong
                style={{
                  fontSize: "13px",
                  color: "#0f172a",
                }}
              >
                {trip.fare}
              </strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "13px",
                paddingTop: "11px",
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                }}
              >
                {trip.date}
              </span>

              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "800",
                  color: "#16865b",
                  background: "#e8f7f0",
                  padding: "5px 8px",
                  borderRadius: "8px",
                }}
              >
                ✓ {trip.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}


/* =========================
   PASS
========================= */

function PassScreen() {
  return (
    <>
      <div className="page-header">

        <span className="eyebrow">
          DIGITAL PASS
        </span>

        <h2>My Bus Pass</h2>

      </div>


      <div className="pass-card">

        <div className="pass-top">

          <div>
            <span>BUSNETT</span>
            <h3>Student Pass</h3>
          </div>

          <Ticket size={28} />

        </div>


        <div className="pass-details">

          <div>
            <small>VALID UNTIL</small>
            <strong>30 SEP 2026</strong>
          </div>

          <div>
            <small>PASS TYPE</small>
            <strong>MONTHLY</strong>
          </div>

        </div>


        <div className="qr-placeholder">

          <div className="qr-pattern">
            ▦
          </div>

          <span>
            Scan to verify pass
          </span>

        </div>

      </div>
    </>
  );
}


/* =========================
   PROFILE
========================= */

function ProfileScreen({ onAuth }) {
  return (
    <>
      <div className="page-header">
        <span className="eyebrow">ACCOUNT</span>
        <h2>Profile</h2>
      </div>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "22px",
          padding: "18px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "16px",
              background: "#e8f7f0",
              color: "#16865b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "800",
              fontSize: "18px",
            }}
          >
            <UserRound size={23} />
          </div>

          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a" }}>
              Guest Passenger
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
              You can use BUSNETT without an account.
            </p>
          </div>
        </div>

        <div
          style={{
            background: "#f8fafc",
            borderRadius: "14px",
            padding: "12px",
            marginTop: "14px",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          <strong style={{ color: "#16865b" }}>OPTIONAL FEATURE</strong>
          <br />
          Sign in or create an account only if you want to save routes, sync
          preferences and personalize your BUSNETT experience.
        </div>

        <button
          onClick={onAuth}
          style={{
            width: "100%",
            marginTop: "14px",
            padding: "13px 16px",
            borderRadius: "12px",
            background: "#16865b",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: "800",
            cursor: "pointer",
          }}
        >
          Login / Sign Up
        </button>
      </section>

      <section
        style={{
          background: "#0f172a",
          color: "#ffffff",
          borderRadius: "22px",
          padding: "18px",
          marginBottom: "16px",
        }}
      >
        <span
          style={{
            color: "#8ee5bb",
            fontSize: "10px",
            fontWeight: "800",
            letterSpacing: "1px",
          }}
        >
          BUSNETT INTELLIGENCE
        </span>

        <h3 style={{ margin: "7px 0 5px", fontSize: "18px" }}>
          Smarter journeys, less waiting.
        </h3>

        <p
          style={{
            margin: 0,
            color: "#cbd5e1",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
        >
          BUSNETT uses cloud-synced transit data to provide estimated
          occupancy, live ETAs and crowding forecasts.
        </p>
      </section>

      <div className="settings-list">
        <button>
          <span>♡</span>
          <span>Saved routes</span>
          <ChevronRight size={17} />
        </button>

        <button>
          <span>🔔</span>
          <span>Notifications</span>
          <ChevronRight size={17} />
        </button>

        <button>
          <span>♿</span>
          <span>Accessibility</span>
          <ChevronRight size={17} />
        </button>

        <button>
          <span>🚨</span>
          <span>Emergency / SOS</span>
          <ChevronRight size={17} />
        </button>
      </div>
    </>
  );
}


/* =========================
   OPTIONAL LOGIN / SIGN UP
========================= */

function AuthScreen({ onBack }) {
  const [mode, setMode] = useState("login");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <section style={{ paddingTop: "20px" }}>
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>

        <div
          style={{
            background: "#e8f7f0",
            borderRadius: "22px",
            padding: "28px 20px",
            marginTop: "20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              margin: "0 auto 14px",
              borderRadius: "18px",
              background: "#16865b",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              fontWeight: "800",
            }}
          >
            ✓
          </div>

          <span className="eyebrow">BUSNETT ACCOUNT</span>
          <h2 style={{ margin: "8px 0 7px", color: "#0f172a" }}>
            {mode === "login" ? "Login successful" : "Account created"}
          </h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "13px", lineHeight: 1.5 }}>
            This optional account feature is ready for integration with a
            real authentication service.
          </p>

          <button
            onClick={onBack}
            style={{
              width: "100%",
              marginTop: "18px",
              padding: "13px 16px",
              borderRadius: "12px",
              background: "#16865b",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            Back to Profile
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="details-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <span className="eyebrow">OPTIONAL FEATURE</span>
          <h2>{mode === "login" ? "Login" : "Create account"}</h2>
        </div>
      </div>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "22px",
          padding: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            background: "#f1f5f9",
            borderRadius: "12px",
            padding: "4px",
            marginBottom: "18px",
          }}
        >
          <button
            onClick={() => setMode("login")}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "9px",
              background: mode === "login" ? "#ffffff" : "transparent",
              color: mode === "login" ? "#16865b" : "#64748b",
              fontWeight: "800",
              fontSize: "12px",
            }}
          >
            Login
          </button>
          <button
            onClick={() => setMode("signup")}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "9px",
              background: mode === "signup" ? "#ffffff" : "transparent",
              color: mode === "signup" ? "#16865b" : "#64748b",
              fontWeight: "800",
              fontSize: "12px",
            }}
          >
            Sign Up
          </button>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <span className="eyebrow">BUSNETT</span>
          <h3 style={{ margin: "6px 0 5px", fontSize: "19px", color: "#0f172a" }}>
            {mode === "login" ? "Welcome back" : "Create your BUSNETT account"}
          </h3>
          <p style={{ margin: 0, color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>
            {mode === "login"
              ? "Access your saved routes and preferences."
              : "Save your routes and personalize your transit experience."}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label style={{ display: "block", marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                Full name
              </span>
              <input
                required
                type="text"
                placeholder="Enter your name"
                style={authInputStyle}
              />
            </label>
          )}

          <label style={{ display: "block", marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
              E-mail
            </span>
            <input
              required
              type="email"
              placeholder="you@example.com"
              style={authInputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
              Password
            </span>
            <input
              required
              type="password"
              placeholder="Enter password"
              style={authInputStyle}
            />
          </label>

          {mode === "signup" && (
            <label style={{ display: "block", marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                Confirm password
              </span>
              <input
                required
                type="password"
                placeholder="Confirm password"
                style={authInputStyle}
              />
            </label>
          )}

          {mode === "login" && (
            <div style={{ textAlign: "right", marginBottom: "14px" }}>
              <button
                type="button"
                style={{ background: "transparent", color: "#16865b", fontSize: "11px", fontWeight: "700" }}
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: "12px",
              background: "#16865b",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            {mode === "login" ? "Login" : "Create Account"}
          </button>
        </form>

        <p
          style={{
            margin: "15px 0 0",
            textAlign: "center",
            fontSize: "11px",
            color: "#64748b",
            lineHeight: 1.5,
          }}
        >
          You can always continue using BUSNETT without logging in.
        </p>
      </section>
    </>
  );
}

const authInputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #dbe3ea",
  borderRadius: "11px",
  outline: "none",
  fontFamily: "inherit",
  fontSize: "12px",
  color: "#0f172a",
  background: "#ffffff",
};

export default App;