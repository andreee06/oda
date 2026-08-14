import { BrowserRouter, Route, Routes } from "react-router";
import AppShell from "./routes/AppShell";
import LoginPage from "./routes/LoginPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  );
}
