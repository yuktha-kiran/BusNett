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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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
 const [routeResults, setRouteResults] = useState([]);
const [searchLoading, setSearchLoading] = useState(false);
const [searchError, setSearchError] = useState("");
  const [searchFrom, setSearchFrom] = useState("Kengeri");
  const [searchTo, setSearchTo] = useState("Majestic");
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
  const [savedRoutes, setSavedRoutes] = useState([
    { from: "Kengeri", to: "Majestic" },
  ]);

  const searchRealRoutes = async (from, to) => {
    setSearchLoading(true);
    setSearchError("");

    try {
      const response = await fetch(
        `${API_URL}/api/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );

      if (!response.ok) {
        throw new Error("Route search failed");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Unable to find routes");
      }

      const mappedRoutes = (data.directRoutes || []).map((route, index) => ({
        number: route.routeNumber,
        destination: to,
        origin: from,
        eta: `${4 + index * 3} min`,
        occupancy: route.occupancy ?? 50,
        duration: `${24 + index * 2} min`,
        fare: "₹15",
        recommended: false,
        routeId: route.routeId,
        routeName: route.routeName,
        headsign: route.headsign,
        directionId: route.directionId,
        fromStop: route.from,
        toStop: route.to,
        numberOfStops: route.numberOfStops,
        routeStops: route.stops,
        dataSource: route.dataSource,
        occupancySource: route.occupancySource,
      }));

      setRouteResults(mappedRoutes);
    } catch (error) {
      console.error("BUSNETT route search failed:", error);
      setSearchError(
        "Unable to load BMTC routes. Make sure the cloud API is running."
      );
      setRouteResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const syncCloudData = async () => {
      try {
        const response = await fetch("${API_URL}/api/buses");

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

            <button
              className="icon-button"
              onClick={() => setActiveScreen("notifications")}
              aria-label="Open notifications"
            >
              <Bell size={21} />
              <span className="notification-dot" />
            </button>
        </header>

        <main className="content">

          {activeScreen === "home" && (
            <HomeScreen
              lastSynced={lastSynced}
              buses={displayBuses}
              from={searchFrom}
              to={searchTo}
              setFrom={setSearchFrom}
              setTo={setSearchTo}
              onSearch={(from, to) => {
                setSearchFrom(from);
                setSearchTo(to);
                searchRealRoutes(from, to);
                setActiveScreen("search");
              }}
              onNearby={() => setActiveScreen("nearby")}
              onSaved={() => setActiveScreen("saved")}
            />
          )}

          {activeScreen === "search" && (
  <SearchScreen
    buses={routeResults}
    loading={searchLoading}
    error={searchError}
    initialFrom={searchFrom}
    initialTo={searchTo}
    onSearch={(from, to) => {
      setSearchFrom(from);
      setSearchTo(to);
      searchRealRoutes(from, to);
    }}
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

          {activeScreen === "notifications" && (
            <NotificationsScreen
              buses={displayBuses}
              onBack={() => setActiveScreen("home")}
            />
          )}

          {activeScreen === "saved" && (
            <SavedRoutesScreen
              savedRoutes={savedRoutes}
              onBack={() => setActiveScreen("home")}
              onRemove={(route) =>
                setSavedRoutes((prev) =>
                  prev.filter(
                    (item) =>
                      item.from !== route.from || item.to !== route.to
                  )
                )
              }
              onSelect={() => setActiveScreen("search")}
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
            <ProfileScreen />
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


function StopAutocompleteInput({ value, onChange, placeholder, ariaLabel }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/stops?q=${encodeURIComponent(query)}`
        );
        if (!response.ok) return;
        const data = await response.json();
        setSuggestions((data.stops || []).slice(0, 6));
      } catch (error) {
        console.error("BUSNETT stop suggestions failed:", error);
        setSuggestions([]);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [value]);

  const selectStop = (stop) => {
    onChange(stop.name);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        style={{
          display: "block",
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          padding: "4px 0 0",
          fontSize: "16px",
          fontWeight: "700",
          color: "inherit",
        }}
      />

      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            background: "#ffffff",
            border: "1px solid #dbe3ea",
            borderRadius: "14px",
            boxShadow: "0 12px 28px rgba(15,23,42,0.12)",
            overflow: "hidden",
          }}
        >
          {suggestions.map((stop) => (
            <button
              key={stop.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectStop(stop)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "11px 12px",
                border: "none",
                borderBottom: "1px solid #eef2f6",
                background: "#ffffff",
                textAlign: "left",
                cursor: "pointer",
                color: "#0f172a",
                fontSize: "13px",
                fontWeight: "650",
              }}
            >
              <MapPin size={15} color="#16865b" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {stop.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HomeScreen({ buses, onSearch, lastSynced, onNearby, onSaved, from, to, setFrom, setTo }) {
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
          <div style={{ flex: 1 }}>
            <small>FROM</small>
            <StopAutocompleteInput
              value={from}
              onChange={setFrom}
              placeholder="Enter starting point"
              ariaLabel="Starting point"
            />
          </div>
        </div>


        <div className="route-line" />


        <div className="route-input">
          <div className="route-dot end" />
          <div style={{ flex: 1 }}>
            <small>TO</small>
            <StopAutocompleteInput
              value={to}
              onChange={setTo}
              placeholder="Enter destination"
              ariaLabel="Destination"
            />
          </div>
        </div>


        <button
          className="search-button"
          onClick={() => {
            if (from.trim() && to.trim()) onSearch(from.trim(), to.trim());
          }}
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

        <button onClick={onSaved}>
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


      <section
        className="insight-card"
        style={{
          display: "block",
          cursor: "default",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
          }}
        >
          <div className="insight-icon">
            <Users size={20} />
          </div>

          <div className="insight-content" style={{ flex: 1 }}>
            <span>BUSNETT INTELLIGENCE</span>

            <h3 style={{ marginBottom: "5px" }}>
              {recommendation?.bus?.number || "Best available bus"} — Best overall choice
            </h3>

            <p>
              {recommendation?.reason || "Best available option right now"}.
            </p>
          </div>
        </div>

        {recommendation?.bus && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "8px",
                marginTop: "14px",
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.7)",
                  borderRadius: "12px",
                  padding: "9px",
                }}
              >
                <Clock3 size={15} />
                <strong
                  style={{
                    display: "block",
                    marginTop: "4px",
                    fontSize: "13px",
                    color: "#0f172a",
                  }}
                >
                  {recommendation.bus.eta}
                </strong>
                <span
                  style={{
                    fontSize: "9px",
                    color: "#64748b",
                  }}
                >
                  arrival
                </span>
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.7)",
                  borderRadius: "12px",
                  padding: "9px",
                }}
              >
                <Users size={15} />
                <strong
                  style={{
                    display: "block",
                    marginTop: "4px",
                    fontSize: "13px",
                    color: "#0f172a",
                  }}
                >
                  {recommendation.bus.occupancy}%
                </strong>
                <span
                  style={{
                    fontSize: "9px",
                    color: "#64748b",
                  }}
                >
                  occupancy
                </span>
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.7)",
                  borderRadius: "12px",
                  padding: "9px",
                }}
              >
                <Navigation size={15} />
                <strong
                  style={{
                    display: "block",
                    marginTop: "4px",
                    fontSize: "13px",
                    color: "#0f172a",
                  }}
                >
                  {recommendation.bus.duration}
                </strong>
                <span
                  style={{
                    fontSize: "9px",
                    color: "#64748b",
                  }}
                >
                  journey
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "12px",
                paddingTop: "10px",
                borderTop: "1px solid rgba(15,23,42,0.08)",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "700",
                  color: "#64748b",
                }}
              >
                Based on ETA + occupancy + journey time
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
                87% confidence
              </span>
            </div>
          </>
        )}
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
                  {bus.origin || "Your stop"} → {bus.destination}
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
   SAVED ROUTES
