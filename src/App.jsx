import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import busnettLogo from "./assets/busnett-logo.png";
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
  ArrowUpDown,
} from "lucide-react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* =========================
   DISTANCE-BASED BUS FARE
========================= */

function calculateDistanceKm(pointA, pointB) {
  if (!pointA || !pointB) return 0;

  const lat1 = Number(pointA.lat ?? pointA.latitude);
  const lon1 = Number(pointA.lon ?? pointA.lng ?? pointA.longitude);
  const lat2 = Number(pointB.lat ?? pointB.latitude);
  const lon2 = Number(pointB.lon ?? pointB.lng ?? pointB.longitude);

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return 0;
  }

  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateRouteDistanceKm(stops) {
  if (!Array.isArray(stops) || stops.length < 2) return 0;

  let distance = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    distance += calculateDistanceKm(stops[i], stops[i + 1]);
  }

  return distance;
}

function getFareForDistance(distanceKm) {
  if (distanceKm <= 0) return "Fare unavailable";
  if (distanceKm <= 2) return "₹6";
  if (distanceKm <= 4) return "₹12";
  if (distanceKm <= 6) return "₹18";
  if (distanceKm <= 8) return "₹23";
  if (distanceKm <= 10) return "₹25";
  if (distanceKm <= 15) return "₹26";
  if (distanceKm <= 20) return "₹28";
  if (distanceKm >= 40) return "₹32";

  return "₹28";
}


