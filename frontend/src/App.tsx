import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { ColdStartOverlay } from "./components/ColdStartOverlay";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LandingPage } from "./pages/LandingPage";
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

// Browsing the catalog requires an account, so "/" itself is the fork: logged-out visitors get
// the marketing landing page, everyone else gets the real events list.
function HomeRoute() {
  const { user } = useAuth();
  return user ? <EventsPage /> : <LandingPage />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ColdStartOverlay />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomeRoute />} />
            <Route
              path="events/:eventId"
              element={
                <ProtectedRoute>
                  <EventDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="shows/:showId"
              element={
                <ProtectedRoute>
                  <ShowPage />
                </ProtectedRoute>
              }
            />
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
