import { createRoot } from "react-dom/client";
import { ClientApp } from './client';
import MyMcp from './pages/MyMcp';

// Crossmint Server API Key from environment
// This will be injected at build time by Vite
const CROSSMINT_API_KEY = import.meta.env.VITE_CROSSMINT_API_KEY || '';

export function App() {
  const params = new URL(location.href).searchParams;
  const view = params.get('view');
  if (view === 'my-mcp') {
    return <MyMcp />;
  }
  // Default app
  return <ClientApp apiKey={CROSSMINT_API_KEY} />;
}

// Render app
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
