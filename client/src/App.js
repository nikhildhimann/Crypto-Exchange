import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { router } from "./components/routes";
import { TransactionStatus } from "./components/ui/TransactionStatus";

export default function App() {
  return (
    <div className="aura-mobile-root">
      <RouterProvider router={router} />
      <TransactionStatus />
      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          className: "!border !border-slate-800 !bg-slate-950 !text-slate-100",
        }}
      />
    </div>
  );
}