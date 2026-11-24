import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/utils/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface SearchableSelectOption<Value extends string = string> {
  /** Stable, unique, non-empty option identifier. */
  value: Value;
  label: string;
  description?: string;
  keywords?: readonly string[];
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SearchableSelectProps<Value extends string = string> {
  options: readonly SearchableSelectOption<Value>[];
  value?: Value;
  onValueChange: (value: Value) => void;
  ariaLabel: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Useful when embedding the selector in a custom modal or portal. */
  portalContainer?: HTMLElement | null;
  name?: string;
  id?: string;
}

/** Controlled single-select with a searchable, keyboard-navigable option list. */
export function SearchableSelect<Value extends string = string>({
  options, value, onValueChange, ariaLabel, placeholder = "Select an option",
  searchPlaceholder = "Search options…", emptyMessage = "No matching options.",
  disabled = false, leadingIcon, className, contentClassName, portalContainer, name, id,
}: SearchableSelectProps<Value>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [autoPortalContainer, setAutoPortalContainer] = useState<HTMLElement>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setSearch("");
    }
  }, [disabled]);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen && disabled) return;
    if (nextOpen) {
      const trigger = triggerRef.current;
      const fullscreen = trigger?.ownerDocument.fullscreenElement;
      const dialog = trigger?.closest("dialog[open]");
      setAutoPortalContainer(dialog instanceof HTMLElement ? dialog
        : fullscreen instanceof HTMLElement && fullscreen.contains(trigger) ? fullscreen : undefined);
    }
    setSearch("");
    setOpen(nextOpen);
  }

  return <>
    {name && <input type="hidden" name={name} value={value ?? ""} disabled={disabled} />}
    <Popover open={open && !disabled} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button ref={triggerRef} id={id} type="button" role="combobox" aria-haspopup="dialog"
          aria-label={ariaLabel} aria-expanded={open && !disabled} aria-controls={open && !disabled ? contentId : undefined}
          disabled={disabled} title={selected?.label}
          className={cn("inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-xl border border-[#e3d8d0] bg-[#fcfaf7] px-3 text-sm text-[#49373d] shadow-sm transition-colors hover:border-[#c5a4a0] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#800000] disabled:cursor-not-allowed disabled:opacity-50", className)}>
          {leadingIcon && <span aria-hidden="true" className="inline-flex shrink-0 text-[#800000] [&_svg]:size-4">{leadingIcon}</span>}
          <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-[#82737a]")}>{selected?.label ?? placeholder}</span>
          <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 text-[#927c82] transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent id={contentId} aria-label={ariaLabel} align="start" sideOffset={8} collisionPadding={12}
        portalContainer={portalContainer ?? autoPortalContainer}
        onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}
        className={cn("w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border-[#e3d8d0] bg-[#fffdfb] p-0 text-[#49373d] shadow-[0_12px_40px_rgba(54,28,32,0.16)]", contentClassName)}>
        <Command label={ariaLabel} defaultValue={value} loop className="bg-transparent text-[#49373d]">
          <CommandInput ref={inputRef} value={search} onValueChange={setSearch} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
            className="h-12 text-sm placeholder:text-[#9a858b]" />
          <CommandList className="scroll-py-1" style={{ maxHeight: "min(18rem, max(3rem, calc(var(--radix-popover-content-available-height) - 3.5rem)))" }}>
            <CommandEmpty><span className="px-4 text-[#806b73]">{emptyMessage}</span></CommandEmpty>
            <CommandGroup className="p-1.5">
              {options.map((option) => <CommandItem key={option.value} value={option.value} disabled={option.disabled}
                keywords={[option.label, option.description ?? "", ...(option.keywords ?? [])]}
                onSelect={() => {
                  if (option.disabled) return;
                  if (option.value !== value) onValueChange(option.value);
                  changeOpen(false);
                }}
                className={cn("cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-[#49373d] data-[selected=true]:bg-[#f4e8e3] data-[selected=true]:text-[#800000]", option.value === value && "bg-[#faf1ed]")}>
                {option.icon && <span aria-hidden="true" className="inline-flex shrink-0 text-[#800000]">{option.icon}</span>}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{option.label}</span>
                  {option.description && <span className="mt-0.5 block truncate text-xs text-[#88717b]">{option.description}</span>}</span>
                <Check aria-hidden="true" className={cn("size-4 shrink-0 text-[#800000]", option.value !== value && "invisible")} />
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </>;
}
