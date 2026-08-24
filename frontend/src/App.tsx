import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { ColdStartOverlay } from "./components/ColdStartOverlay";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { ShowPage } from "./pages/ShowPage";
import { BookingConfirmationPage } from "./pages/BookingConfirmationPage";
import { BookingHistoryPage } from "./pages/BookingHistoryPage";
import { WaitlistOfferPage } from "./pages/WaitlistOfferPage";
import { OrganiserDashboardPage } from "./pages/OrganiserDashboardPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ColdStartOverlay />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<EventsPage />} />
            <Route path="events/:eventId" element={<EventDetailPage />} />
            <Route path="shows/:showId" element={<ShowPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route
              path="booking-confirmation"
              element={
                <ProtectedRoute roles={["customer"]}>
                  <BookingConfirmationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="bookings"
              element={
                <ProtectedRoute roles={["customer"]}>
                  <BookingHistoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="waitlist-offer/:token"
              element={
                <ProtectedRoute roles={["customer"]}>
                  <WaitlistOfferPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="organiser"
              element={
                <ProtectedRoute roles={["organiser"]}>
                  <OrganiserDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
