import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ParticleBackground from "@/components/ParticleBackground";
import PageTransition from "@/components/PageTransition";
import AppLayout from "@/components/AppLayout";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminRoute from "@/components/AdminRoute";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import useAnalytics from "@/hooks/useAnalytics";
import useErrorTracking from "@/hooks/useErrorTracking";
import { captureUrlParams } from "@/lib/referral";

// Eagerly load critical routes (Landing, Auth, Feed)
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Feed from "./pages/Feed";
import NotFound from "./pages/NotFound";

// Lazy-load non-critical routes to reduce initial bundle
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Blueprint = lazy(() => import("./pages/Blueprint"));
const Settings = lazy(() => import("./pages/Settings"));
const IdeaPublic = lazy(() => import("./pages/IdeaPublic"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Validate = lazy(() => import("./pages/Validate"));
const Signals = lazy(() => import("./pages/Signals"));
const Saved = lazy(() => import("./pages/Saved"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const UseCases = lazy(() => import("./pages/UseCases"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Refund = lazy(() => import("./pages/Refund"));
const Changelog = lazy(() => import("./pages/Changelog"));
const Referrals = lazy(() => import("./pages/Referrals"));
const PainRadar = lazy(() => import("./pages/PainRadar"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Feedback = lazy(() => import("./pages/Feedback"));

const queryClient = new QueryClient();

const AppRoutes = () => {
  useAnalytics();
  useErrorTracking();

  // Capture UTM and referral params from URL on first load
  useEffect(() => { captureUrlParams(); }, []);

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#7C6AED] border-t-transparent rounded-full animate-spin" /></div>}>
      <Routes>
        {/* Public routes — own Navbar + Footer */}
        <Route path="/" element={<><Navbar /><PageTransition><Landing /></PageTransition><Footer /></>} />
        <Route path="/auth" element={<PageTransition><Auth /></PageTransition>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<Navigate to="/auth?mode=login" replace />} />
        <Route path="/signup" element={<Navigate to="/auth" replace />} />
        <Route path="/register" element={<Navigate to="/auth" replace />} />
        <Route path="/signin" element={<Navigate to="/auth?mode=login" replace />} />
        <Route path="/pricing" element={<><Navbar /><PageTransition><Pricing /></PageTransition><Footer /></>} />
        <Route path="/privacy" element={<><Navbar /><PageTransition><Privacy /></PageTransition><Footer /></>} />
        <Route path="/terms" element={<><Navbar /><PageTransition><Terms /></PageTransition><Footer /></>} />
        <Route path="/refund" element={<><Navbar /><PageTransition><Refund /></PageTransition><Footer /></>} />
        <Route path="/changelog" element={<><Navbar /><PageTransition><Changelog /></PageTransition><Footer /></>} />
        <Route path="/feedback" element={<PageTransition><Feedback /></PageTransition>} />

        {/* Onboarding — no sidebar, no nav */}
        <Route path="/onboarding" element={<ProtectedRoute><PageTransition><Onboarding /></PageTransition></ProtectedRoute>} />
        <Route path="/quiz" element={<ProtectedRoute><PageTransition><Onboarding /></PageTransition></ProtectedRoute>} />

        {/* Protected routes — with AppLayout (sidebar + header) */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/feed" element={<SectionErrorBoundary sectionName="feed"><PageTransition><Feed /></PageTransition></SectionErrorBoundary>} />
          <Route path="/idea/:id/blueprint" element={<SectionErrorBoundary sectionName="blueprint"><PageTransition><Blueprint /></PageTransition></SectionErrorBoundary>} />
          <Route path="/idea/:id" element={<SectionErrorBoundary sectionName="idea"><PageTransition><IdeaPublic /></PageTransition></SectionErrorBoundary>} />
          <Route path="/validate" element={<SectionErrorBoundary sectionName="validate"><PageTransition><Validate /></PageTransition></SectionErrorBoundary>} />
          <Route path="/use-cases" element={<SectionErrorBoundary sectionName="use-cases"><PageTransition><UseCases /></PageTransition></SectionErrorBoundary>} />
          <Route path="/signals" element={<SectionErrorBoundary sectionName="signals"><PageTransition><Signals /></PageTransition></SectionErrorBoundary>} />
          <Route path="/radar" element={<SectionErrorBoundary sectionName="radar"><PageTransition><PainRadar /></PageTransition></SectionErrorBoundary>} />
          <Route path="/alerts" element={<SectionErrorBoundary sectionName="alerts"><PageTransition><Alerts /></PageTransition></SectionErrorBoundary>} />
          <Route path="/saved" element={<SectionErrorBoundary sectionName="saved"><PageTransition><Saved /></PageTransition></SectionErrorBoundary>} />
          <Route path="/leaderboard" element={<SectionErrorBoundary sectionName="leaderboard"><PageTransition><Leaderboard /></PageTransition></SectionErrorBoundary>} />
          <Route path="/settings" element={<SectionErrorBoundary sectionName="settings"><PageTransition><Settings /></PageTransition></SectionErrorBoundary>} />
          <Route path="/referrals" element={<SectionErrorBoundary sectionName="referrals"><PageTransition><Referrals /></PageTransition></SectionErrorBoundary>} />
        </Route>

        {/* Admin — with AppLayout */}
        <Route element={<AdminRoute><AppLayout /></AdminRoute>}>
          <Route path="/admin" element={<PageTransition><AdminDashboard /></PageTransition>} />
        </Route>

        <Route path="*" element={<><Navbar /><PageTransition><NotFound /></PageTransition></>} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <ParticleBackground />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