const buses = [
  {
    number: "401K",
    destination: "Majestic",
    eta: "4 min",
    occupancy: 32,
    duration: "28 min",
    fare: "Distance based",
    recommended: true,
  },
  {
    number: "500D",
    destination: "Majestic",
    eta: "7 min",
    occupancy: 68,
    duration: "24 min",
    fare: "Distance based",
    recommended: false,
  },
  {
    number: "500A",
    destination: "Shivajinagar",
    eta: "11 min",
    occupancy: 48,
    duration: "31 min",
    fare: "Distance based",
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
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
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
  const [liveEtas, setLiveEtas] = useState({
    "401K": 4,
    "500D": 7,
    "500A": 11,
  });
  const [arrivalAlert, setArrivalAlert] = useState(null);
  const [arrivalAlertHistory, setArrivalAlertHistory] = useState([]);
  const alertedBusesRef = useRef(new Set());

  // Optional account feature. Core BUSNETT features work without login.
  const [authMode, setAuthMode] = useState(null);
  const [userAccount, setUserAccount] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("busnett_user")) || null;
    } catch {
      return null;
    }
  });
  const [savedTrips, setSavedTrips] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const normalizeSearchStop = (value) => {
    const normalized = String(value || "")
      .toLowerCase()
      .replace(/[()\/,-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (
      normalized.includes("kempegowda bus station") ||
      normalized === "kempegowda bus station" ||
      normalized === "kbs" ||
      normalized.includes("majestic")
    ) {
      return "majestic";
    }

    if (
      normalized === "kengeri" ||
      normalized.includes("kengeri bus station") ||
      normalized.includes("kengeri satellite town")
    ) {
      return "kengeri";
    }

    return normalized;
  };

  const searchRealRoutes = async (from, to) => {
    setSearchLoading(true);
    setSearchError("");

    try {
      // Passenger-facing stop names can be longer than the canonical
      // BMTC/GTFS search aliases. Normalize only the API query and keep
      // the original names for display.
      const apiFrom = normalizeSearchStop(from);
      const apiTo = normalizeSearchStop(to);

      const response = await fetch(
        `${API_URL}/api/search?from=${encodeURIComponent(apiFrom)}&to=${encodeURIComponent(apiTo)}`
      );

      if (!response.ok) {
        throw new Error("Route search failed");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Unable to find routes");
      }

      const mappedRoutes = (data.directRoutes || []).map((route, index) => {
        const routeStops = route.stops || [];
        const distanceKm = calculateRouteDistanceKm(routeStops);

        return {
          number: route.routeNumber,
          destination: to,
          origin: from,
          eta: `${4 + index * 3} min`,
          occupancy: route.occupancy ?? 50,
          duration: `${24 + index * 2} min`,
          fare: getFareForDistance(distanceKm),
          distanceKm: distanceKm.toFixed(1),
          recommended: false,
          routeId: route.routeId,
          routeName: route.routeName,
          headsign: route.headsign,
          directionId: route.directionId,
          fromStop: route.from,
          toStop: route.to,
          numberOfStops: route.numberOfStops,
          routeStops,
          dataSource: route.dataSource,
          occupancySource: route.occupancySource,
        };
      });

      // Overlay the exhibition's live SmartOccupancy/GPS buses on top of
      // the real GTFS route search. This gives searched buses the same
      // live ETA and occupancy used by the tracking screen.
      try {
        const liveResponse = await fetch(`${API_URL}/api/buses`);
        if (liveResponse.ok) {
          const liveData = await liveResponse.json();

          if (liveData.success && Array.isArray(liveData.buses)) {
            const liveMatches = liveData.buses.filter((bus) => {
              const routeText = String(bus.route || "");
              const parts = routeText.split("→").map((part) => normalizeSearchStop(part));

              return (
                parts.length === 2 &&
                parts[0] === apiFrom &&
                parts[1] === apiTo
              );
            });

            liveMatches.forEach((liveBus) => {
              const existingIndex = mappedRoutes.findIndex(
                (route) =>
                  String(route.number).toUpperCase() ===
                  String(liveBus.bus).toUpperCase()
              );

              const liveRouteStops = liveBus.routeStops || [];
              const liveDistanceKm = calculateRouteDistanceKm(liveRouteStops);

              const liveResult = {
                number: liveBus.bus,
                destination: to,
                origin: from,
                eta: `${liveBus.eta ?? 0} min`,
                occupancy: liveBus.occupancyPercent ?? liveBus.occupancy ?? 0,
                duration:
                  liveDistanceKm > 0
                    ? `${Math.max(1, Math.round((liveDistanceKm / (liveBus.speedKmh || 24)) * 60))} min`
                    : "Live",
                fare: getFareForDistance(liveDistanceKm),
                distanceKm: liveDistanceKm.toFixed(1),
                recommended: false,
                routeId: liveBus.routeId || "",
                routeName: liveBus.route || "",
                headsign: liveBus.headsign || to,
                directionId: "",
                fromStop: liveBus.currentStop || from,
                toStop: liveBus.nextStop || to,
                numberOfStops: liveRouteStops.length,
                routeStops: liveRouteStops,
                dataSource: "BUSNETT Cloud",
                occupancySource:
                  liveBus.occupancySource || "SmartOccupancy",
                etaSource: liveBus.etaSource || "Simulated GPS",
              };

              if (existingIndex >= 0) {
                mappedRoutes[existingIndex] = {
                  ...mappedRoutes[existingIndex],
                  ...liveResult,
                };
              } else {
                mappedRoutes.push(liveResult);
              }
            });
          }
        }
      } catch (liveError) {
        console.warn("BUSNETT live bus overlay unavailable:", liveError);
      }

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
        const response = await fetch(`${API_URL}/api/buses`);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveEtas((previous) => {
        const next = { ...previous };

        Object.keys(next).forEach((busNumber) => {
          if (next[busNumber] > 0) next[busNumber] -= 1;
        });

        const arrivingBus = buses.find(
          (bus) => next[bus.number] === 1 && !alertedBusesRef.current.has(bus.number)
        );

        if (arrivingBus) {
          alertedBusesRef.current.add(arrivingBus.number);
          const alert = {
            id: `${arrivingBus.number}-${Date.now()}`,
            bus: arrivingBus.number,
            from: searchFrom,
            message: `${arrivingBus.number} is about to arrive at ${searchFrom}.`,
            time: "Just now",
          };
          setArrivalAlert(alert);
          setArrivalAlertHistory((previousHistory) => [
            alert,
            ...previousHistory,
          ].slice(0, 5));
        }

        return next;
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [searchFrom]);

  const loadSavedTrips = async (account = userAccount) => {
    if (!account?.token) {
      setSavedTrips([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/users/${encodeURIComponent(account.id)}/trips`,
        {
          headers: {
            Authorization: `Bearer ${account.token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setSavedTrips(data.trips || []);
      }
    } catch (error) {
      console.error("BUSNETT saved trips load failed:", error);
    }
  };

  useEffect(() => {
    if (userAccount?.token) {
      loadSavedTrips(userAccount);
    } else {
      setSavedTrips([]);
    }
  }, [userAccount]);

  const handleAuth = async ({ mode, name, email, password }) => {
    setAuthLoading(true);
    setAuthError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to continue.");
      }

      localStorage.setItem("busnett_user", JSON.stringify(data.user));
      setUserAccount(data.user);
      setAuthMode(null);
      setAuthError("");
      setActiveTab("profile");
      setActiveScreen("profile");
      await loadSavedTrips(data.user);
    } catch (error) {
      setAuthError(error.message || "Unable to continue.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("busnett_user");
    setUserAccount(null);
    setSavedTrips([]);
    setAuthMode(null);
    setAuthError("");
  };

  const requireAccount = () => {
    setAuthError("");
    setAuthMode("signup");
  };

  const saveCurrentTrip = async (bus) => {
    if (!userAccount?.token) {
      requireAccount();
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/trips`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAccount.token}`,
        },
        body: JSON.stringify({
          from: bus.origin || searchFrom || "Selected stop",
          to: bus.destination || searchTo || "Destination",
          busNumber: bus.number,
          routeId: bus.routeId || "",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save this trip.");
      }

      setSavedTrips(data.trips || []);
    } catch (error) {
      console.error("BUSNETT save trip failed:", error);
    }
  };

  const removeSavedTrip = async (tripId) => {
    if (!userAccount?.token) return;

    try {
      const response = await fetch(
        `${API_URL}/api/trips/${encodeURIComponent(tripId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${userAccount.token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setSavedTrips(data.trips || []);
      }
    } catch (error) {
      console.error("BUSNETT remove trip failed:", error);
    }
  };

  const trackSavedTrip = async (trip) => {
    try {
      const response = await fetch(`${API_URL}/api/buses`);

      if (!response.ok) {
        throw new Error("Live bus data unavailable.");
      }

      const data = await response.json();
      const liveBus = (data.buses || []).find(
        (bus) =>
          String(bus.bus).toUpperCase() ===
          String(trip.busNumber).toUpperCase()
      );

      if (!liveBus) {
        setSearchError(
          `${trip.busNumber} is not currently available in live tracking.`
        );
        return;
      }

      setSelectedBus({
        ...liveBus,
        number: liveBus.bus || trip.busNumber,
        origin: liveBus.currentStop || trip.from,
        destination: liveBus.headsign || trip.to,
        eta: `${liveBus.eta ?? 0} min`,
        occupancy: liveBus.occupancy ?? 0,
        routeId: liveBus.routeId || trip.routeId,
      });
      setActiveScreen("tracking");
    } catch (error) {
      setSearchError(error.message || "Unable to load live bus data.");
    }
  };

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
    eta: `${liveEtas[bus.number] ?? parseInt(bus.eta) ?? 0} min`,
    recommended:
      smartRecommendation?.bus?.number === bus.number,
  }));
  return (
    <div className="app">
      <div className="phone-shell">

        <style>{`
          .page-header,
          .page-header h2,
          .page-header h3 {
            color: #0f172a !important;
          }
          .settings-list button {
            color: #0f172a !important;
          }
          .settings-list button svg {
            color: #28785f;
            flex-shrink: 0;
          }
          .phone-shell {
            overflow-x: hidden;
          }
          .content {
            padding-bottom: 96px !important;
          }

          .forecast-section {
            margin-bottom: 12px !important;
          }

          .forecast-list {
            gap: 6px !important;
          }

          .forecast-item {
            padding: 8px 0 !important;
          }

          .track-button {
            margin-bottom: 8px !important;
          }
          .bottom-nav {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            width: 100% !important;
            left: 0 !important;
            right: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
          }
          .nav-item {
            width: 100% !important;
            min-width: 0 !important;
            justify-content: center !important;
          }
          .bottom-nav + * {
            margin-right: 0 !important;
          }
        `}</style>

        <header
          className="topbar"
          style={{
            alignItems: "center",
            paddingTop: "12px",
            paddingBottom: "12px",
          }}
        >
          <div
            className="brand-header"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "10px",
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                overflow: "hidden",
                flexShrink: 0,
                position: "relative",
              }}
            >
              <img
                src={busnettLogo}
                alt="BusNett logo"
                className="busnett-logo"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "72px",
                  height: "72px",
                  maxWidth: "none",
                  objectFit: "contain",
                  objectPosition: "top left",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <strong
                style={{
                  fontSize: "22px",
                  lineHeight: 1,
                  letterSpacing: "-0.6px",
                  color: "#0f3d78",
                  fontWeight: "800",
                }}
              >
                <span style={{ color: "#0f3d78" }}>Bus</span>
                <span style={{ color: "#159b63" }}>Nett</span>
              </strong>

              <span
                style={{
                  marginTop: "5px",
                  fontSize: "10px",
                  fontWeight: "700",
                  color: "#64748b",
                  letterSpacing: "0.2px",
                }}
              >
                Plan your journey smarter
              </span>
            </div>
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

          {arrivalAlert && (
            <div
              role="alert"
              style={{
                position: "sticky",
                top: "8px",
                zIndex: 30,
                display: "flex",
                alignItems: "center",
                gap: "11px",
                background: "#0f172a",
                color: "#ffffff",
                borderRadius: "16px",
                padding: "12px 13px",
                marginBottom: "12px",
                boxShadow: "0 10px 24px rgba(15,23,42,0.18)",
              }}
            >
              <div
                style={{
                  width: "34px",
                  height: "34px",
                  flexShrink: 0,
                  borderRadius: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#e8f7f0",
                  color: "#16865b",
                }}
              >
                <Bell size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "13px" }}>
                  Bus arrival alert
                </strong>
                <span style={{ display: "block", marginTop: "2px", fontSize: "11px", color: "#cbd5e1" }}>
                  {arrivalAlert.message}
                </span>
              </div>
              <button
                onClick={() => setArrivalAlert(null)}
                style={{
                  border: "0",
                  background: "transparent",
                  color: "#cbd5e1",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: "pointer",
                  padding: "5px",
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {authMode ? (
            <AuthScreen
              mode={authMode}
              loading={authLoading}
              error={authError}
              onBack={() => {
                setAuthMode(null);
                setAuthError("");
              }}
              onSwitch={() => {
                setAuthError("");
                setAuthMode(authMode === "login" ? "signup" : "login");
              }}
              onSubmit={handleAuth}
            />
          ) : (
            <>
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
                  arrivalAlert={arrivalAlert}
                  arrivalAlertHistory={arrivalAlertHistory}
                  onDismissAlert={() => setArrivalAlert(null)}
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
                  onTrack={trackSavedTrip}
                />
              )}

              {activeScreen === "details" && selectedBus && (
                <BusDetailsScreen
                  bus={selectedBus}
                  onBack={() => setActiveScreen("search")}
                  onTrack={() => setActiveScreen("tracking")}
                  userAccount={userAccount}
                  onSaveTrip={saveCurrentTrip}
                  onRequireAuth={requireAccount}
                />
              )}

              {activeScreen === "tracking" && selectedBus && (
                <TrackingScreen
                  bus={selectedBus}
                  onBack={() => setActiveScreen("details")}
                />
              )}

              {activeScreen === "profile" && (
                <ProfileScreen
                  userAccount={userAccount}
                  savedTrips={savedTrips}
                  onLogin={() => {
                    setAuthError("");
                    setAuthMode("login");
                  }}
                  onSignup={() => {
                    setAuthError("");
                    setAuthMode("signup");
                  }}
                  onLogout={handleLogout}
                  onOpenSaved={() => setActiveScreen("saved")}
                />
              )}
            </>
          )}

        </main>

        {!authMode && (
          <nav className="bottom-nav">

            <NavItem
              icon={<Home size={21} />}
              label="Home"
              active={activeTab === "home"}
              onClick={() => goToTab("home")}
            />

            <NavItem
              icon={<UserRound size={21} />}
              label="Profile"
              active={activeTab === "profile"}
              onClick={() => goToTab("profile")}
            />

          </nav>
        )}

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


      <section className="quick-actions" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>

        <button onClick={onNearby}>
          <div className="quick-icon">
            <Navigation size={19} />
          </div>
          <span>Nearby buses</span>
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
      <div
        className="search-page-header"
        style={{ marginBottom: "12px" }}
      >
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
          padding: "14px 16px",
          marginBottom: "13px",
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
          Buses approaching nearby stops, powered by BUSNETT's
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

function SavedRoutesScreen({ savedRoutes, onBack, onRemove, onSelect, onTrack }) {
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
            Save bus trips from Bus Details to access their live data later.
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
                onClick={() => onTrack(route)}
                style={{
                  width: "100%",
                  marginTop: "13px",
                  border: "none",
                  background: "#16865b",
                  color: "#ffffff",
                  borderRadius: "10px",
                  padding: "10px",
                  fontSize: "11px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                Track this bus live
              </button>

              <button
                onClick={() => onSelect(route)}
                style={{
                  width: "100%",
                  marginTop: "8px",
                  border: "1px solid #dbe3ea",
                  background: "#ffffff",
                  color: "#0f172a",
                  borderRadius: "10px",
                  padding: "9px",
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

function NotificationsScreen({ buses, arrivalAlert, arrivalAlertHistory, onDismissAlert, onBack }) {
  const recommendation = getSmartRecommendation(buses);
  const bestBus = recommendation?.bus;

  const notifications = [
    ...(arrivalAlertHistory || []).map((alert) => ({
      icon: <Bell size={19} />,
      title: `${alert.bus} is about to arrive`,
      message: `Your bus is approaching ${alert.from}, your selected FROM stop.`,
      time: alert.time,
      unread: arrivalAlert?.id === alert.id,
    })),
    {
      icon: <Clock3 size={19} />,
      title: `${bestBus?.number || "Your bus"} is approaching`,
      message: bestBus
        ? `${bestBus.eta || "--"} away from ${
            bestBus.origin || "your selected stop"
          } with an estimated ${
            bestBus.occupancy ?? "--"
          }% occupancy.`
        : "Live bus information is currently unavailable.",
      time: "Live",
      unread: !arrivalAlertHistory?.length,
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

      {arrivalAlert && (
        <section
          style={{
            background: "#e8f7f0",
            border: "1px solid #b7ead1",
            borderRadius: "18px",
            padding: "14px",
            marginBottom: "12px",
          }}
        >
          <strong style={{ display: "block", fontSize: "13px", color: "#0f172a" }}>
            Arrival alert active
          </strong>
          <p style={{ margin: "5px 0 10px", fontSize: "11px", color: "#475569", lineHeight: 1.5 }}>
            {arrivalAlert.bus} is about to arrive at {arrivalAlert.from}.
          </p>
          <button
            onClick={onDismissAlert}
            style={{
              border: "0",
              borderRadius: "10px",
              padding: "8px 11px",
              background: "#16865b",
              color: "#ffffff",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Dismiss alert
          </button>
        </section>
      )}

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
  const [from, setFrom] = useState(initialFrom || "");
  const [to, setTo] = useState(initialTo || "");
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
          <span
            className="eyebrow"
            style={{ color: "#16865b" }}
          >
            YOUR ROUTE
          </span>
          <h2 style={{ color: "#0f172a" }}>Find a bus</h2>
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
          title="Swap stops"
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            border: "1px solid #dbe3ea",
            background: "#ffffff",
            color: "#16865b",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
            boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
          }}
        >
          <ArrowUpDown size={20} strokeWidth={2.5} />
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

function BusDetailsScreen({ bus, onBack, onTrack, userAccount, onSaveTrip, onRequireAuth }) {

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


      <section
        className="bus-hero"
        style={{
          padding: "13px 15px",
          marginBottom: "12px",
        }}
      >

        <div
          className="hero-bus-icon"
          style={{
            width: "48px",
            height: "48px",
            flexShrink: 0,
          }}
        >
          <BusFront size={25} />
        </div>

        <div className="hero-bus-info">

          <span>Next bus to</span>

          <h2>{bus.destination}</h2>

          <p>
            Arriving in <strong>{bus.eta}</strong>
          </p>

        </div>

      </section>


      <section
        className="occupancy-card"
        style={{
          padding: "13px 15px",
          marginBottom: "12px",
        }}
      >

        <div className="occupancy-heading">

          <div>
            <span>ESTIMATED OCCUPANCY</span>
            <h3 style={{ fontSize: "28px", margin: "3px 0 0" }}>
              {bus.occupancy}%
            </h3>
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


      <section
        className="forecast-section"
        style={{
          marginBottom: "12px",
        }}
      >

        <div
          className="section-heading"
          style={{
            marginBottom: "8px",
          }}
        >

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
          borderRadius: "16px",
          padding: "12px 14px",
          marginBottom: "12px",
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


      <section
        className="take-bus-card"
        style={{
          padding: "13px 15px",
          marginBottom: "12px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >

        <div
          className="take-icon"
          style={{
            width: "50px",
            height: "50px",
            flexShrink: 0,
          }}
        >

          <Star
            size={21}
            fill="currentColor"
          />

        </div>

        <div>

          <span>SMART DECISION</span>

          <h3 style={{ margin: "3px 0 4px", fontSize: "17px" }}>
            Should I take this bus?
          </h3>

          <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.4 }}>
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
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          marginTop: "4px",
          marginBottom: "4px",
          border: "none",
          borderRadius: "12px",
          padding: "12px 16px",
          background: "#16865b",
          color: "#ffffff",
          fontSize: "13px",
          fontWeight: "800",
          cursor: "pointer",
        }}
      >
        <Navigation size={18} />
        Track this bus live
      </button>

      <button
        onClick={() => {
          if (!userAccount) {
            onRequireAuth();
            return;
          }
          onSaveTrip(bus);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          marginTop: "8px",
          border: "1px solid #dbe3ea",
          borderRadius: "12px",
          padding: "11px 16px",
          background: "#ffffff",
          color: "#0f172a",
          fontSize: "12px",
          fontWeight: "800",
          cursor: "pointer",
        }}
      >
        <Star size={17} fill={userAccount ? "currentColor" : "none"} />
        {userAccount ? "Save this trip" : "Sign in to save this trip"}
      </button>

    </>
  );
}


/* =========================
   LIVE TRACKING
========================= */


const busMapIcon = L.divIcon({
  className: "bus-map-marker-visible",
  html: `
    <div style="
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: #16865b;
      border: 3px solid #ffffff;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.28);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 17V5.8C6 4.25 7.25 3 8.8 3H15.2C16.75 3 18 4.25 18 5.8V17" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M5 17H19L17.8 20H6.2L5 17Z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M8 7H16V11H8V7Z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="8" cy="17" r="1.3" fill="white"/>
        <circle cx="16" cy="17" r="1.3" fill="white"/>
      </svg>
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
  popupAnchor: [0, -22],
});

function TrackingScreen({ bus, onBack }) {
  const [routeResults, setRouteResults] = useState([]);
const [searchLoading, setSearchLsoading] = useState(false);
const [searchError, setSearchError] = useState("");
  const [liveEta, setLiveEta] = useState(parseInt(bus.eta) || 4);
  const [busProgress, setBusProgress] = useState(45);
  const routePoints = Array.isArray(bus.routeStops)
  ? bus.routeStops
      .map((stop) => {
        const lat = Number(stop.lat ?? stop.latitude);
        const lng = Number(
          stop.lon ?? stop.lng ?? stop.longitude
        );

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return [lat, lng];
      })
      .filter(Boolean)
  : [];

const safeRoutePoints =
  routePoints.length >= 2
    ? routePoints
    : [
        [12.9716, 77.5946],
        [12.9716, 77.5946],
      ];

const routeIndex = Math.min(
  Math.floor(
    (busProgress / 100) * (safeRoutePoints.length - 1)
  ),
  safeRoutePoints.length - 2
);

const segmentProgress =
  (busProgress / 100) *
    (safeRoutePoints.length - 1) -
  routeIndex;

const currentLat =
  safeRoutePoints[routeIndex][0] +
  (safeRoutePoints[routeIndex + 1][0] -
    safeRoutePoints[routeIndex][0]) *
    segmentProgress;

const currentLng =
  safeRoutePoints[routeIndex][1] +
  (safeRoutePoints[routeIndex + 1][1] -
    safeRoutePoints[routeIndex][1]) *
    segmentProgress;
    useEffect(() => {
    const interval = setInterval(() => {
      setLiveEta((prev) => Math.max(1, prev - 1));
      setBusProgress((prev) => Math.min(90, prev + 5));
    }, 5000);

    return () => clearInterval(interval);
  }, []);
  const stops = Array.isArray(bus.routeStops)
    ? bus.routeStops.slice(0, 8).map((stop, index, list) => ({
        name:
          stop.name ||
          stop.stopName ||
          `Stop ${index + 1}`,
        status:
          index === 0
            ? "Starting stop"
            : index === list.length - 1
            ? "Destination"
            : index === 1
            ? "Current route"
            : "Upcoming",
      }))
    : [];

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
    center={
      routePoints.length > 0
        ? routePoints[Math.floor(routePoints.length / 2)]
        : [12.9716, 77.5946]
    }
    zoom={12}
    style={{ height: "100%", width: "100%" }}
  >
    <TileLayer
      attribution='&copy; OpenStreetMap contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />

    {routePoints.length >= 2 && (
      <Polyline positions={routePoints} />
    )}

    <Marker position={[currentLat, currentLng]} icon={busMapIcon}>

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
              ARRIVING AT {(bus.destination || "DESTINATION").toUpperCase()}
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
          {bus.number} · {bus.origin || "Selected stop"} →{" "}
          {bus.destination || "Destination"}
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
   PROFILE
========================= */

function ProfileScreen({
  userAccount,
  savedTrips,
  onLogin,
  onSignup,
  onLogout,
  onOpenSaved,
}) {
  return (
    <>
      <div className="page-header">
        <span className="eyebrow">ACCOUNT</span>
        <h2 style={{ color: "#0f172a", margin: 0 }}>Profile</h2>
      </div>

      <div className="profile-card">
        <div className="profile-avatar">
          {userAccount?.name
            ? userAccount.name.charAt(0).toUpperCase()
            : "G"}
        </div>

        <div>
          <h3>{userAccount?.name || "BUSNETT Passenger"}</h3>
          <p>
            {userAccount
              ? userAccount.email
              : "Guest passenger"}
          </p>
        </div>
      </div>

      {!userAccount ? (
        <section
          style={{
            background: "#e8f7f0",
            borderRadius: "20px",
            padding: "16px",
            marginTop: "16px",
            marginBottom: "16px",
          }}
        >
          <span
            style={{
              display: "block",
              color: "#16865b",
              fontSize: "10px",
              fontWeight: "800",
              letterSpacing: "1px",
            }}
          >
            EXTENDED FEATURE
          </span>

          <h3
            style={{
              margin: "6px 0 5px",
              color: "#0f172a",
              fontSize: "16px",
            }}
          >
            Optional passenger account
          </h3>

          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "11px",
              lineHeight: 1.5,
            }}
          >
            BUSNETT works without login. Create an account only if you
            want to save trips and return to their live bus tracking.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "9px",
              marginTop: "14px",
            }}
          >
            <button
              onClick={onLogin}
              style={{
                border: "1px solid #16865b",
                background: "#ffffff",
                color: "#16865b",
                borderRadius: "10px",
                padding: "10px",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer",
              }}
            >
              Log in
            </button>

            <button
              onClick={onSignup}
              style={{
                border: "none",
                background: "#16865b",
                color: "#ffffff",
                borderRadius: "10px",
                padding: "10px",
                fontSize: "11px",
                fontWeight: "800",
                cursor: "pointer",
              }}
            >
              Sign up
            </button>
          </div>
        </section>
      ) : (
        <section
          style={{
            background: "#e8f7f0",
            borderRadius: "20px",
            padding: "15px",
            marginTop: "16px",
            marginBottom: "16px",
          }}
        >
          <span
            style={{
              display: "block",
              color: "#16865b",
              fontSize: "10px",
              fontWeight: "800",
              letterSpacing: "1px",
            }}
          >
            ACCOUNT ACTIVE
          </span>

          <strong
            style={{
              display: "block",
              marginTop: "5px",
              color: "#0f172a",
              fontSize: "14px",
            }}
          >
            {savedTrips.length} saved {savedTrips.length === 1 ? "trip" : "trips"}
          </strong>

          <button
            onClick={onOpenSaved}
            style={{
              marginTop: "12px",
              width: "100%",
              border: "none",
              background: "#16865b",
              color: "#ffffff",
              borderRadius: "10px",
              padding: "10px",
              fontSize: "11px",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            View saved trips
          </button>

          <button
            onClick={onLogout}
            style={{
              marginTop: "8px",
              width: "100%",
              border: "1px solid #dbe3ea",
              background: "#ffffff",
              color: "#475569",
              borderRadius: "10px",
              padding: "9px",
              fontSize: "11px",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </section>
      )}

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

      <section style={{ marginTop: "18px" }}>
        <div className="section-heading" style={{ marginBottom: "10px" }}>
          <div>
            <h2 style={{ margin: "4px 0 0", color: "#0f172a" }}>
              App Features
            </h2>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "10px",
          }}
        >
          {[
            "Live Tracking",
            "Smart Occupancy",
            "Route Search",
            "Crowding Forecast",
            "ETA Prediction",
            "Nearby Stops",
            "Smart Alerts",
            "Emergency Support",
          ].map((feature) => (
            <div
              key={feature}
              style={{
                padding: "12px 10px",
                borderBottom: "1px solid #e2e8f0",
                color: "#334155",
                fontSize: "13px",
                fontWeight: "700",
              }}
            >
              {feature}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}


function AuthScreen({
  mode,
  loading,
  error,
  onBack,
  onSwitch,
  onSubmit,
}) {
  const isSignup = mode === "signup";

  useEffect(() => {
    const resetAuthScroll = () => {
      const content = document.querySelector(".content");
      if (content) content.scrollTop = 0;
      window.scrollTo(0, 0);
    };

    requestAnimationFrame(resetAuthScroll);
  }, [mode]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      mode,
      name: name.trim(),
      email: email.trim(),
      password,
    });
  };

  return (
    <>
      <div className="search-page-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>

        <div>
          <span className="eyebrow">
            {isSignup ? "EXTENDED FEATURE" : "OPTIONAL ACCOUNT"}
          </span>
          <h2>{isSignup ? "Create account" : "Log in"}</h2>
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
        <strong
          style={{
            display: "block",
            color: "#0f172a",
            fontSize: "15px",
          }}
        >
          {isSignup
            ? "Save trips and track them later."
            : "Access your saved BUSNETT trips."}
        </strong>

        <p
          style={{
            margin: "7px 0 0",
            color: "#64748b",
            fontSize: "11px",
            lineHeight: 1.5,
          }}
        >
          {isSignup
            ? "Login is optional. All core route, ETA, occupancy and tracking features remain available as a guest."
            : "Your account is only needed for your saved-trip feature."}
        </p>
      </section>

      <form onSubmit={handleSubmit}>
        {isSignup && (
          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "11px",
                fontWeight: "800",
                color: "#475569",
              }}
            >
              NAME
            </label>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #dbe3ea",
                borderRadius: "12px",
                padding: "12px",
                outline: "none",
                fontSize: "13px",
                color: "#0f172a",
                background: "#ffffff",
              }}
            />
          </div>
        )}

        <div style={{ marginBottom: "12px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "11px",
              fontWeight: "800",
              color: "#475569",
            }}
          >
            EMAIL
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #dbe3ea",
              borderRadius: "12px",
              padding: "12px",
              outline: "none",
              fontSize: "13px",
              color: "#0f172a",
              background: "#ffffff",
            }}
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "11px",
              fontWeight: "800",
              color: "#475569",
            }}
          >
            PASSWORD
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            minLength={6}
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #dbe3ea",
              borderRadius: "12px",
              padding: "12px",
              outline: "none",
              fontSize: "13px",
              color: "#0f172a",
              background: "#ffffff",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              borderRadius: "12px",
              padding: "10px",
              marginBottom: "12px",
              fontSize: "11px",
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            border: "none",
            borderRadius: "12px",
            padding: "13px",
            background: "#16865b",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: "800",
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? "Please wait..."
            : isSignup
              ? "Create account"
              : "Log in"}
        </button>
      </form>

      <div
        style={{
          textAlign: "center",
          marginTop: "15px",
          fontSize: "11px",
          color: "#64748b",
        }}
      >
        {isSignup ? "Already have an account?" : "New to BUSNETT?"}

        <button
          type="button"
          onClick={onSwitch}
          style={{
            border: "none",
            background: "transparent",
            color: "#16865b",
            fontWeight: "800",
            cursor: "pointer",
            padding: "0 0 0 5px",
            fontSize: "11px",
          }}
        >
          {isSignup ? "Log in" : "Sign up"}
        </button>
      </div>

      <p
        style={{
          textAlign: "center",
          margin: "16px 10px 0",
          fontSize: "10px",
          lineHeight: 1.5,
          color: "#94a3b8",
        }}
      >
        You can continue using BUSNETT without creating an account.
      </p>
    </>
  );
}


export default App;