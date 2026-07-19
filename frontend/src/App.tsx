import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./home/HomePage";
import ChatPage from "./chat/ChatPage";
import NotesPage from "./notes/NotesPage";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link to="/" className="text-lg font-bold text-teal-700">Alice</Link>
            <nav className="flex gap-1">
              <NavLink to="/" end className={navLink}>Home</NavLink>
              <NavLink to="/chat" className={navLink}>Intake chat</NavLink>
              <NavLink to="/notes" className={navLink}>Notes</NavLink>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:id" element={<NotesPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
