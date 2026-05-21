import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  // Close on outside click (trigger + portaled menu)
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setSearch("");
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openDropdown() {
    setOpen(true);
    setSearch("");
    setTimeout(() => {
      updateMenuPosition();
      inputRef.current?.focus();
    }, 0);
  }

  function selectOption(opt: ComboboxOption) {
    onValueChange(opt.value);
    setOpen(false);
    setSearch("");
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange("");
    setOpen(false);
    setSearch("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
    if (e.key === "Enter" && filtered.length === 1) {
      selectOption(filtered[0]);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-lg border border-input bg-background px-2.5 text-sm transition-colors",
          "hover:bg-accent focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate font-medium">
          {selected ? selected.label : placeholder}
        </span>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={(e) => e.key === "Enter" && clear(e as unknown as React.MouseEvent)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={13} />
            </span>
          )}
          <ChevronsUpDown size={14} className="text-muted-foreground" />
        </div>
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
            }}
            className="z-[200] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10"
          >
            <div className="border-b border-border bg-popover p-1.5">
              <Input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="h-7 bg-background text-sm"
              />
            </div>

            <ul className="max-h-52 overflow-y-auto bg-popover py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-center text-sm text-muted-foreground">
                  No results found
                </li>
              ) : (
                filtered.map((opt) => (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={opt.value === value}
                    onClick={() => selectOption(opt)}
                    className={cn(
                      "flex cursor-pointer select-none items-center justify-between px-3 py-2 text-sm",
                      "hover:bg-accent hover:text-accent-foreground",
                      opt.value === value && "bg-accent"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-popover-foreground">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="truncate text-xs text-muted-foreground">{opt.sublabel}</div>
                      )}
                    </div>
                    {opt.value === value && (
                      <Check size={14} className="ml-2 shrink-0 text-primary" />
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
