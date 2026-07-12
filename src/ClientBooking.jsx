import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Hand,
  Layers,
  Palette,
  Flower2,
  Sparkles,
  Eraser,
  Undo2,
  Footprints,
  Phone,
  MapPin,
  Check,
  Loader2,
  CalendarDays,
  Gem,
  ImagePlus,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const SERVICES = [
  { id: "strength", name: "Маникюр с укреплением", price: "100 000", icon: Hand },
  { id: "classic", name: "Классический маникюр", price: "60 000", icon: Hand },
  { id: "extension", name: "Маникюр с наращиванием, любой длины", price: "170 000 – 200 000", icon: Layers },
  { id: "design", name: "Дизайн (доплата)", price: "30 000 – 300 000", icon: Palette },
  { id: "japanese", name: "Японский маникюр", price: "100 000", icon: Flower2 },
  { id: "cleanup", name: "Чистка маникюр", price: "50 000", icon: Sparkles },
  { id: "remove-other", name: "Снять чужую работу", price: "50 000", icon: Eraser },
  { id: "remove-own", name: "Снять свою работу", price: "30 000", icon: Undo2 },
  { id: "pedicure", name: "Педикюр", price: "150 000 – 300 000", icon: Footprints },
];

// Hourly start times, 09:00–18:00. Each booking takes 2 hours, so picking an
// hour automatically closes the next hour too (handled by withFollowUpBlocked
// below) — no separate DB row is created for the blocked follow-up hour.
const SLOT_STARTS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const SLOTS = SLOT_STARTS.map((h) => {
  const fmt = (n) => `${String(n).padStart(2, "0")}:00`;
  return { key: fmt(h), label: fmt(h) };
});

// Given the set of actually-booked start times, return a new set that also
// includes the hour right after each booking (since one client occupies 2
// hours starting at their booked time).
function withFollowUpBlocked(bookedSet) {
  const blocked = new Set(bookedSet);
  bookedSet.forEach((key) => {
    const hour = parseInt(key.split(":")[0], 10);
    const nextHour = hour + 1;
    if (SLOT_STARTS.includes(nextHour)) {
      blocked.add(`${String(nextHour).padStart(2, "0")}:00`);
    }
  });
  return blocked;
}

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const ADDRESS = "Ташкент, Самарканд дарвоза, 74";
const MASTER_NAME = "Нона";
const MASTER_PHONE = "+998 33 906 56 59";
const TELEGRAM_USER = "NONA_20_04";
const TELEGRAM_URL = `https://t.me/${TELEGRAM_USER}`;

// Bron puli (depozit) — mijoz kartaga o'tkazadi va skrinshotini yuklaydi.
// Master admin panelida tasdiqlaydi. Summa tanlangan protsedura soniga qarab
// hisoblanadi: har bir protsedura uchun DEPOSIT_PER_SERVICE.
const DEPOSIT_PER_SERVICE = 10000; // so'm, bitta protsedura uchun
const DEPOSIT_CARD_NUMBER = "9860 3501 4004 1178"; // Rahmatullayeva Dilnoza
const DEPOSIT_CARD_HOLDER = "RAHMATULLAYEVA DILNOZA";

function formatSom(n) {
  return `${n.toLocaleString("ru-RU")} сум`;
}

// Booking dates start from tomorrow (today is never bookable) and run for
// about a month ahead.
function buildDays(count = 30) {
  const days = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = 1; i <= count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ iso, weekday: WEEKDAYS[d.getDay()], day: d.getDate(), month: MONTHS[d.getMonth()] });
  }
  return days;
}

function TelegramGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M21.5 3.5 3 10.6c-.9.36-.9 1.65.02 1.98l4.2 1.5 1.6 5.1c.24.77 1.2.98 1.74.38l2.4-2.66 4.4 3.26c.7.52 1.7.14 1.9-.72l3.1-14.4c.2-.95-.7-1.72-1.66-1.56Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.7 14.6 18 7.2 10.8 15.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
const DRAFT_KEY = "nm-booking-draft-v1";