========================= */

function SavedRoutesScreen({ savedRoutes, onBack, onRemove, onSelect }) {
  return (
    <>
      <div className="search-page-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="eyebrow">YOUR ROUTES</span>
          <h2>Saved routes</h2>
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="quick-icon">
            <Star size={18} fill="currentColor" />
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
              QUICK ACCESS
            </span>

            <strong
              style={{
                display: "block",
                marginTop: "3px",
                fontSize: "15px",
                color: "#0f172a",
              }}
            >
              Your regular journeys
            </strong>
          </div>
        </div>

        <p
          style={{
            margin: "10px 0 0",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          Save frequently used routes to find your next bus faster.
        </p>
      </section>

      <div className="section-heading">
        <div>
          <span className="eyebrow">SAVED</span>
          <h3>Routes</h3>
        </div>

        <span className="result-count">
          {savedRoutes.length} saved
        </span>
      </div>

      {savedRoutes.length === 0 ? (
        <section
          style={{
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "20px",
            padding: "30px 18px",
          }}
        >
          <Star size={28} />
          <h3 style={{ margin: "12px 0 6px", color: "#0f172a" }}>
            No saved routes yet
          </h3>

          <p
            style={{
              margin: 0,
              fontSize: "12px",
              lineHeight: 1.5,
              color: "#64748b",
            }}
          >
            Save your regular journeys here for quicker access.
          </p>
        </section>
      ) : (
        <div>
          {savedRoutes.map((route, index) => (
            <article
              key={`${route.from}-${route.to}-${index}`}
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
                  alignItems: "center",
                  gap: "11px",
                }}
              >
                <div className="quick-icon">
                  <Star size={18} fill="currentColor" />
                </div>

                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      fontWeight: "800",
                      color: "#94a3b8",
                      letterSpacing: "0.7px",
                    }}
                  >
                    SAVED ROUTE
                  </span>

                  <strong
                    style={{
                      display: "block",
                      marginTop: "4px",
                      fontSize: "14px",
                      color: "#0f172a",
                    }}
                  >
                    {route.from} → {route.to}
                  </strong>
                </div>

                <button
                  onClick={() => onRemove(route)}
                  aria-label={`Remove ${route.from} to ${route.to}`}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#94a3b8",
                    fontSize: "20px",
                    cursor: "pointer",
                    padding: "5px",
                  }}
                >
                  ×
                </button>
              </div>

              <button
                onClick={onSelect}
                style={{
                  width: "100%",
                  marginTop: "13px",
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  borderRadius: "10px",
                  padding: "10px",
                  fontSize: "11px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                Find buses for this route
              </button>
            </article>
          ))}
        </div>
      )}

      <section
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "18px",
          padding: "14px",
          marginTop: "6px",
        }}
      >
        <strong
          style={{
            display: "block",
            fontSize: "12px",
            color: "#0f172a",
            marginBottom: "4px",
          }}
        >
          BUSNETT shortcut
        </strong>

        <p
          style={{
            margin: 0,
            fontSize: "11px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          Your saved routes can be used as shortcuts to live bus
          availability, ETA and occupancy information.
        </p>
      </section>
    </>
  );
}


