"use client";

import { useTheme } from "next-themes";
import { ToastContainer, type ToastContainerProps } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Notification container, backed by react-toastify. The `toast()` API used across
// the app lives in `@/lib/toast` (a sonner-compatible shim). Kept under the
// historical `sonner.tsx` path/`Toaster` name so existing imports don't churn.
const Toaster = ({ ...props }: ToastContainerProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <ToastContainer
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      autoClose={5000}
      newestOnTop
      closeOnClick
      pauseOnHover
      draggable
      {...props}
    />
  );
};

export { Toaster };
