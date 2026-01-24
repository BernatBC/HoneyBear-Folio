import PropTypes from "prop-types";
import { useState, useEffect, useRef } from "react";
import { useFormatNumber, useParseNumber } from "../../utils/format";

export default function NumberInput({
  value,
  onChange,
  className,
  placeholder,
  maximumFractionDigits,
  minimumFractionDigits,
  useGrouping = true,
  inputMode = "decimal",
}) {
  const formatNumber = useFormatNumber();
  const parseNumber = useParseNumber();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const ref = useRef(null);

  // When value changes externally, update display if not editing
  useEffect(() => {
    if (!editing) {
      if (
        value === undefined ||
        value === null ||
        Number.isNaN(Number(value))
      ) {
        setInputValue("");
      } else {
        setInputValue(
          formatNumber(Number(value), {
            maximumFractionDigits,
            minimumFractionDigits,
            useGrouping,
          }),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    value,
    editing,
    maximumFractionDigits,
    minimumFractionDigits,
    useGrouping,
  ]);

  const commitValue = () => {
    const parsed = parseNumber(inputValue);
    const num = Number.isNaN(parsed) ? NaN : parsed;
    onChange(num);
    setEditing(false);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode={inputMode}
      className={className}
      placeholder={placeholder}
      value={inputValue}
      onFocus={() => {
        setEditing(true);
        if (
          value !== undefined &&
          value !== null &&
          !Number.isNaN(Number(value))
        ) {
          setInputValue(
            formatNumber(Number(value), {
              maximumFractionDigits,
              minimumFractionDigits,
              useGrouping,
              ignorePrivacy: true,
            }),
          );
        }
      }}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={() => commitValue()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commitValue();
          ref.current?.blur();
        }
      }}
    />
  );
}

NumberInput.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onChange: PropTypes.func.isRequired,
  className: PropTypes.string,
  placeholder: PropTypes.string,
  maximumFractionDigits: PropTypes.number,
  minimumFractionDigits: PropTypes.number,
  useGrouping: PropTypes.bool,
  inputMode: PropTypes.string,
};
