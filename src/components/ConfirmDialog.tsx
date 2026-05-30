import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

const DEFAULT_STATE: ConfirmState = {
  open: false,
  title: "",
  description: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  variant: "default",
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>(DEFAULT_STATE);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        description: options.description ?? "",
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        variant: options.variant ?? "default",
      });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  const dialog = (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          {state.description ? (
            <DialogDescription>{state.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="border-t-0 bg-transparent -mx-4 -mb-4 pt-0">
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {state.cancelLabel}
          </Button>
          <Button
            type="button"
            variant={state.variant === "destructive" ? "destructive" : "default"}
            onClick={() => close(true)}
          >
            {state.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
