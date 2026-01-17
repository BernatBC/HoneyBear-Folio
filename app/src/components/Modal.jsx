import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import PropTypes from "prop-types";
import "../styles/Modal.css";

export function Modal({ children, onClose, size = "md", className = "" }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Prevent scroll on body when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    full: "w-full mx-4",
  };

  return createPortal(
    <div className="modal-overlay">
      <div
        className={`modal-container w-full ${sizeClasses[size] || "max-w-md"} ${className}`}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

Modal.propTypes = {
  children: PropTypes.node.isRequired,
  onClose: PropTypes.func.isRequired,
  size: PropTypes.oneOf(["sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"]),
  className: PropTypes.string,
};

export function ModalHeader({ children, onClose, title, icon: Icon }) {
  return (
    <div className="modal-header">
      <h2 className="modal-title">
        {Icon && <Icon className="w-5 h-5 text-blue-500" />}
        {title || children}
      </h2>
      {onClose && (
        <button
          onClick={onClose}
          className="modal-close-button"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

ModalHeader.propTypes = {
  children: PropTypes.node,
  onClose: PropTypes.func,
  title: PropTypes.node,
  icon: PropTypes.elementType,
};

export function ModalBody({ children, className = "" }) {
  return <div className={`modal-body ${className}`}>{children}</div>;
}

ModalBody.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export function ModalFooter({ children, className = "" }) {
  return <div className={`modal-footer ${className}`}>{children}</div>;
}

ModalFooter.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};
