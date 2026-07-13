import EvoraInvoiceDashboard from "../EvoraInvoiceDashboard.jsx";

// The user is already signed in (the /invoice route is gated by NextAuth on the
// platform side), so there's no sign-in gate to render here — just the
// dashboard. Data is fetched via the /api/invoice/data server endpoint.
export default function App() {
  return <EvoraInvoiceDashboard />;
}
