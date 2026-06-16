// Sonner-compatible shim over react-toastify.
//
// The app was written against the sonner `toast` API (toast.success/error/info/
// warning/loading + `{ id }`-based updates, `toast.dismiss`, and `action`/`cancel`
// button options used by the updater). react-toastify exposes a different surface
// (toast.update, autoClose, ToastContentProps), so this module translates the
// sonner-shaped calls our 24 call sites make into react-toastify calls — keeping
// those sites untouched apart from the import path.
//
// Visual twist: every freshly created toast gets a random accent on its left
// border. Severity stays legible because react-toastify keeps its per-type icon
// and colors; only the border hue is randomized. Updates (e.g. loading → success,
// download progress) intentionally do NOT re-randomize, so a toast keeps one
// stable accent for its lifetime.

import { toast as rt, type Id, type ToastOptions } from "react-toastify";

type ToastAction = { label: string; onClick: () => void };

export type ToastOpts = {
  id?: Id;
  duration?: number;
  description?: React.ReactNode;
  action?: ToastAction;
  cancel?: ToastAction;
};

type Severity = "success" | "error" | "info" | "warning" | "default";

function randomAccent(): string {
  // Fixed saturation/lightness so the hue reads clearly on both light and dark
  // toast backgrounds; only the hue is random.
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 70% 50%)`;
}

function accentStyle(): React.CSSProperties {
  return { borderLeft: `4px solid ${randomAccent()}` };
}

// Renders the message plus optional description and action/cancel buttons.
// Plain string messages (the common case) pass through untouched.
function content(message: React.ReactNode, opts?: ToastOpts): React.ReactNode {
  if (!opts?.description && !opts?.action && !opts?.cancel) return message;
  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium">{message}</div>
      {opts?.description ? <div className="text-sm opacity-80">{opts.description}</div> : null}
      {opts?.action || opts?.cancel ? (
        <div className="mt-1 flex gap-2">
          {opts.action ? (
            <button
              type="button"
              onClick={opts.action.onClick}
              className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              {opts.action.label}
            </button>
          ) : null}
          {opts.cancel ? (
            <button
              type="button"
              onClick={opts.cancel.onClick}
              className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
            >
              {opts.cancel.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// sonner `duration` (ms, or Infinity for sticky) → react-toastify `autoClose`.
function autoClose(duration?: number): number | false | undefined {
  if (duration === Infinity) return false;
  if (typeof duration === "number") return duration;
  return undefined; // fall back to ToastContainer default
}

function baseOptions(opts: ToastOpts | undefined, withAccent: boolean): ToastOptions {
  const o: ToastOptions = { toastId: opts?.id };
  const ac = autoClose(opts?.duration);
  if (ac !== undefined) o.autoClose = ac;
  if (withAccent) o.style = accentStyle();
  return o;
}

function emit(type: Severity, message: React.ReactNode, opts?: ToastOpts): Id {
  const body = content(message, opts);

  // Existing id → update in place (loading → success, progress %, etc.) without
  // re-randomizing the accent or duplicating the toast.
  if (opts?.id != null && rt.isActive(opts.id)) {
    rt.update(opts.id, {
      render: body,
      type: type === "default" ? "default" : type,
      isLoading: false,
      autoClose: autoClose(opts.duration) ?? 5000,
    });
    return opts.id;
  }

  const options = baseOptions(opts, true);
  switch (type) {
    case "success":
      return rt.success(body, options);
    case "error":
      return rt.error(body, options);
    case "info":
      return rt.info(body, options);
    case "warning":
      return rt.warning(body, options);
    default:
      return rt(body, options);
  }
}

function loading(message: React.ReactNode, opts?: ToastOpts): Id {
  const body = content(message, opts);
  if (opts?.id != null && rt.isActive(opts.id)) {
    rt.update(opts.id, { render: body, isLoading: true, autoClose: false });
    return opts.id;
  }
  return rt.loading(body, baseOptions(opts, true));
}

export const toast = Object.assign(
  (message: React.ReactNode, opts?: ToastOpts) => emit("default", message, opts),
  {
    success: (message: React.ReactNode, opts?: ToastOpts) => emit("success", message, opts),
    error: (message: React.ReactNode, opts?: ToastOpts) => emit("error", message, opts),
    info: (message: React.ReactNode, opts?: ToastOpts) => emit("info", message, opts),
    warning: (message: React.ReactNode, opts?: ToastOpts) => emit("warning", message, opts),
    loading,
    dismiss: (id?: Id) => rt.dismiss(id),
    promise: rt.promise.bind(rt),
  },
);