export default function NailMaster() {
  const days = useMemo(() => buildDays(14), []);
  const [selectedDay, setSelectedDay] = useState(days[0].iso);
  const [selectedTime, setSelectedTime] = useState(null);
  const [busy, setBusy] = useState(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [depositPhoto, setDepositPhoto] = useState(null);
  const [depositPhotoError, setDepositPhotoError] = useState("");
  const [depositPhotoLoading, setDepositPhotoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [formError, setFormError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);

  // Restore an in-progress booking (name/phone/services/photos) if the person
  // left the site to pay via Click/Payme and came back — runs once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== "object") return;
      if (draft.selectedDay) setSelectedDay(draft.selectedDay);
      if (draft.selectedTime) setSelectedTime(draft.selectedTime);
      if (draft.name) setName(draft.name);
      if (draft.phone) setPhone(draft.phone);
      if (draft.note) setNote(draft.note);
      if (Array.isArray(draft.selectedServiceIds)) setSelectedServiceIds(draft.selectedServiceIds);
      if (draft.photo) setPhoto(draft.photo);
      if (draft.depositPhoto) setDepositPhoto(draft.depositPhoto);
    } catch (e) {
      // ignore corrupt draft
    }
  }, []);

  // Save the in-progress booking on every change so it survives switching to
  // the Click/Payme app and back.
  useEffect(() => {
    if (confirmed) return;
    const hasContent = name || phone || note || selectedServiceIds.length > 0 || photo || depositPhoto;
    if (!hasContent) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ selectedDay, selectedTime, name, phone, note, selectedServiceIds, photo, depositPhoto })
      );
    } catch (e) {
      // localStorage full or unavailable — safe to ignore, just won't persist
    }
  }, [selectedDay, selectedTime, name, phone, note, selectedServiceIds, photo, depositPhoto, confirmed]);

  const toggleService = (id) => {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const depositCount = Math.max(selectedServiceIds.length, 1);
  const depositTotal = depositCount * DEPOSIT_PER_SERVICE;

  const loadBusySlots = useCallback(async (dateIso) => {
    setLoadingSlots(true);
    setStorageWarning(false);
    try {
      const { data, error } = await supabase.from("bookings").select("slot").eq("date", dateIso);
      if (error) throw error;
      setBusy(new Set((data || []).map((row) => row.slot)));
    } catch (e) {
      setStorageWarning(true);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    loadBusySlots(selectedDay);
    setSelectedTime(null);
    setConfirmed(null);
  }, [selectedDay, loadBusySlots]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Shared image-compression helper (used for both the design photo and the
  // payment screenshot) — resizes to maxSide and converts to JPEG.
  const compressImage = (file, { onStart, onDone, onError }) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError("Можно загрузить только изображение.");
      return;
    }
    onStart();
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1000;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width > height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        onDone(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => onError("Не удалось открыть изображение.");
      img.src = reader.result;
    };
    reader.onerror = () => onError("Не удалось прочитать файл.");
    reader.readAsDataURL(file);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setPhotoError("");
    compressImage(file, {
      onStart: () => setPhotoLoading(true),
      onDone: (dataUrl) => {
        setPhoto(dataUrl);
        setPhotoLoading(false);
      },
      onError: (msg) => {
        setPhotoError(msg);
        setPhotoLoading(false);
      },
    });
  };

  const handleDepositPhotoChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setDepositPhotoError("");
    compressImage(file, {
      onStart: () => setDepositPhotoLoading(true),
      onDone: (dataUrl) => {
        setDepositPhoto(dataUrl);
        setDepositPhotoLoading(false);
      },
      onError: (msg) => {
        setDepositPhotoError(msg);
        setDepositPhotoLoading(false);
      },
    });
  };

  // busy = actual booked start times from the DB. blockedSlots = busy + the
  // hour right after each booking, since a client occupies 2 hours.
  const blockedSlots = useMemo(() => withFollowUpBlocked(busy), [busy]);

  const chooseTime = (key) => {
    if (blockedSlots.has(key)) return;
    setSelectedTime(key);
    setFormError("");
    setConfirmed(null);
  };

  const submitBooking = async () => {
    if (!name.trim() || !phone.trim()) {
      setFormError("Укажите имя и номер телефона.");
      return;
    }
    if (selectedServiceIds.length === 0) {
      setFormError("Выберите хотя бы одну процедуру.");
      return;
    }
    if (!depositPhoto) {
      setFormError("Прикрепите скриншот перевода бронирующего платежа.");
      return;
    }
    if (!selectedTime) return;
    setSubmitting(true);
    setFormError("");
    try {
      const serviceNames = SERVICES.filter((s) => selectedServiceIds.includes(s.id)).map((s) => s.name);
      const fullNote = [serviceNames.join(", "), note.trim()].filter(Boolean).join(" — ");
      const { error } = await supabase.from("bookings").insert({
        date: selectedDay,
        slot: selectedTime,
        name: name.trim(),
        phone: phone.trim(),
        note: fullNote,
        photo: photo || null,
        deposit_photo: depositPhoto,
        deposit_status: "pending",
      });
      if (error) {
        if (error.code === "23505") {
          // unique(date, slot) violation — someone else booked it first
          setFormError("Это время уже заняли. Выберите другое.");
          await loadBusySlots(selectedDay);
          setSelectedTime(null);
          setSubmitting(false);
          return;
        }
        throw error;
      }
      setConfirmed({ day: selectedDay, time: selectedTime });
      setBusy((prev) => new Set(prev).add(selectedTime));
      setName("");
      setPhone("");
      setNote("");
      setSelectedServiceIds([]);
      setPhoto(null);
      setPhotoError("");
      setDepositPhoto(null);
      setDepositPhotoError("");
      setSelectedTime(null);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (e) {
        // ignore
      }
    } catch (e) {
      setFormError("Не удалось сохранить запись. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDayLabel = useMemo(() => {
    const d = days.find((x) => x.iso === selectedDay);
    return d ? `${d.day} ${d.month}` : "";
  }, [days, selectedDay]);

  const selectedSlotLabel = useMemo(() => SLOTS.find((s) => s.key === selectedTime)?.label, [selectedTime]);
  const confirmedSlotLabel = useMemo(
    () => (confirmed ? SLOTS.find((s) => s.key === confirmed.time)?.label : null),
    [confirmed]
  );

  return (
    <div className="nm-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

        .nm-page {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          background: #F7DCE8;
          color: #2B1620;
          font-family: 'Inter', sans-serif;
        }
        .nm-display { font-family: 'Poppins', sans-serif; font-weight: 800; letter-spacing: -0.01em; line-height: 1.1; }
        .nm-mono { font-family: 'Space Mono', monospace; }
        .nm-eyebrow { text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.75rem; font-weight: 600; color: #7A1F49; }
        .nm-primary { color: #7A1F49; }
        .nm-muted { color: #5A3345; }
        .nm-muted-light { color: #8C6575; }

        .nm-decor { position: absolute; border-radius: 9999px; pointer-events: none; }
        .nm-decor-top { top: -4rem; left: 50%; transform: translateX(-50%); width: 14rem; height: 14rem; background: #7A1F49; }
        .nm-decor-left { top: -2.5rem; left: -4rem; width: 13rem; height: 13rem; background: rgba(122,31,73,0.25); }
        .nm-decor-right { top: 6rem; right: -3rem; width: 7rem; height: 7rem; background: #7A1F49; }
        .nm-decor-bottom { bottom: 0; right: -5rem; width: 20rem; height: 20rem; background: rgba(122,31,73,0.2); filter: blur(6px); }
        .nm-decor-small { bottom: 2.5rem; left: -2.5rem; width: 6rem; height: 6rem; background: #7A1F49; }

        .nm-header { position: sticky; top: 0; z-index: 30; background: rgba(247,220,232,0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(122,31,73,0.12); }
        .nm-badge { background: #7A1F49; color: #fff; }
        .nm-nav-link { color: #5A3345; transition: color .15s; }
        .nm-nav-link:hover { color: #2B1620; }

        .nm-btn { background: #7A1F49; color: #fff; border-radius: 9999px; transition: background .15s; border: none; cursor: pointer; }
        .nm-btn:hover { background: #611839; }
        .nm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .nm-btn-outline { background: transparent; border: 1.5px solid rgba(122,31,73,0.3); border-radius: 9999px; transition: border-color .15s; cursor: pointer; }
        .nm-btn-outline:hover { border-color: #7A1F49; }

        .nm-hero-card { background: #fff; border-radius: 2rem; box-shadow: 0 20px 50px rgba(122,31,73,0.18); }

        .nm-card { background: #fff; border-radius: 1rem; box-shadow: 0 6px 20px rgba(122,31,73,0.08); }
        .nm-card-lg { background: #fff; border-radius: 1.25rem; box-shadow: 0 10px 30px rgba(122,31,73,0.12); }

        .nm-icon-badge { width: 2.5rem; height: 2.5rem; border-radius: 9999px; background: #7A1F49; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        .nm-chip { background: #fff; border: 1px solid rgba(122,31,73,0.15); border-radius: 0.75rem; transition: border-color .15s; cursor: pointer; }
        .nm-chip:hover:not(:disabled) { border-color: #7A1F49; }
        .nm-chip-active { background: #7A1F49; border-color: #7A1F49; color: #fff; }
        .nm-chip-busy { background: #EFDCE4; border-color: rgba(122,31,73,0.1); color: #B593A5; text-decoration: line-through; cursor: not-allowed; }

        .nm-service-chip { background: #fff; border: 1px solid rgba(122,31,73,0.15); border-radius: 0.75rem; cursor: pointer; transition: border-color .15s, background .15s; }
        .nm-service-chip:hover { border-color: #7A1F49; }
        .nm-service-chip-active { background: #7A1F49; border-color: #7A1F49; color: #fff; }

        .nm-input { border: 1px solid rgba(122,31,73,0.18); border-radius: 0.75rem; padding: 0.75rem 1rem; font-size: 0.9rem; outline: none; transition: border-color .15s; width: 100%; background: #fff; color: #2B1620; }
        .nm-input:focus { border-color: #7A1F49; }
        .nm-input::placeholder { color: #B79AA8; }

        .nm-divider { border-top: 1px solid rgba(122,31,73,0.12); }
        .nm-error { color: #C0405A; }

        .nm-photo-upload { display: flex; align-items: center; gap: 0.6rem; border: 1.5px dashed rgba(122,31,73,0.3); border-radius: 0.75rem; padding: 0.7rem 1rem; font-size: 0.85rem; color: #5A3345; cursor: pointer; transition: border-color .15s, background .15s; }
        .nm-photo-upload:hover { border-color: #7A1F49; background: rgba(122,31,73,0.04); }
        .nm-photo-preview { width: 3.5rem; height: 3.5rem; object-fit: cover; border-radius: 0.6rem; border: 1px solid rgba(122,31,73,0.15); }
        .hidden { display: none; }

        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="nm-decor nm-decor-top" />
      <div className="nm-decor nm-decor-left" />
      <div className="nm-decor nm-decor-right" />
      <div className="nm-decor nm-decor-bottom" />
      <div className="nm-decor nm-decor-small" />

      {/* Header */}
      <header className="nm-header">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between relative">
          <button onClick={() => scrollTo("home")} className="flex items-center gap-2">
            <span className="nm-icon-badge">
              <Gem size={15} />
            </span>
            <span className="nm-display text-xl">
              Nail <span className="nm-primary">Master</span>
            </span>
          </button>
          <nav className="hidden sm:flex items-center gap-7 text-sm">
            <button onClick={() => scrollTo("home")} className="nm-nav-link">Главная</button>
            <button onClick={() => scrollTo("services")} className="nm-nav-link">Услуги</button>
            <button onClick={() => scrollTo("booking")} className="nm-nav-link">Запись</button>
            <button onClick={() => scrollTo("contacts")} className="nm-nav-link">Контакты</button>
          </nav>
          <button onClick={() => scrollTo("booking")} className="nm-btn text-sm px-4 py-2">
            Записаться
          </button>
        </div>
      </header>

      {/* Hero */}
      <section id="home" className="max-w-5xl mx-auto px-5 pt-16 pb-14 sm:pt-24 sm:pb-20 relative">
        <div className="flex flex-col sm:flex-row gap-10 items-center">
          <div className="flex-1 w-full">
            <p className="nm-eyebrow mb-4">Премиум студия маникюра</p>
            <h1 className="nm-display text-4xl sm:text-5xl">
              Ухоженные руки —<br />
              ваша <span className="nm-primary">визитная карточка</span>
            </h1>
            <p className="mt-4 nm-primary font-bold text-lg sm:text-xl">
              ⚡ Онлайн-запись всего за 1 минуту!
            </p>
            <p className="mt-3 nm-muted max-w-md leading-relaxed">
              Маникюр, педикюр и дизайн любой сложности от мастера Нона. Выберите
              удобное время — оно закрепится только за вами.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={() => scrollTo("booking")} className="nm-btn px-9 py-4 text-base font-semibold">
                Записаться онлайн
              </button>
              <button onClick={() => scrollTo("services")} className="nm-btn-outline px-4 py-2 text-xs">
                Смотреть цены
              </button>
            </div>
          </div>
          <div className="nm-hero-card relative aspect-square flex items-center justify-center w-full sm:w-80 shrink-0">
            <div className="absolute top-5 right-5 w-3 h-3 rounded-full" style={{ background: "#7A1F49" }} />
            <svg viewBox="0 0 200 200" className="w-2/3 h-2/3" fill="none">
              <path
                d="M60 150 C55 110, 55 70, 70 40 C75 30, 90 28, 92 40 C95 60, 90 95, 90 95 M92 40 C95 25, 110 25, 112 40 C115 65, 108 100, 108 100 M112 40 C116 28, 130 30, 130 44 C133 68, 122 105, 122 105 M130 44 C135 36, 146 40, 145 52 C143 75, 132 108, 122 130 C112 152, 90 160, 75 152 C62 145, 58 165, 60 150 Z"
                stroke="#7A1F49"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M92 40 C90 46, 88 52, 88 58" stroke="#C9A227" strokeWidth="2" strokeLinecap="round" />
              <path d="M112 40 C110 47, 108 53, 107 59" stroke="#C9A227" strokeWidth="2" strokeLinecap="round" />
              <path d="M130 44 C128 51, 126 57, 124 63" stroke="#C9A227" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* Services / price list — view only */}
      <section id="services" className="max-w-4xl mx-auto px-5 py-16 relative">
        <div className="text-center mb-10">
          <p className="nm-eyebrow mb-3">Прайс-лист</p>
          <h2 className="nm-display text-3xl sm:text-4xl">Услуги и цены</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {SERVICES.map((svc) => {
            const Icon = svc.icon;
            return (
              <div key={svc.id} className="nm-card flex items-center gap-4 px-5 py-4">
                <span className="nm-icon-badge">
                  <Icon size={17} />
                </span>
                <span className="flex-1 text-sm sm:text-base">{svc.name}</span>
                <span className="nm-mono nm-primary text-sm font-bold whitespace-nowrap">{svc.price}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Booking */}
      <section id="booking" className="max-w-3xl mx-auto px-5 py-16 relative">
        <div className="text-center mb-10">
          <p className="nm-eyebrow mb-3">Онлайн-запись</p>
          <h2 className="nm-display text-3xl sm:text-4xl">Выберите дату и время</h2>
          <p className="mt-3 text-sm nm-muted">Каждая запись длится 2 часа</p>
        </div>

        {/* Date chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 sm:mx-0 sm:px-0">
          {days.map((d) => {
            const active = d.iso === selectedDay;
            return (
              <button
                key={d.iso}
                onClick={() => setSelectedDay(d.iso)}
                className={`nm-chip ${active ? "nm-chip-active" : ""} shrink-0 w-16 py-3 text-center`}
              >
                <div className="text-xs uppercase" style={{ opacity: active ? 0.75 : 0.6 }}>{d.weekday}</div>
                <div className="nm-display text-lg mt-0.5">{d.day}</div>
                <div className="text-xs" style={{ opacity: active ? 0.75 : 0.6 }}>{d.month}</div>
              </button>
            );
          })}
        </div>

        {/* Time slots */}
        <div className="mt-6">
          <div className="flex items-center gap-2 text-sm nm-muted mb-3">
            <CalendarDays size={15} />
            <span>{selectedDayLabel} — свободное время</span>
            {loadingSlots && <Loader2 size={14} className="animate-spin nm-primary" />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {SLOTS.map((s) => {
              const isBusy = blockedSlots.has(s.key);
              const active = selectedTime === s.key;
              return (
                <button
                  key={s.key}
                  disabled={isBusy}
                  onClick={() => chooseTime(s.key)}
                  className={`nm-mono nm-chip text-sm py-3 ${isBusy ? "nm-chip-busy" : active ? "nm-chip-active" : ""}`}
                >
                  {s.label}
                  {isBusy && <div className="text-xs mt-0.5" style={{ textDecoration: "none", letterSpacing: "0.05em" }}>занято</div>}
                </button>
              );
            })}
          </div>
          {storageWarning && (
            <p className="text-xs nm-primary mt-3">
              Не удалось проверить занятость времени. Обновите страницу и попробуйте снова.
            </p>
          )}
        </div>

        {/* Name + phone form — appears only after picking a time */}
        {selectedTime && !confirmed && (
          <div className="nm-card-lg mt-8 p-5 sm:p-6">
            <p className="text-sm mb-4">
              Вы выбрали <span className="font-semibold">{selectedDayLabel}, {selectedSlotLabel}</span>. Оставьте имя и номер, чтобы закрепить это время за собой.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" className="nm-input" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" className="nm-input" />
            </div>

            <div className="mt-3">
              <p className="text-xs nm-muted mb-1.5">Какая процедура нужна? (цена обсуждается с мастером отдельно)</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {SERVICES.map((svc) => {
                  const checked = selectedServiceIds.includes(svc.id);
                  const Icon = svc.icon;
                  return (
                    <label
                      key={svc.id}
                      className={`nm-service-chip flex items-center gap-2 text-sm px-3 py-2.5 ${checked ? "nm-service-chip-active" : ""}`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleService(svc.id)} className="hidden" />
                      <Icon size={15} className={checked ? "" : "nm-primary"} />
                      <span>{svc.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Комментарий (необязательно)"
              className="nm-input mt-3"
            />

            <div className="mt-3">
              {photo ? (
                <div className="flex items-center gap-3">
                  <img src={photo} alt="Дизайн" className="nm-photo-preview" />
                  <div className="flex-1">
                    <p className="text-xs nm-muted">Фото дизайна прикреплено</p>
                    <button
                      type="button"
                      onClick={() => setPhoto(null)}
                      className="mt-1 inline-flex items-center gap-1 text-xs nm-error"
                    >
                      <X size={12} /> Удалить фото
                    </button>
                  </div>
                </div>
              ) : (
                <label className="nm-photo-upload">
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                  {photoLoading ? (
                    <Loader2 size={16} className="animate-spin nm-primary" />
                  ) : (
                    <ImagePlus size={16} className="nm-primary" />
                  )}
                  <span>{photoLoading ? "Обработка фото..." : "Прикрепить фото желаемого дизайна (необязательно)"}</span>
                </label>
              )}
              {photoError && <p className="text-xs nm-error mt-1.5">{photoError}</p>}
            </div>

            {/* Deposit / booking payment */}
            <div className="nm-divider mt-4 pt-4">
              <p className="text-sm font-semibold">
                Бронирующий платёж — {formatSom(depositTotal)}
                <span className="nm-muted-light font-normal"> ({depositCount} {depositCount === 1 ? "процедура" : "процедуры"} × {formatSom(DEPOSIT_PER_SERVICE)})</span>
              </p>
              <p className="text-xs nm-muted mt-1">
                Переведите {formatSom(depositTotal)} на карту ниже (через Click, Payme или банк напрямую), затем прикрепите скриншот перевода.
                Время закрепится за вами после того, как мастер подтвердит платёж.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="nm-mono text-sm nm-primary font-bold">{DEPOSIT_CARD_NUMBER}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(DEPOSIT_CARD_NUMBER.replace(/\s/g, ""))}
                  className="nm-btn-ghost text-xs px-2.5 py-1"
                >
                  Копировать
                </button>
              </div>
              <p className="text-xs nm-muted-light mt-1">{DEPOSIT_CARD_HOLDER}</p>

              <div className="mt-3">
                {depositPhoto ? (
                  <div className="flex items-center gap-3">
                    <img src={depositPhoto} alt="Скриншот перевода" className="nm-photo-preview" />
                    <div className="flex-1">
                      <p className="text-xs nm-muted">Скриншот перевода прикреплён</p>
                      <button
                        type="button"
                        onClick={() => setDepositPhoto(null)}
                        className="mt-1 inline-flex items-center gap-1 text-xs nm-error"
                      >
                        <X size={12} /> Удалить скриншот
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="nm-photo-upload">
                    <input type="file" accept="image/*" onChange={handleDepositPhotoChange} className="hidden" />
                    {depositPhotoLoading ? (
                      <Loader2 size={16} className="animate-spin nm-primary" />
                    ) : (
                      <ImagePlus size={16} className="nm-primary" />
                    )}
                    <span>{depositPhotoLoading ? "Обработка фото..." : "Прикрепить скриншот перевода"}</span>
                  </label>
                )}
                {depositPhotoError && <p className="text-xs nm-error mt-1.5">{depositPhotoError}</p>}
              </div>
            </div>

            {formError && <p className="text-xs nm-error mt-3">{formError}</p>}
            <p className="text-xs nm-muted-light mt-3">
              Занятость времени видна всем посетителям сайта — это защищает вас от двойной записи.
            </p>
            <button onClick={submitBooking} disabled={submitting || depositPhotoLoading} className="nm-btn mt-4 w-full sm:w-auto px-6 py-3 text-sm flex items-center justify-center gap-2">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Подтвердить запись
            </button>
          </div>
        )}

        {/* Confirmation */}
        {confirmed && (
          <div className="nm-card-lg mt-8 p-6">
            <div className="flex items-start gap-3">
              <span className="nm-icon-badge mt-0.5">
                <Check size={16} />
              </span>
              <div>
                <p className="font-semibold text-lg">Вы записаны!</p>
                <p className="text-sm nm-muted mt-1">
                  {days.find((d) => d.iso === confirmed.day)?.day} {days.find((d) => d.iso === confirmed.day)?.month}, {confirmedSlotLabel}
                </p>
                <p className="text-xs nm-muted mt-2">
                  Мастер проверит скриншот платежа и подтвердит вашу запись. Если возникнут вопросы — напишем вам в Telegram или позвоним.
                </p>
              </div>
            </div>
            <div className="nm-divider mt-5 pt-5 space-y-2 text-sm nm-muted">
              <div className="flex items-center gap-2"><MapPin size={14} className="nm-primary" /> Наш адрес: {ADDRESS}</div>
              <div className="flex items-center gap-2"><Phone size={14} className="nm-primary" /> Мастер {MASTER_NAME}: {MASTER_PHONE}</div>
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 nm-primary font-medium hover:underline">
                <TelegramGlyph size={14} /> Написать в Telegram
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Footer / contacts */}
      <footer id="contacts" className="nm-divider mt-6 relative">
        <div className="max-w-5xl mx-auto px-5 py-12 grid sm:grid-cols-3 gap-8 text-sm nm-muted">
          <div>
            <p className="nm-display text-xl mb-2" style={{ color: "#2B1620" }}>Nail Master</p>
            <p>Маникюр и педикюр с вниманием к деталям.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><Phone size={14} className="nm-primary" /> Мастер {MASTER_NAME}: {MASTER_PHONE}</div>
            <div className="flex items-center gap-2"><MapPin size={14} className="nm-primary" /> {ADDRESS}</div>
          </div>
          <div className="flex sm:justify-end items-start">
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="nm-btn flex items-center gap-2 px-4 py-2.5">
              <TelegramGlyph size={15} /> @{TELEGRAM_USER}
            </a>
          </div>
        </div>
        <div className="text-center text-xs nm-muted-light pb-6">© {new Date().getFullYear()} Nail Master</div>
      </footer>
    </div>
  );
}
