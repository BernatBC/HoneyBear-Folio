import PropTypes from "prop-types";
import { useFormatNumber } from "../../utils/format";
import { usePrivacy } from "../../contexts/privacy";

export default function MaskedNumber({ value, options = {}, className, ...props }) {
  const formatNumber = useFormatNumber();
  const { isPrivacyMode } = usePrivacy();

  const formattedValue = formatNumber(value, options);

  if (isPrivacyMode) {
    const unmaskedValue = formatNumber(value, {
      ...options,
      ignorePrivacy: true,
    });
    return (
      <span
        className={`cursor-help ${className || ""}`}
        title={unmaskedValue}
        {...props}
      >
        {formattedValue}
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
