import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SPOT_RANGES = [
  [3028, 3039],
  [3113, 3118],
  [3183, 3199]
];

const PARKING_SPOTS = SPOT_RANGES.flatMap(([from, to]) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)
);

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState("login");

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setMessage("Липсва Supabase конфигурация. Копирай .env.example като .env.local и добави ключовете.");
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setReservations([]);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    let active = true;

    async function loadProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", session.user.id)
        .single();

      if (!active) return;
      if (error) setMessage(error.message);
      setProfile(data);
      setLoading(false);
    }

    loadProfile();
    return () => { active = false; };
  }, [session]);

  async function loadReservations() {
    const { data, error } = await supabase
      .from("reservations")
      .select("id, spot_number, reservation_date, user_id, profiles(full_name)")
      .eq("reservation_date", selectedDate)
      .order("spot_number");

    if (error) {
      setMessage(error.message);
      return;
    }
    setReservations(data || []);
  }

  useEffect(() => {
    if (!session) return;

    loadReservations();

    const channel = supabase
      .channel(`reservations-${selectedDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations", filter: `reservation_date=eq.${selectedDate}` },
        () => loadReservations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, selectedDate]);

  const reservationBySpot = useMemo(
    () => new Map(reservations.map((r) => [r.spot_number, r])),
    [reservations]
  );

  async function reserveSpot(spotNumber) {
    setMessage("");
    const existing = reservationBySpot.get(spotNumber);

    if (existing) {
      if (existing.user_id === session.user.id) {
        if (!confirm(`Да освободя ли място ${spotNumber}?`)) return;
        const { error } = await supabase.from("reservations").delete().eq("id", existing.id);
        if (error) setMessage(error.message);
        else setMessage(`Място ${spotNumber} е освободено.`);
      }
      return;
    }

    const { error } = await supabase.from("reservations").insert({
      spot_number: spotNumber,
      reservation_date: selectedDate,
      user_id: session.user.id
    });

    if (error) {
      if (error.code === "23505") {
        setMessage("Мястото току-що беше заето от друг потребител.");
      } else {
        setMessage(error.message);
      }
      await loadReservations();
      return;
    }

    setMessage(`Място ${spotNumber} е запазено.`);
    await loadReservations();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (loading) return <div className="center">Зареждане...</div>;
  if (!session) return <Auth mode={authMode} setMode={setAuthMode} />;

  const myReservation = reservations.find((r) => r.user_id === session.user.id);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>🅿️ Parking Reservation</h1>
          <span>{profile?.full_name || session.user.email}</span>
        </div>
        <button className="secondary" onClick={signOut}>Изход</button>
      </header>

      <main className="container">
        <div className="controls">
          <label>
            Дата
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>
          <div className="legend">
            <span><i className="free"></i> Свободно</span>
            <span><i className="mine"></i> Моето</span>
            <span><i className="taken"></i> Заето</span>
          </div>
        </div>

        {myReservation && (
          <div className="notice">
            Твоето място за {selectedDate}: <strong>{myReservation.spot_number}</strong>
          </div>
        )}

        {message && <div className="message">{message}</div>}

        <div className="stats">
          <strong>{reservations.length}</strong> / {PARKING_SPOTS.length} места са заети
        </div>

        <div className="grid">
          {PARKING_SPOTS.map((spot) => {
            const reservation = reservationBySpot.get(spot);
            const mine = reservation?.user_id === session.user.id;

            return (
              <button
                key={spot}
                className={`spot ${reservation ? (mine ? "mine" : "taken") : "free"}`}
                onClick={() => reserveSpot(spot)}
                title={reservation ? (mine ? "Натисни за освобождаване" : `Заето от ${reservation.profiles?.full_name || "потребител"}`) : "Запази"}
              >
                <strong>{spot}</strong>
                <small>
                  {reservation ? (mine ? "Мое" : reservation.profiles?.full_name || "Заето") : "Свободно"}
                </small>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function Auth({ mode, setMode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) setError(error.message);
      else setError("Регистрацията е създадена. Ако е включено потвърждение на email, провери пощата си.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setBusy(false);
  }

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <h1>🅿️ Parking</h1>
        <p>{mode === "login" ? "Вход в системата" : "Създаване на профил"}</p>

        {mode === "signup" && (
          <input required placeholder="Име и фамилия" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        )}

        <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input required minLength={6} type="password" placeholder="Парола" value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <div className="error">{error}</div>}

        <button disabled={busy} className="primary">
          {busy ? "Изчакване..." : mode === "login" ? "Вход" : "Регистрация"}
        </button>

        <button
          type="button"
          className="link"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
        >
          {mode === "login" ? "Нямам профил" : "Вече имам профил"}
        </button>
      </form>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);