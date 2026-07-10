import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import EvoraInvoiceDashboard from "../EvoraInvoiceDashboard.jsx";
import { GRAPH_SCOPES } from "./authConfig.js";

function SignInPage() {
  const { instance } = useMsal();
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center px-6">
        <img
          src="/logos/faviconharts.png"
          alt="Harts"
          className="mx-auto mb-6 h-12 w-auto object-contain"
        />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1">
          Customer Invoice Dashboard
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          Sign in with your globalharts.com account to continue.
        </p>
        <button
          onClick={() => instance.loginPopup({ scopes: GRAPH_SCOPES, prompt: "select_account" })}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { inProgress } = useMsal();

  if (inProgress === InteractionStatus.Startup || inProgress === InteractionStatus.HandleRedirect) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <AuthenticatedTemplate>
        <EvoraInvoiceDashboard />
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <SignInPage />
      </UnauthenticatedTemplate>
    </>
  );
}
