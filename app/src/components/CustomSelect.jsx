import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
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

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setHighlighted(-1);
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
  }, [highlighted, open]);

  const toggle = () => setOpen((v) => !v);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(0);
        return;
      }
      setHighlighted((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlighted >= 0) {
        const opt = options[highlighted];
        onChange(opt.value);
        setOpen(false);
        setHighlighted(-1);
      } else {
        setOpen(true);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
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

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-56 overflow-auto p-1"
          onKeyDown={handleKeyDown}
        >
          {options.map((opt, i) => {
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
                  setHighlighted(-1);
                }}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-4 h-4 text-green-500" />}
              </li>
            );
          })}
        </ul>
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
