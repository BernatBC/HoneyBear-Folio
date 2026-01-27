import { useState } from "react";
import PropTypes from "prop-types";
import { useFormatNumber } from "../../utils/format";
import { usePrivacy } from "../../contexts/privacy";

export default function MaskedNumber({
  value,
  options = {},
  className,
  ...props
}) {
  const formatNumber = useFormatNumber();
  const { isPrivacyMode } = usePrivacy();
  const [isHovered, setIsHovered] = useState(false);

  const formattedValue = formatNumber(value, options);

  if (isPrivacyMode) {
    const unmaskedValue = formatNumber(value, {
      ...options,
      ignorePrivacy: true,
    });
    return (
      <span
        className={`cursor-help ${className || ""}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...props}
      >
        {isHovered ? unmaskedValue : formattedValue}
      </span>
    );
  }

  if (className) {
    return (
      <span className={className} {...props}>
        {formattedValue}
      </span>
    );
  }

  return <>{formattedValue}</>;
}

MaskedNumber.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  options: PropTypes.object,
  className: PropTypes.string,
};
