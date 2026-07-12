import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Gem,
  Lock,
  RefreshCw,
  Loader2,
  User,
  Phone,
  Sparkles,
  Trash2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Users,
  Check,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";

// ---------------------------------------------------------------------------
// Config — change the PIN here. This is a light front-door lock, not real
// security: anyone with the PIN (or the storage keys) can read booking data.
// ---------------------------------------------------------------------------
const ADMIN_PIN = "2004";
const MASTER_NAME = "Нона";

// Hourly start times, 09:00–18:00 — must match src/ClientBooking.jsx.
const SLOT_STARTS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const SLOTS = SLOT_STARTS.map((h) => {
  const fmt = (n) => `${String(n).padStart(2, "0")}:00`;
  return { key: fmt(h), label: fmt(h) };
});

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function buildDays(count = 21) {
  const days = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ iso, weekday: WEEKDAYS[d.getDay()], day: d.getDate(), month: MONTHS[d.getMonth()] });
  }
  return days;
}

// ---------------------------------------------------------------------------
export default function NailMasterAdmin() {
  const days = useMemo(() => buildDays(21), []);
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const [selectedDay, setSelectedDay] = useState(days[0].iso);
  const [dayCounts, setDayCounts] = useState({});
  const [dayBookings, setDayBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [deletingKey, setDeletingKey] = useState(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  const loadCountsForRange = useCallback(async () => {
    try {
      const from = days[0].iso;
      const to = days[days.length - 1].iso;
      const { data, error } = await supabase.from("bookings").select("date").gte("date", from).lte("date", to);
      if (error) throw error;
      const counts = {};
      (data || []).forEach((row) => {
        counts[row.date] = (counts[row.date] || 0) + 1;
      });
      setDayCounts(counts);
    } catch (e) {
      // silent — chips just won't show counts
    }
  }, [days]);

  const loadDay = useCallback(async (dateIso) => {
    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await supabase.from("bookings").select("*").eq("date", dateIso);
      if (error) throw error;
      const bySlot = Object.fromEntries((data || []).map((row) => [row.slot, row]));
      const results = SLOTS.map((s) => {
        const row = bySlot[s.key];
        if (!row) return null;
        return {
          id: row.id,
          slotKey: s.key,
          slotLabel: s.label,
          name: row.name,
          phone: row.phone,
          note: row.note,
          photo: row.photo,
          depositPhoto: row.deposit_photo,
          depositStatus: row.deposit_status || "pending",
        };
      }).filter(Boolean);
      setDayBookings(results);
    } catch (e) {
      setLoadError("Не удалось загрузить записи. Обновите страницу.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    loadCountsForRange();
  }, [unlocked, loadCountsForRange]);

  useEffect(() => {
    if (!unlocked) return;
    loadDay(selectedDay);
  }, [unlocked, selectedDay, loadDay]);

  const tryUnlock = () => {
    if (pinInput.trim() === ADMIN_PIN) {
      setUnlocked(true);
      setPinError("");
    } else {
      setPinError("Неверный PIN. Попробуйте снова.");
    }
  };

  const [confirmingKey, setConfirmingKey] = useState(null);

  const confirmPayment = async (id, slotKey) => {
    setConfirmingKey(slotKey);
    try {
      const { error } = await supabase.from("bookings").update({ deposit_status: "confirmed" }).eq("id", id);
      if (error) throw error;
      setDayBookings((prev) => prev.map((b) => (b.slotKey === slotKey ? { ...b, depositStatus: "confirmed" } : b)));
    } catch (e) {
      setLoadError("Не удалось подтвердить платёж. Попробуйте ещё раз.");
    } finally {
      setConfirmingKey(null);
    }
  };

  const deleteBooking = async (id, slotKey) => {
    setDeletingKey(slotKey);
    try {
      const { error } = await supabase.from("bookings").delete().eq("id", id);
      if (error) throw error;
      setDayBookings((prev) => prev.filter((b) => b.slotKey !== slotKey));
      setDayCounts((prev) => ({ ...prev, [selectedDay]: Math.max(0, (prev[selectedDay] || 1) - 1) }));
    } catch (e) {
      setLoadError("Не удалось удалить запись. Попробуйте ещё раз.");
    } finally {
      setDeletingKey(null);
      setConfirmDeleteKey(null);
    }
  };

  const selectedDayObj = days.find((d) => d.iso === selectedDay);
  const totalUpcoming = useMemo(() => Object.values(dayCounts).reduce((a, b) => a + b, 0), [dayCounts]);

  const shiftDay = (delta) => {
    const idx = days.findIndex((d) => d.iso === selectedDay);
    const next = days[idx + delta];
    if (next) setSelectedDay(next.iso);
  };

  return (
    <div className="nma-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

        .nma-page {
          min-height: 100vh;
          background: #F7DCE8;
          color: #2B1620;
          font-family: 'Inter', sans-serif;
        }
        .nma-display { font-family: 'Poppins', sans-serif; font-weight: 800; letter-spacing: -0.01em; line-height: 1.1; }
        .nma-mono { font-family: 'Space Mono', monospace; }
        .nma-primary { color: #7A1F49; }
        .nma-muted { color: #5A3345; }
        .nma-muted-light { color: #8C6575; }

        .nma-header { position: sticky; top: 0; z-index: 30; background: rgba(247,220,232,0.92); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(122,31,73,0.12); }
        .nma-icon-badge { width: 2.25rem; height: 2.25rem; border-radius: 9999px; background: #7A1F49; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        .nma-btn { background: #7A1F49; color: #fff; border-radius: 9999px; transition: background .15s; border: none; cursor: pointer; }
        .nma-btn:hover { background: #611839; }
        .nma-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .nma-btn-ghost { background: transparent; border: 1px solid rgba(122,31,73,0.2); border-radius: 9999px; cursor: pointer; transition: border-color .15s; color: #7A1F49; }
        .nma-btn-ghost:hover { border-color: #7A1F49; }

        .nma-badge-pending { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.02em; padding: 0.15rem 0.5rem; border-radius: 9999px; background: #FCE8CC; color: #8A5A00; white-space: nowrap; }
        .nma-badge-paid { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.02em; padding: 0.15rem 0.5rem; border-radius: 9999px; background: #D8EFDD; color: #1E7A38; white-space: nowrap; }

        .nma-card { background: #fff; border-radius: 1rem; box-shadow: 0 6px 20px rgba(122,31,73,0.08); }
        .nma-card-lg { background: #fff; border-radius: 1.25rem; box-shadow: 0 10px 30px rgba(122,31,73,0.12); }

        .nma-input { border: 1px solid rgba(122,31,73,0.18); border-radius: 0.75rem; padding: 0.75rem 1rem; font-size: 0.95rem; outline: none; transition: border-color .15s; width: 100%; background: #fff; color: #2B1620; }
        .nma-input:focus { border-color: #7A1F49; }
        .nma-input::placeholder { color: #B79AA8; }

        .nma-chip { background: #fff; border: 1px solid rgba(122,31,73,0.15); border-radius: 0.75rem; transition: border-color .15s; cursor: pointer; position: relative; }
        .nma-chip:hover { border-color: #7A1F49; }
        .nma-chip-active { background: #7A1F49; border-color: #7A1F49; color: #fff; }
        .nma-chip-dot { position: absolute; top: 6px; right: 6px; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 9999px; background: #C9A227; color: #2B1620; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .nma-chip-active .nma-chip-dot { background: #fff; color: #7A1F49; }

        .nma-row { border: 1px solid rgba(122,31,73,0.1); border-radius: 0.9rem; background: #FFFCFD; }
        .nma-row-empty { border: 1px dashed rgba(122,31,73,0.18); border-radius: 0.9rem; color: #B79AA8; }

        .nma-divider { border-top: 1px solid rgba(122,31,73,0.12); }
        .nma-error { color: #C0405A; }

        .nma-photo-thumb { width: 3.75rem; height: 3.75rem; object-fit: cover; border-radius: 0.6rem; border: 1px solid rgba(122,31,73,0.15); cursor: zoom-in; }
        .nma-lightbox { position: fixed; inset: 0; background: rgba(43,22,32,0.88); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 2rem; cursor: zoom-out; }
        .nma-lightbox img { max-width: 100%; max-height: 100%; border-radius: 0.75rem; box-shadow: 0 20px 60px rgba(0,0,0,0.4); cursor: default; }
        .nma-lightbox-close { position: absolute; top: 1.25rem; right: 1.25rem; width: 2.25rem; height: 2.25rem; border-radius: 9999px; background: rgba(255,255,255,0.15); color: #fff; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .nma-lightbox-close:hover { background: rgba(255,255,255,0.25); }

        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      {!unlocked ? (
        <div className="min-h-screen flex items-center justify-center px-5">
          <div className="nma-card-lg p-7 w-full max-w-sm text-center">
            <div className="nma-icon-badge mx-auto mb-4">
              <Lock size={16} />
            </div>
            <p className="nma-display text-2xl mb-1">Панель мастера</p>
            <p className="text-sm nma-muted-light mb-6">Введите PIN, чтобы посмотреть записи</p>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              placeholder="PIN"
              className="nma-input text-center nma-mono text-lg tracking-widest"
              autoFocus
            />
            {pinError && <p className="text-xs nma-error mt-3">{pinError}</p>}
            <button onClick={tryUnlock} className="nma-btn w-full py-3 text-sm mt-4">
              Войти
            </button>
          </div>
        </div>
      ) : (
        <>
          <header className="nma-header">
            <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="nma-icon-badge">
                  <Gem size={14} />
                </span>
                <span className="nma-display text-lg">
                  Nail <span className="nma-primary">Master</span> <span className="nma-muted-light font-normal text-sm">· админ</span>
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm nma-muted">
                <Users size={15} />
                <span className="nma-mono">{totalUpcoming} записей / 21 дн.</span>
              </div>
            </div>
          </header>

          <main className="max-w-3xl mx-auto px-5 py-8">
            <p className="text-sm nma-muted-light mb-4">Здравствуйте, {MASTER_NAME}. Выберите дату, чтобы увидеть записи.</p>

            {/* Date chips */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5">
              {days.map((d) => {
                const active = d.iso === selectedDay;
                const count = dayCounts[d.iso] || 0;
                return (
                  <button
                    key={d.iso}
                    onClick={() => setSelectedDay(d.iso)}
                    className={`nma-chip ${active ? "nma-chip-active" : ""} shrink-0 w-16 py-3 text-center`}
                  >
                    {count > 0 && <span className="nma-chip-dot">{count}</span>}
                    <div className="text-xs uppercase" style={{ opacity: active ? 0.75 : 0.6 }}>{d.weekday}</div>
                    <div className="nma-display text-lg mt-0.5">{d.day}</div>
                    <div className="text-xs" style={{ opacity: active ? 0.75 : 0.6 }}>{d.month}</div>
                  </button>
                );
              })}
            </div>

            {/* Day panel */}
            <div className="nma-card-lg mt-6 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <button onClick={() => shiftDay(-1)} className="nma-btn-ghost p-1.5"><ChevronLeft size={16} /></button>
                  <div className="flex items-center gap-2 nma-display text-lg">
                    <CalendarDays size={16} className="nma-primary" />
                    {selectedDayObj?.day} {selectedDayObj?.month}, {selectedDayObj?.weekday}
                  </div>
                  <button onClick={() => shiftDay(1)} className="nma-btn-ghost p-1.5"><ChevronRight size={16} /></button>
                </div>
                <button onClick={() => { loadDay(selectedDay); loadCountsForRange(); }} className="nma-btn-ghost p-2" title="Обновить">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                </button>
              </div>

              {loadError && <p className="text-xs nma-error mb-3">{loadError}</p>}

              {loading ? (
                <div className="flex items-center gap-2 text-sm nma-muted-light py-6 justify-center">
                  <Loader2 size={15} className="animate-spin" /> Загрузка...
                </div>
              ) : dayBookings.length === 0 ? (
                <div className="nma-row-empty text-center text-sm py-8">На этот день записей нет</div>
              ) : (
                <div className="space-y-2.5">
                  {SLOTS.map((s) => {
                    const b = dayBookings.find((x) => x.slotKey === s.key);
                    if (!b) {
                      return (
                        <div key={s.key} className="nma-row-empty flex items-center gap-3 px-4 py-3 text-sm">
                          <span className="nma-mono w-24 shrink-0">{s.label}</span>
                          <span>свободно</span>
                        </div>
                      );
                    }
                    const isConfirming = confirmDeleteKey === s.key;
                    return (
                      <div key={s.key} className="nma-row px-4 py-3.5">
                        <div className="flex items-start gap-3">
                          <span className="nma-mono nma-primary font-bold w-24 shrink-0 pt-0.5">{s.label}</span>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <User size={14} className="nma-primary shrink-0" />
                              <span className="truncate">{b.name || "Без имени"}</span>
                              {b.depositStatus === "confirmed" ? (
                                <span className="nma-badge-paid">оплачено</span>
                              ) : (
                                <span className="nma-badge-pending">ожидает оплаты</span>
                              )}
                            </div>
                            <a href={`tel:${b.phone}`} className="flex items-center gap-2 text-sm nma-muted hover:underline w-fit">
                              <Phone size={14} className="nma-primary shrink-0" />
                              {b.phone || "—"}
                            </a>
                            {b.note && (
                              <div className="flex items-start gap-2 text-sm nma-muted">
                                <Sparkles size={14} className="nma-primary shrink-0 mt-0.5" />
                                <span>{b.note}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3 flex-wrap">
                              {b.photo && (
                                <button onClick={() => setLightboxPhoto(b.photo)} className="block mt-1">
                                  <img src={b.photo} alt="Желаемый дизайн" className="nma-photo-thumb" />
                                </button>
                              )}
                              {b.depositPhoto && (
                                <div className="mt-1">
                                  <button onClick={() => setLightboxPhoto(b.depositPhoto)} className="block">
                                    <img src={b.depositPhoto} alt="Скриншот перевода" className="nma-photo-thumb" />
                                  </button>
                                  <p className="text-[10px] nma-muted-light text-center mt-0.5">оплата</p>
                                </div>
                              )}
                            </div>
                            {b.depositStatus !== "confirmed" && (
                              <button
                                onClick={() => confirmPayment(b.id, s.key)}
                                disabled={confirmingKey === s.key}
                                className="nma-btn text-xs px-3 py-1.5 mt-1 flex items-center gap-1.5"
                              >
                                {confirmingKey === s.key ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                Подтвердить оплату
                              </button>
                            )}
                          </div>
                          {isConfirming ? (
                            <div className="flex flex-col gap-1.5 shrink-0">
                              <button onClick={() => deleteBooking(b.id, s.key)} disabled={deletingKey === s.key} className="nma-btn text-xs px-3 py-1.5 flex items-center gap-1">
                                {deletingKey === s.key ? <Loader2 size={12} className="animate-spin" /> : "Удалить"}
                              </button>
                              <button onClick={() => setConfirmDeleteKey(null)} className="nma-btn-ghost text-xs px-3 py-1.5">Отмена</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteKey(s.key)} className="nma-btn-ghost p-2 shrink-0" title="Удалить запись">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs nma-muted-light mt-5 text-center">
              Данные общие для сайта записи — здесь видно то же, что видят клиенты как «занято».
            </p>
          </main>

          {lightboxPhoto && (
            <div className="nma-lightbox" onClick={() => setLightboxPhoto(null)}>
              <button className="nma-lightbox-close" onClick={() => setLightboxPhoto(null)}>
                <X size={18} />
              </button>
              <img src={lightboxPhoto} alt="Желаемый дизайн" onClick={(e) => e.stopPropagation()} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
