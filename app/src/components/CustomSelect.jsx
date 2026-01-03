import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const [menuCoords, setMenuCoords] = useState(null);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => String(o.value) === String(value));

  const filteredOptions = options.filter((opt) => {
    const label = opt.label ? String(opt.label) : String(opt.value);
    return label.toLowerCase().includes(search.toLowerCase());
  });

  useEffect(() => {
    const onClickOutside = (e) => {
      const tgt = e && e.target;
      const clickedInsideTrigger =
        containerRef.current &&
        tgt instanceof Node &&
        containerRef.current.contains(tgt);
      const clickedInsidePortal =
        tgt instanceof Element && tgt.closest(".custom-select-portal");
      if (
        containerRef.current &&
        !clickedInsideTrigger &&
        !clickedInsidePortal
      ) {
        setOpen(false);
        setMenuCoords(null);
        setHighlighted(-1);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    // scroll highlighted into view
    const node = listRef.current?.querySelector("[data-highlighted='true']");
    node?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open, search]);

  useEffect(() => {
    if (!open) return;
    function handleScrollOrResize(e) {
      // If the scroll/wheel/touch event originates from inside the menu or the trigger, ignore it
      try {
        const tgt = e && e.target;
        if (
          e &&
          e.type === "scroll" &&
          listRef.current &&
          tgt instanceof Node &&
          (listRef.current.contains(tgt) ||
            (containerRef.current && containerRef.current.contains(tgt)))
        ) {
          return;
        }
        if (
          e &&
          (e.type === "wheel" || e.type === "touchmove") &&
          listRef.current &&
          tgt instanceof Node &&
          listRef.current.contains(tgt)
        ) {
          return;
        }
      } catch {
        // be defensive; fall through and close
      }

      setOpen(false);
      setMenuCoords(null);
      setHighlighted(-1);
      setSearch("");
    }

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("wheel", handleScrollOrResize, true);
    window.addEventListener("touchmove", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("wheel", handleScrollOrResize, true);
      window.removeEventListener("touchmove", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // focus input when menu opens
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const toggle = () => {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        right: rect.right + window.scrollX,
        bottom: rect.bottom + window.scrollY,
        width: rect.width,
        height: rect.height,
      });

      // compute initial highlighted index from the current filtered options
      const currentFiltered = options.filter((opt) => {
        const label = opt.label ? String(opt.label) : String(opt.value);
        return label.toLowerCase().includes(search.toLowerCase());
      });
      const idx = currentFiltered.findIndex(
        (o) => String(o.value) === String(value),
      );
      setHighlighted(idx >= 0 ? idx : currentFiltered.length > 0 ? 0 : -1);

      setOpen(true);
    } else {
      setOpen(false);
      setMenuCoords(null);
      setHighlighted(-1);
      setSearch("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(0);
        return;
      }
      setHighlighted((h) => Math.min(h + 1, filteredOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlighted >= 0 && filteredOptions[highlighted]) {
        const opt = filteredOptions[highlighted];
        onChange(opt.value);
        setOpen(false);
        setMenuCoords(null);
        setHighlighted(-1);
        setSearch("");
      } else {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setMenuCoords({
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            right: rect.right + window.scrollX,
            bottom: rect.bottom + window.scrollY,
            width: rect.width,
            height: rect.height,
          });
        }
        setOpen(true);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setMenuCoords(null);
      setHighlighted(-1);
      setSearch("");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="px-3 py-2 pr-10 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 w-full text-left flex items-center justify-between"
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {open &&
        menuCoords &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            className="custom-select-portal fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-56 overflow-auto p-2 animate-fade-in"
            style={{
              top: `${menuCoords.top + menuCoords.height + 8}px`,
              left: `${Math.min(
                Math.max(menuCoords.left, 8),
                window.innerWidth - menuCoords.width - 8,
              )}px`,
              width: `${menuCoords.width}px`,
              zIndex: 10003,
            }}
            onKeyDown={handleKeyDown}
          >
            <li className="px-1 py-1">
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlighted(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search..."
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-sm text-slate-900 dark:text-slate-100"
              />
            </li>

            {filteredOptions.length === 0 && (
              <li className="px-3 py-2 text-slate-500">No results</li>
            )}

            {filteredOptions.map((opt, i) => {
              const isSelected = String(opt.value) === String(value);
              const isHighlighted = i === highlighted;
              return (
                <li
                  key={String(opt.value) + i}
                  role="option"
                  aria-selected={isSelected}
                  data-highlighted={isHighlighted}
                  className={`px-3 py-2 rounded-md cursor-pointer flex justify-between items-center text-slate-900 dark:text-slate-100 text-sm ${
                    isHighlighted
                      ? "bg-slate-100 dark:bg-slate-700"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700"
                  } ${isSelected ? "font-semibold" : ""}`}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setMenuCoords(null);
                    setHighlighted(-1);
                    setSearch("");
                  }}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-green-500" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}

CustomSelect.propTypes = {
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({ value: PropTypes.any, label: PropTypes.node }),
  ).isRequired,
  placeholder: PropTypes.node,
};

CustomSelect.defaultProps = {
  value: undefined,
  placeholder: "",
};
