import { useState, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { ConfirmContext } from "../contexts/confirm";
import { t } from "../i18n/i18n";
import "../styles/Modal.css";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./Modal";

export function ConfirmDialogProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState({
    message: "",
    title: t("confirm.title"),
    okLabel: t("confirm.ok"),
    cancelLabel: t("confirm.cancel"),
    kind: "info", // info, warning, error
  });
  const resolveRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setOptions({
        message,
        title: opts.title || t("confirm.title"),
        okLabel: opts.okLabel || t("confirm.ok"),
        cancelLabel: opts.cancelLabel || t("confirm.cancel"),
        kind: opts.kind || "info",
        showCancel: opts.showCancel !== undefined ? opts.showCancel : true,
      });
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  }, []);

  const handleClose = useCallback((result) => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && (
        <ConfirmDialog
          {...options}
          onConfirm={() => handleClose(true)}
          onCancel={() => handleClose(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

ConfirmDialogProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

function ConfirmDialog({
  message,
  title,
  okLabel,
  cancelLabel,
  kind,
  showCancel,
  onConfirm,
  onCancel,
}) {
  if (typeof document === "undefined") return null;

  const getButtonClass = () => {
    switch (kind) {
      case "warning":
        return "bg-amber-600 hover:bg-amber-700 text-white";
      case "error":
        return "bg-red-600 hover:bg-red-700 text-white";
      default:
        return "bg-blue-600 hover:bg-blue-700 text-white";
    }
  };

  return (
    <Modal onClose={onCancel} size="md">
      <ModalHeader title={title} onClose={showCancel ? onCancel : undefined} />
      <ModalBody>
        <p className="text-slate-600 dark:text-slate-300">{message}</p>
      </ModalBody>
      <ModalFooter>
        {showCancel && (
          <button onClick={onCancel} className="modal-cancel-button">
            {cancelLabel}
          </button>
        )}
        <button
          onClick={onConfirm}
          className={`modal-action-button ${getButtonClass()}`}
        >
          {okLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}

ConfirmDialog.propTypes = {
  message: PropTypes.string.isRequired,
  title: PropTypes.string,
  okLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  kind: PropTypes.oneOf(["info", "warning", "error"]),
  showCancel: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
