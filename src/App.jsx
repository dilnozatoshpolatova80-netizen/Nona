import React from "react";
import ClientBooking from "./ClientBooking";
import AdminPanel from "./AdminPanel";

export default function App() {
  const isAdmin = window.location.pathname.replace(/\/+$/, "") === "/admin";
  return isAdmin ? <AdminPanel /> : <ClientBooking />;
}
