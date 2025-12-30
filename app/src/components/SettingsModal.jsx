import PropTypes from "prop-types";
import { X, Settings } from "lucide-react";
import "../styles/SettingsModal.css";
import { useNumberFormat } from "../contexts/NumberFormatContext";
import { formatNumberWithLocale } from "../utils/format";

export default function SettingsModal({ onClose }) {
  const { locale, setLocale } = useNumberFormat();

  const example = formatNumberWithLocale(1234.56, locale);

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2 className="modal-title">
            <Settings className="w-6 h-6 text-brand-400" />
            Settings
          </h2>
          <button onClick={onClose} className="modal-close-button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body">
          <label className="modal-label">Number format</label>
          <select
            className="w-full bg-slate-800 text-white p-2 rounded"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="en-US">1,234.56 (en-US)</option>
            <option value="de-DE">1.234,56 (de-DE)</option>
            <option value="fr-FR">1 234,56 (fr-FR)</option>
          </select>
          <p className="text-slate-400 mt-3">Example: {example} €</p>
        </div>
      </div>
    </div>
  );
}

SettingsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