/* =========================
   NOTIFICATIONS
========================= */

function NotificationsScreen({ buses, onBack }) {
  const recommendation = getSmartRecommendation(buses);
  const bestBus = recommendation?.bus;

  const notifications = [
    {
      icon: <Clock3 size={19} />,
      title: `${bestBus?.number || "Your bus"} is approaching`,
      message: `${bestBus?.eta || "--"} away from Kengeri with an estimated ${bestBus?.occupancy ?? "--"}% occupancy.`,
      time: "Just now",
      unread: true,
    },
    {
      icon: <Users size={19} />,
      title: "Crowding update",
      message: `BUSNETT estimates ${buses[1]?.number || "500D"} at ${buses[1]?.occupancy ?? "--"}% occupancy.`,
      time: "2 min ago",
      unread: true,
    },
    {
      icon: <Star size={19} />,
      title: "Smart recommendation",
      message: bestBus
        ? `${bestBus.number} is currently the best balance of arrival time and crowding.`
        : "No recommendation is available right now.",
      time: "5 min ago",
      unread: false,
    },
    {
      icon: <Activity size={19} />,
      title: "Cloud data synced",
      message: "Latest transit intelligence has been received from the BUSNETT cloud layer.",
      time: "7 min ago",
      unread: false,
    },
  ];

  return (
    <>
      <div className="search-page-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="eyebrow">UPDATES</span>
          <h2>Notifications</h2>
        </div>
      </div>

      <section
        style={{
          background: "#e8f7f0",
          borderRadius: "20px",
          padding: "15px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="quick-icon">
            <Bell size={18} />
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
              SMART ALERTS
            </span>

            <strong
              style={{
                display: "block",
                marginTop: "3px",
                fontSize: "15px",
                color: "#0f172a",
              }}
            >
              Stay ahead of your journey
            </strong>
          </div>
        </div>

        <p
          style={{
            margin: "10px 0 0",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          BUSNETT turns live transit data into useful passenger alerts.
        </p>
      </section>

      <div className="section-heading">
        <div>
          <span className="eyebrow">RECENT</span>
          <h3>Your updates</h3>
        </div>

        <span className="result-count">
          {notifications.filter((item) => item.unread).length} new
        </span>
      </div>

      <div>
        {notifications.map((notification, index) => (
          <article
            key={index}
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "flex-start",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "18px",
              padding: "14px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                width: "38px",
                height: "38px",
                flexShrink: 0,
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: notification.unread ? "#e8f7f0" : "#f1f5f9",
                color: notification.unread ? "#16865b" : "#64748b",
              }}
            >
              {notification.icon}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                  {notification.title}
                </strong>

                {notification.unread && (
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      flexShrink: 0,
                      borderRadius: "50%",
                      background: "#16865b",
                      marginTop: "5px",
                    }}
                  />
                )}
              </div>

              <p
                style={{
                  margin: "5px 0 7px",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  color: "#64748b",
                }}
              >
                {notification.message}
              </p>

              <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                {notification.time}
              </span>
            </div>
          </article>
        ))}
      </div>

      <section
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "18px",
          padding: "14px",
          marginTop: "6px",
        }}
      >
        <strong
          style={{
            display: "block",
            fontSize: "12px",
            color: "#0f172a",
            marginBottom: "4px",
          }}
        >
          Why these alerts?
        </strong>

        <p
          style={{
            margin: 0,
            fontSize: "11px",
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          Alerts are generated from cloud-synced occupancy, ETA and route
          intelligence. Passenger identity is not required.
        </p>
      </section>
    </>
  );
}


