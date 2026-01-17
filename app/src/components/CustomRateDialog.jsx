import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import "../styles/Modal.css";
import { t } from "../i18n/i18n";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./Modal";

export default function CustomRateDialog({
  isOpen,
  currency,
  onConfirm,
  onCancel,
}) {
  const [rate, setRate] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => {
        setRate("");
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(rate);
    if (isNaN(val) || val <= 0) return;
    onConfirm(val);
  };

  return (
    <Modal onClose={onCancel} size="sm">
      <ModalHeader
        title={t("custom_rate.title")}
        onClose={onCancel}
      />
      <ModalBody>
        <p className="mb-4 text-slate-600 dark:text-slate-300">
          {t("custom_rate.message", { currency })}
        </p>
        <form id="custom-rate-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="number"
            step="any"
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 placeholder-slate-500 transition-all outline-none"
            placeholder="0.0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
            autoFocus
          />
        </form>
      </ModalBody>
      <ModalFooter className="mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="modal-cancel-button"
        >
          {t("confirm.cancel")}
        </button>
        <button
          type="submit"
          form="custom-rate-form"
          className="modal-action-button bg-blue-600 hover:bg-blue-700 text-white"
        >
          {t("confirm.save")}
        </button>
      </ModalFooter>
    </Modal>
  );
}

CustomRateDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  currency: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