/* =========================
   SEARCH SCREEN
========================= */

function SearchScreen({
  buses,
  loading,
  error,
  initialFrom,
  initialTo,
  onSearch,
  onBack,
  onSelectBus,
}) {
  const [from, setFrom] = useState(initialFrom || "Kengeri");
  const [to, setTo] = useState(initialTo || "Majestic");
  const recommendation = getSmartRecommendation(buses);

  const handleSearch = () => {
    if (!from.trim() || !to.trim()) return;
    onSearch(from.trim(), to.trim());
  };

  const swapLocations = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <>
      <div className="search-page-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="eyebrow">YOUR ROUTE</span>
          <h2>Find a bus</h2>
        </div>
      </div>

      <div
        className="selected-route"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div className="selected-stop">
          <div className="route-dot start" />

          <div style={{ flex: 1 }}>
            <small>FROM</small>
            <StopAutocompleteInput
              value={from}
              onChange={setFrom}
              placeholder="Enter starting point"
              ariaLabel="Starting point"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={swapLocations}
          aria-label="Swap starting point and destination"
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "32px",
            height: "32px",
            borderRadius: "10px",
            border: "1px solid #dbe3ea",
            background: "#ffffff",
            cursor: "pointer",
            fontSize: "16px",
            fontWeight: "800",
          }}
        >
          ⇅
        </button>

        <div className="route-connector" />

        <div className="selected-stop">
          <div className="route-dot end" />

          <div style={{ flex: 1 }}>
            <small>TO</small>
            <StopAutocompleteInput
              value={to}
              onChange={setTo}
              placeholder="Enter destination"
              ariaLabel="Destination"
            />
          </div>
        </div>

        <button
          className="search-button"
          onClick={handleSearch}
          disabled={loading}
          style={{ marginTop: "4px" }}
        >
          <Search size={18} />
          {loading ? "Searching..." : "Search buses"}
        </button>
      </div>

      <div className="results-header">
        <div>
          <span className="eyebrow">SMART MATCH</span>
          <h3>Best options</h3>
        </div>

        <span className="result-count">
          {loading ? "Searching..." : `${buses.length} buses`}
        </span>
      </div>

      {error && (
        <div
          style={{
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            color: "#9a3412",
            borderRadius: "14px",
            padding: "12px",
            marginBottom: "12px",
            fontSize: "11px",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "14px",
            marginBottom: "12px",
            fontSize: "11px",
            color: "#64748b",
            textAlign: "center",
          }}
        >
          Finding real BMTC routes...
        </div>
      )}

      {!loading && (
        <div className="bus-list">
          {buses.map((bus) => (
            <BusCard
              key={`${bus.routeId || bus.number}-${bus.directionId || ""}`}
              bus={bus}
              onClick={() => onSelectBus(bus)}
            />
          ))}
        </div>
      )}

      {!loading && recommendation && (
        <div className="recommendation-banner">
          <div className="insight-icon">
            <Star size={19} fill="currentColor" />
          </div>

          <div>
            <span>BUSNETT RECOMMENDS</span>

            <strong>
              {recommendation.bus.number} is the best balance
            </strong>

            <p>
              {recommendation.bus.eta} away ·{" "}
              {recommendation.bus.occupancy}% occupied.{" "}
              {recommendation.reason}.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/* =========================
   BUS DETAILS
========================= */

function BusDetailsScreen({ bus, onBack, onTrack }) {

  const forecast = [
    {
      stop: bus.origin || "Your stop",
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
      stop: bus.destination || "Destination",
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
  const [routeResults, setRouteResults] = useState([]);
const [searchLoading, setSearchLsoading] = useState(false);
const [searchError, setSearchError] = useState("");
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

function ProfileScreen() {
  return (
    <>
      <div className="page-header">
        <span className="eyebrow">ACCOUNT</span>
        <h2>Profile</h2>
      </div>

      <div className="profile-card">
        <div className="profile-avatar">Y</div>

        <div>
          <h3>BUSNETT Passenger</h3>
          <p>Regular commuter</p>
        </div>
      </div>

      <section
        style={{
          background: "#0f172a",
          color: "#ffffff",
          borderRadius: "22px",
          padding: "18px",
          marginTop: "16px",
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


export default App;